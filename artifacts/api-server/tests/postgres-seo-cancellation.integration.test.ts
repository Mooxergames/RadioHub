import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, mock, test } from 'node:test';
import pg from 'pg';
import { withSeoReadDeadline } from '../src/utils/seo-read-deadline';

function localDatabaseUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'explicit PostgreSQL fixture URL required');
  assert.ok(['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname), 'cancellation fixtures must use loopback');
  assert.ok(url.username && url.pathname.length > 1, 'fixture user and database must be explicit');
  assert.equal(url.search, '', 'fixture URL must not contain connection/host overrides');
  return url;
}

const database = localDatabaseUrl(process.env.PG_TEST_DATABASE_URL);
let runtimePool: Pick<pg.Pool, 'connect'>;
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => {
  assert.ok(runtimePool, 'integration pool must be explicitly initialized');
  return runtimePool;
} } });
const { boundedSeoReadQuery } = await import('../src/data/postgres-seo-read-query');
const pause = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
const observe = <T>(promise: Promise<T>) => promise.then(
  value => ({ value, error: undefined }),
  (error: any) => ({ value: undefined, error }),
);

test('native cancellation fixtures reject non-loopback URLs and never infer an ambient database', () => {
  assert.equal(localDatabaseUrl(undefined), undefined);
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.ok(localDatabaseUrl(`postgres://fixture@${host}:55487/fixture_test`));
  }
  for (const value of ['postgres://fixture@db.example.invalid/test', 'https://localhost/test',
    'postgres://fixture@localhost/test?host=db.example.invalid', 'postgres://localhost/test']) {
    assert.throws(() => localDatabaseUrl(value));
  }
});

describe('native PostgreSQL SSR cancellation lifecycle', { skip: !database, timeout: 30_000, concurrency: false }, () => {
  const application = `seo-cancel-${randomUUID().slice(0, 12)}`;
  let pool: pg.Pool;
  let observer: pg.Pool;
  const calls: string[] = [];
  const releases: Array<Error | boolean | undefined> = [];
  const poolErrors: Error[] = [];

  before(async () => {
    assert.ok(database);
    const config: pg.PoolConfig = {
      host: database.hostname.replace(/^\[|\]$/g, ''),
      port: Number(database.port || 5432),
      user: decodeURIComponent(database.username),
      password: () => Promise.resolve(decodeURIComponent(database.password)),
      database: decodeURIComponent(database.pathname.slice(1)),
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 1000,
      idleTimeoutMillis: 0,
      statement_timeout: 2000,
      idle_in_transaction_session_timeout: 2000,
      options: '-c default_transaction_read_only=on',
    };
    pool = new pg.Pool({ ...config, application_name: application });
    observer = new pg.Pool({ ...config, application_name: `${application}-observer` });
    pool.on('error', error => poolErrors.push(error));
    observer.on('error', error => poolErrors.push(error));
    runtimePool = { connect: async () => {
      const client = await pool.connect();
      return new Proxy(client, { get(target, key) {
        if (key === 'query') return (text: string, values?: any[]) => {
          calls.push(text);
          return target.query(text, values);
        };
        if (key === 'release') return (discard?: Error | boolean) => {
          releases.push(discard);
          target.release(discard);
        };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    } } as Pick<pg.Pool, 'connect'>;
    const identity = (await pool.query("SELECT pg_backend_pid() AS pid, current_setting('application_name') AS app, current_setting('default_transaction_read_only') AS read_only")).rows[0];
    assert.equal(identity.app, application);
    assert.equal(identity.read_only, 'on');
    assert.equal((await observer.query('SELECT 1 AS ok')).rows[0].ok, 1);
  });

  after(async () => {
    await pool?.end();
    await observer?.end();
    assert.deepEqual(poolErrors, [], 'no unhandled idle-pool transport errors');
  });

  async function waitFor(check: () => Promise<boolean>, milliseconds: number, message: string) {
    const expiresAt = Date.now() + milliseconds;
    while (Date.now() < expiresAt) {
      if (await check()) return;
      await pause(10);
    }
    assert.fail(message);
  }

  async function ownActivity(pid: number) {
    return (await observer.query(
      'SELECT state, wait_event, query FROM pg_stat_activity WHERE pid=$1 AND application_name=$2',
      [pid, application],
    )).rows;
  }

  test('server-side 57014 rolls back and restores statement_timeout on the same backend', { timeout: 5000 }, async t => {
    calls.length = 0; releases.length = 0;
    const before = (await pool.query("SELECT pg_backend_pid() AS pid, current_setting('statement_timeout') AS timeout")).rows[0];
    const started = Date.now();
    const result = await observe(withSeoReadDeadline({ expiresAt: started + 700 },
      () => boundedSeoReadQuery('SELECT pg_sleep(1)')));
    assert.equal(result.error?.code, '57014', 'PostgreSQL, not only the JS wrapper, cancelled the statement');
    assert.ok(Date.now() - started < 1500);
    assert.equal(calls[0], 'BEGIN READ ONLY');
    assert.match(calls[1], /^SET LOCAL statement_timeout/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.deepEqual(releases, [undefined]);
    const after = (await pool.query("SELECT pg_backend_pid() AS pid, current_setting('statement_timeout') AS timeout, 1 AS ok")).rows[0];
    assert.equal(after.pid, before.pid, 'max=1 forces verification of the actual reused session');
    assert.equal(after.timeout, before.timeout);
    assert.equal(after.ok, 1);
    const activity = await ownActivity(before.pid);
    assert.equal(activity.length, 1);
    assert.equal(activity[0].state, 'idle', 'no idle-in-transaction session survives rollback');
    assert.equal(pool.waitingCount, 0);
    t.diagnostic(JSON.stringify({ scenario: 'server-timeout-reuse', pidBefore: before.pid, pidAfter: after.pid,
      timeoutBefore: before.timeout, timeoutAfter: after.timeout, elapsedMs: Date.now() - started }));
  });

  test('request abort discards an active socket; its own backend exits and a new SELECT succeeds', { timeout: 5000 }, async t => {
    calls.length = 0; releases.length = 0;
    const pid = (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const controller = new AbortController();
    const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 2000, signal: controller.signal },
      () => boundedSeoReadQuery('SELECT pg_sleep(1)')));
    try {
      await waitFor(async () => {
        const activity = await ownActivity(pid);
        return activity.some(row => row.state === 'active' && row.wait_event === 'PgSleep');
      }, 1000, 'the task-owned backend never entered the sleep statement');
      const abortedAt = Date.now();
      controller.abort();
      assert.equal((await pending).error?.name, 'AbortError');
      assert.ok(Date.now() - abortedAt < 500, 'caller must not wait for the server sleep to finish');
      assert.deepEqual(releases, [true]);
      assert.equal(calls.at(-1), 'SELECT pg_sleep(1)', 'no rollback is queued behind an abandoned active statement');
      await waitFor(async () => (await ownActivity(pid)).length === 0, 2000,
        'discarded task-owned backend outlived the bounded cleanup window');
      const next = (await pool.query('SELECT pg_backend_pid() AS pid, 1 AS ok')).rows[0];
      assert.notEqual(next.pid, pid);
      assert.equal(next.ok, 1);
      assert.equal(pool.waitingCount, 0);
      assert.equal(pool.idleCount, 1);
      t.diagnostic(JSON.stringify({ scenario: 'request-abort-discard', oldPid: pid, nextPid: next.pid,
        backendCleanupMs: Date.now() - abortedAt, discarded: true, nextSelect: next.ok }));
    } finally {
      controller.abort();
      await pending;
    }
  });

  test('the end-to-end deadline discards a still-running multi-statement read', { timeout: 5000 }, async t => {
    calls.length = 0; releases.length = 0;
    const pid = (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    // Each statement fits the server limit; their sum must still obey one caller deadline.
    const text = Array.from({ length: 6 }, () => 'SELECT pg_sleep(0.3)').join('; ');
    const started = Date.now();
    const result = await observe(withSeoReadDeadline({ expiresAt: started + 1200 },
      () => boundedSeoReadQuery(text)));
    assert.equal(result.error?.code, 'SEO_READ_TIMEOUT');
    assert.ok(Date.now() - started < 2000);
    assert.deepEqual(releases, [true]);
    assert.equal(calls.at(-1), text, 'no cleanup query may queue behind the active read');
    const discardedAt = Date.now();
    await waitFor(async () => (await ownActivity(pid)).length === 0, 2000,
      'deadline-discarded task-owned backend did not exit within the cleanup bound');
    const next = (await pool.query('SELECT pg_backend_pid() AS pid, 1 AS ok')).rows[0];
    assert.notEqual(next.pid, pid);
    assert.equal(next.ok, 1);
    assert.equal(pool.waitingCount, 0);
    t.diagnostic(JSON.stringify({ scenario: 'deadline-discard', oldPid: pid, nextPid: next.pid,
      backendCleanupMs: Date.now() - discardedAt, totalMs: Date.now() - started, nextSelect: next.ok }));
  });

  test('expired pool waiter starts no SQL on late checkout and returns the same healthy session', { timeout: 5000 }, async t => {
    calls.length = 0; releases.length = 0;
    const held = await pool.connect();
    const pid = (await held.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pending = observe(withSeoReadDeadline({ expiresAt: Date.now() + 80 },
      () => boundedSeoReadQuery('SELECT pg_sleep(1)')));
    let handedBack = false;
    try {
      await waitFor(async () => pool.waitingCount === 1, 500, 'SSR read did not enter the pool checkout queue');
      assert.equal((await pending).error?.code, 'SEO_READ_TIMEOUT');
      assert.equal(pool.waitingCount, 1, 'caller deadline does not pretend to cancel a public pg pool waiter');
      assert.deepEqual(calls, []);
      held.release(); handedBack = true;
      await waitFor(async () => pool.waitingCount === 0 && pool.idleCount === 1, 500,
        'late checkout was not reclaimed');
      assert.deepEqual(calls, [], 'not even BEGIN may run after the read deadline');
      assert.deepEqual(releases, [undefined]);
      const next = (await pool.query('SELECT pg_backend_pid() AS pid, 1 AS ok')).rows[0];
      assert.equal(next.pid, pid);
      assert.equal(next.ok, 1);
      t.diagnostic(JSON.stringify({ scenario: 'late-checkout', pidBefore: pid, pidAfter: next.pid,
        sqlStarted: calls.length, releases: releases.length, waitingAfterReclaim: pool.waitingCount, nextSelect: next.ok }));
    } finally {
      if (!handedBack) held.release();
      await pending;
    }
  });
});
