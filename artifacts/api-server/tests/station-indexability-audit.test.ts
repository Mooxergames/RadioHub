import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { AUDIT_LANGUAGES, auditCsvCell, classifyStationIndexability, createStationAudit, stationAuditCsv, type AuditStation } from '../src/seo/station-indexability-audit';
import { pgAuditStationIndexability } from '../src/data/postgres-indexability-audit';
import { pgAdminDescriptionCoverage } from '../src/data/postgres-admin-catalog-store';
import { adminDescriptionFilterSql } from '../src/data/station-description-sql';

const full = Object.fromEntries(AUDIT_LANGUAGES.map(lang => [lang, { full: 'Article', meta: 'Summary' }]));
const station = (patch: Partial<AuditStation> = {}): AuditStation => ({ _id: 'station-a', name: 'Example Radio', slug: 'example-radio', url: 'https://example.invalid/audio', descriptions: full, ...patch });

test('exclusion precedence accounts for every row exactly once in all fourteen languages', () => {
  const audit = createStationAudit(AUDIT_LANGUAGES, '2026-09-17T00:00:00Z');
  const owned = { owner: 'radiohub-junk-policy', version: 1, active: true, reason: 'stream-dead-30d' };
  const cases: Array<[Partial<AuditStation>, string | null]> = [
    [{ slug: null, noIndex: true }, 'missing-slug'],
    [{ redirectToSlug: 'winner', noIndex: true, manualEditFields: { noIndex: true } }, 'duplicate-redirect'],
    [{ noIndex: true, manualEditFields: { noIndex: true }, automaticNoIndex: owned }, 'manual-noindex'],
    [{ noIndex: true, automaticNoIndex: owned }, 'automatic-health-noindex'],
    [{ noIndex: true, automaticNoIndex: { ...owned, reason: 'duplicate-of:winner' } }, 'automatic-other-noindex'],
    [{ noIndex: true, lastCheckOk: false }, 'legacy-unknown-noindex'],
    [{ slug: '1234' }, 'numeric-slug'],
    [{ name: '' }, 'junk:empty-name'],
    [{ url: '' }, 'junk:empty-stream-url'],
    [{ lastCheckOk: false }, null],
  ];
  for (const [patch, reason] of cases) assert.equal(audit.consume(station(patch)).reason, reason);
  assert.equal(audit.report.total, 10);
  assert.equal(Object.values(audit.report.reasons).reduce((a, b) => a + b, 0), 10);
  for (const language of audit.report.languages) {
    assert.equal(language.indexable, 1); assert.equal(language.excluded, 9);
    assert.equal(language.indexable + Object.values(language.exclusions).reduce((a, b) => a + b, 0), 10);
  }
});

test('reviews unknown flags without adopting them; manual, redirect and current junk never become candidates', () => {
  assert.equal(classifyStationIndexability(station({ noIndex: true, lastCheckOk: false })).reviewReason, 'unknown-flag-without-current-quality-rule');
  for (const patch of [{ manualEditFields: { noIndex: true } }, { redirectToSlug: 'canonical' }, { name: '' }, { slug: '-911' }]) {
    assert.equal(classifyStationIndexability(station({ noIndex: true, ...patch })).reviewReason, null);
  }
  const input = station({ noIndex: true }); const before = structuredClone(input);
  classifyStationIndexability(input); assert.deepEqual(input, before);
});

test('fourteen keys do not prove descriptions are complete, and native eligibility is independent of missing content', () => {
  const descriptions = { ...full, tr: { full: ' \t\n', meta: 'Summary' }, de: { full: 'Article', meta: '' } };
  const result = classifyStationIndexability(station({ descriptions }));
  assert.deepEqual(result.missingFull, ['tr']); assert.deepEqual(result.missingMeta, ['de']);
  const audit = createStationAudit(AUDIT_LANGUAGES, 'now');
  audit.consume(station({ countryCode: 'TR', descriptions: {} }));
  assert.equal(audit.report.languages.find(row => row.language === 'en')!.indexable, 1);
  assert.equal(audit.report.languages.find(row => row.language === 'tr')!.indexable, 1);
  assert.equal(audit.report.languages.find(row => row.language === 'ja')!.localeIneligible, 1);
  assert.equal(audit.report.languages.find(row => row.language === 'en')!.incomplete, 1);
});

test('unqualified languages and bounded review samples are explicit', () => {
  const audit = createStationAudit(['en'], 'now');
  audit.consume(station());
  for (let i = 0; i < 30; i++) audit.consume(station({ _id: String(i), noIndex: true }));
  assert.equal(audit.report.languages.find(row => row.language === 'ja')!.unqualified, 1);
  assert.equal(audit.report.reviewCandidates['unknown-flag-without-current-quality-rule'], 30);
  assert.equal(audit.report.samples.length, 5);
});

test('CSV escapes formulas, newlines and quotes and contains compact review evidence only', () => {
  assert.equal(auditCsvCell(' =HYPERLINK("bad")'), '"\' =HYPERLINK(""bad"")"');
  const input = station({ name: 'Radio, "A"\nB', noIndex: true });
  const csv = stationAuditCsv(input, classifyStationIndexability(input));
  assert.ok(csv.includes('"Radio, ""A""\nB"'));
  assert.ok(csv.includes('legacy-unknown-noindex'));
  assert.ok(!csv.includes('Article')); assert.ok(!csv.includes('https://example.invalid/audio'));
});

function fakePool(batches: AuditStation[][], lock = true) {
  const queries: string[] = []; let released = false; let discarded = false;
  const client = Object.assign(new EventEmitter(), { async query(sql: string) {
    queries.push(sql);
    if (sql.includes('pg_try_advisory')) return { rows: [{ acquired: lock }] };
    if (sql.includes('transaction_timestamp')) return { rows: [{ at: '2026-09-17T00:00:00Z' }] };
    if (sql.startsWith('FETCH')) return { rows: batches.shift() || [] };
    if (sql.startsWith('SELECT language')) return { rows: [{ language: 'en', total_urls: 48707, generated_at: '2026-09-16T00:00:00Z' }] };
    return { rows: [] };
  }, release(discard?: boolean) { released = true; discarded = discard === true; } });
  return { pool: { connect: async () => client } as any, client, queries, released: () => released, discarded: () => discarded };
}

test('full audit consumes bounded cursor pages in one read-only snapshot and commits complete counts', async () => {
  const fixture = fakePool([Array.from({ length: 500 }, () => station()), Array.from({ length: 17 }, () => station())]);
  const result = await pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES }, fixture.pool);
  assert.equal(result.total, 517); assert.equal(result.languages[0].publishedUrls, 48707);
  assert.equal(fixture.queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(fixture.queries.filter(query => query.startsWith('FETCH FORWARD 500')).length, 3);
  const projection = fixture.queries.find(query => query.startsWith('DECLARE'))!;
  assert.doesNotMatch(projection, /SELECT s\.\*|s\.descriptions\s+AS|s\.source\s*[, ]/);
  assert.match(projection, /jsonb_object_agg/);
  assert.match(projection, /LEFT JOIN station_description_summary summary ON summary.station_id=s.id/);
  assert.match(projection, /CASE WHEN summary.station_id IS NOT NULL THEN jsonb_build_object/);
  assert.equal(projection.match(/s\.source->'automaticNoIndex'/g)?.length, 1);
  for (const [index, language] of AUDIT_LANGUAGES.entries()) {
    assert.ok(projection.includes(`'${language}',jsonb_build_object('full',CASE WHEN (summary.full_mask & ${1 << index})<>0`));
  }
  assert.equal(fixture.queries.at(-1), 'COMMIT'); assert.equal(fixture.released(), true);
});

test('native audit uses transactional description masks and falls back for a missing summary without dropping the station',
  { skip: !process.env.PG_TEST_DATABASE_URL }, async () => {
    const { createNativePostgresFixture } = await import('./helpers/native-postgres-fixture');
    const fixture = await createNativePostgresFixture('indexability_audit');
    try {
      const descriptions = structuredClone(full);
      descriptions.en.full = 'Retained information '.repeat(10_000);
      descriptions.de.meta = ' \t\u00a0\ufeff';
      const inputs = [
        { _id: 'complete', name: 'Complete Radio', slug: 'complete-radio', url: 'https://example.invalid/complete', descriptions: full },
        { _id: 'legacy', name: 'Legacy Radio', slug: 'legacy-radio', url: 'https://example.invalid/legacy', noIndex: true, descriptions },
        { _id: 'missing-summary', name: 'Missing Summary', slug: 'missing-summary', url: 'https://example.invalid/missing', descriptions: full },
      ];
      for (const input of inputs) await fixture.insert('stations', { stationuuid: randomUUID(), noIndex: false, ...input });
      const native = await pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES }, fixture.pool);
      assert.equal(native.total, 3);
      assert.equal(native.reasons['legacy-unknown-noindex'], 1);
      assert.equal(native.languages.find(row => row.language === 'de')?.missingMeta, 1);
      assert.equal(native.languages.find(row => row.language === 'en')?.missingFull, 0);

      const queries: string[] = [];
      const recordingPool = { connect: async () => {
        const client = await fixture.pool.connect();
        return { on: client.on.bind(client), removeListener: client.removeListener.bind(client), release: client.release.bind(client),
          query: (sql: string) => { queries.push(sql); return client.query(sql); } };
      } };
      await pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES }, recordingPool as any);
      const declaration = queries.find(sql => sql.startsWith('DECLARE station_indexability_audit'))!;
      const select = declaration.slice(declaration.indexOf('SELECT'));
      const plan = (await fixture.pool.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${select}`)).rows[0]['QUERY PLAN'][0].Plan;
      const subplans: any[] = [];
      const visit = (node: any) => {
        if (node['Subplan Name']) subplans.push(node);
        for (const child of node.Plans || []) visit(child);
      };
      visit(plan);
      assert.ok(subplans.length, 'raw-article fallback remains available');
      assert.ok(subplans.every(node => node['Actual Loops'] === 0), 'normal rows never expand the retained article JSON');

      await fixture.pool.query("DELETE FROM station_description_summary WHERE station_id='missing-summary'");
      const fallback = await pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES }, fixture.pool);
      assert.equal(fallback.total, 3);
      assert.deepEqual(fallback.languages, native.languages);
      assert.deepEqual(fallback.reasons, native.reasons);
      await fixture.pool.query("UPDATE stations SET descriptions=jsonb_set(descriptions,'{de,meta}','\"Edited summary\"'::jsonb) WHERE id='legacy'");
      const updated = await pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES }, fixture.pool);
      assert.equal(updated.languages.find(row => row.language === 'de')?.missingMeta, 0);
    } finally { await fixture.close(); }
  });

test('busy, aborted and failed exports roll back and release their client', async () => {
  const busy = fakePool([], false);
  await assert.rejects(pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES }, busy.pool), { code: 'AUDIT_BUSY' });
  const controller = new AbortController(); controller.abort();
  const aborted = fakePool([]);
  await assert.rejects(pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES, signal: controller.signal }, aborted.pool), { code: 'AUDIT_INTERRUPTED' });
  const broken = fakePool([[station()]]);
  await assert.rejects(pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES, onStation: async () => { throw new Error('download closed'); } }, broken.pool), /download closed/);
  for (const fixture of [busy, aborted, broken]) { assert.equal(fixture.queries.at(-1), 'ROLLBACK'); assert.equal(fixture.released(), true); }
});

test('description coverage uses one aggregate and missing-language filters validate both fields', async () => {
  const queries: any[] = [];
  const row = { total: 3, indexable: 2, ...Object.fromEntries(AUDIT_LANGUAGES.flatMap(lang => [[`${lang}_full`, 2], [`${lang}_meta`, 1], [`${lang}_complete`, 1]])) };
  const result = await pgAdminDescriptionCoverage({ query: async (query: any) => { queries.push(query); return { rows: [row] }; } } as any);
  assert.equal(queries.length, 1); assert.equal(result.languages.length, 14);
  assert.match(queries[0].text, /JOIN station_description_summary/);
  assert.doesNotMatch(queries[0].text, /s\.descriptions|jsonb_each/);
  assert.deepEqual(result.languages[0], { language: 'en', withFull: 2, withMeta: 1, withComplete: 1, missingFull: 1, missingMeta: 2, missingComplete: 2, pctFull: 66.7, pctComplete: 33.3 });
  assert.match(adminDescriptionFilterSql('partial'), /d.full_mask & d.meta_mask/);
  assert.match(adminDescriptionFilterSql('partial'), /<>16383$/);
  assert.doesNotMatch(adminDescriptionFilterSql('partial'), /jsonb_object_keys|BETWEEN 1/);
});

test('connection loss during stalled CSV output aborts the wait and discards the client without an unhandled error', async () => {
  for (const event of ['error', 'end']) {
    const fixture = fakePool([[station()]]);
    const output = new EventEmitter();
    await assert.rejects(pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES,
      onStation: async (_station, _decision, signal) => {
        setImmediate(() => fixture.client.emit(event, new Error('backend idle timeout')));
        await once(output, 'drain', { signal });
      },
    }, fixture.pool), { name: 'AbortError' });
    assert.equal(fixture.released(), true); assert.equal(fixture.discarded(), true);
    assert.equal(fixture.queries.includes('ROLLBACK'), false);
    assert.equal(fixture.client.listenerCount('error'), 0); assert.equal(fixture.client.listenerCount('end'), 0);
    assert.equal(output.listenerCount('drain'), 0);
  }
});

test('failed rollback discards the connection and preserves the original failure', async () => {
  const fixture = fakePool([[station()]]);
  const query = fixture.client.query.bind(fixture.client);
  fixture.client.query = async sql => { if (sql === 'ROLLBACK') throw new Error('rollback unavailable'); return query(sql); };
  await assert.rejects(pgAuditStationIndexability({ qualifiedLanguages: AUDIT_LANGUAGES,
    onStation: async () => { throw new Error('download closed'); },
  }, fixture.pool), /download closed/);
  assert.equal(fixture.discarded(), true); assert.equal(fixture.client.listenerCount('error'), 0);
});
