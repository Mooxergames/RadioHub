import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildManualStationMergePreview, parseManualStationMerge, validateManualStationMergeReview } from '../src/utils/manual-station-merge-review';

const a = 'a'.repeat(24), b = 'b'.repeat(24), c = 'c'.repeat(24);
const selection = (mergeData?: unknown) => parseManualStationMerge({ primaryStationId: a, duplicateStationIds: [b], ...(mergeData === undefined ? {} : { mergeData }) });
const docs = () => [a, b].map((_id, index) => ({ _id, stationuuid: `uuid-${index}`, name: 'Radio', slug: `radio-${index}`,
  slugAliases: ['old'], url: 'https://example.invalid/live', country: 'Germany', countryCode: 'DE',
  noIndex: false, manualEditFields: { name: true, url: false }, votes: index, descriptions: { en: 'Not a review fact' } }));

test('manual selection rejects missing, self, duplicate, invalid IDs and groups outside 2..50', () => {
  for (const body of [null, {}, { primaryStationId: a, duplicateStationIds: [] },
    { primaryStationId: a, duplicateStationIds: [a] }, { primaryStationId: a, duplicateStationIds: [b, b] },
    { primaryStationId: 'missing', duplicateStationIds: [b] }, { primaryStationId: a, duplicateStationIds: [42] },
    { primaryStationId: a, duplicateStationIds: Array.from({ length: 50 }, (_, i) => i.toString(16).padStart(24, '0')) }]) {
    assert.throws(() => parseManualStationMerge(body), { status: 400 });
  }
  assert.equal(parseManualStationMerge({ primaryStationId: a, duplicateStationIds: [c, b] }).duplicateStationIds.join(','), [b, c].join(','));
});

test('manual patch is a bounded string allowlist, trimmed once and cannot clear fields', () => {
  assert.deepEqual(selection({ name: '  Renamed  ', genre: '  ' }).changes, { name: 'Renamed' });
  for (const mergeData of [null, [], 'name', { noIndex: false }, { name: {} }, { name: 1 }, { name: 'x'.repeat(513) },
    { url: 'x'.repeat(8193) }, { name: 'bad\u0000text' }, JSON.parse('{"__proto__":"bad"}')]) {
    assert.throws(() => selection(mergeData), { status: 400 });
  }
});

test('fingerprint is deterministic across member/key order and excludes hot counters and descriptions', () => {
  const original = docs(), preview = buildManualStationMergePreview(selection({ name: ' Renamed ' }), original);
  const changed = original.toReversed().map(doc => ({ ...doc, votes: 900, clickCount: 500, updatedAt: new Date(),
    descriptions: {}, manualEditFields: { url: false, name: true } }));
  assert.equal(buildManualStationMergePreview(selection({ name: 'Renamed' }), changed).fingerprint, preview.fingerprint);
  assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(preview.primaryStation._id, a);
  assert.equal(Object.hasOwn(preview.primaryStation, 'descriptions'), false);
  assert.equal(Object.hasOwn(preview.primaryStation, 'source'), false);
  assert.deepEqual(preview.changes, { name: 'Renamed' });
  assert.equal(preview.requiresIdentityConfirmation, false);
});

test('every reviewed identity field and sanitized patch participates in optimistic concurrency', () => {
  const original = docs(), fingerprint = buildManualStationMergePreview(selection(), original).fingerprint;
  for (const patch of [{ name: 'Other' }, { stationuuid: 'new' }, { slug: 'new' }, { slugAliases: ['new'] },
    { url: 'https://example.invalid/new' }, { urlResolved: 'https://example.invalid/new' }, { country: 'France' },
    { countryCode: 'FR' }, { city: 'Paris' }, { state: 'New state' }, { noIndex: true }, { redirectToSlug: 'other' },
    { manualEditFields: { name: false } }]) {
    assert.throws(() => validateManualStationMergeReview(selection(), [{ ...original[0], ...patch }, original[1]],
      { expectedFingerprint: fingerprint, confirmIdentityOverride: true }), { status: 409 });
  }
  assert.throws(() => validateManualStationMergeReview(selection({ name: 'New' }), original, { expectedFingerprint: fingerprint }), { status: 409 });
  assert.throws(() => buildManualStationMergePreview(selection(), [original[0]]), { status: 409 });
});

test('protected primary is rejected and unsafe manual identity requires explicit override', () => {
  const original = docs();
  for (const patch of [{ noIndex: true }, { redirectToSlug: 'other' }]) {
    assert.throws(() => buildManualStationMergePreview(selection(), [{ ...original[0], ...patch }, original[1]]), { status: 422 });
  }
  for (const patch of [{ name: 'Different broadcast' }, { noIndex: true, manualEditFields: { noIndex: true } }, { redirectToSlug: 'other' }]) {
    const current = [original[0], { ...original[1], ...patch }];
    const preview = buildManualStationMergePreview(selection(), current);
    assert.equal(preview.identity.eligible, false); assert.equal(preview.requiresIdentityConfirmation, true);
    assert.throws(() => validateManualStationMergeReview(selection(), current, { expectedFingerprint: preview.fingerprint }), { status: 422 });
    assert.doesNotThrow(() => validateManualStationMergeReview(selection(), current, { expectedFingerprint: preview.fingerprint, confirmIdentityOverride: true }));
  }
});

test('apply requires exact true confirmation and a SHA256 fingerprint, not truthy values', () => {
  const base = { primaryStationId: a, duplicateStationIds: [b] };
  for (const patch of [{}, { confirm: true }, { expectedFingerprint: 'a'.repeat(64) }, { confirm: 'true', expectedFingerprint: 'a'.repeat(64) },
    { confirm: true, expectedFingerprint: 'invalid' }, { confirm: true, expectedFingerprint: 'a'.repeat(64), confirmIdentityOverride: 'true' }]) {
    assert.throws(() => parseManualStationMerge({ ...base, ...patch }, true), { status: 400 });
  }
  assert.equal(parseManualStationMerge({ ...base, confirm: true, expectedFingerprint: 'a'.repeat(64) }, true).review?.expectedFingerprint, 'a'.repeat(64));
});
