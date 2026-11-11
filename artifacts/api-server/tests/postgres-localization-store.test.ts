import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PostgresLocalizationStore } from '../src/data/postgres-localization-store';

describe('PostgreSQL localization write safety', () => {
  it('rejects malformed source batches before opening a database connection', async () => {
    let connections = 0;
    const store = new PostgresLocalizationStore({ connect: async () => { connections++; throw new Error('must not connect'); } } as any);
    for (const input of [undefined, [], [null], [{ keyId: 'a', defaultValue: ' ' }],
      [{ keyId: 'a', defaultValue: 'A' }, { keyId: 'a', defaultValue: 'B' }]]) {
      await assert.rejects(store.bulkUpdateKeyDefaults(input), (error: any) => error.status === 400);
    }
    assert.equal(connections, 0);
  });

  it('does not update any source values when a batch references a missing key', async () => {
    const statements: string[] = [];
    const client = { query: async (sql: string) => { statements.push(sql); return { rows: sql.startsWith('SELECT') ? [{ id: 'a' }] : [] }; }, release() {} };
    const store = new PostgresLocalizationStore({ connect: async () => client } as any);
    await assert.rejects(store.bulkUpdateKeyDefaults([{ keyId: 'a', defaultValue: 'A' }, { keyId: 'missing', defaultValue: 'B' }]),
      (error: any) => error.status === 409);
    assert.equal(statements.some(sql => sql.startsWith('UPDATE')), false);
    assert.equal(statements.at(-1), 'ROLLBACK');
  });
  it('validates a complete URL batch before acquiring a connection or changing rows', async () => {
    let connections = 0;
    const store = new PostgresLocalizationStore({
      connect: async () => { connections++; throw new Error('must not connect'); },
    } as any);
    await assert.rejects(store.saveUrlTranslations([
      { languageCode: 'tr', englishPath: 'about', translatedPath: 'hakkinda' },
      { languageCode: 'tr', englishPath: 'contact', translatedPath: ' ' },
    ]), /non-empty/);
    assert.equal(connections, 0);
    assert.deepEqual(await store.saveUrlTranslations([]), { upsertedCount: 0, modifiedCount: 0 });
  });

  it('rolls back the complete URL batch and releases the connection on a database failure', async () => {
    const statements: string[] = [];
    let writes = 0;
    let released = false;
    const failure = new Error('database unavailable');
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('INSERT INTO url_translations')) {
          writes++;
          if (writes === 2) throw failure;
          return { rows: [{ inserted: true }] };
        }
        return { rows: [] };
      },
      release: () => { released = true; },
    };
    const store = new PostgresLocalizationStore({ connect: async () => client } as any);
    await assert.rejects(store.saveUrlTranslations([
      { languageCode: 'de', englishPath: 'about', translatedPath: 'uber' },
      { languageCode: 'tr', englishPath: 'about', translatedPath: 'hakkinda' },
    ]), (error) => error === failure);
    assert.equal(statements[0], 'BEGIN');
    assert.equal(statements.at(-1), 'ROLLBACK');
    assert.equal(statements.includes('COMMIT'), false);
    assert.equal(released, true);
  });

  it('preserves apostrophes as bound values and resolves duplicate natural keys deterministically', async () => {
    const writes: { sql: string; values: unknown[] }[] = [];
    let committed = false;
    const client = {
      query: async (sql: string, values: unknown[]) => {
        if (sql === 'COMMIT') committed = true;
        if (!sql.includes('INSERT INTO url_translations')) return { rows: [] };
        writes.push({ sql, values });
        return { rows: [{ inserted: true }] };
      },
      release: () => {},
    };
    const store = new PostgresLocalizationStore({ connect: async () => client } as any);
    const translatedPath = "l'actualite";
    const result = await store.saveUrlTranslations([
      { languageCode: 'fr', englishPath: 'news', translatedPath: 'old' },
      { languageCode: 'fr', englishPath: 'news', translatedPath },
    ]);
    assert.deepEqual(result, { upsertedCount: 1, modifiedCount: 0 });
    assert.equal(committed, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].sql.includes(translatedPath), false);
    assert.equal(writes[0].values[3], translatedPath);
    assert.match(String(writes[0].values[0]), /^[a-f0-9]{24}$/);
  });

  it('propagates metadata failures rather than returning a successful version 1', async () => {
    const failure = new Error('connection terminated');
    const store = new PostgresLocalizationStore({ query: async () => { throw failure; } } as any);
    await assert.rejects(store.getMetadata(), (error) => error === failure);
    await assert.rejects(store.bumpVersion(), (error) => error === failure);
  });
});
