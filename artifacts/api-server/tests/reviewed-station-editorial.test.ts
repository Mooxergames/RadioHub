import { before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { REVIEWED_STATION_EDITORIALS } from '@workspace/seo-shared/station-editorial';
const { JSDOM } = createRequire(new URL('../../megaradio/package.json', import.meta.url))('jsdom');

mock.module(new URL('../src/performance-cache.ts', import.meta.url).href, {
  namedExports: {
    performanceCache: { getTranslations: () => null, setTranslations() {}, getPageData: () => null,
      setPageData() {}, getUrlTranslations: async () => new Map(), getStats: () => ({ hits: 0, misses: 0 }) },
    PerformanceCache: class {}, deepFreeze: <T,>(value: T) => value,
  },
});

let renderer: import('../src/seo-renderer').SeoRenderer;
before(async () => { renderer = new (await import('../src/seo-renderer')).SeoRenderer(); });
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

test('the full reviewed cohort has matching visible and structured descriptions without database reads', () => {
  assert.equal(REVIEWED_STATION_EDITORIALS.length, 109);
  for (const editorial of REVIEWED_STATION_EDITORIALS) {
    const station = { _id: editorial.stationId, slug: editorial.slug, name: editorial.slug,
      country: 'Germany', tags: 'pop', descriptions: { [editorial.language]: { full: 'Old unreviewed copy.' } } };
    const additionalData = { stationEditorialPath: editorial.path };
    const canonical = 'https://themegaradio.com' + editorial.path;
    const tags = { title: editorial.title || station.name, description: editorial.metaDescription || editorial.summary, canonical };
    const body = renderer.generateHtmlBody({ pageType: 'station', language: editorial.language,
      translations: {}, stationData: station, seoTags: tags, additionalData });
    const dom = new JSDOM(body);
    const visibleText = Array.from(dom.window.document.querySelectorAll('p'),
      (node: any) => node.textContent).join(' ').replace(/\s+/gu, ' ').trim();
    assert.ok(visibleText.includes(editorial.summary.replace(/\s+/gu, ' ').trim()), editorial.path);
    dom.window.close();
    assert.ok(!body.includes('Old unreviewed copy.'), editorial.path);
    for (const section of editorial.sections) for (const paragraph of section.paragraphs) {
      assert.ok(body.includes(esc(paragraph)), `${editorial.path}: missing paragraph`);
    }
    for (const item of editorial.questions) {
      assert.ok(body.includes(`<summary>${esc(item.question)}</summary>`), editorial.path);
      assert.ok(body.includes(esc(item.answer)), editorial.path);
    }
    const schema = renderer.generateStructuredData(tags, editorial.language, {}, '', station, new Map(), additionalData);
    const service = schema.page.find(item => item['@type'] === 'RadioBroadcastService');
    assert.equal(service?.description, editorial.summary, editorial.path);
    assert.ok(!schema.page.some(item => item['@type'] === 'FAQPage'), 'FAQ rich results are not promised');
    assert.equal((body.match(/<h1[ >]/g) || []).length, 1, editorial.path);
  }
});

test('a matching identity at an unreviewed path retains its original body and schema copy', () => {
  for (const editorial of REVIEWED_STATION_EDITORIALS) {
    const station = { _id: editorial.stationId, slug: editorial.slug, name: 'Same station',
      country: 'Germany', descriptions: { [editorial.language]: { full: 'Original alias copy remains.' } } };
    const additionalData = { stationEditorialPath: `/${editorial.language}/stations/${editorial.stationId}` };
    const tags = { title: station.name, canonical: 'https://themegaradio.com' + additionalData.stationEditorialPath };
    const body = renderer.generateHtmlBody({ pageType: 'station', language: editorial.language,
      translations: {}, stationData: station, seoTags: tags, additionalData });
    assert.ok(body.includes('Original alias copy remains.'), editorial.path);
    assert.ok(!body.includes('class="station-editorial"'), editorial.path);
    const schema = renderer.generateStructuredData(tags, editorial.language, {}, '', station, new Map(), additionalData);
    assert.equal(schema.page.find(item => item['@type'] === 'RadioBroadcastService')?.description,
      'Original alias copy remains.', editorial.path);
  }
});
