import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import sharp from 'sharp';
import { createStationLogoDelivery } from '../src/middleware/station-logo-delivery';
import { STATION_LOGOS_S3_BASE_URL } from '@workspace/seo-shared/station-logo-url';

const image = await readFile(new URL('../../megaradio/public/header-logo-80w.webp', import.meta.url));
const pathname = '/station-logos/radio_12345678/logo-256.webp';
const modified = 'Mon, 26 Oct 2026 10:00:00 GMT';
const sourceHeaders = { 'Content-Type': 'image/webp', 'Content-Length': String(image.length),
  'Cache-Control': 'public, max-age=31536000, immutable', ETag: '"fixture"', 'Last-Modified': modified,
  'X-Robots-Tag': 'noindex, nofollow', 'Set-Cookie': 'private-source-cookie=fixture', 'X-Private-Origin': 'hidden' };
const source = (bytes: BodyInit | null = image, extra: Record<string, string> = {}, status = 200) =>
  new Response(bytes, { status, headers: { ...sourceHeaders, ...extra } });

interface Fixture {
  base: string;
  calls: Array<{ url: string; method?: string; headers: Record<string, string> }>;
  reply: (input: Parameters<typeof fetch>[0], init?: RequestInit) => Promise<Response> | Response;
}
async function withFixture(run: (fixture: Fixture) => Promise<void>, options: Parameters<typeof createStationLogoDelivery>[0] = {}) {
  const fixture: Fixture = { base: '', calls: [], reply: (_input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get('if-match') && headers.get('if-match') !== '"fixture"') return new Response(null, { status: 412 });
    if (headers.get('if-none-match') === '"fixture"') {
      return new Response(null, { status: 304, headers: { ETag: '"fixture"', 'Last-Modified': modified,
        'Cache-Control': sourceHeaders['Cache-Control'], 'X-Robots-Tag': 'noindex' } });
    }
    return source(init?.method === 'HEAD' ? null : image);
  } };
  const app = express();
  app.use((_req, res, next) => {
    res.set({ 'X-Robots-Tag': 'noindex, follow', 'Cache-Control': 'public, max-age=31536000, immutable',
      Expires: 'Thu, 01 Jan 2037 00:00:00 GMT', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    next();
  });
  const fetcher: typeof fetch = async (input, init) => {
    fixture.calls.push({ url: String(input), method: init?.method, headers: Object.fromEntries(new Headers(init?.headers)) });
    return fixture.reply(input, init);
  };
  app.use('/station-logos', createStationLogoDelivery({ ...options, fetch: fetcher }));
  app.use('/station-logos', (req, res) => res.redirect(302, `${STATION_LOGOS_S3_BASE_URL}${req.path}`));
  const server: Server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  fixture.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { await run(fixture); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('public logos return original WebP bytes without redirects, noindex, inherited Expires or credential forwarding', async () => {
  await withFixture(async f => {
    const response = await fetch(f.base + pathname + '?X-Amz-Signature=not-forwarded', { redirect: 'manual', headers: {
      Cookie: 'session=private', Authorization: 'Bearer private', 'X-API-Key': 'private', 'X-Forwarded-For': 'private',
    } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(response.headers.get('expires'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('x-private-origin'), null);
    assert.equal(response.headers.get('cache-control'), sourceHeaders['Cache-Control']);
    assert.equal(response.headers.get('etag'), '"fixture"');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    assert.deepEqual(f.calls, [{ url: STATION_LOGOS_S3_BASE_URL + '/radio_12345678/logo-256.webp', method: 'GET', headers: {} }]);
  });
});

test('nested variants preserve their storage key and legacy originals keep their old redirect', async () => {
  await withFixture(async f => {
    const variant = '/station-logos/radio_12345678/variants/12345678-1234-1234-1234-123456789abc/logo-96.webp';
    const response = await fetch(f.base + variant);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    assert.equal(new URL(f.calls[0].url).pathname, variant);
    const legacy = await fetch(f.base + '/station-logos/radio_12345678/original.svg', { redirect: 'manual' });
    assert.equal(legacy.status, 302);
    assert.equal(legacy.headers.get('location'), STATION_LOGOS_S3_BASE_URL + '/radio_12345678/original.svg');
    assert.equal(f.calls.length, 1);
  });
});

test('HEAD ignores Range; GET/HEAD conditional 304 retain validators and have no body or inherited noindex', async () => {
  await withFixture(async f => {
    const head = await fetch(f.base + pathname, { method: 'HEAD', headers: { Range: 'bytes=0-7', 'If-Range': '"old"' } });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(image.length));
    assert.equal(head.headers.get('content-range'), null);
    assert.equal(head.headers.get('x-robots-tag'), null);
    assert.equal(await head.text(), '');
    for (const method of ['GET', 'HEAD']) {
      const response = await fetch(f.base + pathname, { method,
        headers: { 'If-None-Match': '"fixture"', 'Cache-Control': 'max-age=0' } });
      assert.equal(response.status, 304);
      assert.equal(response.headers.get('etag'), '"fixture"');
      assert.equal(response.headers.get('last-modified'), modified);
      assert.equal(response.headers.get('x-robots-tag'), null);
      assert.equal(response.headers.get('content-type'), null);
      assert.equal(response.headers.get('content-length'), null);
      assert.equal(response.headers.get('expires'), null);
      assert.equal(await response.text(), '');
    }
    for (const call of f.calls) {
      assert.equal(call.headers.range, undefined);
      assert.equal(call.headers['if-range'], undefined);
    }
  });
});

for (const ifRange of [undefined, '"fixture"', modified]) {
  test(`matching range slices the same validated image bytes: ${ifRange}`, async () => {
    await withFixture(async f => {
      const response = await fetch(f.base + pathname, { headers: { Range: 'bytes=0-7', ...(ifRange ? { 'If-Range': ifRange } : {}) } });
      assert.equal(response.status, 206);
      assert.equal(response.headers.get('content-range'), `bytes 0-7/${image.length}`);
      assert.equal(response.headers.get('content-length'), '8');
      assert.equal(response.headers.get('x-robots-tag'), null);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), image.subarray(0, 8));
    });
  });
}

for (const ifRange of ['', '"old"', 'W/"fixture"', 'not-a-date', '2026-10-26 10:00:00 GMT',
  'Mon, 31 Feb 2026 10:00:00 GMT', 'Tue, 26 Oct 2026 10:00:00 GMT', 'Mon, 26 Oct 2026 11:00:00 GMT']) {
  test(`stale, weak or invalid If-Range ignores even an unsatisfiable range: ${ifRange}`, async () => {
    await withFixture(async f => {
      f.reply = (_input, init) => new Headers(init?.headers).has('range')
        ? new Response('upstream would return 416', { status: 416 }) : source();
      for (const range of ['bytes=0-7', `bytes=${image.length + 10}-`]) {
        const response = await fetch(f.base + pathname, { headers: { Range: range, 'If-Range': ifRange } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-range'), null);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
      }
      assert.equal(f.calls.every(call => !call.headers.range && !call.headers['if-range']), true);
    });
  });
}

test('true unsatisfiable range and failed preconditions retain 416/412, no-store and noindex', async () => {
  await withFixture(async f => {
    for (const headers of [{ Range: `bytes=${image.length + 10}-` },
      { Range: `bytes=${image.length + 10}-`, 'If-Range': '"fixture"' }, { 'If-Match': '"old"' }]) {
      const response = await fetch(f.base + pathname, { headers });
      assert.equal(response.status, headers['If-Match'] ? 412 : 416);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
      assert.equal(response.headers.get('expires'), null);
      if (!headers['If-Match']) assert.equal(response.headers.get('content-range'), `bytes */${image.length}`);
      await response.text();
    }
  });
});

test('unsupported, malformed and multipart ranges may receive the complete image', async () => {
  await withFixture(async f => {
    for (const Range of ['items=0-7', 'bytes=invalid', 'bytes=0-1,4-5']) {
      const response = await fetch(f.base + pathname, { headers: { Range } });
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    }
  });
});

for (const upstreamStatus of [302, 403, 404, 412, 416, 429, 500, 503]) {
  test(`upstream ${upstreamStatus} never becomes an indexable image or leaks XML`, async () => {
    await withFixture(async f => {
      f.reply = () => new Response('<Error>private origin details</Error>', { status: upstreamStatus,
        headers: { 'Content-Type': 'application/xml', Location: 'https://evil.invalid/private' } });
      const response = await fetch(f.base + pathname, { redirect: 'manual' });
      assert.equal(response.status, [404, 412].includes(upstreamStatus) ? upstreamStatus : 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('expires'), null);
      assert.equal(response.headers.get('location'), null);
      assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
      assert.doesNotMatch(await response.text(), /private origin|<Error>/);
      assert.equal(f.calls.length, 1);
    });
  });
}

test('raw encoded separators, traversal and malformed processed variants are rejected before egress', async () => {
  await withFixture(async f => {
    for (const path of ['/station-logos/radio%2Fother/logo-256.webp', '/station-logos/radio/../other/logo-256.webp',
      '/station-logos/radio\\other/logo-256.webp', '/station-logos/radio/variants/bad/logo-96.webp']) {
      const result = await new Promise<{ status: number; robots: string | string[] | undefined }>((resolve, reject) => {
        const req = httpRequest(f.base, { path }, res => {
          res.resume(); res.on('end', () => resolve({ status: res.statusCode!, robots: res.headers['x-robots-tag'] }));
        }); req.on('error', reject); req.end();
      });
      assert.equal(result.status, 404, path);
      assert.match(String(result.robots), /noindex/);
    }
    assert.equal(f.calls.length, 0);
    assert.equal((await fetch(f.base + pathname, { method: 'POST' })).status, 405);
  });
});

test('wrong MIME, corrupt bytes, encoded bodies and actual/declared oversize fail closed', async () => {
  await withFixture(async f => {
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
    const oversizedPixels = await sharp({ create: { width: 1025, height: 1025, channels: 3, background: 'red' } }).webp().toBuffer();
    for (const reply of [() => source(image, { 'Content-Type': 'text/html' }),
      () => source(Buffer.from('not an image')), () => source(image, { 'Content-Encoding': 'gzip' }),
      () => source(image, { 'Content-Length': String(oversized.length) }),
      () => source(oversized, { 'Content-Length': '1' }), () => source(oversizedPixels)]) {
      f.reply = reply;
      const response = await fetch(f.base + pathname);
      assert.equal(response.status, 503);
      assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      await response.text();
    }
  });
});

test('timeout aborts upstream and releases the bounded concurrency slot', async () => {
  await withFixture(async f => {
    let aborted = false;
    f.reply = (_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => {
      aborted = true; reject(new Error('aborted'));
    }, { once: true }));
    const response = await fetch(f.base + pathname);
    assert.equal(response.status, 503);
    assert.equal(aborted, true);
    await response.text();
  }, { deadlineMs: 20, maxConcurrent: 1 });
});

test('the same deadline also aborts a stalled response body after headers arrive', async () => {
  await withFixture(async f => {
    let aborted = false;
    f.reply = (_input, init) => new Response(new ReadableStream({ start(controller) {
      init!.signal!.addEventListener('abort', () => {
        aborted = true; controller.error(new Error('body deadline'));
      }, { once: true });
    } }), { headers: sourceHeaders });
    const response = await fetch(f.base + pathname);
    assert.equal(response.status, 503);
    assert.equal(aborted, true);
    await response.text();
  }, { deadlineMs: 20, maxConcurrent: 1 });
});

for (const stage of ['metadata', 'decode'] as const) {
  for (const lateError of [false, true]) {
    test(`deadline responds before queued ${stage} finishes (${lateError ? 'late error' : 'late success'}) and holds its slot`, async () => {
      let entered!: () => void; let release!: () => void; let cleaned!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const held = new Promise<void>(resolve => { release = resolve; });
      const cleanup = new Promise<void>(resolve => { cleaned = resolve; });
      let instances = 0;
      const imageDecoder = (() => {
        const first = ++instances === 1;
        const delay = async () => {
          if (first) { entered(); await held; if (lateError) throw new Error('late native failure'); }
        };
        return {
          timeout() { return this; }, raw() { return this; },
          async metadata() { if (stage === 'metadata') await delay(); return { format: 'webp', pages: 1 }; },
          async toBuffer() { if (stage === 'decode') await delay(); return Buffer.from('decoded'); },
          destroy() { if (first) cleaned(); },
        };
      }) as unknown as typeof sharp;
      await withFixture(async f => {
        let guard: ReturnType<typeof setTimeout> | undefined;
        const first = fetch(f.base + pathname);
        await started;
        try {
          const response = await Promise.race([first, new Promise<never>((_resolve, reject) => {
            guard = setTimeout(() => reject(new Error('deadline did not respond while native work stayed queued')), 3000);
          })]);
          assert.equal(response.status, 503);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
          await response.text();
          const overflow = await fetch(f.base + pathname);
          assert.equal(overflow.status, 503);
          assert.equal(overflow.headers.get('retry-after'), '120');
          await overflow.text();
          assert.equal(f.calls.length, 1);
          assert.equal(instances, 1);
        } finally { clearTimeout(guard); release(); }
        await cleanup;
        await new Promise<void>(resolve => setImmediate(resolve));
        const recovered = await fetch(f.base + pathname);
        assert.equal(recovered.status, 200);
        assert.deepEqual(Buffer.from(await recovered.arrayBuffer()), image);
        assert.equal(instances, 2);
      }, { deadlineMs: 1100, maxConcurrent: 1, imageDecoder });
    });
  }
}

test('concurrent overflow is retryable and completing work restores capacity', async () => {
  await withFixture(async f => {
    let release!: (response: Response) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    f.reply = () => { entered(); return new Promise<Response>(resolve => { release = resolve; }); };
    const first = fetch(f.base + pathname);
    await started;
    try {
      const overflow = await fetch(f.base + pathname);
      assert.equal(overflow.status, 503);
      assert.equal(overflow.headers.get('retry-after'), '120');
      await overflow.text();
    } finally { release(source()); }
    assert.equal((await first).status, 200);
    f.reply = () => source();
    const recovered = await fetch(f.base + pathname);
    assert.equal(recovered.status, 200);
    await recovered.arrayBuffer();
  }, { maxConcurrent: 1 });
});

test('client disconnect aborts egress and keeps the operation inside its slot until cleanup', async () => {
  await withFixture(async f => {
    let entered!: () => void; let aborted!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const stopped = new Promise<void>(resolve => { aborted = resolve; });
    f.reply = (_input, init) => new Promise((_resolve, reject) => {
      entered(); init!.signal!.addEventListener('abort', () => { aborted(); reject(new Error('client closed')); }, { once: true });
    });
    const request = httpRequest(f.base + pathname);
    request.on('error', () => {}); request.end(); await started; request.destroy(); await stopped;
    await new Promise<void>(resolve => setImmediate(resolve));
    f.reply = () => source();
    const recovered = await fetch(f.base + pathname);
    assert.equal(recovered.status, 200);
    await recovered.arrayBuffer();
  }, { maxConcurrent: 1 });
});

for (const baseUrl of ['http://localhost/station-logos', STATION_LOGOS_S3_BASE_URL + '?',
  STATION_LOGOS_S3_BASE_URL + '\n', STATION_LOGOS_S3_BASE_URL.replace('.com/', '.com:443/')]) {
  test(`invalid fixed upstream configuration cannot trigger egress: ${JSON.stringify(baseUrl)}`, async () => {
    await withFixture(async f => {
      const response = await fetch(f.base + pathname);
      assert.equal(response.status, 503); assert.equal(f.calls.length, 0); await response.text();
    }, { baseUrl });
  });
}
