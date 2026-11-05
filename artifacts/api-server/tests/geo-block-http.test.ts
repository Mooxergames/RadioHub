import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

process.env.BLOCKED_COUNTRIES = 'SG,TH';
const { geoBlockMiddleware } = await import('../src/middleware/geo-block');
const servers: Server[] = [];
let base: string;

async function listen(app: ReturnType<typeof express>): Promise<string> {
  const server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

before(async () => {
  const origin = express();
  origin.use(geoBlockMiddleware);
  origin.use((_req, res) => res.status(200).send('downstream'));
  const target = await listen(origin);
  const gateway = express();
  gateway.use(createProxyMiddleware({
    target,
    on: { error(_error, _req, res) {
      if ('writeHead' in res) res.writeHead(502).end('Upstream connection failed');
    } },
  }));
  base = await listen(gateway);
});

after(async () => {
  for (const server of servers.reverse()) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('country policy returns an uncacheable 403 through a real gateway, never a reset/502', async () => {
  for (const country of ['SG', 'TH']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const response = await fetch(base + '/api/stations', {
        method, headers: { 'cf-ipcountry': country, 'user-agent': 'Mozilla/5.0' },
      });
      assert.equal(response.status, 403, `${country} ${method}`);
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
      assert.equal(await response.text(), method === 'HEAD' ? '' : 'Forbidden');
    }
  }
});

test('public app association documents remain readable from every verification region', async () => {
  for (const path of ['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association']) {
    for (const country of ['SG', 'TH']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await fetch(base + path, {
          method, headers: { 'cf-ipcountry': country, 'user-agent': 'GoogleAssociationService' },
        });
        assert.equal(response.status, 200, `${country} ${method} ${path}`);
      }
    }
  }
});

test('public exceptions do not expose arbitrary well-known paths or writable methods', async () => {
  for (const [method, path] of [
    ['POST', '/.well-known/assetlinks.json'],
    ['GET', '/.well-known/private.json'],
    ['GET', '/.well-known/assetlinks.json/extra'],
    ['GET', '/api/admin/auth-config'],
    ['POST', '/healthz'],
  ]) {
    const response = await fetch(base + path, { method, headers: { 'cf-ipcountry': 'SG' } });
    assert.equal(response.status, 403, `${method} ${path}`);
  }
});

test('health probes and existing crawler/TV exemptions still reach their own handlers', async () => {
  for (const path of ['/healthz', '/readyz', '/en/tv']) {
    assert.equal((await fetch(base + path, { headers: { 'cf-ipcountry': 'SG' } })).status, 200);
  }
  for (const userAgent of ['Googlebot', 'bingbot', 'Applebot']) {
    assert.equal((await fetch(base + '/en/station/example', {
      headers: { 'cf-ipcountry': 'SG', 'user-agent': userAgent },
    })).status, 200);
  }
  assert.equal((await fetch(base + '/en/station/example', { headers: { 'cf-ipcountry': 'AT' } })).status, 200);
});
