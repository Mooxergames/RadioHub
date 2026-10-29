import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { withPublicStationDeadline, getPublicStationDeadline, limitPublicStationDeadline } from '../src/utils/public-station-deadline';
import { getSeoReadDeadline } from '../src/utils/seo-read-deadline';
import { buildRegionStationScope } from '../src/services/region-location-data';

const cache = new Map<string, any>();
const queries: Array<{ sql: string; values: any[]; deadline: number }> = [];
const locationReads: any[] = [];
let failure = false;
const rows = Array.from({ length: 32 }, (_, i) => ({ id: `station-${i}`, slug: `station-${i}`,
  name: `Radio ${i}`, url: 'https://stream.invalid/live', country: 'Germany', is_list_visible: true }));
mock.module('../src/cache', { defaultExport: {
  get: async (key: string) => cache.get(key),
  set: async (key: string, value: any) => { cache.set(key, value); },
} });
mock.module('../src/data/postgres-seo-read-query', { namedExports: { boundedSeoReadQuery: async (sql: string, values: any[]) => {
  queries.push({ sql, values, deadline: getSeoReadDeadline()?.expiresAt || 0 });
  if (failure) throw Object.assign(new Error('temporary bounded read failure'), { code: 'SEO_READ_TIMEOUT' });
  const limit = values.at(-2), offset = values.at(-1);
  const page = rows.slice(offset, offset + limit);
  return { rows: page.length ? page.map(row => ({ ...row, _total: rows.length })) : [{ id: null, _total: rows.length }] };
} } });
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => {
  throw new Error('SSR cannot use the unbounded application pool');
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  count: async (filter: any) => {
    if (failure) throw new Error('count failed');
    locationReads.push(['count', filter, getSeoReadDeadline()?.expiresAt]); return 62;
  },
  find: async (filter: any, options: any) => {
    locationReads.push(['find', filter, options, getSeoReadDeadline()?.expiresAt]);
    return rows.slice(0, options.offset ? 2 : 32);
  },
}) } });
const { readSeoGenrePage, readSeoGenreQualityPage, readSeoCityPage } = await import('../src/data/postgres-seo-directory-store');
beforeEach(() => { cache.clear(); queries.length = 0; locationReads.length = 0; failure = false; });

test('genre uses native canonical membership, compact bounded projection and deterministic 15-card slices', async () => {
  const first = await readSeoGenrePage('jazz', 1);
  const next = await readSeoGenrePage('jazz', 2);
  assert.equal(first.stations.length, 15); assert.equal(next.stations[0].slug, 'station-15');
  assert.equal(next.total, 32); assert.equal(next.totalPages, 3);
  for (const query of queries) {
    assert.ok(query.values.includes('jazz'));
    assert.ok(query.sql.includes('genre_matches AS MATERIALIZED'));
    assert.ok(query.sql.includes('jsonb_object_agg'));
    assert.ok(query.sql.includes('votes DESC,id ASC'));
    assert.ok(!query.sql.includes('SELECT *') && !query.sql.includes('s.descriptions'));
    assert.ok(query.deadline > Date.now() && query.deadline <= Date.now() + 4000);
  }
  assert.deepEqual(queries.map(query => query.values.slice(-2)), [[15, 0], [15, 15]]);
});
test('shared page caches coalesce misses and separate page and explicit country scopes', async () => {
  await Promise.all([readSeoGenrePage('jazz', 1), readSeoGenrePage('jazz', 1)]);
  await readSeoGenrePage('jazz', 1);
  assert.equal(queries.length, 1);
  await readSeoGenrePage('jazz', 2); await readSeoGenrePage('jazz', 1, 'Austria');
  assert.equal(queries.length, 3); assert.ok(queries[2].values.includes('Austria'));
});
test('explicit display country is normalized exactly like the API before query and cache identity', async () => {
  await readSeoGenrePage('jazz', 2, 'United States');
  assert.ok(queries[0].values.includes('The United States Of America'));
  assert.ok(!queries[0].values.includes('United States'));
  await readSeoGenrePage('jazz', 2, 'The United States Of America');
  assert.equal(queries.length, 1);
});
test('global genre quality sample is independently bounded and shared across all requested pages', async () => {
  const data = await readSeoGenreQualityPage('jazz');
  await readSeoGenreQualityPage('jazz');
  assert.equal(data.stations.length, 24); assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values.slice(-3), [1, 24, 0]);
  assert.ok(queries[0].sql.includes('votes>='));
  await readSeoGenrePage('jazz', 3);
  assert.equal(queries.length, 2);
});
test('read outage does not cache empty success and later recovers', async () => {
  failure = true; await assert.rejects(readSeoGenrePage('jazz', 2), /temporary bounded/);
  assert.equal(cache.size, 0);
  failure = false; assert.equal((await readSeoGenrePage('jazz', 2)).stations.length, 15);
});
test('visibility freshness propagates through cache without becoming the four-second SQL deadline', async () => {
  const freshness = Date.now() + 25000;
  await withPublicStationDeadline(async () => {
    limitPublicStationDeadline(freshness);
    await readSeoGenrePage('jazz', 1);
    assert.equal(getPublicStationDeadline(), freshness);
    assert.ok(queries[0].deadline < freshness);
  });
  await withPublicStationDeadline(async () => {
    await readSeoGenrePage('jazz', 1);
    assert.equal(getPublicStationDeadline(), freshness);
  });
});
test('city count and lean 60-card rows use exactly the same country-and-city filter', async () => {
  await readSeoCityPage('Germany', 'berlin', 2);
  assert.equal(locationReads[0][0], 'count'); assert.equal(locationReads[1][0], 'find');
  assert.deepEqual(locationReads[0][1], buildRegionStationScope('Germany', 'berlin')!.filter);
  assert.deepEqual(locationReads[1][1], locationReads[0][1]);
  assert.equal(locationReads[1][2].limit, 60); assert.equal(locationReads[1][2].offset, 60);
  assert.deepEqual(locationReads[1][2].sort, { votes: -1, _id: 1 });
  assert.ok(!locationReads[1][2].fields.includes('descriptions'));
  await readSeoCityPage('Germany', 'berlin', 3);
  assert.equal(locationReads.filter(read => read[0] === 'find').length, 1, 'Past-end pages count only');
});
test('country aliases, city aliases and the uncategorized all bucket retain API semantics', () => {
  const turkey = buildRegionStationScope('Turkey', 'istanbul')!;
  assert.deepEqual(turkey.filter.$and[0].$or.map((row: any) => row.country.$regex), ['^Turkey$', '^Türkiye$']);
  for (const slug of ['wien', 'vienna']) {
    const scope = buildRegionStationScope('Austria', slug)!;
    const terms = scope.filter.$and[1].$or.map((row: any) => (row.name || row.tags).$regex.source);
    assert.ok(terms.includes('Wien') && terms.includes('Vienna'));
  }
  assert.ok(buildRegionStationScope('Germany', 'all')!.filter.$and[1].$and.length > 0);
  assert.equal(buildRegionStationScope('Germany', 'not-a-city'), null);
});
