import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createNativePostgresFixture } from './helpers/native-postgres-fixture';
import { LegacyNoindexRecoveryStore } from '../src/data/postgres-legacy-noindex-recovery';
import { pgSaveScopedDescriptionRepair } from '../src/data/postgres-scoped-description-repair';
import { catalogShape } from '../src/data/postgres-catalog-store';
import { descriptionRepairIdentity } from '../src/services/description-repair-policy';

test('native scoped repair journals the original locale privately, preserves source and SEO state, and fences concurrent changes',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('scoped_description');
    try {
      const original = { full: '', meta: 'Retained supplied summary', reviewer: { preserved: true } };
      await fixture.insert('stations', { _id: 'reviewed', stationuuid: randomUUID(), name: 'Unique Fixture Radio',
        slug: 'unique-fixture-radio', country: 'Germany', countryCode: 'DE', url: 'https://example.invalid/unique',
        noIndex: true, manualEditFields: {}, descriptions: { de: original }, source: { captured: 'preserve-me' } });
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      const reviewed = await store.reviewDescriptions(['reviewed', 'missing']);
      assert.equal(reviewed[0].reason, 'eligible-for-content-repair');
      assert.equal(reviewed[1].reason, 'missing-station');
      assert.equal((await store.preview()).totalCandidates, 0, 'missing prose never becomes a recovery candidate');
      const before = (await fixture.pool.query('SELECT * FROM stations')).rows[0];
      assert.deepEqual(reviewed[0].identity, descriptionRepairIdentity(catalogShape(before)));
      const next = { ...original, full: 'Ein vollstaendiger Artikel fuer dieses Radio.' };
      const input = { identity: reviewed[0].identity!, language: 'de', expected: original, next, jobId: 'job-a', actor: 'fixture-actor' };
      assert.equal((await pgSaveScopedDescriptionRepair(input, fixture.pool)).modifiedCount, 1);
      const after = (await fixture.pool.query('SELECT * FROM stations')).rows[0];
      assert.deepEqual(after.descriptions.de, next);
      assert.deepEqual(after.description_repair_journal.de.before, original);
      assert.equal(after.description_repair_journal.de.actor, 'fixture-actor');
      assert.equal(after.description_repair_journal.de.localeExisted, true);
      for (const field of Object.keys(before).filter(key => !['descriptions', 'updated_at', 'description_repair_journal', 'description_summary'].includes(key))) {
        assert.deepEqual(after[field], before[field], field);
      }
      assert.equal(after.no_index, true);
      const publicStation = catalogShape(after);
      assert.equal(Object.hasOwn(publicStation, 'description_repair_journal'), false);
      assert.equal(Object.hasOwn(publicStation, 'descriptionRepairJournal'), false);
      assert.doesNotMatch(JSON.stringify(publicStation), /fixture-actor|job-a/);
      assert.equal((await pgSaveScopedDescriptionRepair(input, fixture.pool)).modifiedCount, 0, 'stale locale cannot overwrite current content');
      const newer = { ...next, full: 'Ein erneut gepruefter Artikel.' };
      assert.equal((await pgSaveScopedDescriptionRepair({ ...input, expected: next, next: newer, jobId: 'job-b' }, fixture.pool)).modifiedCount, 1);
      assert.deepEqual((await fixture.pool.query('SELECT description_repair_journal FROM stations')).rows[0].description_repair_journal.de.before, original);
      await fixture.pool.query("UPDATE stations SET manual_edit_fields='{\"descriptions.de\":true}'");
      assert.equal((await pgSaveScopedDescriptionRepair({ ...input, expected: newer }, fixture.pool)).modifiedCount, 0);
      await fixture.pool.query("UPDATE stations SET manual_edit_fields='{}',name='Changed identity'");
      assert.equal((await pgSaveScopedDescriptionRepair({ ...input, expected: newer }, fixture.pool)).modifiedCount, 0);
      await fixture.pool.query("UPDATE stations SET name='Unique Fixture Radio',no_index=false");
      assert.equal((await pgSaveScopedDescriptionRepair({ ...input, expected: newer }, fixture.pool)).modifiedCount, 0);
      await fixture.pool.query("UPDATE stations SET no_index=true,description_repair_journal='[]'");
      assert.equal((await store.reviewDescriptions(['reviewed']))[0].reason, 'ambiguous-description-journal');
    } finally { await fixture.close(); }
  });
