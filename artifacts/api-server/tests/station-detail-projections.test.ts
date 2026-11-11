import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { PostgresLogoVariantStore } from '../src/data/postgres-logo-variant-store';
import { pgSetStationRedirect } from '../src/data/postgres-station-redirect';

function assertIdentityProjection(sql: string) {
  assert.match(sql, /station_uuid\s+AS\s+stationuuid/i);
  assert.match(sql, /source->'mergedStationIds'/);
  assert.match(sql, /source->'mergedStationUuids'/);
  assert.match(sql, /AS "mergedStationIds"/);
  assert.match(sql, /AS "mergedStationUuids"/);
}
test('logo reads project native UUID and archived merge identities without loading the entire source', async () => {
  const identity = { id: 'station-id', stationuuid: 'native-uuid', slug: 'radio', slugAliases: ['old-radio'],
    mergedStationIds: ['merged-id'], mergedStationUuids: ['merged-uuid'], logoAssets: {}, favicon: null };
  const calls: string[] = [];
  const store = new PostgresLogoVariantStore({ query: async (sql: string, values: any[]) => {
    calls.push(sql); assertIdentityProjection(sql); assert.deepEqual(values, [[identity.id]]);
    assert.doesNotMatch(sql, /SELECT\s+\*|SELECT\s+source\s*[, ]/i);
    return { rows: [identity] };
  } } as any);
  assert.deepEqual(await store.findByIds([identity.id]), [identity]); assert.equal(calls.length, 1);
});

test('redirect reads retain merged identities in invalidation keys without altering the redirect-only mutation', async () => {
  const identity = { id: 'station-id', stationuuid: 'native-uuid', slug: 'radio', slugAliases: ['old-radio'],
    mergedStationIds: ['merged-id'], mergedStationUuids: ['merged-uuid'], redirectToSlug: 'old-target', sourceIsObject: true };
  const updates: Array<{ text: string; values: any[] }> = [];
  const client = Object.assign(new EventEmitter(), { release() {}, query: async ({ text, values }: any) => {
    if (text.startsWith('SELECT')) { assertIdentityProjection(text); return { rows: [identity] }; }
    if (text.startsWith('UPDATE')) updates.push({ text, values });
    return { rows: [] };
  } });
  const result = await pgSetStationRedirect({ id: identity.id, targetSlug: null, expectedRedirectToSlug: 'old-target' },
    { connect: async () => client } as any);
  assert.deepEqual(result.cacheKeys, ['station-id', 'native-uuid', 'radio', 'old-radio', 'merged-id', 'merged-uuid', 'old-target']);
  assert.equal(updates.length, 1); assert.deepEqual(updates[0].values, [identity.id, null]);
  assert.match(updates[0].text, /SET redirect_to_slug=\$2/);
  assert.doesNotMatch(updates[0].text, /no_index=|descriptions=|last_check_ok=/);
});
