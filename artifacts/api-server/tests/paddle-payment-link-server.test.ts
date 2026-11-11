import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { get as httpGet, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createPaymentLinkShellHandler, paymentLinkPrivacy } from '../src/payment-link-shell';
import { canonicalUrlMiddleware } from '../src/middleware/canonical-url';
import { registerStripeSubscriptionRoutes } from '../src/routes/stripe-subscription-routes';
import { paddleClientConfig } from '../src/services/paddle-client-config';
import { urlRedirectMiddleware } from '../src/url-redirect-middleware';
import { isKnownSpaShellRoute } from '../src/seo/spa-shell-route';

const environments = ['sandbox', 'production'] as const;
function settings(environment: typeof environments[number] = 'sandbox'): NodeJS.ProcessEnv {
  return {
    PAYMENT_PROVIDER: 'paddle',
    PADDLE_ENVIRONMENT: environment,
    PADDLE_API_KEY: `pdl_${environment === 'sandbox' ? 'sdbx' : 'live'}_apikey_OfflineFixtureOnly`,
    PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_OfflineFixtureOnly',
    PADDLE_CLIENT_TOKEN: `${environment === 'sandbox' ? 'test' : 'live'}_OfflinePublicFixture`,
  };
}

const invalid: [string, NodeJS.ProcessEnv][] = [
  ['non-Paddle provider', { PAYMENT_PROVIDER: 'stripe' }],
  ['missing environment', { PADDLE_ENVIRONMENT: undefined }],
  ['unknown environment', { PADDLE_ENVIRONMENT: 'live' }],
  ['padded environment', { PADDLE_ENVIRONMENT: ' sandbox' }],
  ['missing API key', { PADDLE_API_KEY: undefined }],
  ['blank API key', { PADDLE_API_KEY: ' \t' }],
  ['missing webhook secret', { PADDLE_WEBHOOK_SECRET: undefined }],
  ['blank webhook secret', { PADDLE_WEBHOOK_SECRET: ' \t' }],
  ['missing client token', { PADDLE_CLIENT_TOKEN: undefined }],
  ['malformed client token', { PADDLE_CLIENT_TOKEN: 'test_' }],
  ['padded client token', { PADDLE_CLIENT_TOKEN: 'test_OfflinePublicFixture ' }],
  ['live token in sandbox', { PADDLE_CLIENT_TOKEN: 'live_OfflinePublicFixture' }],
  ['test token in production', { ...settings('production'), PADDLE_CLIENT_TOKEN: 'test_OfflinePublicFixture' }],
];

describe('paddleClientConfig (synthetic environment only)', () => {
  it('only admits the exact, unlocalized payment link route', () => {
    for (const path of ['/pay', '/pay/', '/pay?_ptxn=synthetic']) assert.equal(isKnownSpaShellRoute(path), true);
    for (const path of ['/pay/anything', '/en/pay', '/de/pay', '/pay-something']) assert.equal(isKnownSpaShellRoute(path), false);
  });
  for (const environment of environments) {
    it(`exposes only the matching public token in ${environment}`, () => {
      const env = settings(environment);
      assert.deepEqual(paddleClientConfig(env), { environment, clientToken: env.PADDLE_CLIENT_TOKEN });
    });
  }
  for (const [name, patch] of invalid) {
    it(`fails closed: ${name}`, () => {
      assert.equal(paddleClientConfig({ ...settings(), ...patch }), null);
    });
  }
  it('applies the same prefix check to the VITE fallback, without overriding an invalid explicit token', () => {
    const env = { ...settings(), PADDLE_CLIENT_TOKEN: undefined, VITE_PADDLE_CLIENT_TOKEN: 'test_PublicFallback' };
    assert.deepEqual(paddleClientConfig(env), { environment: 'sandbox', clientToken: 'test_PublicFallback' });
    assert.equal(paddleClientConfig({ ...env, VITE_PADDLE_CLIENT_TOKEN: 'live_PublicFallback' }), null);
    assert.equal(paddleClientConfig({ ...env, PADDLE_CLIENT_TOKEN: 'live_InvalidOverride' }), null);
  });
});

const localAssets = {
  scripts: '<script type="module" src="/assets/payment-fixture.js"></script>',
  styles: '<link rel="stylesheet" href="/assets/payment-fixture.css">',
  preloads: '<link rel="modulepreload" href="/assets/preload-fixture.js">',
};
const configRoute = '/api/subscription/paddle/client-config';
const touchedKeys = [...Object.keys(settings()), 'VITE_PADDLE_CLIENT_TOKEN'];
function setEnv(source: NodeJS.ProcessEnv) {
  for (const key of touchedKeys) {
    if (source[key] === undefined) delete process.env[key];
    else process.env[key] = source[key];
  }
}
function shellHeaders(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('x-robots-tag') ?? '', /\bnoindex\b/i);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('location'), null);
}
function configHeaders(response: Response) {
  for (const header of ['cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control']) {
    assert.equal(response.headers.get(header), 'no-store', header);
  }
}

describe('payment link HTTP contracts (loopback, no payment or database calls)', () => {
  let server: Server, origin: string, saved: NodeJS.ProcessEnv;
  let assets = { ...localAssets };
  before(async () => {
    saved = Object.fromEntries(touchedKeys.map(key => [key, process.env[key]]));
    setEnv(settings());
    const app = express();
    app.use(paymentLinkPrivacy, canonicalUrlMiddleware);
    const deny: express.RequestHandler = (_req, res) => { res.sendStatus(401); };
    registerStripeSubscriptionRoutes(app, { requireAuth: deny, requireAdmin: deny });
    app.get('/pay', urlRedirectMiddleware, createPaymentLinkShellHandler(() => assets));
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => { assets = { ...localAssets }; setEnv(settings()); });
  after(async () => {
    setEnv(saved);
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  });
  const get = (path: string, method = 'GET') => fetch(origin + path, { method, redirect: 'manual' });

  it('the first canonical 301 is private too, before the HTML handler runs', async () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const res = await new Promise<IncomingMessage>((resolve, reject) => {
        httpGet(origin + '/pay/?_ptxn=txn_OfflineReference', {
          headers: { Host: 'www.themegaradio.com', 'X-Forwarded-Proto': 'https' },
        }, response => { response.resume(); response.on('end', () => resolve(response)); }).on('error', reject);
      });
      assert.equal(res.statusCode, 301);
      assert.equal(res.headers.location, 'https://themegaradio.com/pay?_ptxn=txn_OfflineReference');
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(res.headers['cdn-cache-control'], 'no-store');
      assert.equal(res.headers['cloudflare-cdn-cache-control'], 'no-store');
      assert.equal(res.headers['referrer-policy'], 'no-referrer');
      assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
    } finally {
      if (prior === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prior;
    }
  });

  for (const environment of environments) {
    it(`GET client-config is public, exact and uncacheable: ${environment}`, async () => {
      const env = settings(environment);
      setEnv(env);
      const res = await get(configRoute);
      assert.equal(res.status, 200);
      configHeaders(res);
      assert.deepEqual(await res.json(), { environment, clientToken: env.PADDLE_CLIENT_TOKEN });
    });
  }
  it('GET client-config returns a non-cacheable, non-disclosing 503 on invalid configuration', async () => {
    for (const patch of [{ PADDLE_API_KEY: undefined }, { PADDLE_WEBHOOK_SECRET: undefined }, { PADDLE_CLIENT_TOKEN: 'live_WrongMode' }]) {
      setEnv({ ...settings(), ...patch });
      const res = await get(configRoute);
      assert.equal(res.status, 503);
      configHeaders(res);
      const body = await res.text();
      assert.doesNotMatch(body, /OfflineFixture|PublicFixture|WrongMode|clientToken|PADDLE_/i);
      assert.equal(typeof JSON.parse(body).error, 'string');
    }
  });

  for (const method of ['GET', 'HEAD']) {
    it(`${method} /pay passes locale redirect untouched, with a private minimal shell`, async () => {
      const res = await fetch(origin + '/pay/?_ptxn=txn_OfflineReference&visitor=PrivateVisitor', {
        method, redirect: 'manual', headers: { 'Accept-Language': 'de', Cookie: 'visitor=PrivateCookie' },
      });
      assert.equal(res.status, 200);
      shellHeaders(res);
      assert.match(res.headers.get('content-type') ?? '', /text\/html/);
      const body = await res.text();
      if (method === 'HEAD') { assert.equal(body, ''); return; }
      assert.match(body, /<div id="root"><\/div>/);
      const urls = Array.from(body.matchAll(/\b(?:href|src)\s*=\s*["']([^"']*)["']/gi), m => m[1]);
      assert.deepEqual(urls.sort(), ['/assets/payment-fixture.css', '/assets/payment-fixture.js', '/assets/preload-fixture.js', '/favicon.ico']);
      assert.deepEqual(body.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi), [localAssets.scripts]);
      assert.doesNotMatch(body, /_ptxn|OfflineReference|PrivateVisitor|PrivateCookie|googletagmanager|google-analytics|adsbygoogle|doubleclick|gtag\(/i);
    });
    it(`${method} /pay with no built script returns retryable 503, not a fallback SPA`, async () => {
      assets.scripts = '';
      const res = await get('/pay?_ptxn=txn_OfflineReference', method);
      assert.equal(res.status, 503);
      shellHeaders(res);
      assert.match(res.headers.get('retry-after') ?? '', /^[1-9]\d*$/);
      const body = await res.text();
      if (method === 'HEAD') assert.equal(body, '');
      else assert.doesNotMatch(body, /<script|OfflineReference|_ptxn/i);
    });
  }
  it('never publishes a third-party modulepreload inherited from the build template', async () => {
    assets.preloads += '<link rel="modulepreload" href="https://telemetry.example.invalid/fixture.js">';
    const res = await get('/pay');
    shellHeaders(res);
    assert.ok([200, 503].includes(res.status));
    assert.doesNotMatch(await res.text(), /telemetry\.example\.invalid/);
  });
});
