import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { blogIdsForLocale, blogPath, type BlogLocale } from '@workspace/seo-shared/blog-manifest';
import copy from '../src/seo/llms-locales.json';

let now = 1_000_000;
const calls = { countries: 0, genres: 0, languages: 0, translations: 0 };
let countries: () => Promise<any>;
let genres: () => Promise<any>;
let languages: () => Promise<any>;
let translations: () => Promise<Map<string, string>>;
let failBlog = false;
const blogCalls = new Map<string, number>();
const loadedBlogs = new Map<string, Awaited<ReturnType<typeof actualBlog.loadBlogContent>>>();
const actualBlog = await import('@workspace/seo-shared/blog');
mock.module('@workspace/seo-shared/blog', { namedExports: {
  ...actualBlog,
  loadBlogContent: async (locale: BlogLocale) => {
    blogCalls.set(locale, (blogCalls.get(locale) || 0) + 1);
    if (failBlog) throw new Error('local module unavailable');
    const content = structuredClone(await actualBlog.loadBlogContent(locale));
    loadedBlogs.set(locale, content);
    return content;
  },
} });

mock.module('../src/data/postgres-seo-indexing-store', { namedExports: {
  pgTopIndexableTags: () => { calls.genres++; return genres(); },
} });
mock.module('../src/seo/sitemap-manifest-builder', { namedExports: {
  getActiveManifest: () => { calls.countries++; return countries(); },
  extractTopCountriesFromChunk: (entries: any[]) => entries,
} });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: () => { calls.languages++; return languages(); },
} });
mock.module('../src/performance-cache', { namedExports: {
  performanceCache: { getUrlTranslations: () => { calls.translations++; return translations(); } },
} });
mock.module('../src/utils/logger', { namedExports: { logger: { warn() {} } } });
const { buildLlmsTxtBody, clearLlmsTxtCache } = await import('../src/seo/llms-txt-builder');
const base = 'https://themegaradio.com';

function assertCoreDiscovery(body: string): void {
  assert.match(body, /\[All Stations\]\(https:\/\/themegaradio\.com\/en\/stations\)/);
  assert.match(body, /\[Radio Data Usage\]\(https:\/\/themegaradio\.com\/en\/blog\/radio-data-usage\)/);
  assert.match(body, /\[Listen to Radio Online\]\(https:\/\/themegaradio\.com\/en\/blog\/listen-to-radio-online\)/);
  assert.match(body, /API access is subject to existing API-key and authorization requirements/);
  assert.match(body, /Sign in to manage API keys and usage information in a developer account/);
  assert.doesNotMatch(body, /\/api-docs|\/api-user|\/api\/|\/admin|\/profile|\/en\/radios|requires? an? account|account required/i);
  assert.doesNotMatch(body, /<html|<!doctype|fair use|freely accessible for AI training|citations? (?:are )?guaranteed/i);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  clearLlmsTxtCache(); now = 1_000_000;
  calls.countries = calls.genres = calls.languages = calls.translations = 0;
  blogCalls.clear(); loadedBlogs.clear(); failBlog = false;
  countries = async () => ({ chunks: [{ stationIds: [{ regionSlug: 'europe', countrySlug: 'germany' }] }] });
  genres = async () => [{ _id: 'rock', count: 12 }, { _id: 'not-a-public-genre', count: 9 }];
  languages = async () => ['en', 'de', 'tr'];
  translations = async () => new Map();
  mock.method(Date, 'now', () => now);
});
afterEach(() => { clearLlmsTxtCache(); mock.restoreAll(); });

test('cold concurrent reads return a real core guide without waiting for any database source', { timeout: 1000 }, async () => {
  const pending = deferred<any>();
  countries = genres = languages = translations = () => pending.promise;
  const bodies = await Promise.all(Array.from({ length: 100 }, () => buildLlmsTxtBody(base)));
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(calls, { countries: 1, genres: 1, languages: 1, translations: 1 }, 'one shared refresh, not 100 aggregations');
  assert.match(bodies[0], /^# MegaRadio\n/);
  assert.match(bodies[0], /\[Sitemap Index\]\(https:\/\/themegaradio\.com\/sitemap-index\.xml\)/);
  assertCoreDiscovery(bodies[0]);
  assert.doesNotMatch(bodies[0], /Genre Directories|Country Directories/);
  pending.resolve([]); await setImmediate();
});

test('completed refresh supplies only measured, whitelisted optional links and qualified locales', async () => {
  const first = await buildLlmsTxtBody(base);
  assert.doesNotMatch(first, /Genre Directories/);
  await setImmediate();
  const enriched = await buildLlmsTxtBody(base);
  assertCoreDiscovery(enriched);
  assert.match(enriched, /\/en\/genres\/rock/);
  assert.match(enriched, /\/en\/regions\/europe\/germany/);
  assert.match(enriched, /\/de\/llms\.txt/);
  assert.match(enriched, /\/tr\/llms\.txt/);
  assert.doesNotMatch(enriched, /not-a-public-genre/);
  assert.deepEqual(calls, { countries: 1, genres: 1, languages: 1, translations: 1 });
  assert.equal(await buildLlmsTxtBody(base + '/'), enriched);
});

test('expired reads keep the complete guide available while one background refresh runs', async () => {
  await buildLlmsTxtBody(base); await setImmediate();
  const previous = await buildLlmsTxtBody(base);
  assertCoreDiscovery(previous);
  now += 6 * 60 * 60 * 1000 + 1;
  const pending = deferred<any>(); genres = () => pending.promise;
  assert.equal(await buildLlmsTxtBody(base), previous);
  assert.equal(await buildLlmsTxtBody(base), previous);
  assert.equal(calls.genres, 2);
  pending.resolve([{ _id: 'jazz', count: 15 }]); await setImmediate();
  assert.match(await buildLlmsTxtBody(base), /\/en\/genres\/jazz/);
  assert.doesNotMatch(await buildLlmsTxtBody(base), /\/en\/genres\/rock/);
});

test('failed optional sources do not fabricate a ranked whitelist sample and retry after one minute', async () => {
  countries = genres = languages = async () => { throw new Error('database unavailable'); };
  const core = await buildLlmsTxtBody(base); await setImmediate();
  assertCoreDiscovery(core);
  assert.equal(await buildLlmsTxtBody(base), core);
  assert.doesNotMatch(core, /Genre Directories|Country Directories|\/en\/genres\/pop/);
  assert.equal(calls.genres, 1);
  now += 60_001;
  countries = async () => null;
  languages = async () => ['en'];
  genres = async () => [{ _id: 'jazz', count: 12 }];
  await buildLlmsTxtBody(base); await setImmediate();
  assert.equal(calls.genres, 2);
  assert.match(await buildLlmsTxtBody(base), /\/en\/genres\/jazz/);
});

test('failed stale refresh retains the last verified guide instead of erasing its optional links', async () => {
  await buildLlmsTxtBody(base); await setImmediate();
  const previous = await buildLlmsTxtBody(base);
  now += 6 * 60 * 60 * 1000 + 1;
  genres = async () => { throw new Error('database unavailable'); };
  await buildLlmsTxtBody(base); await setImmediate();
  assert.equal(await buildLlmsTxtBody(base), previous);
  assertCoreDiscovery(await buildLlmsTxtBody(base));
  assert.equal(calls.genres, 2);
});

test('clearing the cache prevents an old in-flight refresh from republishing obsolete results', async () => {
  const pending = deferred<any>(); genres = () => pending.promise;
  await buildLlmsTxtBody(base);
  clearLlmsTxtCache();
  genres = async () => [{ _id: 'jazz', count: 12 }];
  await buildLlmsTxtBody(base); await setImmediate();
  pending.resolve([{ _id: 'rock', count: 20 }]); await setImmediate();
  const body = await buildLlmsTxtBody(base);
  assertCoreDiscovery(body);
  assert.match(body, /\/en\/genres\/jazz/);
  assert.doesNotMatch(body, /\/en\/genres\/rock/);
});

test('guide uses current supported locale scope and real homepage link, without unverified quotas or refresh guarantees', async () => {
  languages = async () => ['en', 'de', 'af', 'xx'];
  await buildLlmsTxtBody(base); await setImmediate();
  const body = await buildLlmsTxtBody(base);
  assertCoreDiscovery(body);
  assert.match(body, /web interface available in 14 languages/);
  assert.match(body, /\[Popular Stations\]\(https:\/\/themegaradio\.com\/en\)/);
  assert.doesNotMatch(body, /57 languages|Top 100|\/en\/popular|1,000 requests|updated daily|verified stream|\/af\/|\/xx\//);
});

test('100 mixed-locale and mixed-origin cold reads share all four discovery providers and local imports', { timeout: 2000 }, async () => {
  const pending = deferred<any>();
  countries = genres = languages = translations = () => pending.promise;
  const results = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
    const locale = ACTIVE_SITEMAP_LANGUAGES[index % ACTIVE_SITEMAP_LANGUAGES.length];
    const origin = `https://origin-${index % 5}.example.invalid`;
    return { locale, origin, body: await buildLlmsTxtBody(origin, locale, false) };
  }));
  assert.deepEqual(calls, { countries: 1, genres: 1, languages: 1, translations: 1 });
  assert.equal(blogCalls.size, 14);
  assert.ok([...blogCalls.values()].every(count => count === 1));
  for (const { locale, origin, body } of results) {
    assert.ok(body.includes(copy[locale].summary));
    assert.ok(body.includes(`${origin}/${locale}/blog`));
    assert.equal((body.match(/^# /gm) || []).length, 1);
    assert.doesNotMatch(body, /Country Directories|Genre Directories|\/api\/|\/admin|\/profile|<html|\uFFFD/);
  }
  pending.resolve([]); await setImmediate();
});

test('every native guide links ten real core articles and only its available market editions', async () => {
  const summaries = new Set<string>();
  for (const locale of ACTIVE_SITEMAP_LANGUAGES) {
    const body = await buildLlmsTxtBody(base, locale, false);
    summaries.add(copy[locale].summary);
    assert.ok(body.includes(copy[locale].summary));
    const content = await actualBlog.loadBlogContent(locale);
    const available = new Set(blogIdsForLocale(locale));
    const linkedArticles = [...body.matchAll(/\]\(https:\/\/themegaradio\.com(\/[^)]+\/blog\/[^)]+)\)/g)].map(match => match[1]);
    assert.ok(linkedArticles.length >= 10 && linkedArticles.length <= 14);
    for (const path of linkedArticles) {
      const article = content.articles.find(entry => blogPath(locale, entry.id) === path);
      assert.ok(article && available.has(article.id), `no invented ${locale} edition: ${path}`);
      assert.ok(body.includes(article.description));
    }
    assert.deepEqual(new Set([...body.matchAll(/https:\/\/themegaradio\.com\/([a-z]{2})\/llms\.txt/g)].map(match => match[1])), new Set(ACTIVE_SITEMAP_LANGUAGES));
    assert.doesNotMatch(body, /\/search|\/login|\/api-docs|\/api-user|\/api\/|\/admin|60,000|120\+|guaranteed citations|guaranteed uptime/i);
    const roundTrip = Buffer.from(body).toString('utf8');
    assert.equal(roundTrip, body);
  }
  assert.equal(summaries.size, 14);
});

test('discovery uses DB route translations but never translates genre, country or blog identifiers', async () => {
  translations = async () => new Map([
    ['tr:stations', 'radyo-dizini'], ['tr:genres', 'muzik'], ['tr:regions', 'ulkeler'],
    ['tr:privacy-policy', 'gizlilik-guncel'], ['tr:rock', 'yanlis-tur'],
    ['tr:germany', 'yanlis-ulke'], ['tr:radio-data-usage', 'yanlis-yazi'],
  ]);
  await buildLlmsTxtBody(base, 'tr', false); await setImmediate();
  const body = await buildLlmsTxtBody(base, 'tr', false);
  assert.ok(body.includes('/tr/radyo-dizini)'));
  assert.ok(body.includes('/tr/muzik/rock)'));
  assert.ok(body.includes('/tr/ulkeler/europe/germany)'));
  assert.ok(body.includes('/tr/gizlilik-guncel)'));
  assert.ok(body.includes('/tr/blog/radio-data-usage)'));
  assert.doesNotMatch(body, /yanlis-/);
});

test('qualification failure retains every native guide and its language index, without optional locale claims', async () => {
  languages = async () => { throw new Error('qualification unavailable'); };
  await buildLlmsTxtBody(base, 'he', false); await setImmediate();
  const body = await buildLlmsTxtBody(base, 'he', false);
  assert.ok(body.includes(copy.he.summary));
  assert.ok(body.includes('/he/llms.txt'));
  assert.doesNotMatch(body, /\/genres\/rock|\/europe\/germany/);
  assert.match(body, /%20/); // Existing Hebrew privacy fallback is percent-encoded.
});

test('unqualified editions omit optional directories without suppressing qualified editions', async () => {
  languages = async () => ['en', 'xx', 'am'];
  await buildLlmsTxtBody(base); await setImmediate();
  const english = await buildLlmsTxtBody(base);
  const turkish = await buildLlmsTxtBody(base, 'tr', false);
  assert.match(english, /\/en\/genres\/rock/);
  assert.doesNotMatch(turkish, /\/turler\/rock|\/europe\/germany/);
  assert.ok(turkish.includes(copy.tr.summary));
});

test('failed local blog imports return the native core and are retried rather than cached forever', async () => {
  failBlog = true;
  const core = await buildLlmsTxtBody(base, 'ja', false);
  assert.ok(core.includes(copy.ja.summary));
  assert.ok(core.includes('/ja/blog)'));
  assert.doesNotMatch(core, /\/blog\/listen-to-radio-online/);
  failBlog = false;
  const recovered = await buildLlmsTxtBody(base, 'ja', false);
  assert.ok(recovered.includes('/ja/blog/listen-to-radio-online)'));
  assert.equal(blogCalls.get('ja'), 2);
});

test('body origin cache is bounded and refresh invalidation does not multiply discovery work', async () => {
  const pending = deferred<any>();
  countries = genres = languages = translations = () => pending.promise;
  const first = await buildLlmsTxtBody('https://first.example.invalid', 'tr', false);
  for (let i = 0; i < 65; i++) await buildLlmsTxtBody(`https://bounded-${i}.example.invalid`, 'tr', false);
  const last = await buildLlmsTxtBody('https://bounded-64.example.invalid', 'tr', false);
  loadedBlogs.get('tr')!.articles.find(article => article.id === 'listen-to-radio-online')!.title = 'Yeni editoryal etiket';
  assert.equal(await buildLlmsTxtBody('https://bounded-64.example.invalid', 'tr', false), last);
  const evicted = await buildLlmsTxtBody('https://first.example.invalid', 'tr', false);
  assert.notEqual(evicted, first);
  assert.ok(evicted.includes('Yeni editoryal etiket'));
  assert.deepEqual(calls, { countries: 1, genres: 1, languages: 1, translations: 1 });
  pending.resolve([]); await setImmediate();
});

test('invalid origins and root/locale identities cannot poison another edition', async () => {
  for (const origin of ['javascript:alert(1)', 'https://user:secret@example.invalid', 'not a URL']) {
    await assert.rejects(buildLlmsTxtBody(origin));
  }
  await assert.rejects(buildLlmsTxtBody(base, 'am' as any, false));
  await assert.rejects(buildLlmsTxtBody(base, 'tr', true));
  assertCoreDiscovery(await buildLlmsTxtBody(base));
});

test('editorial line breaks and Markdown link delimiters cannot inject links or headings', async () => {
  const content = await actualBlog.loadBlogContent('tr');
  mock.restoreAll(); // Date mocking is not required by this pure renderer assertion.
  const { renderLlmsTxtBody } = await import('../src/seo/llms-txt-content');
  const altered = structuredClone(content);
  altered.articles[0].title = 'Title](https://attacker.invalid)\n## injected';
  altered.articles[0].description = 'Description\r\n# injected';
  const body = renderLlmsTxtBody(base, 'tr', undefined, altered);
  assert.doesNotMatch(body, /^#+ injected/m);
  assert.ok(body.includes('Title\\](https://attacker.invalid) ## injected'));
  assert.equal((body.match(/^# /gm) || []).length, 1);
});
