import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stationSearchKey,stationSearchSql,stationSearchTerms} from '../src/utils/station-search';

test('fold accepts joined names, accented/Turkish case and non-Latin scripts',()=>{
 assert.equal(stationSearchKey('VİYANA FM'),'viyanafm');
 assert.equal(stationSearchKey('ŞİRAN'),'siran');assert.equal(stationSearchKey('Straße'),'strasse');
 assert.equal(stationSearchKey('Радио Максимум'),'радиомаксимум');
});
test('synonyms expand the original name instead of replacing it',()=>{
 const terms=stationSearchTerms('Viyana FM');
 assert.equal(terms.text,'Viyana FM');assert.ok(terms.words[0].alternatives.includes('Viyana'));
 assert.ok(terms.words[0].alternatives.includes('vienna'));assert.ok(terms.words[0].alternatives.includes('wien'));
 assert.ok(stationSearchTerms('vienna').words[0].alternatives.includes('viyana'));
});
test('parameterized name matching, literal wildcards, bounded query work and no one-letter catalog dump',()=>{
 const values:unknown[]=[];const bind=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 const result=stationSearchSql('radyo maximum',bind);
 assert.ok(result.where.includes(' AND '));assert.match(result.order,/THEN 800/);assert.match(result.where,/station_search_key\(name\)/);
 const raw:unknown[]=[];const injection="maximum%' OR 1=1 --";
 const sql=stationSearchSql(injection,v=>{raw.push(v);return `$${raw.length}`;});
 assert.ok(!sql.where.includes(injection));assert.ok(!sql.where.includes('station_search_key(name)'));
 assert.ok(raw.some(v=>Array.isArray(v)&&v.some(s=>String(s).includes('\\%'))));
 assert.equal(stationSearchSql('x',bind).where,'FALSE');assert.ok(stationSearchTerms('x '.repeat(100)).words.length<=8);
});
