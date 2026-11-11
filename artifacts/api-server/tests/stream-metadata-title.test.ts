import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseArtistTitle} from '../src/services/stream-metadata';

test('ICY parser preserves full multi-segment and single-character song titles',()=>{
 assert.deepEqual(parseArtistTitle('Artist - Song - Live at Home'),{artist:'Artist',title:'Song - Live at Home'});
 assert.deepEqual(parseArtistTitle('爱'),{title:'爱'});
 assert.deepEqual(parseArtistTitle('U'),{title:'U'});
 assert.deepEqual(parseArtistTitle('  '),{});
 assert.deepEqual(parseArtistTitle('Berglind - Dreck Dieser Welt | FM4 OKFM4'),{artist:'Berglind',title:'Dreck Dieser Welt | FM4 OKFM4'});
});
