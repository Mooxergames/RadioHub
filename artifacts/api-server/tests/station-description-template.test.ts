import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTemplateDescription } from '../src/services/station-description-template';

test('catalogue summaries contain supplied facts without inventing editorial or popularity claims', () => {
  const summary = buildTemplateDescription({ name: 'News Radio', country: 'Austria', state: 'Vienna',
    tags: 'news, talk', language: 'German', votes: 100000, bitrate: 320, codec: 'MP3', homepage: 'https://example.test/' });
  assert.match(summary.full, /News Radio is listed as a radio station in Vienna, Austria/);
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

test('location and tags are not duplicated and invalid numeric facts are omitted', () => {
  const summary = buildTemplateDescription({ name: 'Test Radio', state: ' Austria ', country: 'austria',
    tags: 'news; talk, news', bitrate: NaN });
  assert.match(summary.full, /in Austria\./);
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
