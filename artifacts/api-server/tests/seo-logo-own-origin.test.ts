import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { generateSeoTags } from '@workspace/seo-shared/seo-config';
import { STATION_LOGOS_S3_BASE_URL } from '@workspace/seo-shared/station-logo-url';

mock.module(new URL('../src/performance-cache.ts', import.meta.url).href, { namedExports: {
  performanceCache: { getTranslations: () => null, setTranslations() {}, getPageData: () => null,
    setPageData() {}, getUrlTranslations: async () => new Map(), getStats: () => ({ hits: 0, misses: 0 }) },
  PerformanceCache: class {}, deepFreeze: <T,>(value: T) => value,
} });
const { SeoRenderer } = await import('../src/seo-renderer');
const renderer = new SeoRenderer();
const origin = 'https://themegaradio.com';
const ownPath = '/station-logos/mangoradio_11ab228c/logo-256.webp';
const source = `${STATION_LOGOS_S3_BASE_URL}/mangoradio_11ab228c/logo-256.webp`;
const station = { _id: '507f1f77bcf86cd799439011', slug: 'mangoradio', name: 'MANGO & Friends',
  country: 'Germany', countryCode: 'DE', tags: 'pop', favicon: source,
  logoAssets: { status: 'completed', webp256: source } };

for (const language of ['en', 'de', 'tr', 'es', 'fr', 'pt', 'it', 'ru', 'ar', 'zh', 'ja', 'ko', 'hi', 'he']) {
  test(`${language} SSR, JSON-LD and social metadata use the owned logo URL and station name`, () => {
    const tags = generateSeoTags('station', language, {}, '/station/mangoradio', origin, station);
    assert.equal(tags.ogImage, origin + ownPath);
    assert.equal(tags.twitterImage, origin + ownPath);
    const body = renderer.generateHtmlBody({ pageType: 'station', language, translations: {}, stationData: station,
      cleanPath: '/station/mangoradio', seoTags: tags });
    assert.ok(body.includes(`src="${ownPath}"`));
    assert.match(body, /alt="[^"]*MANGO &amp; Friends/);
    const data = renderer.generateStructuredData(tags, language, {}, '/station/mangoradio', station);
    const broadcast = data.page.find(entity => entity['@type'] === 'RadioBroadcastService');
    assert.equal(broadcast.image, origin + ownPath);
    assert.equal(broadcast.logo, origin + ownPath);
    const head = renderer.generateHtmlHead(tags, language, {}, '/station/mangoradio', station);
    assert.ok(head.includes(`content="${origin}/api/og-image/mangoradio"`));
    assert.ok(head.includes(`content="${origin}${ownPath}"`));
  });
}

test('home popular-station SSR and structured image entries agree on the same owned source', () => {
  const tags = generateSeoTags('home', 'en', {}, '/', origin);
  const extra = { pageType: 'home', popularStations: [station] };
  const body = renderer.generateHtmlBody({ pageType: 'home', language: 'en', translations: {}, additionalData: extra });
  assert.ok(body.includes(`src="${ownPath}"`));
  assert.match(body, /alt="MANGO &amp; Friends/);
  const data = renderer.generateStructuredData(tags, 'en', {}, '/', undefined, undefined, extra);
  const list = data.page.find(entity => entity['@type'] === 'ItemList');
  assert.equal(list.itemListElement[0].item.image, origin + ownPath);
});

test('favicon-only owned logos and nested variants use the same mapping without inventing keys', () => {
  const nested = `${STATION_LOGOS_S3_BASE_URL}/radio_12345678/variants/12345678-1234-1234-1234-123456789abc/logo-96.webp`;
  for (const fixture of [{ ...station, logoAssets: undefined },
    { ...station, logoAssets: { webp96: nested } }]) {
    const expected = fixture.logoAssets ? nested.replace(STATION_LOGOS_S3_BASE_URL, '/station-logos') : ownPath;
    const body = renderer.generateHtmlBody({ pageType: 'station', language: 'en', translations: {}, stationData: fixture });
    assert.ok(body.includes(`src="${expected}"`));
    const data = renderer.generateStructuredData({ canonical: origin + '/en/station/mangoradio' }, 'en', {}, '/station/mangoradio', fixture);
    assert.equal(data.page.find(entity => entity['@type'] === 'RadioBroadcastService').image, origin + expected);
  }
});

test('unknown external logo URLs retain their existing metadata behavior', () => {
  const external = 'https://logos.example/radio/logo-256.webp';
  const fixture = { ...station, logoAssets: { webp256: external } };
  const tags = generateSeoTags('station', 'en', {}, '/station/mangoradio', origin, fixture);
  assert.equal(tags.ogImage, external);
  const body = renderer.generateHtmlBody({ pageType: 'station', language: 'en', translations: {}, stationData: fixture });
  assert.ok(body.includes(`src="${external}"`));
});
