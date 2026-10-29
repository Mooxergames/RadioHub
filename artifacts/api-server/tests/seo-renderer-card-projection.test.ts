import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import express from 'express';
import { markSeoTemporarilyUnavailable } from '../src/seo/temporary-unavailable';
import { ACTIVE_SITEMAP_LANGUAGES, GENRE_STATIONS_PAGE_SIZE } from '@workspace/seo-shared/seo-config';
import { buildLocalizedUrl } from '../src/seo/url-helpers';
import { getSeoReadDeadline } from '../src/utils/seo-read-deadline';
import { getPublicStationDeadline, limitPublicStationDeadline, withPublicStationDeadline } from '../src/utils/public-station-deadline';

const origin = 'https://themegaradio.com';
const archived = 'UNNEEDED_ARCHIVED_EDITORIAL_TEXT '.repeat(4096);
const good = Array.from({ length: 24 }, (_, i) => ({
  _id: `fixture-${i}`, name: `Station ${i}`, slug: `station-${i}`, url: 'https://stream.example.invalid/live',
  noIndex: false, isListVisible: true, country: 'Germany', countryCode: 'DE', votes: 1000 - i,
  tags: 'pop,70s', genre: 'Seventies', lastCheckOk: i !== 0,
  favicon: 'https://example.invalid/logo.png', logoAssets: { webp256: 'https://example.invalid/processed.webp' },
  descriptions: { en: { full: archived } }, source: { archived },
}));
const rawCards = [
  { ...good[0], _id: 'no-stream', slug: 'no-stream', name: 'No Stream', url: '' },
  { ...good[0], _id: 'test', slug: 'radio-test-stream', name: 'Radio Test Stream' },
  { ...good[0], _id: 'hidden', slug: 'hidden', name: 'Hidden', isListVisible: false },
  { ...good[0], _id: 'excluded', slug: 'excluded', name: 'Excluded', noIndex: true },
  ...good,
];
const pages = new Map<string, any>();
let compact = false;
let reads: Array<{ filter: any; options: any }> = [];
let genreReads: Array<{ slug: string; page: number; country?: string }> = [];
let urlGate: ReturnType<typeof Promise.withResolvers<Map<string, string>>> | undefined;
let visibilityDeadline = Infinity;
let executionDeadline = Infinity;
let readFailure: Error | undefined;
let emptyCards = false;
let genreCountFails = false;
let junkOnly = false;

mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => { throw new Error('Production/database access is forbidden in this unit test'); },
} });
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pages.get(key),
  setPageData: (key: string, value: any) => pages.set(key, value),
  getTranslations: () => ({}),
  getUrlTranslations: () => urlGate?.promise ?? Promise.resolve(new Map<string, string>()),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  find: async (filter: any, options: any) => {
    reads.push({ filter, options });
    if (readFailure) throw readFailure;
    visibilityDeadline = getPublicStationDeadline();
    executionDeadline = getSeoReadDeadline()?.expiresAt ?? Infinity;
    const selected = emptyCards ? [] : junkOnly ? rawCards.slice(0, 4) : rawCards.slice(0, options.limit);
    return compact ? selected.map(row => Object.fromEntries(options.fields.map((field: string) =>
      [field, (row as any)[field]]).filter(([, value]: [string, unknown]) => value !== undefined))) : selected;
  },
}) } });
mock.module('../src/data/postgres-seo-directory-store', { namedExports: {
  readSeoGenrePage: async (slug: string, page: number, country?: string) => {
    genreReads.push({ slug, page, country });
    if (readFailure) throw readFailure;
    visibilityDeadline = getPublicStationDeadline();
    executionDeadline = getSeoReadDeadline()?.expiresAt ?? Infinity;
    const rows = emptyCards ? [] : junkOnly ? rawCards.slice(0, 4) : good;
    const fields = ['_id', 'name', 'slug', 'url', 'noIndex', 'isListVisible', 'favicon',
      'logoAssets', 'country', 'countryCode', 'tags', 'votes', 'genre', 'lastCheckOk'];
    // Native compact rows retain an empty descriptions map, never archived prose.
    const stations = rows.slice((page - 1) * GENRE_STATIONS_PAGE_SIZE, page * GENRE_STATIONS_PAGE_SIZE)
      .map(row => ({ ...Object.fromEntries(fields.map(field => [field, (row as any)[field]])), descriptions: {} }));
    return { stations, total: rows.length, totalPages: Math.ceil(rows.length / GENRE_STATIONS_PAGE_SIZE) };
  },
} });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/data/postgres-taxonomy-store', { namedExports: { pgStoredGenreBySlug: async () => {
  if (genreCountFails) throw new Error('temporary genre count outage');
  return { stationCount: 120 };
} } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/services/precomputed-stations', { namedExports: { PrecomputedStationsService: {
  getCountryStationsByName: async () => ({ stations: [good[0]], totalPages: 1 }),
} } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES],
} });
mock.module('../src/seo/slug-existence', { namedExports: {
  isSlugExistenceReady: () => true, hasCountrySlug: () => true,
  hasCityDataForCountry: () => false, hasCitySlug: () => false,
} });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });

const { SeoRenderer, getSeoRenderStats } = await import('../src/seo-renderer');
const { PostgresCatalogStore } = await import('../src/data/postgres-catalog-store');
const renderer = new SeoRenderer();
beforeEach(() => {
  pages.clear(); reads = []; genreReads = []; compact = false; urlGate = undefined;
  readFailure = undefined; emptyCards = false; genreCountFails = false; junkOnly = false;
});

function markup(page: any) {
  return {
    body: renderer.generateHtmlBody({ pageType: page.pageData.pageType, language: page.language,
      translations: page.translations, additionalData: page.pageData.additionalData,
      seoTags: page.seoTags, urlTranslations: page.urlTranslations }),
    head: renderer.generateHtmlHead(page.seoTags, page.language, page.translations, page.cleanPath,
      undefined, page.urlTranslations, page.pageData),
  };
}

function expectedGridSize(path: string): number {
  return path.includes('/genres/') ? GENRE_STATIONS_PAGE_SIZE : path === '/' || path === '/en' ? 10 : 12;
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  for (const path of ['/', '/genres/70s', '/regions/europe/germany']) {
    test(`${language}${path}: projected cards preserve visible HTML, JSON-LD, alt and quality gates`, async () => {
      const localized = buildLocalizedUrl(path, language, undefined, new Map());
      const full = await renderer.renderStaticPage(localized, origin);
      const expected = markup(full);
      pages.clear(); reads = []; genreReads = []; compact = true;
      const projected = await renderer.renderStaticPage(localized, origin);
      assert.deepEqual(markup(projected), expected);
      assert.equal(projected.seoTags.noIndex, undefined);
      if (path.startsWith('/genres/')) {
        assert.equal(reads.length, 0, 'genre pages must not return to the regex catalog reader');
        assert.deepEqual(genreReads, [{ slug: '70s', page: 1, country: undefined }]);
        assert.equal(projected.pageData.additionalData.catalogPage, 1);
        assert.equal(projected.pageData.additionalData.catalogTotalPages, Math.ceil(good.length / GENRE_STATIONS_PAGE_SIZE));
      } else {
        assert.equal(genreReads.length, 0);
        assert.equal(reads.length, 1);
        const { filter, options } = reads[0];
        assert.equal(filter.isListVisible, true);
        assert.equal(filter.noIndex.$ne, true);
        assert.deepEqual(options.sort, { votes: -1 });
        assert.equal(options.limit, 24);
        assert.equal(options.sharedCardsKey, JSON.stringify(path === '/' ? ['home'] : ['country', 'Germany']));
        for (const field of ['_id', 'name', 'slug', 'url', 'noIndex', 'isListVisible', 'favicon',
          'logoAssets', 'country', 'countryCode', 'tags', 'votes', 'genre']) assert.ok(options.fields.includes(field), field);
        assert.ok(!options.fields.includes('source') && !options.fields.includes('descriptions'));
      }
      const cards = projected.pageData.additionalData.popularStations;
      assert.equal(cards.length, expectedGridSize(path));
      assert.ok(cards.some((row: any) => row.slug === 'station-0'), 'provider-only failure is not a quality exclusion');
      assert.ok(cards.every((row: any) => row.url && !['radio-test-stream', 'hidden', 'excluded'].includes(row.slug)));
      assert.ok(cards.every((row: any) => !('source' in row) && (path.startsWith('/genres/')
        ? JSON.stringify(row.descriptions) === '{}' : !('descriptions' in row))));
      assert.ok(JSON.stringify(cards).length < 20000);
      assert.ok(!expected.body.includes('UNNEEDED_ARCHIVED_EDITORIAL_TEXT'));
      assert.equal(projected.seoTags.canonical, origin + localized);
    });
  }
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  for (const path of ['/', '/genres/70s', '/regions/europe/germany']) {
    test(`${language}${path}: a required grid outage is retryable, uncached and recovers with inventory`, async () => {
      const localized = buildLocalizedUrl(path, language, undefined, new Map());
      readFailure = Object.assign(new Error('temporary station card read outage'), { code: 'SEO_READ_TIMEOUT' });
      const failed = await renderer.renderStaticPage(localized, origin);
      assert.equal(failed.pageData.stationDbError, true);
      assert.equal(failed.pageData.additionalData.hubReadFailed, true);
      assert.notEqual(failed.pageData.httpNotFound, true);
      assert.notEqual(failed.pageData.stationIsJunk, true);
      assert.equal(pages.size, 0);
      readFailure = undefined;
      const recovered = await renderer.renderStaticPage(localized, origin);
      assert.notEqual(recovered.pageData.stationDbError, true);
      assert.equal(recovered.pageData.additionalData.popularStations.length, expectedGridSize(path));
      assert.equal(pages.size, 1);
    });
  }
}

for (const path of ['/en', '/en/genres/70s', '/en/regions/europe/germany']) {
  test(`${path}: a successful empty grid is not reclassified as a database outage`, async () => {
    emptyCards = true;
    const result = await renderer.renderStaticPage(path, origin);
    assert.notEqual(result.pageData.stationDbError, true);
    assert.notEqual(result.pageData.additionalData.hubReadFailed, true);
    assert.deepEqual(result.pageData.additionalData.popularStations, []);
  });
  test(`${path}: aborts still escape without publishing page data`, async () => {
    readFailure = new DOMException('Aborted', 'AbortError');
    await assert.rejects(renderer.renderStaticPage(path, origin), /SEO_RENDER_TIMEOUT/);
    assert.equal(pages.size, 0);
  });
  test(`${path}: a successful grid filtered to no eligible cards is not a read outage`, async () => {
    junkOnly = true;
    const result = await renderer.renderStaticPage(path, origin);
    assert.deepEqual(result.pageData.additionalData.popularStations, []);
    assert.notEqual(result.pageData.stationDbError, true);
    assert.notEqual(result.pageData.additionalData.hubReadFailed, true);
  });
}

for (const family of ['genre', 'country']) {
  test(`${family}: optional cross-link enrichment errors do not invalidate a healthy grid`, async t => {
    const { GENRE_WHITELIST_SEED } = await import('../src/seo/genre-whitelist-seed');
    t.mock.method(GENRE_WHITELIST_SEED, family === 'genre' ? Symbol.iterator : 'has', () => {
      throw new Error('optional cross-link enrichment failure');
    });
    const path = family === 'genre' ? '/en/genres/70s' : '/en/regions/europe/germany';
    const result = await renderer.renderStaticPage(path, origin);
    assert.equal(result.pageData.additionalData.popularStations.length, family === 'genre' ? GENRE_STATIONS_PAGE_SIZE : 12);
    assert.notEqual(result.pageData.stationDbError, true);
    assert.notEqual(result.pageData.additionalData.hubReadFailed, true);
  });
}

test('only the optional genre count failing does not discard a successfully loaded grid', async () => {
  genreCountFails = true;
  const result = await renderer.renderStaticPage('/en/genres/70s', origin);
  assert.equal(result.pageData.additionalData.genreCountFetchFailed, true);
  assert.equal(result.pageData.additionalData.popularStations.length, GENRE_STATIONS_PAGE_SIZE);
  assert.notEqual(result.pageData.stationDbError, true);
  assert.notEqual(result.seoTags.noIndex, true);
});

test('all three required grids produce GET/HEAD 503/no-store without cache writes, then recover', async () => {
  const app = express();
  app.use(async (req, res) => {
    const page = await renderer.renderStaticPage(req.originalUrl, origin);
    res.setHeader('X-Robots-Tag', 'index, follow');
    if (page.pageData.stationDbError) markSeoTemporarilyUnavailable(res);
    res.send(markup(page).body);
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as any).port}`;
    for (const path of ['/en', '/en/genres/70s', '/en/regions/europe/germany']) {
      pages.clear();
      for (const code of ['SEO_READ_TIMEOUT', 'ECONNRESET', 'SEO_SHARED_CARDS_EXPIRED']) {
        readFailure = Object.assign(new Error('temporary required grid failure'), { code });
        for (const method of ['GET', 'HEAD']) {
          const response = await fetch(base + path, { method });
          assert.equal(response.status, 503);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.equal(response.headers.get('retry-after'), '60');
          assert.equal(response.headers.get('x-robots-tag'), null);
          if (method === 'HEAD') assert.equal(await response.text(), '');
          assert.equal(pages.size, 0);
        }
      }
      readFailure = undefined;
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /station-0/);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('the real catalog projection reads only the requested legacy genre key, not archived JSON', async () => {
  compact = true;
  await renderer.renderStaticPage('/en', origin);
  const options = reads[0].options;
  let sql = '', values: any[] = [];
  const store = new PostgresCatalogStore({ query: async (text: string, parameters: any[]) => {
    sql = text; values = parameters;
    return { rows: [{ id: 'fixture', name: 'Station', slug: 'station', url: 'https://stream.example.invalid/live',
      is_list_visible: true, no_index: false, source: { genre: 'Seventies' } }] };
  } } as any);
  const result = await store.find(reads[0].filter, options);
  assert.ok(!sql.includes('s.*'));
  assert.ok(!sql.includes('s.descriptions'));
  assert.ok(sql.includes('jsonb_object_agg'));
  assert.deepEqual(values.at(-1), ['genre']);
  assert.equal(result[0].genre, 'Seventies');
  assert.equal(result[0].url, 'https://stream.example.invalid/live');
  assert.equal(result[0].descriptions, undefined);
});

test('the execution deadline never narrows visibility/cache freshness', async () => {
  const freshness = Date.now() + 30000;
  await withPublicStationDeadline(async () => {
    limitPublicStationDeadline(freshness);
    await renderer.renderStaticPage('/en', origin);
    assert.equal(getPublicStationDeadline(), freshness);
  });
  assert.equal(visibilityDeadline, freshness);
  assert.ok(executionDeadline <= freshness - 19000);
  assert.equal(getSeoReadDeadline(), undefined);
});

test('a render timeout cannot continue from a late URL-map read into SQL or cache writes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const gate = urlGate = Promise.withResolvers<Map<string, string>>();
  const pending = renderer.renderStaticPage('/en', origin);
  const failed = assert.rejects(pending, /SEO_RENDER_TIMEOUT/);
  t.mock.timers.tick(10000);
  await failed;
  assert.equal(getSeoRenderStats().active, 0);
  gate.resolve(new Map());
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(reads.length, 0);
  assert.equal(pages.size, 0);
  urlGate = undefined;
  compact = true;
  const recovered = await renderer.renderStaticPage('/en', origin);
  assert.equal(recovered.pageData.additionalData.popularStations.length, 10);
  assert.equal(getSeoRenderStats().active, 0);
});
