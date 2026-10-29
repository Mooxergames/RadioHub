import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { after, before, beforeEach, mock, test } from 'node:test';
import {
  ACTIVE_SITEMAP_LANGUAGES,
  REQUIRED_HOMEPAGE_SEO_KEYS,
  REQUIRED_STATION_SEO_KEYS,
  SEO_LANGUAGES,
} from '@workspace/seo-shared/seo-config';

const expected: string[] = [...ACTIVE_SITEMAP_LANGUAGES];
const complete = Object.fromEntries([...REQUIRED_STATION_SEO_KEYS, ...REQUIRED_HOMEPAGE_SEO_KEYS]
  .map(key => [key, `Fixture ${key}`]));
const expectedHash = createHash('sha256').update([...expected].sort().join(',')).digest('hex').slice(0, 16);
const cache = new Map<string, Record<string, string>>();
let lkg: any = null;
let lkgReadError: Error | null = null;
let writes: any[] = [];
let reads: string[] = [];
let loadTranslations: (language: string) => Promise<Record<string, string>>;
let qualified: typeof import('../src/seo/qualified-languages');

function savedState(languages: string[]) {
  const hash = createHash('sha256').update([...languages].sort().join(',')).digest('hex').slice(0, 16);
  return { languages, hash, source: 'computed', computedAt: new Date('2026-10-24T00:00:00Z'),
    expiresAt: new Date(Date.now() + 86400000) };
}

before(async () => {
  mock.module('../src/performance-cache', { namedExports: { performanceCache: {
    getTranslations: (language: string) => cache.get(language) ?? null,
    setTranslations: (language: string, translations: Record<string, string>) => cache.set(language, translations),
  } } });
  mock.module('../src/data/postgres-localization-store', { namedExports: { pgLocalization: () => ({
    getTranslations: async (language: string) => { reads.push(language); return loadTranslations(language); },
    getQualifiedLanguagesLkg: async () => {
      if (lkgReadError) throw lkgReadError;
      return lkg;
    },
    saveQualifiedLanguagesLkg: async (value: any) => {
      lkg = { ...value, languages: [...value.languages] };
      writes.push(lkg);
    },
  }) } });
  mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
  qualified = await import('../src/seo/qualified-languages');
});

beforeEach(async () => {
  cache.clear(); lkg = null; lkgReadError = null; writes = []; reads = [];
  loadTranslations = async () => complete;
  await qualified.invalidateQualifiedLanguages();
});
after(() => mock.restoreAll());

test('cold parallel reads and warm cache return the same cohort order and hash', async () => {
  let releaseEnglish!: (value: Record<string, string>) => void;
  const english = new Promise<Record<string, string>>(resolve => { releaseEnglish = resolve; });
  loadTranslations = async language => language === 'en' ? english : complete;
  const pending = qualified.getQualifiedLanguagesState();
  await setImmediate();
  assert.equal(reads.length, expected.length);
  releaseEnglish(complete);
  const cold = await pending;
  await qualified.invalidateQualifiedLanguages();
  const warm = await qualified.getQualifiedLanguagesState();
  assert.deepEqual(cold.languages, expected);
  assert.deepEqual(warm.languages, expected);
  assert.equal(cold.hash, expectedHash);
  assert.equal(warm.hash, cold.hash);
  assert.equal(reads.length, expected.length, 'warm recompute does not reread translations');
  assert.ok(writes.every(value => JSON.stringify(value.languages) === JSON.stringify(expected)));
});

test('a missing priority language cannot move to the end of a partially warm cohort', async () => {
  for (const language of expected.filter(language => language !== 'en')) cache.set(language, complete);
  const state = await qualified.getQualifiedLanguagesState();
  assert.deepEqual(reads, ['en']);
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, expectedHash);
});

test('incomplete translations retain the guaranteed cohort in its configured order', async () => {
  for (const language of expected) cache.set(language, {});
  const state = await qualified.getQualifiedLanguagesState();
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, expectedHash);
  assert.equal(reads.length, 0);
});

test('startup normalizes legacy LKG order without changing its membership, hash or dates', async () => {
  lkg = savedState([...expected].reverse());
  const original = lkg;
  const state = await qualified.initializeQualifiedLanguages();
  assert.equal(state.source, 'lkg');
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, original.hash);
  assert.equal(state.computedAt, original.computedAt);
  assert.equal(state.expiresAt, original.expiresAt);
  assert.deepEqual(original.languages, [...expected].reverse(), 'reading does not mutate stored state');
  assert.equal(reads.length, 0);
  assert.equal(writes.length, 0);
  assert.deepEqual(qualified.getCachedQualifiedLanguagesSync(), expected);
  assert.deepEqual(await qualified.getCachedQualifiedLanguages(), expected);
});

test('translation outages return the same normalized LKG order as startup', async () => {
  lkg = savedState([...expected].reverse());
  loadTranslations = async () => { throw new Error('Fixture translations unavailable'); };
  const state = await qualified.getQualifiedLanguagesState();
  assert.equal(state.source, 'lkg');
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, expectedHash);
  assert.deepEqual(qualified.getCachedQualifiedLanguagesSync(), expected);
  assert.equal(writes.length, 0);
});

for (const mode of ['startup', 'outage'] as const) {
  for (const [name, languages] of [
    ['partial active cohort', ['de']],
    ['mixed legacy and duplicate cohort', ['pl', 'de', 'en', 'aa', 'am', 'af', 'de', 'en']],
    ['reversed full cohort with duplicates', [...expected].reverse().concat('en', 'de')],
  ] as const) {
    test(`${mode}: normalizes ${name} and recomputes its hash without writes`, async () => {
      lkg = savedState([...languages]);
      lkg.hash = 'stale-membership-hash';
      const original = { ...lkg, languages: [...lkg.languages] };
      if (mode === 'outage') loadTranslations = async () => { throw new Error('Fixture translations unavailable'); };
      const state = await (mode === 'startup'
        ? qualified.initializeQualifiedLanguages() : qualified.getQualifiedLanguagesState());
      assert.equal(state.source, 'lkg');
      assert.deepEqual(state.languages, expected);
      assert.equal(state.hash, expectedHash);
      assert.equal(state.computedAt, original.computedAt);
      assert.equal(state.expiresAt, original.expiresAt);
      assert.deepEqual(lkg, original, 'normalizing a read never mutates the stored record');
      assert.equal(writes.length, 0);
      assert.equal(reads.length, mode === 'startup' ? 0 : expected.length);
      assert.deepEqual(qualified.getCachedQualifiedLanguagesSync(), expected);
      assert.equal(await qualified.getQualifiedLanguagesState(), state);
    });
  }
}

test('legacy extras cannot trigger shrink protection and resurrect inactive languages', async () => {
  const extras = SEO_LANGUAGES.map(language => language.code).filter(language => !expected.includes(language)).sort();
  const legacy = [...expected, ...extras];
  assert.ok(legacy.length > expected.length * 2);
  lkg = savedState([...legacy].reverse());
  for (const language of expected) cache.set(language, complete);
  const state = await qualified.getQualifiedLanguagesState();
  assert.equal(state.source, 'computed');
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, expectedHash);
  assert.equal(writes.length, 1, 'a successful compute still persists its own fresh LKG');
  assert.deepEqual(writes[0].languages, expected);
});

const invalidLkgCases: [string, () => any][] = [
  ['absent', () => null],
  ['non-record', () => 'invalid'],
  ['array record', () => []],
  ['missing languages', () => ({ ...savedState(['en']), languages: undefined })],
  ['non-array languages', () => ({ ...savedState(['en']), languages: 'en' })],
  ['non-string member', () => ({ ...savedState(['en']), languages: ['en', null] })],
  ['empty', () => savedState([])],
  ['inactive-only', () => savedState(['am', 'af', 'aa'])],
  ['missing computedAt', () => ({ ...savedState(['en']), computedAt: undefined })],
  ['invalid computedAt', () => ({ ...savedState(['en']), computedAt: new Date(NaN) })],
  ['string computedAt', () => ({ ...savedState(['en']), computedAt: '2026-10-24T00:00:00Z' })],
  ['missing expiresAt', () => ({ ...savedState(['en']), expiresAt: undefined })],
  ['invalid expiresAt', () => ({ ...savedState(['en']), expiresAt: new Date(NaN) })],
  ['string expiresAt', () => ({ ...savedState(['en']), expiresAt: '2099-01-01T00:00:00Z' })],
  ['expired', () => ({ ...savedState(['en']), expiresAt: new Date(Date.now() - 86400000) })],
  ['expiry boundary', () => ({ ...savedState(['en']), expiresAt: new Date(Date.now()) })],
];

for (const mode of ['startup', 'outage'] as const) {
  for (const [name, makeLkg] of invalidLkgCases) {
    test(`${mode}: ${name} LKG cannot fabricate a guaranteed cohort during an outage`, async () => {
      lkg = makeLkg();
      loadTranslations = async () => { throw new Error('Fixture database unavailable'); };
      await assert.rejects(mode === 'startup'
        ? qualified.initializeQualifiedLanguages() : qualified.getQualifiedLanguagesState(), /computation failed/);
      assert.equal(qualified.getCachedQualifiedLanguagesSync(), null);
      assert.equal(writes.length, 0, 'invalid reads neither seed nor refresh LKG');
    });
  }
}

test('a valid null expiry remains null without extending LKG metadata', async () => {
  lkg = { ...savedState(['de']), expiresAt: null };
  const state = await qualified.initializeQualifiedLanguages();
  assert.equal(state.source, 'lkg');
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, expectedHash);
  assert.equal(state.expiresAt, null);
  assert.equal(writes.length, 0);
});

test('an unusable LKG does not prevent a successful compute from persisting a fresh cohort', async () => {
  lkg = savedState(['am', 'af']);
  const state = await qualified.initializeQualifiedLanguages();
  assert.equal(state.source, 'computed');
  assert.deepEqual(state.languages, expected);
  assert.equal(state.hash, expectedHash);
  assert.equal(writes.length, 1);
});

test('LKG read failures remain errors without caching or writing a fabricated cohort', async () => {
  lkgReadError = new Error('Fixture LKG read unavailable');
  loadTranslations = async () => { throw new Error('Fixture translations unavailable'); };
  await assert.rejects(qualified.initializeQualifiedLanguages(), /LKG read unavailable/);
  assert.equal(qualified.getCachedQualifiedLanguagesSync(), null);
  assert.equal(writes.length, 0);
});

test('normalized outage fallback retains the short retry TTL and recovers through a fresh compute', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    lkg = savedState(['am', 'de', 'de']);
    loadTranslations = async () => { throw new Error('Fixture translations unavailable'); };
    const fallback = await qualified.getQualifiedLanguagesState();
    assert.equal(fallback.source, 'lkg');
    assert.deepEqual(fallback.languages, expected);
    assert.equal(fallback.hash, expectedHash);
    assert.equal(writes.length, 0);
    loadTranslations = async () => complete;
    mock.timers.tick(29_999);
    assert.equal(await qualified.getQualifiedLanguagesState(), fallback);
    assert.equal(reads.length, expected.length);
    mock.timers.tick(1);
    const recovered = await qualified.getQualifiedLanguagesState();
    assert.equal(recovered.source, 'computed');
    assert.deepEqual(recovered.languages, expected);
    assert.equal(recovered.hash, expectedHash);
    assert.equal(reads.length, expected.length * 2);
    assert.equal(writes.length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('forced LKG refresh persists canonical order before warm reads', async () => {
  for (const language of expected.filter(language => language !== 'en')) cache.set(language, complete);
  await qualified.invalidateQualifiedLanguages({ resetLkg: true });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].languages, expected);
  assert.equal(writes[0].hash, expectedHash);
  assert.deepEqual((await qualified.getQualifiedLanguagesState()).languages, expected);
});

test('emergency seed uses the same configured cohort order', () => {
  assert.deepEqual(qualified.EMERGENCY_SEED_QUALIFIED_LANGUAGES, expected);
  assert.ok(Object.isFrozen(qualified.EMERGENCY_SEED_QUALIFIED_LANGUAGES));
});

test('concurrent cold callers share one stable computation', async () => {
  const states = await Promise.all(Array.from({ length: 8 }, () => qualified.getQualifiedLanguagesState()));
  assert.equal(reads.length, expected.length);
  assert.equal(writes.length, 1);
  for (const state of states) {
    assert.equal(state, states[0]);
    assert.deepEqual(state.languages, expected);
  }
});

test('database outages without a valid LKG still fail closed', async () => {
  loadTranslations = async () => { throw new Error('Fixture database unavailable'); };
  await assert.rejects(qualified.getQualifiedLanguagesState(), /computation failed/);
  assert.equal(qualified.getCachedQualifiedLanguagesSync(), null);
  assert.equal(writes.length, 0);
});
