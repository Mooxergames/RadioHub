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
    getQualifiedLanguagesLkg: async () => lkg,
    saveQualifiedLanguagesLkg: async (value: any) => {
      lkg = { ...value, languages: [...value.languages] };
      writes.push(lkg);
    },
  }) } });
  mock.module('../src/utils/logger', { namedExports: { logger: { log() {}, warn() {}, error() {} } } });
  qualified = await import('../src/seo/qualified-languages');
});

beforeEach(async () => {
  cache.clear(); lkg = null; writes = []; reads = [];
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

test('LKG ordering preserves optional and legacy languages without adding a new cohort', async () => {
  lkg = savedState(['pl', 'de', 'en', 'aa']);
  const state = await qualified.initializeQualifiedLanguages();
  assert.deepEqual(state.languages, ['en', 'de', 'aa', 'pl']);
  assert.deepEqual([...state.languages].sort(), [...lkg.languages].sort());
  assert.equal(state.hash, lkg.hash, 'normalizing order does not rewrite stored hash metadata');
  assert.equal(writes.length, 0);
});

test('shrink protection normalizes a larger legacy cohort without dropping languages', async () => {
  const extras = SEO_LANGUAGES.map(language => language.code).filter(language => !expected.includes(language)).sort();
  const legacy = [...expected, ...extras];
  assert.ok(legacy.length > expected.length * 2);
  lkg = savedState([...legacy].reverse());
  for (const language of expected) cache.set(language, complete);
  const state = await qualified.getQualifiedLanguagesState();
  assert.equal(state.source, 'lkg');
  assert.deepEqual(state.languages, legacy);
  assert.equal(state.hash, lkg.hash);
  assert.equal(writes.length, 0);
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
