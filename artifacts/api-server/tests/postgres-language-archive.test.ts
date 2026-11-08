import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { before, after, describe, it, mock } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import pg from 'pg';
import { SEO_LANGUAGES, ACTIVE_UI_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { PostgresLocalizationStore } from '../src/data/postgres-localization-store';
import { PostgresLanguageArchiveStore, languageArchiveChecksum } from '../src/data/postgres-language-archive-store';

const connectionString = process.env.PG_TEST_DATABASE_URL;
describe('UI language archive', { skip: !connectionString }, () => {
  const schema = `language_archive_${process.pid}_${randomBytes(6).toString('hex')}`;
  const ssl = process.env.PG_TEST_SSL === 'require' ? { rejectUnauthorized: true } : false;
  const admin = new pg.Pool({ connectionString, ssl });
  const pool = new pg.Pool({ connectionString, ssl, options: `-c search_path=${schema},public` });
  const localization = new PostgresLocalizationStore(pool);
  const store = new PostgresLanguageArchiveStore(pool);
  let server: Server;
  let base: string;
  before(async () => {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const directory = path.resolve(import.meta.dirname, '../../../lib/db/migrations');
    for (const file of (await readdir(directory)).filter(f => /^\d+.*\.sql$/.test(f)).sort()) await pool.query(await readFile(path.join(directory, file), 'utf8'));
    mock.module('../src/cache', { defaultExport: { clearByPattern: async () => {} } });
    mock.module('../src/performance-cache', { namedExports: { performanceCache: { clearTranslations() {}, clearSeoAndQuickCaches() {} } } });
    const { registerAdminLanguageArchiveRoutes } = await import('../src/routes/admin-language-archive-routes');
    const app = express(); app.use(express.json());
    registerAdminLanguageArchiveRoutes(app, (req, res, next) => { if (req.headers['x-test-admin'] === 'yes') next(); else res.sendStatus(401); }, store);
    server = await new Promise<Server>(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/ui-language-archives`;
  });
  after(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    mock.restoreAll(); await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  });
  const raw = async (table: string) => (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)).rows;
  const request = (suffix = '', body?: unknown) => fetch(base + suffix, { method: body ? 'POST' : 'GET', headers: { 'x-test-admin': 'yes', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

  it('requires admin for every backup and mutation, and requires a backup checksum', async () => {
    for (const suffix of ['', '/backup', '/anything/backup']) assert.equal((await fetch(base + suffix)).status, 401);
    for (const suffix of ['', '/anything/restore']) assert.equal((await fetch(base + suffix, { method: 'POST' })).status, 401);
    assert.equal((await request('', {})).status, 400);
  });

  it('backs up and removes exactly 43 languages, preserving all 14 dictionaries and URL mappings; restores exact IDs and timestamps', async () => {
    const key = await localization.createKey({ key: 'archive_test', defaultValue: 'Original' });
    for (const language of SEO_LANGUAGES) {
      await localization.saveTranslationLanguage({ code: language.code, name: language.name, isDefault: language.code === 'en', isEnabled: true });
      await localization.upsertTranslation({ keyId: key._id, language: language.code, value: `${language.code} original`, isCompleted: true });
    }
    await localization.saveUrlTranslations([{ languageCode: 'nl', englishPath: 'station', translatedPath: 'zender' }]);
    const originalLanguages = await raw('translation_languages');
    const originalTranslations = await raw('translations');
    const originalKeys = await raw('translation_keys');
    const originalUrls = await raw('url_translations');
    const response = await request('/backup');
    assert.match(response.headers.get('content-disposition')!, /attachment/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const backup = await response.json();
    assert.equal(backup.snapshot.languages.length, 43);
    assert.equal(backup.snapshot.translations.length, 43);
    assert.equal(languageArchiveChecksum(backup.snapshot), backup.checksum);
    assert.equal((await request('', { checksum: '0'.repeat(64) })).status, 409);
    assert.equal((await raw('translation_languages')).length, 57);
    // A late transaction failure must roll back both deletions and the archive.
    await pool.query("ALTER TABLE translation_metadata ADD CONSTRAINT reject_archive CHECK(notes <> 'UI language archive changed')");
    await assert.rejects(store.archive(backup.checksum));
    assert.equal((await raw('translation_languages')).length, 57);
    assert.equal((await raw('translation_language_archives')).length, 0);
    await pool.query('ALTER TABLE translation_metadata DROP CONSTRAINT reject_archive');
    const archived = await (await request('', { checksum: backup.checksum })).json();
    assert.equal(archived.languages, 43);
    assert.deepEqual(await raw('translation_languages'), originalLanguages.filter(r => ACTIVE_UI_LANGUAGES.includes(r.row.code)));
    assert.deepEqual(await raw('translations'), originalTranslations.filter(r => ACTIVE_UI_LANGUAGES.includes(r.row.language)));
    assert.deepEqual(await raw('translation_keys'), originalKeys);
    assert.deepEqual(await raw('url_translations'), originalUrls);
    const stored = await store.download(archived.id);
    assert.equal(languageArchiveChecksum(stored.snapshot), backup.checksum);
    assert.deepEqual(stored.snapshot, backup.snapshot);
    const status = await (await request()).json();
    assert.equal(status.languages.length, 0); assert.equal(status.translations, 0);
    assert.equal(status.archives[0].languages, 43);
    assert.equal((await request('', { checksum: status.checksum })).status, 409);
    const conflicting = await localization.saveTranslationLanguage({ code: 'nl', name: 'Conflict' });
    assert.equal((await request(`/${archived.id}/restore`, {})).status, 409);
    await localization.deleteTranslationLanguage(conflicting._id);
    assert.equal((await request(`/${archived.id}/restore`, {})).status, 200);
    assert.deepEqual(await raw('translation_languages'), originalLanguages);
    assert.deepEqual(await raw('translations'), originalTranslations);
    assert.equal((await request(`/${archived.id}/restore`, {})).status, 409);
  });

  it('never archives an unpublished default and never repopulates retired languages from boot bundles', async () => {
    await pool.query("UPDATE translation_languages SET is_default=(code='nl')");
    await assert.rejects(store.backup(), /default language/);
    await pool.query("UPDATE translation_languages SET is_default=(code='en')");
    const backup = await store.backup();
    await store.archive(backup.checksum);
    await localization.seedTranslationBundle([{ key: 'archive_test', defaultValue: 'Original' }],
      { en: { archive_test: 'Keep existing' }, nl: { archive_test: 'Do not recreate' } }, 'archive-test');
    assert.equal((await pool.query("SELECT 1 FROM translations WHERE language='nl'")).rowCount, 0);
    assert.equal((await pool.query("SELECT value FROM translations WHERE language='en'")).rows[0].value, 'en original');
  });
});
