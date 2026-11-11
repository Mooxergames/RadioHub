import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';

class Unavailable extends Error {}
let getState: () => Promise<any>;
mock.module(new URL('../src/seo/qualified-languages.ts', import.meta.url).href, {
  namedExports: { getQualifiedLanguagesState: () => getState(), QualifiedLanguagesUnavailableError: Unavailable },
});
mock.module(new URL('../src/services/indexnow.ts', import.meta.url).href, {
  namedExports: { IndexNowService: { submitSitemaps: async () => assert.fail('Skipped builds must not ping') } },
});
mock.module(new URL('../src/utils/logger.ts', import.meta.url).href, {
  namedExports: { logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} } },
});
const unexpectedWrite = async () => assert.fail('Skipped builds must not write manifests');
let allowBuild = false;
const readBatches: string[][] = [];
const written: any[] = [];
let stationFixture: readonly any[] | null = null;
mock.module(new URL('../src/data/postgres-catalog-store.ts', import.meta.url).href, {
  namedExports: { pgCatalog: () => ({
    async *iterate(_filter: unknown, options: any) {
      assert.equal(allowBuild, true);
      assert.deepEqual(options.fields, ['_id']);
      assert.equal(options.batchSize, 500);
      if (stationFixture) {
        for (const row of stationFixture) yield { _id: row._id };
        return;
      }
      for (let index = 0; index < 1201; index++) yield { _id: `fixture-${String(index).padStart(4, '0')}` };
    },
  }) },
});
mock.module(new URL('../src/data/postgres-seo-indexing-store.ts', import.meta.url).href, {
  namedExports: { pgFreshManifestCount: async () => 3,
    pgWriteBuildingManifest: async (input: any) => { if (!allowBuild) return unexpectedWrite(); written.push(input); return { _id: String(written.length), status: 'building' }; },
    pgActivateManifest: async () => { if (!allowBuild) await unexpectedWrite(); },
    pgSeoGenres: async () => { if (!allowBuild) await unexpectedWrite(); return []; },
    pgTopSitemapCountries: async () => { if (!allowBuild) await unexpectedWrite(); return []; },
    pgRetireManifests: async () => { if (!allowBuild) await unexpectedWrite(); return 0; },
    pgActiveManifest: unexpectedWrite, pgSeoCleanup: async () => { if (!allowBuild) await unexpectedWrite(); },
    SITEMAP_STATION_READ_BATCH_SIZE: 500,
    pgSitemapStationBatch: async (ids: string[]) => {
      assert.equal(allowBuild, true); assert.ok(ids.length <= 500); readBatches.push([...ids]);
      if (stationFixture) return stationFixture.filter(row => ids.includes(row._id)).reverse();
      return ids.map(id => ({ _id: id, slug: id, name: 'Fixture Radio', countryCode: 'US', noIndex: false,
        url: 'https://stream.example.invalid/live', votes: 1, completeDescriptionLanguages: ['de'] }));
    },
  },
});
const { buildAllSitemapManifests } = await import('../src/seo/sitemap-manifest-builder');

test('distinguishes an overlapping build from unavailable language data and releases its lock', async () => {
  let rejectState!: (error: Error) => void;
  getState = () => new Promise((_resolve, reject) => { rejectState = reject; });
  const first = buildAllSitemapManifests({ force: true });
  const overlapping = await buildAllSitemapManifests({ force: true });
  assert.equal(overlapping.built, false);
  assert.equal(overlapping.skippedReason, 'build-in-progress');
  rejectState(new Unavailable('fixture unavailable'));
  const failed = await first;
  assert.equal(failed.built, false);
  assert.equal(failed.skippedReason, 'qualified-languages-unavailable');
  getState = async () => ({ languages: ['en'], hash: 'fixture' });
  const fresh = await buildAllSitemapManifests();
  assert.equal(fresh.skippedReason, 'fresh');
  assert.deepEqual(fresh.qualifiedLanguages, ['en']);
});

test('unexpected language failures propagate and do not leave the builder locked', async () => {
  getState = async () => { throw new Error('unexpected failure'); };
  await assert.rejects(buildAllSitemapManifests({ force: true }), /unexpected failure/);
  getState = async () => ({ languages: ['en'], hash: 'fixture' });
  assert.equal((await buildAllSitemapManifests()).skippedReason, 'fresh');
});

test('full builds read only IDs then bounded compact eligibility rows, never article bodies', async () => {
  allowBuild = true;
  readBatches.length = 0;
  written.length = 0;
  getState = async () => ({ languages: ['en', 'de'], hash: 'fixture' });
  try {
    const result = await buildAllSitemapManifests({ force: true });
    assert.equal(result.built, true);
    assert.deepEqual(readBatches.map(batch => batch.length), [500, 500, 201]);
    assert.deepEqual(result.perLangCounts, { en: 1201, de: 1201 });
    assert.equal(written.length, 6);
    for (const manifest of written.filter(row => row.type === 'stations')) {
      assert.equal(manifest.chunks[0].stationIds.length, 1201);
      assert.equal(new Set(manifest.chunks[0].stationIds).size, 1201);
    }
  } finally { allowBuild = false; }
});

test('all 14 manifests omit every reserved A-Z identity without mutating records or losing normal station IDs', async () => {
  const languages = Object.freeze([...ACTIVE_SITEMAP_LANGUAGES]);
  assert.equal(languages.length, 14);
  const reserved = [...'abcdefghijklmnopqrstuvwxyz', '0-9', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  const normalSlugs = ['ab', 'bbc', 'npr', 'k-1', '0-90', 'genres', 'profile'];
  const makeRow = (id: string, slug: string, extra: Record<string, unknown> = {}) => Object.freeze({
    _id: id, slug, name: 'Fixture Radio', countryCode: 'US', noIndex: false,
    url: 'https://stream.example.invalid/live', votes: 2,
    completeDescriptionLanguages: languages, ...extra,
  });
  const normals = normalSlugs.map((slug, index) => makeRow(`normal-${index}`, slug, { votes: index % 3 }));
  const rows = Object.freeze([
    ...reserved.map((slug, index) => makeRow(`reserved-${index}`, slug, { votes: 100 })),
    ...normals,
    makeRow('excluded-noindex', 'noindex-radio', { noIndex: true }),
    makeRow('excluded-junk', 'junk-radio', { url: '' }),
    makeRow('excluded-redirect', 'redirect-radio', { redirectToSlug: 'bbc' }),
    makeRow('excluded-numeric', '1234'),
  ].reverse());
  const before = structuredClone(rows);
  const expectedIds = [...normals].sort((a, b) => b.votes - a.votes || a._id.localeCompare(b._id)).map(row => row._id);
  stationFixture = rows;
  allowBuild = true;
  readBatches.length = 0;
  written.length = 0;
  getState = async () => ({ languages, hash: 'az-publication-fixture' });
  try {
    const result = await buildAllSitemapManifests({ force: true });
    assert.equal(result.built, true);
    assert.deepEqual(readBatches.flat(), rows.map(row => row._id));
    assert.ok(readBatches.every(batch => batch.length <= 500));
    assert.equal(written.length, 14 * 3);
    assert.deepEqual(result.perLangCounts, Object.fromEntries(languages.map(lang => [lang, normals.length])));
    for (const language of languages) {
      const manifest = written.find(row => row.type === 'stations' && row.language === language);
      assert.ok(manifest, `${language}: station manifest missing`);
      assert.equal(manifest.totalUrls, normals.length);
      assert.equal(manifest.chunks.length, 1);
      assert.equal(manifest.chunks[0].chunk, 1);
      assert.equal(manifest.chunks[0].urlCount, normals.length);
      assert.deepEqual(manifest.chunks.flatMap((chunk: any) => chunk.stationIds), expectedIds);
      const main = written.find(row => row.type === 'main' && row.language === language);
      assert.equal(main.totalUrls, 16 + 27, `${language}: main A-Z count must stay intact`);
      assert.equal(main.chunks[0].urlCount, 16 + 27);
    }
    assert.ok(rows.every(Object.isFrozen));
    assert.deepEqual(rows, before, 'publication filtering must not edit slugs, IDs, noIndex or eligibility fields');
    assert.deepEqual(languages, ACTIVE_SITEMAP_LANGUAGES);
  } finally {
    stationFixture = null;
    allowBuild = false;
    readBatches.length = 0;
    written.length = 0;
  }
});
