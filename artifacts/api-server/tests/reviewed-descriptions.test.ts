import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { REVIEWED_DESCRIPTION_PREIMAGES as capturedProfiles } from '../src/seo/reviewed-description-preimages';
import { getReviewedDescriptionCopy, REVIEWED_DESCRIPTION_SOURCES } from '../src/seo/reviewed-description-copy';
import { stripPlaceholders } from '../src/routes/shared-utils';
import { catalogShape } from '../src/data/postgres-catalog-store';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fixtures = capturedProfiles.map(profile => ({
  ...profile.identity, noIndex: false, isListVisible: true, redirectToSlug: null,
  manualEditFields: { favicon: true }, url: 'https://audio.example.invalid/live',
  descriptions: Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(language => [language, {
    full: `Previous ${language} article for ${profile.identity.name} & its stream.`,
    meta: `Previous ${language} metadata for ${profile.identity.name}.`, provenance: 'retained',
  }])),
}));
const fixturesById = new Map(fixtures.map(station => [station._id, station]));
const syntheticProfiles = fixtures.map(station => ({
  identity: capturedProfiles.find(profile => profile.identity._id === station._id)!.identity,
  englishSourceSha256: hash(JSON.stringify({ full: station.descriptions.en.full, meta: station.descriptions.en.meta })),
  locales: Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(language => [language, {
    fullSha256: hash(station.descriptions[language].full), metaSha256: hash(station.descriptions[language].meta),
  }])),
}));
mock.module(new URL('../src/seo/reviewed-description-preimages.ts', import.meta.url).href, {
  namedExports: { REVIEWED_DESCRIPTION_PREIMAGES: syntheticProfiles },
});
const { withReviewedDescriptions, inspectReviewedDescriptions } = await import('../src/seo/reviewed-descriptions');
let databaseRow: Record<string, unknown>;
mock.module(new URL('../src/postgres-runtime.ts', import.meta.url).href, {
  namedExports: { getPostgresPool: () => ({ query: async () => ({ rows: [databaseRow] }) }) },
});
const { getStationByIdentifier } = await import('../src/data/station-read-store');

test('the production allowlist contains exactly four attributed identities and 56 locale preimages', () => {
  assert.equal(capturedProfiles.length, 4);
  assert.equal(new Set(capturedProfiles.map(profile => profile.identity._id)).size, 4);
  for (const profile of capturedProfiles) {
    assert.match(profile.englishSourceSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(profile.locales).sort(), [...ACTIVE_SITEMAP_LANGUAGES].sort());
    assert.ok(REVIEWED_DESCRIPTION_SOURCES[profile.identity.slug].length);
    for (const expected of Object.values(profile.locales)) {
      assert.match(expected.fullSha256, /^[a-f0-9]{64}$/);
      assert.match(expected.metaSha256, /^[a-f0-9]{64}$/);
    }
  }
});

for (const fixture of fixtures) {
  test(`${fixture.slug}: all 14 reviewed articles are immutable, factual and independent of indexability`, () => {
    const original = structuredClone(fixture);
    const reviewed = inspectReviewedDescriptions(fixture);
    assert.equal(reviewed.appliedLanguages.length, 14);
    assert.deepEqual(reviewed.skippedLanguages, []);
    const result = withReviewedDescriptions(fixture);
    for (const language of ACTIVE_SITEMAP_LANGUAGES) {
      const copy = getReviewedDescriptionCopy(fixture.slug, language)!;
      assert.equal(result.descriptions[language].full, copy.full);
      assert.equal(result.descriptions[language].meta, copy.meta);
      assert.ok(copy.full.includes(fixture.name));
      assert.ok(copy.meta.length > 0 && copy.meta.length <= 160);
      assert.equal(result.descriptions[language].provenance, 'retained');
    }
    const { descriptions: _before, ...beforeFields } = original;
    const { descriptions: _after, ...afterFields } = result;
    assert.deepEqual(afterFields, beforeFields);
    assert.deepEqual(fixture, original);
    assert.strictEqual(withReviewedDescriptions(result), result, 'already-presented text is not transformed again');
  });
}

test('every identity and reviewed technical fact is checked before replacing existing prose', () => {
  const fixture = fixtures[0];
  for (const key of Object.keys(syntheticProfiles[0].identity)) {
    const changed = { ...fixture, [key]: 'changed' };
    assert.strictEqual(withReviewedDescriptions(changed), changed, key);
  }
  for (const patch of [{ noIndex: true }, { noIndex: undefined }, { isListVisible: false }, { redirectToSlug: 'target' }]) {
    const changed = { ...fixture, ...patch };
    assert.strictEqual(withReviewedDescriptions(changed), changed);
  }
  assert.equal(withReviewedDescriptions(null), null);
});

test('missing or malformed protection is never interpreted as permission', () => {
  for (const flags of [null, undefined, [], true, 'false']) {
    const fixture = { ...fixtures[0], manualEditFields: flags };
    assert.strictEqual(withReviewedDescriptions(fixture), fixture);
  }
  const missing: any = { ...fixtures[0] }; delete missing.manualEditFields;
  assert.strictEqual(withReviewedDescriptions(missing), missing);
  for (const flags of [{ descriptions: true }, { descriptions: {} }, { 'descriptions.en': true }, { description: true }]) {
    const fixture = { ...fixtures[0], manualEditFields: flags };
    assert.strictEqual(withReviewedDescriptions(fixture), fixture);
  }
});

test('native API and SSR readers preserve malformed manual flags and reach the same overlay decision', async () => {
  const fixture = fixtures[0];
  for (const flags of [null, undefined, false, 0, '', [], 'false', {}, { favicon: true }, { descriptions: true }]) {
    databaseRow = {
      id: fixture._id, name: fixture.name, slug: fixture.slug, homepage: fixture.homepage,
      country: fixture.country, country_code: fixture.countryCode, tags_raw: fixture.tags,
      codec: fixture.codec, bitrate: fixture.bitrate, url: fixture.url, no_index: false,
      is_list_visible: true, last_check_ok: true, redirect_to_slug: null,
      descriptions: structuredClone(fixture.descriptions), manual_edit_fields: flags, source: {},
    };
    const api = await getStationByIdentifier(fixture.slug);
    const ssr = catalogShape(databaseRow);
    assert.strictEqual(api.manualEditFields, flags);
    assert.strictEqual(ssr.manualEditFields, flags);
    assert.deepEqual(inspectReviewedDescriptions(api), inspectReviewedDescriptions(ssr));
    if (flags === null || typeof flags !== 'object' || Array.isArray(flags)) {
      assert.equal(inspectReviewedDescriptions(api).appliedLanguages.length, 0);
    }
  }
});

test('per-locale manual ownership and changed text are retained rather than force-retried', () => {
  for (const key of ['descriptions.de', 'descriptions.de.full', 'descriptions.de.meta']) {
    const fixture = { ...fixtures[0], manualEditFields: { [key]: true } };
    const result = withReviewedDescriptions(fixture);
    assert.strictEqual(result.descriptions.de, fixture.descriptions.de);
    assert.equal(inspectReviewedDescriptions(fixture).appliedLanguages.length, 13);
    assert.deepEqual(inspectReviewedDescriptions(fixture).skippedLanguages, [{ language: 'de', reason: 'manual-protection' }]);
  }
  const fixture = structuredClone(fixtures[0]);
  fixture.descriptions.de.full = 'Later administrator text without a flag.';
  assert.strictEqual(withReviewedDescriptions(fixture).descriptions.de, fixture.descriptions.de);
  fixture.descriptions.en.meta = 'A changed source invalidates all translations.';
  assert.strictEqual(withReviewedDescriptions(fixture), fixture);
});

test('raw SSR and placeholder-cleaned API snapshots make the same guarded locale decisions', () => {
  const raw = structuredClone(fixtures[0]);
  for (const value of Object.values(raw.descriptions)) {
    value.full = `  ${value.full.replace('&', '&amp;')}  `;
    value.meta = ` [SEO META] ${value.meta} `;
  }
  const api = stripPlaceholders(raw);
  assert.equal(inspectReviewedDescriptions(raw).appliedLanguages.length, 14);
  assert.deepEqual(withReviewedDescriptions(raw).descriptions, withReviewedDescriptions(api).descriptions);
});

test('unreviewed names/languages never acquire an English fallback or a different station identity', () => {
  assert.equal(getReviewedDescriptionCopy('unreviewed', 'en'), undefined);
  assert.equal(getReviewedDescriptionCopy('mangoradio', 'fa'), undefined);
  for (const station of fixturesById.values()) {
    assert.equal(withReviewedDescriptions(station)._id, station._id);
  }
});
