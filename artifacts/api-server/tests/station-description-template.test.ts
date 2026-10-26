import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTemplateDescription, missingEnglishDescriptionPatch } from '../src/services/station-description-template';
import { getLocalizedStationDescription, getStationMetaDescription } from '@workspace/seo-shared/seo-config';
import { getIndexableLanguagesForStation } from '../src/seo/junk-station-rules';

test('catalogue summaries contain supplied facts without inventing editorial or popularity claims', () => {
  const summary = buildTemplateDescription({ name: 'News Radio', country: 'Austria', state: 'Vienna',
    tags: 'news, talk', language: 'German', votes: 100000, bitrate: 320, codec: 'MP3', homepage: 'https://example.test/' });
  assert.match(summary.full, /News Radio is listed as a radio station\. Catalogue region: Vienna, Austria/);
  assert.match(summary.full, /Catalogue tags: news, talk/);
  assert.match(summary.full, /Reported broadcast language: German/);
  assert.match(summary.full, /Listed stream format: 320 kbps MP3/);
  assert.match(summary.full, /Listed website: https:\/\/example\.test\//);
  assert.doesNotMatch(summary.full + summary.meta, /music|reliable|popular|established|audience|regional scene|high.fidelity|100,?000|signup/i);
  assert.ok(summary.meta.length <= 160);
});

test('sparse metadata stays sparse instead of being expanded with filler', () => {
  assert.deepEqual(buildTemplateDescription({ name: 'Sparse Radio' }), { full: '', meta: '' });
  assert.deepEqual(buildTemplateDescription({ name: '  ' }), { full: '', meta: '' });
});

test('catalogue regions are labels, not verified studios, and unknown countries do not become facts', () => {
  for (const country of ['Unknown', 'unknown', 'N/A', 'null', 'ZZ']) {
    assert.deepEqual(buildTemplateDescription({ name: 'Sparse Radio', country }), { full: '', meta: '' });
  }
  const known = buildTemplateDescription({ name: 'Fixture Radio', country: 'Unknown', countryCode: 'DE', codec: 'MP3' });
  assert.match(known.full, /Catalogue region: Germany\./);
  assert.doesNotMatch(known.full, /Unknown|broadcasting from|studio/i);
});

test('location and tags are not duplicated and invalid numeric facts are omitted', () => {
  const summary = buildTemplateDescription({ name: 'Test Radio', state: ' Austria ', country: 'austria',
    tags: 'news; talk, news', bitrate: NaN });
  assert.match(summary.full, /Catalogue region: Austria\./);
  assert.match(summary.full, /Catalogue tags: news, talk\./);
  assert.doesNotMatch(summary.full, /Austria, austria|NaN|stream format/);
});

test('only absolute credential-free HTTP websites are described', () => {
  for (const homepage of ['javascript:alert(1)', '/relative', 'https://user:secret@example.test/', 'data:text/html,x']) {
    assert.doesNotMatch(buildTemplateDescription({ name: 'Test Radio', homepage }).full, /website|secret|alert/);
  }
});

test('operational votes do not rewrite a catalogue summary', () => {
  const station = { name: 'Test Radio', country: 'Turkey', tags: 'pop' };
  assert.deepEqual(buildTemplateDescription({ ...station, votes: 1 }), buildTemplateDescription({ ...station, votes: 100001 }));
});

test('missing English uses the same factual fallback for the visible article and SEO metadata', () => {
  const station = { name: 'Sunrise', country: 'Austria', countryCode: 'AT', url: 'https://example.invalid/live', slug: 'sunrise' };
  const template = buildTemplateDescription(station);
  for (const descriptions of [undefined, {}, { en: { full: ' ', meta: null } }, { en: { full: 42, meta: false } }]) {
    const row = { ...station, descriptions };
    assert.equal(getLocalizedStationDescription(row, 'en', {}), template.full);
    assert.equal(getStationMetaDescription(row, 'en', {}), template.meta);
    assert.ok(getIndexableLanguagesForStation(row).includes('en'), '13 absent translations do not exclude English');
  }
  const curated = { ...station, descriptions: { en: { full: 'Curated English prose.', meta: 'Curated metadata.' } } };
  assert.equal(getLocalizedStationDescription(curated, 'en', {}), 'Curated English prose.');
  assert.equal(getStationMetaDescription(curated, 'en', {}), 'Curated metadata.');
});

test('template persistence fills individual blank fields and never replaces valid or manually protected text', () => {
  const station = { name: 'Sunrise', country: 'Austria' };
  assert.deepEqual(Object.keys(missingEnglishDescriptionPatch({ ...station, descriptions: { en: { full: 'Existing article.', meta: ' \n' } } })), ['descriptions.en.meta']);
  assert.deepEqual(Object.keys(missingEnglishDescriptionPatch({ ...station, descriptions: { en: { full: false, meta: 'Existing meta.' } } })), ['descriptions.en.full']);
  for (const descriptions of [{ en: 'Legacy article' }, { en: [] }, { en: true }]) {
    assert.deepEqual(missingEnglishDescriptionPatch({ ...station, descriptions }), {});
  }
  assert.deepEqual(missingEnglishDescriptionPatch({ ...station, manualEditFields: { descriptions: true } }), {});
});
