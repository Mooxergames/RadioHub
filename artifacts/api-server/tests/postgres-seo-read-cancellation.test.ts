import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { beforeEach, mock, test } from 'node:test';
import type pg from 'pg';
import { getSeoReadDeadline, withSeoReadDeadline } from '../src/utils/seo-read-deadline';
import { getPublicStationDeadline, limitPublicStationDeadline, withPublicStationDeadline } from '../src/utils/public-station-deadline';

type Call = { text: string; values?: any[]; at: number };
type QueryHandler = (text: string, values?: any[]) => Promise<pg.QueryResult>;
const rows = { rows: [{ ok: 1 }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] } as pg.QueryResult;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const timeout = (error: any) => error?.code === 'SEO_READ_TIMEOUT';
const aborted = (error: any) => error?.name === 'AbortError';
const observe = <T>(promise: Promise<T>) => promise.then(
  value => ({ value, error: undefined }),
  (error: unknown) => ({ value: undefined, error }),
);

function fixture() {
  const calls: Call[] = [];
  const releases: Array<Error | boolean | undefined> = [];
  let handler: QueryHandler = async () => rows;
  const client = Object.assign(new EventEmitter(), {
    async query(text: string, values?: any[]) {
      calls.push({ text, values, at: Date.now() });
      return handler(text, values);
    },
    release(discard?: Error | boolean) { releases.push(discard); },
  });
  const connect = mock.fn(async () => client);
  return { client, calls, releases, connect, pool: { connect },
    handle(next: QueryHandler) { handler = next; } };
}

let active: ReturnType<typeof fixture>;
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => active.pool } });
const { boundedSeoReadQuery } = await import('../src/data/postgres-seo-read-query');

beforeEach(t => {
  active = fixture();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
});

test('query deadlines stay async-local and do not alter the visibility-cache deadline', async () => {
  assert.equal(getSeoReadDeadline(), undefined);
  await withPublicStationDeadline(async () => {
    limitPublicStationDeadline(Date.now() + 60_000);
    const cacheDeadline = getPublicStationDeadline();
    await Promise.all([1000, 2000].map(async duration => {
      const deadline = { expiresAt: Date.now() + duration };
      await withSeoReadDeadline(deadline, async () => {
        await flush();
        assert.deepEqual(getSeoReadDeadline(), deadline);
        await boundedSeoReadQuery('SELECT 1');
        assert.equal(getPublicStationDeadline(), cacheDeadline);
      });
    }));
    assert.equal(getSeoReadDeadline(), undefined);
    assert.equal(getPublicStationDeadline(), cacheDeadline);
  });
  assert.equal(getPublicStationDeadline(), Infinity);
});

test('normal reads bind values, budget checkout/setup/commit and release once after COMMIT', async t => {
  const start = Date.now();
  const signal = new AbortController();
  active.connect.mock.mockImplementation(async () => {
    t.mock.timers.tick(80);
    return active.client;
  });
  active.handle(async text => {
    t.mock.timers.tick(text === 'BEGIN READ ONLY' ? 120 : 20);
    return rows;
  });
  const result = await withSeoReadDeadline({ expiresAt: start + 1500, signal: signal.signal },
    () => boundedSeoReadQuery('SELECT $1::int AS ok', [1]));
  assert.equal(result, rows);
  assert.equal(active.connect.mock.callCount(), 1);
  assert.equal(active.calls[0].text, 'BEGIN READ ONLY');
  const local = active.calls[1];
  const match = local.text.match(/^SET LOCAL statement_timeout\s*=\s*'(\d+)ms'$/);
  assert.ok(match, 'server protection must be transaction-local');
  const milliseconds = Number(match[1]);
  const remaining = start + 1500 - local.at;
  assert.ok(milliseconds > 0 && milliseconds < remaining && milliseconds <= 4000,
    'SET LOCAL uses the remaining shared budget with a cleanup reserve, never zero');
  assert.deepEqual(active.calls[2].values, [1]);
  assert.equal(active.calls.at(-1)?.text, 'COMMIT');
  assert.deepEqual(active.releases, [undefined]);
  assert.equal(getEventListeners(signal.signal, 'abort').length, 0);
  signal.abort();
  t.mock.timers.tick(10_000);
  await flush();
  assert.deepEqual(active.releases, [undefined], 'old timer/signal cannot discard a released client');
});

for (const kind of ['pre-aborted', 'expired', 'exact deadline'] as const) {
  test(`${kind}: no checkout or SQL is started`, async () => {
    const controller = new AbortController();
    if (kind === 'pre-aborted') controller.abort();
    await assert.rejects(withSeoReadDeadline({
      expiresAt: Date.now() + (kind === 'pre-aborted' ? 1000 : kind === 'expired' ? -1 : 0),
      signal: controller.signal,
    }, () => boundedSeoReadQuery('SELECT 1')), kind === 'pre-aborted' ? aborted : timeout);
    assert.equal(active.connect.mock.callCount(), 0);
    assert.deepEqual(active.calls, []);
    assert.deepEqual(active.releases, []);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  });
}

for (const reason of ['timeout', 'abort'] as const) {
  test(`checkout ${reason}: late handoff is released exactly once without even BEGIN`, async t => {
    const gate = Promise.withResolvers<typeof active.client>();
    active.connect.mock.mockImplementation(() => gate.promise);
    const controller = new AbortController();
    const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 250, signal: controller.signal },
      () => boundedSeoReadQuery('SELECT 1')));
    await flush();
    if (reason === 'abort') controller.abort();
    else t.mock.timers.tick(250);
    const result = await pending;
    assert.ok((reason === 'abort' ? aborted : timeout)(result.error));
    assert.deepEqual(active.releases, [], 'no client is owned while checkout is pending');
    gate.resolve(active.client);
    await flush();
    assert.deepEqual(active.calls, []);
    assert.deepEqual(active.releases, [undefined]);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    controller.abort();
    t.mock.timers.tick(10_000);
    await flush();
    assert.deepEqual(active.releases, [undefined]);
  });
}

test('the default four-second cap includes checkout even without a render context', async t => {
  const gate = Promise.withResolvers<typeof active.client>();
  active.connect.mock.mockImplementation(() => gate.promise);
  let finished = false;
  const pending = observe(boundedSeoReadQuery('SELECT 1')).then(result => { finished = true; return result; });
  t.mock.timers.tick(3999);
  await flush();
  assert.equal(finished, false);
  t.mock.timers.tick(1);
  assert.ok(timeout((await pending).error));
  gate.resolve(active.client);
  await flush();
  assert.deepEqual(active.calls, []);
  assert.deepEqual(active.releases, [undefined]);
});

test('late checkout rejection is consumed, without a release or a second caller result', async t => {
  const gate = Promise.withResolvers<typeof active.client>();
  active.connect.mock.mockImplementation(() => gate.promise);
  const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 50 }, () => boundedSeoReadQuery('SELECT 1')));
  t.mock.timers.tick(50);
  assert.ok(timeout((await pending).error));
  gate.reject(new Error('late pool connection failure'));
  await flush();
  assert.deepEqual(active.calls, []);
  assert.deepEqual(active.releases, []);
});

test('checkout failure preserves the original error and removes its abort listener/timer', async t => {
  const original = new Error('checkout refused');
  const controller = new AbortController();
  active.connect.mock.mockImplementation(async () => { throw original; });
  const result = await observe(withSeoReadDeadline({ expiresAt: Date.now() + 500, signal: controller.signal },
    () => boundedSeoReadQuery('SELECT 1')));
  assert.equal(result.error, original);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  controller.abort();
  t.mock.timers.tick(500);
  await flush();
  assert.deepEqual(active.releases, []);
});

for (const order of ['abort then handoff', 'handoff then abort'] as const) {
  test(`same-turn checkout race: ${order} cannot start SQL or double-release`, async () => {
    const gate = Promise.withResolvers<typeof active.client>();
    active.connect.mock.mockImplementation(() => gate.promise);
    const controller = new AbortController();
    const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 1000, signal: controller.signal },
      () => boundedSeoReadQuery('SELECT 1')));
    if (order === 'abort then handoff') { controller.abort(); gate.resolve(active.client); }
    else { gate.resolve(active.client); controller.abort(); }
    assert.ok(aborted((await pending).error));
    await flush();
    assert.deepEqual(active.calls, []);
    assert.deepEqual(active.releases, [undefined]);
  });
}

const stages = ['BEGIN READ ONLY', 'SET LOCAL', 'SELECT 1', 'COMMIT'] as const;
for (const stage of stages) {
  for (const reason of ['abort', 'timeout'] as const) {
    test(`${reason} during ${stage}: discard promptly, then ignore late query completion`, async t => {
      const gate = Promise.withResolvers<pg.QueryResult>();
      const controller = new AbortController();
      active.handle(async text => text.startsWith(stage) ? gate.promise : rows);
      const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 250, signal: controller.signal },
        () => boundedSeoReadQuery('SELECT 1')));
      await flush();
      assert.ok(active.calls.at(-1)?.text.startsWith(stage));
      const count = active.calls.length;
      if (reason === 'abort') controller.abort();
      else t.mock.timers.tick(250);
      assert.ok((reason === 'abort' ? aborted : timeout)((await pending).error));
      assert.deepEqual(active.releases, [true]);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      gate.resolve(rows);
      await flush();
      t.mock.timers.tick(10_000);
      assert.equal(active.calls.length, count, 'no COMMIT/ROLLBACK/business SQL after abandonment');
      assert.deepEqual(active.releases, [true]);
    });
  }
}

test('late rejection of an abandoned active query is consumed', async () => {
  const gate = Promise.withResolvers<pg.QueryResult>();
  const controller = new AbortController();
  active.handle(async text => text === 'SELECT 1' ? gate.promise : rows);
  const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 1000, signal: controller.signal },
    () => boundedSeoReadQuery('SELECT 1')));
  await flush();
  controller.abort();
  assert.ok(aborted((await pending).error));
  gate.reject(new Error('late socket rejection'));
  await flush();
  assert.deepEqual(active.releases, [true]);
  assert.equal(active.calls.at(-1)?.text, 'SELECT 1');
});

test('setup and SELECT share one deadline; COMMIT does not receive a fresh budget', async t => {
  const gate = Promise.withResolvers<pg.QueryResult>();
  const start = Date.now();
  active.handle(async text => {
    if (text === 'BEGIN READ ONLY') t.mock.timers.tick(200);
    if (text.startsWith('SET LOCAL')) t.mock.timers.tick(100);
    if (text === 'SELECT 1') t.mock.timers.tick(150);
    return text === 'COMMIT' ? gate.promise : rows;
  });
  const pending = observe(withSeoReadDeadline({ expiresAt: start + 500 }, () => boundedSeoReadQuery('SELECT 1')));
  await flush();
  assert.equal(active.calls.at(-1)?.text, 'COMMIT');
  assert.equal(Date.now(), start + 450);
  t.mock.timers.tick(50);
  assert.ok(timeout((await pending).error));
  assert.deepEqual(active.releases, [true]);
  gate.resolve(rows);
  await flush();
  assert.deepEqual(active.releases, [true]);
});

for (const stage of stages) {
  test(`SQL failure during ${stage} preserves its identity and releases once`, async () => {
    const original = Object.assign(new Error('fixture SQL failure'), { code: '57014' });
    active.handle(async text => {
      if (text.startsWith(stage)) throw original;
      return rows;
    });
    const result = await observe(withSeoReadDeadline({ expiresAt: Date.now() + 1000 }, () => boundedSeoReadQuery('SELECT 1')));
    assert.equal(result.error, original);
    if (stage === 'BEGIN READ ONLY') {
      assert.deepEqual(active.releases, [true], 'failed BEGIN leaves transaction state uncertain');
      assert.equal(active.calls.length, 1);
    } else {
      assert.equal(active.calls.at(-1)?.text, 'ROLLBACK');
      assert.deepEqual(active.releases, [undefined], 'acknowledged SQL error + completed rollback can reuse');
    }
  });
}

for (const cleanup of ['reject', 'hang', 'deadline before reserve'] as const) {
  test(`${cleanup}: rollback discards within 100ms and preserves the first SQL error`, async t => {
    const original = Object.assign(new Error('original statement cancellation'), { code: '57014' });
    const gate = Promise.withResolvers<pg.QueryResult>();
    const start = Date.now();
    active.handle(async text => {
      if (text === 'SELECT 1') throw original;
      if (text === 'ROLLBACK') {
        if (cleanup === 'reject') throw new Error('rollback connection failure');
        return gate.promise;
      }
      return rows;
    });
    let finished = false;
    const pending = observe(withSeoReadDeadline({ expiresAt: start + (cleanup === 'deadline before reserve' ? 50 : 1000) },
      () => boundedSeoReadQuery('SELECT 1'))).then(result => { finished = true; return result; });
    await flush();
    assert.equal(active.calls.at(-1)?.text, 'ROLLBACK');
    if (cleanup !== 'reject') {
      const bound = cleanup === 'hang' ? 100 : 50;
      t.mock.timers.tick(bound - 1);
      await flush();
      assert.equal(finished, false);
      t.mock.timers.tick(1);
    }
    assert.equal((await pending).error, original);
    assert.ok(Date.now() - start <= 100);
    assert.deepEqual(active.releases, [true]);
    if (cleanup !== 'reject') gate.reject(new Error('late rollback failure'));
    await flush();
    assert.deepEqual(active.releases, [true]);
  });
}

test('abort during rollback preserves the original SQL error and discards only once', async () => {
  const original = Object.assign(new Error('original SQL error'), { code: '57014' });
  const gate = Promise.withResolvers<pg.QueryResult>();
  const controller = new AbortController();
  active.handle(async text => {
    if (text === 'SELECT 1') throw original;
    return text === 'ROLLBACK' ? gate.promise : rows;
  });
  const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 1000, signal: controller.signal },
    () => boundedSeoReadQuery('SELECT 1')));
  await flush();
  assert.equal(active.calls.at(-1)?.text, 'ROLLBACK');
  controller.abort();
  assert.equal((await pending).error, original);
  assert.deepEqual(active.releases, [true]);
  gate.resolve(rows);
  await flush();
  assert.deepEqual(active.releases, [true]);
});

test('a transport query failure is discarded even if a mock rollback would acknowledge', async () => {
  const original = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
  active.handle(async text => {
    if (text === 'SELECT 1') throw original;
    return rows;
  });
  const result = await observe(withSeoReadDeadline({ expiresAt: Date.now() + 1000 }, () => boundedSeoReadQuery('SELECT 1')));
  assert.equal(result.error, original);
  assert.deepEqual(active.releases, [true], 'transport uncertainty is not a reusable SQL error');
});

test('a checked-out client transport event is handled, discarded and its listener removed', async () => {
  const original = Object.assign(new Error('socket failure during SELECT'), { code: 'ECONNRESET' });
  const gate = Promise.withResolvers<pg.QueryResult>();
  const controller = new AbortController();
  active.handle(async text => text === 'SELECT 1' ? gate.promise : rows);
  const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 1000, signal: controller.signal },
    () => boundedSeoReadQuery('SELECT 1')));
  try {
    await flush();
    assert.equal(active.calls.at(-1)?.text, 'SELECT 1');
    assert.doesNotThrow(() => active.client.emit('error', original), 'owned client errors must not escape as uncaught events');
    assert.equal((await pending).error, original);
    assert.deepEqual(active.releases, [true]);
    assert.equal(getEventListeners(active.client, 'error').length, 0);
  } finally {
    controller.abort();
    gate.resolve(rows);
    await pending;
    await flush();
  }
});
