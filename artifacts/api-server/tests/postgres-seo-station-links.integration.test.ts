import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { createNativePostgresFixture, type NativePostgresFixture } from './helpers/native-postgres-fixture';
import { resolveStationLinkLanguages } from '../src/seo/station-link-locale';
import { readSeoStationLinkMetadata } from '../src/data/postgres-seo-station-link-store';
import { withSeoReadDeadline } from '../src/utils/seo-read-deadline';
import { completeDescriptionLanguagesSql } from '../src/data/station-description-sql';

mock.module('../src/performance-cache', { namedExports: { performanceCache: {
  getPageData: () => undefined, setPageData: () => {}, getTranslations: () => ({}), getUrlTranslations: async () => new Map(),
} } });
mock.module('../src/public-station-cache', { namedExports: { PUBLIC_STATION_CACHE_MAX_TTL: 60, publicStationCache: {
  getOrSetSingleFlight: async (_key: string, read: () => Promise<any>) => read(),
} } });
mock.module('../src/data/postgres-content-store', { namedExports: { pgSeoMetadata: async () => null } });
mock.module('../src/services/home-genre-navigation', { namedExports: { getHomeGenreNavigation: () => undefined } });
mock.module('../src/seo/qualified-languages', { namedExports: { getCachedQualifiedLanguages: async () => [...ACTIVE_SITEMAP_LANGUAGES] } });

describe('native SSR station target locale projection (explicit disposable PostgreSQL only)',
  { skip: !process.env.PG_TEST_DATABASE_URL }, () => {
    let fixture: NativePostgresFixture;
    const targets = [
      { _id: 'us-untranslated', slug: 'us-untranslated', countryCode: 'US', descriptions: {} },
      { _id: 'us-translated', slug: 'us-translated', countryCode: 'US', descriptions: { de: { full: 'German article', meta: 'German meta' } } },
      { _id: 'native-austria', slug: 'native-austria', countryCode: 'AT', descriptions: {} },
      { _id: 'broadcast-de', slug: 'broadcast-de', countryCode: 'US', languageCodes: 'de,en', descriptions: {} },
      { _id: 'partial', slug: 'partial', countryCode: 'FR', descriptions: { de: { full: 'Article only' }, tr: { full: '\u00a0\ufeff', meta: 'Meta' } } },
    ];
    before(async () => {
      const url = new URL(process.env.PG_TEST_DATABASE_URL!);
      assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/radiohub_test');
      assert.equal(url.search, '');
      fixture = await createNativePostgresFixture('ssr_link_locales');
      for (const [index, target] of targets.entries()) await fixture.insert('stations', {
        ...target, stationuuid: target._id, name: `Fixture ${index}`, url: 'https://stream.invalid/live',
        isListVisible: true, noIndex: false, votes: 100 - index,
        source: { completeDescriptionLanguages: [...ACTIVE_SITEMAP_LANGUAGES], languageCodes: 'de',
          descriptions: { de: { full: 'Untrusted source article', meta: 'Untrusted source meta' } } },
      });
    });
    after(async () => { await fixture?.close(); });

    test('native presence metadata matches real descriptions and ISO columns, never provider lookalikes', async () => {
      const rows = await readSeoStationLinkMetadata(targets.map(row => row._id));
      const languages = resolveStationLinkLanguages(targets, rows, 'de', ACTIVE_SITEMAP_LANGUAGES);
      assert.deepEqual(Object.fromEntries(Object.entries(languages).map(([id, value]) => [id, value.language])), {
        'us-untranslated': 'en', 'us-translated': 'de', 'native-austria': 'de', 'broadcast-de': 'de', partial: 'en',
      });
      assert.deepEqual(rows.find(row => row._id === 'partial')?.completeDescriptionLanguages, []);
      assert.ok(rows.every(row => !('descriptions' in row) && !('source' in row)));
      assert.deepEqual(await readSeoStationLinkMetadata(['missing-fixture']), []);
    });

    test('all fourteen single-bit summaries match the native JSON presence expression', async () => {
      const ids = [];
      for (const language of ACTIVE_SITEMAP_LANGUAGES) {
        const id = `bit-${language}`; ids.push(id);
        await fixture.insert('stations', { _id: id, stationuuid: id, name: 'Bit fixture', slug: id,
          url: 'https://stream.invalid/live', descriptions: { [language]: { full: 'Full', meta: 'Meta' } } });
      }
      const rows = await readSeoStationLinkMetadata(ids);
      assert.equal(rows.length, 14);
      for (const language of ACTIVE_SITEMAP_LANGUAGES) {
        assert.deepEqual(rows.find(row => row._id === `bit-${language}`)?.completeDescriptionLanguages, [language]);
      }
      const native = (await fixture.pool.query(`SELECT id AS _id,
        ${completeDescriptionLanguagesSql('descriptions')} AS "completeDescriptionLanguages"
        FROM stations WHERE id=ANY($1::text[]) ORDER BY id`, [ids])).rows;
      assert.deepEqual(rows.map(row => ({ _id: row._id, completeDescriptionLanguages: row.completeDescriptionLanguages }))
        .sort((a, b) => a._id.localeCompare(b._id)), native);
    });

    test('separate full/meta bits, non-string fields and Unicode whitespace are not complete languages', async () => {
      const id = 'incomplete-bits';
      await fixture.insert('stations', { _id: id, stationuuid: id, name: 'Presence fixture', slug: id,
        url: 'https://stream.invalid/live', descriptions: { en: { full: 'Full' }, de: { meta: 'Meta' },
          tr: { full: '\u00a0\ufeff', meta: 'Meta' }, fr: { full: false, meta: 'Meta' },
          ja: { full: ['Text'], meta: 'Meta' }, ko: { full: 'Text', meta: { text: 'Meta' } } } });
      const rows = await readSeoStationLinkMetadata([id]);
      assert.deepEqual(rows[0]?.completeDescriptionLanguages, []);
    });

    test('a missing native summary is unknown and never invents an English fallback', async () => {
      const id = 'missing-summary';
      await fixture.insert('stations', { _id: id, stationuuid: id, name: 'Missing summary fixture', slug: id,
        url: 'https://stream.invalid/live', countryCode: 'US', descriptions: {} });
      await fixture.pool.query('DELETE FROM station_description_summary WHERE station_id=$1', [id]);
      const rows = await readSeoStationLinkMetadata([id, 'us-untranslated']);
      assert.deepEqual(rows.map(row => row._id), ['us-untranslated']);
      assert.equal(Object.hasOwn(resolveStationLinkLanguages([{ _id: id, slug: id }], rows, 'de', ACTIVE_SITEMAP_LANGUAGES), id), false);
    });

    test('committed description updates change the summary while rollback preserves the prior presence', async () => {
      const id = 'transactional-summary';
      await fixture.insert('stations', { _id: id, stationuuid: id, name: 'Transactional fixture', slug: id,
        url: 'https://stream.invalid/live', descriptions: { en: { full: 'Full', meta: 'Meta' } } });
      const descriptions = JSON.stringify({ de: { full: 'Volltext', meta: 'Meta' } });
      const client = await fixture.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE stations SET descriptions=$2::jsonb WHERE id=$1', [id, descriptions]);
        const own = await client.query('SELECT full_mask & meta_mask AS complete FROM station_description_summary WHERE station_id=$1', [id]);
        assert.equal(own.rows[0].complete, 1 << ACTIVE_SITEMAP_LANGUAGES.indexOf('de'));
        assert.deepEqual((await readSeoStationLinkMetadata([id]))[0]?.completeDescriptionLanguages, ['en']);
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.deepEqual((await readSeoStationLinkMetadata([id]))[0]?.completeDescriptionLanguages, ['en']);
      await fixture.pool.query('UPDATE stations SET descriptions=$2::jsonb WHERE id=$1', [id, descriptions]);
      assert.deepEqual((await readSeoStationLinkMetadata([id]))[0]?.completeDescriptionLanguages, ['de']);
    });

    test('real native A-Z reader shares resolved hrefs with its DTO/JSON-LD; home retains its original locale', async () => {
      const { SeoRenderer } = await import('../src/seo-renderer');
      const renderer = new SeoRenderer(), origin = 'https://themegaradio.com';
      for (const path of ['/de', '/de/sender/u']) {
        const page = await renderer.renderStaticPage(path, origin);
        assert.notEqual(page.pageData.stationDbError, true);
        const html = renderer.generateHtmlBody({ pageType: page.pageData.pageType, language: page.language,
          translations: {}, additionalData: page.pageData.additionalData, urlTranslations: page.urlTranslations });
        if (path === '/de') {
          assert.ok(html.includes('href="/de/station/us-untranslated"'));
          assert.ok(html.includes('href="/de/station/us-translated"'));
          assert.equal(page.pageData.stationLinkLanguages, undefined);
        } else {
          assert.ok(html.includes('href="/en/station/us-untranslated"'));
          assert.ok(html.includes('href="/de/sender/us-translated"'));
        }
        const schemas = renderer.generateStructuredData(page.seoTags, 'de', {}, page.cleanPath,
          undefined, page.urlTranslations, page.pageData);
        const list = schemas.page.find((schema: any) => schema['@type'] === 'ItemList');
        for (const item of list.itemListElement) assert.ok(html.includes(`href="${new URL(item.item.url).pathname}"`));
        if (path !== '/de') {
          const dto = renderer.buildStationDirectoryData({ ...page, pageData: page.pageData });
          assert.deepEqual(dto?.stations.map(row => row.href), ['/de/sender/us-translated', '/en/station/us-untranslated']);
        }
      }
    });

    test('100 ID projection stays bounded with fourteen large articles per row; unrelated catalog rows are not returned', async t => {
      const descriptions = Object.fromEntries(ACTIVE_SITEMAP_LANGUAGES.map(language =>
        [language, { full: ('Fixture prose ' + language + '. ').repeat(2000), meta: 'Fixture meta' }]));
      await fixture.pool.query(`INSERT INTO stations(id,station_uuid,name,slug,url,descriptions,source)
        SELECT 'bulk-'||n,'bulk-'||n,'Bulk Fixture','bulk-'||n,'https://stream.invalid/live',$1::jsonb,
          jsonb_build_object('payload',repeat('unneeded-source-',5000)) FROM generate_series(1,100) n`, [JSON.stringify(descriptions)]);
      await fixture.pool.query(`INSERT INTO stations(id,station_uuid,name,slug,url)
        SELECT 'unrelated-'||n,'unrelated-'||n,'Other Fixture','unrelated-'||n,'https://stream.invalid/live'
        FROM generate_series(1,10000) n`);
      await fixture.pool.query('ANALYZE stations');
      const ids = Array.from({ length: 100 }, (_, i) => `bulk-${i + 1}`);
      const start = performance.now(), rows = await readSeoStationLinkMetadata(ids), elapsedMs = performance.now() - start;
      assert.equal(rows.length, 100);
      assert.ok(rows.every(row => row.completeDescriptionLanguages.length === 14 && ids.includes(row._id)));
      const bytes = Buffer.byteLength(JSON.stringify(rows));
      assert.ok(bytes < 100000);
      t.diagnostic(JSON.stringify({ targetRows: 100, articleBytesPerStation: Buffer.byteLength(JSON.stringify(descriptions)),
        responseBytes: bytes, elapsedMs, note: 'Local synthetic observation, not production latency or a load test' }));
    });

    test('a short execution budget rejects a blocked optional projection and a later read recovers', async () => {
      const blocker = await fixture.pool.connect();
      try {
        await blocker.query('BEGIN'); await blocker.query('LOCK TABLE stations IN ACCESS EXCLUSIVE MODE');
        const start = performance.now();
        await assert.rejects(withSeoReadDeadline({ expiresAt: Date.now() + 500 },
          () => readSeoStationLinkMetadata(['us-untranslated'])), (error: any) =>
          ['SEO_READ_TIMEOUT', '57014'].includes(error?.code));
        assert.ok(performance.now() - start < 1000, 'Optional work must not wait for the ordinary four-second budget');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      assert.equal((await readSeoStationLinkMetadata(['us-untranslated'])).length, 1);
    });
  });
