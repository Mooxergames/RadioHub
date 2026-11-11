import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTemplateDescription, selectStationVisibleDescription } from '@workspace/seo-shared/station-description-template';
import { getStationCountryName } from '@workspace/seo-shared/seo-config';

const marker = '[FULL DESCRIPTION - 200-300 words]';
const station = { name: 'Fixture Radio', country: 'Germany', countryCode: 'DE', tags: 'news' };
const english = 'Existing English article.';
const legacy = 'Existing legacy article.';
const local = 'Bestehender lokaler Artikel.';

test('visible article prefers cleaned locale full/string, then legacy, then English full/string', () => {
  for (const entry of [local, { full: local, meta: 'Metadata is not an article.' }]) {
    assert.equal(selectStationVisibleDescription({ ...station, description: legacy,
      descriptions: { de: entry, en: english } }, 'de', 'Germany'), local);
  }
  for (const entry of [undefined, null, false, 42, [], {}, { full: false }, { meta: 'Metadata only.' }, ' \n ', marker]) {
    assert.equal(selectStationVisibleDescription({ ...station, description: ` ${marker}\n${legacy} `,
      descriptions: { de: entry, en: english } }, 'de', 'Germany'), legacy);
    for (const fallback of [english, { full: english }]) {
      assert.equal(selectStationVisibleDescription({ ...station, description: ` \n${marker} \n`,
        descriptions: { de: entry, en: fallback } }, 'de', 'Germany'), english);
    }
  }
  assert.equal(selectStationVisibleDescription({ ...station, description: legacy,
    descriptions: { en: { full: english } } }, 'en', 'Germany'), english);
  assert.equal(selectStationVisibleDescription({ ...station, description: { full: 'Not a legacy string.' },
    descriptions: { en: english } }, 'de', 'Germany'), english);
});

test('every empty, malformed or marker-only candidate falls through to the same factual template in every locale', () => {
  const expected = buildTemplateDescription(station).full;
  for (const language of ['en', 'de', 'tr', 'fr', 'xx']) {
    for (const descriptions of [undefined, null, [], false, 'not a language map', {},
      { [language]: { meta: 'Not visible copy.' } },
      { [language]: { full: ` \n${marker}\n${marker} ` }, en: { full: marker } }]) {
      const row = { ...station, description: marker, descriptions };
      assert.equal(selectStationVisibleDescription(row, language, getStationCountryName(row, 'en')), expected);
    }
  }
  assert.match(expected, /Catalogue region: Germany\./);
  assert.doesNotMatch(expected, /HD|free|popular|listening|Mega Radio/i);
});

test('caller-normalized country is explicit and never inferred from the display locale', () => {
  const row = { name: station.name, country: 'Unknown', countryCode: 'DE' };
  const expected = buildTemplateDescription({ ...row, country: 'Germany' }).full;
  for (const language of ['en', 'de', 'tr']) {
    assert.equal(selectStationVisibleDescription(row, language, getStationCountryName(row, 'en')), expected);
  }
  assert.equal(selectStationVisibleDescription(row, 'de', ''), '', 'an absent accepted country is not inferred again');
});

test('missing records and sparse metadata remain empty without invented content', () => {
  for (const row of [undefined, null, { name: '' }, { name: 'Sparse Radio' },
    { name: 'Sparse Radio', votes: 100000, country: 'Unknown', homepage: 'javascript:alert(1)' }]) {
    for (const language of ['en', 'de', 'tr']) {
      assert.equal(selectStationVisibleDescription(row, language, ''), '');
    }
  }
});

test('article cleanup preserves internal whitespace, literal markup and the entire long tail without escaping or truncation', () => {
  const prose = `${'Station-specific programme information. '.repeat(100)}\n\nLiteral <em>prose</em> & final programme detail.`;
  for (const row of [
    { descriptions: { de: ` \n${marker}\n${prose}\n ` } },
    { description: `${marker} ${prose}` },
    { descriptions: { en: { full: `${marker}\n${prose}` } } },
  ]) {
    assert.equal(selectStationVisibleDescription({ ...station, ...row }, 'de', 'Germany'), prose);
  }
  assert.equal(selectStationVisibleDescription({ ...station, description: `First paragraph.\n${marker}\nLast paragraph.` },
    'de', 'Germany'), `First paragraph.\n${marker}\nLast paragraph.`);
});

test('prior SSR translated, generic description and initial bracket markers are cleaned before choosing each candidate', () => {
  const markers = ['[TRANSLATED FULL DESCRIPTION]', '[TRANSLATED META DESCRIPTION]', '[TRANSLATED META - 155-160 characters]',
    '[FULL DESCRIPTION - 200-300 words]', '[FULL DESCRIPTION]', '[REVIEWED DESCRIPTION - source]', '[Import note]',
    '[translated\tfull\ndescription]', '[SEO META - 155-160 characters]',
    '[Import note]\n[TRANSLATED FULL DESCRIPTION]\n[FULL DESCRIPTION - 200-300 words]'];
  for (const prefix of markers) {
    for (const fields of [
      { descriptions: { de: ` \n${prefix}\n${local} ` }, description: legacy },
      { descriptions: { de: { full: ` \n${prefix}\n${local} ` } }, description: legacy },
      { descriptions: { de: prefix, en: english }, description: ` \n${prefix}\n${local} ` },
      { descriptions: { de: prefix, en: { full: ` \n${prefix}\n${local} ` } }, description: prefix },
    ]) {
      assert.equal(selectStationVisibleDescription({ ...station, ...fields }, 'de', 'Germany'), local);
    }
    assert.equal(selectStationVisibleDescription({ ...station, description: prefix,
      descriptions: { de: prefix, en: english } }, 'de', 'Germany'), english);
    assert.equal(selectStationVisibleDescription({ ...station, description: prefix,
      descriptions: { de: prefix, en: prefix } }, 'de', 'Germany'), buildTemplateDescription(station).full);
  }
});

test('station placeholders use literal callback replacement, including dollar tokens and bracketed names', () => {
  for (const name of ["Cash $& $$ $` $' $1 FM", '[Local] FM']) {
    const prose = `Programme for ${name}. The final detail belongs to ${name}.`;
    const raw = '[TRANSLATED FULL DESCRIPTION] Programme for {STATION_NAME}. The final detail belongs to {STATION_NAME}.';
    for (const fields of [{ descriptions: { de: { full: raw } } }, { description: raw }, { descriptions: { en: raw } }]) {
      assert.equal(selectStationVisibleDescription({ ...station, name, ...fields }, 'de', 'Germany'), prose);
    }
  }
  assert.equal(selectStationVisibleDescription({ name: '', description: '{STATION_NAME}' }, 'de', ''), '');
});

test('whole bracketed prose, broadcaster names and unknown prefixes are never discarded as markers', () => {
  for (const prose of [
    '[A station-specific first paragraph.\n\nThe second paragraph contains reception details.]',
    '[BBC Radio] A broadcaster name is part of this sentence.',
    '[A complete article mentioning [a programme] inside its prose.]',
    '[Unrecognized note] This source must not silently lose its first part.',
  ]) {
    for (const fields of [
      { descriptions: { en: { full: prose } } },
      { descriptions: { de: prose, en: english } },
      { description: prose, descriptions: { en: english } },
    ]) assert.equal(selectStationVisibleDescription({ ...station, ...fields }, 'de', 'Germany'), prose);
  }
});

test('recognized localized import labels are removed without removing a following bracketed article', () => {
  const prose = '[Actual station information stays complete.]';
  for (const marker of ['[Volle Beschreibung]', '[DESCRIPTION COMPLÈTE]', '[DESCRIPCIÓN COMPLETA]',
    '[DESCRIZIONE COMPLETA]', '[DESCRIÇÃO COMPLETA]', '[ПОЛНОЕ ОПИСАНИЕ]', '[الوصف الكامل]']) {
    assert.equal(selectStationVisibleDescription({ ...station, descriptions: { en: marker + prose } }, 'en', 'Germany'), prose);
  }
});

test('whitespace-padded import labels alone fall through to the next valid description', () => {
  for (const marker of ['[ Import note ]', '[FULL DESCRIPTION ]', '[ FULL DESCRIPTION ]']) {
    assert.equal(selectStationVisibleDescription({ ...station, descriptions: { de: marker, en: english } }, 'de', 'Germany'), english);
  }
});

test('whitespace-padded import labels preserve a following genuine bracketed paragraph', () => {
  const prose = '[Actual station information stays complete.]';
  for (const marker of ['[ Import note ]', '[FULL DESCRIPTION ]', '[ FULL DESCRIPTION ]']) {
    assert.equal(selectStationVisibleDescription({ ...station, descriptions: { en: marker + prose } }, 'en', 'Germany'), prose);
  }
});
