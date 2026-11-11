import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

test('required genre ownership reads load DB aliases, cache a successful snapshot and reject failed stale reads', async t => {
  let calls = 0, fail = true;
  let overrides: Array<{ kind: string; slug: string; canonical?: string }> = [];
  let blocked: Promise<void> | undefined;
  mock.module('../src/data/postgres-taxonomy-runtime-store', { namedExports: {
    pgTaxonomyRuntime: () => ({ overrides: async () => {
      calls++;
      if (blocked) await blocked;
      if (fail) throw new Error('fixture: taxonomy unavailable');
      return overrides;
    } }),
  } });
  const store = await import('../src/seo/genre-whitelist-store');
  const whitelist = await import('../src/seo/genre-whitelist');
  const { LEGACY_COMBINED_GENRE_SLUG: slug } = await import('@workspace/seo-shared/legacy-station-guide-routes');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    assert.equal(store.getLastRefreshAt(), null);
    await assert.rejects(store.ensureGenreWhitelistFresh(), /taxonomy unavailable/);
    assert.equal(store.getLastRefreshAt(), null);
    fail = false; overrides = [{ kind: 'alias-add', slug, canonical: 'pop' }];
    await store.ensureGenreWhitelistFresh();
    assert.equal(whitelist.getCanonicalGenreSlug(slug), 'pop');
    await store.ensureGenreWhitelistFresh();
    assert.equal(calls, 2, 'a fresh snapshot must not cause another database query');
    t.mock.timers.tick(300_001); fail = true;
    await assert.rejects(store.ensureGenreWhitelistFresh(), /taxonomy unavailable/);
    assert.equal(whitelist.getCanonicalGenreSlug(slug), 'pop', 'ordinary sync callers retain the previous snapshot');
    fail = false; overrides = [];
    await store.ensureGenreWhitelistFresh();
    assert.equal(whitelist.getCanonicalGenreSlug(slug), undefined);
    t.mock.timers.tick(300_001);
    let release!: () => void;
    blocked = new Promise<void>(resolve => { release = resolve; });
    const before = calls;
    const first = store.ensureGenreWhitelistFresh(), second = store.ensureGenreWhitelistFresh();
    release(); await Promise.all([first, second]);
    assert.equal(calls, before + 1, 'concurrent required reads share the refresh');
  } finally { t.mock.timers.reset(); mock.restoreAll(); }
});
