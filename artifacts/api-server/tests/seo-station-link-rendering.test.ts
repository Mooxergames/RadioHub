import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => { throw new Error('Database access forbidden in rendering unit tests'); },
} });
const pages = new Map<string, any>();
let metadataReads: string[][] = [], metadataFailure = false, metadataMissing = false;
let qualificationReads = 0, qualificationFailure = false;
let secondQualification: ReturnType<typeof Promise.withResolvers<void>> | undefined;
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pages.get(key), setPageData: (key: string, value: any) => pages.set(key, value),
  getTranslations: () => ({}), getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  find: async () => cards,
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/services/precomputed-stations', { namedExports: { PrecomputedStationsService: {
  getGlobalStations: async () => ({ stations: cards, totalPages: 1 }),
  getCountryStationsByName: async () => ({ stations: cards, totalPages: 1 }),
} } });
mock.module('../src/data/postgres-seo-directory-store', { namedExports: {
  readSeoGenrePage: async () => ({ stations: cards, totalPages: 1 }),
} });
mock.module('../src/data/postgres-taxonomy-store', { namedExports: { pgStoredGenreBySlug: async () => ({ stationCount: 100 }) } });
mock.module('../src/seo/slug-existence', { namedExports: {
  isSlugExistenceReady: () => true, hasCountrySlug: () => true,
  hasCityDataForCountry: () => false, hasCitySlug: () => false,
} });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => {
    qualificationReads++;
    if (qualificationFailure) throw new Error('Initial qualification unavailable');
    if (qualificationReads > 1) await secondQualification?.promise;
    return [...ACTIVE_SITEMAP_LANGUAGES];
  },
} });
mock.module('../src/data/postgres-seo-station-link-store', { namedExports: { readSeoStationLinkMetadata: async (ids: string[]) => {
  metadataReads.push(ids);
  if (metadataFailure) throw new Error('Optional metadata temporarily unavailable');
  return metadataMissing ? [] : cards.map((row, index) => ({ ...row,
    completeDescriptionLanguages: index === 0 ? [] : ['de'],
  }));
} } });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
const origin = 'https://themegaradio.com';
const cards = [
  { _id: 'fixture-us', name: 'US Radio', slug: 'us-radio', country: 'United States', countryCode: 'US',
    url: 'https://stream.invalid/us', noIndex: false, isListVisible: true },
  { _id: 'fixture-translated', name: 'Translated Radio', slug: 'translated-radio', country: 'France', countryCode: 'FR',
    url: 'https://stream.invalid/fr', noIndex: false, isListVisible: true },
];
const languages = {
  'fixture-us': { slug: 'us-radio', language: 'en' },
  'fixture-translated': { slug: 'translated-radio', language: 'de' },
};
const data = () => ({
  popularStations: cards, catalogStations: cards, catalogPage: 1, catalogTotalPages: 1,
  genreName: 'Jazz', country: 'germany', countryName: 'Germany', regionName: 'Germany',
  stationLinkLanguages: languages,
});
beforeEach(() => {
  pages.clear(); metadataReads = []; metadataFailure = false; metadataMissing = false;
  qualificationReads = 0; qualificationFailure = false; secondQualification = undefined;
});

for (const [pageType, cleanPath] of [
  ['stations', '/stations'], ['stations', '/stations/u'],
] as const) {
  test(`${pageType} ${cleanPath}: trusted target locale is used without changing card order or labels`, () => {
    const html = renderer.generateHtmlBody({ pageType, cleanPath, language: 'de', translations: {},
      additionalData: data(), urlTranslations: new Map() });
    assert.ok(html.includes('href="/en/station/us-radio"'), html);
    assert.ok(html.includes('href="/de/sender/translated-radio"'));
    assert.ok(!html.includes('href="/de/sender/us-radio"'));
    assert.ok(html.indexOf('US Radio') < html.indexOf('Translated Radio'));
  });
}

test('station recommendation families retain their original requested locale even if a directory decision is supplied', () => {
  const html = renderer.generateHtmlBody({ pageType: 'station', language: 'de', translations: {},
    stationData: { ...cards[1], country: 'Germany', countryCode: 'DE' }, urlTranslations: new Map(),
    additionalData: { stationLinkLanguages: languages, crossLinks: {
      samePublisher: [cards[0]], sameCountry: [cards[0]], sameGenre: [cards[0]], sameCity: [cards[0]],
      countryName: 'Germany', genreName: 'Jazz', cityName: 'Berlin',
    } } });
  assert.equal(html.match(/href="\/de\/station\/us-radio"/g)?.length, 4);
  assert.ok(!html.includes('href="/en/station/us-radio"'));
});

for (const [pageType, cleanPath] of [['home', '/'], ['genres', '/genres/jazz'], ['regions', '/regions/europe/germany']] as const) {
  test(`${pageType}: non-directory anchors and ItemList retain their original locale, ignoring directory decisions`, () => {
    const additionalData = { pageType, ...data() };
    const html = renderer.generateHtmlBody({ pageType, cleanPath, language: 'de', translations: {},
      additionalData, urlTranslations: new Map() });
    assert.ok(!html.includes('href="/en/station/us-radio"'));
    assert.match(html, /href="\/de\/[^"/]+\/us-radio"/);
    const schemas = renderer.generateStructuredData({ canonical: origin + '/de' }, 'de', {}, cleanPath,
      undefined, new Map(), additionalData);
    const list = schemas.page.find((schema: any) => schema['@type'] === 'ItemList');
    assert.ok(list.itemListElement.every((entry: any) => new URL(entry.item.url).pathname.startsWith('/de/')));
  });
}

test('directory bootstrap and ItemList URLs agree with the visible resolved anchors', () => {
  const pageData = { pageType: 'stations', ...data() };
  const dto = renderer.buildStationDirectoryData({ language: 'de', cleanPath: '/stations',
    translations: {}, urlTranslations: new Map(), pageData });
  assert.deepEqual(dto?.stations.map(row => row.href), ['/en/station/us-radio', '/de/sender/translated-radio']);
  const schemas = renderer.generateStructuredData({ canonical: origin + '/de/radiosender' }, 'de', {},
    '/stations', undefined, new Map(), pageData);
  const list = schemas.page.find((schema: any) => schema['@type'] === 'ItemList');
  assert.deepEqual(list.itemListElement.map((entry: any) => entry.item.url),
    [origin + '/en/station/us-radio', origin + '/de/sender/translated-radio']);
});

test('normal rendering resolves compact cards through exactly one trusted batch and reuses the page cache', async () => {
  const path = buildLocalizedUrl('/stations', 'de', undefined, new Map());
  const first = await renderer.renderStaticPage(path, origin);
  assert.deepEqual(metadataReads, [['fixture-us', 'fixture-translated']]);
  assert.deepEqual({ ...first.pageData.stationLinkLanguages }, languages);
  assert.ok(!JSON.stringify(first.pageData.stationLinkLanguages).includes('completeDescriptionLanguages'));
  const html = renderer.generateHtmlBody({ pageType: 'stations', language: first.language, translations: {},
    additionalData: first.pageData.additionalData, urlTranslations: first.urlTranslations });
  assert.ok(html.includes('href="/en/station/us-radio"'));
  assert.ok(html.includes('href="/de/sender/translated-radio"'));
  await renderer.renderStaticPage(path, origin);
  assert.equal(metadataReads.length, 1);
  assert.equal(qualificationReads, 1, 'Reuse initial qualified languages rather than starting another lookup');
});

test('a potentially stalled second qualification read is never started by directory enrichment', async () => {
  const gate = secondQualification = Promise.withResolvers<void>();
  const pending = renderer.renderStaticPage(buildLocalizedUrl('/stations', 'de', undefined, new Map()), origin);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const completed = await Promise.race([pending.then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 100); })]);
    assert.equal(completed, true, 'An optional lookup must not wait on a second qualification promise');
    assert.equal(qualificationReads, 1);
    assert.equal(metadataReads.length, 1);
  } finally { clearTimeout(timer); gate.resolve(); await pending; }
});

test('failed initial qualification skips optional directory metadata, not a retry with a minimal fallback set', async () => {
  qualificationFailure = true;
  const page = await renderer.renderStaticPage(buildLocalizedUrl('/stations', 'de', undefined, new Map()), origin);
  assert.equal(qualificationReads, 1);
  assert.equal(metadataReads.length, 0);
  assert.equal(page.pageData.stationLinkLanguages, undefined);
});

for (const path of ['/', '/genres/jazz', '/regions/europe/germany']) {
  test(`${path}: non-directory rendering performs no optional metadata lookup or qualification retry`, async () => {
    const page = await renderer.renderStaticPage(buildLocalizedUrl(path, 'de', undefined, new Map()), origin);
    assert.equal(metadataReads.length, 0);
    assert.equal(qualificationReads, 1);
    assert.equal(page.pageData.stationLinkLanguages, undefined);
  });
}

test('English pages need no additional metadata query', async () => {
  const page = await renderer.renderStaticPage('/en/stations', origin);
  assert.equal(metadataReads.length, 0);
  const html = renderer.generateHtmlBody({ pageType: 'stations', language: 'en', translations: {},
    additionalData: page.pageData.additionalData, urlTranslations: page.urlTranslations });
  assert.ok(html.includes('href="/en/station/us-radio"'));
});

for (const kind of ['unavailable', 'missing'] as const) {
  test(`${kind} metadata preserves the requested locale and never converts a successful page into noindex/error`, async () => {
    metadataFailure = kind === 'unavailable'; metadataMissing = kind === 'missing';
    const page = await renderer.renderStaticPage(buildLocalizedUrl('/stations', 'de', undefined, new Map()), origin);
    const html = renderer.generateHtmlBody({ pageType: 'stations', language: page.language, translations: {},
      additionalData: page.pageData.additionalData, urlTranslations: page.urlTranslations });
    assert.ok(html.includes('href="/de/sender/us-radio"'));
    assert.ok(!html.includes('href="/en/station/us-radio"'));
    assert.notEqual(page.pageData.stationDbError, true);
    assert.notEqual(page.seoTags.noIndex, true);
  });
}

test('missing metadata, provider lookalikes and stale-slug decisions do not invent an English fallback', () => {
  for (const stationLinkLanguages of [undefined, {}, { 'fixture-us': { slug: 'old-us-slug', language: 'en' } }]) {
    const html = renderer.generateHtmlBody({ pageType: 'stations', language: 'de', translations: {},
      additionalData: { ...data(), stationLinkLanguages, catalogStations: [{ ...cards[0],
        completeDescriptionLanguages: [], descriptions: {} }] }, urlTranslations: new Map() });
    assert.ok(html.includes('href="/de/sender/us-radio"'));
    assert.ok(!html.includes('href="/en/station/us-radio"'));
  }
});
