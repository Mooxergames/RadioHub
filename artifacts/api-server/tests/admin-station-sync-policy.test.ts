import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { stationIntakeEnabled } from '../src/utils/station-sync-policy';

let server: Server, base: string, setting: any = null, fail = false;
const writes: any[] = [];
before(async () => {
  mock.module('../src/data/postgres-admin-settings-store', { namedExports: {
    getAdminSetting: async () => { if (fail) throw new Error('Unavailable'); return setting; },
    pgAdminSettings: () => ({ save: async (args: any) => {
      if (fail) throw new Error('Unavailable');
      writes.push(args); setting = { value: args.value }; return { changedAt: new Date() };
    } }),
  } });
  const { registerAdminStationSyncPolicyRoutes } = await import('../src/routes/admin-station-sync-policy-routes');
  const app = express(); app.use(express.json());
  registerAdminStationSyncPolicyRoutes(app, (req: any, res, next) => {
    if (req.headers['x-test-admin'] !== 'true') return void res.sendStatus(401);
    req.session = { adminAuth: { username: 'test-admin' } }; next();
  });
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/sync/policy`;
});
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); mock.restoreAll(); });

test('policy retains the previous default and fails closed for malformed overrides', () => {
  assert.equal(stationIntakeEnabled(null), true);
  for (const value of [null, {}, false, { allowNewStations: 'true' }, { allowNewStations: false }]) {
    assert.equal(stationIntakeEnabled({ value }), false);
  }
  assert.equal(stationIntakeEnabled({ value: { allowNewStations: true } }), true);
});
test('policy routes require admin, validate booleans and persist an audited reversible pause', async () => {
  assert.equal((await fetch(base)).status, 401);
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' };
  for (const body of [{}, { allowNewStations: 'false' }, { allowNewStations: false, ignored: true }]) {
    assert.equal((await fetch(base, { method: 'PUT', headers, body: JSON.stringify(body) })).status, 400);
  }
  assert.equal(writes.length, 0);
  for (const allowNewStations of [false, true]) {
    const response = await fetch(base, { method: 'PUT', headers, body: JSON.stringify({ allowNewStations }) });
    assert.equal(response.status, 200);
    assert.equal((await (await fetch(base, { headers })).json() as any).allowNewStations, allowNewStations);
    assert.equal(writes.at(-1).changedBy, 'test-admin');
  }
  fail = true;
  assert.equal((await fetch(base, { headers })).status, 503);
  assert.equal((await fetch(base, { method: 'PUT', headers, body: JSON.stringify({ allowNewStations: false }) })).status, 503);
  fail = false;
});
