import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildCountrySeo, buildRegionSeo } from '@workspace/seo-shared/region-seo-templates';
import { getLocalizedCountryName } from '@workspace/seo-shared/country-name-translations';
import { buildLocalizedUrl } from '../src/seo/url-helpers';
import { resolveToDbName } from '../src/utils/normalize-country';

const origin = 'https://themegaradio.com';
const countries = [
  { code: 'PH', slug: 'philippines', region: 'asia', display: 'Philippines', native: 'The Philippines', aliases: ['PH', 'PHL'] },
  { code: 'TR', slug: 'turkey', region: 'asia', display: 'Turkey', native: 'Türkiye', aliases: ['Turkiye', 'TR'] },
  { code: 'US', slug: 'united-states', region: 'north-america', display: 'United States', native: 'The United States Of America', aliases: ['USA', 'US'] },
  { code: 'GB', slug: 'united-kingdom', region: 'europe', display: 'United Kingdom', native: 'The United Kingdom Of Great Britain And Northern Ireland', aliases: ['UK', 'GB', 'Great Britain'] },
  { code: 'KR', slug: 'south-korea', region: 'asia', display: 'South Korea', native: 'The Republic Of Korea', aliases: ['Korea', 'KR'] },
  { code: 'CZ', slug: 'czech-republic', region: 'europe', display: 'Czech Republic', native: 'Czechia', aliases: ['Czechia', 'CZ'] },
] as const;
const pages = new Map<string, unknown>();
const reads: Array<{ filter: any; options: any }> = [];
const catalogCalls: Array<[string, number, number]> = [];
let failure: 'grid' | 'catalog' | 'abort' | undefined;
let existenceReady = true;

function stations(country: string, code = 'PH', count = 130) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `${code}-${index}`, slug: `fixture-${code.toLowerCase()}-${index}`, name: `${code} Radio ${index}`,
    country, countryCode: code, url: 'https://stream.example.invalid/live',
    isListVisible: true, noIndex: false, votes: 500 - index, tags: 'pop',
    lastCheckOk: index !== 0, favicon: 'https://example.invalid/logo.png',
  }));
}
const inventory = new Map<string, ReturnType<typeof stations>>(countries.map(country =>
  [country.native, stations(country.native, country.code)]));
inventory.set('Example Land', stations('Example Land', 'XL'));
inventory.set('All', stations('All', 'XL'));
// A city called Turkey must retain the old exact city query, not resolve to TR.
inventory.set('Turkey', stations('Turkey', 'CT'));
const customCountries = new Set(['example-land', 'all']);
const knownCities = new Set(['turkey', 'korea', 'philippines', 'berlin']);

mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => { throw new Error('Production DB access forbidden: country identity tests'); },
} });
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pages.get(key),
  setPageData: (key: string, value: unknown) => pages.set(key, value),
  getTranslations: (language: string) => ({ seo_radio_stations: `stations-${language}` }),
  getUrlTranslations: async () => new Map<string, string>(),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  find: async (filter: any, options: any) => {
    reads.push({ filter, options });
    if (failure === 'abort') throw new DOMException('Aborted', 'AbortError');
    if (failure === 'grid') throw Object.assign(new Error('Grid unavailable'), { code: 'SEO_READ_TIMEOUT' });
    // No alias resolution in the transport: wrong native identity MUST be empty.
    const rows = inventory.get(filter.country) ?? [];
    if (!rows.length) return [];
    const invalid = [
      { ...rows[0], slug: 'hidden', isListVisible: false },
      { ...rows[0], slug: 'excluded', noIndex: true },
      { ...rows[0], slug: 'radio-test-stream', name: 'Radio Test Stream' },
      { ...rows[0], slug: 'no-stream', url: '' },
    ];
    return [...invalid, ...rows].slice(0, options.limit).map(row => Object.fromEntries(
      options.fields.filter((field: string) => field in row).map((field: string) => [field, (row as any)[field]])));
  },
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/services/precomputed-stations', { namedExports: { PrecomputedStationsService: {
  getCountryStationsByName: async (country: string, page: number, limit: number) => {
    catalogCalls.push([country, page, limit]);
    if (failure === 'catalog') throw new Error('Catalogue unavailable');
    const rows = inventory.get(country) ?? [];
    return { stations: rows.slice((page - 1) * limit, page * limit), totalPages: Math.ceil(rows.length / limit) };
  },
} } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES],
} });
mock.module('../src/seo/slug-existence', { namedExports: {
  isSlugExistenceReady: () => existenceReady,
  hasCountrySlug: (slug: string) => customCountries.has(slug),
  hasCityDataForCountry: () => true,
  hasCitySlug: (_country: string, city: string) => knownCities.has(city),
} });
mock.module('../src/seo/directory-hub-data', { namedExports: {
  loadRegionDirectoryHub: async () => [],
  loadContinentDirectory: async (slug: string) => ({ slug, name: 'Europe', countries: [] }),
} });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
beforeEach(t => {
  pages.clear(); reads.length = 0; catalogCalls.length = 0;
  failure = undefined; existenceReady = true;
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network forbidden in country identity tests'); });
});

function markup(page: any) {
  const body = renderer.generateHtmlBody({ pageType: page.pageData.pageType, language: page.language,
    translations: page.translations, additionalData: page.pageData.additionalData,
    seoTags: page.seoTags, urlTranslations: page.urlTranslations });
  const head = renderer.generateHtmlHead(page.seoTags, page.language, page.translations, page.cleanPath,
    undefined, page.urlTranslations, page.pageData);
  const schemas = [...head.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  return { body, head, schemas };
}
function titleCase(slug: string) { return slug.replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()); }
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
function assertReadIdentity(native: string, page = 1) {
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].filter, { country: native, isListVisible: true,
    slug: { $exists: true, $ne: '' }, noIndex: { $ne: true }, votes: { $gt: 0 } });
  assert.deepEqual(reads[0].options, { fields: ['_id', 'name', 'slug', 'url', 'noIndex', 'isListVisible',
    'favicon', 'logoAssets', 'country', 'countryCode', 'tags', 'votes', 'genre'],
  sort: { votes: -1 }, limit: 24, sharedCardsKey: JSON.stringify(['country', native]) });
  assert.deepEqual(catalogCalls, [[native, page, 60]]);
}
function assertInventory(page: any, native: string, code: string, localized: string) {
  const data = page.pageData.additionalData;
  assert.equal(data.popularStations.length, 12);
  assert.equal(data.popularStations[0].slug, `fixture-${code.toLowerCase()}-0`, 'provider-only health failure is retained');
  assert.ok(data.popularStations.every((row: any) => row.country === native && row.noIndex === false && row.isListVisible));
  assert.ok(data.popularStations.every((row: any) => !['hidden', 'excluded', 'radio-test-stream', 'no-stream'].includes(row.slug)));
  assert.equal(data.catalogStations.length, 60);
  assert.equal(page.seoTags.canonical, origin + localized);
  assert.notEqual(page.pageData.httpNotFound, true);
  assert.notEqual(page.pageData.stationDbError, true);
  assert.notEqual(page.seoTags.noIndex, true);
  const output = markup(page);
  const list = output.schemas.find((schema: any) => schema['@type'] === 'ItemList');
  const collection = output.schemas.find((schema: any) => schema['@type'] === 'CollectionPage');
  assert.equal(list?.numberOfItems, 12);
  assert.deepEqual(collection?.mainEntity, list);
  assert.equal(collection?.url, origin + localized);
  assert.equal(collection?.inLanguage, page.language);
  for (const entry of list.itemListElement) {
    assert.equal(entry.item['@type'], 'RadioBroadcastService');
    assert.equal(entry.item['@id'], entry.item.url);
    assert.equal(new URL(entry.item.url).origin, origin);
    assert.ok(output.body.includes(`href="${new URL(entry.item.url).pathname}"`), 'schema station has a visible anchor');
  }
  assert.ok(output.body.includes(`fixture-${code.toLowerCase()}-59`), 'full catalogue is crawlable, not just popular12');
  return output;
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  for (const country of countries) {
    for (const family of ['regions', 'country'] as const) {
      for (const terminal of ['', '/stations', '/cities']) {
        const clean = family === 'regions' ? `/regions/${country.region}/${country.slug}${terminal}`
          : `/country/${country.slug}${terminal}`;
        test(`identity ${language} ${clean}: native query/key/catalogue; friendly copy and linked schema`, async () => {
          const localized = buildLocalizedUrl(clean, language, undefined, new Map());
          const page = await renderer.renderStaticPage(localized, origin);
          assertReadIdentity(country.native);
          assert.equal(page.cleanPath, clean);
          assert.equal(page.language, language);
          assert.equal(page.pageData.additionalData.regionName, country.display);
          const output = assertInventory(page, country.native, country.code, localized);
          const h1 = `${getLocalizedCountryName(country.display, language)} stations-${language}`;
          assert.ok(output.body.includes(`<h1>${escapeHtml(h1)}</h1>`), `localized friendly H1: ${h1}`);
          // Preserve the pre-existing title pipeline, including legacy /country terminal copy.
          const data = page.pageData.additionalData;
          const expectedSeo = data.country ? buildCountrySeo(titleCase(data.country), language, page.translations)
            : buildRegionSeo(titleCase(data.region), language, page.translations);
          assert.equal(page.seoTags.title, expectedSeo.title);
          for (const alternate of ACTIVE_SITEMAP_LANGUAGES) {
            const link = page.seoTags.hreflangs?.find((entry: any) => entry.lang === alternate);
            assert.ok(link?.url, `hreflang ${alternate} exists`);
            assert.equal(new URL(link.url).href, new URL(origin + buildLocalizedUrl(clean, alternate, undefined, new Map())).href,
              `friendly canonical route survives hreflang ${alternate}`);
          }
          if (country.native !== country.display) assert.ok(!output.body.includes(`<figcaption>${country.native}</figcaption>`));
        });
      }
    }
  }
}

for (const country of countries) {
  test(`${country.code}: real resolver accepts supported aliases and is native-name idempotent`, () => {
    for (const name of [country.display, ...country.aliases, country.native]) assert.equal(resolveToDbName(name), country.native, name);
  });
  for (const alias of country.aliases) {
    const slug = alias.toLowerCase().replace(/ /g, '-');
    test(`${country.code} /regions alias ${slug}: preserve redirect then normalize canonical destination`, async () => {
      const source = `/regions/${country.region}/${slug}`;
      const page = await renderer.renderStaticPage(buildLocalizedUrl(source, 'fr', undefined, new Map()), origin);
      // Pin existing route acceptance independently of the code under test.
      // Resolver ISO aliases and most native names are NOT route aliases.
      if (['phl', 'turkiye', 'usa'].includes(slug)) {
        assert.equal(page.pageData.redirectTo, buildLocalizedUrl(`/regions/${country.region}/${country.slug}`, 'fr', undefined, new Map()));
        assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
        const destination = await renderer.renderStaticPage(page.pageData.redirectTo, origin);
        assertReadIdentity(country.native);
        assertInventory(destination, country.native, country.code, page.pageData.redirectTo);
      } else {
        assert.equal(page.pageData.redirectTo, undefined);
        assert.equal(page.pageData.httpNotFound, true, 'non-route aliases remain rejected, not silently admitted');
        assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
      }
    });
    test(`${country.code} /country alias ${slug}: preserve route acceptance and native lookup`, async () => {
      const source = buildLocalizedUrl(`/country/${slug}`, 'de', undefined, new Map());
      const page = await renderer.renderStaticPage(source, origin);
      assert.equal(page.pageData.redirectTo, undefined);
      if (['phl', 'turkiye', 'usa'].includes(slug)) {
        assertReadIdentity(country.native);
        assertInventory(page, country.native, country.code, source);
        assert.equal(page.pageData.additionalData.regionName, titleCase(slug));
      } else {
        assert.equal(page.pageData.httpNotFound, true);
        assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
      }
    });
  }
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: wrong-continent canonical redirect performs zero station reads`, async () => {
    const result = await renderer.renderStaticPage(buildLocalizedUrl('/regions/europe/philippines/stations', language, undefined, new Map()), origin);
    assert.equal(result.pageData.redirectTo, buildLocalizedUrl('/regions/asia/philippines/stations', language, undefined, new Map()));
    assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
  });
}

for (const family of ['regions/europe/germany', 'country/germany']) {
  for (const city of ['turkey', 'korea', 'philippines']) {
    for (const terminal of ['', '/stations']) {
      test(`city guard /${family}/${city}${terminal}: no country alias normalization`, async () => {
        const result = await renderer.renderStaticPage(buildLocalizedUrl(`/${family}/${city}${terminal}`, 'tr', undefined, new Map()), origin);
        const display = titleCase(city);
        assertReadIdentity(display);
        assert.equal(result.pageData.additionalData.regionName, display);
        if (city === 'turkey') assert.equal(result.pageData.additionalData.popularStations[0].country, 'Turkey');
      });
    }
  }
}

for (const path of ['/regions/atlantis/philippines', '/regions/asia/missing-country', '/country/missing-country',
  '/regions/europe/germany/missing-city', '/country/germany/missing-city',
  '/regions/europe/germany/turkey/cities', '/country/germany/turkey/cities',
  '/regions/asia/philippines/stations/stations/stations', '/country/philippines/cities/stations/stations',
  '/regions/asia/philippines/bad%20city', '/country/bad%20country']) {
  test(`rejected route ${path}: retains true404 and zero catalogue/grid reads`, async () => {
    const result = await renderer.renderStaticPage(`/en${path}`, origin);
    assert.equal(result.pageData.httpNotFound, true);
    assert.equal(result.seoTags.noIndex, true);
    assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
  });
}

for (const path of ['/regions/europe/example-land', '/country/example-land']) {
  test(`custom existing ${path}: unknown resolver result keeps exact original identity`, async () => {
    assert.equal(resolveToDbName('Example Land'), 'Example Land');
    const page = await renderer.renderStaticPage(`/en${path}`, origin);
    assertReadIdentity('Example Land');
    assertInventory(page, 'Example Land', 'XL', `/en${path}`);
    assert.equal(page.pageData.additionalData.regionName, 'Example Land');
  });
}

for (const path of ['/regions/europe/all', '/country/all']) {
  test(`existing custom ${path}: title-cased All is not a lowercase global sentinel`, async () => {
    assert.equal(resolveToDbName('all'), null);
    assert.equal(resolveToDbName('All'), 'All');
    const page = await renderer.renderStaticPage(`/en${path}`, origin);
    assertReadIdentity('All');
    assertInventory(page, 'All', 'XL', `/en${path}`);
    assert.equal(page.pageData.additionalData.regionName, 'All');
  });
}

test('real resolver null/empty/global sentinels stay null without changing renderer route acceptance', () => {
  for (const value of [undefined, null, '', ' ', 'all', 'null', 'global']) assert.equal(resolveToDbName(value), null);
});

test('unavailable existence cache retains retryable failure, not unknown-country404 or unbounded query', async () => {
  existenceReady = false;
  const page = await renderer.renderStaticPage('/en/country/example-land', origin);
  assert.equal(page.pageData.stationDbError, true);
  assert.equal(page.pageData.additionalData.hubReadFailed, true);
  assert.notEqual(page.pageData.httpNotFound, true);
  assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0); assert.equal(pages.size, 0);
});

for (const path of ['/regions/asia/philippines', '/country/philippines']) {
  for (const pageNumber of [1, 2, 3, 4, 999999]) {
    test(`${path} page${pageNumber}: native identity preserves full pagination and past-end404`, async () => {
      const result = await renderer.renderStaticPage(`/en${path}?page=${pageNumber}`, origin);
      assertReadIdentity('The Philippines', pageNumber);
      assert.equal(result.pageData.additionalData.catalogPage, pageNumber);
      assert.equal(result.pageData.additionalData.catalogTotalPages, 3);
      assert.equal(result.pageData.additionalData.catalogStations.length, pageNumber <= 2 ? 60 : pageNumber === 3 ? 10 : 0);
      assert.equal(result.pageData.httpNotFound === true, pageNumber > 3);
    });
  }
  for (const value of ['0', '-1', '1.5', 'wat', '9007199254740992']) {
    test(`${path} invalid page ${value}: rejected before station reads`, async () => {
      const result = await renderer.renderStaticPage(`/en${path}?page=${value}`, origin);
      assert.equal(result.pageData.httpNotFound, true);
      assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
    });
  }
  for (const phase of ['grid', 'catalog', 'abort'] as const) {
    test(`${path} native ${phase} failure: no empty-success cache, then healthy inventory`, async () => {
      failure = phase;
      if (phase === 'abort') await assert.rejects(renderer.renderStaticPage(`/en${path}`, origin), /SEO_RENDER_TIMEOUT/);
      else {
        const result = await renderer.renderStaticPage(`/en${path}`, origin);
        assert.equal(result.pageData.stationDbError, true);
        assert.equal(result.pageData.additionalData.hubReadFailed, true);
        assert.notEqual(result.pageData.httpNotFound, true);
      }
      assert.equal(pages.size, 0);
      failure = undefined; reads.length = 0; catalogCalls.length = 0;
      const recovered = await renderer.renderStaticPage(`/en${path}`, origin);
      assertReadIdentity('The Philippines');
      assertInventory(recovered, 'The Philippines', 'PH', `/en${path}`);
    });
  }
}

for (const path of ['/regions', '/regions/europe']) {
  test(`${path}: directory and continent stay outside country normalization`, async () => {
    const page = await renderer.renderStaticPage(`/en${path}`, origin);
    assert.notEqual(page.pageData.stationDbError, true);
    assert.equal(reads.length, 0); assert.equal(catalogCalls.length, 0);
  });
}
