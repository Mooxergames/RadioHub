import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createWebShutdown, WEB_DRAIN_TIMEOUT_MS, WEB_SHUTDOWN_TIMEOUT_MS } from '../src/utils/web-shutdown';
import { createGracefulRestartController } from '../src/utils/graceful-restart';
import { WEB_API_PROXY_TIMEOUTS } from '../src/middleware/web-request-timeout';

test('shutdown budgets allow the 58s upstream timeout, 5s cleanup and Railway 75s margin', () => {
  assert.equal(WEB_DRAIN_TIMEOUT_MS, 60_000);
  assert.equal(WEB_SHUTDOWN_TIMEOUT_MS, 65_000);
  assert.ok(WEB_DRAIN_TIMEOUT_MS > WEB_API_PROXY_TIMEOUTS.proxyTimeout);
  assert.equal(WEB_SHUTDOWN_TIMEOUT_MS - WEB_DRAIN_TIMEOUT_MS, 5_000);
  assert.ok(WEB_SHUTDOWN_TIMEOUT_MS < 75_000);
});

test('readiness drops synchronously and all listeners drain before database closure, once', async () => {
  let ready = true;
  const callbacks: Array<() => void> = [];
  const events: string[] = [];
  const servers = ['http', 'https'].map(name => ({
    close: (done: () => void) => { assert.equal(ready, false); events.push(name); callbacks.push(done); },
    closeAllConnections: () => assert.fail('unexpected force close'),
  })) as any;
  const shutdown = createWebShutdown({ servers,
    onStart: () => { ready = false; events.push('unready'); },
    closeResources: async () => { events.push('database'); },
    exitCode: () => 0, exit: code => events.push(`exit:${code}`),
  });
  const pending = shutdown('SIGTERM');
  assert.equal(ready, false);
  assert.equal(shutdown('SIGINT'), pending);
  assert.deepEqual(events, ['unready', 'http', 'https']);
  callbacks[0]();
  await Promise.resolve();
  assert.equal(events.includes('database'), false);
  callbacks[1]();
  await pending;
  assert.deepEqual(events, ['unready', 'http', 'https', 'database', 'exit:0']);
});

test('internal recovery preserves failure exit intent through a successful drain', async () => {
  const exits: number[] = [];
  let pending: Promise<void> | undefined;
  const restart = createGracefulRestartController(() => { pending = shutdown('SIGTERM'); }, () => assert.fail('unexpected forced exit'));
  const shutdown = createWebShutdown({ servers: [], onStart: () => {}, closeResources: async () => {},
    exitCode: restart.exitCode, exit: code => exits.push(code),
  });
  restart.request(); restart.request();
  await pending;
  assert.deepEqual(exits, [1]);
});

test('an active request outlives the old 10s drain and finishes before resources close (100x scaled)', { timeout: 5_000 }, async t => {
  let accepted!: () => void;
  const seen = new Promise<void>(resolve => { accepted = resolve; });
  const server = http.createServer((_req, res) => { accepted(); setTimeout(() => res.end('ok'), 400); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = new Promise<string>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: (server.address() as any).port, agent: false }, res => {
      let body = ''; res.on('data', data => { body += data; }); res.on('end', () => resolve(body)); res.on('error', reject);
    }).on('error', reject);
  });
  await seen;
  const exits: number[] = [];
  let resourcesClosed = false;
  const shutdown = createWebShutdown({ servers: [server], onStart: () => {},
    closeResources: async () => { resourcesClosed = true; }, exitCode: () => 0, exit: code => exits.push(code),
    drainMs: WEB_DRAIN_TIMEOUT_MS / 100, timeoutMs: WEB_SHUTDOWN_TIMEOUT_MS / 100,
  });
  const pending = shutdown('SIGTERM');
  assert.equal(resourcesClosed, false);
  assert.equal(await response, 'ok');
  await pending;
  assert.equal(resourcesClosed, true);
  assert.deepEqual(exits, [0]);
});

test('a stuck drain is bounded and exits nonzero without closing DB under an active request', async () => {
  let forced = 0;
  const exits: number[] = [];
  const server = { close: () => {}, closeAllConnections: () => { forced++; } } as any;
  const shutdown = createWebShutdown({ servers: [server], onStart: () => {},
    closeResources: async () => assert.fail('drain did not finish'), exitCode: () => 0, exit: code => exits.push(code),
    drainMs: 20, timeoutMs: 100,
  });
  await shutdown('SIGTERM');
  assert.equal(forced, 1);
  assert.deepEqual(exits, [1]);
});

test('a hanging database close hits the total deadline and cannot later exit twice', async () => {
  let release!: () => void;
  let forced!: () => void;
  const deadline = new Promise<void>(resolve => { forced = resolve; });
  const exits: number[] = [];
  const shutdown = createWebShutdown({ servers: [], onStart: () => {},
    closeResources: () => new Promise<void>(resolve => { release = resolve; }),
    exitCode: () => 0, exit: code => { exits.push(code); forced(); }, drainMs: 10, timeoutMs: 30,
  });
  const pending = shutdown('SIGTERM');
  await deadline;
  assert.deepEqual(exits, [1]);
  release();
  await pending;
  assert.deepEqual(exits, [1]);
});

test('production web uses shared restart intent for fatal errors, all watchdog paths and RSS', () => {
  const source = readFileSync(new URL('../src/index-web.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/requestGracefulRestart\(\)/g) || []).length, 5);
  assert.doesNotMatch(source, /process\.kill\(process\.pid,\s*'SIGTERM'\)/);
  assert.match(source, /createWebShutdown\(\{[\s\S]*?onStart: signal => \{\s*isShuttingDown = true;\s*startupReady = false;\s*clearInterval\(watchdogTimerRef\)/);
  assert.match(source, /closeResources: closePostgres,\s*exitCode: requestedShutdownExitCode/);
  assert.match(source, /webServers\.push\(httpsServer\)/);
});
