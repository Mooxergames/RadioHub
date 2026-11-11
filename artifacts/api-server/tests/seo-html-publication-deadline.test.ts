import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type NodeCache from 'node-cache';
import express from 'express';
import {
  capturePublicStationDeadline,
  getPublicStationDeadline,
  limitPublicStationDeadline,
  withPublicStationDeadline,
} from '../src/utils/public-station-deadline';
import { markSeoTemporarilyUnavailable } from '../src/seo/temporary-unavailable';
import type { StaticPageData } from '../src/seo-renderer';

const START = 2_000_000;
const origin = 'https://themegaradio.com';
const route = '/en';
let now = START;
let catalogReads = 0;
let forbiddenPoolAccesses = 0;
let inventory = 'Original';
let translationFailure: Error | undefined;

// No renderer, PerformanceCache, NodeCache, deadline helper or HTTP status
// helper is replaced. All data/metadata/navigation inputs remain local.
mock.module('../src/postgres-runtime', { namedExports: {
  getPostgresPool: () => {
    forbiddenPoolAccesses++;
    throw new Error('Real PostgreSQL access is forbidden in this test');
  },
} });
mock.module('../src/data/postgres-seo-read-store', { namedExports: { pgSeoCatalog: () => ({
  find: async () => {
    catalogReads++;
    await Promise.resolve();
    limitPublicStationDeadline(Date.now() + 60_000);
    return Array.from({ length: 12 }, (_, i) => ({
      _id: `publication-${inventory}-${i}`, name: `${inventory} Radio ${i}`,
      slug: `publication-${inventory.toLowerCase()}-${i}`,
      url: 'https://stream.example.invalid/live', country: 'Germany', countryCode: 'DE',
      noIndex: false, isListVisible: true, votes: 1000 - i, tags: 'pop,70s',
    }));
  },
}) } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/data/postgres-localization-store', { namedExports: { pgLocalization: () => ({
  getTranslations: async () => {
    await Promise.resolve();
    if (translationFailure) throw translationFailure;
    return {};
  },
  listUrlTranslations: async () => [],
}) } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => [] } });
mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => ['en'] } });

const { SeoRenderer, getSeoRenderStats } = await import('../src/seo-renderer');
const { performanceCache, SEO_CACHE_NAMESPACE } = await import('../src/performance-cache');
const renderer = new SeoRenderer();
const caches = performanceCache as unknown as { pageDataCache: NodeCache; seoHtmlCache: NodeCache };
const pageKey = (url = route) => `page:${SEO_CACHE_NAMESPACE}:${url}`;
const htmlKey = (url = route) => `seo:${SEO_CACHE_NAMESPACE}:bot:${url}`;
const captureRender = (url = route) => capturePublicStationDeadline(() => renderer.renderStaticPage(url, origin));

function html(page: StaticPageData): string {
  assert.equal(getPublicStationDeadline(), Infinity, 'HTML generation is outside the render ALS scope');
  const head = renderer.generateHtmlHead(page.seoTags, page.language, page.translations,
    page.cleanPath, page.pageData?.station, page.urlTranslations, page.pageData);
  const body = renderer.generateHtmlBody({
    pageType: page.pageData.pageType, language: page.language, translations: page.translations,
    stationData: page.pageData.station, additionalData: page.pageData.additionalData,
    seoTags: page.seoTags, urlTranslations: page.urlTranslations, cleanPath: page.cleanPath,
  });
  assert.equal(getPublicStationDeadline(), Infinity);
  return `<!doctype html><html lang="${page.language}"><head>${head}</head><body>${body}</body></html>`;
}

async function firstReadAndPageHit(hitAt = START + 55_000) {
  const first = await captureRender();
  assert.equal(catalogReads, 1);
  assert.equal(first.expiresAt, START + 60_000);
  assert.equal(caches.pageDataCache.getTtl(pageKey()), first.expiresAt);
  assert.equal(getPublicStationDeadline(), Infinity);
  const json = JSON.stringify(first.value);
  now = hitAt;
  const hit = await captureRender();
  assert.equal(catalogReads, 1, 'second render must be a real page-data cache HIT');
  assert.equal(hit.value, first.value, 'real useClones:false page cache returns the stored object');
  assert.equal(hit.expiresAt, first.expiresAt);
  assert.equal(JSON.stringify(hit.value), json);
  assert.equal(getPublicStationDeadline(), Infinity);
  return hit;
}

beforeEach(t => {
  now = START; catalogReads = 0; inventory = 'Original'; translationFailure = undefined;
  forbiddenPoolAccesses = 0;
  t.mock.method(Date, 'now', () => now);
  performanceCache.clearAll();
});

afterEach(() => {
  assert.equal(getPublicStationDeadline(), Infinity, 'no request/helper context may escape to its caller');
  assert.equal(getSeoRenderStats().active, 0);
  assert.equal(forbiddenPoolAccesses, 0, 'even a swallowed unexpected database access fails this fixture');
  performanceCache.clearAll();
});

test('capture observes the deadline after awaited work and does not alter its value or leak ALS', async () => {
  const gate = Promise.withResolvers<void>();
  const value = { marker: 'unchanged JSON' };
  const pending = capturePublicStationDeadline(async () => {
    assert.equal(getPublicStationDeadline(), Infinity);
    await gate.promise;
    limitPublicStationDeadline(START + 4321);
    return value;
  });
  assert.equal(getPublicStationDeadline(), Infinity);
  gate.resolve();
  const captured = await pending;
  assert.equal(captured.value, value);
  assert.deepEqual(captured, { value, expiresAt: START + 4321 });
  assert.deepEqual(value, { marker: 'unchanged JSON' });
  assert.equal(getPublicStationDeadline(), Infinity);
});

test('capture retains a pre-existing earlier public deadline and isolates concurrent captures', async () => {
  await withPublicStationDeadline(async () => {
    limitPublicStationDeadline(START + 1000);
    const result = await capturePublicStationDeadline(async () => {
      await Promise.resolve();
      limitPublicStationDeadline(START + 5000);
      return 'nested';
    });
    assert.deepEqual(result, { value: 'nested', expiresAt: START + 1000 });
    assert.equal(getPublicStationDeadline(), START + 1000);
  });
  const results = await Promise.all([2000, 7000].map(duration => capturePublicStationDeadline(async () => {
    await Promise.resolve();
    limitPublicStationDeadline(START + duration);
    await Promise.resolve();
    return duration;
  })));
  assert.deepEqual(results, [
    { value: 2000, expiresAt: START + 2000 }, { value: 7000, expiresAt: START + 7000 },
  ]);
});

test('capture preserves an asynchronous error and cleans up its public deadline', async () => {
  const original = new Error('fixture asynchronous failure');
  await assert.rejects(capturePublicStationDeadline(async () => {
    await Promise.resolve();
    limitPublicStationDeadline(START + 1);
    throw original;
  }), error => error === original);
  assert.equal(getPublicStationDeadline(), Infinity);
  assert.deepEqual(await capturePublicStationDeadline(async () => 'healthy'), { value: 'healthy', expiresAt: Infinity });
});

test('actual renderer failure leaves no page, HTML, active render or leaked context and can recover', async () => {
  translationFailure = new Error('fixture translation unavailable');
  await assert.rejects(captureRender(), error => error === translationFailure);
  assert.equal(getPublicStationDeadline(), Infinity);
  assert.equal(performanceCache.getPageData(route), null);
  assert.equal(performanceCache.getSeoHtml(route), null);
  assert.equal(getSeoRenderStats().active, 0);
  translationFailure = undefined;
  const recovered = await captureRender();
  assert.equal(recovered.value.pageData.additionalData.popularStations.length, 10);
  assert.equal(recovered.expiresAt, START + 60_000);
});

test('real renderer/page HIT retains the original JSON shape; captured deadline is only a sidecar', async () => {
  const result = await firstReadAndPageHit();
  assert.deepEqual(Object.keys(result.value).sort(),
    ['cleanPath', 'language', 'pageData', 'seoTags', 'translations', 'urlTranslations']);
  const serialized = JSON.stringify(result.value);
  assert.doesNotMatch(serialized, /"(?:expiresAt|sourceExpiresAt|publicStationDeadline)":/);
  const direct = await renderer.renderStaticPage(route, origin);
  assert.equal(direct, result.value);
  assert.equal(catalogReads, 1);
  assert.equal(JSON.stringify(direct), serialized);
  assert.match(html(result.value), /Original Radio 0/);
});

test('at a 55-second real page HIT, explicit publication outside ALS retains only five seconds after eviction', async () => {
  const result = await firstReadAndPageHit();
  caches.pageDataCache.del(pageKey());
  assert.equal(performanceCache.getPageData(route), null);
  const content = html(result.value);
  performanceCache.setSeoHtml(route, content, 'bot', result.expiresAt);
  assert.equal(getPublicStationDeadline(), Infinity);
  assert.equal(performanceCache.getSeoHtml(route), content);
  assert.equal(caches.seoHtmlCache.getTtl(htmlKey()), START + 60_000);
  assert.equal(caches.seoHtmlCache.getTtl(htmlKey())! - now, 5000);
  now = result.expiresAt + 1;
  assert.equal(performanceCache.getSeoHtml(route), null);
});

for (const paired of ['expired', 'evicted'] as const) {
  test(`real render/HIT then ${paired} page pair cannot publish renewed HTML outside ALS`, async () => {
    const result = await firstReadAndPageHit(START + 59_999);
    if (paired === 'evicted') caches.pageDataCache.del(pageKey());
    now = result.expiresAt + 1;
    assert.equal(performanceCache.getPageData(route), null);
    assert.equal(caches.pageDataCache.getTtl(pageKey()), undefined);
    const content = html(result.value);
    assert.match(content, /Original Radio 0/, 'the stale content really exists before publication is refused');
    performanceCache.setSeoHtml(route, content, 'bot', result.expiresAt);
    assert.equal(caches.seoHtmlCache.getTtl(htmlKey()), undefined);
    assert.equal(performanceCache.getSeoHtml(route), null, 'must not receive another 60 seconds');
    assert.equal(catalogReads, 1);
  });
}

test('setSeoHtml uses the earliest paired, current ALS and explicit source deadlines', async () => {
  for (const [label, pairedMs, contextMs, explicitMs, expectedMs] of [
    ['explicit', 60_000, 10_000, 2000, 2000],
    ['paired', 1000, 10_000, 20_000, 1000],
    ['context', 60_000, 500, 2000, 500],
  ] as const) {
    const url = `/en/publication-${label}`;
    await withPublicStationDeadline(async () => {
      limitPublicStationDeadline(START + pairedMs);
      performanceCache.setPageData(url, { pageData: { pageType: 'home' } });
    });
    await withPublicStationDeadline(async () => {
      limitPublicStationDeadline(START + contextMs);
      performanceCache.setSeoHtml(url, '<main>bounded</main>', 'bot', START + explicitMs);
    });
    assert.equal(caches.seoHtmlCache.getTtl(htmlKey(url)), START + expectedMs, label);
  }
});

test('informational renderer data and omitted explicit deadline retain existing HTML defaults', async () => {
  const about = await captureRender('/en/about');
  assert.equal(about.value.pageData.pageType, 'about');
  assert.equal(about.expiresAt, Infinity);
  performanceCache.setSeoHtml('/en/about', html(about.value));
  assert.equal(caches.seoHtmlCache.getTtl(htmlKey('/en/about')), START + 1_800_000);
  performanceCache.setSeoHtml('/en/unpaired-default', '<main>unchanged default</main>');
  assert.equal(caches.seoHtmlCache.getTtl(htmlKey('/en/unpaired-default')), START + 60_000);
  assert.equal(catalogReads, 0);
});

// This fixture mirrors only the render/capture/publication/status boundary.
// It deliberately does not boot index-web or claim full server integration.
async function httpFixture(beforePublication: (deadline: number) => void) {
  const app = express();
  const captures: Array<{ sourceExpiresAt: number; callerDeadline: number }> = [];
  app.use(async (req, res, next) => {
    try {
      const { value: page, expiresAt: sourceExpiresAt } = await captureRender(req.path);
      captures.push({ sourceExpiresAt, callerDeadline: getPublicStationDeadline() });
      const content = html(page);
      beforePublication(sourceExpiresAt);
      if (page.pageData?.stationDbError || sourceExpiresAt <= Date.now()) {
        markSeoTemporarilyUnavailable(res);
        res.type('html').send('<main>Temporarily unavailable</main>');
        return;
      }
      performanceCache.setSeoHtml(req.path, content, 'bot', sourceExpiresAt);
      res.status(200).type('html').send(content);
    } catch (error) { next(error); }
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    listening.once('error', reject);
  });
  return {
    captures,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${route}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

for (const method of ['GET', 'HEAD']) {
  for (const paired of ['expired', 'evicted'] as const) {
    test(`${method}: expired captured source with ${paired} pair is 503/no-store and next healthy request recovers 200`, async () => {
      const first = await captureRender();
      now = START + 59_999;
      let expireBeforePublication = true;
      const fixture = await httpFixture(deadline => {
        if (!expireBeforePublication) return;
        if (paired === 'evicted') caches.pageDataCache.del(pageKey());
        // Exact boundary with eviction; natural NodeCache expiry just past it.
        now = deadline + (paired === 'expired' ? 1 : 0);
      });
      try {
        const failed = await fetch(fixture.url, { method });
        assert.equal(failed.status, 503);
        assert.equal(failed.headers.get('cache-control'), 'no-store');
        assert.equal(failed.headers.get('retry-after'), '60');
        assert.equal(failed.headers.get('x-robots-tag'), null);
        const failedBody = await failed.text();
        assert.equal(failedBody, method === 'HEAD' ? '' : '<main>Temporarily unavailable</main>');
        assert.equal(performanceCache.getSeoHtml(route), null);
        assert.equal(caches.seoHtmlCache.getTtl(htmlKey()), undefined);
        assert.equal(catalogReads, 1, 'failed HTTP request used the real page-data HIT');
        assert.deepEqual(fixture.captures[0], { sourceExpiresAt: first.expiresAt, callerDeadline: Infinity });
        assert.equal(performanceCache.getPageData(route), null);

        expireBeforePublication = false;
        inventory = 'Recovered';
        const recovered = await fetch(fixture.url, { method });
        assert.equal(recovered.status, 200);
        assert.equal(recovered.headers.get('retry-after'), null);
        assert.notEqual(recovered.headers.get('cache-control'), 'no-store');
        const recoveredBody = await recovered.text();
        if (method === 'HEAD') assert.equal(recoveredBody, '');
        else assert.match(recoveredBody, /Recovered Radio 0/);
        assert.equal(catalogReads, 2, 'recovery must perform a new healthy catalog read');
        assert.match(performanceCache.getSeoHtml(route)!, /Recovered Radio 0/);
        assert.doesNotMatch(performanceCache.getSeoHtml(route)!, /Original Radio 0/);
        assert.equal(caches.seoHtmlCache.getTtl(htmlKey()), now + 60_000);
        assert.deepEqual(fixture.captures[1], { sourceExpiresAt: now + 60_000, callerDeadline: Infinity });
      } finally { await fixture.close(); }
    });
  }
}

test('index-web sole HTML writer explicitly carries the captured deadline and guards expired source before publication', () => {
  const source = readFileSync(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  assert.match(source, /const\s*\{\s*value:\s*seoData,\s*expiresAt:\s*sourceExpiresAt\s*\}\s*=\s*await capturePublicStationDeadline\(\s*\(\)\s*=>\s*seoRenderer\.renderStaticPage\(url,\s*productionDomain\)/);
  const guard = /if\s*\(seoData\.pageData\?\.stationDbError\s*\|\|\s*sourceExpiresAt\s*<=\s*Date\.now\(\)\)\s*\{\s*markSeoTemporarilyUnavailable\(res\);/.exec(source);
  assert.ok(guard, 'expiry shares the existing critical-failure status/header branch');
  const writers = [...source.matchAll(/performanceCache\.setSeoHtml\s*\(/g)];
  assert.equal(writers.length, 1, 'every actual web HTML cache write is covered by this handoff contract');
  assert.match(source.slice(writers[0].index), /^performanceCache\.setSeoHtml\(seoHtmlKey,\s*htmlContent,\s*'bot',\s*sourceExpiresAt\)/);
  assert.ok(guard.index < writers[0].index!);
});
