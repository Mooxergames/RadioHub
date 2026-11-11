import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessLegacyNoindexContentRepair, assessLegacyNoindexRecovery, createRecoveryIdentityIndex, type RecoveryStation } from '../src/seo/legacy-noindex-recovery';
import { descriptionLocaleProtected, descriptionRepairIdentity, inspectSelectedDescriptionRepair, validSelectedDescriptionRepairBody } from '../src/services/description-repair-policy';

const row: RecoveryStation = { id: 'a', name: 'Fixture Radio', slug: 'fixture-radio', country: 'Germany', countryCode: 'DE',
  url: 'https://example.invalid/stream', urlResolved: null, stationuuid: '00000000-0000-4000-8000-000000000001',
  noIndex: true, redirectToSlug: null, manualEditFields: {}, automaticNoIndex: null,
  lastCheckOk: false, lastCheckTime: null, lastCheckOkTime: null, completeLanguageCount: 0,
  rowVersion: '1', sourceIsObject: true, journalIsObject: true };
const english = { full: 'Music reaches listeners through the online audio service of Fixture Radio.', meta: 'Online music broadcast from Fixture Radio, available for its listeners.' };

test('content repair reviews missing prose without authorizing SEO recovery or changing the completeness evidence', () => {
  const index = createRecoveryIdentityIndex(); index.add(row);
  const before = structuredClone(row);
  assert.equal(assessLegacyNoindexContentRepair(row, index, Date.now()).reason, 'eligible-for-content-repair');
  assert.equal(assessLegacyNoindexContentRepair(row, index, Date.now()).candidate, undefined);
  assert.equal(assessLegacyNoindexRecovery(row, index, Date.now()).reason, 'incomplete-english-description');
  assert.deepEqual(row, before);
});

test('content repair retains all identity, duplicate, manual, redirect and test-feed guards', () => {
  for (const patch of [{ countryCode: null }, { manualEditFields: { noIndex: false } }, { redirectToSlug: 'target' },
    { name: 'Radio Test Stream' }, { noIndex: false }, { url: 'ftp://example.invalid' }]) {
    const candidate = { ...row, ...patch };
    const index = createRecoveryIdentityIndex(); index.add(candidate);
    assert.notEqual(assessLegacyNoindexContentRepair(candidate, index, Date.now()).reason, 'eligible-for-content-repair', JSON.stringify(patch));
  }
  const index = createRecoveryIdentityIndex(); index.add(row);
  index.add({ ...row, id: 'peer', slug: 'fixture-radio-1', noIndex: false });
  assert.equal(assessLegacyNoindexContentRepair(row, index, Date.now()).reason, 'plausible-identity-peer');
});

test('selected review distinguishes nominated source copies, missing fields and protected locale extensions', () => {
  const descriptions = { en: english, de: { ...english, reviewer: 'retain' }, fr: { full: '', meta: 'Retain supplied metadata' },
    hi: { full: 'यह रेडियो अपने श्रोताओं के लिए संगीत का ऑनलाइन प्रसारण उपलब्ध कराता है।', meta: 'Tune in to Fixture Radio and listen to its music broadcast.' } };
  const identity = descriptionRepairIdentity({ ...row, manualEditFields: { 'descriptions.de.full': true } });
  const source = { id: row.id, name: row.name, slug: row.slug, reason: 'eligible-for-content-repair', identity, descriptions };
  const before = structuredClone(source), result = inspectSelectedDescriptionRepair(source, 'en');
  assert.equal(result.sourceLanguage, 'en');
  assert.ok(result.protectedLanguages.includes('de'));
  assert.ok(!result.changes.some(change => change.language === 'de' || change.language === 'en'));
  assert.deepEqual(result.changes.find(change => change.language === 'fr')?.fields, ['full']);
  assert.deepEqual(result.changes.find(change => change.language === 'hi')?.fields, ['meta']);
  assert.deepEqual(source, before);
  const unprotected = inspectSelectedDescriptionRepair({ ...source, identity: descriptionRepairIdentity(row) }, 'en');
  assert.deepEqual(unprotected.changes.find(change => change.language === 'de')?.fields, ['full', 'meta']);
  const unnominated = inspectSelectedDescriptionRepair({ ...source, identity: descriptionRepairIdentity(row) });
  assert.ok(!unnominated.changes.some(change => change.language === 'de'), 'Latin-script copies require a nominated source');
});

test('scoped body cannot expand into a global job, alternate language subset or unbounded selection', () => {
  assert.ok(validSelectedDescriptionRepairBody({ selectedStationIds: ['a'], sourceLanguage: 'en' }));
  assert.ok(validSelectedDescriptionRepairBody({ selectedStationIds: ['a'] }));
  for (const body of [undefined, null, [], {}, { selectedStationIds: [] }, { selectedStationIds: ['a', 'a'] },
    { selectedStationIds: ['a'], languages: ['en'] }, { selectedStationIds: ['a'], filterByCountry: 'DE' },
    { selectedStationIds: ['a'], sourceLanguage: 'de' }, { selectedStationIds: Array.from({ length: 101 }, (_, i) => String(i)) }]) {
    assert.equal(validSelectedDescriptionRepairBody(body), false);
  }
});

test('unknown or nested manual protection is preserved rather than interpreted as automatic permission', () => {
  for (const manual of [null, [], { descriptions: true }, { descriptions: {} }, { 'descriptions.de': 'true' }, { 'descriptions.de.meta': true }]) {
    assert.ok(descriptionLocaleProtected(manual, 'de'));
  }
  assert.equal(descriptionLocaleProtected({ descriptions: false, 'descriptions.de': false }, 'de'), false);
});
