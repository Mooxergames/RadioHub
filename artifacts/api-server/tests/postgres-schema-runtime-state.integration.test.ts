import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import pg from 'pg';
import { applyPostgresMigrations } from '../scripts/apply-postgres-migrations.mjs';
import { isPristineDestination } from '../../../lib/legacy-migration/src/auto-bootstrap-postgres';
import { inspectInitialCaptureResume } from '../../../lib/legacy-migration/src/initial-capture-resume';
import { bsonSafe, checksum, jsonSafe, normalizeNativeDomains, pruneNativeDomains, verifyNativeDomains }
  from '@workspace/legacy-migration/migrate-mongo-to-postgres';

const connectionString = process.env.PG_TEST_DATABASE_URL;
describe('Schema-owned runtime state during offline import', { skip: !connectionString }, () => {
  const schema = `schema_state_${randomBytes(8).toString('hex')}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let seeds: Array<{ key: string; value: unknown; updated_at: string }>;
  async function mirror(document: Record<string, any>, run = 'capture-run') {
    const payload = jsonSafe(document), bson = bsonSafe(document);
    await pool.query(`INSERT INTO legacy_documents(collection_name,document_id,payload,checksum,bson_payload,bson_checksum,last_seen_run_id)
      VALUES ('app_state',$1,$2,$3,$4,$5,$6)`, [document._id, payload, checksum(payload), bson, checksum(bson), run]);
  }
  const snapshot = async () => (await pool.query('SELECT key,value,updated_at::text FROM runtime_app_state ORDER BY key')).rows;
  before(async () => {
    const url = new URL(connectionString!);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.pathname, '/radiohub_test');
    assert.equal(url.search, '');
    admin = new pg.Pool({ connectionString, ssl: false, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    pool = new pg.Pool({ connectionString: url.href, ssl: false, max: 1 });
    await applyPostgresMigrations({ environment: { DATABASE_URL: url.href, POSTGRES_SSL: 'disable' },
      migrationsDirectory: new URL('../../../lib/db/migrations', import.meta.url).pathname, log() {} });
    seeds = await snapshot();
    assert.deepEqual(seeds.map(row => row.key), ['unique-visitor-details:v1', 'unique-visitor-metrics:v1', 'visitor-activity:v1']);
  });
  beforeEach(async () => {
    if (!pool) return;
    await pool.query('TRUNCATE legacy_documents,migration_runs,migration_checkpoints,database_write_authority,runtime_app_state CASCADE');
    for (const row of seeds) await pool.query('INSERT INTO runtime_app_state(key,value,updated_at) VALUES ($1,$2,$3)',
      [row.key, JSON.stringify(row.value), row.updated_at]);
  });
  after(async () => {
    await pool?.end();
    if (admin) {
      assert.match(schema, /^schema_state_[a-f0-9]{16}$/);
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
  it('recognizes only untouched schema seeds and preserves their exact content on normalization and pruning', async () => {
    const client = await pool.connect();
    try { assert.equal(await isPristineDestination(client), true); } finally { client.release(); }
    await verifyNativeDomains(pool);
    await normalizeNativeDomains(pool);
    await pruneNativeDomains(pool);
    await verifyNativeDomains(pool);
    assert.deepEqual(await snapshot(), seeds);
  });
  it('rejects extra and missing identities even when the number of runtime rows is unchanged', async () => {
    await pool.query("UPDATE runtime_app_state SET key='unreviewed-state' WHERE key='visitor-activity:v1'");
    await assert.rejects(verifyNativeDomains(pool), /identity mismatch: runtime_app_state/);
    const client = await pool.connect();
    try { assert.equal(await isPristineDestination(client), false); } finally { client.release(); }
    await pool.query("DELETE FROM runtime_app_state WHERE key='unreviewed-state'");
    await assert.rejects(verifyNativeDomains(pool), /identity mismatch: runtime_app_state/);
  });
  it('does not exempt malformed, altered or extra schema-seed content', async () => {
    for (const value of [{ collectionStartedAt: 'invalid' }, { collectionStartedAt: '2000-01-01T00:00:00Z' },
      { ...seeds.find(row => row.key === 'visitor-activity:v1')!.value as object, extra: true }]) {
      await pool.query("UPDATE runtime_app_state SET value=$1 WHERE key='visitor-activity:v1'", [JSON.stringify(value)]);
      await assert.rejects(verifyNativeDomains(pool), /content mismatch: runtime_app_state schema seed/);
      const client = await pool.connect();
      try { assert.equal(await isPristineDestination(client), false); } finally { client.release(); }
    }
  });
  it('rejects touched worker controls, changed schedules and missing migration evidence', async () => {
    const mutations = [
      "UPDATE station_stream_health_control SET summary='{\"processed\":1}'",
      "UPDATE station_stream_health_control SET next_run_at=next_run_at+interval '1 second'",
      "UPDATE station_duplicate_merge_control SET lease_owner='worker'",
      'UPDATE station_duplicate_merge_control SET last_run_at=now()',
      "UPDATE station_duplicate_merge_control SET next_auto_at=next_auto_at+interval '1 second'",
      "DELETE FROM radiohub_schema_migrations WHERE name='0031_station_duplicate_jobs.sql'",
    ];
    const client = await pool.connect();
    try {
      for (const sql of mutations) {
        await client.query('BEGIN');
        try {
          await client.query(sql);
          assert.equal(await isPristineDestination(client), false, sql);
        } finally { await client.query('ROLLBACK'); }
      }
      assert.equal(await isPristineDestination(client), true);
    } finally { client.release(); }
  });
  it('still verifies every captured app-state identity and field, including a reserved-key collision', async () => {
    for (const key of ['source-state', 'visitor-activity:v1']) await mirror({ _id: key, custom: 'original', updatedAt: '2000-01-01T00:00:00.000Z' });
    await normalizeNativeDomains(pool);
    await verifyNativeDomains(pool);
    await pool.query("UPDATE runtime_app_state SET value=value || '{\"custom\":\"changed\"}' WHERE key='visitor-activity:v1'");
    await assert.rejects(verifyNativeDomains(pool), /content mismatch: runtime_app_state\/visitor-activity:v1/);
    await normalizeNativeDomains(pool);
    await pool.query("DELETE FROM runtime_app_state WHERE key='source-state'");
    await assert.rejects(verifyNativeDomains(pool), /identity mismatch: runtime_app_state/);
  });
  it('allows capture-only resume with untouched seeds but rejects native writes and authority markers', async () => {
    await mirror({ _id: 'captured-state', value: true });
    await pool.query(`INSERT INTO migration_runs(id,mode,status,started_at,source_database)
      VALUES ('capture-run','all','running',now(),'source_test');
      INSERT INTO migration_checkpoints(collection_name,status,documents_processed,source_count,target_count)
      VALUES ('app_state','complete',1,1,1)`);
    const client = await pool.connect();
    try {
      assert.deepEqual(await inspectInitialCaptureResume(client, 'source_test'), { runId: 'capture-run' });
      await client.query("UPDATE runtime_app_state SET value='{}' WHERE key='visitor-activity:v1'");
      assert.equal(await inspectInitialCaptureResume(client, 'source_test'), null);
      const seed = seeds.find(row => row.key === 'visitor-activity:v1')!;
      await client.query('UPDATE runtime_app_state SET value=$1,updated_at=$2 WHERE key=$3', [JSON.stringify(seed.value), seed.updated_at, seed.key]);
      assert.deepEqual(await inspectInitialCaptureResume(client, 'source_test'), { runId: 'capture-run' });
      await client.query("UPDATE station_stream_health_control SET summary='{\"processed\":1}'");
      assert.equal(await inspectInitialCaptureResume(client, 'source_test'), null);
      await client.query("UPDATE station_stream_health_control SET summary='{}'");
      assert.deepEqual(await inspectInitialCaptureResume(client, 'source_test'), { runId: 'capture-run' });
      await client.query("INSERT INTO database_write_authority(domain,authority) VALUES ('API_ACCESS','postgres')");
      assert.equal(await inspectInitialCaptureResume(client, 'source_test'), null);
    } finally { client.release(); }
  });
});
