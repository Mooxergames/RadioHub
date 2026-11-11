import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { beforeEach, mock, test } from 'node:test';
import express from 'express';

const inheritedRobots = 'noindex, nofollow';
const stationImage = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 0xff, 0xd9]);
const defaultImage = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 3, 4, 5, 0xff, 0xd9]);
const generationError = new Error('Mock image generation failed');
const stationCalls: string[] = [];
const logs: unknown[][] = [];
let stationResult: Buffer | null = stationImage;
let defaultCalls = 0;
let failStation = false;
let failDefault = false;

mock.module('../src/og-image-generator', { namedExports: {
  generateStationOgImage: async (slug: string) => {
    stationCalls.push(slug);
    if (failStation) throw generationError;
    return stationResult;
  },
  getDefaultOgImage: async () => {
    defaultCalls++;
    if (failDefault) throw generationError;
    return defaultImage;
  },
} });
mock.module('../src/utils/logger', { namedExports: {
  logger: { error: (...args: unknown[]) => logs.push(args) },
} });
const { registerOgImageRoutes } = await import('../src/routes/og-image-routes');

beforeEach(() => {
  stationResult = stationImage;
  stationCalls.length = 0;
  logs.length = 0;
  defaultCalls = 0;
  failStation = false;
  failDefault = false;
});

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', inheritedRobots);
    next();
  });
  registerOgImageRoutes(app, {});
  app.get(['/api/stations/fixture', '/api/auth/session', '/api/users/fixture',
    '/api/payments/fixture', '/api/og-image-extra'], (_req, res) => res.json({ fixture: true }));
  app.get('/api/unrelated-image', (_req, res) => res.type('image/jpeg').send(stationImage));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

const scenarios = [
  { name: 'default', path: '/api/og-image', bytes: defaultImage, ttl: 604800,
    stationResult: stationImage, stationCalls: [], defaultCalls: 1 },
  { name: 'station', path: '/api/og-image/fixture-station', bytes: stationImage, ttl: 86400,
    stationResult: stationImage, stationCalls: ['fixture-station'], defaultCalls: 0 },
  { name: 'fallback', path: '/api/og-image/missing-station', bytes: defaultImage, ttl: 86400,
    stationResult: null, stationCalls: ['missing-station'], defaultCalls: 1 },
];

function assertSuccessfulHeaders(response: Response, ttl: number) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), `public, max-age=${ttl}`);
  assert.ok(response.headers.get('etag'));
}

for (const scenario of scenarios) {
  for (const method of ['GET', 'HEAD']) {
    test(`${scenario.name} ${method}: only successful JPEG loses inherited noindex; bytes, MIME and TTL survive`, async () => {
      stationResult = scenario.stationResult;
      await withServer(async baseUrl => {
        const response = await fetch(baseUrl + scenario.path, { method });
        assertSuccessfulHeaders(response, scenario.ttl);
        assert.equal(response.headers.get('content-length'), String(scenario.bytes.length));
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), method === 'HEAD' ? Buffer.alloc(0) : scenario.bytes);
      });
      assert.deepEqual(stationCalls, scenario.stationCalls);
      assert.equal(defaultCalls, scenario.defaultCalls);
      assert.deepEqual(logs, []);
    });

    test(`${scenario.name} GET 200 -> conditional ${method} 304 keeps ETag, TTL and no noindex`, async () => {
      stationResult = scenario.stationResult;
      await withServer(async baseUrl => {
        const first = await fetch(baseUrl + scenario.path);
        assertSuccessfulHeaders(first, scenario.ttl);
        assert.deepEqual(Buffer.from(await first.arrayBuffer()), scenario.bytes);
        const etag = first.headers.get('etag')!;
        // Explicit cache policy avoids Node fetch forcing conditional requests to no-cache.
        const conditional = await fetch(baseUrl + scenario.path, {
          method, headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' },
        });
        assert.equal(conditional.status, 304);
        assert.equal(conditional.headers.get('x-robots-tag'), null);
        assert.equal(conditional.headers.get('etag'), etag);
        assert.equal(conditional.headers.get('cache-control'), `public, max-age=${scenario.ttl}`);
        assert.equal(conditional.headers.get('content-type'), null);
        assert.equal(conditional.headers.get('content-length'), null);
        assert.equal(await conditional.text(), '');
      });
      assert.deepEqual(stationCalls, [...scenario.stationCalls, ...scenario.stationCalls]);
      assert.equal(defaultCalls, scenario.defaultCalls * 2);
      assert.deepEqual(logs, []);
    });
  }
}

const failures = [
  { name: 'default generation error', path: '/api/og-image', failStation: false, failDefault: true,
    stationResult: stationImage, stationCalls: [], defaultCalls: 1, log: 'Default OG Image generation error:' },
  { name: 'station generation error', path: '/api/og-image/fixture-station', failStation: true, failDefault: false,
    stationResult: stationImage, stationCalls: ['fixture-station'], defaultCalls: 0, log: 'OG Image generation error:' },
  { name: 'default fallback generation error', path: '/api/og-image/missing-station', failStation: false, failDefault: true,
    stationResult: null, stationCalls: ['missing-station'], defaultCalls: 1, log: 'OG Image generation error:' },
];

for (const failure of failures) {
  for (const method of ['GET', 'HEAD']) {
    test(`${failure.name} ${method}: preserves inherited noindex and existing 500 response`, async () => {
      stationResult = failure.stationResult;
      failStation = failure.failStation;
      failDefault = failure.failDefault;
      await withServer(async baseUrl => {
        const response = await fetch(baseUrl + failure.path, { method });
        assert.equal(response.status, 500);
        assert.equal(response.headers.get('x-robots-tag'), inheritedRobots);
        assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.equal(response.headers.get('cache-control'), null);
        assert.equal(response.headers.get('content-length'), String(Buffer.byteLength('Error generating image')));
        assert.equal(await response.text(), method === 'HEAD' ? '' : 'Error generating image');
      });
      assert.deepEqual(stationCalls, failure.stationCalls);
      assert.equal(defaultCalls, failure.defaultCalls);
      assert.deepEqual(logs, [[failure.log, generationError]]);
    });
  }
}

for (const method of ['GET', 'HEAD']) {
  test(`${method}: JSON, unrelated JPEG and unmatched routes keep noindex`, async () => {
    await withServer(async baseUrl => {
      for (const pathname of ['/api/stations/fixture', '/api/auth/session', '/api/users/fixture',
        '/api/payments/fixture', '/api/og-image-extra', '/api/unrelated-image', '/api/og-image/fixture/extra']) {
        const response = await fetch(baseUrl + pathname, { method });
        assert.equal(response.status, pathname.endsWith('/extra') ? 404 : 200, pathname);
        assert.equal(response.headers.get('x-robots-tag'), inheritedRobots, pathname);
        const body = Buffer.from(await response.arrayBuffer());
        if (method === 'HEAD') assert.equal(body.length, 0);
        if (pathname === '/api/unrelated-image') {
          assert.equal(response.headers.get('content-type'), 'image/jpeg');
          if (method === 'GET') assert.deepEqual(body, stationImage);
        } else {
          assert.match(response.headers.get('content-type') || '', /^application\/json/);
        }
      }
    });
    assert.deepEqual(stationCalls, []);
    assert.equal(defaultCalls, 0);
    assert.deepEqual(logs, []);
  });
}
