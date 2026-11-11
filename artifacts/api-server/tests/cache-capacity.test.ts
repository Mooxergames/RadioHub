import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import NodeCache from 'node-cache';

delete process.env.REDIS_URL;
let memory: NodeCache;
mock.module('node-cache', { defaultExport: class extends NodeCache {
  constructor(options?: NodeCache.Options) { super(options); memory = this; }
} });
const { CacheManager } = await import('../src/cache');
const prefix = 'capacity-regression:';
const key = (index: number) => `${prefix}${index}`;
const fill = async () => {
  for (let index = 0; index < 500; index++) await CacheManager.set(key(index), { index }, { ttl: 60 });
};
afterEach(async () => { mock.restoreAll(); await CacheManager.clearByPattern(prefix); });

test('a full small-value cache retains a new key without exceeding its 500-key bound', async () => {
  await fill();
  await CacheManager.set(key(500), { index: 500 }, { ttl: 60 });
  assert.deepEqual(await CacheManager.get(key(500)), { index: 500 });
  assert.equal(CacheManager.getStats().memory.keys, 500);
  assert.equal(await CacheManager.get(key(0)), null);
  assert.deepEqual(await CacheManager.get(key(1)), { index: 1 });
});

test('replacing an existing key at capacity does not evict an unrelated value', async () => {
  await fill();
  await CacheManager.set(key(127), { updated: true }, { ttl: 60 });
  assert.deepEqual(await CacheManager.get(key(127)), { updated: true });
  assert.deepEqual(await CacheManager.get(key(0)), { index: 0 });
  assert.equal(CacheManager.getStats().memory.keys, 500);
});

test('small-value expiry remains unchanged after a capacity eviction', async () => {
  let now = 1_000_000;
  mock.method(Date, 'now', () => now);
  await fill();
  await CacheManager.set(key(500), 'short-lived', { ttl: 5 });
  now += 4_999;
  assert.equal(await CacheManager.get(key(500)), 'short-lived');
  now += 2;
  assert.equal(await CacheManager.get(key(500)), null);
  assert.deepEqual(await CacheManager.get(key(1)), { index: 1 });
});

test('a non-capacity memory write failure does not evict other values or retry', async () => {
  await fill();
  const original = memory.set;
  let attempts = 0;
  mock.method(memory, 'set', function (this: NodeCache, target: string | number, value: unknown, ttl: any) {
    if (target === key(500)) { attempts++; throw new Error('unrelated memory failure'); }
    return original.call(this, target, value, ttl);
  });
  await CacheManager.set(key(500), 'not-written');
  assert.equal(attempts, 1);
  assert.equal(await CacheManager.get(key(500)), null);
  assert.deepEqual(await CacheManager.get(key(0)), { index: 0 });
  assert.equal(CacheManager.getStats().memory.keys, 500);
});

test('large values still use their independent bounded tier when small memory is full', async () => {
  await fill();
  const value = { content: 'x'.repeat(300_000) };
  await CacheManager.set(`${prefix}large`, value, { ttl: 60 });
  assert.equal(await CacheManager.get(`${prefix}large`), value);
  assert.equal(CacheManager.getStats().memory.keys, 500);
  assert.deepEqual(await CacheManager.get(key(0)), { index: 0 });
});
