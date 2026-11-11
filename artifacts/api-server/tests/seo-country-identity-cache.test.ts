import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { after, beforeEach, mock, test } from 'node:test';
import { resolveToDbName } from '../src/utils/normalize-country';
import { getPublicStationDeadline, withPublicStationDeadline } from '../src/utils/public-station-deadline';

// All stores, SQL compilation, bounded read execution, SWR and singleflight are
// production code. Only the PostgreSQL query transport is replaced.
delete process.env.REDIS_URL;
delete process.env.DATABASE_URL;
const nativePH = 'The Philippines';
const nativeTR = 'Türkiye';
const queries: Array<{ sql: string; values: any[]; channel: 'seo' | 'catalog' }> = [];
const transactions: string[] = [];
const releases: unknown[] = [];
let pause: Promise<void> | undefined;
let failure: 'seo' | 'catalog-count' | 'catalog-page' | undefined;
let rows: Record<string, any>[] = [];

function fixtures(country: string, code: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${code}-${String(index).padStart(5, '0')}`, slug: `station-${code.toLowerCase()}-${index}`,
    name: `${code} Radio ${index}`, country, country_code: code,
    is_list_visible: true, no_index: false, votes: 1000 - index, has_logo: true,
    last_check_ok: index !== 0, url: 'https://example.invalid/live', url_resolved: 'https://example.invalid/resolved',
    favicon: 'https://example.invalid/logo.png', tags_raw: 'pop', source: { genre: 'Pop' },
  }));
}
async function transport(sql: string, values: any[] = [], channel: 'seo' | 'catalog' = 'catalog') {
  if (/^(BEGIN READ ONLY|SET LOCAL statement_timeout = '\d+ms'|COMMIT|ROLLBACK)$/.test(sql)) {
    transactions.push(sql); return { rows: [] };
  }
  assert.match(sql, /^SELECT /, 'no mutating SQL is allowed');
  queries.push({ sql, values, channel });
  if (pause) await pause;
  const grouped = sql.includes('GROUP BY s.country');
  if (grouped) {
    assert.match(sql, /^SELECT s.country AS _id,count\(\*\)::integer AS count FROM stations s WHERE TRUE GROUP BY s.country$/);
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.country, (counts.get(row.country) ?? 0) + 1);
    return { rows: [...counts].map(([_id, count]) => ({ _id, count })) };
  }
  const count = sql.startsWith('SELECT count(*)');
  if (failure === (channel === 'seo' ? 'seo' : count ? 'catalog-count' : 'catalog-page')) {
    throw Object.assign(new Error('Deterministic query outage'), { code: 'ECONNRESET' });
  }
  assert.match(sql, /s.country (?:= \$1::text|~\* \$1)/, 'country must be a bound native predicate');
  assert.equal(typeof values[0], 'string');
  let selected = rows.filter(row => sql.includes('s.country ~*')
    ? new RegExp(values[0], 'i').test(row.country) : row.country === values[0]);
  if (sql.includes('$2::boolean')) {
    assert.equal(values[1], true);
    selected = selected.filter(row => row.is_list_visible === true);
  }
  if (channel === 'seo') {
    assert.match(sql, /s.slug IS NOT NULL/);
    assert.match(sql, /s.no_index <> \$\d+::boolean/);
    assert.match(sql, /s.votes > \$\d+::integer/);
    selected = selected.filter(row => row.slug && !row.no_index && row.votes > 0);
  }
  if (count) return { rows: [{ count: String(selected.length) }] };
  assert.doesNotMatch(sql, /s\.\*|s\.descriptions/);
  assert.ok(!sql.includes('s.source,') && !sql.includes('s.source FROM'), 'archived source is never selected wholesale');
  selected.sort((a, b) => Number(b.has_logo) - Number(a.has_logo) || b.votes - a.votes || a.id.localeCompare(b.id));
  const limit = sql.match(/ LIMIT \$(\d+)/);
  const offset = sql.match(/ OFFSET \$(\d+)/);
  assert.ok(limit, 'all card/catalog reads are bounded');
  const start = offset ? values[Number(offset[1]) - 1] : 0;
  return { rows: selected.slice(start, start + values[Number(limit[1]) - 1]) };
}
const pool = {
  totalCount: 1, idleCount: 1, waitingCount: 0,
  query: (sql: string, values?: any[]) => transport(sql, values, 'catalog'),
  connect: async () => Object.assign(new EventEmitter(), {
    query: (sql: string, values?: any[]) => transport(sql, values, 'seo'),
    release: (discard?: unknown) => releases.push(discard),
  }),
};
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => pool } });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
const { PostgresCatalogStore, pgCatalog } = await import('../src/data/postgres-catalog-store');
const { pgSeoCatalog } = await import('../src/data/postgres-seo-read-store');
const { publicStationCache, publicStationCacheKey } = await import('../src/public-station-cache');
const { CacheManager } = await import('../src/cache');
const { PrecomputedStationsService } = await import('../src/services/precomputed-stations');
const cardsFields = ['_id', 'name', 'slug', 'url', 'noIndex', 'isListVisible', 'favicon', 'logoAssets',
  'country', 'countryCode', 'tags', 'votes', 'genre'];
const catalogueKey = (country: string, page = 1, limit = 60) =>
  `precomputed_stations:catalog:v1:${encodeURIComponent(country)}:${page}:${limit}`;
const gridKey = (country: string) => `ssr-grid:v1:${JSON.stringify(['country', country])}`;
async function grid(country: string) {
  return withPublicStationDeadline(async () => {
    const cards = await pgSeoCatalog().find({ country, isListVisible: true, slug: { $exists: true, $ne: '' },
      noIndex: { $ne: true }, votes: { $gt: 0 } }, {
      fields: cardsFields, sort: { votes: -1 }, limit: 24, sharedCardsKey: JSON.stringify(['country', country]),
    });
    return { cards, deadline: getPublicStationDeadline() };
  });
}
beforeEach(async t => {
  await CacheManager.clearByPattern('public-health:v2:');
  (PrecomputedStationsService as any).allCountries = [];
  (PrecomputedStationsService as any).resolvedCache.clear();
  rows = [...fixtures(nativePH, 'PH', 130), ...fixtures(nativeTR, 'TR', 4)];
  queries.length = 0; transactions.length = 0; releases.length = 0; pause = undefined; failure = undefined;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network forbidden in native country cache tests'); });
});
after(async () => { await CacheManager.clearByPattern('public-health:v2:'); });

test('real native PH SQL: exact resolver, production card store, bounded transaction and catalogue projection', async () => {
  assert.ok(pgCatalog() instanceof PostgresCatalogStore);
  assert.equal(resolveToDbName('Philippines'), nativePH);
  const result = await grid(nativePH);
  const catalogue = await PrecomputedStationsService.getCountryStationsByName(nativePH, 2, 60);
  assert.equal(result.cards.length, 24);
  assert.equal(result.cards[0].country, nativePH);
  assert.equal(result.cards[0].slug, 'station-ph-0');
  assert.equal(catalogue.total, 130); assert.equal(catalogue.totalPages, 3);
  assert.equal(catalogue.stations.length, 60); assert.equal(catalogue.stations[0].slug, 'station-ph-60');
  assert.ok(queries.filter(query => !query.sql.includes('GROUP BY')).every(query => query.values[0] === nativePH));
  const cardRead = queries.find(query => query.channel === 'seo')!;
  assert.deepEqual(cardRead.values.slice(0, 6), [nativePH, true, '', true, 0, 24]);
  assert.match(cardRead.sql, /ORDER BY s.votes DESC NULLS LAST LIMIT \$6/);
  const pageRead = queries.at(-1)!;
  assert.deepEqual(pageRead.values, [nativePH, true, 60, 60]);
  assert.match(pageRead.sql, /ORDER BY s.has_logo DESC NULLS LAST,s.votes DESC NULLS LAST,s.id ASC NULLS LAST/);
  assert.equal(queries.some(query => query.sql.includes('s.country ~*')), false, 'existing exact native-country resolution avoids regex fallback');
  assert.match(transactions[1], /^SET LOCAL statement_timeout = '\d+ms'$/);
  assert.equal(transactions[0], 'BEGIN READ ONLY'); assert.equal(transactions.at(-1), 'COMMIT');
  assert.deepEqual(releases, [undefined]);
});

test('wrong warm Philippines empty grid/catalogue cannot poison native The Philippines identity', async () => {
  assert.deepEqual((await grid('Philippines')).cards, []);
  const wrong = await PrecomputedStationsService.getCountryStationsByName('Philippines', 1, 60);
  assert.equal(wrong.total, 0); assert.deepEqual(wrong.stations, []);
  assert.ok(await publicStationCache.get(gridKey('Philippines')));
  assert.ok(await publicStationCache.getSWR(catalogueKey('Philippines')));
  const before = queries.length;
  const correct = await grid(resolveToDbName('PH')!);
  const catalogue = await PrecomputedStationsService.getCountryStationsByName(resolveToDbName('Philippines')!, 1, 60);
  assert.equal(correct.cards.length, 24); assert.equal(catalogue.total, 130); assert.equal(catalogue.stations.length, 60);
  assert.ok(queries.slice(before).every(query => query.values[0] === nativePH), 'native recovery never reads a friendly-name predicate');
  assert.ok(await publicStationCache.get(gridKey(nativePH)));
  assert.ok(await publicStationCache.getSWR(catalogueKey(nativePH)));
  const after = queries.length;
  assert.deepEqual((await grid('Philippines')).cards, []);
  assert.equal((await PrecomputedStationsService.getCountryStationsByName('Philippines', 1, 60)).total, 0);
  assert.equal(queries.length, after, 'wrong-key warm emptiness remains isolated, not mutated into correct data');
});

test('14 locale-equivalent grid requests share one real native SQL producer and one warm cache entry', async () => {
  const gate = Promise.withResolvers<void>(); pause = gate.promise;
  const pending = Array.from({ length: 14 }, () => grid(resolveToDbName('Philippines')!));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries.filter(query => query.channel === 'seo').length, 1);
  gate.resolve();
  const results = await Promise.all(pending); pause = undefined;
  assert.ok(results.every(result => result.cards.length === 24 && result.cards[0].country === nativePH));
  assert.equal(new Set(results.map(result => result.deadline)).size, 1);
  const before = queries.length;
  for (let i = 0; i < 14; i++) assert.equal((await grid(nativePH)).cards.length, 24);
  assert.equal(queries.length, before);
  assert.equal(releases.length, 1);
});

test('real catalogue exact-name singleflight, page/limit/country isolation and count-only past-end', async () => {
  await PrecomputedStationsService.getAllCountriesFromDB(); queries.length = 0;
  const gate = Promise.withResolvers<void>(); pause = gate.promise;
  const pending = Array.from({ length: 14 }, () => PrecomputedStationsService.getCountryStationsByName(nativePH, 2, 60));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /^SELECT count\(\*\)/);
  gate.resolve();
  const results = await Promise.all(pending); pause = undefined;
  assert.ok(results.every(result => result.stations[0].slug === 'station-ph-60'));
  assert.equal(queries.length, 2, 'one count and one page read for14 callers');
  assert.equal((await PrecomputedStationsService.getCountryStationsByName(nativePH, 2, 60)).cached, true);
  assert.equal(queries.length, 2);
  await PrecomputedStationsService.getCountryStationsByName(nativePH, 1, 60);
  await PrecomputedStationsService.getCountryStationsByName(nativePH, 2, 30);
  const turkey = await PrecomputedStationsService.getCountryStationsByName(nativeTR, 1, 60);
  assert.equal(turkey.total, 4); assert.ok(turkey.stations.every(station => station.country === nativeTR));
  for (const [country, page, limit] of [[nativePH, 2, 60], [nativePH, 1, 60], [nativePH, 2, 30], [nativeTR, 1, 60]] as const) {
    assert.ok(await publicStationCache.getSWR(catalogueKey(country, page, limit)));
  }
  const before = queries.length;
  const absent = await PrecomputedStationsService.getCountryStationsByName(nativePH, 999999, 60);
  assert.equal(absent.total, 130); assert.deepEqual(absent.stations, []);
  assert.equal(queries.length, before + 1);
  assert.match(queries.at(-1)!.sql, /^SELECT count\(\*\)/);
  assert.doesNotMatch(queries.at(-1)!.sql, /OFFSET/);
});

test('native grid and catalogue warm HITs carry original health deadline, never a renewed minute', async t => {
  const now = 1_000_000;
  t.mock.timers.enable({ apis: ['Date'], now });
  const first = await grid(nativePH);
  await PrecomputedStationsService.getCountryStationsByName(nativePH, 1, 60);
  const before = queries.length;
  t.mock.timers.tick(55_000);
  assert.equal((await grid(nativePH)).deadline, first.deadline);
  const expiry = await withPublicStationDeadline(async () => {
    assert.equal((await PrecomputedStationsService.getCountryStationsByName(nativePH, 1, 60)).cached, true);
    return getPublicStationDeadline();
  });
  assert.equal(first.deadline, now + 60_000); assert.equal(expiry, now + 60_000);
  assert.equal(queries.length, before);
  const envelope = await CacheManager.get<any>(publicStationCacheKey(gridKey(nativePH)));
  assert.equal(envelope.expiresAt, now + 60_000);
  assert.equal(envelope.value.expiresAt, now + 60_000);
});

for (const phase of ['seo', 'catalog-count', 'catalog-page'] as const) {
  test(`native ${phase} outage after health expiry: no stale/empty success and recovery`, async t => {
    const now = 1_000_000;
    t.mock.timers.enable({ apis: ['Date'], now });
    await grid(nativePH);
    await PrecomputedStationsService.getCountryStationsByName(nativePH, 1, 60);
    t.mock.timers.tick(60_001);
    failure = phase;
    if (phase === 'seo') {
      await assert.rejects(grid(nativePH), /Deterministic query outage/);
      assert.equal(await publicStationCache.get(gridKey(nativePH)), null);
    } else {
      await assert.rejects(PrecomputedStationsService.getCountryStationsByName(nativePH, 1, 60), /Deterministic query outage/);
      assert.equal(await publicStationCache.getSWR(catalogueKey(nativePH)), null);
    }
    failure = undefined;
    assert.equal((await grid(nativePH)).cards.length, 24);
    assert.equal((await PrecomputedStationsService.getCountryStationsByName(nativePH, 1, 60)).stations.length, 60);
  });
}
