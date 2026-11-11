import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let calls: { text: string; values?: any[] }[] = [];
let ready = true, total: any = '121', fail = '', releases = 0;
const client = {
  query: async (text: string, values?: any[]) => {
    calls.push({ text, values });
    if (fail && text.startsWith(fail)) throw new Error('temporary database failure');
    if (text.startsWith('SELECT EXISTS')) return { rows: [{ ready }] };
    if (text.startsWith('SELECT count')) return { rows: [{ total }] };
    if (text.startsWith('SELECT s.*')) return { rows: [{ id: 'native', slug: 'z100', name: 'Native FM', source: { custom: 7, slug: 'stale' }, is_list_visible: true }] };
    return { rows: [] };
  },
  release: () => { releases++; },
};
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => ({ connect: async () => client }) } });
const { readAzStationPage } = await import('../src/data/postgres-az-station-store');
beforeEach(() => { calls = []; ready = true; total = '121'; fail = ''; releases = 0; });

test('fixed binary bounds, shared predicate, id tie-breaker and native catalogShape within the private read budget', async () => {
  const page = await readAzStationPage('z', 2, 60);
  assert.equal(page.total, 121);
  assert.equal(page.docs[0]._id, 'native');
  assert.equal(page.docs[0].slug, 'z100');
  assert.equal(page.docs[0].custom, 7);
  assert.deepEqual(calls.slice(0, 3).map(call => call.text), ['BEGIN READ ONLY', "SET LOCAL statement_timeout = '4000ms'", 'LOCK TABLE stations IN ACCESS SHARE MODE']);
  const gate = calls[3].text;
  for (const field of ['pg_catalog.pg_index', 'indisvalid', 'indisready', 'indislive', 'indkey[0]', 'indkey[1]', 'indcollation[0]', 'indcollation[1]', 'indoption[0]', 'indoption[1]', 'text_ops', 'indpred IS NULL', 'indexprs IS NULL', 'indnatts=2', "to_regclass('stations')"]) assert.ok(gate.includes(field), field);
  assert.doesNotMatch(gate, /pg_get_indexdef/);
  const count = calls[4], rows = calls[5];
  assert.equal(count.text.split(' WHERE ')[1], rows.text.split(' WHERE ')[1].split('\n      ORDER BY')[0]);
  assert.match(count.text, /s.slug COLLATE "C" >= \$1::text AND s.slug COLLATE "C" < \$2::text/);
  assert.match(count.text, /s.no_index <> true OR s.no_index IS NULL/);
  assert.doesNotMatch(count.text, /last_check_ok/);
  assert.match(rows.text, /ORDER BY s.slug COLLATE "C" ASC NULLS LAST, s.id ASC NULLS LAST LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(count.values, ['z', '{']);
  assert.deepEqual(rows.values, ['z', '{', 60, 60]);
  assert.equal(calls.at(-1)?.text, 'COMMIT'); assert.equal(releases, 1);
});

test('only the exact 27 keys and bounded positive safe integers are accepted before even acquiring a client', async () => {
  for (const key of ['', 'Z', 'aa', '0', ':', '{', 'a\n', 'z"; DROP TABLE stations', null, undefined]) {
    await assert.rejects(readAzStationPage(key as any, 1, 60), RangeError);
  }
  for (const number of [0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined]) {
    await assert.rejects(readAzStationPage('a', number as any, 60), RangeError);
    await assert.rejects(readAzStationPage('a', 1, number as any), RangeError);
  }
  await assert.rejects(readAzStationPage('a', 1, 61), RangeError);
  assert.deepEqual(calls, []); assert.equal(releases, 0);
});

test('empty, beyond-last and huge valid pages count but never issue rows/OFFSET', async () => {
  for (const [count, page] of [['0', 1], ['120', 3], ['121', 4], ['121', Number.MAX_SAFE_INTEGER]] as const) {
    calls = []; total = count;
    assert.deepEqual(await readAzStationPage('0-9', page, 60), { docs: [], total: Number(count) });
    assert.equal(calls.filter(call => call.text.startsWith('SELECT count')).length, 1);
    assert.ok(!calls.some(call => call.text.includes('OFFSET')));
    assert.deepEqual(calls.find(call => call.text.startsWith('SELECT count'))?.values, ['0', ':']);
  }
});

test('preflight is rechecked, not cached across changed index/pool/schema state, and fails closed before both range queries', async () => {
  await readAzStationPage('a', 1, 60);
  calls = []; ready = false;
  await assert.rejects(readAzStationPage('a', 1, 60), { code: 'AZ_INDEX_NOT_READY', retryable: true });
  assert.ok(!calls.some(call => /SELECT (?:count|s\.\*)/.test(call.text)));
  assert.equal(calls.at(-1)?.text, 'ROLLBACK'); assert.equal(releases, 2);
  ready = true;
  assert.equal((await readAzStationPage('a', 1, 60)).total, 121);
});

test('gate/count/rows/commit failures propagate, roll back and always release; unsafe totals refuse rows', async () => {
  for (const prefix of ['SELECT EXISTS', 'SELECT count', 'SELECT s.*', 'COMMIT']) {
    calls = []; fail = prefix;
    await assert.rejects(readAzStationPage('z', 1, 60), /temporary database failure/);
    assert.equal(calls.at(-1)?.text, 'ROLLBACK');
  }
  fail = '';
  for (const count of ['-1', '1.5', '9007199254740992', undefined, 'oops']) {
    total = count; calls = [];
    await assert.rejects(readAzStationPage('z', 1, 60), /Invalid A-Z station count/);
    assert.ok(!calls.some(call => call.text.startsWith('SELECT s.*')));
  }
  assert.equal(releases, 9);
});
