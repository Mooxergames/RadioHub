import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import express, { type Express } from 'express';
import ts from 'typescript';
import { loadBlogContent } from '@workspace/seo-shared/blog';
import { BLOG_IDS, blogIdsForLocale, isCoreBlogId } from '@workspace/seo-shared/blog-manifest';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

const ORIGIN = 'https://themegaradio.com';
const LOCALES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ar', 'zh', 'tr', 'ja', 'ko', 'hi', 'he'] as const;
const EDITIONS = [
  { path: '/llms.txt', locale: 'en' as const },
  ...LOCALES.map(locale => ({ path: `/${locale}/llms.txt`, locale })),
];
const EXISTING_LINKS = [
  `<${ORIGIN}/en>; rel="canonical"`,
  `<${ORIGIN}/de>; rel="alternate"; hreflang="de"`,
  '</assets/app.js>; rel="preload"; as="script"',
];
const HOME_HTML = '<!doctype html><html><body>Existing home fixture</body></html>';
const SPA_HTML = '<!doctype html><html><body>Unrelated SPA fixture</body></html>';
const calls = { countries: 0, genres: 0, genreManifests: 0, genreDocs: 0, languages: 0, translations: 0 };
type SourceMode = 'empty' | 'pending' | 'reject';
let sourceMode: SourceMode = 'empty';
let releasePending = () => {};
let pending: Promise<void> = Promise.resolve();

async function optionalSource<T>(source: keyof typeof calls, value: T): Promise<T> {
  calls[source]++;
  if (sourceMode === 'pending') await pending;
  if (sourceMode === 'reject') throw new Error(`Offline ${source} fixture`);
  return value;
}

// Only optional discovery providers are replaced: renderer, copy, URL resolver
// and all editorial imports remain real, with no PostgreSQL or external HTTP.
mock.module('../src/data/postgres-seo-indexing-store', { namedExports: {
  pgTopIndexableTags: () => optionalSource('genres', []),
  pgActiveManifests: (type?: string) => {
    assert.equal(type, 'genres', 'genre discovery must request only genre manifests');
    return optionalSource('genreManifests', []);
  },
  pgSeoGenres: async (ids?: readonly unknown[]) => {
    calls.genreDocs++;
    assert.ok(ids && ids.length > 0 && ids.length <= 4096, 'never run an unbounded or empty genre document read');
    if (sourceMode === 'pending') await pending;
    if (sourceMode === 'reject') throw new Error('Offline genreDocs fixture');
    return [];
  },
} });
mock.module('../src/seo/sitemap-manifest-builder', { namedExports: {
  getActiveManifest: () => optionalSource('countries', null),
  extractTopCountriesFromChunk: () => [],
} });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: () => optionalSource('languages', []),
} });
mock.module('../src/performance-cache', { namedExports: {
  performanceCache: { getUrlTranslations: () => optionalSource('translations', new Map()) },
} });
mock.module('../src/utils/logger', { namedExports: { logger: { warn() {} } } });

let registerLlmsTxtRoutes: typeof import('../src/seo/llms-txt-routes').registerLlmsTxtRoutes;
let builder: typeof import('../src/seo/llms-txt-builder');
const servers: Server[] = [];
let web: Server;
let api: Server;
let baseline: Server;
let registrationSizes: number[];

function stackSize(app: Express): number {
  return app.router.stack.length;
}

function fixture(options: { registration: 'web' | 'api' | 'none'; arrayLink?: boolean }): Express {
  const app = express();
  app.set('trust proxy', true);
  app.use((req, res, next) => {
    res.setHeader('X-Fixture-Security', 'before-registrar');
    if (req.headers['x-fixture-block'] === 'yes') {
      res.status(403).type('text/plain').set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }).send('Blocked by existing security');
      return;
    }
    res.setHeader('Link', options.arrayLink ? EXISTING_LINKS : EXISTING_LINKS.join(', '));
    next();
  });
  if (options.registration === 'web') {
    registerLlmsTxtRoutes(app, { homeDiscovery: false });
    const first = stackSize(app);
    registerLlmsTxtRoutes(app, { homeDiscovery: true });
    const second = stackSize(app);
    registerLlmsTxtRoutes(app, { homeDiscovery: true });
    const third = stackSize(app);
    registerLlmsTxtRoutes(app, { homeDiscovery: false });
    registrationSizes = [first, second, third, stackSize(app)];
  } else if (options.registration === 'api') {
    registerLlmsTxtRoutes(app, { homeDiscovery: false });
    const first = stackSize(app);
    registerLlmsTxtRoutes(app, { homeDiscovery: false });
    assert.equal(stackSize(app), first, 'API-role registration is idempotent');
  }
  // These downstream sentinels stand in for static delivery, auth and SSR.
  app.use((req, res) => {
    res.setHeader('X-Fixture-Downstream', 'reached');
    if (['/admin', '/admin/stations', '/profile', '/en/profile', '/auth/login', '/api/private'].includes(req.path)) {
      res.status(401).type('text/plain').set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' }).send('Existing authentication required');
    } else if (req.path === '/robots.txt') {
      res.type('text/plain').setHeader('Cache-Control', 'public, max-age=600');
      res.send('User-agent: *\nDisallow: /admin\nDisallow: /profile\n');
    } else if (/^\/[a-z]{2}\/$/.test(req.path)) {
      res.redirect(308, req.path.slice(0, -1));
    } else if (req.path === '/' || LOCALES.some(locale => req.path === `/${locale}`)) {
      if (options.registration === 'api') {
        res.status(404).type('text/plain').send('No API homepage');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.setHeader('X-Fixture-Cache', 'HIT');
      res.type('html').send(HOME_HTML);
    } else {
      res.type('html').send(SPA_HTML);
    }
  });
  return app;
}

async function listen(app: Express): Promise<Server> {
  const server = await new Promise<Server>((resolve, reject) => {
    const running = app.listen(0, '127.0.0.1');
    running.once('listening', () => resolve(running));
    running.once('error', reject);
  });
  servers.push(server);
  return server;
}

interface HttpResult {
  status: number;
  headers: IncomingHttpHeaders;
  bytes: Buffer;
  body: string;
}

// Raw HTTP deliberately avoids fetch's path normalization and redirects.
async function http(server: Server, path: string, method = 'GET', headers: Record<string, string> = {}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port, path, method, headers }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('error', reject);
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        resolve({ status: res.statusCode!, headers: res.headers, bytes, body: bytes.toString('utf8') });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error(`HTTP fixture timed out: ${method} ${path}`)));
    req.end();
  });
}

function header(result: HttpResult, name: string): string {
  const value = result.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value || '';
}

function assertPlain(result: HttpResult): void {
  assert.match(header(result, 'content-type'), /^text\/plain;\s*charset=utf-8$/i);
  assert.equal(header(result, 'x-content-type-options'), 'nosniff');
  assert.doesNotMatch(result.body, /<!doctype|<html|Existing home fixture|Unrelated SPA fixture/i);
}

function assertGuide(result: HttpResult, path: string, locale: string): void {
  assert.equal(result.status, 200, path);
  assertPlain(result);
  assert.equal(header(result, 'content-language'), locale);
  assert.equal(header(result, 'link'), `<${ORIGIN}${path}>; rel="canonical"`);
  assert.equal(header(result, 'cache-control'), 'public, max-age=3600');
  assert.equal(header(result, 'last-modified'), '');
  assert.equal(header(result, 'location'), '');
  assert.equal(header(result, 'x-fixture-downstream'), '');
  assert.equal(header(result, 'x-fixture-security'), 'before-registrar');
  assert.match(result.body, /^# MegaRadio\n/);
  assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes), result.body);
  assert.equal(Number(header(result, 'content-length')), Buffer.byteLength(result.body));
  const digest = createHash('sha1').update(result.bytes).digest('base64').slice(0, 27);
  assert.equal(header(result, 'etag').replace(/^W\//, ''), `"${result.bytes.length.toString(16)}-${digest}"`, 'ETag derives from actual UTF-8 bytes');
}

function assertSameRepresentation(a: HttpResult, b: HttpResult): void {
  assert.equal(b.status, a.status);
  assert.deepEqual(b.bytes, a.bytes);
  for (const name of ['content-type', 'content-language', 'content-length', 'etag', 'cache-control', 'link', 'location', 'x-robots-tag', 'x-content-type-options']) {
    assert.equal(header(b, name), header(a, name), name);
  }
}

before(async () => {
  ({ registerLlmsTxtRoutes } = await import('../src/seo/llms-txt-routes'));
  builder = await import('../src/seo/llms-txt-builder');
  web = await listen(fixture({ registration: 'web', arrayLink: true }));
  api = await listen(fixture({ registration: 'api' }));
  baseline = await listen(fixture({ registration: 'none' }));
});

beforeEach(async () => {
  releasePending();
  await setImmediate();
  builder.clearLlmsTxtCache();
  sourceMode = 'empty';
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key] = 0;
});

after(async () => {
  releasePending();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  builder?.clearLlmsTxtCache();
  mock.restoreAll();
});

test('inventory is exactly 15 canonical documents plus 15 aliases; false/true/true does not duplicate registration', () => {
  assert.equal(new Set(EDITIONS.flatMap(({ path }) => [path, path.replace('llms.txt', 'llm.txt')])).size, 30);
  assert.ok(registrationSizes[1] > registrationSizes[0], 'later opt-in must install home discovery');
  assert.equal(registrationSizes[2], registrationSizes[1], 'second opt-in adds no middleware or routes');
  assert.equal(registrationSizes[3], registrationSizes[1], 'later opt-out adds no routes or removes discovery');
});

for (const { path, locale } of EDITIONS) {
  test(`${path}: real native GET, byte-consistent HEAD, stable body-derived ETag and bodyless conditional GET/HEAD`, async () => {
    const get = await http(web, path);
    assertGuide(get, path, locale);
    assertSameRepresentation(get, await http(web, path));
    const head = await http(web, path, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.bytes.length, 0);
    for (const name of ['content-type', 'content-language', 'content-length', 'link', 'cache-control', 'etag', 'x-content-type-options']) {
      assert.equal(header(head, name), header(get, name), name);
    }
    for (const method of ['GET', 'HEAD']) {
      const conditional = await http(web, path, method, { 'if-none-match': header(get, 'etag') });
      assert.equal(conditional.status, 304);
      assert.equal(conditional.bytes.length, 0);
      for (const name of ['etag', 'content-language', 'link', 'cache-control', 'x-content-type-options']) {
        assert.equal(header(conditional, name), header(get, name), name);
      }
      assert.equal(header(conditional, 'last-modified'), '');
      const stale = await http(web, path, method, { 'if-none-match': '"not-this-guide"' });
      assert.equal(stale.status, 200);
      assert.equal(header(stale, 'etag'), header(get, 'etag'));
      assert.deepEqual(stale.bytes, method === 'HEAD' ? Buffer.alloc(0) : get.bytes);
    }
    const direct = await builder.buildLlmsTxtBody(ORIGIN, locale, path === '/llms.txt');
    assert.equal(get.body, direct, 'HTTP handler must serve the real builder, not fallback-only or HTML');
    assertSameRepresentation(get, await http(api, path));
  });

  const alias = path.replace('llms.txt', 'llm.txt');
  test(`${alias}: GET/HEAD are single-hop absolute production 301s and discard hostile query/host input`, async () => {
    const query = '?next=https%3A%2F%2Fevil.invalid%2F&returnUrl=%2F%2Fevil.invalid&lang=de';
    const headers = { host: 'evil.invalid:9999', 'x-forwarded-host': 'forwarded.invalid', 'x-forwarded-proto': 'http', forwarded: 'host=other.invalid;proto=http', accept: 'text/html' };
    const get = await http(web, alias + query, 'GET', headers);
    assert.equal(get.status, 301);
    assertPlain(get);
    assert.equal(header(get, 'location'), ORIGIN + path);
    assert.equal(header(get, 'link'), `<${ORIGIN}${path}>; rel="canonical"`);
    assert.equal(header(get, 'content-language'), locale);
    assert.equal(header(get, 'x-fixture-downstream'), '');
    assert.doesNotMatch(get.body, /evil\.invalid|forwarded\.invalid|other\.invalid|returnUrl/);
    const head = await http(web, alias + query, 'HEAD', headers);
    assert.equal(head.status, 301);
    assert.equal(head.bytes.length, 0);
    for (const name of ['location', 'content-type', 'content-language', 'link', 'content-length']) assert.equal(header(head, name), header(get, name), name);
    assertSameRepresentation(get, await http(api, alias + query, 'GET', headers));
    const destination = new URL(header(get, 'location'));
    assert.equal(destination.origin, ORIGIN);
    assert.equal(destination.search, '');
    const canonical = await http(web, destination.pathname);
    assert.equal(canonical.status, 200, 'redirect target is a document, not another redirect');
    assert.equal(header(canonical, 'location'), '');
  });
}

test('all native HTTP editions retain real local blog membership, ten core guides, public URLs and the static 14-guide index offline', async () => {
  const bodies: string[] = [];
  for (const locale of LOCALES) {
    const result = await http(web, `/${locale}/llms.txt`);
    assertGuide(result, `/${locale}/llms.txt`, locale);
    bodies.push(result.body);
    const links = [...result.body.matchAll(/^- \[((?:\\.|[^\]\\])*)\]\((https:\/\/[^\s)]+)\)/gm)];
    assert.ok(links.length > 25, 'real navigation and editorial links are present');
    const urls = links.map(link => new URL(link[2]));
    assert.ok(urls.every(url => url.origin === ORIGIN && !url.search && !url.hash && !url.username && !url.password));
    for (const language of LOCALES) assert.ok(urls.some(url => url.pathname === `/${language}/llms.txt`), `${locale} indexes ${language} even without qualification`);
    for (const path of ['/sitemap-index.xml', '/robots.txt', `/${locale}`, `/${locale}/blog`]) assert.ok(urls.some(url => url.pathname === path), path);
    for (const route of ['/stations', '/genres', '/regions', '/applications', '/about', '/faq', '/contact', '/privacy-policy', '/terms-and-conditions']) {
      const expected = new URL(ORIGIN + buildLocalizedUrl(route, locale, undefined, new Map()));
      assert.ok(urls.some(url => url.pathname === expected.pathname), `${locale}: ${expected.pathname}`);
    }
    assert.ok(urls.every(url => url.pathname.endsWith('/llms.txt') || ['/sitemap-index.xml', '/robots.txt'].includes(url.pathname) || url.pathname.startsWith(`/${locale}/`) || url.pathname === `/${locale}`), 'navigation never crosses to an English fallback edition');
    assert.ok(urls.every(url => !/^\/(?:[a-z]{2}\/)?(?:api(?:\/|$)|api-docs|api-user|admin|profile|account|search|login)/i.test(url.pathname)));
    const articles = links.filter(link => new URL(link[2]).pathname.startsWith(`/${locale}/blog/`));
    const ids = articles.map(link => new URL(link[2]).pathname.split('/').at(-1)!);
    assert.equal(new Set(ids).size, ids.length, 'no duplicated blog links');
    assert.deepEqual(ids.filter(isCoreBlogId).sort(), [...BLOG_IDS].sort());
    assert.ok(ids.filter(id => !isCoreBlogId(id)).length <= 4, 'market article cap');
    const availableIds = new Set<string>(blogIdsForLocale(locale));
    assert.ok(ids.every(id => availableIds.has(id)), 'only actual available editions');
    const content = await loadBlogContent(locale);
    for (const article of articles) {
      const id = new URL(article[2]).pathname.split('/').at(-1)!;
      const editorial = content.articles.find(entry => entry.id === id)!;
      const label = article[1].replace(/\\(.)/g, '$1');
      const legacy = locale === 'en' && ['radio-data-usage', 'listen-to-radio-online'].includes(id);
      assert.equal(label, legacy ? id === 'radio-data-usage' ? 'Radio Data Usage' : 'Listen to Radio Online' : editorial.title);
    }
  }
  assert.equal(new Set(bodies).size, 14, 'each edition has distinct bytes; human native-copy review remains separate');
  assert.deepEqual(calls, { countries: 1, genres: 1, genreManifests: 1, genreDocs: 0, languages: 1, translations: 1 });
});

const invalidPaths = new Set([
  ...EDITIONS.flatMap(({ path }) => [path + '/', path + '/extra', path.toUpperCase(), path.replace('llms.txt', 'LLMS.txt'), path.replace('llms.txt', 'llm.txt/'), path.replace('llms.txt', 'LLM.txt')]),
  ...['af', 'sq', 'nl', 'sv', 'pl', 'xx', 'en-US', 'en_US', 'e', 'eng', '123'].flatMap(locale => [`/${locale}/llms.txt`, `/${locale}/llm.txt`]),
  '/EN/llms.txt', '/De/llm.txt', '/extra/en/llms.txt', '/en//llms.txt', '//llms.txt',
  '/en%2fllms.txt', '/en%2Fllm.txt', '/en/llms.txt%2f', '/en/%2Fllms.txt',
  '/%65n/llms.txt', '/en/%6clms.txt', '/%2Fen/llms.txt', '/en%5Cllms.txt',
  '/%/llms.txt', '/%ZZ/llm.txt', '/%E0%A4%A/llms.txt', '/en/%C0%AF/llm.txt',
]);
for (const path of invalidPaths) {
  test(`strict invalid document ${path} returns explicit non-cacheable plain 404 under GET and HEAD`, async () => {
    for (const method of ['GET', 'HEAD']) {
      const result = await http(web, path + '?lang=en&next=https://evil.invalid', method, { 'accept-language': 'en', 'user-agent': 'Googlebot' });
      assert.equal(result.status, 404);
      assertPlain(result);
      assert.equal(header(result, 'cache-control'), 'no-store');
      assert.equal(header(result, 'location'), '');
      assert.equal(header(result, 'x-fixture-downstream'), '', 'must never fall into SPA or language redirects');
      assert.doesNotMatch(header(result, 'link'), /rel="(?:canonical|describedby)".*llms\.txt/);
      assert.equal(result.bytes.length === 0, method === 'HEAD');
    }
  });
}

test('documents reject non-GET/HEAD methods with 405/no-store and Allow, not a home hint or SPA', async () => {
  for (const { path } of EDITIONS) {
    for (const document of [path, path.replace('llms.txt', 'llm.txt')]) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const result = await http(web, document, method);
        assert.equal(result.status, 405);
        assertPlain(result);
        assert.equal(header(result, 'cache-control'), 'no-store');
        assert.equal(header(result, 'allow'), 'GET, HEAD');
        assert.equal(header(result, 'location'), '');
        assert.equal(header(result, 'x-fixture-downstream'), '');
      }
    }
  }
});

for (const home of ['/', ...LOCALES.map(locale => `/${locale}`)]) {
  test(`${home}: cached home GET/HEAD appends exactly one describedby while preserving existing relations and response`, async () => {
    for (const method of ['GET', 'HEAD']) {
      const original = await http(baseline, home + '?cached=1', method);
      const result = await http(web, home + '?cached=1', method);
      assert.equal(result.status, original.status);
      assert.deepEqual(result.bytes, original.bytes);
      for (const name of ['content-type', 'content-length', 'etag', 'cache-control', 'x-fixture-cache', 'x-fixture-security', 'x-fixture-downstream', 'x-robots-tag']) assert.equal(header(result, name), header(original, name), name);
      const link = header(result, 'link');
      const document = home === '/' ? '/llms.txt' : `${home}/llms.txt`;
      for (const existing of EXISTING_LINKS) assert.ok(link.includes(existing), existing);
      assert.equal((link.match(/rel="describedby"/g) || []).length, 1);
      assert.ok(link.includes(`<${ORIGIN}${document}>; rel="describedby"`));
    }
  });
}

test('home discovery also preserves an existing scalar Link value and can be enabled after API-only registration', async () => {
  const scalar = express();
  scalar.use((_req, res, next) => { res.setHeader('Link', EXISTING_LINKS.join(', ')); next(); });
  registerLlmsTxtRoutes(scalar, { homeDiscovery: false });
  registerLlmsTxtRoutes(scalar, { homeDiscovery: true });
  registerLlmsTxtRoutes(scalar, { homeDiscovery: true });
  scalar.use((_req, res) => res.type('html').send(HOME_HTML));
  const result = await http(await listen(scalar), '/de');
  assert.equal(header(result, 'link'), `${EXISTING_LINKS.join(', ')}, <${ORIGIN}/de/llms.txt>; rel="describedby"`);
});

test('API-only registration does not invent homepage headers or a homepage', async () => {
  for (const home of ['/', ...LOCALES.map(locale => `/${locale}`)]) {
    for (const method of ['GET', 'HEAD']) {
      const result = await http(api, home, method);
      assert.equal(result.status, 404);
      assert.equal(header(result, 'link'), EXISTING_LINKS.join(', '));
      assert.equal(header(result, 'x-fixture-downstream'), 'reached');
    }
  }
});

test('non-home paths, trailing home slashes, private/noindex and unrelated SPA paths keep downstream behavior unchanged', async () => {
  for (const path of ['/de/', '/en/', '/EN', '/xx', '/de/stations', '/admin', '/admin/stations', '/profile', '/en/profile', '/auth/login', '/api/private', '/robots.txt', '/llms', '/en/llms', '/llms.txt.bak', '/unrelated/deep/path']) {
    for (const method of ['GET', 'HEAD']) {
      const original = await http(baseline, path, method);
      const result = await http(web, path, method);
      assertSameRepresentation(original, result);
      assert.equal(header(result, 'x-fixture-downstream'), 'reached');
      assert.doesNotMatch(header(result, 'link'), /describedby/);
    }
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    for (const path of ['/', ...LOCALES.map(locale => `/${locale}`)]) assertSameRepresentation(await http(baseline, path, method), await http(web, path, method));
  }
  assert.equal((await http(web, '/unrelated/deep/path')).body, SPA_HTML, 'negative control really reaches SPA');
});

test('pre-existing security controls run before documents and discovery and retain denial status/body/cache/noindex', async () => {
  for (const path of ['/', '/de', '/llms.txt', '/de/llms.txt', '/de/llm.txt', '/XX/llms.txt']) {
    for (const method of ['GET', 'HEAD']) {
      const headers = { 'x-fixture-block': 'yes' };
      const original = await http(baseline, path, method, headers);
      const result = await http(web, path, method, headers);
      assertSameRepresentation(original, result);
      assert.equal(result.status, 403);
      assert.equal(header(result, 'link'), '');
      assert.equal(header(result, 'x-fixture-downstream'), '');
    }
  }
});

test('document bytes, cache keys and language never vary with Host, UA, Accept, cookies or Accept-Language', async () => {
  for (const { path } of EDITIONS) {
    const original = await http(web, path);
    for (const headers of [
      { 'user-agent': 'Mozilla/5.0', 'accept-language': 'tr-TR,tr;q=0.9', cookie: 'preferredLanguage=tr', accept: 'text/html' },
      { 'user-agent': 'GPTBot', 'accept-language': 'de-DE', host: 'evil.invalid', 'x-forwarded-host': 'other.invalid', 'x-forwarded-proto': 'http' },
      { 'user-agent': 'Googlebot', 'accept-language': 'zz-ZZ', accept: 'application/json' },
    ]) {
      const result = await http(web, path + '?locale=fr&returnUrl=https://evil.invalid', 'GET', headers);
      assertSameRepresentation(original, result);
      assert.doesNotMatch(header(result, 'vary'), /User-Agent|Accept-Language|Cookie/i);
      assert.doesNotMatch(result.body, /evil\.invalid|other\.invalid/);
    }
  }
});

test('mixed-locale cold HTTP burst returns native real guides without waiting for any of the four optional sources', { timeout: 15000 }, async () => {
  sourceMode = 'pending';
  pending = new Promise<void>(resolve => { releasePending = resolve; });
  try {
    const results = await Promise.all(Array.from({ length: 100 }, (_, index) => {
      const edition = EDITIONS[index % EDITIONS.length];
      return http(index % 2 ? api : web, edition.path).then(result => { assertGuide(result, edition.path, edition.locale); return result; });
    }));
    assert.equal(results.length, 100);
    assert.deepEqual(calls, { countries: 1, genres: 1, genreManifests: 1, genreDocs: 0, languages: 1, translations: 1 });
  } finally {
    releasePending();
    await setImmediate();
  }
});

test('rejected optional discovery preserves localized 200 guides and stable validators instead of fabricated links or English', async () => {
  sourceMode = 'reject';
  for (const { path, locale } of EDITIONS) {
    const first = await http(web, path);
    assertGuide(first, path, locale);
    assertSameRepresentation(first, await http(web, path));
    assert.match(first.body, new RegExp(`https://themegaradio\\.com/${locale}/blog`));
  }
  assert.deepEqual(calls, { countries: 1, genres: 1, genreManifests: 1, genreDocs: 0, languages: 1, translations: 1 });
});

test('unexpected builder failure serves the pure native core with correct canonical, HEAD and validator behavior, never English fallback', async () => {
  const { buildLlmsTxtCoreBody } = await import('../src/seo/llms-txt-content');
  const failure = mock.module('../src/seo/llms-txt-builder', { namedExports: {
    buildLlmsTxtBody: async () => { throw new Error('Forced route fallback'); },
  } });
  try {
    for (const { path, locale } of EDITIONS) {
      const get = await http(web, path);
      assert.equal(get.status, 200);
      assertPlain(get);
      assert.equal(get.body, buildLlmsTxtCoreBody(locale));
      assert.equal(header(get, 'content-language'), locale);
      assert.equal(header(get, 'link'), `<${ORIGIN}${path}>; rel="canonical"`);
      assert.match(header(get, 'cache-control'), /^public, max-age=(?:300|3600)$/);
      const head = await http(web, path, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.bytes.length, 0);
      assert.equal(header(head, 'content-length'), String(get.bytes.length));
      assert.equal(header(head, 'etag'), header(get, 'etag'));
      const conditional = await http(web, path, 'GET', { 'if-none-match': header(get, 'etag') });
      assert.equal(conditional.status, 304);
      assert.equal(conditional.bytes.length, 0);
    }
    assert.deepEqual(calls, { countries: 0, genres: 0, genreManifests: 0, genreDocs: 0, languages: 0, translations: 0 }, 'fallback never invokes discovery providers');
  } finally {
    failure.restore();
  }
});

function allNodes(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node) => { nodes.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return nodes;
}

function isCall(node: ts.Node, name: string): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.getText() === name;
}

test('production web entry registers the common handler after security/health and before redirects/static/SSR; normal registrar includes API-only role', async () => {
  const webText = await readFile(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  const webSource = ts.createSourceFile('index-web.ts', webText, ts.ScriptTarget.Latest, true);
  const webNodes = allNodes(webSource);
  const registration = webNodes.find(node => isCall(node, 'registerLlmsTxtRoutes')) as ts.CallExpression | undefined;
  assert.ok(registration, 'real web entry must call the common registrar, not just import it');
  assert.ok(ts.isExpressionStatement(registration.parent), 'early registrar is not hidden in an uncalled function');
  assert.equal(registration.parent.parent, webSource, 'web registration executes at module startup');
  assert.equal(registration.arguments[0]?.getText(), 'app');
  assert.match(registration.arguments[1]?.getText() || '', /homeDiscovery\s*:\s*true/);
  for (const name of ['geoBlockMiddleware', 'createVisitorActivityMiddleware']) {
    const guard = webNodes.find(node => isCall(node, 'app.use') && node.arguments.some(arg => arg.getText().includes(name)));
    assert.ok(guard && guard.end < registration.pos, `${name} remains ahead of the guide registrar`);
  }
  const health = webNodes.find(node => isCall(node, 'app.get') && node.arguments[0]?.getText().includes('/healthz'));
  assert.ok(health && health.end < registration.pos, 'health registration remains ahead of guide registration');
  for (const name of ['urlRedirectMiddleware', 'express.static']) {
    const downstream = webNodes.find(node => isCall(node, 'app.use') && node.arguments.some(arg => arg.getText().includes(name)));
    assert.ok(downstream && downstream.pos > registration.end, `${name} cannot shadow guide responses`);
  }
  const staticCall = webNodes.find(node => isCall(node, 'serveStatic'));
  assert.ok(staticCall && staticCall.pos > registration.end);
  assert.equal(webNodes.filter(node => isCall(node, 'app.get') && /llms?\.txt/.test(node.arguments[0]?.getText() || '')).length, 0, 'no duplicate legacy inline guide handler');

  const seoText = await readFile(new URL('../src/routes/seo-sitemap-routes.ts', import.meta.url), 'utf8');
  const seoSource = ts.createSourceFile('seo-sitemap-routes.ts', seoText, ts.ScriptTarget.Latest, true);
  const registrar = seoSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'registerSeoSitemapRoutes') as ts.FunctionDeclaration | undefined;
  assert.ok(registrar?.body);
  const nodes = allNodes(registrar.body);
  const common = nodes.find(node => isCall(node, 'registerLlmsTxtRoutes')) as ts.CallExpression | undefined;
  const apiReturn = nodes.find(node => ts.isIfStatement(node) && /options\??\.apiOnly/.test(node.expression.getText()) && allNodes(node.thenStatement).some(ts.isReturnStatement));
  assert.ok(common && apiReturn && common.end < apiReturn.pos, 'common registration must precede API-only return');
  assert.ok(ts.isExpressionStatement(common.parent) && common.parent.parent === registrar.body, 'both roles reach common registration unconditionally');
  assert.match(common.arguments[1]?.getText() || '', /homeDiscovery\s*:\s*!options\??\.apiOnly/);
  assert.equal(nodes.filter(node => isCall(node, 'app.get') && /llms?\.txt/.test(node.arguments[0]?.getText() || '')).length, 0);
});
