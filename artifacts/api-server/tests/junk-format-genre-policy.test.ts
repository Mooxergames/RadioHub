import assert from 'node:assert/strict';
import { test } from 'node:test';
import { automaticNoIndexPatch, evaluateJunkStation, getIndexableLanguagesForStation } from '../src/seo/junk-station-rules';

test('delivery formats, bitrates and music genres are not standalone evidence of junk', () => {
  for (const [name, slug] of [
    ['NRJ Hits Remix', 'nrj-hits-remix'], ['Radio Record Phonk', 'radio-record-phonk'],
    ['Life Radio Non Stop Music', 'life-radio-non-stop-music'], ['Rainwave OC Remix', 'rainwave-oc-remix'],
    ['Mallorca 1 DAB+', 'mallorca-1-dab'], ['Radio MP3', 'radio-mp3'], ['Radio AAC', 'radio-aac'],
    ['Radio FLAC', 'radio-flac'], ['Radio 128', 'radio-128'], ['Radio 256', 'radio-256'],
  ]) {
    const station = { name, slug, url: 'https://example.invalid/live', countryCode: 'GB' };
    assert.deepEqual(evaluateJunkStation(station), { isJunk: false });
    assert.deepEqual(automaticNoIndexPatch(station, evaluateJunkStation(station)), {});
    assert.deepEqual(getIndexableLanguagesForStation(station, ['en']), ['en']);
    assert.deepEqual(getIndexableLanguagesForStation({ ...station, noIndex: true }, ['en']), []);
    assert.deepEqual(getIndexableLanguagesForStation({ ...station, redirectToSlug: 'canonical' }, ['en']), []);
    assert.deepEqual(automaticNoIndexPatch({ ...station, noIndex: true }, { isJunk: false }), {}, 'legacy flags never clear implicitly');
  }
});

test('actual test signals, missing identity and missing stream stay excluded', () => {
  for (const station of [
    { name: '', slug: 'empty', url: 'https://example.invalid' },
    { name: 'Radio MP3', slug: 'radio-mp3', url: '' },
    { name: 'Test Stream MP3', slug: 'test-stream-mp3', url: 'https://example.invalid' },
    { name: '彩条测试', slug: 'cai-tiao-ce-shi', url: 'https://example.invalid' },
  ]) assert.equal(evaluateJunkStation(station).isJunk, true);
});
