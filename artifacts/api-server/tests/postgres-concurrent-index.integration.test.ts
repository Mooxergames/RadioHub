import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import pg from 'pg';
import { applyPostgresMigrations } from '../scripts/apply-postgres-migrations.mjs';
import { applyConcurrentIndexMigration, parseConcurrentIndexMigration } from '../scripts/postgres-concurrent-index.mjs';

test('two real startup replicas serialize a concurrent index and safely resume a missing checksum',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const schema = 'concurrent_index_' + randomBytes(6).toString('hex');
    const base = new URL(process.env.PG_TEST_DATABASE_URL!);
    const admin = new pg.Pool({ connectionString: base.href, ssl: false, max: 1 });
    const scoped = new URL(base); scoped.searchParams.set('options', '-c search_path=' + schema + ',public');
    const pool = new pg.Pool({ connectionString: scoped.href, ssl: false, max: 1 });
    const directory = await mkdtemp(path.join(os.tmpdir(), 'radiohub-concurrent-index-'));
    try {
      await admin.query('CREATE SCHEMA ' + schema);
      await pool.query("CREATE TABLE stations(id text PRIMARY KEY,source jsonb); INSERT INTO stations VALUES('one','{\"genre\":\"rock\"}')");
      const migration = await readFile(new URL('../../../lib/db/migrations/0027_station_source_genre_search.sql', import.meta.url), 'utf8');
      await writeFile(path.join(directory, '0027_station_source_genre_search.sql'), migration);
      const settings = { environment: { DATABASE_URL: scoped.href, POSTGRES_SSL: 'disable' }, migrationsDirectory: directory, log() {} };
      const settled = await Promise.allSettled([applyPostgresMigrations(settings), applyPostgresMigrations(settings)]);
      const results = settled.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
      assert.equal(results.reduce((sum, result) => sum + result.applied, 0), 1);
      assert.equal(results.reduce((sum, result) => sum + result.skipped, 0), 1);
      assert.deepEqual((await pool.query("SELECT indisvalid,indisready FROM pg_index WHERE indexrelid='stations_source_genre_trgm_idx'::regclass")).rows,
        [{ indisvalid: true, indisready: true }]);
      // Simulate interruption after CREATE completed but before checksum INSERT.
      await pool.query('DELETE FROM radiohub_schema_migrations');
      assert.deepEqual(await applyPostgresMigrations(settings), { applied: 1, skipped: 0 });
      assert.equal(Number((await pool.query('SELECT count(*) FROM stations')).rows[0].count), 1);
    } finally {
      await pool.end();
      assert.match(schema, /^concurrent_index_[a-f0-9]{12}$/);
      await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); await admin.end();
      assert.ok(directory.startsWith(path.join(os.tmpdir(), 'radiohub-concurrent-index-')));
      await rm(directory, { recursive: true, force: true });
    }
  });

test('index inspection ignores a fallback schema but rejects a wrong table in its own schema',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const schema = 'concurrent_index_' + randomBytes(6).toString('hex');
    const shadow = schema + '_shadow';
    const admin = new pg.Pool({ connectionString: process.env.PG_TEST_DATABASE_URL, ssl: false, max: 1 });
    const pool = new pg.Pool({ connectionString: process.env.PG_TEST_DATABASE_URL, ssl: false, max: 1,
      options: `-c search_path=${schema},${shadow},public` });
    try {
      await admin.query(`CREATE SCHEMA ${schema}; CREATE SCHEMA ${shadow}`);
      await pool.query(`CREATE TABLE stations(id text,source jsonb);
        CREATE TABLE ${shadow}.stations(id text,source jsonb);
        CREATE INDEX stations_source_genre_trgm_idx ON ${shadow}.stations USING gin ((lower(source->>'genre')) gin_trgm_ops)`);
      const spec = parseConcurrentIndexMigration(await readFile(new URL('../../../lib/db/migrations/0027_station_source_genre_search.sql', import.meta.url), 'utf8'))!;
      const shadowDefinition = (await pool.query(`SELECT pg_get_indexdef('${shadow}.stations_source_genre_trgm_idx'::regclass) AS definition`)).rows[0].definition;
      const client = await pool.connect();
      try { await applyConcurrentIndexMigration(client, spec); } finally { client.release(); }
      assert.equal((await pool.query(`SELECT pg_get_indexdef('${shadow}.stations_source_genre_trgm_idx'::regclass) AS definition`)).rows[0].definition, shadowDefinition);
      assert.equal((await pool.query(`SELECT indrelid='${schema}.stations'::regclass AS correct_table FROM pg_index
        WHERE indexrelid='${schema}.stations_source_genre_trgm_idx'::regclass`)).rows[0].correct_table, true);
      await pool.query(`DROP INDEX ${schema}.stations_source_genre_trgm_idx; CREATE TABLE other_stations(source jsonb);
        CREATE INDEX stations_source_genre_trgm_idx ON other_stations USING gin ((lower(source->>'genre')) gin_trgm_ops)`);
      const wrong = await pool.connect();
      try { await assert.rejects(applyConcurrentIndexMigration(wrong, spec), /unexpected definition/); } finally { wrong.release(); }
      assert.equal((await pool.query(`SELECT indrelid='${schema}.other_stations'::regclass AS unchanged FROM pg_index
        WHERE indexrelid='${schema}.stations_source_genre_trgm_idx'::regclass`)).rows[0].unchanged, true);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; DROP SCHEMA IF EXISTS ${shadow} CASCADE`);
      await admin.end();
    }
  });
