import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import * as seoConfig from '@workspace/seo-shared/seo-config';

const origin = 'https://themegaradio.com';
const pageCache = new Map<string, any>();
let cacheWrites: any[] = [];
let metadata: Record<string, any> | null = null;
let metadataReads = 0;
let stationPatch: Record<string, any> = {};
let baseRobots: string | undefined;
let stationFails = false;
let qualificationFails = false;
let metadataFails = false;
let genreCountFails = false;
let genreCount = 20;
const station = {
  _id: 'fixture-station', name: 'Fixture FM', slug: 'fixture-fm', country: 'Germany',
  url: 'https://stream.example.invalid/live', tags: 'pop', noIndex: false, lastCheckOk: true,
};

mock.module('@workspace/seo-shared/seo-config', { namedExports: {
  ...seoConfig,
  generateSeoTags: (...args: Parameters<typeof seoConfig.generateSeoTags>) => {
    const tags = seoConfig.generateSeoTags(...args);
    if (baseRobots !== undefined) tags.robots = baseRobots;
    return tags;
  },
} });
mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => { throw new Error('Real database access is forbidden in this unit test'); },
} });
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pageCache.get(key),
  setPageData: (key: string, value: any) => {
    Object.freeze(value.seoTags);
    Object.freeze(value.pageData);
    pageCache.set(key, Object.freeze(value));
    cacheWrites.push(value);
  },
  getTranslations: () => ({}),
  getUrlTranslations: async () => new Map<string, string>(),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  findOne: async () => {
    if (stationFails) throw new Error('Temporary station read failure');
    return { ...station, ...stationPatch };
  },
  find: async () => [], count: async () => 0, groupCount: async () => [],
  findMergedAlias: async () => null,
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: {
  pgSeoMetadata: async () => {
    metadataReads++;
    if (metadataFails) throw new Error('Temporary metadata read failure');
    return metadata;
  },
} });
mock.module('../src/data/postgres-taxonomy-store', { namedExports: {
  pgStoredGenreBySlug: async () => {
    if (genreCountFails) throw new Error('Temporary genre count failure');
    return { stationCount: genreCount };
  },
} });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => {
    if (qualificationFails) throw new Error('Temporary qualification failure');
    return ['en', 'tr'];
  },
} });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();

beforeEach(() => {
  pageCache.clear(); cacheWrites = []; metadata = null; metadataReads = 0;
  stationPatch = {}; baseRobots = undefined;
  stationFails = false; qualificationFails = false; metadataFails = false;
  genreCountFails = false; genreCount = 20;
});

async function missAndHit(path: string) {
  const miss = await renderer.renderStaticPage(path, origin);
  assert.equal(cacheWrites.length, 1, 'the final metadata is written once on a renderer cache MISS');
  assert.equal(cacheWrites[0], miss);
  assert.equal(miss.pageData.seoTags, miss.seoTags);
  assert.equal(metadataReads, 1);
  const hit = await renderer.renderStaticPage(path, origin);
  assert.equal(hit, miss, 'a renderer cache HIT reuses the already-finalized, frozen result');
  assert.equal(cacheWrites.length, 1);
  assert.equal(metadataReads, 1, 'cache HIT does not re-read or mutate metadata');
  return [miss, hit];
}

function assertDirectives(page: any, robots: string, noIndex: boolean) {
  const tags = page.seoTags;
  assert.equal(tags.robots, robots);
  assert.equal(tags.noIndex === true, noIndex, 'the HTTP-layer boolean and robots string agree');
  if (page.pageData.seoTags) assert.equal(page.pageData.seoTags, tags);
  const spa = JSON.parse(JSON.stringify({ seoTags: tags }));
  assert.equal(spa.seoTags.robots, robots);
  assert.equal(spa.seoTags.noIndex === true, noIndex);
  const head = renderer.generateHtmlHead(tags, page.language, page.translations, page.cleanPath,
    page.pageData.station, page.urlTranslations, page.pageData);
  assert.ok(head.includes(`<meta name="robots" content="${robots}">`));
  if (noIndex) {
    assert.deepEqual(tags.hreflangs, []);
    assert.deepEqual(tags.ogLocaleAlternates ?? [], []);
    assert.doesNotMatch(head, /<link rel="alternate" hreflang=/);
    assert.doesNotMatch(head, /property="og:locale:alternate"/);
  } else {
    assert.ok(tags.hreflangs.length > 0, 'indexable pages retain their language cluster');
  }
}

for (const path of ['/en', '/en/station/fixture-fm', '/en/genres/pop', '/en/about', '/en/users']) {
  for (const noIndex of [undefined, false, true]) {
    test(`${path}: custom noIndex=${noIndex} agrees across final SSR, SPA and renderer cache MISS/HIT`, async () => {
      metadata = noIndex === undefined ? null : { noIndex };
      for (const page of await missAndHit(path)) {
        assertDirectives(page, noIndex ? 'noindex, follow' : 'index, follow', noIndex === true);
        assert.equal(page.seoTags.canonical, origin + path);
      }
    });
  }
}

for (const path of ['/en/profile/settings', '/en/users/private-listener', '/en/search', '/en/recommendations']) {
  test(`${path}: custom false cannot remove a private/search/personalized exclusion`, async () => {
    metadata = { noIndex: false, noFollow: false };
    for (const page of await missAndHit(path)) assertDirectives(page, 'noindex, follow', true);
  });
}

for (const [slug, patch, gone] of [
  ['fixture-fm', { noIndex: true, manualEditFields: { noIndex: true } }, true],
  ['fixture-fm', { noIndex: true, lastCheckOk: false }, false],
  ['1234', { slug: '1234' }, false],
  ['-1234', { slug: '-1234' }, true],
] as const) {
  test(`${slug}/${JSON.stringify(patch)}: custom false cannot remove a station quality decision`, async () => {
    stationPatch = patch;
    metadata = { noIndex: false };
    for (const page of await missAndHit(`/en/station/${slug}`)) {
      assertDirectives(page, 'noindex, follow', true);
      assert.equal(page.pageData.stationIsJunk, gone);
      assert.equal(page.pageData.station.noIndex, 'noIndex' in patch ? patch.noIndex : false, 'stored decisions are not mutated');
    }
  });
}

test('custom false cannot remove a thin genre exclusion', async () => {
  genreCount = 2; metadata = { noIndex: false };
  for (const page of await missAndHit('/en/genres/pop')) assertDirectives(page, 'noindex, follow', true);
});

for (const noIndex of [false, true]) {
  test(`custom noFollow survives with noIndex=${noIndex}`, async () => {
    metadata = { noIndex, noFollow: true };
    for (const page of await missAndHit('/en/about')) {
      assertDirectives(page, `${noIndex ? 'noindex' : 'index'}, nofollow`, noIndex);
      assert.equal(page.seoTags.noFollow, true);
    }
  });
}

for (const path of ['/en/about', '/en/recommendations', '/en/station/fixture-fm']) {
  test(`${path}: explicit nofollow and other robots limits survive the final guards`, async () => {
    baseRobots = 'INDEX, NOFOLLOW, noarchive, max-snippet:42';
    metadata = { noIndex: true, noFollow: false };
    if (path.includes('/station/')) stationPatch = { noIndex: true, manualEditFields: { noIndex: true } };
    for (const page of await missAndHit(path)) {
      assertDirectives(page, 'noindex, nofollow, noarchive, max-snippet:42', true);
      assert.equal(page.seoTags.noFollow, true);
    }
  });
}

for (const robots of ['NOINDEX, follow', 'none']) {
  test(`restrictive robots token ${robots} cannot be cleared by custom false`, async () => {
    baseRobots = robots; metadata = { noIndex: false, noFollow: false };
    for (const page of await missAndHit('/en/about')) {
      assertDirectives(page, robots === 'none' ? 'noindex, nofollow' : 'noindex, follow', true);
    }
  });
}

for (const failure of ['station', 'qualification'] as const) {
  test(`${failure} failure remains retryable, uncached, and never becomes a permanent noindex`, async () => {
    stationFails = failure === 'station'; qualificationFails = failure === 'qualification';
    const failed = await renderer.renderStaticPage('/en/station/fixture-fm', origin);
    assert.equal(failed.pageData.stationDbError, true);
    assert.equal(failed.pageData.stationIsJunk, false);
    assert.notEqual(failed.seoTags.noIndex, true);
    assert.equal(failed.seoTags.robots, 'index, follow');
    assert.equal(cacheWrites.length, 0);
    stationFails = false; qualificationFails = false;
    const recovered = await renderer.renderStaticPage('/en/station/fixture-fm', origin);
    assert.equal(recovered.pageData.stationDbError, undefined);
    assertDirectives(recovered, 'index, follow', false);
    assert.equal(cacheWrites.length, 1);
  });
}

test('a metadata lookup error does not invent an exclusion', async () => {
  metadataFails = true;
  for (const page of await missAndHit('/en/about')) assertDirectives(page, 'index, follow', false);
});

test('missing genre-count evidence does not turn a whitelisted category into noindex', async () => {
  genreCountFails = true;
  for (const page of await missAndHit('/en/genres/pop')) assertDirectives(page, 'index, follow', false);
});

test('real invalid catalogue pages remain noindex/404 data and never enter the page cache', async () => {
  const page = await renderer.renderStaticPage('/en/stations?page=0', origin);
  assert.equal(page.pageData.httpNotFound, true);
  assertDirectives(page, 'noindex, follow', true);
  assert.equal(cacheWrites.length, 0);
  assert.equal(metadataReads, 0);
});
