import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import * as seoConfig from '@workspace/seo-shared/seo-config';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { selectStationVisibleDescription } from '@workspace/seo-shared/station-description-template';
import { REVIEWED_STATION_EDITORIALS, type ReviewedStationEditorial } from '@workspace/seo-shared/station-editorial';
import type { StaticPageData } from '../src/seo-renderer';

const origin = 'https://themegaradio.com';
const languages = ['en', 'de', 'tr'] as const;
const fields = ['title', 'description', 'ogTitle', 'ogDescription', 'twitterTitle', 'twitterDescription'] as const;
type MetadataField = typeof fields[number];
type Administrator = Partial<Record<MetadataField, string>> & { noIndex?: boolean; noFollow?: boolean };
const pageCache = new Map<string, StaticPageData>();
let cacheWrites: StaticPageData[] = [];
let metadata: Administrator | null = null;
let metadataFilters: Record<string, unknown>[] = [];
let stationReads = 0;
let forbiddenDatabaseReads = 0;
let stationPatch: Record<string, any> = {};
let aliasSlug: string | undefined;
let baseRobots: string | undefined;
let baseTags: Record<string, any> | undefined;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => {
    forbiddenDatabaseReads++;
    throw new Error('Real database access is forbidden in reviewed-station-metadata tests');
  },
} });
mock.module('@workspace/seo-shared/seo-config', { namedExports: {
  ...seoConfig,
  generateSeoTags: (...args: Parameters<typeof seoConfig.generateSeoTags>) => {
    const tags = seoConfig.generateSeoTags(...args);
    if (baseRobots !== undefined) tags.robots = baseRobots;
    baseTags = { ...tags };
    return tags;
  },
} });
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pageCache.get(key),
  setPageData: (key: string, value: StaticPageData) => {
    pageCache.set(key, deepFreeze(value));
    cacheWrites.push(value);
  },
  getTranslations: () => ({}),
  getUrlTranslations: async () => new Map(languages.map(language =>
    [`${language}:station`, URL_TRANSLATIONS[language]?.station || 'station'])),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  findOne: async (filter: Record<string, unknown>) => {
    stationReads++;
    return filter.slug === stationPatch.slug ? { ...stationPatch } : null;
  },
  findById: async (id: string) => {
    stationReads++;
    return id === stationPatch._id ? { ...stationPatch } : null;
  },
  findMergedAlias: async (slug: string) => slug === aliasSlug ? { ...stationPatch } : null,
  find: async () => [], count: async () => 0, groupCount: async () => [],
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: {
  pgSeoMetadata: async (filter: Record<string, unknown>) => {
    metadataFilters.push({ ...filter });
    return metadata;
  },
} });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => [...languages],
} });
mock.module('../src/seo/related-station-cards', { namedExports: { relatedStationCards: async () => [] } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();

beforeEach(() => {
  pageCache.clear();
  cacheWrites = [];
  metadata = null;
  metadataFilters = [];
  stationReads = 0;
  forbiddenDatabaseReads = 0;
  stationPatch = {};
  aliasSlug = undefined;
  baseRobots = undefined;
  baseTags = undefined;
});
afterEach(() => assert.equal(forbiddenDatabaseReads, 0, 'even swallowed real-database attempts must fail the test'));

function firstApproved(language: typeof languages[number]): ReviewedStationEditorial {
  assert.ok(REVIEWED_STATION_EDITORIALS.length > 0, 'Integrate the Astra-approved registry before running this suite');
  const editorial = REVIEWED_STATION_EDITORIALS.find(item => item.language === language);
  assert.ok(editorial, `The approved registry must include ${language}; do not silently skip its integration tests`);
  return editorial;
}

function prepareStation(editorial: ReviewedStationEditorial, language = editorial.language) {
  const geography = {
    en: { country: 'The United States Of America', countryCode: 'US' },
    de: { country: 'Germany', countryCode: 'DE' },
    tr: { country: 'Turkey', countryCode: 'TR' },
  }[language];
  stationPatch = {
    _id: editorial.stationId, slug: editorial.slug, name: 'Editorial Fixture Radio',
    ...geography, language, languageCodes: languages.join(','),
    url: 'https://stream.example.invalid/live', tags: 'pop', noIndex: false,
    redirectToSlug: null, lastCheckOk: true, isListVisible: true,
    manualEditFields: { descriptions: true },
    descriptions: Object.fromEntries(languages.map(locale => [locale, {
      full: `Original ${locale} fixture reporting, music and local interviews, distinct from the reviewed article.`,
      meta: `Original ${locale} fixture station description for metadata.`,
    }])),
  };
}

async function missAndHit(path: string, language: string) {
  const miss = await renderer.renderStaticPage(path, origin);
  assert.equal(miss.language, language);
  assert.equal(miss.pageData.pageType, 'station');
  assert.equal(miss.pageData.redirectTo, undefined, 'the fixture locale must be genuinely eligible');
  assert.equal(miss.pageData.stationDbError, undefined);
  assert.equal(miss.pageData.stationIsJunk, false);
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0], miss);
  assert.equal(miss.pageData.seoTags, miss.seoTags);
  assert.equal(miss.pageData.stationEditorialPath, path);
  assert.equal(miss.pageData.additionalData.stationEditorialPath, path);
  assert.deepEqual(metadataFilters, [{ pageType: 'station_detail', routeKey: stationPatch.slug, language, status: 'published' }]);
  assert.ok(Object.isFrozen(miss) && Object.isFrozen(miss.seoTags));
  assert.ok(Object.isFrozen(miss.pageData) && Object.isFrozen(miss.pageData.additionalData));
  const serialized = JSON.stringify(miss);
  const reads = stationReads;
  const hit = await renderer.renderStaticPage(path, origin);
  assert.equal(hit, miss, 'cache HIT must reuse the finalized frozen page, not reapply metadata');
  assert.equal(cacheWrites.length, 1);
  assert.equal(metadataFilters.length, 1);
  assert.equal(stationReads, reads);
  assert.equal(JSON.stringify(hit), serialized);
  return [miss, hit];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));
const normalizeEntities = (html: string) => html.replace(/&#x27;/gi, '&#39;');

function expectedMetadata(editorial: ReviewedStationEditorial | null) {
  assert.ok(baseTags, 'the real base generator must have run');
  const expected = Object.fromEntries(fields.map(field => [field, metadata?.[field] || baseTags![field]]));
  if (editorial?.title) {
    expected.title = metadata?.title || editorial.title;
    expected.ogTitle = metadata?.ogTitle || expected.title;
    expected.twitterTitle = metadata?.twitterTitle || expected.title;
  }
  if (editorial?.metaDescription) {
    expected.description = metadata?.description || editorial.metaDescription;
    expected.ogDescription = metadata?.ogDescription || expected.description;
    expected.twitterDescription = metadata?.twitterDescription || expected.description;
  }
  return expected;
}

function assertSurfaces(page: StaticPageData, editorial: ReviewedStationEditorial | null) {
  const data = page.pageData;
  const expected = expectedMetadata(editorial);
  const head = normalizeEntities(renderer.generateHtmlHead(page.seoTags, page.language, page.translations, page.cleanPath,
    data.station, page.urlTranslations, data));
  const body = normalizeEntities(renderer.generateHtmlBody({ pageType: data.pageType, language: page.language,
    translations: page.translations, seoTags: page.seoTags, stationData: data.station,
    additionalData: data.additionalData, urlTranslations: page.urlTranslations, cleanPath: page.cleanPath }));
  const structuredData = renderer.generateStructuredData(page.seoTags, page.language, page.translations,
    page.cleanPath, data.station, page.urlTranslations, data);
  // Mirror the slim page-data response's serialization, not a fabricated set of SEO tags.
  const spa = JSON.parse(JSON.stringify({ language: page.language, cleanPath: page.cleanPath,
    seoTags: seoConfig.normalizeSeoTitleTags(page.seoTags), structuredData }));
  for (const field of fields) {
    assert.equal(page.seoTags[field], expected[field], field);
    assert.equal(data.seoTags[field], expected[field], `returned pageData ${field}`);
    const title = field === 'title' || field.endsWith('Title');
    assert.equal(spa.seoTags[field], title ? seoConfig.normalizeSeoTitle(expected[field]) : expected[field], `SPA ${field}`);
  }
  assert.ok(head.includes(`<title>${escapeHtml(seoConfig.normalizeSeoTitle(expected.title))}</title>`));
  for (const [attribute, name, field] of [
    ['name', 'description', 'description'], ['property', 'og:title', 'ogTitle'],
    ['property', 'og:description', 'ogDescription'], ['name', 'twitter:title', 'twitterTitle'],
    ['name', 'twitter:description', 'twitterDescription'],
  ] as const) {
    const value = field.endsWith('Title') ? seoConfig.normalizeSeoTitle(expected[field])
      : seoConfig.truncateAtWordBoundary(expected[field], 160);
    assert.ok(head.includes(`<meta ${attribute}="${name}" content="${escapeHtml(value)}">`), name);
  }
  assert.equal(spa.seoTags.canonical, page.seoTags.canonical);
  assert.equal(spa.seoTags.robots, page.seoTags.robots);
  assert.ok(head.includes(`<meta name="robots" content="${escapeHtml(page.seoTags.robots)}">`));
  assert.ok(head.includes(`<link rel="canonical" href="${escapeHtml(page.seoTags.canonical)}"`));
  const visible = editorial?.summary ?? selectStationVisibleDescription(data.station, page.language,
    seoConfig.getStationCountryName(data.station, 'en'));
  const joinedParagraphs = body.replace(/<\/?p(?:\s[^>]*)?>/g, ' ').replace(/\s+/g, ' ');
  assert.ok(joinedParagraphs.includes(escapeHtml(visible).replace(/\s+/g, ' ').trim()), 'the source HTML contains the chosen visible summary');
  assert.equal(body.includes('class="station-editorial"'), !!editorial);
  if (editorial) for (const section of editorial.sections) for (const paragraph of section.paragraphs) {
    assert.ok(body.includes(escapeHtml(paragraph)), 'source HTML includes the reviewed section');
  }
  const headSchemas = [...head.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const service = (schemas: Record<string, any>[]) => schemas.filter(item => item['@type'] === 'RadioBroadcastService');
  const expectedCount = page.seoTags.noIndex ? 0 : 1;
  for (const schemas of [headSchemas, structuredData.page, spa.structuredData.page]) {
    const services = service(schemas);
    assert.equal(services.length, expectedCount, 'SSR and SPA honor the same schema exclusion');
    if (expectedCount) assert.equal(services[0].description, visible, 'visible HTML and RadioBroadcastService describe the same station');
  }
}

test('approved data is present for en/de/tr rather than vacuously passing empty cohort loops', () => {
  assert.ok(REVIEWED_STATION_EDITORIALS.length > 0);
  for (const language of languages) firstApproved(language);
});

test('Virgin Radio UK uses a complete short title without truncating its country, preserving station identity', async () => {
  const editorial = REVIEWED_STATION_EDITORIALS.find(item => item.stationId === '69ffd89bda362ab542d50995');
  assert.ok(editorial);
  prepareStation(editorial);
  const name = ' VIRGIN RADIO UK: Rock\u2018n\u2019Roll Radio From The Top Of The Tower';
  stationPatch.name = name;
  stationPatch.country = 'The United Kingdom Of Great Britain And Northern Ireland';
  stationPatch.countryCode = 'GB';
  for (const page of await missAndHit(editorial.path, 'en')) {
    assert.equal(page.seoTags.title, 'Virgin Radio UK | Listen Live Online');
    assert.equal(page.pageData.station.name, name);
    assert.equal(page.seoTags.canonical, origin + editorial.path);
    assertSurfaces(page, editorial);
  }
});

const adminCases: { label: string; metadata: Administrator | null }[] = [
  { label: 'no administrator override', metadata: null },
  ...fields.map(field => ({ label: `independent administrator ${field}`, metadata: { [field]: `Published ${field} & override` } })),
  { label: 'administrator title and description together', metadata: { title: 'Published title & override', description: 'Published description & override.' } },
  { label: 'all six independent administrator fields together', metadata: Object.fromEntries(fields.map(field => [field, `Published ${field} & override`])) },
];

for (const language of languages) {
  for (const scenario of adminCases) test(`${language}: ${scenario.label} survives real rendering and frozen MISS/HIT`, async () => {
    const editorial = firstApproved(language);
    prepareStation(editorial);
    metadata = scenario.metadata;
    for (const page of await missAndHit(editorial.path, language)) {
      assert.equal(page.seoTags.canonical, origin + editorial.path);
      assert.equal(page.seoTags.robots, 'index, follow');
      assertSurfaces(page, editorial);
    }
  });

  for (const scenario of [
    { label: 'site restrictions cannot be cleared by custom false', robots: 'INDEX, NOINDEX, NOFOLLOW, noarchive, max-snippet:42',
      metadata: { noIndex: false, noFollow: false }, expected: 'noindex, nofollow, noarchive, max-snippet:42', excluded: true },
    { label: 'custom noindex', metadata: { noIndex: true, noFollow: false }, expected: 'noindex, follow', excluded: true },
    { label: 'custom nofollow', metadata: { noIndex: false, noFollow: true }, expected: 'index, nofollow', excluded: false },
    { label: 'custom noindex and nofollow', metadata: { noIndex: true, noFollow: true }, expected: 'noindex, nofollow', excluded: true },
  ]) test(`${language}: ${scenario.label} remains authoritative over editorial defaults`, async () => {
    const editorial = firstApproved(language);
    prepareStation(editorial);
    baseRobots = scenario.robots;
    metadata = { ...scenario.metadata, title: 'Published restricted station title' };
    for (const page of await missAndHit(editorial.path, language)) {
      assert.equal(page.seoTags.robots, scenario.expected);
      assert.equal(page.seoTags.noIndex === true, scenario.excluded);
      assert.equal(page.seoTags.noFollow === true, scenario.expected.includes('nofollow'));
      if (scenario.excluded) assert.deepEqual(page.seoTags.hreflangs, []);
      assertSurfaces(page, editorial);
    }
  });

  test(`${language}: an alternate route spelling does not acquire reviewed metadata, body or schema copy`, async () => {
    const editorial = firstApproved(language);
    prepareStation(editorial);
    const path = `/${language}/stations/${editorial.slug}`;
    assert.ok(!REVIEWED_STATION_EDITORIALS.some(item => item.path === path), 'choose an actual unreviewed route spelling');
    for (const page of await missAndHit(path, language)) assertSurfaces(page, null);
  });

  test(`${language}: a stored slug alias redirects without decorating the alias response`, async () => {
    const editorial = firstApproved(language);
    prepareStation(editorial);
    aliasSlug = `unreviewed-${editorial.slug}`;
    const path = `/${language}/${URL_TRANSLATIONS[language]?.station || 'station'}/${aliasSlug}`;
    const page = await renderer.renderStaticPage(path, origin);
    assert.equal(page.pageData.redirectTo, editorial.path);
    assert.deepEqual(page.seoTags, {});
    assert.equal(page.pageData.stationEditorialPath, undefined);
    assert.equal(cacheWrites.length, 0);
    assert.equal(metadataFilters.length, 0);
  });

  test(`${language}: another eligible locale does not inherit this editorial`, async () => {
    const editorial = firstApproved(language);
    const other = languages.find(locale => locale !== language && !REVIEWED_STATION_EDITORIALS.some(item =>
      item.path === `/${locale}/${URL_TRANSLATIONS[locale]?.station || 'station'}/${editorial.slug}`));
    assert.ok(other, 'the selected station needs an unreviewed eligible locale for this negative test');
    prepareStation(editorial, other);
    const path = `/${other}/${URL_TRANSLATIONS[other]?.station || 'station'}/${editorial.slug}`;
    for (const page of await missAndHit(path, other)) assertSurfaces(page, null);
  });

  test(`${language}: a different persisted ID at the exact slug cannot inherit an editorial`, async () => {
    const editorial = firstApproved(language);
    prepareStation(editorial);
    stationPatch._id = editorial.stationId === 'ffffffffffffffffffffffff' ? 'eeeeeeeeeeeeeeeeeeeeeeee' : 'ffffffffffffffffffffffff';
    for (const page of await missAndHit(editorial.path, language)) assertSurfaces(page, null);
  });
}

for (const slug of ['radyonne', '90-1-kpft']) {
  for (const scenario of adminCases) test(`${slug}: nonempty reviewed title/meta with ${scenario.label} reaches SSR and SPA on frozen MISS/HIT`, async () => {
    const editorial = REVIEWED_STATION_EDITORIALS.find(item => item.slug === slug && item.language === 'en');
    assert.ok(editorial, `The approved registry must include the real ${slug} record`);
    assert.ok(editorial.title?.trim(), `${slug} must exercise the nonempty reviewed-title branch`);
    assert.ok(editorial.metaDescription?.trim(), `${slug} must exercise the nonempty reviewed-description branch`);
    prepareStation(editorial);
    metadata = scenario.metadata;
    for (const page of await missAndHit(editorial.path, editorial.language)) {
      assert.notEqual(baseTags?.title, editorial.title, 'the reviewed title must differ from the station fallback');
      assert.notEqual(baseTags?.description, editorial.metaDescription, 'the reviewed description must differ from the station fallback');
      const title = metadata?.title || editorial.title;
      const description = metadata?.description || editorial.metaDescription;
      assert.equal(page.seoTags.title, title, 'a description-only override retains the reviewed title');
      assert.equal(page.seoTags.description, description, 'a title-only override retains the reviewed description');
      assert.equal(page.pageData.seoTags.title, title);
      assert.equal(page.pageData.seoTags.description, description);
      assert.equal(page.seoTags.canonical, origin + editorial.path);
      assert.equal(page.seoTags.robots, 'index, follow');
      assertSurfaces(page, editorial);
    }
  });
}
