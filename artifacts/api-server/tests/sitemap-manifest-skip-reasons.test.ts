import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

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
mock.module(new URL('../src/data/postgres-catalog-store.ts', import.meta.url).href, {
  namedExports: { pgCatalog: () => ({
    async *iterate(_filter: unknown, options: any) {
      assert.equal(allowBuild, true);
      assert.deepEqual(options.fields, ['_id']);
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
