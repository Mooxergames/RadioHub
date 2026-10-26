import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { ACTIVE_SITEMAP_LANGUAGES, COUNTRY_TO_LANGUAGE, SEO_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildPublicSeoRouteMatchers, decodePublicSeoPath } from '../src/seo/public-route-matchers';
import { sendSeoNotFound } from '../src/seo/send-seo-not-found';
import { isKnownSpaShellRoute } from '../src/seo/spa-shell-route';
import { serveStatic } from '../src/serve-static';

const matchers = buildPublicSeoRouteMatchers();
const eligible = (path: string) => Object.values(matchers).some(matcher => matcher.test(path));

test('public SSR never treats a slug prefix as a slashless locale', () => {
  for (const path of ['/sso', '/foo', '/ensso', '/enabout', '/trgenres', '/en/genresfake', '/genresfake', '/zz', '/zz/about', '/zz/station/real-fm', '/zz/blog']) {
    assert.equal(eligible(path), false, path);
  }
  for (const path of ['/', '/en', '/en/', '/en/about', '/about', '/cs/o', '/o', '/en/genres', '/en/genres/pop', '/genres/pop', '/en/station/real-fm', '/en/stations', '/en/country/germany']) {
    assert.equal(eligible(path), true, path);
  }
});

test('all existing translated public page segments retain SEO eligibility', () => {
  for (const [locale, translations] of Object.entries(URL_TRANSLATIONS)) {
    const prefix = locale.split('-')[0];
    for (const key of ['regions', 'genres', 'about', 'contact', 'privacy-policy', 'stations', 'station', 'search', 'faq', 'terms-and-conditions', 'applications', 'users']) {
      const segment = translations[key];
      if (segment) assert.equal(eligible(`/${prefix}/${segment}`), true, `${locale}:${key}`);
    }
  }
});

test('known language and country aliases remain valid, without inventing locales', () => {
  for (const locale of [...SEO_LANGUAGES.filter(language => language.enabled).map(language => language.code), ...Object.keys(COUNTRY_TO_LANGUAGE)]) {
    assert.equal(eligible(`/${locale}/about`), true, locale);
  }
});

test('community SSR covers exact roots in all14 languages, never private descendants', () => {
  for (const language of ACTIVE_SITEMAP_LANGUAGES) {
    const root = URL_TRANSLATIONS[language]?.users || 'users';
    assert.equal(matchers.usersPage.test(`/${language}/${root}`), true, language);
    assert.equal(eligible(`/${language}/${root}/someone`), false, language);
    assert.equal(eligible(`/${language}/profile/settings`), false, language);
    assert.equal(eligible(`/${language}/recommendations`), false, language);
  }
});

test('SSR decoding preserves segment boundaries and ignores query payloads', () => {
  for (const path of ['/en/station%2Freal-fm', '/en/station%5Creal-fm', '/en/station/real%2Ffm', '/en/users%3Fpage=2', '/en/users%23part', '/en/%00about', '/en/%E0%A4%A', '/%65n/about', '/%61bout', '/%2565n/about']) {
    assert.equal(decodePublicSeoPath(path), null, path);
  }
  for (const language of ACTIVE_SITEMAP_LANGUAGES) {
    const root = URL_TRANSLATIONS[language]?.users || 'users';
    const decoded = decodePublicSeoPath(`/${language}/${encodeURIComponent(root)}`);
    assert.equal(decoded, `/${language}/${root}`);
    assert.equal(matchers.usersPage.test(decoded!), true);
  }
  assert.equal(decodePublicSeoPath('/en/login?token=a%2Fb%23c&return=%2Fen'), '/en/login');
  assert.equal(decodePublicSeoPath('/en/station%252Freal-fm'), '/en/station%2Freal-fm');
  assert.equal(eligible(decodePublicSeoPath('/en/station%252Freal-fm')!), false);
});

test('unprefixed translated SPA roots are recognized without another decoding pass', () => {
  for (const language of ['tr', 'de']) {
    for (const key of ['login', 'users', 'profile', 'notifications']) {
      const root = URL_TRANSLATIONS[language]?.[key];
      assert.ok(root, `${language}:${key}`);
      assert.equal(isKnownSpaShellRoute(`/${root}`), true, `${language}:${key}`);
    }
  }
  for (const path of ['/en/station%252Freal-fm', '/en/station%25252Freal-fm']) {
    assert.equal(isKnownSpaShellRoute(path), false, path);
  }
});

test('web SSR uses the tested matchers and unknown SSO probes reach a real404', async () => {
  const source = readFileSync(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  assert.match(source, /\.\.\.buildPublicSeoRouteMatchers\(\)/);
  assert.match(source, /const cleanUrlForMatching = decodePublicSeoPath\(url\)/);
  assert.match(source, /isApplicationsPage \|\| isUsersPage/);
  assert.match(source, /req.method !== 'GET' && req.method !== 'HEAD'/);
  const app = express();
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.sendStatus(405);
    if (decodePublicSeoPath(req.originalUrl) === null) return sendSeoNotFound(res, 'Not found');
    next();
  });
  const directory = mkdtempSync(join(tmpdir(), 'public-route-matchers-'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Mega Radio</title>');
  serveStatic(app, directory);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const address = server.address() as { port: number };
    for (const path of ['/sso', '/sso/', '/en/sso', '/zz', '/zz/about', '/en/station%2Freal-fm', '/en/station%5Creal-fm', '/en/station%252Freal-fm', '/en/station%25252Freal-fm', '/%65n/about', '/%61bout', '/%2565n/about']) {
      assert.equal(eligible(path), false, path);
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', path);
      assert.equal(response.headers.get('cache-control'), 'no-store', path);
      await response.text();
      const head = await fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'HEAD' });
      assert.equal(head.status, 404, path);
      assert.equal(head.headers.get('x-robots-tag'), 'noindex, follow', path);
      assert.equal(await head.text(), '');
    }
    const post = await fetch(`http://127.0.0.1:${address.port}/en/users`, { method: 'POST' });
    assert.equal(post.status, 405);
    await post.text();
    for (const path of ['/en/login?token=a%2Fb', '/en/profile/settings', '/auth/login', '/tv', '/en/tv', '/activate/success']) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 200, path);
      await response.text();
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
