import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresCatalogStore } from '../src/data/postgres-catalog-store';

function mockStore(row?: Record<string, any>) {
  const writes: Array<{ sql: string; values: any[]; document: any }> = [];
  const queries: string[] = [];
  const client = { query: async (sql: string, values: any[] = []) => {
    queries.push(sql);
    if (sql.startsWith('SELECT s.*')) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    if (sql.startsWith('UPDATE stations SET') || sql.startsWith('INSERT INTO stations(')) {
      const document = JSON.parse(values.at(-1));
      writes.push({ sql, values, document });
      return { rowCount: 1, rows: [{ id: document._id, station_uuid: document.stationuuid,
        name: document.name, slug: document.slug, url: document.url, url_resolved: document.urlResolved,
        is_list_visible: document.isListVisible, manual_edit_fields: document.manualEditFields,
        descriptions: document.descriptions, tags_raw: document.tags, source: document }] };
    }
    return { rows: [], rowCount: 0 };
  }, release: () => {} };
  return { store: new PostgresCatalogStore({ connect: async () => client } as any), writes, queries };
}

test('provider success and URL changes cannot rediscover information pages or manually hidden stations', async () => {
  for (const fixture of [
    { mode: 'information', manual: {}, visible: false },
    { mode: 'information', manual: { isListVisible: true, url: true }, visible: false },
    { mode: undefined, manual: { isListVisible: true }, visible: false },
    { mode: undefined, manual: {}, visible: true },
  ]) {
    const row = { id: 'verified', station_uuid: 'verified-uuid', name: 'Verified Radio', slug: 'verified', url: '', is_list_visible: false,
      manual_edit_fields: fixture.manual, last_check_ok: false, source: { stationPageMode: fixture.mode } };
    const { store, writes } = mockStore(row);
    await store.update({ _id: 'verified' }, { $set: { url: 'https://provider.invalid/live', lastCheckOk: true,
      lastCheckTime: new Date().toISOString() } }, { respectManualFields: true });
    assert.equal(writes.length, 1, 'the real persist method emits its SQL update');
    const saved = writes[0].document;
    assert.equal(saved.isListVisible, fixture.visible);
    if (fixture.manual.url) assert.equal(saved.url, '');
    assert.equal(saved.stationPageMode, fixture.mode);
  }
});

test('real insert and metadata update persist an empty URL only for identified information pages', async () => {
  const fixture = { _id: 'verified', stationuuid: 'verified-uuid', name: 'Verified Radio', slug: 'verified',
    stationPageMode: 'information', url: '', urlResolved: '', isListVisible: false,
    descriptions: { en: { full: 'Reviewed channel history and programme information.' } } };
  const inserted = mockStore();
  const [created] = await inserted.store.insertMany([fixture]);
  assert.equal(created.url, '');
  assert.equal(created.stationPageMode, 'information');
  assert.equal(inserted.writes.length, 1);
  assert.ok(inserted.writes[0].sql.startsWith('INSERT INTO stations('));
  assert.ok(inserted.writes[0].values.includes(''));
  assert.ok(inserted.queries.includes('COMMIT'));
  const updated = mockStore({ id: fixture._id, station_uuid: fixture.stationuuid, name: fixture.name,
    slug: fixture.slug, url: '', is_list_visible: false, source: fixture });
  const result = await updated.store.update({ _id: fixture._id }, { $set: { homepage: 'https://publisher.invalid/' } }, { returnDocument: true });
  assert.equal(result.document?.url, '');
  assert.equal(updated.writes[0].document.homepage, 'https://publisher.invalid/');
  for (const patch of [{ stationuuid: '' }, { name: '' }, { stationPageMode: undefined },
    { stationPageMode: 'Information' }, { url: undefined }, { url: null }]) {
    const rejected = mockStore();
    await assert.rejects(rejected.store.insertMany([{ ...fixture, ...patch }]), /UUID, name and URL/);
    assert.equal(rejected.writes.length, 0);
    assert.ok(rejected.queries.includes('ROLLBACK'));
  }
});
