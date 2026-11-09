import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { getPublicStationDeadline, withPublicStationDeadline, limitPublicStationDeadline } from '../src/utils/public-station-deadline';
import { getSeoReadDeadline, withSeoReadDeadline } from '../src/utils/seo-read-deadline';
import { SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';

const calls: any[] = [];
const rows = [{ _id: 'fixture', slug: 'fixture-radio', completeDescriptionLanguages: ['de'] }];
let failure = false;
mock.module('../src/data/postgres-seo-read-query', { namedExports: { boundedSeoReadQuery: async (sql: string, values: any[]) => {
  calls.push({ sql, values, visibilityDeadline: getPublicStationDeadline(), deadline: getSeoReadDeadline()?.expiresAt });
  if (failure) throw new Error('Read timeout');
  return { rows };
} } });
const { readSeoStationLinkMetadata } = await import('../src/data/postgres-seo-station-link-store');
beforeEach(() => { calls.length = 0; failure = false; });

test('one parameterized ID batch uses transactional presence masks without reading prose/source', async () => {
  const ids = ['fixture', 'other'];
  assert.deepEqual(await readSeoStationLinkMetadata(ids), rows);
  assert.equal(calls.length, 1);
  const { sql, values } = calls[0];
  assert.deepEqual(values, [ids, SITEMAP_PRIORITY_LANGUAGES.universal14]);
  assert.ok(sql.includes('WHERE s.id=ANY($1::text[])'));
  assert.ok(sql.includes('JOIN station_description_summary d ON d.station_id=s.id'));
  assert.ok(!sql.includes('LEFT JOIN') && !sql.includes('COALESCE'));
  assert.ok(sql.includes('d.full_mask & d.meta_mask & (1 << (locale.position::integer-1))'));
  assert.ok(sql.includes('unnest($2::text[]) WITH ORDINALITY'));
  assert.ok(sql.includes('country_code AS "countryCode"') && sql.includes('language_codes AS "languageCodes"'));
  assert.ok(sql.includes('no_index AS "noIndex"') && sql.includes('redirect_to_slug AS "redirectToSlug"'));
  const modeProjection = `CASE WHEN s.is_list_visible=false THEN s.source->>'stationPageMode' ELSE NULL END AS "stationPageMode"`;
  assert.ok(sql.includes(modeProjection));
  assert.ok(!sql.includes('SELECT *') && !sql.replace(modeProjection, '').includes('source') && !sql.includes('descriptions') && !sql.includes('jsonb_each'));
});

test('empty/oversized batches never issue SQL, and bounded read errors remain unknown to the caller', async () => {
  assert.deepEqual(await readSeoStationLinkMetadata([]), []);
  await assert.rejects(readSeoStationLinkMetadata(Array(101).fill('fixture')), /exceeds 100/);
  assert.equal(calls.length, 0);
  failure = true;
  await assert.rejects(readSeoStationLinkMetadata(['fixture']), /Read timeout/);
});

test('metadata uses the existing execution context without extending or narrowing public freshness', async () => {
  const freshness = Date.now() + 30000, deadline = Date.now() + 1000;
  await withPublicStationDeadline(async () => {
    limitPublicStationDeadline(freshness);
    await withSeoReadDeadline({ expiresAt: deadline }, () => readSeoStationLinkMetadata(['fixture']));
    assert.equal(getPublicStationDeadline(), freshness);
  });
  assert.equal(calls[0].visibilityDeadline, freshness);
  assert.ok(calls[0].deadline <= deadline - 250);
  assert.ok(calls[0].deadline <= Date.now() + 500);
});
