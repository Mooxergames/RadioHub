import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { getStationInformationCopy } from '@workspace/seo-shared/station-page-copy';
import { evaluateJunkStation } from '../src/seo/junk-station-rules';
import { renderStationBootstrap } from '../src/seo/station-bootstrap';
import { sendJunkGone } from '../src/seo/send-junk-gone';

let record: any;
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: () => null, setPageData: () => {}, getTranslations: () => ({}), getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  findOne: async () => record, find: async () => [], count: async () => 0, groupCount: async () => [], findMergedAlias: async () => null,
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => ({ title: 'STALE LIVE CLAIM', description: 'STALE LIVE CLAIM', ogTitle: 'STALE LIVE CLAIM' }) } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES] } });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
const article = 'Verified Radio was founded by a local cultural association. Its documented programmes covered community interviews, regional news and music. The official station archive identifies its presenters and original schedule. A current online stream has not been verified.';
const fixture = () => ({ _id: 'verified', slug: 'verified', name: 'Verified Radio', url: '', stationPageMode: 'information',
  country: 'Austria', isListVisible: false, noIndex: false, manualEditFields: { isListVisible: true, url: true },
  descriptions: Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(lang => [lang, { full: article, meta: 'Verified station history and programme information.' }])) });

// Exercise the actual renderer's lookup, quality gates and head generation,
// then the same response branches and bootstrap serializer used by index-web.
async function renderResponse(language: string): Promise<Response> {
  const page = await renderer.renderStaticPage(`/${language}/${URL_TRANSLATIONS[language]?.station || 'station'}/verified`, 'https://themegaradio.com');
  let status = 200;
  let body = '';
  const headers = new Headers();
  if (page.pageData?.stationIsJunk || page.pageData?.notFound) {
    const res: any = { status: (value: number) => { status = value; return res; },
      removeHeader: (name: string) => headers.delete(name),
      set: (values: Record<string, string>) => { for (const [name, value] of Object.entries(values)) headers.set(name, value); return res; },
      send: (value: string) => { body = value; return res; }, end: () => res, req: { method: 'GET' } };
    sendJunkGone(res);
  } else {
    assert.equal(page.pageData?.stationDbError, undefined);
    assert.equal(page.pageData?.redirectTo, undefined);
    body = renderer.generateHtmlHead(page.seoTags, language, {}, page.cleanPath, page.pageData?.station)
      + renderer.generateHtmlBody({ pageType: 'station', language, translations: {}, seoTags: page.seoTags, stationData: page.pageData?.station })
      + renderStationBootstrap(page.pageData?.station, language);
  }
  return new Response(body, { status, headers });
}
test('all14: empty-URL information pages return200 with article, neutral head and bootstrap after real quality gates', async () => {
  record = fixture();
  for (const language of ACTIVE_SITEMAP_LANGUAGES) {
    const response = await renderResponse(language);
    assert.equal(response.status, 200, language);
    const html = await response.text();
    assert.ok(html.includes(article));
    assert.ok(html.includes(getStationInformationCopy(language, record.name).title));
    assert.doesNotMatch(html, /ListenAction|STALE LIVE CLAIM/);
    const bootstrap = html.match(/<script id="station-bootstrap" type="application\/json">(.*?)<\/script>/)?.[1];
    assert.ok(bootstrap);
    const payload = JSON.parse(bootstrap);
    assert.equal(payload.station.url, '');
    assert.equal(payload.station.stationPageMode, 'information');
    assert.equal(payload.station.isListVisible, false);
  }
});
test('information exception does not bypass missing identity, test feeds or manual SEO exclusions', async () => {
  for (const patch of [{ name: '' }, { name: 'Test Stream', slug: 'test-stream' }, { stationPageMode: undefined },
    { noIndex: true, manualEditFields: { noIndex: true } }]) {
    record = { ...fixture(), ...patch };
    assert.equal((await renderResponse('en')).status, 410);
  }
  assert.equal(evaluateJunkStation({ ...fixture(), name: '彩条测试' }).isJunk, true);
});
