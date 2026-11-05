import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

const cache = new Map<string, any>();
const reads: unknown[][] = [];
let fail = false;
let empty = false;
const publicStation = { _id: 'public-radio', slug: 'public-radio', name: 'Public <Radio>',
  url: 'https://stream.invalid/live', country: 'Germany', tags: 'pop', isListVisible: true,
  noIndex: false, userId: 'PRIVATE_USER', listeningHistory: ['PRIVATE_HISTORY'] };
const rows = () => empty ? [] : [publicStation,
  { ...publicStation, slug: 'hidden-radio', isListVisible: false },
  { ...publicStation, slug: 'excluded-radio', noIndex: true }];
mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => { throw new Error('Real database access is forbidden'); },
} });
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => cache.get(key), setPageData: (key: string, data: any) => cache.set(key, data),
  getTranslations: () => ({}), getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => ({ noIndex: false }) } });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES],
} });
mock.module('../src/public-station-cache', { namedExports: { PUBLIC_STATION_CACHE_MAX_TTL: 60, publicStationCache: {
  getOrSetSingleFlight: async (_key: string, loader: () => Promise<unknown>) => loader(),
} } });
mock.module('../src/services/recommendation-pool', { namedExports: {
  getRecommendationPool: async (scope: unknown) => {
    reads.push(['recommendations', scope]);
    if (fail) throw new Error('Temporary public-pool failure');
    return { stations: rows() };
  },
} });
mock.module('../src/data/postgres-engagement-store', { namedExports: {
  pgTrendingStations: async (country: unknown, limit: number) => {
    reads.push(['trending', country, limit]);
    if (fail) throw new Error('Temporary public-trending failure');
    return { trending: rows().map(station => ({ stationId: station._id, station })) };
  },
} });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
const origin = 'https://themegaradio.com';
beforeEach(() => { cache.clear(); reads.length = 0; fail = false; empty = false; });
const body = (page: any) => renderer.generateHtmlBody({ pageType: page.pageData.pageType,
  language: page.language, cleanPath: page.cleanPath, translations: page.translations,
  seoTags: page.seoTags, additionalData: page.pageData.additionalData, urlTranslations: page.urlTranslations });
const head = (page: any) => renderer.generateHtmlHead(page.seoTags, page.language, page.translations,
  page.cleanPath, undefined, page.urlTranslations, page.pageData);

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  for (const kind of ['trending', 'recommendations'] as const) {
    test(`${language}/${kind}: anonymous public SSR, navigation metadata and cached directives agree`, async () => {
      const canonical = buildLocalizedUrl(`/${kind}`, language, undefined, new Map());
      for (const path of new Set([canonical, `/${language}/${kind}`, `${canonical}/`])) {
        const page = await renderer.renderStaticPage(path, origin);
        assert.equal(page.pageData.pageType, kind);
        assert.equal(page.cleanPath, `/${kind}`);
        assert.equal(page.seoTags.canonical, origin + canonical);
        assert.equal(page.seoTags.robots, 'index, follow');
        assert.notEqual(page.seoTags.noIndex, true);
        assert.equal(page.pageData.seoTags, page.seoTags);
        assert.ok(page.seoTags.hreflangs.some((entry: any) => entry.url === origin + canonical));
        const html = body(page);
        assert.match(html, /Public &lt;Radio&gt;/);
        assert.ok(html.includes(buildLocalizedUrl('/station/public-radio', language, undefined, new Map())));
        assert.match(head(page), /<meta name="robots" content="index, follow">/);
        assert.ok(head(page).includes(`rel="canonical" href="${origin}${canonical}"`));
        assert.doesNotMatch(JSON.stringify(page), /PRIVATE_USER|PRIVATE_HISTORY|hidden-radio|excluded-radio/);
        assert.equal(await renderer.renderStaticPage(path, origin), page);
      }
      assert.ok(reads.every(read => kind === 'recommendations'
        ? JSON.stringify(read) === JSON.stringify(['recommendations', { country: null, genres: [] }])
        : read[0] === 'trending' && read[1] === undefined && read[2] === 24));
    });
  }
  test(`${language}: personal favorites, account shells and search remain noindex without private reads`, async () => {
    for (const root of ['favorites', 'profile', 'login', 'settings', 'search']) {
      const path = buildLocalizedUrl(`/${root}`, language, undefined, new Map());
      const page = await renderer.renderStaticPage(`${path}?q=arbitrary-empty-query`, origin);
      assert.equal(page.seoTags.robots, 'noindex, follow', path);
      assert.equal(page.seoTags.noIndex, true, path);
      assert.deepEqual(page.seoTags.hreflangs, [], path);
      assert.match(head(page), /<meta name="robots" content="noindex, follow">/);
      assert.doesNotMatch(JSON.stringify(page), /PRIVATE_USER|PRIVATE_HISTORY|public-radio/);
    }
    assert.deepEqual(reads, [], 'Private shells must never call a public list or any personal-data reader');
  });
}

for (const kind of ['trending', 'recommendations'] as const) {
  test(`${kind}: bare roots and translated aliases use public metadata, descendants do not`, async () => {
    for (const path of [`/${kind}`, `/${kind}/`, `/${URL_TRANSLATIONS.tr[kind]}`]) {
      const page = await renderer.renderStaticPage(path, origin);
      assert.equal(page.pageData.pageType, kind);
      assert.equal(page.seoTags.robots, 'index, follow');
      assert.equal(page.language, path === `/${URL_TRANSLATIONS.tr[kind]}` ? 'tr' : 'en');
      assert.match(body(page), /public-radio/);
    }
    reads.length = 0;
    const child = await renderer.renderStaticPage(`/en/${kind}/arbitrary`, origin);
    assert.equal(child.seoTags.noIndex, true);
    assert.deepEqual(reads, []);
  });
  test(`${kind}: empty lists stay noindex; outages stay retryable and uncached`, async () => {
    empty = true;
    const path = `/en/${kind}`;
    assert.equal((await renderer.renderStaticPage(path, origin)).seoTags.noIndex, true);
    cache.clear(); empty = false; fail = true;
    const failed = await renderer.renderStaticPage(path, origin);
    assert.equal(failed.pageData.stationDbError, true);
    assert.notEqual(failed.seoTags.noIndex, true);
    assert.equal(cache.size, 0);
    fail = false;
    const recovered = await renderer.renderStaticPage(path, origin);
    assert.equal(recovered.seoTags.robots, 'index, follow');
    assert.match(body(recovered), /public-radio/);
  });
}
