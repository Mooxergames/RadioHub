import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { setDatabaseUrlTranslations, URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

const pageCache = new Map<string, any>();
const fixtures = new Map<string, any>();
let reads: string[] = [];
let idResult: any = null;
let mergedAlias: any = null;
let qualificationFails = false;
let qualificationFailuresRemaining = 0;
let qualifiedLanguages: string[] = [...ACTIVE_SITEMAP_LANGUAGES];
let routeTranslations = new Map<string, string>();
let customMetadata: any = null;
const base = {
  _id: 'source-id', name: 'Original Radio', slug: 'duplicate-fm', noIndex: true,
  url: 'https://stream.example.invalid/live', country: 'Germany', tags: 'rock',
  lastCheckOk: true, redirectToSlug: 'canonical-fm',
};
const destination = {
  ...base, _id: 'target-id', slug: 'canonical-fm', noIndex: false, redirectToSlug: null,
  descriptions: Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(lang => [lang,
    { full: `Station information for ${lang}`, meta: `Station summary for ${lang}` }])),
};

mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pageCache.get(key),
  setPageData: (key: string, value: any) => pageCache.set(key, value),
  getTranslations: () => ({}),
  getUrlTranslations: async () => routeTranslations,
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  findOne: async (query: any) => {
    const key = query.slug ? `slug:${query.slug}` : `alias:${query.slugAliases}`;
    reads.push(key);
    const value = fixtures.get(key);
    return typeof value === 'function' ? value() : value ?? null;
  },
  findById: async (id: string) => { reads.push(`id:${id}`); return typeof idResult === 'function' ? idResult() : idResult; },
  findMergedAlias: async () => mergedAlias,
  find: async () => [], count: async () => 0, groupCount: async () => [],
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => customMetadata } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => {
    if (qualificationFails || qualificationFailuresRemaining > 0) {
      qualificationFailuresRemaining = Math.max(0, qualificationFailuresRemaining - 1);
      throw new Error('temporary qualification outage');
    }
    return qualifiedLanguages;
  },
} });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
const sourceUrl = '/en/station/duplicate-fm';

beforeEach(() => {
  pageCache.clear(); fixtures.clear(); reads = []; idResult = null;
  mergedAlias = null; qualificationFails = false; qualifiedLanguages = [...ACTIVE_SITEMAP_LANGUAGES];
  qualificationFailuresRemaining = 0;
  routeTranslations = new Map(); customMetadata = null;
  setDatabaseUrlTranslations(new Map());
  fixtures.set('slug:duplicate-fm', { ...base });
  fixtures.set('slug:canonical-fm', { ...destination });
});

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: an exact duplicate redirects once to a verified final localized destination`, async () => {
    const detail = URL_TRANSLATIONS[language]?.station || 'station';
    const input = `/${language}/${detail}/${base.slug}`;
    const result = await renderer.renderStaticPage(input, 'https://themegaradio.com');
    assert.equal(decodeURI(result.pageData.redirectTo), `/${language}/${detail}/${destination.slug}`);
    assert.equal(result.pageData.stationIsJunk, undefined);
    assert.deepEqual(reads, ['slug:duplicate-fm', 'slug:canonical-fm']);
    const final = await renderer.renderStaticPage(result.pageData.redirectTo, 'https://themegaradio.com');
    assert.equal(final.pageData.station?._id, destination._id);
    assert.equal(final.pageData.redirectTo, undefined);
    assert.equal(final.pageData.notFound, false);
    assert.equal(final.pageData.stationIsJunk, false);
    assert.notEqual(final.seoTags.noIndex, true);
  });
}

for (const [reason, targetSlug, patch] of [
  ['missing destination', 'canonical-fm', null],
  ['excluded destination', 'canonical-fm', { noIndex: true }],
  ['legacy offline exclusion', 'canonical-fm', { noIndex: true, lastCheckOk: false }],
  ['unset indexability', 'canonical-fm', { noIndex: undefined }],
  ['null indexability', 'canonical-fm', { noIndex: null }],
  ['missing stream', 'canonical-fm', { url: '' }],
  ['stored codec duplicate', 'canonical-fm-aac', { noIndex: true }],
  ['test feed', 'canonical-test-stream', {}],
  ['numeric slug', '12345', {}],
  ['negative numeric slug', '-12345', {}],
  ['mismatched exact identity', 'canonical-fm', { slug: 'unrelated-fm' }],
  ['cycle back to source', 'canonical-fm', { redirectToSlug: 'duplicate-fm' }],
  ['destination self-cycle', 'canonical-fm', { redirectToSlug: 'canonical-fm' }],
  ['incoming redirect chain', 'canonical-fm', { redirectToSlug: 'third-fm' }],
] as const) {
  test(`direct redirect rejects ${reason} instead of promoting an invalid target`, async () => {
    fixtures.set('slug:duplicate-fm', { ...base, redirectToSlug: targetSlug });
    fixtures.delete('slug:canonical-fm');
    if (patch) fixtures.set(`slug:${targetSlug}`, { ...destination, slug: targetSlug, ...patch });
    const result = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, undefined);
    assert.equal(result.pageData.stationIsJunk, true);
    assert.equal(result.pageData.notFound, undefined, 'use the existing gone response, not missing-station handling');
    assert.equal(result.pageData.stationDbError, undefined);
    assert.equal(result.seoTags.noIndex, true);
    assert.deepEqual(reads, ['slug:duplicate-fm', `slug:${targetSlug}`], 'never chase chains or discover replacement targets');
    assert.equal(pageCache.size, 0);
  });
}

test('an indexable canonical may carry a format label without becoming a rejected redirect target', async () => {
  fixtures.set('slug:duplicate-fm', { ...base, redirectToSlug: 'canonical-fm-aac' });
  fixtures.set('slug:canonical-fm-aac', { ...destination, slug: 'canonical-fm-aac' });
  const result = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm-aac');
  assert.equal(result.pageData.stationIsJunk, undefined);
});

test('a self-redirect cannot fall through into another redirect to the same URL', async () => {
  fixtures.set('slug:duplicate-fm', { ...base, noIndex: false, redirectToSlug: base.slug });
  const result = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, undefined);
  assert.equal(result.pageData.stationIsJunk, true);
  assert.equal(result.seoTags.noIndex, true);
  assert.equal(pageCache.size, 0);
});

test('an ID-resolved source cannot redirect back to the incoming identifier', async () => {
  const id = '0123456789abcdef01234567';
  idResult = { ...base, _id: id, redirectToSlug: id };
  const result = await renderer.renderStaticPage(`/en/station/${id}`, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, undefined);
  assert.equal(result.pageData.stationIsJunk, true);
  assert.equal(result.seoTags.noIndex, true);
  assert.deepEqual(reads, [`slug:${id}`, `alias:${id}`, `id:${id}`]);
});

for (const value of [true, {}, 123]) {
  test(`a malformed ${typeof value} redirect value is rejected without a database query`, async () => {
    fixtures.set('slug:duplicate-fm', { ...base, redirectToSlug: value });
    const result = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, undefined);
    assert.equal(result.pageData.stationIsJunk, true);
    assert.equal(result.pageData.stationDbError, undefined);
    assert.deepEqual(reads, ['slug:duplicate-fm']);
  });
}

for (const slug of ['station', 'sta']) {
  test(`source slug ${slug} never replaces the station route prefix`, async () => {
    fixtures.set(`slug:${slug}`, { ...base, slug });
    const result = await renderer.renderStaticPage(`/de/sender/${slug}`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, '/de/sender/canonical-fm');
  });
}

test('a retained offline destination remains valid when it is explicitly indexable', async () => {
  fixtures.set('slug:canonical-fm', { ...destination, lastCheckOk: false });
  const result = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm');
  assert.deepEqual(reads, ['slug:duplicate-fm', 'slug:canonical-fm']);
});

test('an English-only canonical is reached in one hop from an ineligible localized copy or historical alias', async () => {
  fixtures.set('slug:canonical-fm', { ...destination, descriptions: { en: destination.descriptions.en } });
  for (const input of ['/ar/mahta/duplicate-fm', '/fr/station/duplicate-fm', '/ar/mahta/old-copy']) {
    fixtures.set('alias:old-copy', { ...base });
    const result = await renderer.renderStaticPage(input, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm');
    const final = await renderer.renderStaticPage(result.pageData.redirectTo, 'https://themegaradio.com');
    assert.equal(final.pageData.redirectTo, undefined);
    assert.notEqual(final.seoTags.noIndex, true);
  }
});

test('a target database outage is uncached and retryable, then recovers to a validated redirect', async () => {
  fixtures.set('slug:canonical-fm', () => { throw new Error('temporary target read outage'); });
  const failed = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
  assert.equal(failed.pageData.stationDbError, true, 'HTTP adapter turns this into 503/no-store/Retry-After');
  assert.equal(failed.pageData.stationIsJunk, false);
  assert.equal(failed.pageData.notFound, false);
  assert.equal(failed.pageData.redirectTo, undefined);
  assert.equal(pageCache.size, 0);
  fixtures.set('slug:canonical-fm', { ...destination });
  const recovered = await renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com');
  assert.equal(recovered.pageData.redirectTo, '/en/station/canonical-fm');
  assert.deepEqual(reads, ['slug:duplicate-fm', 'slug:canonical-fm', 'slug:duplicate-fm', 'slug:canonical-fm']);
});

test('an aborted target read propagates as a retryable render timeout without a cached redirect', async () => {
  fixtures.set('slug:canonical-fm', () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(renderer.renderStaticPage(sourceUrl, 'https://themegaradio.com'), /SEO_RENDER_TIMEOUT/);
  assert.equal(pageCache.size, 0);
});

const stationId = '0123456789abcdef01234567';
function setIdStation(patch: Record<string, any> = {}) {
  idResult = { ...destination, _id: stationId, ...patch };
  fixtures.set(`slug:${idResult.slug}`, idResult);
  return idResult;
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  for (const alias of ['station', 'sta']) {
    test(`${language}: cold SSR alias ${alias} builds a complete localized station path`, async () => {
      fixtures.set(`alias:${alias}`, { ...destination });
      const input = buildLocalizedUrl(`/station/${alias}`, language, undefined, routeTranslations);
      const expected = buildLocalizedUrl('/station/canonical-fm', language, undefined, routeTranslations);
      const result = await renderer.renderStaticPage(input, 'https://themegaradio.com');
      assert.equal(result.pageData.redirectTo, expected);
      const final = await renderer.renderStaticPage(expected, 'https://themegaradio.com');
      assert.equal(final.pageData.station._id, destination._id);
      assert.equal(final.pageData.redirectTo, undefined);
      assert.equal(final.seoTags.canonical, `https://themegaradio.com${expected}`);
    });
  }

  test(`${language}: ID fallback redirects once to the same qualified station and self-canonical slug`, async () => {
    setIdStation();
    const input = buildLocalizedUrl(`/station/${stationId}`, language, undefined, routeTranslations);
    const expected = buildLocalizedUrl('/station/canonical-fm', language, undefined, routeTranslations);
    const result = await renderer.renderStaticPage(`${input}?utm_source=a%26b`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, expected, 'HTTP adapter retains the raw query; canonical remains clean');
    assert.equal(result.pageData.stationDbError, undefined);
    assert.equal(result.pageData.stationIsJunk, false);
    assert.deepEqual(reads.slice(0, 4), [`slug:${stationId}`, `alias:${stationId}`, `id:${stationId}`, 'slug:canonical-fm']);
    const final = await renderer.renderStaticPage(expected, 'https://themegaradio.com');
    assert.equal(final.pageData.station._id, stationId);
    assert.equal(final.pageData.redirectTo, undefined);
    assert.equal(final.pageData.notFound, false);
    assert.notEqual(final.seoTags.noIndex, true);
    assert.equal(final.seoTags.canonical, `https://themegaradio.com${expected}`);
    assert.ok(final.seoTags.hreflangs.some((entry: any) => entry.lang === language && entry.url === final.seoTags.canonical));
  });

  test(`${language}: route-word station slugs resolve exactly instead of another translated identity`, async () => {
    for (const slug of ['profil', 'profile', 'discover', 'station', 'sta', 'station-xyz']) {
      fixtures.set(`slug:${slug}`, { ...destination, slug, _id: `owner-${slug}` });
      const input = buildLocalizedUrl(`/station/${slug}`, language, undefined, routeTranslations);
      const result = await renderer.renderStaticPage(input, 'https://themegaradio.com');
      assert.equal(result.pageData.station._id, `owner-${slug}`);
      assert.equal(result.pageData.redirectTo, undefined);
      assert.equal(result.seoTags.canonical, `https://themegaradio.com${input}`);
    }
  });
}

test('24-hex exact slugs and persisted/merged aliases always precede a different station ID', async () => {
  for (const kind of ['slug', 'alias', 'merged']) {
    pageCache.clear(); reads = []; mergedAlias = null; fixtures.delete(`slug:${stationId}`); fixtures.delete(`alias:${stationId}`);
    idResult = { ...destination, _id: stationId };
    const owner = { ...destination, _id: 'actual-owner', slug: kind === 'slug' ? stationId : 'canonical-fm' };
    if (kind === 'merged') mergedAlias = owner;
    else fixtures.set(`${kind}:${stationId}`, owner);
    fixtures.set('slug:canonical-fm', { ...owner, slug: 'canonical-fm' });
    const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.ok(!reads.includes(`id:${stationId}`));
    if (kind === 'slug') {
      assert.equal(result.pageData.station._id, 'actual-owner');
      assert.equal(result.pageData.redirectTo, undefined);
    } else assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm');
  }
});

test('ID-resolved duplicates keep the existing verified final gate, without an intermediate slug redirect', async () => {
  idResult = { ...base, _id: stationId };
  const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm');
  assert.deepEqual(reads, [`slug:${stationId}`, `alias:${stationId}`, `id:${stationId}`, 'slug:canonical-fm']);
});

for (const [reason, patch] of [
  ['missing', null], ['excluded', { noIndex: true }], ['unset indexability', { noIndex: undefined }],
  ['junk', { url: '' }], ['mismatched slug', { slug: 'unrelated-fm' }],
  ['cycle', { redirectToSlug: 'duplicate-fm' }], ['self-cycle', { redirectToSlug: 'canonical-fm' }],
  ['chain', { redirectToSlug: 'third-fm' }],
] as const) {
  test(`ID-resolved duplicate still rejects a ${reason} final target`, async () => {
    idResult = { ...base, _id: stationId };
    fixtures.set('slug:canonical-fm', patch ? { ...destination, ...patch } : null);
    const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, undefined);
    assert.equal(result.pageData.stationIsJunk, true);
    assert.equal(result.seoTags.noIndex, true);
    assert.equal(pageCache.size, 0);
  });
}

for (const [reason, patch, gone] of [
  ['manual exclusion', { noIndex: true, manualEditFields: { noIndex: true } }, true],
  ['test feed', { slug: 'canonical-test-stream' }, true],
  ['missing stream', { url: '' }, true],
  ['legacy noindex', { noIndex: true }, false],
  ['legacy offline noindex', { noIndex: true, lastCheckOk: false }, false],
  ['positive numeric', { slug: '1234' }, false],
  ['negative numeric', { slug: '-1234' }, true],
] as const) {
  test(`ID consolidation preserves ${reason} noindex/${gone ? 'gone' : 'information'} policy`, async () => {
    setIdStation(patch);
    const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, undefined);
    assert.equal(result.pageData.stationIsJunk, gone);
    assert.equal(result.seoTags.noIndex, true);
    assert.deepEqual(result.seoTags.hreflangs, []);
    assert.ok(!reads.includes(`slug:${idResult.slug}`), 'no target lookup before the exclusion gate');
  });
}

test('offline stream alone does not prevent a qualified ID from consolidating', async () => {
  setIdStation({ lastCheckOk: false });
  const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm');
});

test('missing ID remains notFound without a fabricated redirect', async () => {
  const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
  assert.equal(result.pageData.notFound, true);
  assert.equal(result.pageData.redirectTo, undefined);
});

for (const slug of ['', ' bad-fm', 'bad/fm', 'bad\\fm', 'bad?fm', 'bad#fm', 'bad%2Ffm',
  'bad\u0000fm', '.', '..', 'a', '0-9', stationId]) {
  test(`ID fallback never redirects to malformed, reserved or self slug ${JSON.stringify(slug)}`, async () => {
    setIdStation({ slug });
    // Force a real ID fallback even for a stored slug identical to the ID.
    fixtures.delete(`slug:${stationId}`);
    const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, undefined);
  });
}

for (const [reason, patch] of [
  ['source ID mismatch', { _id: 'another-owner' }],
  ['missing slug owner', null],
  ['different slug owner', { _id: 'another-owner' }],
  ['mismatched target slug', { slug: 'another-fm' }],
  ['noindex target', { noIndex: true }],
  ['target redirect chain', { redirectToSlug: 'third-fm' }],
] as const) {
  test(`ID consolidation rejects ${reason}`, async () => {
    const source = setIdStation(reason === 'source ID mismatch' ? patch! : {});
    if (reason !== 'source ID mismatch') fixtures.set('slug:canonical-fm', patch ? { ...source, ...patch } : null);
    const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, undefined);
  });
}

for (const reason of ['ID lookup', 'slug verification', 'qualification']) {
  test(`ID ${reason} outage is uncached/retryable with no redirect and recovers`, async () => {
    setIdStation();
    const source = idResult;
    if (reason === 'ID lookup') idResult = () => { throw new Error('temporary ID read outage'); };
    if (reason === 'slug verification') fixtures.set('slug:canonical-fm', () => { throw new Error('temporary slug read outage'); });
    if (reason === 'qualification') qualificationFails = true;
    const failed = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.equal(failed.pageData.stationDbError, true);
    assert.equal(failed.pageData.redirectTo, undefined);
    assert.equal(pageCache.size, 0);
    idResult = source; fixtures.set('slug:canonical-fm', source); qualificationFails = false;
    const recovered = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
    assert.equal(recovered.pageData.redirectTo, '/en/station/canonical-fm');
  });
}

test('ID slug-verification abort remains a retryable uncached timeout', async () => {
  setIdStation();
  fixtures.set('slug:canonical-fm', () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com'), /SEO_RENDER_TIMEOUT/);
  assert.equal(pageCache.size, 0);
});

test('even a first-read-only qualification error cannot publish or cache an ID redirect', async () => {
  setIdStation(); qualificationFailuresRemaining = 1;
  const failed = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
  assert.equal(failed.pageData.stationDbError, true);
  assert.equal(failed.pageData.redirectTo, undefined);
  assert.equal(pageCache.size, 0);
  const recovered = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
  assert.equal(recovered.pageData.redirectTo, '/en/station/canonical-fm');
});

test('ID fallback uses qualified EN in one hop for an ineligible language, never an unqualified EN target', async () => {
  setIdStation({ descriptions: { en: destination.descriptions.en } });
  qualifiedLanguages = ['en'];
  const result = await renderer.renderStaticPage(`/ar/mahta/${stationId}`, 'https://themegaradio.com');
  assert.equal(result.pageData.redirectTo, '/en/station/canonical-fm');
  pageCache.clear(); qualifiedLanguages = [];
  const unqualified = await renderer.renderStaticPage(`/ar/mahta/${stationId}`, 'https://themegaradio.com');
  assert.equal(unqualified.pageData.redirectTo, undefined);
});

test('Unicode canonical slug and custom DB station route preserve exact identity and hreflang parity', async () => {
  setIdStation({ slug: 'radyo-\u00e7a\u011fr\u0131' });
  routeTranslations = new Map([['tr:station', 'radyo-kanali'], ['tr:profile', 'profil']]);
  setDatabaseUrlTranslations(routeTranslations);
  const result = await renderer.renderStaticPage(`/tr/radyo-kanali/${stationId}`, 'https://themegaradio.com');
  const expected = '/tr/radyo-kanali/radyo-%C3%A7a%C4%9Fr%C4%B1';
  assert.equal(result.pageData.redirectTo, expected);
  const final = await renderer.renderStaticPage(expected, 'https://themegaradio.com');
  assert.equal(final.pageData.station._id, stationId);
  assert.equal(final.pageData.redirectTo, undefined);
  assert.equal(final.seoTags.canonical, `https://themegaradio.com${expected}`);
  assert.ok(final.seoTags.hreflangs.some((entry: any) => entry.lang === 'tr' && entry.url === final.seoTags.canonical));
});

test('cold aliases station/sta use the custom full route and exact Unicode canonical slug', async () => {
  const target = { ...destination, slug: 'radyo-\u00e7a\u011fr\u0131' };
  routeTranslations = new Map([['tr:station', 'radyo-kanali']]);
  setDatabaseUrlTranslations(routeTranslations);
  for (const alias of ['station', 'sta']) {
    fixtures.set(`alias:${alias}`, target);
    const result = await renderer.renderStaticPage(`/tr/radyo-kanali/${alias}`, 'https://themegaradio.com');
    assert.equal(result.pageData.redirectTo, '/tr/radyo-kanali/radyo-%C3%A7a%C4%9Fr%C4%B1');
  }
});

test('custom SEO noindex metadata cannot be bypassed by ID consolidation', async () => {
  setIdStation(); customMetadata = { noIndex: true };
  const result = await renderer.renderStaticPage(`/en/station/${stationId}`, 'https://themegaradio.com');
  assert.equal(result.seoTags.noIndex, true);
  assert.equal(result.pageData.redirectTo, undefined);
});
