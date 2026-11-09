import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../src/postgres-runtime.ts', import.meta.url).href, { namedExports: {
  getPostgresPool: () => ({ query: async () => ({ rows: [{ id: 'verified', name: 'Verified Radio', slug: 'verified',
    url: '', is_list_visible: false, source: { stationPageMode: 'information' }, descriptions: { en: 'Reviewed historical article.' } }] }) }),
} });
test('PostgreSQL source mode survives the detail reader and public response cleaning', async () => {
  const { getStationByIdentifier } = await import('../src/data/station-read-store');
  const { stripPlaceholders } = await import('../src/routes/shared-utils');
  const station = stripPlaceholders(await getStationByIdentifier('verified'));
  const response = JSON.parse(JSON.stringify(station));
  assert.equal(response.stationPageMode, 'information');
  assert.equal(response.isListVisible, false);
  assert.equal(response.descriptions.en, 'Reviewed historical article.');
});
