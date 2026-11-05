import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { after, beforeEach, mock, test } from 'node:test';

const prefix = 'public-expiry-regression:';
const values = new Map<string, string>();
const reads: string[] = [], deletes: string[] = [];
let now = 1_000_000;
mock.method(Date, 'now', () => now);
class FakeRedis extends EventEmitter {
  isReady = true;
  async connect() {}
  async get(key: string) { reads.push(key); return values.get(key) ?? null; }
  async setEx(key: string, _ttl: number, value: string) { values.set(key, value); }
  async del(key: string) { deletes.push(key); values.delete(key); }
}
const redis = new FakeRedis();
process.env.REDIS_URL = 'redis://fixture.invalid';
mock.module('redis', { namedExports: { createClient: () => redis } });
const { CacheManager } = await import('../src/cache');
const { publicStationCache: cache, publicStationCacheKey } = await import('../src/public-station-cache');
const { capturePublicStationDeadline } = await import('../src/utils/public-station-deadline');

beforeEach(async () => {
  redis.isReady = false;
  await CacheManager.clearByPattern(prefix);
  values.clear(); reads.length = deletes.length = 0; now = 1_000_000;
  redis.isReady = true;
});
after(async () => {
  redis.isReady = false;
  await CacheManager.clearByPattern(prefix);
  delete process.env.REDIS_URL;
  mock.restoreAll();
});

for (const size of ['small', 'large'] as const) {
  const payload = (id: string) => ({ stations: [{ _id: id, name: size === 'large' ? 'x'.repeat(300_000) : id }], total: 1 });
  test(`${size} Redis promotion cannot mask a fresher shared pool after its absolute expiry`, async () => {
    const key = `${prefix}${size}`, storageKey = publicStationCacheKey(key);
    values.set(storageKey, JSON.stringify({ value: payload('old'), expiresAt: now + 1000 }));
    assert.deepEqual(await cache.get(key), payload('old'));
    assert.equal(reads.length, 1);
    if (size === 'large') assert.equal(CacheManager.getStats().memory.largeValues.keys, 1);

    now += 1000;
    const expiresAt = now + 60_000;
    const fresh = JSON.stringify({ value: payload('fresh'), expiresAt });
    values.set(storageKey, fresh);
    let loads = 0;
    const result = await capturePublicStationDeadline(() => cache.getOrSetSingleFlight(key, async () => {
      loads++; throw new Error('fixture database unavailable');
    }));
    assert.deepEqual(result.value, payload('fresh'));
    assert.equal(result.expiresAt, expiresAt);
    assert.equal(loads, 0);
    assert.equal(reads.length, 2);
    assert.equal(values.get(storageKey), fresh, 'local eviction must not delete or rewrite Redis');
    assert.deepEqual(deletes, []);
    assert.deepEqual(await cache.get(key), payload('fresh'));
    assert.equal(reads.length, 2, 'the valid replacement remains locally cached');
  });

  test(`${size} locally written envelope also honors an earlier inherited deadline`, async () => {
    const sourceKey = `${prefix}${size}:source`, wrappedKey = `${prefix}${size}:wrapped`;
    values.set(publicStationCacheKey(sourceKey), JSON.stringify({ value: payload('old'), expiresAt: now + 1000 }));
    await cache.getOrSetSingleFlight(wrappedKey, () => cache.get(sourceKey));
    assert.equal(JSON.parse(values.get(publicStationCacheKey(wrappedKey))!).expiresAt, now + 1000);
    now += 1000;
    values.set(publicStationCacheKey(wrappedKey), JSON.stringify({ value: payload('fresh'), expiresAt: now + 30_000 }));
    assert.deepEqual(await cache.getOrSetSingleFlight(wrappedKey, async () => {
      throw new Error('fixture database unavailable');
    }), payload('fresh'));
    assert.deepEqual(deletes, []);
  });

  test(`${size} expired pools never mask a real loader failure when Redis has no valid replacement`, async () => {
    const key = `${prefix}${size}`, storageKey = publicStationCacheKey(key);
    values.set(storageKey, JSON.stringify({ value: payload('old'), expiresAt: now + 1000 }));
    await cache.get(key);
    now += 1000;
    await assert.rejects(cache.getOrSetSingleFlight(key, async () => {
      throw new Error('fixture database unavailable');
    }), /fixture database unavailable/);
    assert.equal(await cache.get(key), null);
    values.delete(storageKey);
    await assert.rejects(cache.getOrSetSingleFlight(key, async () => {
      throw new Error('fixture database unavailable');
    }), /fixture database unavailable/);
    assert.deepEqual(deletes, []);
  });
}

test('expired Redis envelopes are not promoted and cannot hide a subsequent valid replacement', async () => {
  const key = `${prefix}already-expired`, storageKey = publicStationCacheKey(key);
  values.set(storageKey, JSON.stringify({ value: 'old', expiresAt: now }));
  assert.equal(await cache.get(key), null);
  values.set(storageKey, JSON.stringify({ value: 'fresh', expiresAt: now + 60_000 }));
  assert.equal(await cache.get(key), 'fresh');
  assert.equal(reads.length, 2);
});

test('ordinary cache readers retain their existing payload and TTL semantics', async () => {
  const key = `${prefix}ordinary`, value = { value: 'not a public health envelope', expiresAt: now - 1 };
  values.set(key, JSON.stringify(value));
  assert.deepEqual(await CacheManager.get(key), value);
  values.set(key, JSON.stringify({ changed: true }));
  assert.deepEqual(await CacheManager.get(key), value);
  assert.equal(reads.length, 1);
});
