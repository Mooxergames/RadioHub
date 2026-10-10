import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

let writes: any[] = [], fail = false;
mock.module('../src/data/postgres-user-store', { namedExports: {
  pgFindUserById: async (id: string) => ({ _id: id, status: id === 'blocked' ? 'suspended' : 'active' }),
} });
mock.module('../src/data/auth-token-store', { namedExports: {
  createAuthToken: async () => '', findActiveAuthToken: async (token: string) => token === 'test-token' ? { userId: 'alice' } : null,
} });
mock.module('../src/data/postgres-listening-store', { namedExports: {
  pgRecordListening: async (input: any) => { if (fail) throw new Error('test outage'); writes.push(input); return { recorded: true, totalListeningTime: 1.5 }; },
} });
mock.module('../src/utils/logger', { namedExports: { logger: { error() {} } } });
let server: Server, base: string;
before(async () => {
  const { registerListeningRoutes } = await import('../src/routes/listening-routes');
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => { if (req.headers['x-user']) req.session = { user: { userId: req.headers['x-user'] } }; next(); });
  registerListeningRoutes(app);
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
beforeEach(() => { writes = []; fail = false; });
const record = { userId: 'alice', stationId: 'radio', listenDuration: 30, recordId: 'record-0000000001' };
const post = (body: any = record, headers: Record<string, string> = { 'x-user': 'alice' }) => fetch(`${base}/api/listening/record`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
test('cookie and bearer authentication record against the same authenticated account', async () => {
  for (const headers of [{ 'x-user': 'alice' }, { authorization: 'Bearer test-token' }]) {
    const response = await post(record, headers);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(await response.json(), { success: true, totalTime: 30, recorded: true, totalListeningTime: 1.5 });
  }
  assert.equal(writes.length, 2); assert.ok(writes.every(w => w.userId === 'alice'));
});
test('rejects guests, inactive accounts and cross-account replay before writing', async () => {
  assert.equal((await post(record, {})).status, 401);
  assert.equal((await post(record, { 'x-user': 'blocked' })).status, 403);
  assert.equal((await post(record, { 'x-user': 'bob' })).status, 409);
  assert.equal(writes.length, 0);
});
test('rejects invalid duration, record identities and oversized metadata', async () => {
  for (const patch of [{ listenDuration: -1 }, { listenDuration: 0 }, { listenDuration: '30' }, { listenDuration: 2147483648 },
    { stationId: '' }, { recordId: 'bad' }, { stationName: [] }, { country: 'x'.repeat(257) }]) {
    assert.equal((await post({ ...record, ...patch })).status, 400);
  }
  assert.equal(writes.length, 0);
});
test('preserves older clients without record IDs, and returns failure when saving fails', async () => {
  assert.equal((await post({ stationId: 'radio', listenDuration: 5 })).status, 200);
  fail = true;
  const response = await post(); assert.equal(response.status, 503);
  assert.equal((await response.json()).success, undefined);
});
