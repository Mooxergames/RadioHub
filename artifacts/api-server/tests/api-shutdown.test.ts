import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { test, type TestContext } from 'node:test';
import ts from 'typescript';
import { createGracefulRestartController } from '../src/utils/graceful-restart';

const source = readFileSync(new URL('../src/index-api.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index-api.ts', source, ts.ScriptTarget.Latest, true);
function declaration(name: string): ts.VariableDeclaration {
  let found: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(found, `Missing production declaration: ${name}`);
  return found;
}

// Exercise the production closure without importing database startup or jobs.
const isolated = ts.transpileModule(`
  const { server, closePostgres, requestedShutdownExitCode, process, setTimeout, clearTimeout, clearInterval, console } = context;
  const ${declaration('API_DRAIN_TIMEOUT_MS').getText(parsed)};
  const ${declaration('API_SHUTDOWN_TIMEOUT_MS').getText(parsed)};
  let startupReady = true;
  let isShuttingDown = false;
  let watchdogTimerRef = {};
  const ${declaration('gracefulShutdown').getText(parsed)};
  return { shutdown: gracefulShutdown, ready: () => startupReady,
    drainMs: API_DRAIN_TIMEOUT_MS, totalMs: API_SHUTDOWN_TIMEOUT_MS };
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function harness(t: TestContext, options: {
  server?: any;
  closePostgres?: () => Promise<void>;
  exitCode?: () => number;
} = {}) {
  const exits: number[] = [];
  const timers: Array<{ milliseconds: number; callback: () => void; handle: ReturnType<typeof setTimeout> }> = [];
  let watchdogCleared = 0;
  let forceClosed = 0;
  let databaseClosed = 0;
  const context = {
    server: options.server || { close: (done: () => void) => done(), closeAllConnections: () => { forceClosed++; } },
    closePostgres: options.closePostgres || (async () => { databaseClosed++; }),
    requestedShutdownExitCode: options.exitCode || (() => 0),
    process: { exit: (code: number) => { exits.push(code); } },
    setTimeout: (callback: () => void, milliseconds: number) => {
      const handle = setTimeout(callback, milliseconds / 100);
      timers.push({ milliseconds, callback, handle });
      return handle;
    },
    clearTimeout,
    clearInterval: () => { watchdogCleared++; },
    console: { log() {}, warn() {}, error() {} },
  };
  t.after(() => { for (const timer of timers) clearTimeout(timer.handle); });
  const production = new Function('context', isolated)(context) as {
    shutdown: (signal: string) => Promise<void>;
    ready: () => boolean;
    drainMs: number;
    totalMs: number;
  };
  return { ...production, exits, timers, watchdogCleared: () => watchdogCleared,
    forceClosed: () => forceClosed, databaseClosed: () => databaseClosed };
}

test('API budgets cover 120s uploads, reserve 5s cleanup and fit Railway 145s', t => {
  const fixture = harness(t);
  assert.equal(fixture.drainMs, 125_000);
  assert.equal(fixture.totalMs, 130_000);
  assert.equal(fixture.totalMs - fixture.drainMs, 5_000);
  assert.ok(fixture.totalMs < 145_000);
  assert.match(source, /server\.timeout = 120000/);
  assert.match(source, /\(server as any\)\.requestTimeout = 120_000/);
  assert.match(source, /setTimeout\(\(\) => process\.exit\(1\), API_SHUTDOWN_TIMEOUT_MS\)\.unref\(\)/);
});

test('readiness drops before existing WebSocket close/HTTP drain and DB closes last, once', async t => {
  const order: string[] = [];
  let drained!: () => void;
  const wss = (name: string) => ({
    clients: [{ close(code: number, reason: string) {
      assert.equal(fixture.ready(), false);
      assert.equal(code, 1001); assert.equal(reason, 'server-shutdown'); order.push(name);
    } }],
    close() { order.push(`${name}:closed`); },
  });
  const fixture = harness(t, {
    server: { metadataWss: wss('metadata'), castWss: wss('cast'), chatWss: wss('chat'),
      close(done: () => void) { assert.equal(fixture.ready(), false); order.push('http'); drained = done; },
      closeAllConnections() { assert.fail('unexpected force close'); },
    },
    closePostgres: async () => { order.push('database'); },
  });
  const pending = fixture.shutdown('SIGTERM');
  assert.equal(fixture.ready(), false);
  await fixture.shutdown('SIGINT');
  assert.equal(fixture.watchdogCleared(), 1);
  assert.deepEqual(order, ['metadata', 'metadata:closed', 'cast', 'cast:closed', 'chat', 'chat:closed', 'http']);
  drained();
  await pending;
  assert.equal(order.at(-1), 'database');
  assert.deepEqual(fixture.exits, [0]);
});

test('internal watchdog/RSS/fatal restart intent remains nonzero after successful cleanup', async t => {
  let pending: Promise<void> | undefined;
  const restart = createGracefulRestartController(() => { pending = fixture.shutdown('SIGTERM'); }, () => assert.fail('unexpected force exit'));
  const fixture = harness(t, { exitCode: restart.exitCode });
  restart.request(); restart.request();
  await pending;
  assert.equal(fixture.databaseClosed(), 1);
  assert.deepEqual(fixture.exits, [1]);
  assert.equal((source.match(/requestGracefulRestart\(\)/g) || []).length, 5);
  assert.doesNotMatch(source, /process\.kill\(process\.pid,\s*'SIGTERM'\)/);
});

for (const scenario of ['admin', 'upload'] as const) {
  test(`${scenario} request survives the old 10s drain without changing the 120s receive budget (100x scaled)`, { timeout: 5_000 }, async t => {
    let accepted!: () => void;
    const incoming = new Promise<void>(resolve => { accepted = resolve; });
    let handlerFinished = false;
    const server = http.createServer((req, res) => {
      accepted();
      if (scenario === 'admin') {
        req.setTimeout(55_000 / 100);
        setTimeout(() => { handlerFinished = true; res.end('ok'); }, 500);
      } else {
        req.resume();
        req.on('end', () => { handlerFinished = true; res.end('ok'); });
      }
    });
    server.requestTimeout = 120_000 / 100;
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    let client!: http.ClientRequest;
    const response = new Promise<string>((resolve, reject) => {
      client = http.request({ host: '127.0.0.1', port: (server.address() as any).port,
        path: scenario === 'admin' ? '/api/admin/sitemap/rebuild' : '/api/messages/upload',
        method: 'POST', agent: false, headers: { 'Content-Length': scenario === 'upload' ? '2' : '0' },
      }, res => {
        let body = ''; res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve(body)); res.on('error', reject);
      });
      client.on('error', reject);
      if (scenario === 'upload') client.write('a'); else client.end();
    });
    const observedResponse = response.catch(error => { throw error; });
    t.after(() => client.destroy());
    await incoming;
    const fixture = harness(t, { server, closePostgres: async () => { assert.equal(handlerFinished, true); } });
    const pending = fixture.shutdown('SIGTERM');
    assert.equal(fixture.ready(), false);
    if (scenario === 'upload') {
      const timer = setTimeout(() => client.end('b'), 900);
      t.after(() => clearTimeout(timer));
    }
    assert.equal(await observedResponse, 'ok');
    await pending;
    assert.deepEqual(fixture.exits, [0]);
  });
}

test('drain deadline closes stuck HTTP connections and fails before DB cleanup', async t => {
  let forced = 0;
  const fixture = harness(t, { server: { close() {}, closeAllConnections() { forced++; } } });
  const pending = fixture.shutdown('SIGTERM');
  fixture.timers.find(timer => timer.milliseconds === 125_000)!.callback();
  await pending;
  assert.equal(forced, 1);
  assert.equal(fixture.databaseClosed(), 0);
  assert.deepEqual(fixture.exits, [1]);
});

test('total deadline forces a failure exit if DB cleanup never completes', async t => {
  let entered!: () => void;
  const databaseEntered = new Promise<void>(resolve => { entered = resolve; });
  const fixture = harness(t, { closePostgres: () => { entered(); return new Promise<void>(() => {}); } });
  void fixture.shutdown('SIGTERM');
  await databaseEntered;
  fixture.timers.find(timer => timer.milliseconds === 130_000)!.callback();
  assert.deepEqual(fixture.exits, [1]);
});

test('HTTP close and DB cleanup errors stay failures', async t => {
  const httpFailure = harness(t, { server: {
    close(done: (error: Error) => void) { done(new Error('fixture close error')); }, closeAllConnections() {},
  } });
  await httpFailure.shutdown('SIGTERM');
  assert.equal(httpFailure.databaseClosed(), 0);
  assert.deepEqual(httpFailure.exits, [1]);
  const databaseFailure = harness(t, { closePostgres: async () => { throw new Error('fixture cleanup error'); } });
  await databaseFailure.shutdown('SIGTERM');
  assert.deepEqual(databaseFailure.exits, [1]);
});
