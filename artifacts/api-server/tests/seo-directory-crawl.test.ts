import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

const cache = new Map<string, any>();
const calls: any[] = [];
let fail = false, filtered = false;
let storedCount: number | undefined = 32, qualityCount = 32, qualityHidden = false, qualityFails = false;
const station = (i: number) => ({ _id: `fixture-${i}`, slug: `fixture-${i}`, name: `Radio ${i}`,
  url: 'https://stream.invalid/live', country: 'Germany', countryCode: 'DE', tags: 'jazz', isListVisible: true });
const slice = (page: number, size: number, total: number) => Array.from({ length: total }, (_, i) =>
  ({ ...station(i), noIndex: filtered })).slice((page - 1) * size, page * size);
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => cache.get(key), setPageData: (key: string, value: any) => cache.set(key, value),
  getTranslations: () => ({}), getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/data/postgres-taxonomy-store', { namedExports: { pgStoredGenreBySlug: async () => storedCount === undefined ? null : ({ stationCount: storedCount }) } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES] } });
mock.module('../src/data/postgres-seo-directory-store', { namedExports: {
  readSeoGenrePage: async (slug: string, page: number, country?: string) => {
    calls.push(['genre', slug, page, country]);
    if (fail) throw Object.assign(new Error('temporary outage'), { code: 'SEO_READ_TIMEOUT' });
    return { stations: slice(page, 15, 32), total: 32, totalPages: 3 };
  },
  readSeoGenreQualityPage: async (slug: string) => {
    calls.push(['quality', slug]);
    if (qualityFails) throw new Error('temporary quality-count outage');
    return { stations: Array.from({ length: Math.min(24, qualityCount) }, (_, i) => ({ ...station(i), noIndex: qualityHidden })), total: qualityCount, totalPages: Math.ceil(qualityCount / 24) };
  },
  readSeoCityPage: async (country: string, city: string, page: number) => {
    calls.push(['city', country, city, page]);
    if (fail) throw new Error('temporary city outage');
    return { stations: slice(page, 60, 62), total: 62, totalPages: 2 };
  },
} });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => {
  throw new Error('City and genre must not use the old country/top-12 reader');
} } });
mock.module('../src/services/precomputed-stations', { namedExports: { PrecomputedStationsService: {
  getCountryStationsByName: () => { throw new Error('City must not call country precompute'); },
} } });
mock.module('../src/seo/slug-existence', { namedExports: {
  isSlugExistenceReady: () => true, hasCountrySlug: () => true,
  hasCityDataForCountry: () => false, hasCitySlug: () => false,
} });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
const origin = 'https://themegaradio.com';
beforeEach(() => { cache.clear(); calls.length = 0; fail = false; filtered = false;
  storedCount = 32; qualityCount = 32; qualityHidden = false; qualityFails = false;
});
const body = (data: any) => renderer.generateHtmlBody({ pageType: data.pageData.pageType, language: data.language,
  cleanPath: data.cleanPath, additionalData: data.pageData.additionalData, translations: {},
  seoTags: data.seoTags, urlTranslations: data.urlTranslations });

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: genre pages have distinct native slices, self canonicals and sequential hrefs`, async () => {
    const path = buildLocalizedUrl('/genres/jazz', language, undefined, new Map());
    const first = await renderer.renderStaticPage(path, origin);
    const next = await renderer.renderStaticPage(`${path}?page=2`, origin);
    const last = await renderer.renderStaticPage(`${path}?page=3`, origin);
    assert.equal(first.seoTags.canonical, origin + path);
    assert.equal(next.seoTags.canonical, `${origin}${path}?page=2`);
    assert.ok(next.seoTags.hreflangs.every((entry: any) => new URL(entry.url).searchParams.get('page') === '2'));
    assert.equal(first.pageData.popularStations.length, 15);
    assert.equal(last.pageData.popularStations.length, 2);
    assert.ok(body(first).includes('fixture-0') && !body(first).includes('fixture-15'));
    assert.ok(body(next).includes('fixture-15') && !body(next).includes('/fixture-0"'));
    assert.ok(body(next).includes(`href="${origin}${path}" rel="prev"`));
    assert.ok(body(next).includes(`href="${origin}${path}?page=3" rel="next"`));
    assert.notEqual(last.seoTags.noIndex, true, 'A short final page is not a thin genre');
    assert.equal(calls.length, 3);
    await renderer.renderStaticPage(`${path}?page=2`, origin);
    await renderer.renderStaticPage(path, origin);
    assert.equal(calls.length, 3);
  });
}
test('visible SSR article and station schema select the same legacy/English fallback without marker leakage', () => {
  for (const legacy of ['', 'Legacy complete article.']) {
    const row = { ...station(1), description: legacy, descriptions: {
      de: { full: '[TRANSLATED FULL DESCRIPTION]' }, en: { full: 'English complete article.' },
    } };
    const html = renderer.generateHtmlBody({ pageType: 'station', language: 'de', translations: {}, stationData: row, additionalData: {}, urlTranslations: new Map() });
    const structured = renderer.generateStructuredData({ canonical: `${origin}/de/sender/fixture-1` }, 'de', {}, '/station/fixture-1', row, new Map(), { pageType: 'station' });
    const expected = legacy || row.descriptions.en.full;
    assert.ok(html.includes(expected)); assert.ok(JSON.stringify(structured).includes(expected));
    assert.ok(!html.includes('[TRANSLATED FULL DESCRIPTION]'));
  }
});
test('page two first cannot poison page-one cache; duplicate/invalid/oversized parameters read nothing', async () => {
  await renderer.renderStaticPage('/en/genres/jazz?page=2', origin);
  const first = await renderer.renderStaticPage('/en/genres/jazz', origin);
  assert.equal(first.pageData.popularStations[0].slug, 'fixture-0');
  for (const query of ['page=0', 'page=-1', 'page=2&page=3', 'page=x', 'page=1000001', 'page=9007199254740992']) {
    const invalid = await renderer.renderStaticPage(`/en/genres/jazz?${query}`, origin);
    assert.equal(invalid.pageData.httpNotFound, true);
  }
  assert.equal(calls.length, 2);
});
test('past-end native count is absence; filtered-empty or failed reads are not', async () => {
  const missing = await renderer.renderStaticPage('/en/genres/jazz?page=4', origin);
  assert.equal(missing.pageData.httpNotFound, true);
  cache.clear(); filtered = true;
  const hidden = await renderer.renderStaticPage('/en/genres/jazz?page=2', origin);
  assert.deepEqual(hidden.pageData.popularStations, []);
  assert.notEqual(hidden.pageData.httpNotFound, true);
  cache.clear(); fail = true;
  const failed = await renderer.renderStaticPage('/en/genres/jazz?page=2', origin);
  assert.equal(failed.pageData.stationDbError, true); assert.notEqual(failed.pageData.httpNotFound, true);
  assert.equal(cache.size, 0);
  fail = false; filtered = false;
  assert.equal((await renderer.renderStaticPage('/en/genres/jazz?page=2', origin)).pageData.popularStations.length, 15);
});
test('missing stored count uses genre-wide eligible evidence, not a short final page or raw public total', async () => {
  storedCount = undefined;
  for (const page of [1, 3]) {
    const data = await renderer.renderStaticPage(`/en/genres/jazz?page=${page}`, origin);
    assert.notEqual(data.seoTags.noIndex, true);
    assert.ok(data.seoTags.hreflangs.length > 0);
  }
  cache.clear(); qualityCount = 4;
  assert.equal((await renderer.renderStaticPage('/en/genres/jazz?page=3', origin)).seoTags.noIndex, true, 'A genuinely thin global quality sample retains the gate');
  cache.clear(); qualityCount = 32; qualityHidden = true;
  assert.equal((await renderer.renderStaticPage('/en/genres/jazz', origin)).seoTags.noIndex, true, 'Raw total32 does not prove six eligible stations');
  cache.clear(); qualityHidden = false; filtered = true;
  assert.notEqual((await renderer.renderStaticPage('/en/genres/jazz?page=3', origin)).seoTags.noIndex, true, 'Filtered current page does not replace global evidence');
  cache.clear(); qualityFails = true;
  const unavailable = await renderer.renderStaticPage('/en/genres/jazz?page=3', origin);
  assert.notEqual(unavailable.seoTags.noIndex, true); assert.equal(unavailable.pageData.genreCountFetchFailed, true);
});
for (const language of ['en', 'tr', 'de']) {
  for (const query of ['?page=2', '?page=2&source=old%23link', '?page=1']) {
    test(`${language} alias${query}: redirect path and HTTP-owned query are combined once`, async () => {
      const alias = buildLocalizedUrl('/genres/hiphop', language, undefined, new Map());
      const canonical = buildLocalizedUrl('/genres/hip-hop', language, undefined, new Map());
      const result = await renderer.renderStaticPage(alias + query, origin);
      assert.equal(result.pageData.redirectTo, canonical);
      // Both cold and warm index-web redirect branches own the original query.
      for (const target of [result.pageData.redirectTo, structuredClone(result).pageData.redirectTo]) {
        const location = target + query;
        assert.equal(new URL(location, origin).searchParams.getAll('page').length, 1);
        const final = await renderer.renderStaticPage(location, origin);
        assert.notEqual(final.pageData.httpNotFound, true);
        assert.equal(final.pageData.catalogPage, Number(new URL(location, origin).searchParams.get('page')));
      }
    });
  }
}
test('production HTTP cold and warm redirect branches retain sole ownership of the original query', async () => {
  const source = await readFile(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('res.redirect(301, redirectTo + queryString)'));
  assert.ok(source.includes('res.redirect(301, cachedPage.pageData.redirectTo + queryString)'));
});
for (const suffix of ['', '/stations']) {
  for (const family of ['/regions/europe/germany', '/country/germany']) {
    test(`${family}/berlin${suffix}: city and country remain separate with full city pagination`, async () => {
      const path = `/en${family}/berlin${suffix}`;
      const first = await renderer.renderStaticPage(path, origin);
      const second = await renderer.renderStaticPage(`${path}?page=2`, origin);
      assert.deepEqual(calls, [['city', 'Germany', 'berlin', 1], ['city', 'Germany', 'berlin', 2]]);
      assert.equal(first.pageData.catalogStations.length, 60); assert.equal(second.pageData.catalogStations.length, 2);
      assert.match(first.seoTags.title, /Berlin, Germany/);
      assert.match(body(first), /Berlin, Germany/); assert.ok(body(first).includes('fixture-0'));
      assert.equal(second.seoTags.canonical, `${origin}${path}?page=2`);
    });
  }
}
test('city read outage is retryable and uncached, not a false404', async () => {
  fail = true;
  const failed = await renderer.renderStaticPage('/en/regions/europe/germany/berlin/stations', origin);
  assert.equal(failed.pageData.stationDbError, true); assert.notEqual(failed.pageData.httpNotFound, true); assert.equal(cache.size, 0);
  fail = false;
  assert.equal((await renderer.renderStaticPage('/en/regions/europe/germany/berlin/stations', origin)).pageData.catalogStations.length, 60);
});
for (const [path, country, city] of [
  ['/regions/north-america/united-states/new-york/stations', 'United States', 'new-york'],
  ['/regions/europe/russia/moscow/stations', 'Russia', 'moscow'],
  ['/regions/europe/czech-republic/prague/stations', 'Czech Republic', 'prague'],
  ['/regions/europe/austria/vienna/stations', 'Austria', 'vienna'],
] as const) {
  test(`${path}: country DB names resolve to the API's location identity`, async () => {
    const data = await renderer.renderStaticPage(`/en${path}`, origin);
    assert.notEqual(data.pageData.httpNotFound, true);
    assert.deepEqual(calls, [['city', country, city, 1]]);
  });
}
for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: station explore navigation links directly to canonical localized hubs`, () => {
    const html = renderer.generateHtmlBody({ pageType: 'station', language, translations: {}, stationData: station(1), additionalData: {}, urlTranslations: new Map() });
    for (const hub of ['/genres', '/regions', '/stations']) assert.ok(html.includes(`href="${buildLocalizedUrl(hub, language, undefined, new Map())}"`));
  });
}
