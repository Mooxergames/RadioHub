import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { forwardApiRequest } from '../src/middleware/forward-api-request';
import { webRequestTimeout, WEB_API_PROXY_TIMEOUTS, sendWebApiProxyError } from '../src/middleware/web-request-timeout';

async function listen(t: TestContext, app: http.RequestListener): Promise<Server> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  return server;
}

function request(server: Server, path: string, method = 'GET') {
  return new Promise<{ status?: number; headers: http.IncomingHttpHeaders; body: string; error?: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: (server.address() as any).port, path, method,
      agent: false, headers: method === 'POST' ? { 'Content-Type': 'application/json', 'Content-Length': 2 } : {} }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', (error: NodeJS.ErrnoException) => resolve({ status: res.statusCode, headers: res.headers, body, error: error.code }));
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });
}

function timedApp() {
  const app = express();
  app.use((_req, res, next) => {
    const setTimeout = res.setTimeout.bind(res);
    res.setTimeout = (milliseconds, callback) => setTimeout(milliseconds / 100, callback);
    next();
  });
  app.use(webRequestTimeout);
  app.use(express.json());
  return app;
}

test('completed GET and parsed POST return retryable 503 instead of a socket reset', { timeout: 5_000 }, async t => {
  const app = timedApp();
  const requests: http.IncomingMessage[] = [];
  app.use((req, _res) => { requests.push(req); });
  const server = await listen(t, app);
  for (const method of ['GET', 'POST', 'HEAD']) {
    const response = await request(server, '/stalled', method);
    assert.equal(response.status, 503);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['retry-after'], '120');
    assert.equal(response.error, undefined);
  }
  assert.deepEqual(requests.map(req => req.complete), [true, true, true]);
});

test('a stalled response with headers already sent is closed, not left hanging', { timeout: 5_000 }, async t => {
  const app = timedApp();
  app.get('/partial', (_req, res) => { res.write('partial'); });
  const result = await request(await listen(t, app), '/partial');
  assert.equal(result.body, 'partial');
  assert.equal(result.error, 'ECONNRESET');
});

test('successful responses and the existing static-file exemption are preserved', async t => {
  const app = timedApp();
  app.get('/fast', (_req, res) => res.send('ok'));
  app.get('/asset.json', (req, res) => res.json({ socketTimeout: req.socket.timeout || 0 }));
  const server = await listen(t, app);
  assert.equal((await request(server, '/fast')).status, 200);
  const asset = await request(server, '/asset.json');
  assert.equal(asset.status, 200);
  assert.equal(JSON.parse(asset.body).socketTimeout, 0);
});

test('proxy timeout and upstream reset return noncacheable JSON 502 before the client socket deadline', { timeout: 5_000 }, async t => {
  assert.deepEqual(WEB_API_PROXY_TIMEOUTS, { timeout: 60_000, proxyTimeout: 58_000 });
  const upstream = await listen(t, (req, res) => {
    if (req.url === '/api/reset') req.socket.destroy();
    else if (req.url === '/api/unavailable') res.writeHead(503).end('unavailable');
  });
  const app = timedApp();
  const proxy = createProxyMiddleware({
    target: `http://127.0.0.1:${(upstream.address() as any).port}`,
    timeout: WEB_API_PROXY_TIMEOUTS.timeout / 100,
    proxyTimeout: WEB_API_PROXY_TIMEOUTS.proxyTimeout / 100,
    on: { error: (_error, _req, res) => sendWebApiProxyError(res) },
  });
  app.use('/api', forwardApiRequest(proxy));
  const server = await listen(t, app);
  for (const path of ['/api/stalled', '/api/reset']) {
    const response = await request(server, path);
    assert.equal(response.status, 502);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['retry-after'], '120');
    assert.deepEqual(JSON.parse(response.body), { error: 'Backend API unavailable' });
  }
  assert.equal((await request(server, '/api/unavailable')).status, 503);
});

test('late proxy errors never write a second response or leave a partial response open', async t => {
  const app = express();
  app.get('/complete', (_req, res) => { res.send('ok'); sendWebApiProxyError(res); });
  app.get('/partial', (_req, res) => {
    res.write('partial');
    setImmediate(() => sendWebApiProxyError(res));
  });
  const server = await listen(t, app);
  assert.equal((await request(server, '/complete')).body, 'ok');
  assert.equal((await request(server, '/partial')).error, 'ECONNRESET');
});

test('production web installs the tested timeout and proxy error handlers', () => {
  const source = readFileSync(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.use\(webRequestTimeout\)/);
  assert.match(source, /const apiProxy = createProxyMiddleware\(\{[\s\S]*?\.\.\.WEB_API_PROXY_TIMEOUTS,[\s\S]*?sendWebApiProxyError\(res\)/);
});
