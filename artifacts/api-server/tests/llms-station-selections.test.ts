import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES, getStationCountryName } from '@workspace/seo-shared/seo-config';
import { buildLocalizedUrl } from '../src/seo/url-helpers';
import { EMPTY_LLMS_DISCOVERY, buildLlmsTxtCoreBody, readLlmsStationSelection, renderLlmsTxtBody, type LlmsLocale } from '../src/seo/llms-txt-content';
import copy from '../src/seo/llms-locales.json';
import snapshot from '../src/seo/llms-station-selections.json';

const origin = 'https://themegaradio.com';
function fixture(locale: LlmsLocale = 'en'): any {
  return { verifiedOn: '2026-10-29', selectionBasis: 'directory-votes-editorial-v1', selections: {
    [locale]: Array.from({ length: 40 }, (_, index) => ({ name: `Radio ${index}`, path: buildLocalizedUrl(`/station/radio-${index}`, locale, undefined, new Map()) })),
  } };
}
function assertSelection(body: string, locale: LlmsLocale, base = origin): void {
  const selected = readLlmsStationSelection(locale);
  assert.ok(selected);
  assert.equal(selected.stations.length, 40);
  assert.equal(new Set(selected.stations.map(row => row.path)).size, 40);
  for (const station of selected.stations) assert.equal(body.split(`](${base}${station.path})`).length - 1, 1);
  assert.ok(body.includes(`## ${copy[locale].sections.stations}\n`));
  assert.ok(body.includes(copy[locale].stationSelectionNote));
  assert.ok(body.includes(`${copy[locale].stationSelectionCheckedOn}: ${selected.verifiedOn}`));
}

test('publication snapshot is the verified compact 560-target artifact with only approved metadata', () => {
  const bytes = readFileSync(new URL('../src/seo/llms-station-selections.json', import.meta.url));
  assert.ok(bytes.length < 256 * 1024);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '81f3ec65363e3e98323a6a984fad586d5233c8aebf4eaf97d70f88447a49131e');
  assert.deepEqual(Object.keys(snapshot.selections), [...ACTIVE_SITEMAP_LANGUAGES]);
  assert.equal(Object.values(snapshot.selections).flat().length, 560);
  assert.doesNotMatch(bytes.toString('utf8'), /"(?:url|urlResolved|descriptions|source|votes|id|noIndex|redirectToSlug)"\s*:/);
});

for (const locale of ACTIVE_SITEMAP_LANGUAGES) {
  test(`${locale}: forty publication-verified paths survive pure fallback and empty optional discovery`, () => {
    const body = buildLlmsTxtCoreBody(locale);
    assertSelection(body, locale);
    assert.equal((body.match(/^# /gm) || []).length, 1);
    assert.ok(Buffer.byteLength(body) < 64 * 1024);
    assert.ok(body.indexOf(`## ${copy[locale].sections.browse}`) < body.indexOf(`## ${copy[locale].sections.stations}`));
    assert.ok(body.indexOf(`## ${copy[locale].sections.stations}`) < body.indexOf(`## ${copy[locale].sections.guides}`));
    assert.equal(body, renderLlmsTxtBody(origin, locale, EMPTY_LLMS_DISCOVERY));
    assert.equal(Buffer.from(body).toString('utf8'), body);
    for (const row of readLlmsStationSelection(locale)!.stations) {
      if (row.countryCode) assert.equal(row.country, getStationCountryName(row, locale));
    }
  });

  test(`${locale}: optional route overrides and qualification cannot rewrite the dated selection`, () => {
    const body = renderLlmsTxtBody('https://preview.example.invalid', locale, {
      countries: [], genres: {}, languages: [], translations: new Map([[`${locale}:station`, 'unverified-route']]),
    });
    assertSelection(body, locale, 'https://preview.example.invalid');
    assert.doesNotMatch(body, /unverified-route/);
    assert.ok(readLlmsStationSelection(locale, fixture(locale)));
  });
}

const invalidPaths = [
  '', 'https://evil.example/station/radio', '//evil.example/station/radio', '/tr/istasyon/radio',
  '/en/admin/radio', '/en/stations/radio', '/en/station/', '/en/station/a', '/en/station/Z', '/en/station/0-9',
  '/en/station/1234', '/en/station/-911', '/en/station/.', '/en/station/..', '/en/station/%2e%2e',
  '/en/station/a/b', '/en/station/a%2Fb', '/en/station/a%5Cb', '/en/station/a%252Fb', '/en/station/a\\b',
  '/en/station/a?b', '/en/station/a%3Fb', '/en/station/a#b', '/en/station/a%23b', '/en/station/a%20b',
  '/en/station/a%00b', '/en/station/a\nb', '/en/station/a%ZZb', '/en/station/a)', '/en/station/a[b]',
  '/en/station/a<script>', '/en/station/' + 'x'.repeat(2050),
];
for (const path of invalidPaths) {
  test(`unsafe/non-station identity fails closed: ${JSON.stringify(path.slice(0, 80))}`, () => {
    const input = fixture(); input.selections.en[0].path = path;
    assert.equal(readLlmsStationSelection('en', input), null);
  });
}

test('safe opaque Unicode and reserved UI words keep their encoded station identity', () => {
  for (const slug of ['bbc', 'q2', 'discover', 'profile', 'genres', 'radio-100', 'radyo-türkçe', "station-!*'()"] ) {
    const input = fixture(); input.selections.en[0].path = buildLocalizedUrl(`/station/${slug}`, 'en', undefined, new Map());
    assert.ok(readLlmsStationSelection('en', input), slug);
  }
});

test('schema, date, field, count and duplicate-path corruption omit the section without throwing', () => {
  const corruptions: Array<(input: any) => void> = [
    input => { input.verifiedOn = '2026-02-30'; }, input => { input.verifiedOn = 'today'; },
    input => { input.selectionBasis = 'worldwide-listener-ranking'; }, input => { input.extra = true; },
    input => { input.selections.am = []; }, input => { input.selections.en.pop(); },
    input => { input.selections.en.push(input.selections.en[0]); }, input => { input.selections.en[1].path = input.selections.en[0].path; },
    input => { input.selections.en[0].url = 'https://example.invalid/stream'; }, input => { input.selections.en[0].name = ''; },
    input => { input.selections.en[0].name = 'x'.repeat(241); }, input => { input.selections.en[0].country = 'x'.repeat(121); },
    input => { input.selections.en[0].countryCode = 'UNKNOWN'; }, input => { input.selections.en[0].tags = ['a', 'b', 'c', 'd']; },
    input => { input.selections.en[0].tags = ['x'.repeat(65)]; }, input => { input.selections.en[0] = null; },
  ];
  for (const corrupt of corruptions) { const input = fixture(); corrupt(input); assert.equal(readLlmsStationSelection('en', input), null); }
  for (const input of [null, undefined, [], '', { selections: null }]) {
    if (input !== undefined) assert.equal(readLlmsStationSelection('en', input), null);
  }
  const inherited = fixture(); inherited.selections = Object.create(inherited.selections);
  assert.equal(readLlmsStationSelection('en', inherited), null);
  assert.equal(readLlmsStationSelection('am' as LlmsLocale, fixture()), null);
});

test('snapshot date is immutable and station labels/metadata use the existing Markdown escape path', () => {
  const row = snapshot.selections.en[0];
  const previous = { name: row.name, tags: row.tags };
  try {
    mock.method(Date, 'now', () => Date.parse('2099-01-01T00:00:00Z'));
    row.name = 'Name](https://evil.example/)\n## Injected\n<script>x</script>';
    row.tags = ['tag](https://evil.example/)\n## Another'];
    const body = buildLlmsTxtCoreBody('en');
    assertSelection(body, 'en');
    assert.doesNotMatch(body, /^## (?:Injected|Another)/m);
    assert.doesNotMatch(body, /<script>|(?<!\\)\]\(https:\/\/evil\.example\//);
    assert.ok(body.includes(snapshot.verifiedOn));
    assert.doesNotMatch(body, /2099-01-01/);
  } finally { Object.assign(row, previous); mock.restoreAll(); }
});

test('malformed local station data cannot turn the pure native fallback into a server exception', () => {
  const row = snapshot.selections.en[0];
  const previous = row.path;
  try {
    row.path = '//evil.example/station/radio';
    const body = buildLlmsTxtCoreBody('en');
    assert.ok(body.startsWith('# MegaRadio\n'));
    assert.ok(body.includes(copy.en.summary));
    assert.doesNotMatch(body, /## Selected popular radio stations|evil\.example/);
    assert.ok(body.includes('/en/stations'));
  } finally { row.path = previous; }
});
