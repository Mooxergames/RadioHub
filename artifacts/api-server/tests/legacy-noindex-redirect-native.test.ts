import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { LegacyNoindexRecoveryStore } from '../src/data/postgres-legacy-noindex-recovery';
import { createNativePostgresFixture } from './helpers/native-postgres-fixture';

async function seed(fixture: Awaited<ReturnType<typeof createNativePostgresFixture>>) {
  const common = { name: 'Exact Radio', country: 'Germany', countryCode: 'DE', manualEditFields: {},
    url: 'https://stream.example.invalid/live', descriptions: { en: { full: 'Station information.', meta: 'Station summary.' } } };
  await fixture.insert('stations', { ...common, _id: 'target', stationuuid: randomUUID(), slug: 'exact-radio', noIndex: false });
  await fixture.insert('stations', { ...common, _id: 'copy', stationuuid: randomUUID(), slug: 'old-copy', noIndex: true,
    lastCheckOk: false, isListVisible: false, source: { noIndex: true, originalMetadata: { retained: true } } });
  await fixture.insert('stations', { ...common, _id: 'unique', stationuuid: randomUUID(), name: 'Other Radio', slug: 'other-radio',
    url: 'https://other.invalid/live', noIndex: true });
}

test('native homepage information repair loads city and homepage evidence, detects stale targets and preserves stream URLs',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_homepage_identity');
    try {
      await seed(fixture);
      await fixture.pool.query(`UPDATE stations SET homepage='https://example.invalid/station',
        url=CASE WHEN id='copy' THEN 'https://old.invalid/mp3' ELSE 'https://new.invalid/aac' END,
        source=source || jsonb_build_object('city',CASE WHEN id='copy' THEN 'Berlin' ELSE 'Munich' END)
        WHERE id IN ('copy','target')`);
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      assert.equal((await store.preview()).candidates.find(row => row.id === 'copy')?.redirectToSlug, undefined,
        'different known cities cannot consolidate; an independently addressed information page may recover');
      await fixture.pool.query("UPDATE stations SET source=source || '{\"city\":\"Berlin\"}'::jsonb WHERE id='target'");
      const preview = await store.preview();
      assert.equal(preview.candidates.find(row => row.id === 'copy')?.redirectToSlug, 'exact-radio');
      await fixture.pool.query("UPDATE stations SET homepage='https://other.invalid/station' WHERE id='target'");
      await assert.rejects(store.apply({ previewId: preview.previewId, stationIds: ['copy'] }), { code: 'RECOVERY_STALE' });
      await fixture.pool.query("UPDATE stations SET homepage='https://example.invalid/station' WHERE id='target'");
      const fresh = await store.preview();
      const before = (await fixture.pool.query("SELECT * FROM stations WHERE id IN ('copy','target') ORDER BY id")).rows;
      const result = await store.apply({ previewId: fresh.previewId, stationIds: ['copy'] });
      assert.equal(result.redirected, 1);
      const after = (await fixture.pool.query("SELECT * FROM stations WHERE id IN ('copy','target') ORDER BY id")).rows;
      assert.equal(after[0].redirect_to_slug, 'exact-radio');
      assert.equal(after[0].no_index, true);
      assert.equal(after[0].url, before[0].url); assert.equal(after[0].homepage, before[0].homepage);
      assert.deepEqual(after[0].descriptions, before[0].descriptions);
      assert.deepEqual(after[1], before[1]);
    } finally { await fixture.close(); }
  });

test('native mixed recovery journals a reversible exact redirect, preserves every copy field and leaves the canonical untouched',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_redirect');
    try {
      await seed(fixture);
      const before = (await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows;
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      const preview = await store.preview();
      assert.equal(preview.totalCandidates, 2);
      assert.equal(preview.candidates.find(row => row.id === 'copy')?.redirectToSlug, 'exact-radio');
      const result = await store.apply({ previewId: preview.previewId, stationIds: ['copy', 'unique'], actor: 'native-admin' });
      assert.equal(result.restored, 1); assert.equal(result.redirected, 1);
      assert.deepEqual(result.restoredIds, ['unique']); assert.deepEqual(result.redirectedIds, ['copy']);
      const after = (await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows;
      assert.equal(after.length, before.length);
      assert.equal(after[0].no_index, true); assert.equal(after[0].redirect_to_slug, 'exact-radio');
      assert.deepEqual(after[1], before[1]);
      for (const field of Object.keys(before[0]).filter(key => !['redirect_to_slug', 'source', 'updated_at', 'no_index_recovery_journal'].includes(key))) {
        assert.deepEqual(after[0][field], before[0][field], field);
      }
      assert.deepEqual(after[0].source, { ...before[0].source, redirectToSlug: 'exact-radio' });
      const journal = after[0].no_index_recovery_journal[preview.previewId];
      assert.equal(journal.action, 'explicit-selected-legacy-duplicate-redirect');
      assert.equal(journal.before.sourceRedirectPresent, false);
      assert.deepEqual(journal.after, { noIndex: true, redirectToSlug: 'exact-radio' });
      assert.equal((await store.preview()).totalCandidates, 0);
    } finally { await fixture.close(); }
  });

test('native redirect revalidates canonical content, identity and incoming chains before writing any selected row',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    for (const edit of ["UPDATE stations SET descriptions='{}' WHERE id='target'",
      "UPDATE stations SET url='https://changed.invalid/live' WHERE id='target'",
      "UPDATE stations SET redirect_to_slug='old-copy' WHERE id='unique'"]) {
      const fixture = await createNativePostgresFixture('noindex_redirect_stale');
      try {
        await seed(fixture);
        const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
        const preview = await store.preview();
        await fixture.pool.query(edit);
        await assert.rejects(store.apply({ previewId: preview.previewId, stationIds: ['copy', 'unique'] }), { code: 'RECOVERY_STALE' });
        const copy = (await fixture.pool.query("SELECT * FROM stations WHERE id='copy'")).rows[0];
        assert.equal(copy.no_index, true); assert.equal(copy.redirect_to_slug, null); assert.equal(copy.no_index_recovery_journal, null);
      } finally { await fixture.close(); }
    }
  });

test('native durable receipts confirm both kinds of committed repair after COMMIT acknowledgement is lost',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_redirect_receipt');
    try {
      await seed(fixture);
      let writes = 0;
      const pool = { connect: async () => {
        const client = await fixture.pool.connect();
        let mutated = false;
        return new Proxy(client, { get(target, property) {
          if (property === 'query') return async (config: any) => {
            const sql = typeof config === 'string' ? config : config.text;
            if (sql.startsWith('UPDATE stations')) { writes++; mutated = true; }
            const result = await target.query(config);
            if (sql === 'COMMIT' && mutated) { mutated = false; throw new Error('Acknowledgement lost'); }
            return result;
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const store = new LegacyNoindexRecoveryStore(() => pool as any, async () => true);
      const preview = await store.preview();
      const result = await store.apply({ previewId: preview.previewId, stationIds: ['copy', 'unique'] });
      assert.equal(result.restored, 1); assert.equal(result.redirected, 1); assert.equal(writes, 2);
      assert.deepEqual(new Set(result.updatedIds), new Set(['copy', 'unique']));
    } finally { await fixture.close(); }
  });

test('a failed redirect write rolls back earlier flag recovery in the same native batch',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_redirect_rollback');
    try {
      await seed(fixture);
      const before = (await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows;
      const pool = { connect: async () => {
        const client = await fixture.pool.connect();
        return new Proxy(client, { get(target, property) {
          if (property === 'query') return async (config: any) => {
            if (config.text?.startsWith('UPDATE stations s SET redirect_to_slug=')) throw new Error('Injected redirect write failure');
            return target.query(config);
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const store = new LegacyNoindexRecoveryStore(() => pool as any, async () => true);
      const preview = await store.preview();
      await assert.rejects(store.apply({ previewId: preview.previewId, stationIds: ['copy', 'unique'] }), /Injected redirect write failure/);
      assert.deepEqual((await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows, before);
    } finally { await fixture.close(); }
  });

test('native closed import groups recover one canonical, then redirect remaining copies, with retained city conflicts respected',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_closed_import');
    try {
      await seed(fixture);
      await fixture.pool.query(`UPDATE stations SET no_index=true,slug='imported-main',source=source || '{"noIndex":true}'::jsonb WHERE id='target'`);
      await fixture.pool.query(`UPDATE stations SET source=source || jsonb_build_object('city',CASE WHEN id='copy' THEN 'Berlin' ELSE 'Munich' END)
        WHERE id IN ('copy','target')`);
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      const conflicted = await store.preview();
      assert.ok(conflicted.candidates.every(row => !['copy', 'target'].includes(row.id)));
      await fixture.pool.query("UPDATE stations SET source=source-'city' WHERE id IN ('copy','target')");
      const first = await store.preview();
      assert.equal(first.candidates.find(row => row.id === 'copy')?.evidence.recoveryBasis, 'canonical-of-excluded-duplicates');
      assert.equal(first.candidates.some(row => row.id === 'target'), false);
      await store.apply({ previewId: first.previewId, stationIds: ['copy'] });
      const second = await store.preview();
      assert.equal(second.candidates.find(row => row.id === 'target')?.redirectToSlug, 'old-copy');
      await store.apply({ previewId: second.previewId, stationIds: ['target'] });
      const rows = (await fixture.pool.query("SELECT id,no_index,redirect_to_slug FROM stations WHERE id IN ('copy','target') ORDER BY id")).rows;
      assert.deepEqual(rows, [{ id: 'copy', no_index: false, redirect_to_slug: null },
        { id: 'target', no_index: true, redirect_to_slug: 'old-copy' }]);
    } finally { await fixture.close(); }
  });

test('native name-variant page repair reads city evidence for both open targets and closed groups',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_brand_variant');
    try {
      await seed(fixture);
      await fixture.pool.query("UPDATE stations SET name=CASE WHEN id='copy' THEN 'Exact' ELSE name END WHERE id IN ('copy','target')");
      await fixture.pool.query(`UPDATE stations SET source=source || jsonb_build_object('city',CASE WHEN id='copy' THEN 'Berlin' ELSE 'Munich' END)
        WHERE id IN ('copy','target')`);
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      assert.equal((await store.preview()).candidates.some(row => row.id === 'copy'), false);
      await fixture.pool.query("UPDATE stations SET source=source-'city' WHERE id IN ('copy','target')");
      const preview = await store.preview();
      assert.equal(preview.candidates.find(row => row.id === 'copy')?.redirectToSlug, 'exact-radio');
      await fixture.pool.query("UPDATE stations SET source=source || '{\"city\":\"Munich\"}'::jsonb WHERE id='target'");
      await assert.rejects(store.apply({ previewId: preview.previewId, stationIds: ['copy'] }), { code: 'RECOVERY_STALE' });
      await fixture.pool.query("UPDATE stations SET source=source-'city',no_index=true WHERE id IN ('copy','target')");
      const closed = await store.preview();
      assert.equal(closed.candidates.filter(row => ['copy','target'].includes(row.id)).length, 1);
      const winner = closed.candidates.find(row => ['copy','target'].includes(row.id))!;
      await store.apply({ previewId: closed.previewId, stationIds: [winner.id] });
      const next = await store.preview();
      const copy = next.candidates.find(row => ['copy','target'].includes(row.id))!;
      assert.equal(copy.redirectToSlug, winner.slug);
      await store.apply({ previewId: next.previewId, stationIds: [copy.id] });
      assert.equal((await fixture.pool.query("SELECT count(*)::integer AS count FROM stations WHERE id IN ('copy','target')")).rows[0].count, 2);
    } finally { await fixture.close(); }
  });

test('native recovery preserves separate broadcasts when only an obsolete alias points at a real native page',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_shadowed_alias');
    try {
      await seed(fixture);
      await fixture.pool.query("UPDATE stations SET slug='los40-2',url='https://argentina.invalid/live',country='Argentina',country_code='AR' WHERE id='copy'");
      await fixture.pool.query("UPDATE stations SET slug='los40',slug_aliases=ARRAY['los40-2'],country='Spain',country_code='ES' WHERE id='target'");
      const target = (await fixture.pool.query("SELECT * FROM stations WHERE id='target'")).rows[0];
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      const preview = await store.preview();
      assert.equal(preview.candidates.find(row => row.id === 'copy')?.evidence.recoveryBasis, 'complete-unique-information-page');
      await store.apply({ previewId: preview.previewId, stationIds: ['copy'] });
      const copy = (await fixture.pool.query("SELECT * FROM stations WHERE id='copy'")).rows[0];
      assert.equal(copy.no_index, false); assert.equal(copy.slug, 'los40-2'); assert.equal(copy.redirect_to_slug, null);
      assert.deepEqual((await fixture.pool.query("SELECT * FROM stations WHERE id='target'")).rows[0], target);
    } finally { await fixture.close(); }
  });
