import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PostgresCatalogStore } from '../src/data/postgres-catalog-store';
import { createNativePostgresFixture, type NativePostgresFixture } from './helpers/native-postgres-fixture';

describe('catalog provider writes respect manual description locales', { skip: !process.env.PG_TEST_DATABASE_URL }, () => {
  let fx: NativePostgresFixture, catalog: PostgresCatalogStore;
  before(async () => {
    fx = await createNativePostgresFixture('description_flags');
    catalog = new PostgresCatalogStore(fx.pool);
  });
  after(async () => { await fx?.close(); });

  const en = { full: 'Reviewed English.', meta: 'Reviewed summary.', attribution: 'Publisher' };
  const de = { full: 'Original German.', meta: 'German summary.' };
  async function seed(id: string, manualEditFields: Record<string, unknown>, descriptions: Record<string, unknown> = { en, de }) {
    await catalog.insertMany([{ _id: id, stationuuid: id, name: id, url: 'https://example.invalid/' + id,
      descriptions, manualEditFields, votes: 7, clickCount: 12 }]);
  }
  const provider = (id: string, update: Record<string, unknown>) =>
    catalog.update({ _id: id }, update, { respectManualFields: true, protectLocalCounters: true });
  async function state(id: string) {
    const { rows: [row] } = await fx.pool.query(`SELECT descriptions, source->'descriptions' AS mirror,
      manual_edit_fields, source->'manualEditFields' AS flags, votes, click_count, updated_at::text, xmin::text
      FROM stations WHERE id=$1`, [id]);
    assert.deepEqual(row.descriptions, row.mirror);
    assert.deepEqual(row.manual_edit_fields, row.flags);
    assert.deepEqual([row.votes, row.click_count], [7, 12]);
    return row;
  }
  const noop = { matchedCount: 1, modifiedCount: 0 };
  const changed = { matchedCount: 1, modifiedCount: 1 };
  for (const flag of ['descriptions.en.full', 'descriptions.en.meta', 'descriptions.en']) {
    it(flag + ' protects the whole locale while German remains editable', async () => {
      const id = 'row-' + flag;
      await seed(id, { [flag]: true, 'descriptions.de.meta': false });
      const before = await state(id);
      assert.deepEqual(await provider(id, { $set: { 'descriptions.en.full': 'overwrite' },
        $unset: { 'descriptions.en.meta': 1 } }), noop);
      assert.deepEqual(await provider(id, { $unset: { 'descriptions.en': 1 } }), noop);
      assert.deepEqual(await state(id), before);
      assert.deepEqual(await provider(id, { $set: { 'descriptions.en': de, 'descriptions.de.full': 'New German.' },
        $unset: { 'descriptions.de.meta': 1 } }), changed);
      assert.deepEqual((await state(id)).descriptions, { en, de: { full: 'New German.' } });
    });
  }
  it('root replacement and removal preserve locked preimages, not just supplied keys', async () => {
    const id = 'ancestor';
    await seed(id, { 'descriptions.en.full': true, 'descriptions.it.meta': true });
    assert.deepEqual(await provider(id, { $set: { descriptions: { it: de, fr: de } } }), changed);
    assert.deepEqual((await state(id)).descriptions, { en, fr: de });
    assert.deepEqual(await provider(id, { $set: { descriptions: { en: null, fr: de, it: de } } }), noop);
    assert.deepEqual(await provider(id, { $unset: { descriptions: 1 } }), changed);
    const before = await state(id);
    assert.deepEqual(before.descriptions, { en });
    assert.deepEqual(await provider(id, { $unset: { descriptions: 1 } }), noop);
    for (const descriptions of [null, 'invalid', []]) {
      assert.deepEqual(await provider(id, { $set: { descriptions } }), noop);
    }
    assert.deepEqual(await state(id), before);
  });
  it('whole-field lock still protects all locales; explicit admin override can replace them', async () => {
    const id = 'global-lock';
    await seed(id, { descriptions: true, name: true });
    const before = await state(id);
    assert.deepEqual(await provider(id, { $set: { name: 'ignored', 'descriptions.de.full': 'ignored' },
      $unset: { descriptions: 1 } }), noop);
    assert.deepEqual(await state(id), before);
    assert.deepEqual(await catalog.update({ _id: id }, { $set: { descriptions: { en: de } } },
      { respectManualFields: false }), changed);
    assert.deepEqual((await state(id)).descriptions, { en: de });
  });
  it('updates all 13 unprotected locales and lets an explicit override edit English', async () => {
    const id = 'fourteen-locales';
    const otherLocales = ['de', 'es', 'fr', 'it', 'pt', 'hi', 'tr', 'ru', 'ar', 'zh', 'ja', 'ko', 'he'];
    const before = Object.fromEntries(otherLocales.map(lang => [lang, { full: lang, meta: lang }]));
    const after = Object.fromEntries(otherLocales.map(lang => [lang, { full: lang + '-new', meta: lang + '-new' }]));
    await seed(id, { 'descriptions.en.meta': true }, { ...before, en });
    assert.deepEqual(await provider(id, { $set: { descriptions: { ...after, en: de } } }), changed);
    assert.deepEqual((await state(id)).descriptions, { ...after, en });
    assert.deepEqual(await catalog.update({ _id: id }, { $set: { 'descriptions.en.full': 'Manual.' },
      $unset: { 'descriptions.en.meta': 1 } }, { respectManualFields: false }), changed);
    assert.deepEqual((await state(id)).descriptions, { ...after, en: { full: 'Manual.', attribution: en.attribution } });
  });
});
