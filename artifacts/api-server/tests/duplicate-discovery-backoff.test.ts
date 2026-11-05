import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type pg from 'pg';

mock.module('../src/data/postgres-catalog-store', { namedExports: { PostgresCatalogStore: class {} } });
const { DUPLICATE_AUTO_DISCOVERY_BACKOFF_MS, DUPLICATE_MERGE_FAILURE_BACKOFF_MS, PostgresDuplicateJobsStore } = await import('../src/data/postgres-duplicate-jobs-store');

for (const scenario of [
  { kind: 'automatic', phase: 'seed', code: '57014', discoveryBackoff: true },
  { kind: 'automatic', phase: 'seed', code: '55P03', discoveryBackoff: false },
  { kind: 'automatic', phase: 'seed', code: 'XX000', discoveryBackoff: false },
  { kind: 'automatic', phase: 'before_seed', code: '57014', discoveryBackoff: false },
  { kind: 'automatic', phase: 'after_seed', code: '57014', discoveryBackoff: false },
  { kind: 'preview', phase: 'seed', code: '57014', discoveryBackoff: false },
  { kind: 'manual', phase: 'after_seed', code: '57014', discoveryBackoff: false },
]) {
  test(`${scenario.kind} ${scenario.phase} ${scenario.code} selects only the intended discovery backoff`, async () => {
    const now = new Date('2030-01-01T00:00:00Z');
    const original = Object.assign(new Error('simulated timeout'), { code: scenario.code });
    const calls: { sql: string; values: unknown[] }[] = [];
    const job = { id: 'a'.repeat(24), kind: scenario.kind, phase: scenario.kind === 'manual' ? 'evaluate' : 'scan' };
    let releases = 0;
    const store = new PostgresDuplicateJobsStore({ waitingCount: 0, async connect() { return {
      async query(sql: string, values: unknown[] = []) {
        calls.push({ sql, values });
        if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }] };
        if (sql.startsWith('SELECT *,next_cycle_at::text')) return { rows: [{ next_cycle_at: now, expected_next_cycle_at: now.toISOString(), next_auto_at: now, summary: {} }] };
        if (sql.startsWith('SELECT * FROM station_duplicate_jobs')) return { rows: scenario.kind === 'automatic' ? [] : [job] };
        if (sql.startsWith('INSERT INTO station_duplicate_jobs')) return { rows: [job] };
        if (scenario.phase === 'before_seed' && sql.startsWith("UPDATE station_duplicate_jobs SET status='running'")) throw original;
        if (scenario.phase === 'seed' && sql.startsWith('WITH grouped AS')) throw original;
        if (scenario.phase === 'after_seed' && sql.startsWith('SELECT * FROM station_duplicate_job_groups')) throw original;
        if (sql.startsWith('SELECT count(*)')) return { rows: [{ total: 0 }] };
        return { rows: [], rowCount: 0 };
      },
      release(discard: boolean) { assert.equal(discard, false); releases++; },
    }; } } as unknown as pg.Pool);
    await assert.rejects(store.runCycle(now), error => error === original);
    const deferrals = calls.filter(call => call.sql.includes('SET next_cycle_at=GREATEST'));
    assert.equal(deferrals.length, 1);
    assert.deepEqual(deferrals[0].values, [now, now.toISOString(), DUPLICATE_MERGE_FAILURE_BACKOFF_MS,
      scenario.discoveryBackoff, DUPLICATE_AUTO_DISCOVERY_BACKOFF_MS]);
    assert.equal(DUPLICATE_MERGE_FAILURE_BACKOFF_MS, 60_000);
    assert.equal(DUPLICATE_AUTO_DISCOVERY_BACKOFF_MS, 900_000);
    assert.equal(calls.filter(call => call.sql === 'ROLLBACK').length, 1);
    assert.equal(calls.at(-1)?.sql, 'COMMIT');
    assert.equal(releases, 1);
  });
}
