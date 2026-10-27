import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { buildLocalizedUrl } from '../src/seo/url-helpers';
import { readAzStationPage } from '../src/data/postgres-az-station-store';
import { AZ_INDEX_KEYS } from '../src/seo/az-station-index';
import { createNativePostgresFixture, type NativePostgresFixture } from './helpers/native-postgres-fixture';

const url = process.env.PG_TEST_DATABASE_URL;
// Native reader/renderer integration without Redis, metadata or translation
// dependencies. Cache behavior is tested with real cache classes separately.
mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: () => undefined, setPageData: () => {}, getTranslations: () => ({}), getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/public-station-cache', { namedExports: { publicStationCache: {
  getOrSetSingleFlight: async (_key: string, read: () => Promise<any>) => read(),
} } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/data/postgres-localization-store', { namedExports: { pgLocalization: () => ({ getTranslations: async () => ({}) }) } });
mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES] } });
describe('native A-Z reader and migration (explicit disposable PostgreSQL only)', { skip: !url }, () => {
  let fixture: NativePostgresFixture;
  const migrationUrl = new URL('../../../lib/db/migrations/0045_station_az_slug_c_index.sql', import.meta.url);
  let migration: string;
  const expected: { id: string; slug: string | null; eligible: boolean }[] = [];
  const extra = [
    { slug: 'a' }, { slug: 'z' }, { slug: '0' }, { slug: '9' }, { slug: ':' }, { slug: '{' },
    { slug: '' }, { slug: null }, { slug: 'Z100' }, { slug: 'A100' }, { slug: '\u00e9radio' },
    { slug: '\u4e2dradio' }, { slug: 'z\u00e9radio' }, { slug: '9\u00e9radio' }, { slug: '/' },
    { slug: 'z-hidden', visible: false }, { slug: 'z-noindex', noIndex: true },
    { slug: 'z-null-noindex', noIndex: null }, { slug: 'z-provider-failed', healthy: false },
    { slug: 'z-expired', visible: false, expiry: '2000-01-01T00:00:00Z' },
    { slug: 'z-future', visible: false, expiry: '2999-01-01T00:00:00Z' },
    { slug: 'z-visible-future', expiry: '2999-01-01T00:00:00Z' },
  ];
  before(async () => {
    const parsed = new URL(url!);
    assert.equal(parsed.hostname, '127.0.0.1', 'literal loopback fixture only');
    assert.match(parsed.pathname, /^\/(?:radiohub_test|az_(?:c|icu)_test)$/);
    assert.equal(parsed.search, '');
    fixture = await createNativePostgresFixture('az');
    migration = await readFile(migrationUrl, 'utf8');
    // Nullable legacy semantics are fixture-only. No production constraint changes.
    await fixture.pool.query('ALTER TABLE stations ALTER COLUMN no_index DROP NOT NULL');
    await fixture.pool.query(`INSERT INTO stations(id,station_uuid,name,slug,url,source)
      SELECT 'letter-'||letter||'-'||lpad(n::text,4,'0'), 'letter-'||letter||'-'||n,
        'Fixture FM', letter||'-'||lpad(n::text,4,'0'), 'https://fixture.invalid/live', '{}'::jsonb
      FROM unnest(string_to_array('a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z',',')) letter
      CROSS JOIN generate_series(1,240) n`);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') for (let n = 1; n <= 240; n++) {
      expected.push({ id: `letter-${letter}-${String(n).padStart(4, '0')}`, slug: `${letter}-${String(n).padStart(4, '0')}`, eligible: true });
    }
    await fixture.pool.query(`INSERT INTO stations(id,station_uuid,name,slug,url)
      SELECT 'digit-'||lpad(n::text,4,'0'), 'digit-'||n, 'Digits FM',
        (n%10)::text||'-'||lpad(n::text,4,'0'), 'https://fixture.invalid/live' FROM generate_series(1,1200) n`);
    for (let n = 1; n <= 1200; n++) expected.push({ id: `digit-${String(n).padStart(4, '0')}`, slug: `${n % 10}-${String(n).padStart(4, '0')}`, eligible: true });
    await fixture.pool.query(`INSERT INTO stations(id,station_uuid,name,slug,url)
      SELECT 'tie-'||lpad(n::text,3,'0'), 'tie-'||n, 'Duplicate Slug FM', 'z-duplicate',
        'https://fixture.invalid/live' FROM generate_series(1,73) n`);
    for (let n = 1; n <= 73; n++) expected.push({ id: `tie-${String(n).padStart(3, '0')}`, slug: 'z-duplicate', eligible: true });
    for (const [n, input] of extra.entries()) {
      const row = input as { slug: string | null; visible?: boolean; noIndex?: boolean | null; healthy?: boolean; expiry?: string };
      const id = `extra-${n}`;
      await fixture.insert('stations', { _id: id, stationuuid: id, name: 'Boundary FM', url: 'https://fixture.invalid/live',
        slug: row.slug, isListVisible: row.visible ?? true, noIndex: row.noIndex === undefined ? false : row.noIndex,
        lastCheckOk: row.healthy ?? true, visibilityExpiresAt: row.expiry ?? null,
        source: { slug: 'stale-source', name: 'Stale source', custom: 42 } });
      expected.push({ id, slug: row.slug, eligible: row.noIndex !== true &&
        (row.visible !== false || row.expiry === '2000-01-01T00:00:00Z') });
    }
    // Selective ranges in a representative wider heap, not planner forcing.
    await fixture.pool.query(`INSERT INTO stations(id,station_uuid,name,slug,url,source)
      SELECT 'noise-'||n, 'noise-'||n, 'Noise FM', '_noise-'||n, 'https://fixture.invalid/live',
        jsonb_build_object('payload',repeat('x',1000)) FROM generate_series(1,30000) n`);
    await fixture.pool.query('ANALYZE stations');
  });
  after(async () => { await fixture?.close(); });

  test('records provider/effective locale; dedicated C/ICU fixtures verify the locale defect', async t => {
    const row = (await fixture.pool.query(`SELECT current_setting('server_version') AS version,
      datlocprovider,datlocale,datcollate,datctype,'z'::text < '{'::text AS normal_z,
      '0'::text < ':'::text AS normal_digits, 'z'::text COLLATE "C" < '{'::text AS binary_z
      FROM pg_catalog.pg_database WHERE datname=current_database()`)).rows[0];
    t.diagnostic(JSON.stringify(row)); assert.equal(row.binary_z, true);
    if (new URL(url!).pathname === '/az_icu_test') {
      assert.equal(row.datlocprovider, 'i'); assert.equal(row.datlocale, 'en-US');
      assert.equal(row.normal_z, false); assert.equal(row.normal_digits, false);
    } else if (new URL(url!).pathname === '/az_c_test') {
      assert.equal(row.datlocprovider, 'c'); assert.equal(row.datcollate, 'C'); assert.equal(row.normal_z, true);
    }
  });

  test('all 27 buckets match independent ASCII first-character membership and exhaustively recover each ID once', async () => {
    for (const key of AZ_INDEX_KEYS) {
      const oracle = expected.filter(row => {
        if (!row.eligible || !row.slug) return false;
        const code = row.slug.charCodeAt(0);
        return key === '0-9' ? code >= 48 && code <= 57 : code === key.charCodeAt(0);
      });
      const ids: string[] = [];
      for (let page = 1; page <= Math.max(1, Math.ceil(oracle.length / 60)); page++) {
        const result = await readAzStationPage(key, page, 60);
        assert.equal(result.total, oracle.length, key);
        ids.push(...result.docs.map(doc => doc._id));
        for (const doc of result.docs.filter(doc => String(doc._id).startsWith('extra-'))) {
          assert.notEqual(doc.slug, 'stale-source'); assert.equal(doc.name, 'Boundary FM');
          assert.equal(doc.custom, 42); assert.equal(doc.isListVisible, true);
        }
      }
      assert.equal(new Set(ids).size, ids.length, key);
      assert.deepEqual([...ids].sort(), oracle.map(row => row.id).sort(), key);
      assert.deepEqual(await readAzStationPage(key, Math.ceil(oracle.length / 60) + 1, 60), { docs: [], total: oracle.length });
    }
    const first = await readAzStationPage('z', 5, 60), second = await readAzStationPage('z', 6, 60);
    const ties = [...first.docs, ...second.docs].filter(doc => doc.slug === 'z-duplicate').map(doc => doc._id);
    assert.deepEqual(ties, Array.from({ length: 73 }, (_, n) => `tie-${String(n + 1).padStart(3, '0')}`));
    assert.deepEqual((await readAzStationPage('x', 4, 60)).docs.length, 60, 'exact page multiple');
    assert.deepEqual(await readAzStationPage('x', Number.MAX_SAFE_INTEGER, 60), { docs: [], total: 240 });
  });

  test('migration is idempotent; missing or structurally wrong same-name indexes refuse all binary serving reads', async t => {
    const definition = async () => (await fixture.pool.query(`SELECT indexrelid::text AS oid,pg_get_indexdef(indexrelid) AS definition
      FROM pg_catalog.pg_index WHERE indexrelid='stations_az_slug_c_id_idx'::regclass`)).rows[0];
    const original = await definition(); await fixture.pool.query(migration); assert.deepEqual(await definition(), original);
    await fixture.pool.query('DROP INDEX stations_az_slug_c_id_idx');
    for (const [lo, hi] of [['z', '{'], ['0', ':']]) {
      for (const offset of [null, 0, 120, lo === 'z' ? 300 : 1200]) {
        const suffix = offset === null ? '' : ' ORDER BY s.slug COLLATE "C",s.id LIMIT 60 OFFSET $3';
        const plan = (await fixture.pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT ${offset === null ? 'count(*)' : 's.*'} FROM stations s
          WHERE s.slug COLLATE "C">=$1::text AND s.slug COLLATE "C"<$2::text
          AND (s.is_list_visible IS TRUE OR COALESCE(s.visibility_expires_at<=now(),false))
          AND (s.no_index<>true OR s.no_index IS NULL)${suffix}`, offset === null ? [lo, hi] : [lo, hi, offset])).rows[0]['QUERY PLAN'];
        t.diagnostic('without index: ' + JSON.stringify({ lo, offset, plan }));
      }
    }
    await assert.rejects(readAzStationPage('z', 1, 60), { code: 'AZ_INDEX_NOT_READY' });
    const variants = [
      'ON stations(slug,id)', 'ON stations(slug COLLATE "C")', 'ON stations(id,slug COLLATE "C")',
      'ON stations(slug COLLATE "C" DESC,id)', 'ON stations(slug COLLATE "C" NULLS FIRST,id)',
      'ON stations(slug COLLATE "C" text_pattern_ops,id)', 'ON stations(slug COLLATE "C",id COLLATE "C")',
      'ON stations(slug COLLATE "C",id) WHERE no_index=false',
      'ON stations((lower(slug) COLLATE "C"),id)',
    ];
    // id COLLATE C is different from the id column's default even in a C database.
    for (const variant of variants) {
      await fixture.pool.query('CREATE INDEX stations_az_slug_c_id_idx ' + variant);
      await fixture.pool.query(migration); // IF NOT EXISTS is not definition verification.
      await assert.rejects(readAzStationPage('z', 1, 60), { code: 'AZ_INDEX_NOT_READY' }, variant);
      await fixture.pool.query('DROP INDEX stations_az_slug_c_id_idx');
    }
    await fixture.pool.query('CREATE TABLE wrong_stations (slug text,id text)');
    await fixture.pool.query('CREATE INDEX stations_az_slug_c_id_idx ON wrong_stations(slug COLLATE "C",id)');
    await assert.rejects(readAzStationPage('z', 1, 60), { code: 'AZ_INDEX_NOT_READY' });
    await fixture.pool.query('DROP TABLE wrong_stations'); await fixture.pool.query(migration);
    assert.ok((await readAzStationPage('z', 1, 60)).docs.length);
  });

  test('unforced representative count/first/middle/last plans retain both binary range conditions as index-eligible', async t => {
    const flatten = (node: any): any[] => [node, ...(node.Plans || []).flatMap(flatten)];
    for (const [lo, hi, total] of [['z', '{', (await readAzStationPage('z', 1, 60)).total], ['0', ':', (await readAzStationPage('0-9', 1, 60)).total]] as const) {
      let rangeUsed = false;
      for (const offset of [null, 0, 120, Math.floor((Number(total) - 1) / 60) * 60]) {
        const suffix = offset === null ? '' : ' ORDER BY s.slug COLLATE "C",s.id LIMIT 60 OFFSET $3';
        const plan = (await fixture.pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT ${offset === null ? 'count(*)' : 's.*'} FROM stations s
          WHERE s.slug COLLATE "C">=$1::text AND s.slug COLLATE "C"<$2::text
          AND (s.is_list_visible IS TRUE OR COALESCE(s.visibility_expires_at<=now(),false))
          AND (s.no_index<>true OR s.no_index IS NULL)${suffix}`, offset === null ? [lo, hi] : [lo, hi, offset])).rows[0]['QUERY PLAN'];
        t.diagnostic(JSON.stringify({ lo, offset, plan }));
        const ranges = flatten(plan[0].Plan).filter(node => node['Index Name'] === 'stations_az_slug_c_id_idx');
        rangeUsed ||= ranges.some(node => node['Index Cond']?.includes('>=') && node['Index Cond']?.includes('<'));
      }
      // Eligibility evidence for each representative bucket, not a requirement
      // that every count/deep-page plan use an index or avoid sorting.
      assert.ok(rangeUsed, 'both range bounds can be used as index conditions for ' + lo);
    }
    await fixture.pool.query("DELETE FROM stations WHERE slug COLLATE \"C\">='x' AND slug COLLATE \"C\"<'y'");
    assert.deepEqual(await readAzStationPage('x', 1, 60), { docs: [], total: 0 });
  });

  test('an interrupted concurrent build with the exact correct keys is invalid/not-ready and fails closed without request-time DDL', async t => {
    await fixture.pool.query('DROP INDEX stations_az_slug_c_id_idx');
    const blocker = await fixture.pool.connect(), builder = await fixture.pool.connect();
    let building: Promise<any> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('LOCK TABLE stations IN ROW EXCLUSIVE MODE');
      const pid = (await builder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      building = builder.query('CREATE INDEX CONCURRENTLY stations_az_slug_c_id_idx ON stations(slug COLLATE "C",id)')
        .then(() => null, error => error);
      let state: any;
      for (let attempt = 0; attempt < 100; attempt++) {
        state = (await fixture.pool.query(`SELECT i.indisvalid,i.indisready,p.phase
          FROM pg_catalog.pg_index i JOIN pg_catalog.pg_stat_progress_create_index p ON p.index_relid=i.indexrelid
          WHERE p.pid=$1 AND i.indrelid='stations'::regclass`, [pid])).rows[0];
        if (state?.phase === 'waiting for writers before build') break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      t.diagnostic(JSON.stringify(state));
      assert.equal(state?.indisvalid, false); assert.equal(state?.indisready, false);
      await assert.rejects(readAzStationPage('z', 1, 60), { code: 'AZ_INDEX_NOT_READY' });
      await fixture.pool.query('SELECT pg_catalog.pg_cancel_backend($1)', [pid]);
      assert.equal((await building)?.code, '57014');
      await assert.rejects(readAzStationPage('z', 1, 60), { code: 'AZ_INDEX_NOT_READY' });
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (building) await building;
      builder.release();
      await fixture.pool.query('DROP INDEX IF EXISTS stations_az_slug_c_id_idx');
      await fixture.pool.query(migration);
    }
    assert.ok((await readAzStationPage('z', 1, 60)).docs.length);
  });

  test('real native reader feeds localized SSR Z/digit anchors and A/M pagination; missing index remains retryable data failure', async () => {
    const { SeoRenderer } = await import('../src/seo-renderer');
    const renderer = new SeoRenderer(), domain = 'https://themegaradio.com';
    for (const key of ['z', '0-9', 'a', 'm']) {
      const total = (await readAzStationPage(key, 1, 60)).total;
      const last = Math.ceil(total / 60);
      for (const language of ['en', 'tr', 'de']) {
        const base = buildLocalizedUrl(`/stations/${key}`, language, undefined, new Map());
        for (const page of [1, last]) {
          const suffix = page === 1 ? '' : `?page=${page}`;
          const rendered = await renderer.renderStaticPage(base + suffix, domain);
          assert.equal(rendered.pageData.stationDbError, undefined);
          assert.equal(rendered.pageData.httpNotFound, undefined);
          assert.equal(rendered.pageData.catalogTotalPages, last);
          assert.ok(rendered.pageData.catalogStations.length > 0);
          assert.equal(rendered.seoTags.canonical, domain + base + suffix);
          assert.ok(rendered.seoTags.hreflangs.length >= 14);
          assert.ok(rendered.seoTags.hreflangs.every((entry: any) => suffix ? entry.url.endsWith(suffix) : !entry.url.includes('?')));
          const html = renderer.generateHtmlBody({ pageType: 'stations', language, translations: {},
            additionalData: rendered.pageData.additionalData, urlTranslations: rendered.urlTranslations });
          const stationUrl = buildLocalizedUrl('/station/' + rendered.pageData.catalogStations[0].slug, language, undefined, new Map());
          assert.ok(html.includes(`href="${stationUrl}"`)); assert.match(html, /class="pagination"/);
        }
      }
      for (const page of [last + 1, Number.MAX_SAFE_INTEGER]) {
        const rendered = await renderer.renderStaticPage(`/en/stations/${key}?page=${page}`, domain);
        assert.equal(rendered.pageData.httpNotFound, true); assert.equal(rendered.pageData.stationDbError, undefined);
      }
    }
    await fixture.pool.query('DROP INDEX stations_az_slug_c_id_idx');
    try {
      const failed = await renderer.renderStaticPage('/en/stations/z', domain);
      assert.equal(failed.pageData.stationDbError, true); assert.equal(failed.pageData.notFound, false);
    } finally { await fixture.pool.query(migration); }
    assert.ok((await renderer.renderStaticPage('/en/stations/z', domain)).pageData.catalogStations.length);
  });
});
