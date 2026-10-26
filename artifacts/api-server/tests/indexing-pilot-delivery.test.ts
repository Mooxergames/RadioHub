import { after, before, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { INDEXING_PILOT } from '../src/seo/indexing-pilot';

let fixture: any;
const cache = new Map<string, any>();
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: () => null, setPageData: () => {}, getTranslations: () => ({}),
  getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  findOne: async () => fixture, find: async () => [], count: async () => 0,
  groupCount: async () => [], findMergedAlias: async () => null,
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/services/precomputed-genres', { namedExports: { PrecomputedGenresService: {} } });
mock.module('../src/seo/qualified-languages', { namedExports: {
  getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES],
} });
const reads = await import('../src/data/station-read-store');
mock.module('../src/data/station-read-store', { namedExports: { ...reads, getStationByIdentifier: async () => fixture } });
mock.module('../src/public-station-cache', { namedExports: { publicStationCache: {
  get: async (key: string) => cache.get(key), set: async (key: string, value: any) => { cache.set(key, value); },
} } });
mock.module('../src/middleware/public-station-cache', { namedExports: {
  publicStationResponseCache: (_req: any, _res: any, next: () => void) => next(),
} });

const { SeoRenderer } = await import('../src/seo-renderer');
const { registerPublicStationRoutes } = await import('../src/routes/station-public-routes');
const renderer = new SeoRenderer();
let server: Server;
let baseUrl: string;
before(async () => {
  const app = express();
  registerPublicStationRoutes(app, { requireAdmin: (_req: any, res: any) => res.sendStatus(403) });
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { if (server) await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => { cache.clear(); });

for (const profile of INDEXING_PILOT) {
  test(`${profile.slug}: real SSR metadata, hydration, body and detail API deliver the same reviewed English copy`, async () => {
    fixture = {
      _id: profile.id, slug: profile.slug, name: profile.slug, countryCode: profile.countryCode,
      country: profile.countryCode === 'AT' ? 'Austria' : 'Türkiye',
      noIndex: false, isListVisible: true, redirectToSlug: null, lastCheckOk: true,
      url: 'https://stream.example.test/live', bitrate: 128, tags: '', manualEditFields: {},
      descriptions: { en: { full: 'Old generated article', meta: 'Old metadata' }, tr: { full: 'Turkce', meta: 'Turkce' } },
    };
    const original = structuredClone(fixture);
    const rendered = await renderer.renderStaticPage(`/en/station/${profile.slug}`, 'https://themegaradio.com');
    assert.equal(rendered.seoTags.description, profile.meta);
    assert.equal(rendered.pageData.station.descriptions.en.full, profile.full);
    const body = renderer.generateHtmlBody({ pageType: 'station', language: 'en', translations: {},
      seoTags: rendered.seoTags, stationData: rendered.pageData.station, additionalData: {} });
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    assert.ok(body.includes(escape(profile.full.split('\n\n')[0])));
    assert.ok(body.includes(`href="${escape(profile.homepage)}"`));
    const response = await fetch(`${baseUrl}/api/station/${profile.slug}`);
    assert.equal(response.status, 200);
    const api = await response.json() as any;
    assert.deepEqual(api.descriptions, rendered.pageData.station.descriptions);
    assert.equal(api.homepage, profile.homepage);
    assert.equal(api.url, fixture.url);
    assert.equal(api.noIndex, false);
    assert.equal(Object.hasOwn(api, 'manualEditFields'), false, 'private editorial protection is not a public API field');
    assert.deepEqual(fixture, original, 'neither delivery path mutates a cached database row');
  });
}
