import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDEXING_PILOT, matchingPilotProfile, withPilotEditorial } from '../src/seo/indexing-pilot';

const profile = INDEXING_PILOT[0];
const station = {
  _id: profile.id, slug: profile.slug, countryCode: profile.countryCode,
  noIndex: false, isListVisible: true, url: 'https://audio.example.test/live',
  homepage: 'https://old.example.test/', totalRatings: 12,
  descriptions: { en: { full: 'Old copy', meta: 'Old metadata', provenance: 'retained' }, tr: { full: 'Turkce', meta: 'Turkce meta' } },
};

test('pilot is exactly ten distinct existing stations per country with attributable English copy', () => {
  assert.equal(INDEXING_PILOT.length, 20);
  assert.equal(new Set(INDEXING_PILOT.map(row => row.id)).size, 20);
  assert.equal(new Set(INDEXING_PILOT.map(row => row.slug)).size, 20);
  for (const country of ['AT', 'TR']) assert.equal(INDEXING_PILOT.filter(row => row.countryCode === country).length, 10);
  for (const row of INDEXING_PILOT) {
    assert.match(row.id, /^[a-f0-9]{24}$/);
    assert.match(row.slug, /^[a-z0-9-]+$/);
    assert.ok(row.meta.length <= 160 && row.meta.length > 60);
    assert.ok(row.full.includes('\n\n'));
    assert.equal(new URL(row.homepage).protocol, 'https:');
    assert.ok(row.sources.length > 0);
    for (const source of row.sources) assert.equal(new URL(source).protocol, 'https:');
  }
});

test('editorial copy is immutable, English-only, and never changes identity, playback or index policy', () => {
  const original = structuredClone(station);
  const result = withPilotEditorial(station);
  assert.equal(result.descriptions.en.full, profile.full);
  assert.equal(result.descriptions.en.meta, profile.meta);
  assert.equal(result.descriptions.en.provenance, station.descriptions.en.provenance);
  assert.strictEqual(result.descriptions.tr, station.descriptions.tr);
  assert.equal(result.homepage, profile.homepage);
  for (const key of ['_id', 'slug', 'countryCode', 'noIndex', 'isListVisible', 'url', 'totalRatings']) assert.equal(result[key], station[key as keyof typeof station]);
  assert.deepEqual(station, original);
  assert.deepEqual(withPilotEditorial(result), result);
});

test('explicit administrator ownership wins over the reviewed presentation', () => {
  for (const key of ['descriptions', 'descriptions.en']) {
    const result = withPilotEditorial({ ...station, manualEditFields: { [key]: true } });
    assert.strictEqual(result.descriptions, station.descriptions);
    assert.equal(result.homepage, profile.homepage);
  }
  const homepageOwned = withPilotEditorial({ ...station, manualEditFields: { homepage: true } });
  assert.equal(homepageOwned.homepage, station.homepage);
  assert.equal(homepageOwned.descriptions.en.full, profile.full);
});

test('unreviewed, moved, excluded, hidden or ambiguous identities cannot enter the pilot', () => {
  for (const patch of [
    { _id: 'different' }, { slug: `${profile.slug}-2` }, { countryCode: 'DE' },
    { noIndex: true }, { noIndex: undefined }, { noIndex: null },
    { redirectToSlug: 'different' }, { isListVisible: false },
  ]) {
    const changed = { ...station, ...patch };
    assert.equal(matchingPilotProfile(changed), undefined);
    assert.strictEqual(withPilotEditorial(changed), changed);
  }
  assert.equal(withPilotEditorial(null), null);
});
