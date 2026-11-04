import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import type { Server } from 'node:http';
import express from 'express';
import { createNativePostgresFixture } from './helpers/native-postgres-fixture';

describe('linked station compact responses', { skip: !process.env.PG_TEST_DATABASE_URL }, () => {
  let fixture: Awaited<ReturnType<typeof createNativePostgresFixture>>;
  let read: typeof import('../src/data/station-read-store');
  let runtime: typeof import('../src/postgres-runtime');
  let cache: typeof import('../src/public-station-cache').publicStationCache;
  let server: Server, base: string;
  const sourceId = 'a'.repeat(24);
  const descriptions = { en: { full: 'Detail-only station article. '.repeat(1_000) } };
  before(async () => {
    delete process.env.REDIS_URL;
    fixture = await createNativePostgresFixture('linked_compact');
    read = await import('../src/data/station-read-store');
    runtime = await import('../src/postgres-runtime');
    cache = (await import('../src/public-station-cache')).publicStationCache;
    const { registerPublicStationRoutes } = await import('../src/routes/station-public-routes');
    await fixture.insert('stations', { _id: sourceId, stationuuid: 'uuid-source', name: 'Source Radio', slug: 'source-radio',
      country: 'Germany', tags: 'jazz', url: 'https://stream.invalid/source', isListVisible: true });
    for (let index = 0; index < 13; index++) await fixture.insert('stations', {
      _id: `linked-${index}`, stationuuid: `uuid-${index}`, name: `Related Radio ${index}`, slug: `related-${index}`,
      country: 'Germany', countryCode: 'DE', state: 'Berlin', language: 'German', tags: 'jazz', votes: 100 - index,
      url: `https://stream.invalid/${index}`, urlResolved: `https://stream.invalid/${index}/live`,
      favicon: `/station-logos/related-${index}.webp`, logoAssets: { folder: `radio-${index}`, webp96: '96.webp' },
      isListVisible: true, lastCheckOk: true, descriptions, source: { archiveMarker: 'detail-only-source' },
    });
    for (const [id, patch] of [
      ['hidden', { isListVisible: false, visibilityExpiresAt: new Date(Date.now() + 86_400_000) }],
      ['other-country', { country: 'France', isListVisible: true }],
    ] as const) await fixture.insert('stations', { _id: id, stationuuid: `uuid-${id}`, name: id, slug: id, country: 'Germany',
      tags: 'jazz', votes: 1_000, url: `https://stream.invalid/${id}`, ...patch });
    const app = express();
    registerPublicStationRoutes(app, { requireAdmin: (_req: unknown, res: any) => res.sendStatus(401) });
    server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  beforeEach(async () => { await cache.clearByPattern('stations:linked:'); });
  afterEach(() => mock.restoreAll());
  after(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await cache?.clearByPattern('stations:linked:');
    await fixture?.close();
  });
  const endpoint = (compact: boolean, id = sourceId) => `${base}/api/stations/${id}/linked${compact ? '?slim=1' : ''}`;

  it('uses a real compact SQL projection without changing identities, votes order, visibility or player fields', async () => {
    const full = await read.getRelatedStationsFromPostgres(sourceId, 12);
    const compact = await read.getRelatedStationsFromPostgres(sourceId, 12, true);
    assert.equal(full?.length, 12); assert.equal(compact?.length, 12);
    assert.deepEqual(compact!.map(station => station._id), full!.map(station => station._id));
    assert.deepEqual(compact!.map(station => station._id), Array.from({ length: 12 }, (_, index) => `linked-${index}`));
    for (let index = 0; index < compact!.length; index++) {
      for (const field of ['name', 'slug', 'country', 'countryCode', 'state', 'url', 'urlResolved', 'favicon', 'logoAssets', 'votes', 'isListVisible']) {
        assert.deepEqual(compact![index][field], full![index][field], field);
      }
      assert.deepEqual(full![index].descriptions, descriptions);
      assert.equal(Object.keys(compact![index].descriptions).length, 0);
      assert.equal(compact![index].archiveMarker, undefined);
    }
    assert.ok(Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(JSON.stringify(full)) / 10);
  });

  it('preserves the legacy full envelope and keeps compact/full cache variants separate in both request orders', async () => {
    for (const order of [[false, true], [true, false]]) {
      await cache.clearByPattern('stations:linked:');
      for (const compact of [...order, ...order]) {
        const response = await fetch(endpoint(compact));
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-cache, max-age=0, must-revalidate');
        assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
        const body = await response.json();
        assert.deepEqual(Object.keys(body), ['stations']);
        assert.equal(body.stations.length, 12);
        if (compact) assert.equal(Object.keys(body.stations[0].descriptions).length, 0);
        else assert.deepEqual(body.stations[0].descriptions, descriptions);
        assert.equal(body.stations[0]._id, 'linked-0');
      }
    }
  });

  it('keeps missing-source 404 responses for both variants', async () => {
    for (const compact of [false, true]) assert.equal((await fetch(endpoint(compact, 'missing-source'))).status, 404);
  });

  for (const warmedCompact of [false, true]) it(`a warm ${warmedCompact ? 'compact' : 'full'} cache cannot mask a failed cold opposite variant`, async () => {
    assert.equal((await fetch(endpoint(warmedCompact))).status, 200);
    mock.method(runtime.getPostgresPool(), 'query', async () => { throw new Error('fixture-private-database-error'); });
    const response = await fetch(endpoint(!warmedCompact));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.ok(!text.includes('fixture-private') && !text.includes('Detail-only'));
    assert.equal((await fetch(endpoint(warmedCompact))).status, 200);
  });
});
