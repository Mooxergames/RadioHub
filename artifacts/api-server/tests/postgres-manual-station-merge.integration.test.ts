import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgresCatalogStore } from '../src/data/postgres-catalog-store';
import { buildManualStationMergePreview, parseManualStationMerge } from '../src/utils/manual-station-merge-review';
import { createNativePostgresFixture, type NativePostgresFixture } from './helpers/native-postgres-fixture';

describe('reviewed manual station merges on isolated native PostgreSQL', { skip: !process.env.PG_TEST_DATABASE_URL }, () => {
  let fixture: NativePostgresFixture, catalog: PostgresCatalogStore;
  before(async () => {
    const target = new URL(process.env.PG_TEST_DATABASE_URL!);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Only disposable loopback PostgreSQL is allowed');
    fixture = await createNativePostgresFixture('manual_merge_review'); catalog = new PostgresCatalogStore(fixture.pool);
  });
  after(async () => { await fixture?.close(); });
  async function group(patches: Record<string, any>[] = [{}, {}]) {
    const stream = `https://example.invalid/live/${randomUUID()}`;
    const inserted = await catalog.insertMany(patches.map((patch, index) => ({ _id: randomBytes(12).toString('hex'), stationuuid: randomUUID(),
      slug: `reviewed-${randomUUID()}`, slugAliases: [`old-${randomUUID()}`],
      url: stream, country: 'Germany', countryCode: 'DE', votes: index + 1, clickCount: index + 2, ...patch, name: `Intake fixture ${randomUUID()}` })));
    // Intake correctly rejects exact content duplicates; model an existing
    // catalog group through isolated fixture edits, not a production bypass.
    for (let index = 0; index < inserted.length; index++) await fixture.pool.query('UPDATE stations SET name=$2 WHERE id=$1', [inserted[index]._id, patches[index].name || 'Reviewed Radio']);
    return Promise.all(inserted.map(doc => catalog.findById(doc._id))) as Promise<Record<string, any>[]>;
  }
  async function review(docs: Record<string, any>[], changes = {}) {
    const selection = parseManualStationMerge({ primaryStationId: docs[0]._id, duplicateStationIds: docs.slice(1).map(doc => doc._id), mergeData: changes });
    const preview = buildManualStationMergePreview(selection, await catalog.find({ _id: { $in: docs.map(doc => doc._id) } }));
    return { selection, preview, options: { primaryId: selection.primaryStationId, validateGroup: false,
      patch: selection.changes, manualReview: { expectedFingerprint: preview.fingerprint, confirmIdentityOverride: false } } };
  }
  const archives = async (docs: any[]) => Number((await fixture.pool.query('SELECT count(*) FROM station_blacklist WHERE station_uuid=ANY($1::text[])', [docs.map(doc => doc.stationuuid)])).rows[0].count);

  it('rejects differing names until the explicit manual identity override, without weakening automatic merging', async () => {
    const docs = await group([{}, { name: 'Different broadcast' }]), ids = docs.map(doc => doc._id), r = await review(docs);
    assert.equal(r.preview.requiresIdentityConfirmation, true);
    await assert.rejects(catalog.mergeDuplicates(ids, r.options), { status: 422, code: 'MANUAL_MERGE_IDENTITY_CONFIRMATION_REQUIRED' });
    await assert.rejects(catalog.mergeDuplicates(ids, { requireSafeIdentity: true }), { code: 'UNSAFE_DUPLICATE_GROUP' });
    assert.equal(await archives(docs), 0); assert.equal((await catalog.find({ _id: { $in: ids } })).length, 2);
    const result = await catalog.mergeDuplicates(ids, { ...r.options, manualReview: { ...r.options.manualReview, confirmIdentityOverride: true } });
    assert.equal(result.deletedCount, 1); assert.equal(result.primary?._id, ids[0]);
  });

  it('requires all selected members and never merges a surviving subset after a deletion', async () => {
    const docs = await group([{}, {}, {}]), ids = docs.map(doc => doc._id), r = await review(docs);
    await fixture.pool.query('DELETE FROM stations WHERE id=$1', [ids[2]]);
    await assert.rejects(catalog.mergeDuplicates(ids, r.options), { status: 409, code: 'MANUAL_MERGE_STALE_REVIEW' });
    assert.equal((await catalog.find({ _id: { $in: ids } })).length, 2); assert.equal(await archives(docs), 0);
  });

  for (const [field, expression, value] of [
    ['name', 'name=$2', 'Edited name'], ['url', 'url=$2', 'https://example.invalid/changed'],
    ['manual flag', 'manual_edit_fields=$2::jsonb', JSON.stringify({ name: true })],
    ['noIndex', 'no_index=$2', true], ['redirect', 'redirect_to_slug=$2', 'another-page'],
  ]) it(`rechecks ${field} drift after waiting for the row lock and rolls back with409`, async () => {
    const docs = await group(), ids = docs.map(doc => doc._id), r = await review(docs), editor = await fixture.pool.connect();
    let signal!: (pid: number) => void;
    const selecting = new Promise<number>(resolve => { signal = resolve; });
    const observedPool = { connect: async () => {
      const client = await fixture.pool.connect();
      return { query: (sql: string, values?: any[]) => {
        const pending = client.query(sql, values);
        if (sql.startsWith('SELECT * FROM stations WHERE id=ANY')) signal((client as any).processID);
        return pending;
      }, release: () => client.release() };
    } };
    let pending: Promise<any> | undefined;
    try {
      await editor.query('BEGIN'); await editor.query(`UPDATE stations SET ${expression} WHERE id=$1`, [ids[0], value]);
      pending = new PostgresCatalogStore(observedPool as any).mergeDuplicates(ids, r.options);
      // Attach the assertion before waiting so a timeout can never be unhandled.
      const rejected = assert.rejects(pending, { status: 409, code: 'MANUAL_MERGE_STALE_REVIEW' });
      const pid = await selecting;
      let waiting = false;
      for (let i = 0; i < 20; i++) {
        waiting = (await fixture.pool.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting === true;
        if (waiting) break;
        await delay(3);
      }
      assert.equal(waiting, true, 'The apply read must actually wait for the concurrent editor lock');
      await editor.query('COMMIT'); await rejected;
    } finally { await editor.query('ROLLBACK'); editor.release(); await pending?.catch(() => {}); }
    assert.equal((await catalog.find({ _id: { $in: ids } })).length, 2); assert.equal(await archives(docs), 0);
    assert.equal((await fixture.pool.query('SELECT count(*) FROM station_merge_aliases WHERE station_id=ANY($1::text[])', [ids])).rows[0].count, '0');
  });

  it('uses current hot counters while preserving selected primary, ID/UUID/slug aliases and favorite/history references', async () => {
    const docs = await group(), ids = docs.map(doc => doc._id), r = await review(docs, { name: ' Approved title ' });
    const user = await fixture.insert('users', { username: `review-${randomUUID()}`, email: `${randomUUID()}@example.invalid`, fullName: 'Fixture User' });
    await fixture.pool.query('INSERT INTO user_favorites(user_id,station_id) VALUES($1,$2)', [user._id, ids[1]]);
    await fixture.pool.query("INSERT INTO listening_history(id,session_id,station_id,station_name,interaction_type,listened_at,listen_duration) VALUES($1,'fixture',$2,'Old name','play',now(),42)", [randomUUID(), ids[1]]);
    await fixture.pool.query('UPDATE stations SET votes=CASE WHEN id=$1 THEN 100 ELSE 200 END,click_count=CASE WHEN id=$1 THEN 300 ELSE 400 END,updated_at=now() WHERE id=ANY($2::text[])', [ids[0], ids]);
    const result = await catalog.mergeDuplicates(ids, r.options);
    assert.equal(result.deletedCount, 1); assert.equal(result.primary?._id, ids[0]); assert.equal(result.primary?.name, 'Approved title');
    assert.equal(result.primary?.votes, 300); assert.equal(result.primary?.clickCount, 700); assert.equal(result.primary?.manualEditFields.name, true);
    assert.ok(result.primary?.slugAliases.includes(docs[1].slug));
    for (const alias of [ids[1], docs[1].stationuuid]) assert.equal((await catalog.findMergedAlias(alias))?._id, ids[0]);
    assert.deepEqual((await fixture.pool.query('SELECT station_id FROM user_favorites WHERE user_id=$1', [user._id])).rows, [{ station_id: ids[0] }]);
    assert.equal((await fixture.pool.query('SELECT station_id FROM listening_history WHERE station_id=$1', [ids[0]])).rowCount, 1);
    assert.equal(await archives(docs), 1);
  });

  it('rolls back archives, aliases and reassigned references when deletion fails after review passes', async () => {
    const docs = await group(), ids = docs.map(doc => doc._id), r = await review(docs), before = await catalog.find({ _id: { $in: ids } });
    const user = await fixture.insert('users', { username: `rollback-${randomUUID()}`, email: `${randomUUID()}@example.invalid`, fullName: 'Fixture User' });
    await fixture.pool.query('INSERT INTO user_favorites(user_id,station_id) VALUES($1,$2)', [user._id, ids[1]]);
    await fixture.pool.query(`CREATE FUNCTION reject_reviewed_merge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture reviewed merge failure'; END $$;
      CREATE TRIGGER reject_reviewed_merge BEFORE DELETE ON stations FOR EACH ROW EXECUTE FUNCTION reject_reviewed_merge()`);
    try { await assert.rejects(catalog.mergeDuplicates(ids, r.options), /fixture reviewed merge failure/); }
    finally { await fixture.pool.query('DROP TRIGGER reject_reviewed_merge ON stations; DROP FUNCTION reject_reviewed_merge()'); }
    assert.deepEqual(await catalog.find({ _id: { $in: ids } }), before); assert.equal(await archives(docs), 0);
    assert.equal((await fixture.pool.query('SELECT count(*) FROM station_merge_aliases WHERE station_id=ANY($1::text[])', [ids])).rows[0].count, '0');
    assert.deepEqual((await fixture.pool.query('SELECT station_id FROM user_favorites WHERE user_id=$1', [user._id])).rows, [{ station_id: ids[1] }]);
  });
});
