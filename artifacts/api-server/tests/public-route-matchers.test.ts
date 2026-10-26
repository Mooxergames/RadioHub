import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { buildPublicSeoRouteMatchers } from '../src/seo/public-route-matchers';
import { serveStatic } from '../src/serve-static';

const matchers = buildPublicSeoRouteMatchers();
const eligible = (path: string) => Object.values(matchers).some(matcher => matcher.test(path));

test('public SSR never treats a slug prefix as a slashless locale', () => {
  for (const path of ['/sso', '/foo', '/ensso', '/enabout', '/trgenres', '/en/genresfake', '/genresfake']) {
    assert.equal(eligible(path), false, path);
  }
  for (const path of ['/', '/en', '/en/', '/en/about', '/about', '/cs/o', '/o', '/en/genres', '/en/genres/pop', '/genres/pop', '/en/station/real-fm', '/en/stations', '/en/country/germany']) {
    assert.equal(eligible(path), true, path);
  }
});

test('all existing translated public page segments retain SEO eligibility', () => {
  for (const [locale, translations] of Object.entries(URL_TRANSLATIONS)) {
    const prefix = locale.split('-')[0];
    for (const key of ['regions', 'genres', 'about', 'contact', 'privacy-policy', 'stations', 'station', 'search', 'faq', 'terms-and-conditions', 'applications']) {
      const segment = translations[key];
      if (segment) assert.equal(eligible(`/${prefix}/${segment}`), true, `${locale}:${key}`);
    }
  }
});

test('web SSR uses the tested matchers and unknown SSO probes reach a real404', async () => {
  const source = readFileSync(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  assert.match(source, /\.\.\.buildPublicSeoRouteMatchers\(\)/);
  const app = express();
  const directory = mkdtempSync(join(tmpdir(), 'public-route-matchers-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Mega Radio</title>');
  serveStatic(app, directory);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address() as { port: number };
    for (const path of ['/sso', '/sso/', '/en/sso']) {
      assert.equal(eligible(path), false, path);
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', path);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
      await response.text();
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
