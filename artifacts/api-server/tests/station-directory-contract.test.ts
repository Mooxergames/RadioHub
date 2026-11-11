import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStationDirectoryData, isStationDirectoryPath, type StationDirectoryData } from '@workspace/seo-shared/station-directory';

const fixture = (): StationDirectoryData => ({
  h1: 'All Radio Stations - Z', letter: 'z', currentPage: 2, totalPages: 3,
  navLabel: 'Radio stations A to Z', paginationLabel: 'Pagination',
  stations: [{ href: '/en/station/z-fm', name: 'Z FM', logoUrl: '/station-logos/z-fm/logo.webp', alt: 'Z FM logo' }],
  letters: [...'abcdefghijklmnopqrstuvwxyz', '0-9'].map(key => ({ href: '/en/stations/' + key, label: key.toUpperCase(), current: key === 'z' })),
  pages: [{ href: '/en/stations/z', page: 1, current: false, rel: 'prev' },
    { href: '/en/stations/z?page=2', page: 2, current: true },
    { href: '/en/stations/z?page=3', page: 3, current: false, rel: 'next' }],
});

test('shared route predicate keeps the directory/detail boundary narrow', () => {
  for (const path of ['/stations', '/stations/a', '/station/z', '/stations/0-9']) assert.ok(isStationDirectoryPath(path));
  for (const path of ['/station', '/radios', '/stations/z-fm', '/station/z-fm', '/stations/z/extra', '/stations/12']) assert.equal(isStationDirectoryPath(path), false);
});

test('shared DTO validator accepts real empty first pages and page numbers beyond50', () => {
  assert.ok(isStationDirectoryData(fixture()));
  assert.ok(isStationDirectoryData({ ...fixture(), currentPage: 51, totalPages: 1000 }));
  assert.ok(isStationDirectoryData({ ...fixture(), stations: [], currentPage: 1, totalPages: 1 }));
});

test('missing, malformed, unsafe and oversized payloads cannot become a successful empty directory', () => {
  const base = fixture();
  for (const invalid of [null, {}, { ...base, stations: undefined }, { ...base, currentPage: 0 },
    { ...base, totalPages: 1 }, { ...base, currentPage: '2' }, { ...base, letters: [] },
    { ...base, stations: Array(61).fill(base.stations[0]) }, { ...base, pages: Array(51).fill(base.pages[0]) },
    ...['javascript:alert(1)', '//evil.invalid/radio', '/\\evil.invalid/radio', '/en/\nradio'].map(href => ({ ...base, stations: [{ ...base.stations[0], href }] })),
    { ...base, stations: [{ ...base.stations[0], logoUrl: 'javascript:alert(1)' }] },
    { ...base, stations: [{ ...base.stations[0], name: '' }] }]) assert.equal(isStationDirectoryData(invalid), false);
});
