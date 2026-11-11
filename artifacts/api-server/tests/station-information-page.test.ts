import { test, mock, before } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_SITEMAP_LANGUAGES, generateSeoTags } from '@workspace/seo-shared/seo-config';
import { getStationInformationCopy, getStationStreamUnavailableNotice } from '@workspace/seo-shared/station-page-copy';
import { generateRadioStationSchema } from '@workspace/seo-shared/structured-data';
import { selectStationVisibleDescription } from '@workspace/seo-shared/station-description-template';
import { renderStationBootstrap } from '../src/seo/station-bootstrap';

mock.module(new URL('../src/performance-cache.ts', import.meta.url).href, { namedExports: {
  performanceCache: { getTranslations: () => null, setTranslations: () => {},
    getPageData: () => null, setPageData: () => {}, getUrlTranslations: async () => new Map(),
    getStats: () => ({ hits: 0, misses: 0 }) }, PerformanceCache: class {}, deepFreeze: <T,>(v: T) => v,
} });
let SeoRenderer: any;
before(async () => { ({ SeoRenderer } = await import('../src/seo-renderer')); });
const article = 'Verified Radio served its local community with interviews and cultural programmes. Its official history documents the founding team and programme schedule.';
const station = { _id: 'verified', slug: 'verified', name: 'Verified Radio', country: 'Austria',
  stationPageMode: 'information', isListVisible: false, url: '', homepage: 'https://example.org',
  descriptions: { en: { full: article, meta: 'STALE LIVE CLAIM' } } };
const domain = 'https://themegaradio.com';
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

for (const language of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${language}: explicit information mode has neutral head, body, schema and bootstrap`, () => {
    const renderer = new SeoRenderer();
    const translations = { 'radio_playing_page.title': 'STALE LIVE CLAIM', seo_station_intro_sentence: 'STALE LIVE CLAIM', seo_station_outro_sentence: 'STALE LIVE CLAIM' };
    const tags = generateSeoTags('station', language, translations, '/station/verified', domain, station);
    const copy = getStationInformationCopy(language, station.name);
    for (const key of ['title', 'ogTitle', 'twitterTitle'] as const) assert.ok(tags[key]?.startsWith(copy.title));
    for (const key of ['description', 'ogDescription', 'twitterDescription'] as const) assert.equal(tags[key], copy.description);
    const body = renderer.generateHtmlBody({ pageType: 'station', language, stationData: station, translations,
      seoTags: tags, cleanPath: '/station/verified', urlTranslations: new Map(), additionalData: {} });
    assert.ok(body.includes(escape(copy.intro)));
    assert.ok(body.includes(article));
    assert.ok(body.includes(escape(getStationStreamUnavailableNotice(language, station))));
    assert.doesNotMatch(body, /STALE LIVE CLAIM|class="station-outro"/);
    const schemas = renderer.generateStructuredData(tags, language, translations, '/station/verified', station, new Map(), { pageType: 'station' });
    assert.ok(schemas.page.some((s: any) => s['@type'] === 'RadioBroadcastService'));
    assert.doesNotMatch(JSON.stringify(schemas), /ListenAction|STALE LIVE CLAIM/);
    assert.equal(generateRadioStationSchema(station, 'themegaradio.com', language).potentialAction, undefined);
    const html = renderStationBootstrap(station, language);
    const payload = JSON.parse(html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
    assert.equal(payload.station.stationPageMode, 'information');
    assert.equal(payload.station.isListVisible, false);
    assert.equal(payload.station.url, '');
    assert.equal(selectStationVisibleDescription(payload.station, language, 'Austria'), article);
  });
}
test('ordinary unavailable records retain existing titles and actions; sparse information records do not invent articles', () => {
  const normal = { ...station, stationPageMode: undefined };
  const tags = generateSeoTags('station', 'en', {}, '/station/verified', domain, normal);
  assert.match(tags.title, /Listen/i);
  assert.ok(generateRadioStationSchema(normal, 'themegaradio.com', 'en').potentialAction);
  assert.match(getStationStreamUnavailableNotice('en', normal), /temporarily/);
  assert.equal(selectStationVisibleDescription({ ...station, descriptions: {} }, 'en', 'Austria'), '');
});
