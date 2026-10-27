import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import express from 'express';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildLocalizedUrl } from '../src/seo/url-helpers';
import { markSeoTemporarilyUnavailable } from '../src/seo/temporary-unavailable';
import { isStationDirectoryData, isStationDirectoryPath } from '@workspace/seo-shared/station-directory';

const cache = new Map<string, any>();
const writes: { key: string; options: any }[] = [];
let reads: any[][] = [], failure: Error | undefined, junk = false;
mock.module('../src/cache', { defaultExport: {
  get: async (key: string) => cache.get(key) ?? null,
  set: async (key: string, value: any, options: any) => { cache.set(key, value); writes.push({ key, options }); },
} });
mock.module('../src/data/postgres-localization-store', { namedExports: { pgLocalization: () => ({ getTranslations: async () => ({}) }) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  find: async () => assert.fail('A-Z must not use generic catalog find'),
  count: async () => assert.fail('A-Z must not use generic catalog count'),
}) } });
mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES] } });
mock.module('../src/data/postgres-az-station-store', { namedExports: { readAzStationPage: async (key: string, page: number, size: number) => {
  reads.push([key, page, size]);
  await new Promise(resolve => setImmediate(resolve));
  if (failure) throw failure;
  const prefix = key === '0-9' ? '9' : key;
  const all = Array.from({ length: 121 }, (_, n) => ({ _id: `${key}-${n}`, slug: `${prefix}-${junk ? 'test-feed-' : 'radio-'}${n}`,
    name: 'Real Fixture FM', url: 'https://fixture.invalid/live', isListVisible: true, noIndex: false }));
  return { docs: all.slice((page - 1) * size, page * size), total: all.length };
} } });
const { performanceCache, SEO_CACHE_NAMESPACE } = await import('../src/performance-cache');
mock.method(performanceCache, 'getUrlTranslations', async () => new Map());
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
beforeEach(() => {
  cache.clear(); writes.length = 0; reads = []; failure = undefined; junk = false;
  (performanceCache as any).pageDataCache.flushAll(); (performanceCache as any).seoHtmlCache.flushAll();
});
const domain = 'https://themegaradio.com';
const body = (page: any, lang: string) => renderer.generateHtmlBody({ pageType: 'stations', language: lang,
  translations: {}, additionalData: page.pageData.additionalData, seoTags: page.seoTags, urlTranslations: page.urlTranslations });

test('bounded directory DTO keeps the exact SSR selection, localized links, H1 and pagination in all14 languages', async () => {
  for (const lang of ACTIVE_SITEMAP_LANGUAGES) for (const key of ['a', 'z', '0-9']) {
    const base = buildLocalizedUrl(`/stations/${key}`, lang, undefined, new Map());
    const page = await renderer.renderStaticPage(base + '?page=2', domain);
    const directory = renderer.buildStationDirectoryData(page)!;
    assert.ok(isStationDirectoryData(directory));
    assert.equal(directory.currentPage, 2);
    assert.equal(directory.totalPages, 3);
    assert.equal(directory.stations.length, 60);
    assert.equal(directory.letters.length, 27);
    assert.equal(directory.pages.length, 3);
    assert.deepEqual(directory.stations.map(item => item.href), page.pageData.catalogStations.map((station: any) =>
      buildLocalizedUrl(`/station/${station.slug}`, lang, undefined, new Map())));
    assert.deepEqual(Object.keys(directory.stations[0]).sort(), ['alt', 'href', 'logoUrl', 'name']);
    assert.ok(!JSON.stringify(directory).includes('https://fixture.invalid/live'));
    assert.ok(body(page, lang).includes(`<h1>${directory.h1}</h1>`));
    assert.deepEqual(directory.pages.map(item => [item.href, item.rel]), [[base, 'prev'], [base + '?page=2', undefined], [base + '?page=3', 'next']]);
  }
});

test('directory projection cannot turn errors, missing results or detail paths into a successful list', async () => {
  const source = await renderer.renderStaticPage('/en/stations/z', domain);
  assert.ok(renderer.buildStationDirectoryData(source));
  for (const patch of [{ stationDbError: true }, { hubReadFailed: true }, { httpNotFound: true },
    { catalogStations: undefined }, { catalogStations: Array(61).fill(source.pageData.catalogStations[0]) }]) {
    assert.equal(renderer.buildStationDirectoryData({ ...source, pageData: { ...source.pageData, ...patch } }), undefined);
  }
  for (const cleanPath of ['/radios', '/station/z-fm', '/stations/z-fm', '/stations/z/extra']) {
    assert.equal(isStationDirectoryPath(cleanPath), false);
    assert.equal(renderer.buildStationDirectoryData({ ...source, cleanPath }), undefined);
  }
  for (const cleanPath of ['/stations', '/station/z', '/stations/z', '/stations/0-9']) assert.ok(isStationDirectoryPath(cleanPath));
  const page51 = renderer.buildStationDirectoryData({ ...source, pageData: { ...source.pageData, catalogPage: 51, catalogTotalPages: 1000 } })!;
  assert.equal(page51.currentPage, 51);
  assert.ok(page51.pages.length <= 50);
  assert.ok(page51.pages.some(item => item.page === 50 && item.rel === 'prev'));
  assert.ok(page51.pages.some(item => item.page === 52 && item.rel === 'next'));
});

test('Z/digits are nonempty with pagination; A/M and localized canonical/hreflang keep first/middle/last membership', async () => {
  for (const key of ['a', 'm', 'z', '0-9']) for (const lang of ['en', 'tr', 'de']) {
    const base = buildLocalizedUrl(`/stations/${key}`, lang, undefined, new Map());
    for (const [n, expected] of [[1, 60], [2, 60], [3, 1]]) {
      const query = n === 1 ? '' : `?page=${n}`;
      const page = await renderer.renderStaticPage(base + query, domain);
      assert.equal(page.pageData.catalogStations.length, expected);
      assert.equal(page.pageData.catalogTotalPages, 3);
      assert.equal(page.pageData.httpNotFound, undefined); assert.equal(page.pageData.stationDbError, undefined);
      assert.equal(page.seoTags.canonical, domain + base + query);
      assert.ok(page.seoTags.hreflangs.length >= 14);
      assert.ok(page.seoTags.hreflangs.every((link: any) => query ? link.url.endsWith(query) : !link.url.includes('?')));
      const html = body(page, lang);
      assert.match(html, /class="pagination"/);
      assert.ok(html.includes(`href="${base}${n === 1 ? '?page=2' : ''}"`), `localized pagination links: ${key}/${lang}/${n}: ${html.match(/<nav class="pagination"[\s\S]*?<\/nav>/)?.[0]}`);
      const slug = page.pageData.catalogStations[0].slug;
      assert.ok(html.includes(`href="${buildLocalizedUrl(`/station/${slug}`, lang, undefined, new Map())}"`));
    }
  }
  assert.ok(reads.every(([, , size]) => size === 60));
});

test('beyond-last and huge are 404 evidence, invalid pages never call the reader', async () => {
  for (const key of ['z', '0-9']) for (const page of [4, Number.MAX_SAFE_INTEGER]) {
    const result = await renderer.renderStaticPage(`/en/stations/${key}?page=${page}`, domain);
    assert.equal(result.pageData.httpNotFound, true); assert.equal(result.pageData.stationDbError, undefined);
    assert.equal(result.seoTags.noIndex, true); assert.deepEqual(result.seoTags.hreflangs, []);
  }
  const before = reads.length;
  for (const page of ['', '0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992', '2junk', '2&page=3']) {
    assert.equal((await renderer.renderStaticPage(`/en/stations/z?page=${page}`, domain)).pageData.httpNotFound, true);
  }
  assert.equal(reads.length, before);
  const leadingZero = await renderer.renderStaticPage('/en/stations/z?page=02', domain);
  assert.equal(leadingZero.pageData.catalogPage, 2);
  assert.equal(leadingZero.pageData.httpNotFound, undefined);
  assert.equal(renderer.buildStationDirectoryData(leadingZero)?.currentPage, 2);
});

test('real public cache/page cache reuse, 60s deadline and single-flight survive language aliases and expiry', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const urls = ['/en/stations/z', '/tr/istasyonlar/z', '/de/sender/z'];
  const pages = await Promise.all(urls.map(url => renderer.renderStaticPage(url, domain)));
  assert.ok(pages.every(page => page.pageData.catalogStations.length === 60)); assert.equal(reads.length, 1);
  assert.equal(writes.length, 1); assert.equal(writes[0].options.ttl, 60);
  assert.match(writes[0].key, /az-index:z:1$/);
  assert.equal(cache.get(writes[0].key).expiresAt, now + 60_000);
  const pageKey = `page:${SEO_CACHE_NAMESPACE}:${urls[0]}`;
  assert.equal((performanceCache as any).pageDataCache.getTtl(pageKey), now + 60_000);
  now += 59_000;
  await renderer.renderStaticPage(urls[0], domain); assert.equal(reads.length, 1);
  now += 1_001;
  await Promise.all(urls.map(url => renderer.renderStaticPage(url, domain)));
  assert.equal(reads.length, 2); assert.equal(writes.length, 2);
});

test('missing-index and database errors are uncached retryable503, with GET/HEAD recovery through the existing response helper', async () => {
  const app = express();
  app.use(async (req, res) => {
    const page = await renderer.renderStaticPage(req.originalUrl, domain);
    if (page.pageData.stationDbError) markSeoTemporarilyUnavailable(res);
    else if (page.pageData.httpNotFound) res.status(404);
    res.send(body(page, 'en'));
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/en/stations/z`;
    for (const code of ['AZ_INDEX_NOT_READY', '57014', 'ECONNRESET']) {
      failure = Object.assign(new Error('temporary data failure'), { code, retryable: true });
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(url, { method });
        assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '60');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('x-robots-tag'), null);
        if (method === 'HEAD') assert.equal(await response.text(), '');
        assert.equal((performanceCache as any).pageDataCache.keys().length, 0); assert.equal(cache.size, 0);
      }
    }
    failure = undefined;
    const response = await fetch(url); assert.equal(response.status, 200);
    assert.match(await response.text(), /\/en\/station\/z-radio-0/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('existing post-junk count/render mismatch remains explicit: no silent SQL eligibility or count policy change', async () => {
  junk = true;
  const first = await renderer.renderStaticPage('/en/stations/z', domain);
  assert.equal(first.pageData.catalogStations.length, 0); assert.equal(first.pageData.catalogTotalPages, 3);
  assert.equal(first.pageData.httpNotFound, undefined); assert.notEqual(first.seoTags.noIndex, true);
  assert.ok(!body(first, 'en').includes('class="pagination"'));
  const second = await renderer.renderStaticPage('/en/stations/z?page=2', domain);
  assert.equal(second.pageData.httpNotFound, true);
  assert.equal(second.pageData.catalogTotalPages, 3);
});
