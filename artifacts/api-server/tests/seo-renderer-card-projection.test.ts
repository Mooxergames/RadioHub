import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
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
let urlGate: ReturnType<typeof Promise.withResolvers<Map<string, string>>> | undefined;
let visibilityDeadline = Infinity;
let executionDeadline = Infinity;

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
    visibilityDeadline = getPublicStationDeadline();
    executionDeadline = getSeoReadDeadline()?.expiresAt ?? Infinity;
    const selected = rawCards.slice(0, options.limit);
    return compact ? selected.map(row => Object.fromEntries(options.fields.map((field: string) =>
      [field, (row as any)[field]]).filter(([, value]: [string, unknown]) => value !== undefined))) : selected;
  },
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/data/postgres-taxonomy-store', { namedExports: { pgStoredGenreBySlug: async () => ({ stationCount: 120 }) } });
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
beforeEach(() => { pages.clear(); reads = []; compact = false; urlGate = undefined; });

function markup(page: any) {
  return {
    body: renderer.generateHtmlBody({ pageType: page.pageData.pageType, language: page.language,
      translations: page.translations, additionalData: page.pageData.additionalData,
      seoTags: page.seoTags, urlTranslations: page.urlTranslations }),
    head: renderer.generateHtmlHead(page.seoTags, page.language, page.translations, page.cleanPath,
      undefined, page.urlTranslations, page.pageData),
  };
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  for (const path of ['/', '/genres/70s', '/regions/europe/germany']) {
    test(`${language}${path}: projected cards preserve visible HTML, JSON-LD, alt and quality gates`, async () => {
      const localized = buildLocalizedUrl(path, language, undefined, new Map());
      const full = await renderer.renderStaticPage(localized, origin);
      const expected = markup(full);
      pages.clear(); reads = []; compact = true;
      const projected = await renderer.renderStaticPage(localized, origin);
      assert.deepEqual(markup(projected), expected);
      assert.equal(projected.seoTags.noIndex, undefined);
      assert.equal(reads.length, 1);
      const { filter, options } = reads[0];
      assert.equal(filter.isListVisible, true);
      assert.equal(filter.noIndex.$ne, true);
      assert.deepEqual(options.sort, { votes: -1 });
      assert.equal(options.limit, 24);
      for (const field of ['_id', 'name', 'slug', 'url', 'noIndex', 'isListVisible', 'favicon',
        'logoAssets', 'country', 'countryCode', 'tags', 'votes', 'genre']) assert.ok(options.fields.includes(field), field);
      assert.ok(!options.fields.includes('source') && !options.fields.includes('descriptions'));
      const cards = projected.pageData.additionalData.popularStations;
      assert.equal(cards.length, path === '/' ? 10 : 12);
      assert.ok(cards.some((row: any) => row.slug === 'station-0'), 'provider-only failure is not a quality exclusion');
      assert.ok(cards.every((row: any) => row.url && !['radio-test-stream', 'hidden', 'excluded'].includes(row.slug)));
      assert.ok(cards.every((row: any) => !('descriptions' in row) && !('source' in row)));
      assert.ok(JSON.stringify(cards).length < 20000);
      assert.ok(!expected.body.includes('UNNEEDED_ARCHIVED_EDITORIAL_TEXT'));
      assert.equal(projected.seoTags.canonical, origin + localized);
    });
  }
}

test('the real catalog projection reads only the requested legacy genre key, not archived JSON', async () => {
  compact = true;
  await renderer.renderStaticPage('/en/genres/70s', origin);
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
