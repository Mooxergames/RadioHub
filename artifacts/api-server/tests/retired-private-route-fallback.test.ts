import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { COUNTRY_TO_LANGUAGE, SEO_LANGUAGES, getLanguageFromPath, getRetiredLocaleFromPath } from '@workspace/seo-shared/seo-config';
import { countryPrefixRedirectMiddleware } from '../src/middleware/country-prefix-redirect';
import { createSlugShape404Middleware } from '../src/middleware/slug-shape-404';
import { buildPublicSeoRouteMatchers, collectSeoTranslations, decodePublicSeoPath } from '../src/seo/public-route-matchers';

let server: Server;
let baseUrl: string;
before(async () => {
  const app = express();
  const matchers = Object.values(buildPublicSeoRouteMatchers());
  app.use(countryPrefixRedirectMiddleware);
  // Mirror the SSR eligibility boundary, then exercise the actual downstream
  // validator. A private SPA shell must never be mistaken for public SSR.
  app.use((req, res, next) => {
    const decoded = decodePublicSeoPath(req.originalUrl);
    if (decoded === null) return void res.status(404).end();
    const matchingPath = getRetiredLocaleFromPath(req.path)
      ? `/en${getLanguageFromPath(req.path).cleanPath.replace(/^\/$/, '')}` : decoded;
    if (matchers.some(matcher => matcher.test(matchingPath))) {
      res.set('X-Fixture-Kind', 'public-ssr').send('Public SSR fixture');
      return;
    }
    res.set('X-Robots-Tag', 'noindex, follow');
    next();
  });
  app.use(createSlugShape404Middleware({
    regionsAlts: collectSeoTranslations('regions'), genresAlts: collectSeoTranslations('genres'),
    stationSingularAlts: collectSeoTranslations('station'), stationsPluralAlts: collectSeoTranslations('stations'),
  }, { isSlugExistenceReady: () => false }));
  app.use((_req, res) => res.set({ 'X-Fixture-Kind': 'private-spa', 'Cache-Control': 'private, no-store' }).send('Private SPA shell fixture'));
  server = await new Promise<Server>(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const request = (path: string, method = 'GET') => fetch(baseUrl + path, { method, redirect: 'manual' });
const languages = new Set(SEO_LANGUAGES.filter(row => row.enabled).map(row => row.code));
const aliases = Object.entries(COUNTRY_TO_LANGUAGE).filter(([country]) => !languages.has(country) && getRetiredLocaleFromPath(`/${country}`));

for (const [country, language] of aliases) {
  test(`${country}: private routes retain the existing ${language} redirect and noindex SPA status`, async () => {
    for (const path of ['/login', '/auth/login', '/profile', '/profile/settings', '/profile/messages']) {
      for (const method of ['GET', 'HEAD']) {
        const suffix = `${path}?returnTo=%2Fen%2Fprofile%2Fsettings`;
        const response = await request(`/${country}${suffix}`, method);
        assert.equal(response.status, 301, `${country}${path} ${method}`);
        assert.equal(response.headers.get('location'), `/${language}${suffix}`);
        const target = await request(response.headers.get('location')!, method);
        assert.equal(target.status, 200);
        assert.equal(target.headers.get('x-fixture-kind'), 'private-spa');
        assert.equal(target.headers.get('x-robots-tag'), 'noindex, follow');
        assert.match(target.headers.get('cache-control') || '', /private.*no-store/);
      }
    }
  });
  test(`${country}: public homepage and station stay at the historical address`, async () => {
    for (const path of ['', '/station/safe-fm']) {
      const response = await request(`/${country}${path}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('location'), null);
      assert.equal(response.headers.get('x-fixture-kind'), 'public-ssr');
    }
  });
}
test('actual locale private pages and fabricated prefixes retain their existing gates', async () => {
  for (const locale of ['nl', 'sv', 'sr', 'en', 'de']) {
    const response = await request(`/${locale}/login`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-fixture-kind'), 'private-spa');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  }
  for (const prefix of ['qq', 'zz']) {
    const response = await request(`/${prefix}/profile`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-fixture-kind'), null);
  }
  const activeCountry = await request('/at/login?source=test');
  assert.equal(activeCountry.status, 301);
  assert.equal(activeCountry.headers.get('location'), '/de/login?source=test');
});
