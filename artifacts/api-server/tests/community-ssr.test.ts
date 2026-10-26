import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildCommunityPageSeo } from '@workspace/seo-shared/community-page-seo-templates';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { buildLocalizedUrl } from '../src/seo/url-helpers';

const origin = 'https://themegaradio.com';
const pageCache = new Map<string, any>();
const urlMap = new Map(Object.entries(URL_TRANSLATIONS).flatMap(([language, values]) =>
  Object.entries(values).map(([key, value]) => [`${language}:${key}`, value] as [string, string])));
let translations: Record<string, string> = {};
let metadata: Record<string, any> | null = null;
let unexpectedReads = 0;
const forbiddenRead = () => { unexpectedReads++; throw new Error('Community SSR must not read private profiles or a real database'); };
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: forbiddenRead } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  find: forbiddenRead, findOne: forbiddenRead, count: forbiddenRead, groupCount: forbiddenRead,
}) } });
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: (key: string) => pageCache.get(key),
  setPageData: (key: string, value: any) => pageCache.set(key, value),
  getTranslations: () => translations,
  getUrlTranslations: async () => urlMap,
} } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => metadata } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES],
} });
mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();

beforeEach(() => { pageCache.clear(); translations = {}; metadata = null; unexpectedReads = 0; });
const decode = (text: string) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const communityH1 = (language: string) => buildCommunityPageSeo('users', language, translations).title
  .split(' \u2014 ')[0].replace(/\s*\|\s*Mega\s+Radio\s*$/i, '').trim();
function renderBody(page: any) {
  return renderer.generateHtmlBody({ pageType: page.pageData.pageType, language: page.language,
    translations: page.translations, seoTags: page.seoTags, cleanPath: page.cleanPath,
    urlTranslations: page.urlTranslations, additionalData: page.pageData.additionalData });
}

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: only the community directory root receives its localized community H1`, async () => {
    const path = buildLocalizedUrl('/users', language, undefined, urlMap);
    const page = await renderer.renderStaticPage(path, origin);
    assert.equal(page.pageData.pageType, 'users');
    assert.equal(page.cleanPath, '/users');
    assert.equal(page.seoTags.canonical, origin + path);
    assert.equal(page.seoTags.robots, 'index, follow');
    assert.notEqual(page.seoTags.noIndex, true);
    assert.ok(page.seoTags.hreflangs.some((entry: any) => entry.lang === language && entry.url === origin + path));
    const body = renderBody(page);
    assert.equal((body.match(/<h1\b/g) || []).length, 1);
    assert.equal(decode(/<h1[^>]*>(.*?)<\/h1>/s.exec(body)![1]), communityH1(language));
    assert.doesNotMatch(body, /Mega Radio: Listen to Free Live Radio &amp; Music<\/h1>/);
    assert.match(body, /class="users-intro"/);
    assert.equal(unexpectedReads, 0);
    assert.equal(await renderer.renderStaticPage(path, origin), page, 'cached directory metadata/body are unchanged');
  });

  test(`${language}: personal profile paths remain noindex without reading profile data`, async () => {
    metadata = { noIndex: false };
    for (const cleanPath of ['/users/private-listener', '/users/private-listener/favorites', '/profile/settings']) {
      const path = buildLocalizedUrl(cleanPath, language, undefined, urlMap);
      const page = await renderer.renderStaticPage(path, origin);
      assert.equal(page.pageData.pageType, 'utility', path);
      assert.equal(page.seoTags.noIndex, true, path);
      assert.equal(page.seoTags.robots, 'noindex, follow', path);
      assert.deepEqual(page.seoTags.hreflangs, [], path);
      assert.doesNotMatch(renderBody(page), /class="users-intro"/);
    }
    assert.equal(unexpectedReads, 0, 'neither public nor private profile data is fetched by generic SEO rendering');
  });

  test(`${language}: personalized recommendations keep noindex/follow and no alternates`, async () => {
    metadata = { noIndex: false };
    const path = buildLocalizedUrl('/recommendations', language, undefined, urlMap);
    for (let pass = 0; pass < 2; pass++) {
      const page = await renderer.renderStaticPage(path, origin);
      assert.equal(page.pageData.pageType, 'recommendations');
      assert.equal(page.seoTags.noIndex, true);
      assert.equal(page.seoTags.robots, 'noindex, follow');
      assert.deepEqual(page.seoTags.hreflangs, []);
      const head = renderer.generateHtmlHead(page.seoTags, language, page.translations,
        page.cleanPath, undefined, page.urlTranslations, page.pageData);
      assert.match(head, /<meta name="robots" content="noindex, follow">/);
      assert.doesNotMatch(head, /<link rel="alternate" hreflang=/);
    }
    assert.equal(unexpectedReads, 0);
  });
}

test('community H1 uses existing localized community translations and is escaped once', async () => {
  translations = { users_page_title: 'Listeners <&> "Curators" | Mega Radio',
    users_page_description: 'Public community directory description.', hero_worlds_best_radio: 'Wrong homepage heading' };
  const page = await renderer.renderStaticPage('/en/users', origin);
  const body = renderBody(page);
  assert.match(body, /<h1>Listeners &lt;&amp;&gt; &quot;Curators&quot;<\/h1>/);
  assert.doesNotMatch(body, /Wrong homepage heading/);
  assert.equal(unexpectedReads, 0);
});

test('a published community noindex override remains authoritative without affecting public body content', async () => {
  metadata = { noIndex: true, noFollow: true };
  const page = await renderer.renderStaticPage('/en/users', origin);
  assert.equal(page.seoTags.robots, 'noindex, nofollow');
  assert.equal(page.seoTags.noIndex, true);
  assert.deepEqual(page.seoTags.hreflangs, []);
  assert.equal(decode(/<h1[^>]*>(.*?)<\/h1>/s.exec(renderBody(page))![1]), communityH1('en'));
  assert.equal(unexpectedReads, 0);
});
