import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import { after, afterEach, test, type TestContext } from 'node:test';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import { gunzip, gunzipSync, gzip, gzipSync } from 'node:zlib';
import type { CachedStationSitemapXml } from '../src/seo/station-sitemap-cache';

// cache.ts selects its backend during module evaluation. Do not connect to Redis.
const redisUrl = process.env.REDIS_URL;
delete process.env.REDIS_URL;
const { default: cache } = await import('../src/cache');
const { readCachedStationSitemapXml: read, storeStationSitemapXml: store,
  STATION_SITEMAP_PACKED_SUFFIX: suffix, getStationSitemapCacheStats: stats,
} = await import('../src/seo/station-sitemap-cache');
const prefix = 'test:station-sitemap-cache:';
const limit = 52_428_800;
const ttl = 60;
afterEach(() => cache.clearByPattern(prefix));
after(() => { if (redisUrl !== undefined) process.env.REDIS_URL = redisUrl; });

type Packed = { encoding: string; data: string; byteLength: number; etag: string };
const etag = (data: string | Buffer) => '"' + createHash('sha256').update(data).digest('hex') + '"';
function entity(xml: string): CachedStationSitemapXml {
  return { xml, etag: etag(xml), byteLength: Buffer.byteLength(xml) };
}
function exactBytes(bytes: number, marker = 'a') {
  const head = '<urlset><url><loc>https://radio.example/\u6771\u4eac/' + marker;
  const tail = '</loc></url></urlset>';
  return entity(head + 'x'.repeat(bytes - Buffer.byteLength(head + tail)) + tail);
}
function packed(value: CachedStationSitemapXml): Packed {
  return { encoding: 'gzip-base64-v1', data: gzipSync(value.xml).toString('base64'),
    byteLength: value.byteLength, etag: value.etag };
}

test('real Redis-free cache rejects the old 16 MiB leaf but admits its packed representation', async () => {
  assert.equal(cache.getStats().redis.connected, false);
  assert.equal(suffix, ':gzip-v1');
  const key = prefix + 'large';
  const padding = 's'.repeat(380);
  const rows = Array.from({ length: 32_768 }, (_, i) => {
    const slug = createHash('sha256').update(String(i)).digest('hex');
    return '<url><loc>https://radio.example/\u6771\u4eac/' + slug + '/' + padding + '</loc></url>';
  });
  const value = entity('<urlset>' + rows.join('') + '</urlset>');
  assert.ok(value.byteLength >= 15 * 1024 ** 2 && value.byteLength < 17 * 1024 ** 2);
  assert.ok(JSON.stringify(value).length * 2 > 8 * 1024 ** 2);
  await cache.set(key, value, { ttl });
  assert.equal(await cache.get(key), null, 'the old serialized envelope exceeds the real hot tier limit');

  await store(key, value, ttl);
  assert.equal(await cache.get(key), null);
  const record = await cache.get<Packed>(key + suffix);
  assert.ok(record);
  assert.equal(record.encoding, 'gzip-base64-v1');
  assert.equal(record.byteLength, value.byteLength);
  assert.equal(record.etag, value.etag);
  const chargedBytes = JSON.stringify(record).length * 2;
  assert.ok(chargedBytes > 512_000 && chargedBytes <= 8 * 1024 ** 2, 'exercise the bounded large-value tier');
  assert.ok(gunzipSync(Buffer.from(record.data, 'base64')).equals(Buffer.from(value.xml, 'utf8')));
  assert.deepEqual(await cache.get(key + ':validator'), { etag: value.etag });
  assert.deepEqual(await read(key), value);
});

test('old plain entries remain readable; 256000 UTF-8 bytes stay plain, one more byte is packed', async () => {
  const key = prefix + 'boundary';
  const small = exactBytes(256_000);
  const over = exactBytes(256_001);
  assert.ok(over.xml.length < 256_000, 'code-unit length must not select the storage format');
  await cache.set(key, small, { ttl });
  assert.deepEqual(await read(key), small);
  await store(key, over, ttl);
  assert.ok(await cache.get(key + suffix));
  assert.deepEqual(await read(key), over);
  await store(key, small, ttl);
  assert.deepEqual(await cache.get(key), small);
  assert.equal(await cache.get(key + suffix), null);
  assert.deepEqual(await cache.get(key + ':validator'), { etag: small.etag });
  assert.deepEqual(await read(key), small);
});

test('invalid packed data is a miss, not a rejected read or an altered XML hit', async () => {
  const value = exactBytes(256_001);
  const good = packed(value);
  const badUtf8 = Buffer.from([0xff, 0xfe]);
  const cases: Record<string, unknown> = {
    encoding: { ...good, encoding: 'another-version' },
    base64: { ...good, data: '?!!!' },
    gzip: { ...good, data: Buffer.from('not a gzip record').toString('base64') },
    hash: { ...good, etag: etag('different XML') },
    length: { ...good, byteLength: value.xml.length },
    oversize: { ...good, byteLength: limit + 1 },
    utf8: { ...good, data: gzipSync(badUtf8).toString('base64'), byteLength: badUtf8.length, etag: etag(badUtf8) },
  };
  for (const [name, record] of Object.entries(cases)) {
    const key = prefix + name;
    await cache.set(key + suffix, record, { ttl });
    assert.equal(await read(key), null, name);
  }
  assert.deepEqual(stats(), { active: 0, pending: 0, inflight: 0 });
});

test('coalesces a hot key and admits at most two distinct decodes at once', async () => {
  const keys = Array.from({ length: 6 }, (_, i) => prefix + 'concurrent:' + i);
  const values = keys.map((_, i) => exactBytes(512_000, String(i)));
  await Promise.all(keys.map((key, i) => cache.set(key + suffix, packed(values[i]), { ttl })));
  const calls = [0, 0, 0, 0, 1, 2, 3, 4, 5];
  const done = Promise.all(calls.map(i => read(keys[i])));
  // Drain the memory-cache lookup microtasks, without letting native zlib I/O complete.
  for (let i = 0; i < 32 && stats().pending < keys.length - 2; i++) await Promise.resolve();
  const peak = stats();
  const hits = await done;
  assert.deepEqual(peak, { active: 2, pending: keys.length - 2, inflight: keys.length });
  hits.forEach((hit, i) => assert.deepEqual(hit, values[calls[i]]));
  assert.deepEqual(stats(), { active: 0, pending: 0, inflight: 0 });
});

test('packed data and its validator expire on the caller TTL', async () => {
  const key = prefix + 'ttl';
  const value = exactBytes(270_000);
  await store(key, value, 1);
  assert.deepEqual(await read(key), value);
  assert.deepEqual(await cache.get(key + ':validator'), { etag: value.etag });
  await delay(1_100);
  assert.equal(await cache.get(key + suffix), null);
  assert.equal(await cache.get(key + ':validator'), null);
  assert.equal(await read(key), null);
});

test('cache write failures never reject the caller for small or large leaves', async t => {
  const fail = t.mock.method(cache, 'set', async () => { throw new Error('cache write failed'); });
  for (const bytes of [128, 256_001]) {
    const before = fail.mock.callCount();
    await assert.doesNotReject(store(prefix + bytes, exactBytes(bytes), ttl));
    assert.ok(fail.mock.callCount() > before);
  }
});

test('bounds native gunzip output even when the cached length cannot be trusted', async t => {
  const decompress = t.mock.fn(gunzip);
  t.mock.module('node:zlib', { namedExports: { gzip, gunzip: decompress } });
  const isolated = new URL('../src/seo/station-sitemap-cache.ts?decode-limit', import.meta.url);
  const { readCachedStationSitemapXml } = await import(isolated.href);
  const key = prefix + 'decode-limit';
  const value = exactBytes(256_001);
  const record = packed(value);
  await cache.set(key + suffix, { ...record, byteLength: limit + 1 }, { ttl });
  assert.equal(await readCachedStationSitemapXml(key), null);
  assert.equal(decompress.mock.callCount(), 0, 'reject the oversized declaration before allocation');
  await cache.set(key + suffix, record, { ttl });
  assert.deepEqual(await readCachedStationSitemapXml(key), value);
  assert.equal(decompress.mock.callCount(), 1);
  const opts = decompress.mock.calls[0].arguments[1] as { maxOutputLength?: number };
  assert.ok(typeof opts.maxOutputLength === 'number' && opts.maxOutputLength >= value.byteLength
    && opts.maxOutputLength <= limit, 'zlib itself must enforce the decoded size limit');
});

test('an asynchronous gzip error is best-effort and does not escape store', async t => {
  const failGzip = t.mock.fn((_xml: string, cb: (error: Error) => void) => {
    queueMicrotask(() => cb(new Error('gzip failed')));
  });
  t.mock.module('node:zlib', { namedExports: { gzip: failGzip, gunzip } });
  // The helper captures promisified zlib methods at import time; keep other tests on the real module.
  const isolated = new URL('../src/seo/station-sitemap-cache.ts?gzip-failure', import.meta.url);
  const { storeStationSitemapXml } = await import(isolated.href);
  const key = prefix + 'gzip-failure';
  const value = exactBytes(256_001);
  await assert.doesNotReject(storeStationSitemapXml(key, value, ttl));
  assert.equal(failGzip.mock.callCount(), 1);
  assert.equal(await cache.get(key + suffix), null);
  assert.deepEqual(await cache.get(key), value);
  assert.deepEqual(await cache.get(key + ':validator'), { etag: value.etag });
});

async function controlledWriter(t: TestContext, label: string) {
  const jobs: Array<{ xml: string; finish: () => void }> = [];
  const heldGzip = (xml: string, cb: (err: null, bytes: Buffer) => void) => {
    jobs.push({ xml, finish: () => cb(null, gzipSync(xml)) });
  };
  t.mock.module('node:zlib', { namedExports: { gzip: heldGzip, gunzip } });
  const url = new URL('../src/seo/station-sitemap-cache.ts?' + label, import.meta.url);
  const api: typeof import('../src/seo/station-sitemap-cache') = await import(url.href);
  return { jobs, write: api.storeStationSitemapXml, stats: api.getStationSitemapWriteStats };
}

test('same key and ETag share one gzip and all callers wait for its write', async t => {
  const writer = await controlledWriter(t, 'shared-write');
  const key = prefix + 'shared';
  const value = exactBytes(270_000);
  let completed = 0;
  const writes = Array.from({ length: 7 }, () => writer.write(key, { ...value }, ttl).then(() => completed++));
  await nextTurn();
  assert.equal(writer.jobs.length, 1);
  assert.equal(completed, 0);
  assert.deepEqual(writer.stats(), { active: 1, inflight: 1 });
  writer.jobs[0].finish();
  await Promise.all(writes);
  assert.equal(completed, 7);
  assert.equal(writer.jobs.length, 1);
  assert.deepEqual(await read(key), value);
  assert.deepEqual(writer.stats(), { active: 0, inflight: 0 });
});

test('two held gzips leave additional keys free to finish via the plain tier', async t => {
  const writer = await controlledWriter(t, 'writer-cap');
  const keys = Array.from({ length: 4 }, (_, i) => prefix + 'cap:' + i);
  const values = keys.map((_, i) => exactBytes(280_000, String(i)));
  const first = keys.slice(0, 2).map((k, i) => writer.write(k, values[i], ttl));
  await nextTurn();
  assert.equal(writer.jobs.length, 2);
  let completed = 0;
  const excess = keys.slice(2).map((k, i) => writer.write(k, values[i + 2], ttl).then(() => completed++));
  await nextTurn();
  assert.equal(completed, 2, 'excess writes must not queue behind busy gzip workers');
  assert.equal(writer.jobs.length, 2);
  assert.deepEqual(writer.stats(), { active: 2, inflight: 2 });
  for (const i of [2, 3]) {
    assert.deepEqual(await cache.get(keys[i]), values[i]);
    assert.equal(await cache.get(keys[i] + suffix), null);
    assert.deepEqual(await cache.get(keys[i] + ':validator'), { etag: values[i].etag });
  }
  writer.jobs.forEach(job => job.finish());
  await Promise.all([...first, ...excess]);
  assert.equal(writer.jobs.length, 2);
  assert.deepEqual(writer.stats(), { active: 0, inflight: 0 });
});

test('a 51 MiB replacement clears old entries before the plain/Redis write and remains readable', async t => {
  const key = prefix + 'plain-51m';
  const old = exactBytes(260_000);
  await store(key, old, ttl);
  await cache.set(key, old, { ttl }); // An older deployment can leave a plain copy too.
  assert.ok(await cache.get(key + suffix));
  assert.deepEqual(await cache.get(key + ':validator'), { etag: old.etag });
  const xml = '<urlset>' + ' '.repeat(51 * 1024 ** 2 - 17) + '</urlset>';
  const fresh = entity(xml);
  assert.equal(fresh.byteLength, 51 * 1024 ** 2);
  const set = cache.set.bind(cache);
  let oldAtWrite: unknown[] | undefined;
  let remoteBody: unknown;
  // Memory cannot admit this value. Capture just the Redis-sized base write by reference.
  t.mock.method(cache, 'set', async (k: string, v: unknown, opts: { ttl?: number }) => {
    if (k !== key) return set(k, v, opts);
    oldAtWrite = await Promise.all([key, key + suffix, key + ':validator'].map(name => cache.get(name)));
    remoteBody = v;
  });
  await store(key, fresh, ttl);
  assert.deepEqual(oldAtWrite, [null, null, null]);
  assert.ok(remoteBody === fresh || (remoteBody as CachedStationSitemapXml | undefined)?.xml === xml);
  assert.equal(await cache.get(key + suffix), null);
  assert.deepEqual(await cache.get(key + ':validator'), { etag: fresh.etag });
  const get = cache.get.bind(cache);
  t.mock.method(cache, 'get', (k: string) => k === key ? Promise.resolve(remoteBody) : get(k));
  const hit = await read(key);
  assert.ok(hit?.xml === xml, 'the packed decode limit does not exclude an intact plain XML hit');
  assert.equal(hit?.etag, fresh.etag);
  assert.equal(hit?.byteLength, fresh.byteLength);
});

test('incompressible XML falls back to the real plain tier when packed base64 is too large', async () => {
  const key = prefix + 'packed-too-large';
  await store(key, exactBytes(260_000), ttl);
  // Fixed AES-CTR keystream: reproducible high entropy, no external data or random seed.
  const noise = createCipheriv('aes-256-ctr', Buffer.alloc(32), Buffer.alloc(16))
    .update(Buffer.alloc(3_141_000)).toString('base64');
  const fresh = entity('<urlset><!--' + noise + '--></urlset>');
  assert.ok(gzipSync(fresh.xml).toString('base64').length > 4 * 1024 ** 2);
  assert.ok(JSON.stringify(fresh).length * 2 < 8 * 1024 ** 2);
  await store(key, fresh, ttl);
  assert.equal(await cache.get(key + suffix), null);
  assert.deepEqual(await cache.get(key), fresh);
  assert.deepEqual(await cache.get(key + ':validator'), { etag: fresh.etag });
  assert.deepEqual(await read(key), fresh);
});

test('a later ETag for the same key cannot complete ahead of its predecessor', async t => {
  const writer = await controlledWriter(t, 'ordered-write');
  const key = prefix + 'ordered';
  const a = exactBytes(270_000, 'a');
  const b = exactBytes(270_000, 'b');
  const first = writer.write(key, a, ttl);
  await nextTurn();
  let bDone = false;
  const second = writer.write(key, b, ttl).then(() => { bDone = true; });
  await nextTurn();
  assert.equal(writer.jobs.length, 1);
  assert.ok(writer.jobs[0].xml === a.xml);
  assert.equal(bDone, false);
  writer.jobs[0].finish();
  await first;
  await nextTurn();
  assert.equal(writer.jobs.length, 2);
  assert.ok(writer.jobs[1].xml === b.xml);
  assert.equal(bDone, false);
  assert.equal(await read(key), null, 'no stale A body during the B publication window');
  assert.equal(await cache.get(key + ':validator'), null);
  writer.jobs[1].finish();
  await second;
  assert.deepEqual(await read(key), b);
  assert.deepEqual(await cache.get(key + ':validator'), { etag: b.etag });
  assert.deepEqual(writer.stats(), { active: 0, inflight: 0 });
});
