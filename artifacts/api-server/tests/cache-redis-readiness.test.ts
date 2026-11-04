import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { after, beforeEach, mock, test } from 'node:test';

const prefix = 'redis-readiness-regression:';
const calls: string[] = [];
const warnings: string[] = [];
const values = new Map<string, string>();
let options: any;
let failCommands = false;
class FakeRedis extends EventEmitter {
  isOpen = true;
  isReady = false;
  async connect() { return this; }
  async get(key: string): Promise<string | null> {
    calls.push(`get:${key}`);
    if (!this.isReady) return new Promise(() => {});
    if (failCommands) throw new Error('simulated command failure');
    return values.get(key) ?? null;
  }
  async setEx(key: string, _ttl: number, value: string): Promise<void> {
    calls.push(`set:${key}`);
    if (!this.isReady) return new Promise(() => {});
    if (failCommands) throw new Error('simulated command failure');
    values.set(key, value);
  }
  async del(keys: string | string[]): Promise<void> {
    calls.push('del');
    if (!this.isReady) return new Promise(() => {});
    for (const key of [keys].flat()) values.delete(key);
  }
  async *scanIterator({ MATCH }: { MATCH: string }) {
    calls.push('scan');
    if (!this.isReady) await new Promise(() => {});
    yield [...values.keys()].filter(key => key.includes(MATCH.slice(1, -1)));
  }
}
const redis = new FakeRedis();
process.env.REDIS_URL = 'redis://fixture.invalid';
mock.module('redis', { namedExports: { createClient: (config: any) => { options = config; return redis; } } });
mock.module('../src/utils/logger', { namedExports: { logger: {
  log: () => {}, error: () => {}, warn: (...args: unknown[]) => warnings.push(args.join(' ')),
} } });
const { CacheManager } = await import('../src/cache');
beforeEach(async () => {
  redis.isOpen = redis.isReady = false;
  await CacheManager.clearByPattern(prefix);
  values.clear(); calls.length = warnings.length = 0; failCommands = false;
  redis.isOpen = true;
});
after(async () => {
  redis.isOpen = redis.isReady = false;
  await CacheManager.clearByPattern(prefix);
  delete process.env.REDIS_URL;
  mock.restoreAll();
});
async function settles(promise: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    assert.equal(await Promise.race([
      promise.then(() => 'settled'),
      new Promise(resolve => { timer = setTimeout(() => resolve('queued'), 50); }),
    ]), 'settled', 'An optional disconnected cache must not hold a request open');
  } finally { clearTimeout(timer); }
}

test('Redis disables offline command queues before connecting', () => {
  assert.equal(options.disableOfflineQueue, true);
});

test('open but unready Redis is skipped for reads, writes, deletes and scans', async () => {
  await settles(Promise.all([
    CacheManager.get(`${prefix}missing`), CacheManager.set(`${prefix}local`, 'memory-only'),
    CacheManager.del(`${prefix}old`), CacheManager.clearByPattern(`${prefix}obsolete`),
  ]));
  assert.deepEqual(calls, []);
  assert.equal(await CacheManager.get(`${prefix}local`), 'memory-only');
  assert.equal(CacheManager.getStats().redis.connected, false);
});

test('Redis socket errors are handled with throttled diagnostics that omit connection details', () => {
  let now = 1_000_000;
  const clock = mock.method(Date, 'now', () => now);
  try {
    const error = new Error('redis://private-connection.example/password');
    assert.doesNotThrow(() => redis.emit('error', error));
    now += 1_000;
    assert.doesNotThrow(() => redis.emit('error', error));
    now += 60_000;
    assert.doesNotThrow(() => redis.emit('error', error));
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every(message => !message.includes('private-connection') && !message.includes('password')));
  } finally { clock.mock.restore(); }
});

test('ready Redis resumes reads, writes and invalidation without losing the memory fallback', async () => {
  redis.isReady = true;
  values.set(`${prefix}remote`, JSON.stringify({ remote: true }));
  assert.deepEqual(await CacheManager.get(`${prefix}remote`), { remote: true });
  await CacheManager.set(`${prefix}written`, { written: true }, { ttl: 60 });
  assert.deepEqual(JSON.parse(values.get(`${prefix}written`)!), { written: true });
  await CacheManager.del(`${prefix}written`);
  assert.equal(values.has(`${prefix}written`), false);
  await CacheManager.clearByPattern(prefix);
  assert.equal(values.size, 0);
  assert.ok(calls.includes('scan'));
  assert.equal(CacheManager.getStats().redis.connected, true);
});

test('a Redis read promotion remains cached when small memory is full', async () => {
  redis.isReady = true;
  for (let index = 0; index < 500; index++) await CacheManager.set(`${prefix}${index}`, index, { ttl: 60 });
  const target = `${prefix}remote`;
  values.set(target, JSON.stringify({ remote: true }));
  calls.length = 0;
  assert.deepEqual(await CacheManager.get(target), { remote: true });
  assert.deepEqual(await CacheManager.get(target), { remote: true });
  assert.equal(calls.filter(call => call === `get:${target}`).length, 1);
  assert.equal(CacheManager.getStats().memory.keys, 500);
});

test('ready Redis command failures cannot discard a successful memory write', async () => {
  redis.isReady = true; failCommands = true;
  await CacheManager.set(`${prefix}local`, { retained: true });
  assert.deepEqual(await CacheManager.get(`${prefix}local`), { retained: true });
  assert.equal(await CacheManager.get(`${prefix}missing`), null);
});
