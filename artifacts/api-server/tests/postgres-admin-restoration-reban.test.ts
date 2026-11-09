import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import type { Server } from 'node:http';
import express from 'express';
import { createNativePostgresFixture, type NativePostgresFixture } from './helpers/native-postgres-fixture';
import { pgBlacklistAdd, pgCatalog, pgSyncBlacklist } from '../src/data/postgres-catalog-store';
import { buildSyncBlacklist } from '../src/utils/sync-blacklist';

const databaseUrl = process.env.PG_TEST_DATABASE_URL;
if (databaseUrl && !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d+\/[^?]*test[^?]*$/.test(databaseUrl)) {
  throw new Error('Re-ban tests require an explicit loopback test database');
}

describe('admin verified-restoration re-ban HTTP and native transaction', { skip: !databaseUrl }, () => {
  let fixture: NativePostgresFixture;
  let server: Server;
  let base: string;
  const id = '600000000000000000000031';
  const uuid = 'restored-reban-provider';
  const stream = 'https://example.invalid/restored-stream';
  const cohortReason = 'User explicitly approved deletion of unresolved 1832 cohort on 2026-10-23';
  const marker = { kind: 'verified-cohort-recovery-20261109', stationId: id, stationUuid: uuid, verifiedAt: '2026-11-09T19:00:00Z' };
  const payload = { stationUuid: uuid, url: stream, name: 'Restored radio', reason: 'Explicit admin re-ban' };
  const auditEmails: any[] = [];

  before(async () => {
    fixture = await createNativePostgresFixture('admin_reban');
    mock.module('../src/services/admin-audit-email', { namedExports: {
      emailBlacklistChangesCsv: async (event: unknown) => { auditEmails.push(event); },
    } });
    const { registerAdminStationRoutes } = await import('../src/routes/admin-station-routes');
    const { requireAdmin, requireAuth } = await import('../src/middleware/auth');
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      if (req.headers['x-fixture-role']) req.session = {
        adminAuth: { role: req.headers['x-fixture-role'], username: 'review-admin' },
      };
      next();
    });
    registerAdminStationRoutes(app, { requireAdmin, requireAuth });
    server = await new Promise<Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await fixture?.close();
    mock.restoreAll();
  });
  beforeEach(async () => {
    auditEmails.length = 0;
    await fixture.clear('stations', 'station_blacklist', 'catalog_sync_runs');
    await fixture.insert('stations', { _id: id, stationuuid: uuid, name: 'Restored radio', slug: 'restored-radio',
      url: stream, noIndex: false, isListVisible: true, manualEditFields: {} });
    await fixture.pool.query(`INSERT INTO station_blacklist(id,station_uuid,url,name,reason,deleted_by,source)
      VALUES('historical-audit',$1,$2,'Old name',$3,'original-admin',$4::jsonb)`,
    [uuid, stream, cohortReason, JSON.stringify({ _id: id, originalEvidence: { keep: true }, verifiedRestoration: marker })]);
  });
  async function post(body: unknown = payload, role: string | null = 'admin') {
    const response = await fetch(`${base}/api/admin/blacklisted-stations`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(role ? { 'x-fixture-role': role } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json() as any };
  }
  const audits = async () => (await fixture.pool.query('SELECT * FROM station_blacklist ORDER BY id')).rows;
  const stations = async () => (await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows;
  const blocked = async () => buildSyncBlacklist(await pgSyncBlacklist());

  it('revokes the active exemption through the actual authenticated route and preserves the audit and live row', async () => {
    const [old] = await audits();
    const live = await stations();
    assert.equal((await blocked()).blacklistedUuids.has(uuid), false);
    const response = await post();
    assert.equal(response.status, 201);
    assert.notEqual(response.body.blacklistedStation._id, old.id);
    assert.equal(response.body.blacklistedStation.reason, payload.reason);
    assert.equal(response.body.blacklistedStation.deletedBy, 'review-admin');
    const savedAudits = await audits();
    assert.equal(savedAudits.length, 2);
    const saved = savedAudits.find(row => row.id === old.id);
    assert.deepEqual({ ...saved, source: old.source }, old);
    const { verifiedRestorationRevocations, ...source } = saved.source;
    const { verifiedRestoration: _marker, ...originalSource } = old.source;
    assert.deepEqual(source, originalSource);
    assert.equal(verifiedRestorationRevocations.length, 1);
    assert.deepEqual(verifiedRestorationRevocations[0].marker, marker);
    assert.equal(verifiedRestorationRevocations[0].revokedBy, 'review-admin');
    assert.equal(verifiedRestorationRevocations[0].reason, payload.reason);
    assert.ok(Number.isFinite(Date.parse(verifiedRestorationRevocations[0].revokedAt)));
    assert.equal((await blocked()).blacklistedUuids.has(uuid), true);
    assert.equal((await blocked()).blacklistedUrls.has(stream), true);
    assert.deepEqual(await stations(), live);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(auditEmails.length, 1);
    assert.equal((await post()).status, 409);
    assert.deepEqual(await audits(), savedAudits);
  });

  it('keeps default store callers idempotent without revoking markers', async () => {
    const before = await audits();
    assert.equal((await pgBlacklistAdd(payload))._id, 'historical-audit');
    assert.deepEqual(await audits(), before);
    assert.equal((await blocked()).blacklistedUuids.has(uuid), false);
  });

  for (const [label, change] of [
    ['ordinary duplicate ban', "reason='Manual blacklist'"],
    ['missing marker', "source=source-'verifiedRestoration'"],
    ['wrong marker kind', `source=jsonb_set(source,'{verifiedRestoration,kind}','"unreviewed"')`],
    ['wrong original ID', `source=jsonb_set(source,'{_id}','"other-id"')`],
    ['wrong marker ID', `source=jsonb_set(source,'{verifiedRestoration,stationId}','"other-id"')`],
    ['wrong marker UUID', `source=jsonb_set(source,'{verifiedRestoration,stationUuid}','"other-uuid"')`],
    ['missing verifiedAt', "source=source#-'{verifiedRestoration,verifiedAt}'"],
    ['empty verifiedAt', `source=jsonb_set(source,'{verifiedRestoration,verifiedAt}','""')`],
    ['malformed marker', `source=jsonb_set(source,'{verifiedRestoration}','[]')`],
    ['malformed revocation history', `source=jsonb_set(source,'{verifiedRestorationRevocations}','{}')`],
  ]) {
    it(`retains 409 and unchanged audit for ${label}`, async () => {
      await fixture.pool.query(`UPDATE station_blacklist SET ${change}`);
      const before = await audits();
      assert.equal((await post()).status, 409);
      assert.deepEqual(await audits(), before);
    });
  }

  for (const [label, change] of [
    ['hidden current row', 'is_list_visible=false'],
    ['noindex current row', 'no_index=true'],
    ['redirected current row', "redirect_to_slug='another-station'"],
    ['changed provider identity', "station_uuid='other-provider'"],
    ['changed current ID', "id='600000000000000000000099'"],
  ]) {
    it(`refuses revocation for ${label}`, async () => {
      await fixture.pool.query(`UPDATE stations SET ${change}`);
      const before = await audits();
      assert.equal((await post()).status, 409);
      assert.deepEqual(await audits(), before);
    });
  }

  it('refuses revocation without a current record', async () => {
    await fixture.pool.query('DELETE FROM stations');
    const before = await audits();
    assert.equal((await post()).status, 409);
    assert.deepEqual(await audits(), before);
  });

  it('requires the supplied UUID to identify the restored row even when the URL matches', async () => {
    const before = await audits();
    assert.equal((await post({ ...payload, stationUuid: 'different-provider' })).status, 409);
    assert.deepEqual(await audits(), before);
  });

  it('accepts URL-only input only for one exact current matching identity', async () => {
    assert.equal((await post({ ...payload, stationUuid: undefined })).status, 201);
    assert.equal((await blocked()).blacklistedUuids.has(uuid), true);
  });

  it('rejects an ambiguous shared current URL without a UUID', async () => {
    await fixture.insert('stations', { _id: '600000000000000000000099', stationuuid: 'another',
      name: 'Another', slug: 'another', url: stream });
    const before = await audits();
    assert.equal((await post({ ...payload, stationUuid: undefined })).status, 409);
    assert.deepEqual(await audits(), before);
  });

  it('accepts a verified UUID whose current repaired stream differs from the old audit URL', async () => {
    const repaired = 'https://example.invalid/repaired-stream';
    await fixture.pool.query('UPDATE stations SET url=$1', [repaired]);
    assert.equal((await post({ ...payload, url: repaired })).status, 201);
    assert.equal((await blocked()).blacklistedUuids.has(uuid), true);
    assert.equal((await blocked()).blacklistedUrls.has(repaired), true);
    assert.equal((await audits()).find(row => row.id === 'historical-audit').url, stream);
  });

  it('does not use an obsolete URL-only request to revoke a repaired current stream', async () => {
    await fixture.pool.query("UPDATE stations SET url='https://example.invalid/repaired-stream'");
    const before = await audits();
    assert.equal((await post({ ...payload, stationUuid: undefined })).status, 409);
    assert.deepEqual(await audits(), before);
  });

  it('keeps independent matching bans and the exempted audit unchanged on conflict', async () => {
    await fixture.pool.query(`INSERT INTO station_blacklist(id,station_uuid,url,name,reason)
      VALUES('z-independent',$1,$2,'Independent','Manual blacklist')`, [uuid, stream]);
    const before = await audits();
    assert.equal((await post()).status, 409);
    assert.deepEqual(await audits(), before);
    assert.equal((await blocked()).blacklistedUuids.has(uuid), true);
  });

  it('leaves unrelated bans untouched when revoking the matching audit', async () => {
    await fixture.pool.query(`INSERT INTO station_blacklist(id,station_uuid,url,name,reason)
      VALUES('unrelated','other','https://example.invalid/other','Other','Manual blacklist')`);
    const unrelated = (await audits()).find(row => row.id === 'unrelated');
    assert.equal((await post()).status, 201);
    assert.deepEqual((await audits()).find(row => row.id === 'unrelated'), unrelated);
  });

  it('appends a revocation without overwriting prior restoration history', async () => {
    const history = [{ marker: { kind: 'older' }, revokedBy: 'earlier-admin' }];
    await fixture.pool.query(`UPDATE station_blacklist SET source=source || jsonb_build_object('verifiedRestorationRevocations',$1::jsonb)`, [JSON.stringify(history)]);
    assert.equal((await post()).status, 201);
    const saved = (await audits()).find(row => row.id === 'historical-audit').source.verifiedRestorationRevocations;
    assert.equal(saved.length, 2);
    assert.deepEqual(saved[0], history[0]);
    assert.deepEqual(saved[1].marker, marker);
  });

  it('serializes simultaneous re-bans to one success and one unchanged duplicate', async () => {
    const responses = await Promise.all([post(), post()]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    assert.equal((await audits()).find(row => row.id === 'historical-audit').source.verifiedRestorationRevocations.length, 1);
    assert.equal((await audits()).length, 2);
  });

  it('keeps ordinary new bans and simultaneous duplicate semantics', async () => {
    await fixture.pool.query('DELETE FROM station_blacklist');
    const responses = await Promise.all([post(), post()]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
    assert.equal((await audits()).length, 1);
    assert.equal((await audits())[0].source.verifiedRestorationRevocations, undefined);
  });

  for (const [role, status] of [[null, 401], ['member', 403]] as const) {
    it(`requires real admin authorization (${role ?? 'anonymous'})`, async () => {
      const before = await audits();
      assert.equal((await post(payload, role)).status, status);
      assert.deepEqual(await audits(), before);
    });
  }

  it('keeps required input validation before any mutation', async () => {
    const before = await audits();
    assert.equal((await post({ name: payload.name })).status, 400);
    assert.equal((await post({ url: payload.url })).status, 400);
    assert.deepEqual(await audits(), before);
  });

  it('rolls back a failed revocation instead of returning a false success', async () => {
    const before = await audits();
    await fixture.pool.query(`CREATE FUNCTION fail_reban() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture rejection'; END $$;
      CREATE TRIGGER reject_reban BEFORE UPDATE ON station_blacklist FOR EACH ROW EXECUTE FUNCTION fail_reban()`);
    try {
      assert.equal((await post()).status, 500);
      assert.deepEqual(await audits(), before);
      assert.equal((await blocked()).blacklistedUuids.has(uuid), false);
    } finally {
      await fixture.pool.query('DROP TRIGGER reject_reban ON station_blacklist; DROP FUNCTION fail_reban()');
    }
  });

  it('rechecks current eligibility after waiting for a concurrent station edit', async () => {
    const client = await fixture.pool.connect();
    const before = await audits();
    let request: ReturnType<typeof post> | undefined;
    try {
      await client.query('BEGIN');
      await client.query('UPDATE stations SET no_index=true WHERE id=$1', [id]);
      request = post();
      await new Promise(resolve => setTimeout(resolve, 30));
      await client.query('COMMIT');
      assert.equal((await request).status, 409);
      assert.deepEqual(await audits(), before);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await request;
    }
  });

  it('rolls back marker revocation if inserting the new explicit ban fails', async () => {
    const before = await audits();
    await fixture.pool.query(`CREATE FUNCTION fail_reban_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture insert rejection'; END $$;
      CREATE TRIGGER reject_reban_insert BEFORE INSERT ON station_blacklist FOR EACH ROW EXECUTE FUNCTION fail_reban_insert()`);
    try {
      assert.equal((await post()).status, 500);
      assert.deepEqual(await audits(), before);
      assert.equal((await blocked()).blacklistedUuids.has(uuid), false);
    } finally {
      await fixture.pool.query('DROP TRIGGER reject_reban_insert ON station_blacklist; DROP FUNCTION fail_reban_insert()');
    }
  });

  it('protects exact curated camelCase keys, omitted values, and resolved stream during provider writes', async () => {
    const protectedValues = { url: stream, urlResolved: '', homepage: '', favicon: '', tags: '',
      country: 'Austria', countryCode: 'AT', state: '', language: '', languageCodes: '',
      geoLat: null, geoLong: null, descriptions: {}, name: 'Restored radio' };
    const manualEditFields = Object.fromEntries(Object.keys(protectedValues).filter(key => key !== 'urlResolved').map(key => [key, true]));
    await pgCatalog().update({ _id: id }, { $set: { ...protectedValues, manualEditFields } });
    const before = await pgCatalog().findOne({ _id: id });
    await pgCatalog().updateProviderBatch([{ uuid, patch: {
      url: 'https://example.invalid/provider', urlResolved: 'https://example.invalid/resolved',
      homepage: 'https://example.invalid/home', favicon: 'https://example.invalid/logo', tags: 'incoming',
      country: 'Germany', countryCode: 'DE', state: 'Other', language: 'German', languageCodes: 'de',
      geoLat: 50, geoLong: 10, descriptions: { en: 'Replacement' }, name: 'Provider name', codec: 'MP3',
    } }]);
    const saved = await pgCatalog().findOne({ _id: id });
    for (const key of Object.keys(protectedValues)) assert.deepEqual(saved?.[key], before?.[key], key);
    assert.equal(saved?.codec, 'MP3');
    assert.deepEqual(saved?.manualEditFields, manualEditFields);
  });
});
