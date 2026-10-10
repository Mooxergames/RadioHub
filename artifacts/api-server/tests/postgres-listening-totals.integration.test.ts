import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

const connectionString = process.env.PG_TEST_DATABASE_URL;
describe('transactional listening totals', { skip: !connectionString }, () => {
  const schema = `listening_total_${process.pid}_${randomBytes(6).toString('hex')}`;
  const ssl = process.env.PG_TEST_SSL === 'require' ? { rejectUnauthorized: true } : false;
  const admin = new pg.Pool({ connectionString, ssl, max: 1 });
  const env = { DATABASE_URL: process.env.DATABASE_URL, POSTGRES_SSL: process.env.POSTGRES_SSL };
  let pool: pg.Pool, close: () => Promise<void>, created = false;
  let store: typeof import('../src/data/postgres-listening-store');
  before(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
    const url = new URL(connectionString!); url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString(); process.env.POSTGRES_SSL = ssl ? 'require' : 'disable';
    const runtime = await import('../src/postgres-runtime'); pool = runtime.getPostgresPool(); close = runtime.closePostgres;
    const dir = path.resolve(import.meta.dirname, '../../../lib/db/migrations');
    for (const file of (await readdir(dir)).filter(file => /^\d+.*\.sql$/.test(file)).sort()) await pool.query(await readFile(path.join(dir, file), 'utf8'));
    store = await import('../src/data/postgres-listening-store');
  });
  after(async () => {
    if (close) await close();
    try { if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`); }
    finally { await admin.end(); for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  async function user(id: string, source: any = {}) {
    await pool.query('INSERT INTO users(id,username,email,full_name,source) VALUES($1,$1,$2,$1,$3)', [id, `${id}@example.invalid`, source]);
  }
  async function history(id: string, seconds: number, interaction = 'listen') {
    await pool.query(`INSERT INTO listening_history(id,user_id,session_id,station_id,station_name,listen_duration,interaction_type,listened_at)
      VALUES($1,$2,$2,'radio','Radio',$3,$4,now())`, [randomBytes(12).toString('hex'), id, seconds, interaction]);
  }
  const record = (userId: string, recordId: string, listenDuration = 30) => store.pgRecordListening({ userId, recordId, stationId: 'radio', listenDuration });
  it('starts at zero and converts cumulative recorded seconds to profile minutes', async () => {
    await user('fresh'); assert.equal(await store.pgListeningTotalMinutes('fresh'), 0);
    assert.equal((await record('fresh', 'first', 90)).totalListeningTime, 1.5);
    assert.equal(await store.pgListeningTotalMinutes('fresh'), 1.5);
    assert.equal((await pool.query("SELECT source->>'totalListeningTime' AS minutes FROM users WHERE id='fresh'")).rows[0].minutes, '1.5');
  });
  it('deduplicates concurrent retries while adding separate tabs/devices exactly once', async () => {
    await user('retry');
    const retries = await Promise.all(Array.from({ length: 12 }, () => record('retry', 'same-record')));
    assert.equal(retries.filter(r => r.recorded).length, 1);
    assert.equal(await store.pgListeningTotalMinutes('retry'), 0.5);
    await user('concurrent');
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => record('concurrent', `batch-${i % 4}`)));
    assert.equal(results.filter(r => r.recorded).length, 4);
    assert.equal(await store.pgListeningTotalMinutes('concurrent'), 2);
    assert.equal((await pool.query("SELECT count(*) FROM listening_history WHERE user_id='concurrent'")).rows[0].count, '4');
    await user('different'); await record('different', 'batch-0');
    assert.equal(await store.pgListeningTotalMinutes('different'), 0.5);
  });
  it('retains the larger legacy baseline without double-counting overlapping representations', async () => {
    await user('legacy', { totalListeningTime: 20, unrelated: 'retained' }); await history('legacy', 600);
    assert.equal(await store.pgListeningTotalMinutes('legacy'), 20);
    await record('legacy', 'new-minute', 60); await record('legacy', 'new-minute', 60);
    assert.equal(await store.pgListeningTotalMinutes('legacy'), 21);
    assert.equal((await pool.query("SELECT source->>'unrelated' AS value FROM users WHERE id='legacy'")).rows[0].value, 'retained');
  });
  it('recovers recorded history for accounts with missing/stale totals and excludes recommendation events', async () => {
    await user('history', { totalListeningTime: 0 }); await history('history', 150); await history('history', 10000, 'play');
    assert.equal(await store.pgListeningTotalMinutes('history'), 2.5);
    await record('history', 'new', 30);
    assert.equal(await store.pgListeningTotalMinutes('history'), 3);
  });
  it('rolls back history if the aggregate write fails, allowing a safe retry', async () => {
    await user('rollback');
    await pool.query(`ALTER TABLE users ADD CONSTRAINT test_total_limit CHECK (id != 'rollback' OR NOT (source ? 'listeningTotalSeconds'))`);
    await assert.rejects(record('rollback', 'retry-after-failure'), { code: '23514' });
    assert.equal((await pool.query("SELECT count(*) FROM listening_history WHERE user_id='rollback'")).rows[0].count, '0');
    await pool.query('ALTER TABLE users DROP CONSTRAINT test_total_limit');
    assert.equal((await record('rollback', 'retry-after-failure')).recorded, true);
    assert.equal(await store.pgListeningTotalMinutes('rollback'), 0.5);
  });
});
