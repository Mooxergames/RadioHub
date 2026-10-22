import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { LegacyNoindexRecoveryStore } from '../src/data/postgres-legacy-noindex-recovery';
import { AUDIT_LANGUAGES } from '../src/seo/station-indexability-audit';
import { createNativePostgresFixture } from './helpers/native-postgres-fixture';

test('native recovery restores only a closed group canonical and fences peer changes without losing retained data',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_canonical');
    try {
      const descriptions = Object.fromEntries(AUDIT_LANGUAGES.map(language =>
        [language, { full: `Retained article ${language}`, meta: `Retained summary ${language}` }]));
      const common = { name: 'Example Radio', country: 'Germany', countryCode: 'DE', noIndex: true,
        manualEditFields: {}, lastCheckOk: false, isListVisible: false };
      await fixture.insert('stations', { ...common, _id: 'canonical', stationuuid: randomUUID(), slug: 'example-radio',
        url: 'http://old.example.invalid/live', urlResolved: 'https://stream.example.invalid/live', descriptions,
        source: { originalImport: { retained: true }, noIndex: true } });
      await fixture.insert('stations', { ...common, _id: 'duplicate', stationuuid: randomUUID(), slug: 'example-radio-1',
        url: 'https://stream.example.invalid/live', descriptions: {},
        source: { noIndex: true, automaticNoIndex: { owner: 'radiohub-junk-policy', version: 1,
          active: true, reason: 'duplicate-of:example-radio' } } });
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      const preview = await store.preview();
      assert.equal(preview.totalNoIndex, 2); assert.equal(preview.totalCandidates, 1);
      assert.equal(preview.candidates[0].id, 'canonical');
      assert.deepEqual(preview.candidates[0].evidence.excludedDuplicateIds, ['duplicate']);

      // The canonical row is unchanged and the group is still eligible, but
      // changed peer evidence must invalidate the explicit reviewed snapshot.
      await fixture.pool.query("UPDATE stations SET state='Berlin' WHERE id='duplicate'");
      await assert.rejects(store.apply({ previewId: preview.previewId, stationIds: ['canonical'] }), { code: 'RECOVERY_STALE' });
      assert.equal((await fixture.pool.query('SELECT count(*)::integer AS count FROM stations WHERE no_index=true')).rows[0].count, 2);
      const fresh = await store.preview();
      const before = (await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows;
      const result = await store.apply({ previewId: fresh.previewId, stationIds: ['canonical'], actor: 'native-fixture-admin' });
      assert.equal(result.restored, 1);
      const after = (await fixture.pool.query('SELECT * FROM stations ORDER BY id')).rows;
      assert.equal(after[0].no_index, false); assert.equal(after[1].no_index, true);
      assert.deepEqual(after[1], before[1], 'every duplicate field remains byte-for-byte unchanged');
      for (const key of Object.keys(before[0]).filter(key => !['no_index', 'source', 'updated_at', 'no_index_recovery_journal'].includes(key))) {
        assert.deepEqual(after[0][key], before[0][key], key);
      }
      assert.deepEqual(after[0].source, { ...before[0].source, noIndex: false });
      const journal = after[0].no_index_recovery_journal[fresh.previewId];
      assert.equal(journal.before.noIndex, true);
      assert.equal(journal.evidence.evidence.recoveryBasis, 'canonical-of-excluded-duplicates');
      assert.deepEqual(journal.evidence.evidence.excludedDuplicateIds, ['duplicate']);
      const second = await store.preview();
      assert.equal(second.totalCandidates, 0, 'the remaining duplicate can never become a second canonical');

      await fixture.pool.query("UPDATE stations SET no_index=true WHERE id='canonical'");
      await fixture.pool.query("UPDATE stations SET source=source || jsonb_build_object('city',CASE WHEN id='canonical' THEN 'Berlin' ELSE 'Munich' END)");
      assert.equal((await store.preview()).totalCandidates, 0, 'conflicting retained city metadata blocks recovery');
      await fixture.pool.query("UPDATE stations SET source=source-'city'");
      await fixture.pool.query("UPDATE stations SET manual_edit_fields='{\"noIndex\":true}' WHERE id='duplicate'");
      assert.equal((await store.preview()).totalCandidates, 0);
      await fixture.pool.query("UPDATE stations SET manual_edit_fields='{}',no_index=false WHERE id='duplicate'");
      assert.equal((await store.preview()).totalCandidates, 0, 'an already indexable sibling remains authoritative');
    } finally { await fixture.close(); }
  });

test('native explicit format-heuristic recovery retires only owned provenance and preserves private before state',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const fixture = await createNativePostgresFixture('noindex_format');
    try {
      const automaticNoIndex = { owner: 'radiohub-junk-policy', version: 1, active: true,
        reason: 'codec-suffix:-flac', markedAt: '2026-04-01T00:00:00Z', retainedEvidence: { original: true } };
      await fixture.insert('stations', { _id: 'format', stationuuid: randomUUID(), name: 'Unique Classical FLAC',
        slug: 'unique-classical-flac', country: 'Turkey', countryCode: 'TR', url: 'https://example.invalid/flac',
        noIndex: true, manualEditFields: {}, lastCheckOk: false, isListVisible: false,
        descriptions: Object.fromEntries(AUDIT_LANGUAGES.map(language => [language, { full: 'Retained original article', meta: 'Retained summary' }])),
        source: { noIndex: true, automaticNoIndex, preserved: { value: true } } });
      const store = new LegacyNoindexRecoveryStore(() => fixture.pool, async () => true);
      const preview = await store.preview();
      assert.equal(preview.totalCandidates, 1);
      assert.equal(preview.candidates[0].evidence.provenance, 'owned-retired-name-heuristic');
      const before = (await fixture.pool.query('SELECT * FROM stations')).rows[0];
      await store.apply({ previewId: preview.previewId, stationIds: ['format'] });
      const after = (await fixture.pool.query('SELECT * FROM stations')).rows[0];
      assert.equal(after.no_index, false);
      assert.equal(after.source.automaticNoIndex.active, false);
      assert.deepEqual(after.source.automaticNoIndex.retainedEvidence, automaticNoIndex.retainedEvidence);
      assert.equal(after.source.automaticNoIndex.retiredReason, 'explicit-verified-information-page-recovery');
      assert.deepEqual(after.no_index_recovery_journal[preview.previewId].before.automaticNoIndex, automaticNoIndex);
      assert.deepEqual(after.source.preserved, { value: true });
      for (const key of Object.keys(before).filter(key => !['no_index', 'source', 'updated_at', 'no_index_recovery_journal'].includes(key))) {
        assert.deepEqual(after[key], before[key], key);
      }
    } finally { await fixture.close(); }
  });
