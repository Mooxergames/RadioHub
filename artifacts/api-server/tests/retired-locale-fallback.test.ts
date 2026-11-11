import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ACTIVE_SITEMAP_LANGUAGES, SEO_LANGUAGES, getLanguageFromPath, getRetiredLocaleFromPath, isSafeStationDetailSlug } from '@workspace/seo-shared/seo-config';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { buildPublicSeoRouteMatchers, decodePublicSeoPath } from '../src/seo/public-route-matchers';
import { isJunkStation, isNumericOnlySlug } from '../src/seo/junk-station-rules';
import { sendJunkGone } from '../src/seo/send-junk-gone';
import { renderStationBootstrap } from '../src/seo/station-bootstrap';
import { renderTranslationBootstrap } from '../src/seo/translation-bootstrap';
import { canonicalUrlMiddleware } from '../src/middleware/canonical-url';
import { countryPrefixRedirectMiddleware } from '../src/middleware/country-prefix-redirect';

let server: Server;
let baseUrl: string;
let slugCacheReady = false;
let readFailed = false;
const pageCache = new Map<string, any>();
let stationRows: any[] = [];
const fixture = (patch: Record<string, unknown> = {}) => ({ _id: '68a8c482bd66579311ab2f5b', slug: 'safe-existing-fm',
  slugAliases: ['old-safe-fm'], name: 'Safe Existing FM', noIndex: false, country: 'Germany',
  url: 'https://stream.example.invalid/live', lastCheckOk: true,
  descriptions: Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(language => [language, { full: `Full ${language} station article.`, meta: `Meta ${language}` }])), ...patch });

before(async () => {
  mock.module('../src/performance-cache', { namedExports: { performanceCache: {
    getUrlTranslations: async () => new Map(), getTranslations: (lang: string) => ({ nav_home: `${lang} home` }),
    getPageData: (key: string) => pageCache.get(key), setPageData: (key: string, value: any) => pageCache.set(key, value),
  } } });
  mock.module('../src/seo/slug-existence', { namedExports: {
    getCanonicalStationSlug: (identifier: string) => {
      if (!slugCacheReady) return null;
      const row = stationRows.find(station => station.slugAliases?.includes(identifier));
      return row && !row.noIndex && !row.redirectToSlug && !isNumericOnlySlug(row.slug) && !isJunkStation(row) ? row.slug : null;
    }, isSlugExistenceReady: () => slugCacheReady,
  } });
  mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
    findOne: async (query: any) => {
      if (readFailed) throw new Error('fixture read failure');
      return stationRows.find(station => query.slug ? station.slug === query.slug
        : query._id ? station._id === query._id : station.slugAliases?.includes(query.slugAliases)) ?? null;
    }, findById: async (id: string) => stationRows.find(station => station._id === id) ?? null,
    findMergedAlias: async () => null, find: async () => stationRows, count: async () => stationRows.length, groupCount: async () => [],
  }) } });
  mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
  mock.module('../src/data/postgres-taxonomy-store', { namedExports: {
    pgStoredGenreBySlug: async () => ({ stationCount: 30 }), pgPublicGenres: async () => [],
  } });
  mock.module('../src/data/postgres-az-station-store', { namedExports: {
    readAzStationPage: async () => ({ docs: stationRows, total: stationRows.length }),
  } });
  mock.module('../src/data/postgres-seo-directory-store', { namedExports: {
    readSeoGenrePage: async () => ({ stations: stationRows, totalPages: 1 }),
    readSeoGenreQualityPage: async () => ({ stations: stationRows }),
  } });
  mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
  mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES] } });
  const { urlRedirectMiddleware } = await import('../src/url-redirect-middleware');
  const { SeoRenderer } = await import('../src/seo-renderer');
  const renderer = new SeoRenderer();
  const matchers = buildPublicSeoRouteMatchers();
  const app = express();
  app.use(countryPrefixRedirectMiddleware);
  app.use(canonicalUrlMiddleware);
  app.use(urlRedirectMiddleware);
  app.use(async (req, res) => {
    if (req.get('x-url-only') === '1' || !['GET', 'HEAD'].includes(req.method)) return void res.status(204).end();
    const decoded = decodePublicSeoPath(req.originalUrl);
    const matchingPath = getRetiredLocaleFromPath(req.path)
      ? `/en${getLanguageFromPath(req.path).cleanPath.replace(/^\/$/, '')}` : decoded;
    if (decoded === null || matchingPath === null || !Object.values(matchers).some(matcher => matcher.test(matchingPath))) return void res.status(404).end();
    const page = await renderer.renderStaticPage(req.originalUrl, 'https://themegaradio.com');
    if (page.pageData?.stationDbError) return void res.status(503).end();
    if (page.pageData?.redirectTo) return void res.redirect(301, page.pageData.redirectTo);
    if (page.pageData?.httpNotFound) return void res.status(404).end();
    if (page.pageData?.stationIsJunk || page.pageData?.notFound) return sendJunkGone(res);
    const head = renderer.generateHtmlHead(page.seoTags, page.language, page.translations, page.cleanPath, page.pageData?.station, page.urlTranslations, page.pageData);
    const body = renderer.generateHtmlBody({ pageType: page.pageData?.pageType || 'home', language: page.language,
      translations: page.translations || {}, seoTags: page.seoTags, stationData: page.pageData?.station,
      additionalData: page.pageData?.additionalData, urlTranslations: page.urlTranslations, cleanPath: page.cleanPath });
    res.status(200).type('html').send(`<!DOCTYPE html><html lang="${page.language}"><head>${head}</head><body>${body}${renderTranslationBootstrap(page.language, page.translations || {})}${renderStationBootstrap(page.pageData?.station, page.language, getLanguageFromPath(req.path).cleanPath.split('/')[2])}</body></html>`);
  });
  server = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  mock.restoreAll();
});

async function request(path: string, method = 'GET', extra: Record<string, string> = {}) {
  pageCache.clear();
  // Native HTTP preserves Host, so the real canonical middleware cannot
  // silently bypass these tests as localhost/dev traffic.
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(baseUrl + path, { method, headers: {
      host: 'themegaradio.com', 'x-forwarded-proto': 'https',
      'accept-language': 'de-AT', cookie: 'preferredLanguage=tr', ...extra,
    } }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), {
        status: response.statusCode,
        headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value!])),
      })));
    });
    req.on('error', reject);
    req.end();
  });
}

test('every known retired homepage stays 200 English, including its trailing slash, with only real alternates', async () => {
  stationRows = [fixture()];
  for (const { code } of SEO_LANGUAGES.filter(lang => getRetiredLocaleFromPath(`/${lang.code}`))) {
    for (const suffix of ['', '/']) {
      const response = await request(`/${code}${suffix}?utm_source=gsc`);
      assert.equal(response.status, 200, code + suffix);
      assert.equal(response.headers.get('location'), null);
      const html = await response.text();
      assert.match(html, /<html lang="en">/);
      assert.match(html, /rel="canonical" href="https:\/\/themegaradio.com\/en"/);
      assert.match(html, /__INITIAL_LANGUAGE__="en"/);
      assert.ok(!html.includes(`hreflang="${code}`), code);
      assert.ok(!html.includes(`https://themegaradio.com/${code}/`), code);
    }
  }
});

test('retired station, legacy alias, encoded slug and ID retain their URL and actual English station', async () => {
  stationRows = [fixture(), fixture({ _id: 'unicode', slug: 'seker-fm', slugAliases: ['eski-şeker'] })];
  for (const [source, slug] of [
    ['/nl/station/safe-existing-fm', 'safe-existing-fm'], ['/sv/station/old-safe-fm/', 'safe-existing-fm'],
    ['/NL/station/safe-existing-fm', 'safe-existing-fm'],
    ['/af/stasie/old-safe-fm', 'safe-existing-fm'], ['/hu/radios/old-safe-fm', 'safe-existing-fm'],
    ['/nl/station/68a8c482bd66579311ab2f5b', 'safe-existing-fm'], ['/af/stasie/eski-%C5%9Feker', 'seker-fm'],
  ]) {
    for (const warm of [false, true]) {
      slugCacheReady = warm;
      const response = await request(source + '?utm_source=gsc');
      assert.equal(response.status, 200, `${source} warm=${warm}`);
      assert.equal(response.headers.get('location'), null);
      const html = await response.text();
      assert.match(html, /<html lang="en">/);
      assert.ok(html.includes(`rel="canonical" href="https://themegaradio.com/en/station/${slug}"`));
      assert.ok(html.includes('Full en station article.'));
      assert.ok(!html.includes('Full nl station article.'));
      assert.ok(!/hreflang="(?:nl|sv|af|hu)(?:-|"|_)/.test(html));
    }
    const head = await request(source, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.headers.get('location'), null);
  }
});

test('opaque retired station slugs are not translated, and A-Z routes never enter alias shortcuts', async () => {
  const { AZ_INDEX_KEYS } = await import('../src/seo/az-station-index');
  stationRows = [fixture({ slug: 'profiel', slugAliases: [...AZ_INDEX_KEYS] })];
  slugCacheReady = true;
  const station = await request('/af/stasie/profiel');
  assert.equal(station.status, 200);
  assert.ok((await station.text()).includes('https://themegaradio.com/en/station/profiel'));
  for (const lang of [...ACTIVE_SITEMAP_LANGUAGES, 'nl', 'sv', 'af']) {
    for (const letter of AZ_INDEX_KEYS) {
      const path = encodeURI(`/${lang}/${URL_TRANSLATIONS[lang]?.stations || 'stations'}/${letter}`) + '?page=2';
      const response = await request(path, 'GET', { 'x-url-only': '1' });
      assert.equal(response.status, 204, path);
      assert.equal(response.headers.get('location'), null);
    }
  }
});

test('legacy URL components retain exact identity without redirects or repeated decoding', async () => {
  for (const [source, slug] of [
    ['/af/stasie/profiel', 'profiel'], ['/af/stasie/stasie', 'stasie'], ['/hu/radio/radio', 'radio'],
    ['/af/stasie/WTOS', 'wtos'], ['/af/stasie/%C5%9Feker', 'şeker'], ['/af/stasie/radio%20one', 'radio one'],
    ['/af/stasie/radio%252Fone', 'radio%2fone'],
    ['/af/stasie/profiel?utm_source=gsc%26test&x=%23', 'profiel'],
  ]) {
    stationRows = [fixture({ slug, slugAliases: [] })];
    for (const warm of [false, true]) {
      slugCacheReady = warm;
      const response = await request(source);
      assert.equal(response.status, 200, source);
      assert.equal(response.headers.get('location'), null, source);
      const canonicalIdentifier = isSafeStationDetailSlug(slug) ? encodeURIComponent(slug) : stationRows[0]._id;
      assert.ok((await response.text()).includes(`rel="canonical" href="https://themegaradio.com/en/station/${canonicalIdentifier}"`), source);
    }
  }
  for (const source of ['radio%23one', 'radio%3Fone', 'radio%2Fone', 'radio%0Aone', '%E0%A4%A']) {
    const response = await request(`/af/stasie/${source}`);
    assert.equal(response.status, 404, source);
    assert.equal(response.headers.get('location'), null, source);
  }
});

test('historical exact/alias/Unicode identities render identically with cold or warm caches', async () => {
  for (const [source, slug, aliases] of [
    ['/af/station/onda-rossa', 'onda-rossa', ['radio-onda-rossa-1']],
    ['/af/station/radio-onda-rossa-1', 'onda-rossa', ['radio-onda-rossa-1']],
    ['/am/station/radio-onda-rossa-1', 'onda-rossa', ['radio-onda-rossa-1']],
    ['/hu/radios/radio-onda-rossa-1', 'onda-rossa', ['radio-onda-rossa-1']],
    ['/af/stasie/%C5%9Feker-fm', 'şeker-fm', ['eski-şeker']],
    ['/af/station/eski-%C5%9Feker', 'şeker-fm', ['eski-şeker']],
    ['/af/station/eski-g%C3%BCvenli', 'safe-existing-fm', ['eski-güvenli']],
  ] as const) {
    stationRows = [fixture({ slug, slugAliases: aliases })];
    const outcomes = [];
    for (const warm of [false, true]) {
      slugCacheReady = warm;
      const response = await request(source + '?utm_source=gsc%26test&x=%23');
      assert.equal(response.status, 200, source);
      assert.equal(response.headers.get('location'), null, source);
      const html = await response.text();
      assert.ok(html.includes(`rel="canonical" href="https://themegaradio.com/en/station/${encodeURIComponent(slug)}"`), source);
      assert.ok(html.includes(`"_id":"${stationRows[0]._id}"`));
      outcomes.push(html);
    }
    assert.equal(outcomes[0], outcomes[1], source);
  }
});

test('historical jp Jalisco route reaches the Japanese XHCGJ station without a loop', async () => {
  const id = '6a07917abef34beb9148c3cf';
  const slug = 'jalisco-radio-fm-ciudad-guzman-107-1-fm-xhcgj-fm-gobierno-del-estado-de-jalisco-ciudad-guzman-jc';
  const old = 'jalisco-radio-fm-ciudad-guzmn-1071-fm-xhcgj-fm-gobierno-del-estado-de-jalisco-ciudad-guzmn-jc-1';
  stationRows = [fixture({ _id: id, slug, slugAliases: [slug + '-1'], name: 'Jalisco Radio XHCGJ-FM',
    country: 'Mexico', url: 'https://sp2.servidorrprivado.com/8136/ciudadguzman', lastCheckOk: false })];
  const detail = URL_TRANSLATIONS.ja.station;
  for (const warm of [false, true]) {
    slugCacheReady = warm;
    let path = '/jp/station/' + old;
    const seen = new Set<string>();
    let response = await request(path);
    while (response.status === 301) {
      assert.ok(!seen.has(path) && seen.size < 3, path);
      seen.add(path);
      const next = new URL(response.headers.get('location')!, 'https://themegaradio.com');
      assert.equal(next.origin, 'https://themegaradio.com');
      path = next.pathname;
      response = await request(path);
    }
    assert.equal(decodeURI(path), `/ja/${detail}/${slug}`);
    assert.equal(response.status, 200);
    const html = decodeURI(await response.text());
    assert.ok(html.includes(`rel="canonical" href="https://themegaradio.com/ja/${detail}/${slug}"`));
    assert.ok(html.includes(`"_id":"${id}"`));
  }
});

test('retired bn historical Mountain URL renders the pinned English station, not a generic 200', async () => {
  const id = '68a8c45cbd66579311aad14c';
  stationRows = [fixture({ _id: id, slug: '93-1-the-mountain', slugAliases: ['931-the-mountain-3'],
    country: 'The United States Of America', name: '93.1 The Mountain', url: 'https://stream.revma.ihrhls.com/zc1337' })];
  for (const warm of [false, true]) {
    slugCacheReady = warm;
    const response = await request('/bn/station/931-the-mountain-2');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    assert.ok(html.includes('rel="canonical" href="https://themegaradio.com/en/station/93-1-the-mountain"'));
    assert.ok(html.includes(`"_id":"${id}"`));
    assert.ok(html.includes('https://stream.revma.ihrhls.com/zc1337'));
  }
});

test('historical fm-100 alias keeps every existing eligibility policy with cold and warm caches', async () => {
  for (const [patch, expected] of [
    [{ noIndex: true, lastCheckOk: false }, 200],
    [{ noIndex: true, lastCheckOk: true }, 200],
    [{ noIndex: true, lastCheckOk: undefined }, 200],
    [{ noIndex: true, lastCheckOk: false, manualEditFields: { noIndex: true } }, 410],
    [{ noIndex: true, lastCheckOk: true, manualEditFields: { noIndex: true } }, 410],
    [{ noIndex: false, url: '' }, 410], [null, 410],
  ] as const) {
    stationRows = patch ? [fixture({ _id: '68a8c4a6bd66579311ab887d', slug: 'dzhem-fm', slugAliases: ['fm-100'], ...patch })] : [];
    const outcomes = [];
    for (const warm of [false, true]) {
      slugCacheReady = warm;
      const response = await request('/af/station/fm-100');
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('location'), null);
      const html = await response.text();
      if (expected === 200) assert.match(html, /name="robots" content="noindex, follow"/);
      outcomes.push(html);
    }
    assert.equal(outcomes[0], outcomes[1]);
  }
});

test('retired blog addresses use the actual English edition; missing English articles stay 404', async () => {
  const response = await request('/nl/blog/radio-data-usage');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html lang="en">/);
  assert.ok(html.includes('https://themegaradio.com/en/blog/radio-data-usage'));
  assert.equal((await request('/nl/blog/kral-fm-canli-dinle-sorunlari')).status, 404);
  assert.equal((await request('/sv/blog/unknown-guide')).status, 404);
});

test('retired valid stored redirect renders its verified target; missing, junk and outages retain errors', async () => {
  for (const warm of [false, true]) {
    slugCacheReady = warm;
    stationRows = [fixture({ slug: 'old-record', redirectToSlug: 'safe-existing-fm', noIndex: true }), fixture()];
    let response = await request('/nl/station/old-record');
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('https://themegaradio.com/en/station/safe-existing-fm'));
    for (const patch of [{ noIndex: true, manualEditFields: { noIndex: true } }, { url: '' }, { redirectToSlug: 'missing' }]) {
      stationRows = [fixture(patch)];
      response = await request('/nl/station/old-safe-fm');
      assert.equal(response.status, 410);
    }
    stationRows = [fixture({ noIndex: true, lastCheckOk: false })];
    response = await request('/nl/station/old-safe-fm');
    assert.equal(response.status, 200, 'existing informational policy is not broadened into 410');
    assert.match(await response.text(), /name="robots" content="noindex, follow"/);
    stationRows = [];
    assert.equal((await request('/sv/station/never-existed')).status, 410);
    readFailed = true;
    assert.equal((await request('/nl/station/safe-existing-fm')).status, 503);
    readFailed = false;
  }
});

test('all fourteen supported station editions and normal alias redirects remain unchanged', async () => {
  stationRows = [fixture()]; slugCacheReady = true;
  for (const lang of ACTIVE_SITEMAP_LANGUAGES) {
    const path = `/${lang}/${encodeURIComponent(URL_TRANSLATIONS[lang]?.station || 'station')}/safe-existing-fm`;
    const response = await request(path);
    assert.equal(response.status, 200, lang);
    assert.ok((await response.text()).includes(`rel="canonical" href="https://themegaradio.com${path}"`));
  }
  const alias = await request('/de/sender/old-safe-fm?utm_source=ahrefs');
  assert.equal(alias.status, 301); assert.equal(alias.headers.get('location'), '/de/sender/safe-existing-fm?utm_source=ahrefs');
});

test('unknown prefixes, malformed paths, assets, auth, admin and mutation paths are not English homepage aliases', async () => {
  for (const path of ['/zz', '/zz/station/safe-existing-fm', '/nl/unknown-route', '/nl/station/%2Fbad', '/nl/station/%E0%A4%A']) {
    assert.equal((await request(path)).status, 404, path);
  }
  for (const path of ['/api/auth/me', '/api/admin/stations', '/admin', '/assets/player.js', '/nl/login', '/nl/profile', '/nl/player.js',
    '/af/profiel', '/af?station=old-safe-fm', '/af/stasies/a']) {
    const response = await request(path, 'GET', { 'x-url-only': '1' });
    assert.equal(response.status, 204, path); assert.equal(response.headers.get('location'), null, path);
  }
  assert.equal((await request('/api/auth/login', 'POST')).status, 204);
  assert.equal((await request('/af/stasie/safe-existing-fm', 'POST')).status, 204);
});

for (const [source, target, hops] of [
  ['/af/stasie/wtos', '/af/stasie/wtos', 0], ['/af/station/wtos', '/af/station/wtos', 0],
  ['/ee/station/kamu-radio-fm-909', '/en/station/kamu-radio-fm-909', 1],
  ['/ar/station/nrj-oriental', '/ar/mahta/nrj-oriental', 1],
  ['/am/station/nrj-international-hits', '/am/station/nrj-international-hits', 0],
  ['/jo/station/sveriges-radio-p3-2', '/ar/mahta/sveriges-radio-p3-2', 2],
  ['/om/station/sveriges-radio-p3-2', '/ar/mahta/sveriges-radio-p3-2', 2],
  ['/hu/radios/1-21', '/hu/radios/1-21', 0], ['/hu/radio/1-21', '/hu/radio/1-21', 0],
] as const) {
  test(`historical GSC address has a stable real page without a loop: ${source}`, async () => {
    stationRows = [fixture({ slug: source.split('/').at(-1), slugAliases: [] })];
    for (const warm of [false, true]) {
      slugCacheReady = warm;
      const seen = new Set<string>();
      let current: string = source;
      for (let attempt = 0; attempt < 8; attempt++) {
        assert.ok(!seen.has(current), `redirect loop at ${current}`);
        seen.add(current);
        const response = await request(current);
        if (response.status === 200) {
          assert.equal(current, target);
          assert.equal(attempt, hops);
          assert.ok((await response.text()).includes(`"_id":"${stationRows[0]._id}"`));
          break;
        }
        assert.equal(response.status, 301, current);
        const location = response.headers.get('location');
        assert.ok(location);
        const next = new URL(location, baseUrl);
        assert.ok([baseUrl, 'https://themegaradio.com'].includes(next.origin));
        current = next.pathname + next.search;
        assert.ok(attempt < 7, 'redirect did not stabilize within eight requests');
      }
    }
  });
}

test('canonical generation outside SSR also consolidates retired English copies', async () => {
  const { generateSeoTags } = await import('@workspace/seo-shared/seo-config');
  assert.equal(generateSeoTags('home', 'en', {}, '/', 'https://themegaradio.com', undefined, '/nl').canonical,
    'https://themegaradio.com/en');
  assert.equal(generateSeoTags('station', 'en', {}, '/station/old-safe-fm', 'https://themegaradio.com', fixture(), '/sv/station/old-safe-fm').canonical,
    'https://themegaradio.com/en/station/safe-existing-fm');
  for (const slug of ['a', 'bad/fm', 'unverified-slug-owner']) {
    const id = fixture()._id;
    assert.equal(generateSeoTags('station', 'en', {}, `/station/${id}`, 'https://themegaradio.com', fixture({ slug }), `/nl/station/${id}`).canonical,
      `https://themegaradio.com/en/station/${id}`);
  }
});

test('fresh GSC retired route variants retain valid records, while unknown records and removed features stay errors', async () => {
  // Route fixtures only; these are not evidence approving any production alias.
  for (const path of ['/rs/station/lorfm-30', '/rs/stanica/lorfm-30', '/hu/radios/exclusively-stevie-wonder', '/hu/radio/j1-gold']) {
    const slug = path.split('/').at(-1)!;
    stationRows = [fixture({ slug })];
    assert.equal(getLanguageFromPath(path).cleanPath, `/station/${slug}`);
    for (const method of ['GET', 'HEAD']) {
      const response = await request(path, method);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('location'), null, path);
      if (method === 'GET') assert.ok((await response.text()).includes(`rel="canonical" href="https://themegaradio.com/en/station/${slug}"`));
    }
  }
  stationRows = [];
  assert.equal((await request('/rs/station/lorfm-30')).status, 410, 'locale fallback never invents a missing identity');
  for (const path of ['/zz', '/qq/station/lorfm-30', '/af/ontdek-musiek/album/1771020838']) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('location'), null, path);
  }
});

test('retired singular one-character station identity stays distinct from the plural A-Z directory', async () => {
  for (const slug of ['a', 'x']) {
    stationRows = [fixture({ slug })];
    assert.equal(getLanguageFromPath(`/nl/station/${slug}`).cleanPath, `/station/${slug}`);
    assert.equal(getLanguageFromPath(`/nl/stations/${slug}`).cleanPath, `/stations/${slug}`);
    const station = await request(`/nl/station/${slug}`);
    assert.equal(station.status, 200);
    const html = await station.text();
    assert.ok(html.includes('Full en station article.'));
    assert.ok(html.includes(`rel="canonical" href="https://themegaradio.com/en/station/${stationRows[0]._id}"`));
    const directory = await request(`/nl/stations/${slug}`);
    assert.equal(directory.status, 200);
    assert.ok((await directory.text()).includes(`rel="canonical" href="https://themegaradio.com/en/stations/${slug}"`));
    stationRows = [];
    assert.equal((await request(`/sv/station/${slug}`)).status, 410);
  }
});

test('R6-01/02: historical and cross-language route families never translate station identities', async () => {
  for (const [path, slug] of [
    ['/nl/radios/profiel', 'profiel'], ['/sv/radios/profil', 'profil'],
    ['/nl/sender/profiel', 'profiel'], ['/sv/istasyon/profil', 'profil'],
    ['/nl/station/profiel', 'profiel'], ['/nl/radios/stations', 'stations'],
  ]) {
    stationRows = [fixture({ _id: 'intended', slug }), fixture({ _id: 'wrong', slug: 'profile', name: 'Wrong station' })];
    assert.equal(getLanguageFromPath(path).cleanPath, `/station/${slug}`);
    for (const warm of [false, true]) {
      slugCacheReady = warm;
      const response = await request(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('location'), null, path);
      const html = await response.text();
      assert.ok(html.includes(`rel="canonical" href="https://themegaradio.com/en/station/${slug}"`));
      assert.ok(html.includes('"_id":"intended"'));
      assert.ok(!html.includes('"_id":"wrong"'));
    }
  }
});

test('R6-02: singular and foreign genre routes render the English genre, never a homepage', async () => {
  stationRows = [fixture({ tags: 'pop' })];
  for (const path of ['/nl/genre/pop', '/sv/zhanry/pop', '/nl/genres/pop']) {
    assert.equal(getLanguageFromPath(path).cleanPath, '/genres/pop', path);
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('location'), null, path);
    const html = await response.text();
    assert.match(html, /rel="canonical" href="https:\/\/themegaradio.com\/en\/genres\/pop"/);
    assert.match(html, /<h1[^>]*>[^<]*Pop/);
  }
});

test('R6-04: retired ID canonicals retain the English ID unless its slug has a safe exact owner', async () => {
  const id = '68a8c482bd66579311ab2f5b';
  for (const slug of ['a', '0-9', 'bad/fm', 'bad?fm', 'bad%2Ffm', ' bad-fm', '.', '..', '']) {
    stationRows = [fixture({ slug })];
    const response = await request(`/nl/station/${id}`);
    assert.equal(response.status, 200, JSON.stringify(slug));
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    const canonical = `https://themegaradio.com/en/station/${id}`;
    assert.ok(html.includes(`rel="canonical" href="${canonical}"`), slug);
    if (['a', 'bad/fm'].includes(slug)) {
      const entities = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
      assert.equal(entities.find(entity => entity['@type'] === 'WebPage')?.url, canonical);
      assert.equal(entities.find(entity => entity['@type'] === 'RadioBroadcastService')?.['@id'], `${canonical}#radiostation`);
    }
  }
  stationRows = [fixture({ _id: 'different-owner' }), fixture()];
  const response = await request(`/sv/station/${id}`);
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes(`rel="canonical" href="https://themegaradio.com/en/station/${id}"`));
});

test('R6-05: real canonical middleware retains retired legal paths, but active and host policies stay unchanged', async () => {
  for (const [locale, page] of [['nl', 'privacy-policy'], ['sv', 'terms-and-conditions']]) {
    for (const slash of ['', '/']) {
      const path = `/${locale}/pages/${page}${slash}`;
      assert.equal(getLanguageFromPath(path).cleanPath, `/${page}`);
      for (const method of ['GET', 'HEAD']) {
        const response = await request(path + '?utm_source=gsc%26test', method);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get('location'), null, path);
        if (method === 'GET') assert.ok((await response.text()).includes(`rel="canonical" href="https://themegaradio.com/en/${page}"`));
      }
    }
  }
  const active = await request('/en/pages/privacy-policy/?x=%23');
  assert.equal(active.status, 301);
  assert.equal(active.headers.get('location'), '/en/privacy-policy?x=%23');
  const host = await request('/nl/pages/privacy-policy/?x=%23', 'GET', { host: 'www.themegaradio.com', 'x-forwarded-proto': 'http' });
  assert.equal(host.status, 301);
  assert.equal(host.headers.get('location'), 'https://themegaradio.com/nl/pages/privacy-policy/?x=%23');
});
