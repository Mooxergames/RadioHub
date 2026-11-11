import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { getPostgresPool } from '../postgres-runtime';

type Snapshot = { version: 1; retainedLanguages: string[]; languages: Record<string, any>[];
  translations: Record<string, any>[]; keys: Record<string, any>[] };

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function languageArchiveChecksum(snapshot: Snapshot): string {
  return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
}

export class LanguageArchiveConflict extends Error {}

/** Archives only UI localization rows, never station data or URL mappings. */
export class PostgresLanguageArchiveStore {
  constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

  private async snapshot(client: pg.PoolClient): Promise<Snapshot> {
    const retainedLanguages = [...ACTIVE_SITEMAP_LANGUAGES];
    const languages = (await client.query('SELECT to_jsonb(l) AS row FROM translation_languages l WHERE NOT(code=ANY($1::text[])) ORDER BY code', [retainedLanguages])).rows.map(r => r.row);
    if (languages.some(l => l.is_default)) throw new LanguageArchiveConflict('The default language must be one of the 14 published languages');
    const translations = (await client.query('SELECT to_jsonb(t) AS row FROM translations t WHERE NOT(language=ANY($1::text[])) ORDER BY language,key_id', [retainedLanguages])).rows.map(r => r.row);
    const keys = (await client.query('SELECT to_jsonb(k) AS row FROM translation_keys k ORDER BY id')).rows.map(r => r.row);
    return { version: 1, retainedLanguages, languages, translations, keys };
  }

  private async transaction<T>(write: boolean, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL lock_timeout='2s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      if (write) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('localization:languages'))");
        // Serialize with every writer, including old replicas, while ordinary reads continue.
        await client.query('LOCK TABLE translation_languages,translation_keys,translations IN SHARE ROW EXCLUSIVE MODE');
      }
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async backup() {
    return this.transaction(false, async client => {
      const snapshot = await this.snapshot(client);
      return { checksum: languageArchiveChecksum(snapshot), snapshot };
    });
  }

  async status() {
    const { checksum, snapshot } = await this.backup();
    const archives = (await this.pool.query(`SELECT id,checksum,created_at,restored_at,
      language_count AS languages, translation_count AS translations
      FROM translation_language_archives ORDER BY created_at DESC LIMIT 10`)).rows;
    return { checksum, languages: snapshot.languages.map(l => ({ code: l.code, name: l.name })), translations: snapshot.translations.length, archives };
  }

  async download(id: string) {
    const row = (await this.pool.query('SELECT id,checksum,snapshot,created_at,restored_at FROM translation_language_archives WHERE id=$1', [id])).rows[0];
    if (!row) throw new LanguageArchiveConflict('Archive not found');
    return row;
  }

  private async bumpVersion(client: pg.PoolClient) {
    await client.query(`INSERT INTO translation_metadata(scope,languages_version,notes) VALUES ('global',2,'UI language archive changed')
      ON CONFLICT(scope) DO UPDATE SET languages_version=translation_metadata.languages_version+1,
      last_bumped_at=now(),updated_at=now(),notes=EXCLUDED.notes`);
  }

  async archive(expectedChecksum: string) {
    return this.transaction(true, async client => {
      const snapshot = await this.snapshot(client);
      const checksum = languageArchiveChecksum(snapshot);
      if (checksum !== expectedChecksum) throw new LanguageArchiveConflict('Translations changed. Download a fresh backup before archiving');
      if (!snapshot.languages.length && !snapshot.translations.length) throw new LanguageArchiveConflict('No unused UI languages remain');
      const id = randomUUID();
      await client.query('INSERT INTO translation_language_archives(id,checksum,snapshot,language_count,translation_count) VALUES ($1,$2,$3::jsonb,$4,$5)', [id, checksum, JSON.stringify(snapshot), snapshot.languages.length, snapshot.translations.length]);
      await client.query('DELETE FROM translations WHERE NOT(language=ANY($1::text[]))', [snapshot.retainedLanguages]);
      await client.query('DELETE FROM translation_languages WHERE NOT(code=ANY($1::text[]))', [snapshot.retainedLanguages]);
      await this.bumpVersion(client);
      return { id, checksum, languages: snapshot.languages.length, translations: snapshot.translations.length };
    });
  }

  async restore(id: string) {
    return this.transaction(true, async client => {
      const row = (await client.query('SELECT * FROM translation_language_archives WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row || row.restored_at) throw new LanguageArchiveConflict('Archive is missing or already restored');
      const snapshot = row.snapshot as Snapshot;
      if (languageArchiveChecksum(snapshot) !== row.checksum) throw new LanguageArchiveConflict('Archive checksum mismatch');
      const languages = snapshot.languages.map(l => l.code);
      if ((await client.query('SELECT 1 FROM translation_languages WHERE code=ANY($1::text[]) LIMIT 1', [languages])).rowCount ||
          (await client.query('SELECT 1 FROM translations WHERE language=ANY($1::text[]) LIMIT 1', [[...new Set(snapshot.translations.map(t => t.language))]])).rowCount) {
        throw new LanguageArchiveConflict('Some archived languages already exist. Restore would overwrite current work');
      }
      const missing = await client.query(`SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS archived(id text,key text)
        LEFT JOIN translation_keys k ON k.id=archived.id AND k.key=archived.key WHERE k.id IS NULL LIMIT 1`, [JSON.stringify(snapshot.keys)]);
      if (missing.rowCount) throw new LanguageArchiveConflict('Shared translation keys changed; manual reconciliation is required');
      await client.query('INSERT INTO translation_languages SELECT * FROM jsonb_populate_recordset(NULL::translation_languages,$1::jsonb)', [JSON.stringify(snapshot.languages)]);
      await client.query('INSERT INTO translations SELECT * FROM jsonb_populate_recordset(NULL::translations,$1::jsonb)', [JSON.stringify(snapshot.translations)]);
      await client.query('UPDATE translation_language_archives SET restored_at=now() WHERE id=$1', [id]);
      await this.bumpVersion(client);
      return { id, restored: true };
    });
  }
}
