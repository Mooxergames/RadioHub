import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createNativePostgresFixture, type NativePostgresFixture } from './helpers/native-postgres-fixture';
import { PostgresCatalogStore, pgSyncBlacklist } from '../src/data/postgres-catalog-store';
import { buildSyncBlacklist } from '../src/utils/sync-blacklist';

const url = process.env.PG_TEST_DATABASE_URL;
if (url && !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d+\/[^?]*test[^?]*$/.test(url)) {
  throw new Error('Restoration tests require an explicit loopback test database');
}

describe('verified historical restoration maintenance', { skip: !url }, () => {
  let fixture: NativePostgresFixture;
  const id = '600000000000000000000001';
  const uuid = 'restored-provider-uuid';
  const stream = 'https://example.invalid/restored';
  const reason = 'User explicitly approved deletion of unresolved 1832 cohort on 2026-10-23';
  const marker = { kind: 'verified-cohort-recovery-20261109', stationId: id, stationUuid: uuid, verifiedAt: '2026-11-09T19:00:00Z' };
  before(async () => { fixture = await createNativePostgresFixture('verified_restore'); });
  after(async () => { await fixture?.close(); });
  beforeEach(async () => {
    await fixture.clear('stations', 'station_blacklist', 'catalog_sync_runs');
    await fixture.insert('stations', { _id: id, stationuuid: uuid, name: 'Restored radio', slug: 'restored-radio', url: stream,
      country: 'Austria', countryCode: 'AT', noIndex: false, isListVisible: true });
    await fixture.pool.query(`INSERT INTO station_blacklist(id,station_uuid,url,name,reason,source)
      VALUES('restoration-audit',$1,$2,'Restored radio',$3,$4::jsonb)`,
    [uuid, stream, reason, JSON.stringify({ _id: id, verifiedRestoration: marker })]);
  });
  const blocked = async () => buildSyncBlacklist(await pgSyncBlacklist()).blacklistedUuids.has(uuid);

  it('resumes verified existing-row maintenance without changing or deleting the audit', async () => {
    const before = (await fixture.pool.query('SELECT * FROM station_blacklist')).rows;
    assert.equal(await blocked(), false);
    assert.deepEqual((await fixture.pool.query('SELECT * FROM station_blacklist')).rows, before);
  });

  for (const [label, change] of [
    ['missing marker', "source=source-'verifiedRestoration'"],
    ['wrong kind', `source=jsonb_set(source,'{verifiedRestoration,kind}','"unreviewed"')`],
    ['wrong original ID', `source=jsonb_set(source,'{_id}','"another-id"')`],
    ['wrong marker ID', `source=jsonb_set(source,'{verifiedRestoration,stationId}','"another-id"')`],
    ['wrong marker UUID', `source=jsonb_set(source,'{verifiedRestoration,stationUuid}','"another-uuid"')`],
    ['missing verification time', "source=source#-'{verifiedRestoration,verifiedAt}'"],
    ['empty verification time', `source=jsonb_set(source,'{verifiedRestoration,verifiedAt}','""')`],
    ['malformed marker', `source=jsonb_set(source,'{verifiedRestoration}','[]')`],
    ['new manual ban', "reason='Explicit manual ban'"],
  ]) {
    it(`retains a ban with ${label}`, async () => {
      await fixture.pool.query(`UPDATE station_blacklist SET ${change}`);
      assert.equal(await blocked(), true);
    });
  }

  for (const [label, change] of [
    ['hidden station', 'is_list_visible=false'],
    ['noindex station', 'no_index=true'],
    ['redirected station', "redirect_to_slug='another-station'"],
    ['changed provider identity', "station_uuid='new-provider-uuid'"],
  ]) {
    it(`reactivates the ban for a ${label}`, async () => {
      await fixture.pool.query(`UPDATE stations SET ${change} WHERE id=$1`, [id]);
      assert.equal(await blocked(), true);
    });
  }

  it('reactivates the ban if the restored station is later removed', async () => {
    await fixture.pool.query('DELETE FROM stations WHERE id=$1', [id]);
    assert.equal(await blocked(), true);
  });

  it('keeps independent URL and UUID bans in force', async () => {
    await fixture.pool.query(`INSERT INTO station_blacklist(id,station_uuid,url,name,reason)
      VALUES('independent-ban',$1,$2,'Separate ban','Explicit manual ban')`, [uuid, stream]);
    const result = buildSyncBlacklist(await pgSyncBlacklist());
    assert.equal(result.blacklistedUuids.has(uuid), true);
    assert.equal(result.blacklistedUrls.has(stream), true);
  });

  it('does not relax the in-transaction new-import blacklist guard', async () => {
    await fixture.pool.query('DELETE FROM stations WHERE id=$1', [id]);
    await fixture.pool.query("INSERT INTO catalog_sync_runs(id,sync_type,status) VALUES('restoration-test-run','incremental','running')");
    const catalog = new PostgresCatalogStore(fixture.pool);
    assert.equal((await catalog.insertMany([{ name: 'Restored radio', stationuuid: uuid, url: stream,
      country: 'Austria', countryCode: 'AT' }], { syncRunId: 'restoration-test-run' })).length, 0);
  });
});
