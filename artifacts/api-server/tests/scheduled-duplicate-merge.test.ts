import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { inspect } from 'node:util';
let waiting = 0, utilization = 0, calls = 0, warning = 0, clearQuick = 0, countRefresh = 0, clearSimilar = 0;
let patterns: string[] = [];
let cycleResult = { processed: 1, deleted: 0, completed: false, refreshCounts: false };
let throwCycle = false, throwCache = false, throwRefresh = false, clock = 0;
const privateError = (label: string, code: unknown) => Object.assign(new Error(`private-${label}-message`), {
  code, detail: `private-${label}-detail`, where: `private-${label}-where`,
  query: `SELECT 'private-${label}-query'`, sql: `SELECT 'private-${label}-sql'`, stack: `private-${label}-stack`,
});
let cycleError: unknown, cacheError: unknown, refreshError: unknown;
let warnings: unknown[][] = [];
const assertPrivateLogs = () => assert.doesNotMatch(inspect(warnings, { showHidden: true, depth: null }), /private-/);
const previous = { NODE_ENV: process.env.NODE_ENV, BACKGROUND_JOBS_ENABLED: process.env.BACKGROUND_JOBS_ENABLED, DUPLICATE_MERGE_ENABLED: process.env.DUPLICATE_MERGE_ENABLED };
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => ({ get waitingCount() { return waiting; } }) } });
mock.module('node:perf_hooks', { namedExports: { performance: { now: () => clock, eventLoopUtilization: () => ({ utilization }) } } });
mock.module('../src/utils/logger', { namedExports: { logger: { warn(...args: unknown[]) { warning++; warnings.push(args); } } } });
mock.module('../src/data/postgres-duplicate-jobs-store', { namedExports: { DUPLICATE_MERGE_FAILURE_BACKOFF_MS: 60_000, PostgresDuplicateJobsStore: class {
  async runCycle() { calls++; await new Promise(resolve => setTimeout(resolve, 3)); if (throwCycle) throw cycleError; return cycleResult; }
} } });
mock.module('../src/cache', { defaultExport: { async clearByPattern(pattern: string) { patterns.push(pattern); if (throwCache && pattern === 'stations') throw cacheError; } } });
mock.module('../src/performance-cache', { namedExports: { performanceCache: { clearSeoAndQuickCaches() { clearQuick++; if (throwRefresh) throw refreshError; }, clearSimilarStationPools() { clearSimilar++; } } } });
mock.module('../src/services/genre-station-counts', { namedExports: { triggerGenreStationCountsRecompute() { countRefresh++; } } });
const { ScheduledDuplicateMerge, duplicateMergeEnabled } = await import('../src/services/scheduled-duplicate-merge');
beforeEach(() => {
  process.env.NODE_ENV = 'production'; delete process.env.BACKGROUND_JOBS_ENABLED; delete process.env.DUPLICATE_MERGE_ENABLED;
  waiting = utilization = calls = warning = clearQuick = countRefresh = clearSimilar = clock = 0;
  patterns = []; warnings = []; throwCycle = throwCache = throwRefresh = false;
  cycleError = privateError('seed', '57014'); cacheError = privateError('cache', '08006'); refreshError = privateError('refresh', 'XX000');
  cycleResult = { processed: 1, deleted: 0, completed: false, refreshCounts: false };
});
after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
test('defaults enabled in production but each explicit safety gate stops work', async () => {
  assert.equal(duplicateMergeEnabled(), true);
  for (const [name,value] of [['BACKGROUND_JOBS_ENABLED','false'],['DUPLICATE_MERGE_ENABLED','false'],['NODE_ENV','development']]) {
    const original = process.env[name]; process.env[name] = value;
    assert.equal(duplicateMergeEnabled(), false); await new ScheduledDuplicateMerge().runOnce();
    if (original === undefined) delete process.env[name]; else process.env[name] = original;
  }
  assert.equal(calls, 0);
});
test('only one in-process cycle and no invalidation for previews', async () => {
  const worker = new ScheduledDuplicateMerge();
  await Promise.all([worker.runOnce(), worker.runOnce()]);
  assert.equal(calls, 1); assert.equal(patterns.length, 0); assert.equal(clearQuick, 0);
});
test('foreground database contention or high event-loop utilization prevents a cycle', async () => {
  waiting = 1; await new ScheduledDuplicateMerge().runOnce();
  waiting = 0; utilization = 0.8; await new ScheduledDuplicateMerge().runOnce();
  assert.equal(calls, 0);
});
test('committed groups invalidate bounded cache patterns once; counts refresh at completion', async () => {
  cycleResult = { processed: 10, deleted: 10, completed: true, refreshCounts: true };
  await new ScheduledDuplicateMerge().runOnce();
  assert.deepEqual(patterns, ['popular_stations','stations','community_favorites','station:detail:','similar:']);
  assert.equal(clearQuick, 1); assert.equal(countRefresh, 1); assert.equal(clearSimilar, 1);
});
test('failed seed cycles log only safe metadata and throttle retries until the bounded cooldown expires', async () => {
  const worker = new ScheduledDuplicateMerge(); throwCycle = true; await worker.runOnce();
  assert.equal(patterns.length, 0); assert.equal(clearQuick, 0); assert.equal(countRefresh, 0);
  assert.deepEqual(warnings, [['[duplicate-merge] bounded cycle deferred; durable queue retained', { phase: 'cycle', code: '57014' }]]);
  assertPrivateLogs();
  throwCycle = false;
  for (clock of [5_000, 15_000, 59_999]) await worker.runOnce();
  assert.equal(calls, 1); assert.equal(warning, 1);
  clock = 60_000; await worker.runOnce();
  assert.equal(calls, 2); assert.equal(warning, 1); assert.equal(patterns.length, 0);
  await worker.runOnce(); assert.equal(calls, 3);
});
test('persistent cycle failures renew the local cooldown without immediate retry loops', async () => {
  const worker = new ScheduledDuplicateMerge(); throwCycle = true;
  await worker.runOnce(); clock = 60_000; await worker.runOnce();
  clock = 119_999; await worker.runOnce();
  assert.equal(calls, 2); assert.equal(warning, 2);
  clock = 120_000; throwCycle = false;
  cycleResult = { processed: 1, deleted: 1, completed: true, refreshCounts: true };
  await worker.runOnce();
  assert.equal(calls, 3); assert.equal(patterns.length, 5);
  assert.equal(clearQuick, 1); assert.equal(clearSimilar, 1); assert.equal(countRefresh, 1);
});
test('postcommit cache failures neither throttle the worker nor suppress other invalidations and count refresh', async () => {
  const worker = new ScheduledDuplicateMerge(); throwCache = true;
  cycleResult = { processed: 1, deleted: 1, completed: true, refreshCounts: true };
  await worker.runOnce();
  assert.equal(patterns.length, 5); assert.equal(clearQuick, 1); assert.equal(clearSimilar, 1); assert.equal(countRefresh, 1);
  assert.deepEqual(warnings, [['[duplicate-merge] committed cycle cache invalidation failed', { phase: 'cache_invalidation', code: '08006' }]]);
  assertPrivateLogs();
  throwCache = false; await worker.runOnce();
  assert.equal(calls, 2); assert.equal(patterns.length, 10); assert.equal(countRefresh, 2); assert.equal(warning, 1);
});
test('postcommit refresh errors log only safe metadata and release the worker without a retry cooldown', async () => {
  const worker = new ScheduledDuplicateMerge(); throwRefresh = true;
  cycleResult = { processed: 1, deleted: 1, completed: true, refreshCounts: true };
  await worker.runOnce();
  assert.deepEqual(warnings, [['[duplicate-merge] committed cycle cache refresh failed', { phase: 'cache_refresh', code: 'XX000' }]]);
  assertPrivateLogs();
  throwRefresh = false; await worker.runOnce();
  assert.equal(calls, 2); assert.equal(clearQuick, 2); assert.equal(countRefresh, 1);
});
test('log metadata omits malformed, nonstring, and accessor error codes without leaking private fields', async () => {
  const invalidCodes = ['5701', '570140', '57p14', '5701\n', '5701\r', '5701\u2028', '5701\u2029', '57014\n', '57014\r', '57014\0', 'private-SQL', 57014, null, undefined, { value: '57014' }];
  const accessorError = Object.defineProperty(privateError('accessor', undefined), 'code', {
    get() { throw new Error('private-code-accessor'); },
  });
  throwCycle = true;
  for (const error of [...invalidCodes.map(code => privateError('invalid', code)), accessorError, 'private-raw-error', null]) {
    cycleError = error; warnings = [];
    await new ScheduledDuplicateMerge().runOnce();
    assert.deepEqual(warnings, [['[duplicate-merge] bounded cycle deferred; durable queue retained', { phase: 'cycle' }]]);
    assertPrivateLogs();
  }
});
