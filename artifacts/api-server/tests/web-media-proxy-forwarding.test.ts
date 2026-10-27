import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { forwardApiRequest } from '../src/middleware/forward-api-request';
import { publicImageProxyHeaders } from '../src/middleware/public-image-headers';

let upstream: Server, web: Server, base: string;
const seen: Array<{ path: string; accept?: string; range?: string }> = [];
const image = await readFile(new URL('../../megaradio/public/header-logo-80w.webp', import.meta.url));
const listen = (app: express.Express): Promise<Server> => new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

before(async () => {
  const media = express();
  media.use((_req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
  media.use((req, _res, next) => {
    seen.push({ path: req.originalUrl, accept: req.get('accept'), range: req.get('range') });
    next();
  });
  media.get('/api/image/missing', (_req, res) => {
    res.status(404).set('Cache-Control', 'public, max-age=300').json({ error: 'Image not found or inaccessible' });
  });
  media.get('/api/image/json', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300').json({ error: 'Not an image' });
  });
  media.get('/api/image/error', (_req, res) => {
    res.status(500).type('image/webp').send('failed');
  });
  media.get('/api/image/*path', (_req, res) => {
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400',
      'Content-Encoding': 'identity', Vary: 'Accept' }).send(image);
  });
  media.get('/api/stream/*path', (_req, res) => {
    res.status(206).set({ 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-3/4' }).send('live');
  });
  media.use((_req, res) => { res.status(404).json({ error: 'Not found', service: 'stream-proxy' }); });
  upstream = await listen(media);

  const app = express();
  app.use((_req, res, next) => { res.set('X-Robots-Tag', 'noindex, follow'); next(); });
  const proxy = createProxyMiddleware({ target: `http://127.0.0.1:${(upstream.address() as any).port}`,
    changeOrigin: true, on: { proxyRes: publicImageProxyHeaders } });
  app.use('/api/image', forwardApiRequest(proxy));
  app.use('/api/stream', forwardApiRequest(proxy));
  web = await listen(app);
  base = `http://127.0.0.1:${(web.address() as any).port}`;
});

after(async () => {
  for (const server of [web, upstream]) {
    server?.closeAllConnections();
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('same-origin image proxy retains the complete encoded path, size query and image response', async () => {
  const encoded = Buffer.from('https://upload.wikimedia.org/example/logo.svg').toString('base64url');
  for (const suffix of ['', '?w=256', '?w=96&h=96&marker=%2F%26']) {
    const path = `/api/image/${encoded}${suffix}`;
    const response = await fetch(base + path, { headers: { Accept: 'image/avif,image/webp' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
    assert.equal(response.headers.get('vary'), 'Accept');
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    assert.deepEqual(seen.at(-1), { path, accept: 'image/avif,image/webp', range: undefined });
  }
});

test('real upstream image failures remain errors instead of a placeholder 200', async () => {
  const response = await fetch(base + '/api/image/missing?w=256');
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(await response.json(), { error: 'Image not found or inaccessible' });
});

test('same-origin audio forwarding preserves the stream prefix, query, Range and partial response', async () => {
  const path = '/api/stream/radio-id?source=https%3A%2F%2Fexample.com%2Fstream';
  const response = await fetch(base + path, { headers: { Range: 'bytes=0-3' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg; charset=utf-8');
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/4');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await response.text(), 'live');
  assert.equal(seen.at(-1)?.path, path);
  assert.equal(seen.at(-1)?.range, 'bytes=0-3');
});

test('production media mounts restore original URLs before the general API proxy', async () => {
  const source = await readFile(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  const general = source.indexOf("app.use('/api', forwardApiRequest(apiProxy))");
  assert.match(source, /const streamServiceProxy = createProxyMiddleware\([\s\S]*?proxyRes: publicImageProxyHeaders/);
  for (const mount of ['image', 'stream']) {
    const media = source.indexOf(`app.use('/api/${mount}', forwardApiRequest(streamServiceProxy))`);
    assert.ok(media >= 0 && media < general, `The ${mount} mount must preserve its original prefix`);
  }
});

test('public image HEAD and conditional 304 do not reintroduce either inherited noindex', async () => {
  const pathname = '/api/image/encoded?w=256';
  const first = await fetch(base + pathname);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  await first.arrayBuffer();
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(base + pathname, { method });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.equal(response.headers.get('content-encoding'), 'identity');
    assert.equal(await response.text(), method === 'HEAD' ? '' : image.toString());
    const conditional = await fetch(base + pathname, { method,
      headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get('content-type'), null);
    assert.equal(conditional.headers.get('x-robots-tag'), null);
    assert.equal(conditional.headers.get('etag'), etag);
    assert.equal(conditional.headers.get('cache-control'), 'public, max-age=86400');
    assert.equal(await conditional.text(), '');
  }
});

test('JSON including conditional 304 and unsuccessful image responses retain noindex', async () => {
  const json = await fetch(base + '/api/image/json');
  const etag = json.headers.get('etag');
  assert.ok(etag);
  assert.equal(json.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(await json.json(), { error: 'Not an image' });
  const conditional = await fetch(base + '/api/image/json', {
    headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get('x-robots-tag'), 'noindex, nofollow');
  const error = await fetch(base + '/api/image/error');
  assert.equal(error.status, 500);
  assert.equal(error.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await error.text(), 'failed');
});

test('image header exception does not widen methods, namespaces or generic 304 responses', () => {
  for (const [method, url, status, headers, requestHeaders] of [
    ['POST', '/api/image/encoded', 200, { 'content-type': 'image/png' }, {}],
    ['OPTIONS', '/api/image/encoded', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/image', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/image-proxy/encoded', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/image%2Fencoded', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/image%252Fencoded', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/stream/encoded', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/admin/image/encoded', 200, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/image/encoded', 302, { 'content-type': 'image/png' }, {}],
    ['GET', '/api/image/encoded', 304, { etag: '"json"' }, { 'if-none-match': '"json"' }],
    ['GET', '/api/image/encoded', 304, { etag: '"image"', 'content-encoding': 'identity',
      'cache-control': 'public, max-age=86400', vary: 'Accept' }, {}],
  ] as const) {
    let removed = false;
    const upstream = { statusCode: status, headers: { ...headers, 'x-robots-tag': 'noindex, nofollow' } };
    publicImageProxyHeaders(upstream, { method, url, headers: requestHeaders }, { removeHeader: () => { removed = true; } });
    assert.equal(removed, false, `${method} ${url} ${status}`);
    assert.equal(upstream.headers['x-robots-tag'], 'noindex, nofollow');
  }
});
