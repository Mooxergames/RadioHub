import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { isPublicTvAccessRequest } from '../src/middleware/public-tv-access';
import { privateApiCachePolicy } from '../src/middleware/cache-policy';

// Exercise the actual country guard, including CF-only enforcement, without
// calling production or altering the caller's persisted environment.
const previousBlocked = process.env.BLOCKED_COUNTRIES;
const previousEnforce = process.env.ENFORCE_CF_ONLY;
process.env.BLOCKED_COUNTRIES = 'SG,TH';
process.env.ENFORCE_CF_ONLY = 'true';
const { geoBlockMiddleware } = await import('../src/middleware/geo-block');
if (previousBlocked === undefined) delete process.env.BLOCKED_COUNTRIES;
else process.env.BLOCKED_COUNTRIES = previousBlocked;
if (previousEnforce === undefined) delete process.env.ENFORCE_CF_ONLY;
else process.env.ENFORCE_CF_ONLY = previousEnforce;

function observe(country: string, method: string, path: string) {
  const result: { continued: boolean; destroyed: boolean; status?: number } = { continued: false, destroyed: false };
  const headers: Record<string, string> = {};
  const req = {
    method, path,
    ip: '203.0.113.17',
    headers: { 'cf-ipcountry': country, 'user-agent': 'Mozilla/5.0', host: 'themegaradio.com' },
    socket: { remoteAddress: '203.0.113.17', destroy() { result.destroyed = true; } },
  } as unknown as Request;
  const res = {
    getHeader(name: string) { return headers[name]; },
    setHeader(name: string, value: string) { headers[name] = value; },
    status(code: number) { result.status = code; return this; },
    type() { return this; },
    send() { return this; },
  } as unknown as Response;
  geoBlockMiddleware(req, res, () => { result.continued = true; });
  return result;
}

test('Singapore and Thailand can load the public TV/login page and its transitive UI assets', () => {
  for (const country of ['SG', 'TH']) {
    for (const path of [
      '/tv', '/en/tv', '/tr/tv/', '/de/login', '/fr/inscription',
      '/de/passwort-vergessen', '/en/reset-password',
      '/assets/index-CmddziBb.js', '/assets/tv-login-C6Ln02iU.js',
      '/assets/main-bundle.css', '/images/logo.svg', '/fonts/ubuntu-400.woff2',
      '/favicon.ico', '/apple-touch-icon.png', '/logo-icon.webp', '/header-logo-80w.webp', '/manifest.json', '/sw.js',
      '/api/translations/en/critical', '/api/translations/tr',
      '/api/auth/me', '/api/auth/google', '/api/auth/google/callback',
      '/api/auth/apple', '/api/auth/facebook/callback',
      '/api/auth/tv/code/123456/status', '/api/auth/tv/verify',
    ]) {
      for (const method of ['GET', 'HEAD']) {
        assert.deepEqual(observe(country, method, path), { continued: true, destroyed: false }, `${country} ${method} ${path}`);
      }
    }
    for (const path of [
      '/api/auth/login', '/api/auth/signup', '/api/auth/forgot-password',
      '/api/auth/reset-password', '/api/auth/token-session', '/api/auth/apple/callback',
      '/api/auth/tv/code', '/api/auth/tv/activate', '/api/auth/tv/logout',
    ]) {
      assert.deepEqual(observe(country, 'POST', path), { continued: true, destroyed: false }, `${country} POST ${path}`);
    }
  }
});

test('unrelated browsing, admin, auth-debug, unsupported methods and path disguises remain blocked', () => {
  const denied: Array<[string, string]> = [
    ['GET', '/'], ['GET', '/en'], ['GET', '/en/station/example'],
    ['GET', '/api/stations'], ['GET', '/api/user/favorites'],
    ['GET', '/admin'], ['GET', '/api/admin/auth-config'], ['POST', '/api/admin/login'],
    ['GET', '/api/auth/debug/callback-url'], ['POST', '/api/auth/unlisted'],
    ['GET', '/api/auth/tv/activate'], ['DELETE', '/api/auth/tv/activate'],
    ['PUT', '/api/auth/login'], ['OPTIONS', '/api/auth/login'], ['POST', '/en/tv'],
    ['POST', '/assets/main.js'], ['GET', '/assets/private.json'],
    ['GET', '/api/auth/tv/code/ABC123/status'], ['GET', '/api/auth/tv/code/123456/status/admin'],
    ['GET', '/unknown/tv'], ['GET', '/xx/tv'], ['GET', '/api/translations/xx'],
    ['GET', '/api/%61uth/me'], ['GET', '/api/auth%2fme'],
    ['GET', '/assets/../api/admin/main.js'], ['GET', '/assets/%2e%2e/api/admin/main.js'],
    ['GET', '/assets/%252e%252e/api/admin/main.js'], ['GET', '/en/tv%2f..%2fadmin'],
    ['GET', '/en/tv\\..\\admin'], ['GET', '//en/tv'], ['GET', '/en//tv'],
    ['GET', '/en/tv\u0000'], ['GET', '/api/admin?returnTo=/en/tv'],
  ];
  for (const [method, path] of denied) {
    assert.equal(isPublicTvAccessRequest(method, path), false, `${method} ${path}`);
    for (const country of ['SG', 'TH']) {
      assert.deepEqual(observe(country, method, path), { continued: false, destroyed: false, status: 403 }, `${country} ${method} ${path}`);
    }
  }
});

test('the TV exception does not bypass CF-only origin protection or change nonblocked-country behavior', () => {
  for (const [method, path] of [['GET', '/en/tv'], ['POST', '/api/auth/login']]) {
    assert.deepEqual(observe('', method, path), { continued: false, destroyed: false, status: 403 });
  }
  assert.deepEqual(observe('AT', 'GET', '/en/station/example'), { continued: true, destroyed: false });
  assert.deepEqual(observe('US', 'POST', '/api/auth/login'), { continued: true, destroyed: false });
});

let server: Server;
let base: string;
before(async () => {
  const app = express();
  app.use(geoBlockMiddleware);
  app.use('/api/auth', privateApiCachePolicy);
  // Local fixture proves the repaired geo guard continues to downstream
  // authentication and throttling; production handlers/limits are unchanged.
  app.use('/api/auth/tv/activate', rateLimit({ windowMs: 60_000, limit: 2, legacyHeaders: false, standardHeaders: 'draft-8' }));
  app.post('/api/auth/tv/activate', (_req, res) => res.status(401).json({ error: 'Authentication required' }));
  app.get('/en/tv', (_req, res) => res.type('html').send('<main>Connect your TV</main>'));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('local HTTP pairing flow reaches downstream 401 and 429 without exposing private responses to caches', async () => {
  const headers = { 'cf-ipcountry': 'SG', 'user-agent': 'Mozilla/5.0' };
  assert.equal((await fetch(base + '/en/tv?code=123456', { headers })).status, 200);
  for (const expected of [401, 401, 429]) {
    const response = await fetch(base + '/api/auth/tv/activate', { method: 'POST', headers });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  }
});
