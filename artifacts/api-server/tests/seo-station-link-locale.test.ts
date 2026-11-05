import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { collectStationLinkTargets, resolveStationLinkLanguages, buildStationLinkUrl,
  SSR_STATION_LINK_LIMIT, type StationLinkMetadata } from '../src/seo/station-link-locale';

const station: StationLinkMetadata = { _id: 'fixture', slug: 'fixture-radio', name: 'Fixture Radio',
  url: 'https://stream.invalid/live', countryCode: 'US', completeDescriptionLanguages: [] };
const resolve = (row: StationLinkMetadata, language = 'de', qualified: readonly string[] = ACTIVE_SITEMAP_LANGUAGES) =>
  resolveStationLinkLanguages([station], [row], language, qualified);
const url = (row: StationLinkMetadata, language = 'de') => buildStationLinkUrl(station, language, resolve(row, language), new Map());

test('only trusted complete descriptions, native country or broadcast ISO languages preserve a non-English locale', () => {
  assert.equal(url(station), '/en/station/fixture-radio');
  assert.equal(url({ ...station, countryCode: 'AT' }), '/de/sender/fixture-radio');
  assert.equal(url({ ...station, languageCodes: 'de,en' }), '/de/sender/fixture-radio');
  assert.equal(url({ ...station, completeDescriptionLanguages: ['de'] }), '/de/sender/fixture-radio');
  assert.equal(url({ ...station, language: 'German' } as any), '/en/station/fixture-radio');
  assert.equal(url({ ...station, descriptions: { de: { full: 'Card prose', meta: 'Card meta' } } } as any),
    '/en/station/fixture-radio', 'Card/provider descriptions are not the SQL presence projection');
});

test('all fourteen eligible locales are retained, and route-word/Unicode station slugs are never translated', () => {
  for (const language of ACTIVE_SITEMAP_LANGUAGES) {
    const row = { ...station, completeDescriptionLanguages: [...ACTIVE_SITEMAP_LANGUAGES] };
    assert.equal(resolve(row, language).fixture.language, language);
  }
  for (const slug of ['genres', 'radio-\u00e9toile']) {
    const target = { ...station, slug, completeDescriptionLanguages: ['de'] };
    const languages = resolveStationLinkLanguages([target], [target], 'de', ACTIVE_SITEMAP_LANGUAGES);
    assert.equal(buildStationLinkUrl(target, 'de', languages, new Map([['de:genres', 'genres-translated']])),
      '/de/sender/' + encodeURIComponent(slug));
  }
});

test('unqualified, noindex, redirects, numeric slugs and actual junk never acquire fabricated eligibility', () => {
  assert.equal(resolve({ ...station, completeDescriptionLanguages: ['de'] }, 'de', ['en']).fixture.language, 'en');
  for (const row of [
    { ...station, noIndex: true }, { ...station, redirectToSlug: 'other-radio' },
    { ...station, name: '' }, { ...station, url: '' },
  ]) assert.deepEqual(Object.keys(resolve(row)), []);
  for (const slug of ['1234', '-42', 'audio-test-feed']) {
    const row = { ...station, slug };
    assert.deepEqual(Object.keys(resolveStationLinkLanguages([row], [row], 'de', ACTIVE_SITEMAP_LANGUAGES)), []);
  }
  assert.deepEqual(Object.keys(resolve(station, 'de', [])), []);
});

test('missing rows/projections, mismatched identities or changed slugs remain unknown, not assumed English', () => {
  for (const row of [undefined, { ...station, _id: 'other-id' }, { ...station, slug: 'renamed' },
    { ...station, completeDescriptionLanguages: undefined }, { ...station, completeDescriptionLanguages: 'de' },
    { ...station, completeDescriptionLanguages: [1] }]) {
    const languages = resolveStationLinkLanguages([station], row ? [row as any] : [], 'de', ACTIVE_SITEMAP_LANGUAGES);
    assert.equal(buildStationLinkUrl(station, 'de', languages, new Map()), '/de/sender/fixture-radio');
  }
  for (const languages of [undefined, {}]) {
    assert.equal(buildStationLinkUrl({ _id: 'fixture-id-only' }, 'de', languages, new Map()),
      '/de/sender/fixture-id-only', 'An ID-only legacy card without a locale decision remains usable');
  }
});

test('the target collector reads only actual directory catalog rows, skips incomplete identities and caps the batch', () => {
  const rows = Array.from({ length: 110 }, (_, i) => ({ _id: `row-${i}`, slug: `radio-${i}` }));
  const data = { popularStations: [{ _id: 'popular-only', slug: 'popular-only' }], catalogStations: [station, null, { slug: 'missing-id' }, station, ...rows],
    crossLinks: { samePublisher: [rows[1]], sameCity: [rows[2]], sameGenre: [rows[3]], sameCountry: rows } };
  const targets = collectStationLinkTargets(data);
  assert.equal(targets.length, SSR_STATION_LINK_LIMIT);
  assert.deepEqual(targets.slice(0, 5), [station, ...rows.slice(0, 4)]);
  assert.equal(new Set(targets.map(row => row._id)).size, SSR_STATION_LINK_LIMIT);
  assert.ok(!targets.some(row => row._id === 'popular-only'));
  assert.deepEqual(collectStationLinkTargets({ popularStations: [station], crossLinks: { sameCountry: [station] } }), []);
  assert.deepEqual(collectStationLinkTargets({}), []);
});
