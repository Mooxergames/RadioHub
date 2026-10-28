import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
import { withSeoReadDeadline } from '../src/utils/seo-read-deadline';

let defaults = 0;
let connections = 0;
let records: any[] = [];
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => ({
  query: async () => { defaults++; return { rows: records }; },
  connect: async () => { connections++; throw new Error('Real connections are forbidden'); },
}) } });
const { boundedSeoReadQuery } = await import('../src/data/postgres-seo-read-query');
const { pgSeoMetadata } = await import('../src/data/postgres-content-store');
const { pgStoredGenreBySlug } = await import('../src/data/postgres-taxonomy-store');
beforeEach(() => { defaults = 0; connections = 0; records = []; });

test('published metadata retains its default reader and domain shape outside SSR', async () => {
  records = [{ id: 'editorial', title: 'Published title', no_index: true, status: 'published', source: { retained: true } }];
  const result = await pgSeoMetadata({ pageType: 'genre_detail', routeKey: 'genres/70s', language: 'en', status: 'published' });
  assert.equal(defaults, 1);
  assert.equal(result._id, 'editorial');
  assert.equal(result.title, 'Published title');
  assert.equal(result.noIndex, true);
  assert.deepEqual(result.source, { retained: true });
});

test('stored genre retains its default reader and authoritative count outside SSR', async () => {
  records = [{ id: 'genre', slug: '70s', station_count: 42, source: { cleanupDemotion: true } }];
  const result = await pgStoredGenreBySlug('70s');
  assert.equal(defaults, 1);
  assert.equal(result.stationCount, 42);
  assert.equal(result.cleanupDemotion, true);
});

for (const kind of ['metadata', 'genre'] as const) {
  test(`${kind}: an explicit SSR reader replaces only that read, with unchanged parameters`, async () => {
    const calls: Array<{ text: string; values: any[] }> = [];
    const reader = { query: async (text: string, values: any[]) => {
      calls.push({ text, values });
      return { rows: [] };
    } };
    if (kind === 'metadata') {
      assert.equal(await pgSeoMetadata({ pageType: 'genre_detail', routeKey: 'genres/70s', language: 'en', status: 'published' }, reader), null);
      assert.deepEqual(calls[0].values, ['genre_detail', 'genres/70s', 'en', 'published']);
      assert.ok(calls[0].text.includes('FROM seo_metadata'));
    } else {
      assert.equal(await pgStoredGenreBySlug('70s', reader), null);
      assert.deepEqual(calls[0].values, ['70s']);
      assert.equal(calls[0].text, 'SELECT * FROM genres WHERE slug=$1');
    }
    assert.equal(calls.length, 1);
    assert.equal(defaults, 0);
    assert.equal(connections, 0);
  });

  test(`${kind}: a pre-aborted SSR read never reaches the default pool or obtains a connection`, async () => {
    const controller = new AbortController(); controller.abort();
    const reader = { query: boundedSeoReadQuery };
    const read = () => kind === 'metadata'
      ? pgSeoMetadata({ pageType: 'homepage', language: 'en', status: 'published' }, reader)
      : pgStoredGenreBySlug('70s', reader);
    await assert.rejects(withSeoReadDeadline({ signal: controller.signal, expiresAt: Date.now() + 1000 }, read),
      { name: 'AbortError' });
    assert.equal(defaults, 0);
    assert.equal(connections, 0);
  });
}
