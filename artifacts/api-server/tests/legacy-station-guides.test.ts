import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, mock, test } from 'node:test';
import express from 'express';
import { ACTIVE_SITEMAP_LANGUAGES, getLanguageFromPath, getRetiredLocaleFromPath } from '@workspace/seo-shared/seo-config';
import { performanceCache } from '../src/performance-cache';
import { canonicalUrlMiddleware } from '../src/middleware/canonical-url';
import { countryPrefixRedirectMiddleware } from '../src/middleware/country-prefix-redirect';
import { buildPublicSeoRouteMatchers, decodePublicSeoPath } from '../src/seo/public-route-matchers';
import { sendJunkGone } from '../src/seo/send-junk-gone';
import { markSeoTemporarilyUnavailable } from '../src/seo/temporary-unavailable';
import { LEGACY_STATION_GUIDES, isLegacyStationArticle } from '@workspace/seo-shared/legacy-station-guides';
import { LEGACY_COMBINED_GENRE_SLUG } from '@workspace/seo-shared/legacy-station-guide-routes';

const origin = 'https://themegaradio.com';
const radar = '/af/station/radar-4', rock = '/ar/mahta/rock-fm-23', oldRock = '/ar/station/rock-fm-23';
const owner = (slug: string, patch: Record<string, unknown> = {}) => ({
  _id: '68a8c482bd66579311ab2f5b', name: 'FM', slug, slugAliases: [] as string[],
  url: 'https://stream.example.invalid/live', lastCheckOk: true, noIndex: false,
  descriptions: Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(l => [l, { full: 'Local station article in ' + l, meta: 'Summary ' + l }])),
  ...patch,
});
type Row = ReturnType<typeof owner>;
let rows: Row[], mergeOwners: Map<string, Row>, failAt: string | undefined;
let genreAlias: string | undefined;
const lookups: string[] = [], pageCache = new Map<string, any>();
let renderer: InstanceType<typeof import('../src/seo-renderer').SeoRenderer>;
let server: Server;
const read = (kind: string, key: string) => {
  lookups.push(kind + ':' + key);
  if (kind === failAt) throw new Error('fixture: ' + kind + ' unavailable');
};
before(async () => {
  const genreStore = await import('../src/seo/genre-whitelist-store');
  mock.module('../src/seo/genre-whitelist-store', { namedExports: { ...genreStore,
    ensureGenreWhitelistFresh: async () => { read('genre', 'overrides'); },
  } });
  const genreWhitelist = await import('../src/seo/genre-whitelist');
  mock.module('../src/seo/genre-whitelist', { namedExports: { ...genreWhitelist,
    getCanonicalGenreSlug: (slug: string) => slug === LEGACY_COMBINED_GENRE_SLUG && genreAlias ? genreAlias : genreWhitelist.getCanonicalGenreSlug(slug),
  } });
  mock.method(performanceCache, 'getUrlTranslations', async () => new Map());
  mock.method(performanceCache, 'getTranslations', () => ({ nav_home: 'Home' }));
  mock.method(performanceCache, 'getPageData', (k: string) => pageCache.get(k));
  mock.method(performanceCache, 'setPageData', (k: string, v: unknown) => pageCache.set(k, v));
  mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
    findOne: async (q: Record<string, string>) => {
      if (Object.hasOwn(q, 'slug')) { read('slug', q.slug); return rows.find(r => r.slug === q.slug) ?? null; }
      if (Object.hasOwn(q, 'slugAliases')) { read('alias', q.slugAliases); return rows.find(r => r.slugAliases.includes(q.slugAliases)) ?? null; }
      if (Object.hasOwn(q, '_id')) return rows.find(r => r._id === q._id) ?? null;
      throw new Error('Unexpected fixture query: ' + JSON.stringify(q));
    },
    findMergedAlias: async (k: string) => { read('merge', k); return mergeOwners.get(k) ?? null; },
    findById: async (k: string) => rows.find(r => r._id === k) ?? null,
    find: async (q: Record<string, string> = {}) => {
      if (Object.hasOwn(q, 'slugAliases')) { read('aliasOwners', q.slugAliases); return rows.filter(r => r.slugAliases.includes(q.slugAliases)).slice(0, 2); }
      return [];
    }, count: async () => 0, groupCount: async () => [],
  }) } });
  mock.module('../src/data/postgres-content-store', { namedExports: {
    ...await import('../src/data/postgres-content-store'), pgSeoMetadata: async () => null,
  } });
  mock.module('../src/seo/qualified-languages', { namedExports: {
    ...await import('../src/seo/qualified-languages'), getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES],
  } });
  const { SeoRenderer } = await import('../src/seo-renderer');
  const { urlRedirectMiddleware } = await import('../src/url-redirect-middleware');
  const { registerSeoSitemapRoutes } = await import('../src/routes/seo-sitemap-routes');
  renderer = new SeoRenderer();
  const app = express(), matchers = buildPublicSeoRouteMatchers();
  app.use(countryPrefixRedirectMiddleware, canonicalUrlMiddleware, urlRedirectMiddleware);
  await registerSeoSitemapRoutes(app, { requireAdmin: (_req: unknown, res: express.Response) => res.sendStatus(403) }, { apiOnly: true });
  // Exercise the same renderer outputs as the web entry without booting a production service.
  app.use(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return void res.sendStatus(405);
    const decoded = decodePublicSeoPath(req.originalUrl);
    const path = getRetiredLocaleFromPath(req.path) ? '/en' + getLanguageFromPath(req.path).cleanPath : decoded;
    if (!decoded || !path || !Object.values(matchers).some(rx => rx.test(path))) return void res.sendStatus(404);
    const p = await renderer.renderStaticPage(req.originalUrl, origin), data = p.pageData;
    if (data?.stationDbError) { markSeoTemporarilyUnavailable(res); return void res.end(); }
    if (data?.redirectTo) return void res.redirect(301, data.redirectTo);
    if (data?.httpNotFound) return void res.sendStatus(404);
    if (data?.stationIsJunk || data?.notFound) return sendJunkGone(res);
    const head = renderer.generateHtmlHead(p.seoTags, p.language, p.translations, p.cleanPath, data?.station, p.urlTranslations, data);
    const body = renderer.generateHtmlBody({ pageType: data?.pageType, language: p.language, translations: p.translations,
      seoTags: p.seoTags, stationData: data?.station, additionalData: data?.additionalData, urlTranslations: p.urlTranslations, cleanPath: p.cleanPath });
    res.type('html').send('<!doctype html><html lang="' + p.language + '"><head>' + head + '</head><body>' + body + '</body></html>');
  });
  await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', resolve); server.once('error', reject); });
});
beforeEach(() => { rows = []; mergeOwners = new Map(); failAt = undefined; genreAlias = undefined; pageCache.clear(); lookups.length = 0; });
after(async () => { try {
  if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
} finally { mock.restoreAll(); } });

function get(path: string, method = 'GET'): Promise<{ status: number; body: string; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port, path, method,
      headers: { host: 'themegaradio.com', 'x-forwarded-proto': 'https' } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString('utf8'), location: res.headers.location }));
    });
    req.on('error', reject); req.end();
  });
}
const slim = (path: string) => get('/api/seo/page-data?slim=1&url=' + encodeURIComponent(path));
const render = (path: string) => renderer.renderStaticPage(path, origin);

for (const { path, language } of LEGACY_STATION_GUIDES) {
  test('true absence renders the exact editorial page and a slim ID: ' + path, async () => {
    const { getLegacyStationGuide } = await import('@workspace/seo-shared/legacy-station-guides');
    const expected = getLegacyStationGuide(path);
    assert.ok(expected);
    const page = await render(path);
    assert.equal(page.pageData?.pageType, 'legacy-guide');
    assert.equal(page.pageData?.legacyGuide?.id, expected.id);
    assert.equal(page.pageData?.additionalData?.legacyGuide?.id, expected.id);
    assert.ok(!page.pageData?.station && !page.pageData?.notFound && !page.pageData?.stationIsJunk);
    const slug = path.split('/').at(-1)!;
    if (!getLanguageFromPath(path).cleanPath.startsWith('/genres/')) {
      for (const kind of ['slug', 'merge', 'alias']) assert.ok(lookups.includes(kind + ':' + slug), kind + ' owner not checked');
    } else assert.ok(lookups.includes('genre:overrides'), 'genre ownership snapshot was not checked');
    assert.equal(page.language, language);
    const response = await get(path);
    assert.equal(response.status, 200); assert.equal(response.location, undefined);
    const [head, body] = response.body.split('</head>'); assert.ok(body);
    const canon = head.match(/<link\b[^>]*\brel="canonical"[^>]*>/gi) || [];
    assert.equal(canon.length, 1); assert.ok(canon[0].includes('href="' + origin + path + '"'));
    assert.equal((body.match(/<h1\b/g) || []).length, 1);
    assert.ok(body.includes(expected.title));
    if (isLegacyStationArticle(expected)) {
      assert.ok(expected.sections.length >= 2);
      for (const section of expected.sections) for (const paragraph of section.paragraphs) assert.ok(body.includes(paragraph));
      for (const source of expected.sources) assert.ok(body.includes(source.url.replaceAll('&', '&amp;')));
    } else {
      assert.ok(expected.choices.length >= 2);
      for (const c of expected.choices) assert.ok(body.includes(c.officialListen.url.replaceAll('&', '&amp;')), c.name);
    }
    assert.doesNotMatch(body, /<(?:audio|video)\b|id="station-bootstrap"|\/api\/(?:stream|player)(?:[/?"]|$)|id="station-player"/i);
    const jsonld = [...head.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(x => JSON.parse(x[1]));
    function types(v: unknown): string[] {
      if (!v || typeof v !== 'object') return [];
      if (Array.isArray(v)) return v.flatMap(types);
      const obj = v as Record<string, unknown>;
      return [obj['@type']].flat().filter((s): s is string => typeof s === 'string').concat(Object.values(obj).flatMap(types));
    }
    const allTypes = jsonld.flatMap(types);
    assert.ok(allTypes.some(s => ['CollectionPage', 'Article'].includes(s)), JSON.stringify(allTypes));
    assert.ok(!allTypes.some(s => ['RadioStation', 'RadioBroadcastService', 'ListenAction', 'AudioObject'].includes(s)));
    assert.ok(allTypes.includes(isLegacyStationArticle(expected) ? 'Article' : 'CollectionPage'));
    if (isLegacyStationArticle(expected)) assert.ok(!allTypes.includes('ItemList'));
    const h = await get(path, 'HEAD'); assert.equal(h.status, 200); assert.equal(h.body, '');
    const dto = await slim(path); assert.equal(dto.status, 200);
    const payload = JSON.parse(dto.body); assert.equal(payload.legacyGuideId, expected.id);
    assert.equal(payload.legacyGuide, undefined); assert.equal(payload.station, undefined);
  });
}

test('old Arabic spelling makes one localized hop to the real guide', async () => {
  for (const [oldPath, path] of [[oldRock, rock], ['/ar/station/quran-radio-3', '/ar/mahta/quran-radio-3']]) {
    const first = await get(oldPath); assert.equal(first.status, 301); assert.equal(first.location, path);
    const end = await get(first.location!); assert.equal(end.status, 200); assert.equal(end.location, undefined);
    assert.ok(end.body.includes('href="' + origin + path + '"'));
  }
});

test('unapproved locales, lookalike slugs and broken paths do not serve either guide', async () => {
  for (const p of ['/en/station/radar-4', '/de/sender/rock-fm-23', '/af/station/pre-radar-4',
    '/ar/mahta/rock-fm-23-extra', '/af/station/radar-4%2Fjunk', '/ar/mahta/%E0%A4%A',
    '/en/station/quran-radio-3', '/ar/mahta/quran-radio-30', '/en/station/channel-v-international',
    '/am/station/channel-v-international-2', '/hu/radio/1-210', '/am/station/disco-20']) {
    let response = await get(p);
    if (p === '/ar/mahta/%E0%A4%A' && response.status === 301) {
      assert.equal(response.location, '/ar/mahta/%E0%A4%a');
      response = await get(response.location!);
    }
    assert.ok([404, 410].includes(response.status), p + ': ' + response.status);
    assert.equal(response.location, undefined);
  }
});

for (const [reason, patch] of [
  ['healthy', {}], ['manual noindex', { noIndex: true, manualEditFields: { noIndex: true } }], ['test feed', { name: '彩条测试1' }],
] as const) {
  test('exact native owner beats both kinds of alias: ' + reason, async () => {
    const native = owner('radar-4', patch);
    rows = [native, owner('other', { _id: 'other', slugAliases: ['radar-4'] })]; mergeOwners.set('radar-4', rows[1]);
    const p = await render(radar); assert.notEqual(p.pageData?.pageType, 'legacy-guide');
    if (reason !== 'healthy') {
      assert.equal((await get(radar)).status, 410);
      const dto = await slim(radar); assert.equal(dto.status, 410); assert.ok(!JSON.parse(dto.body).legacyGuideId);
    } else {
      assert.equal(p.pageData?.station?._id, native._id);
      assert.equal((await get(radar)).status, 200);
      const dto = await slim(radar); assert.equal(dto.status, 200); assert.equal(JSON.parse(dto.body).legacyGuideId, null);
    }
  });
}

test('plural test path consolidates only after every ownership check misses', async () => {
  const response = await get('/hu/radios/1-21');
  assert.equal(response.status, 301); assert.equal(response.location, '/hu/radio/1-21');
  assert.equal((await get(response.location!)).status, 200);
  for (const kind of ['slug', 'merge', 'alias']) assert.ok(lookups.includes(kind + ':1-21'));
  for (const kind of ['slug', 'merge', 'alias']) {
    rows = []; mergeOwners.clear();
    const existing = owner(kind === 'slug' ? '1-21' : 'old-test', { name: '彩条测试1', noIndex: true,
      ...(kind === 'alias' ? { slugAliases: ['1-21'] } : {}),
    });
    rows.push(existing); if (kind === 'merge') mergeOwners.set('1-21', existing);
    for (const path of ['/hu/radio/1-21', '/hu/radios/1-21']) {
      const page = await render(path); assert.notEqual(page.pageData?.pageType, 'legacy-guide');
      assert.equal((await get(path)).status, 410);
    }
  }
  rows = []; mergeOwners.clear();
  for (const kind of ['slug', 'merge', 'alias']) {
    failAt = kind;
    for (const path of ['/hu/radio/1-21', '/hu/radios/1-21']) {
      assert.equal((await get(path)).status, 503);
      assert.equal((await slim(path)).status, 503);
    }
  }
});

const colorBarSource = (patch: Record<string, unknown> = {}) => owner('cai-tiao-ce-shi-1', {
  _id: '68a8c4a9bd66579311ab91d1', stationuuid: 'f557e499-a0d9-44c0-9eea-49c42364f78b',
  name: '彩条测试1', slugAliases: ['1-21'], noIndex: true, redirectToSlug: null,
  manualEditFields: { noIndex: true }, ...patch,
});

test('the reviewed excluded test alias hosts the tool without reviving its source', async () => {
  rows = [colorBarSource()];
  for (const method of ['GET', 'HEAD']) {
    const old = await get('/hu/radios/1-21', method);
    assert.equal(old.status, 301); assert.equal(old.location, '/hu/radio/1-21');
    const current = await get('/hu/radio/1-21', method); assert.equal(current.status, 200);
    if (method === 'GET') {
      assert.ok(current.body.includes('data-audio-test-root'));
      assert.ok(current.body.includes('href="' + origin + '/hu/radio/1-21"'));
      assert.doesNotMatch(current.body, /RadioStation|RadioBroadcastService|station-bootstrap/);
    }
  }
  const dto = await slim('/hu/radio/1-21'); assert.equal(dto.status, 200);
  assert.equal(JSON.parse(dto.body).legacyGuideId, 'color-bars-test');
  assert.equal(JSON.parse(dto.body).station, undefined);
  assert.ok(lookups.includes('aliasOwners:1-21'));
  assert.equal((await get('/en/station/cai-tiao-ce-shi-1')).status, 410);
  assert.equal(rows[0].noIndex, true); assert.deepEqual(rows[0].manualEditFields, { noIndex: true });
});

for (const patch of [
  { _id: 'other' }, { stationuuid: 'other' }, { name: 'Other' }, { slug: 'other' },
  { noIndex: false }, { redirectToSlug: 'other' }, { redirectToSlug: undefined },
  { manualEditFields: {} }, { manualEditFields: { noIndex: true, descriptions: true } },
  { automaticNoIndex: {} }, { stationPageMode: 'information' },
]) {
  test('the reviewed source exception rejects policy or identity drift: ' + JSON.stringify(patch), async () => {
    rows = [colorBarSource(patch)];
    for (const path of ['/hu/radio/1-21', '/hu/radios/1-21']) {
      const page = await render(path); assert.notEqual(page.pageData?.pageType, 'legacy-guide');
      assert.equal((await get(path)).status, 410);
      assert.ok(!JSON.parse((await slim(path)).body).legacyGuideId);
    }
  });
}

test('native, merged and competing alias owners outrank the reviewed test source', async () => {
  for (const kind of ['native', 'merge', 'conflict']) {
    rows = [colorBarSource()]; mergeOwners.clear();
    const live = owner(kind === 'native' ? '1-21' : 'live', { _id: 'live',
      ...(kind === 'conflict' ? { slugAliases: ['1-21'] } : {}),
    });
    rows.push(live);
    if (kind === 'merge') mergeOwners.set('1-21', live);
    assert.notEqual((await render('/hu/radio/1-21')).pageData?.pageType, 'legacy-guide');
  }
  rows = [colorBarSource()]; mergeOwners.set('1-21', rows[0]);
  assert.equal((await get('/hu/radio/1-21')).status, 410);
});

test('a failed required alias-owner read cannot publish the reviewed tool', async () => {
  rows = [colorBarSource()]; failAt = 'aliasOwners';
  for (const path of ['/hu/radio/1-21', '/hu/radios/1-21']) {
    assert.equal((await get(path)).status, 503);
    assert.equal((await slim(path)).status, 503);
  }
});

test('only the reviewed genre bundle renders its article, never adjacent or paginated paths', async () => {
  const guide = LEGACY_STATION_GUIDES.find(guide => guide.id === 'radio-labels')!;
  const old = await get(guide.sourcePaths[0]);
  assert.equal(old.status, 301); assert.equal(old.location, guide.path);
  for (const path of [guide.path + '-extra', guide.path + '/extra', guide.path + '?page=2',
    guide.path.replace('-00s', '%2D00s'), guide.path.replace('/ar/', '/en/')]) {
    const page = await render(path);
    assert.notEqual(page.pageData?.pageType, 'legacy-guide', path);
  }
  await render(guide.path);
  genreAlias = 'pop';
  const current = await render(guide.path);
  assert.notEqual(current.pageData?.pageType, 'legacy-guide');
  assert.equal(current.pageData?.redirectTo, '/ar/anwaa/pop');
  const dto = await slim(guide.path); assert.equal(dto.status, 200);
  assert.equal(JSON.parse(dto.body).redirectTo, '/ar/anwaa/pop');
  assert.equal(JSON.parse(dto.body).legacyGuideId, null);
  const invalid = guide.path + '?page=2&page=3';
  assert.equal((await get(invalid)).status, 404);
  assert.equal((await slim(invalid)).status, 404);
  genreAlias = undefined; failAt = 'genre';
  assert.equal((await get(guide.path)).status, 503);
  assert.equal((await slim(guide.path)).status, 503);
});

for (const kind of ['merge', 'alias']) {
  test(kind + ' owner resolves through the normal station flow, never the guide', async () => {
    const live = owner('real-owner');
    if (kind === 'merge') {
      rows = [live, owner('shadow', { _id: 'shadow', slugAliases: ['rock-fm-23'] })];
      mergeOwners.set('rock-fm-23', live);
    } else { live.slugAliases.push('rock-fm-23'); rows = [live]; }
    const r = await get(rock); assert.equal(r.status, 301);
    assert.equal(r.location, '/ar/mahta/real-owner'); assert.equal((await get(r.location!)).status, 200);
    const dto = await slim(rock); assert.equal(dto.status, 200);
    assert.equal(JSON.parse(dto.body).redirectTo, r.location);
    assert.equal(JSON.parse(dto.body).legacyGuideId, null);
  });
}

test('a retained redirect cannot be replaced by the editorial fallback', async () => {
  rows = [owner('radar-4', { redirectToSlug: 'survivor', noIndex: true }), owner('survivor', { _id: 'survivor' })];
  const valid = await render(radar);
  assert.equal(valid.pageData?.station?._id, 'survivor'); assert.notEqual(valid.pageData?.pageType, 'legacy-guide');
  rows.pop();
  assert.equal((await get(radar)).status, 410);
});

test('catalog outages at each ownership stage are retryable, not an editorial 200', async () => {
  for (const kind of ['slug', 'merge', 'alias']) {
    failAt = kind;
    const p = await render(radar); assert.ok(p.pageData?.stationDbError); assert.notEqual(p.pageData?.pageType, 'legacy-guide');
    assert.equal((await get(radar)).status, 503);
    const dto = await slim(radar); assert.equal(dto.status, 503); assert.ok(!JSON.parse(dto.body).legacyGuideId);
  }
});

test('a previously resolved cached guide cannot mask a new owner or a subsequent lookup failure', async () => {
  const stale = await render(radar); assert.equal(stale.pageData?.pageType, 'legacy-guide');
  assert.equal(pageCache.has(radar), false, 'candidate must not publish a guide into the ordinary page cache');
  pageCache.set(radar, stale);
  rows = [owner('radar-4')]; lookups.length = 0;
  const fresh = await render(radar);
  assert.ok(lookups.includes('slug:radar-4'));
  assert.equal(fresh.pageData?.station?._id, rows[0]._id); assert.notEqual(fresh.pageData?.pageType, 'legacy-guide');
  assert.equal(pageCache.get(radar), stale, 'candidate must bypass ordinary page-cache writes as well');
  const dto = await slim(radar); assert.equal(dto.status, 200);
  const ownerDto = JSON.parse(dto.body); assert.equal(ownerDto.stationIdentity, rows[0]._id); assert.ok(!ownerDto.legacyGuideId);
  failAt = 'slug';
  assert.equal((await slim(radar)).status, 503);
});

for (const guide of LEGACY_STATION_GUIDES.filter(guide => !['radar-4', 'rock-fm-23', 'radio-labels', 'color-bars-test'].includes(guide.id))) {
  test('new editorial route preserves every owner and exclusion gate: ' + guide.id, async () => {
    const slug = guide.path.split('/').at(-1)!;
    for (const kind of ['slug', 'merge', 'alias']) {
      for (const excluded of [false, true]) {
        rows = []; mergeOwners.clear(); pageCache.clear();
        const live = owner(kind === 'slug' ? slug : 'verified-owner', { noIndex: excluded,
          ...(excluded ? { manualEditFields: { noIndex: true } } : {}),
          ...(kind === 'alias' ? { slugAliases: [slug] } : {}),
        });
        rows.push(live);
        if (kind === 'merge') mergeOwners.set(slug, live);
        const page = await render(guide.path);
        assert.notEqual(page.pageData?.pageType, 'legacy-guide');
        const response = await get(guide.path);
        const staysAtOriginalPath = kind === 'slug' || !!getRetiredLocaleFromPath(guide.path);
        assert.equal(response.status, excluded ? 410 : staysAtOriginalPath ? 200 : 301, kind + ':' + excluded);
        if (!excluded && staysAtOriginalPath) {
          assert.ok(response.body.includes('href="' + page.seoTags.canonical + '"'));
          assert.ok(page.seoTags.canonical?.endsWith('/' + live.slug));
        }
        const dto = await slim(guide.path);
        assert.equal(dto.status, excluded ? 410 : 200);
        assert.ok(!JSON.parse(dto.body).legacyGuideId);
      }
    }
  });
  test('new editorial route never hides fresh ownership or database failure: ' + guide.id, async () => {
    const stale = await render(guide.path);
    assert.equal(stale.pageData?.pageType, 'legacy-guide');
    assert.equal(pageCache.has(guide.path), false);
    pageCache.set(guide.path, stale);
    rows = [owner(guide.path.split('/').at(-1)!)];
    assert.notEqual((await render(guide.path)).pageData?.pageType, 'legacy-guide');
    rows = [];
    for (const kind of ['slug', 'merge', 'alias']) {
      failAt = kind;
      assert.equal((await get(guide.path)).status, 503);
      const dto = await slim(guide.path);
      assert.equal(dto.status, 503);
      assert.ok(!JSON.parse(dto.body).legacyGuideId);
    }
  });
}
