import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { EventEmitter } from 'node:events';
import { SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';

const localized: Record<string, { full: string; meta: string }> = {
  en: { full: 'Music reaches listeners through the online audio service of Fixture Radio.', meta: 'Online music programming from Fixture Radio for its listeners.' },
  de: { full: 'Dieser Radiosender bietet seinen Hoerern Musik ueber einen Audiostream im Internet.', meta: 'Musikprogramme dieses Radiosenders im Internet hoeren.' },
  es: { full: 'Esta emisora ofrece programas musicales a sus oyentes mediante una transmision de audio.', meta: 'Escucha la programacion musical de esta emisora por Internet.' },
  fr: { full: 'Cette station propose des programmes musicaux a ses auditeurs par un flux audio en ligne.', meta: 'Ecoutez les programmes musicaux de cette station sur Internet.' },
  pt: { full: 'Esta emissora oferece programas musicais aos seus ouvintes atraves de uma transmissao de audio.', meta: 'Ouca os programas musicais desta emissora pela Internet.' },
  it: { full: 'Questa emittente offre programmi musicali ai suoi ascoltatori attraverso un flusso audio online.', meta: 'Ascolta i programmi musicali di questa emittente su Internet.' },
  tr: { full: 'Bu radyo dinleyicilerine internet uzerinden bir ses akisi ile muzik programlari sunar.', meta: 'Bu radyonun muzik programlarini internet uzerinden dinleyin.' },
  ru: { full: 'Эта радиостанция предлагает слушателям музыкальные программы через звуковую трансляцию в интернете.', meta: 'Слушайте музыкальные программы этой радиостанции в интернете.' },
  ar: { full: 'تقدم هذه المحطة برامج موسيقية لمستمعيها من خلال بث صوتي متاح عبر الإنترنت.', meta: 'استمع إلى البرامج الموسيقية لهذه المحطة عبر البث الصوتي على الإنترنت.' },
  zh: { full: '这家广播电台通过互联网音频流为听众提供音乐节目，并以在线广播的方式呈现电台内容。', meta: '通过互联网在线收听这家广播电台提供的音乐节目和音频广播内容。' },
  ja: { full: 'このラジオ局はインターネットの音声配信を通じて、リスナーに音楽番組を提供しています。', meta: 'インターネットの音声配信で、このラジオ局の音楽番組をお楽しみください。' },
  ko: { full: '이 라디오 방송국은 인터넷 오디오 스트림을 통해 청취자에게 음악 프로그램을 제공합니다.', meta: '인터넷 오디오 방송으로 이 라디오 방송국의 음악 프로그램을 들어보세요.' },
  hi: { full: 'यह रेडियो स्टेशन इंटरनेट पर ऑडियो प्रसारण के माध्यम से अपने श्रोताओं को संगीत कार्यक्रम उपलब्ध कराता है।', meta: 'इंटरनेट के ऑडियो प्रसारण पर इस रेडियो स्टेशन के संगीत कार्यक्रम सुनें।' },
  he: { full: 'תחנת הרדיו מציעה למאזינים תוכניות מוזיקה באמצעות שידור שמע הזמין דרך האינטרנט.', meta: 'האזינו לתוכניות המוזיקה של תחנת הרדיו באמצעות שידור השמע באינטרנט.' },
};
let fixture: any, persisted: any, reviewRows: any[], backgrounds: Array<() => Promise<void>>;
let routes: Map<string, any>, checkpoints: any[], saved: any[], translations: any[], connects: number;
let modelFailure: boolean, leadership: boolean, mutateDuringTranslation: (() => void) | undefined;
const auth = () => {};
mock.module(new URL('../src/data/postgres-catalog-store.ts', import.meta.url).href, { namedExports: {
  pgCatalog: () => ({
    find: async () => { throw new Error('Selected repair must not run a global catalog query'); },
    findOne: async () => ({ ...structuredClone(fixture), descriptions: structuredClone(persisted) }),
    update: async () => { throw new Error('Selected repair requires the private journal writer'); },
  }),
} });
mock.module(new URL('../src/data/postgres-runtime-operations.ts', import.meta.url).href, { namedExports: {
  pgSaveDescriptionJob: async (_id: string, _total: number, patch: any) => checkpoints.push(structuredClone(patch)),
  pgReadDescriptionJob: async () => null,
} });
mock.module(new URL('../src/data/postgres-admin-catalog-store.ts', import.meta.url).href, { namedExports: {
  pgAdminDescriptionCoverage: async () => ({}), pgDescriptionRepairStationIds: async () => { throw new Error('No global repair selection allowed'); },
} });
mock.module(new URL('../src/data/postgres-legacy-noindex-recovery.ts', import.meta.url).href, { namedExports: {
  pgReviewSelectedDescriptionRepairs: async () => structuredClone(reviewRows),
} });
mock.module(new URL('../src/data/postgres-scoped-description-repair.ts', import.meta.url).href, { namedExports: {
  pgSaveScopedDescriptionRepair: async (input: any) => {
    if (!isDeepStrictEqual(input.identity, descriptionRepairIdentity(fixture)) ||
        !isDeepStrictEqual(input.expected, persisted[input.language] ?? null)) return { modifiedCount: 0 };
    saved.push(structuredClone(input)); persisted[input.language] = structuredClone(input.next);
    return { modifiedCount: 1 };
  },
} });
mock.module(new URL('../src/postgres-runtime.ts', import.meta.url).href, { namedExports: {
  getPostgresCoordinationPool: () => ({ connect: async () => { connects++; return {
    on: () => {}, removeListener: () => {}, release: () => {}, query: async () => ({ rows: [{ acquired: leadership }] }),
  }; } }),
} });
mock.module(new URL('../src/routes/shared-utils.ts', import.meta.url).href, { namedExports: { stripPlaceholders: (value: string) => value } });
mock.module(new URL('../src/performance-cache.ts', import.meta.url).href, { namedExports: { performanceCache: { invalidateStationCache: () => {}, setQuick: () => {} } } });
mock.module(new URL('../src/utils/logger.ts', import.meta.url).href, { namedExports: { logger: { log: () => {}, warn: () => {}, error: () => {} } } });
mock.module(new URL('../src/services/ai-station-description.ts', import.meta.url).href, { namedExports: {
  detectStationLanguage: () => 'it',
  generateStationDescription: async () => { throw new Error('An existing reviewed English source must be retained'); },
  translateDescription: async (full: string, meta: string, source: string, targets: string[]) => {
    translations.push({ full, meta, source, targets }); mutateDuringTranslation?.();
    if (modelFailure) throw new Error('Model service unavailable');
    return new Map(targets.map(language => [language, localized[language]]));
  },
} });
const { descriptionRepairIdentity } = await import('../src/services/description-repair-policy');
const { registerAiDescriptionRoutes } = await import('../src/routes/ai-description-routes');
mock.method(globalThis, 'setInterval', (() => ({})) as any);
mock.method(globalThis, 'setImmediate', ((callback: () => Promise<void>) => { backgrounds.push(callback); return {}; }) as any);
after(() => mock.restoreAll());

beforeEach(async () => {
  fixture = { _id: 'fixture', name: 'Fixture Radio', slug: 'fixture-radio', stationuuid: '00000000-0000-4000-8000-000000000001',
    country: 'Germany', countryCode: 'DE', url: 'https://example.invalid/stream', noIndex: true, manualEditFields: { 'descriptions.ja': true } };
  persisted = structuredClone(localized);
  persisted.de.full = ''; persisted.fr.full = localized.en.full; persisted.es.meta = '';
  persisted.hi.meta = 'Tune in to Fixture Radio and listen to online music programming.';
  persisted.ja = structuredClone(localized.en);
  fixture.descriptions = structuredClone(persisted);
  reviewRows = [{ id: fixture._id, name: fixture.name, slug: fixture.slug, reason: 'eligible-for-content-repair',
    identity: descriptionRepairIdentity(fixture), descriptions: structuredClone(persisted) }];
  backgrounds = []; checkpoints = []; saved = []; translations = []; connects = 0;
  modelFailure = false; leadership = true; mutateDuringTranslation = undefined; routes = new Map();
  const register = (path: string, ...handlers: any[]) => { assert.equal(handlers[0], auth); routes.set(path, handlers.at(-1)); };
  await registerAiDescriptionRoutes({ post: register, get: register } as any, { requireAdmin: auth });
});
async function request(path: string, body: any, query = {}) {
  let status = 200, result: any;
  const headers: Record<string, string> = {};
  const res = Object.assign(new EventEmitter(), { writableFinished: false, headersSent: false,
    set: (key: string, value: string) => { headers[key] = value; return res; },
    status: (code: number) => { status = code; return res; },
    json: (value: any) => { result = value; res.writableFinished = true; return res; },
  });
  await routes.get(path)({ body, query, user: { id: 'fixture-admin' }, params: {} }, res);
  return { status, result, headers };
}
const previewPath = '/api/admin/stations/review-selected-description-repairs';
const startPath = '/api/admin/stations/repair-selected-descriptions';
const selection = () => ({ selectedStationIds: [fixture._id], sourceLanguage: 'en' });

test('selected review is read-only, bounded, private and never returns raw identity or starts a model request', async () => {
  const response = await request(previewPath, selection());
  assert.equal(response.status, 200); assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(response.result.languages, SITEMAP_PRIORITY_LANGUAGES.universal14);
  const row = response.result.rows[0];
  assert.equal(row.changes.length, 4); assert.ok(row.protectedLanguages.includes('ja'));
  assert.equal(row.englishSample, localized.en.full);
  assert.doesNotMatch(JSON.stringify(response.result), /example.invalid|stationuuid|manualEditFields|identity/);
  assert.equal(connects, 0); assert.equal(backgrounds.length, 0); assert.equal(translations.length, 0); assert.equal(saved.length, 0);
});

test('selected job repairs only reviewed gaps, uses all 14 target languages, and retains protected and valid source text', async () => {
  const response = await request(startPath, selection());
  assert.equal(response.status, 200); assert.equal(response.result.total, 1);
  assert.equal(translations.length, 0, 'job acceptance precedes model work');
  await backgrounds.shift()!();
  assert.equal(translations.length, 1); assert.equal(translations[0].source, 'en');
  assert.deepEqual(new Set(translations[0].targets), new Set(['fr', 'de']));
  assert.deepEqual(persisted.en, localized.en); assert.deepEqual(persisted.ja, localized.en);
  assert.deepEqual(persisted.fr, localized.fr); assert.deepEqual(persisted.de, localized.de);
  assert.equal(fixture.noIndex, true, 'AI content work never clears noindex');
  assert.ok(saved.every(input => input.actor === 'fixture-admin' && input.jobId === response.result.jobId));
  assert.equal(checkpoints.at(-1).status, 'completed'); assert.equal(checkpoints.at(-1).successCount, 1);
  let job: any;
  const res = { status: () => res, json: (value: any) => { job = value; } };
  await routes.get('/api/admin/stations/description-job-status/:jobId')({ params: { jobId: response.result.jobId } }, res);
  assert.deepEqual(job.targetLanguages, SITEMAP_PRIORITY_LANGUAGES.universal14);
});

test('invalid scopes and query parameters cannot start a global or paid job', async () => {
  for (const body of [{}, { ...selection(), languages: ['en'] }, { ...selection(), selectedStationIds: [] },
    { ...selection(), selectedStationIds: Array.from({ length: 101 }, (_, i) => String(i)) }]) {
    assert.equal((await request(startPath, body)).status, 400);
    assert.equal((await request(previewPath, body)).status, 400);
  }
  assert.equal((await request(startPath, selection(), { country: 'DE' })).status, 400);
  assert.equal(connects, 0); assert.equal(backgrounds.length, 0); assert.equal(saved.length, 0);
});

test('blocked peers and fully protected descriptions result in no work and no provider charges', async () => {
  reviewRows[0].reason = 'plausible-identity-peer';
  assert.equal((await request(startPath, selection())).result.total, 0);
  reviewRows[0].reason = 'eligible-for-content-repair'; reviewRows[0].identity.manualEditFields = { descriptions: true };
  assert.equal((await request(startPath, selection())).result.total, 0);
  assert.equal(backgrounds.length, 0); assert.equal(translations.length, 0); assert.equal(saved.length, 0);
});

test('changed reviewed identity and concurrent manual locale edits are not overwritten', async () => {
  await request(startPath, selection()); fixture.name = 'Changed while queued';
  await backgrounds.shift()!();
  assert.equal(translations.length, 0); assert.equal(saved.length, 0); assert.equal(checkpoints.at(-1).failedCount, 1);
  fixture.name = 'Fixture Radio'; checkpoints = [];
  await request(startPath, selection());
  const manual = { full: 'A concurrent manual article', meta: 'A concurrent manual summary' };
  mutateDuringTranslation = () => { persisted.fr = manual; };
  await backgrounds.shift()!();
  assert.deepEqual(persisted.fr, manual); assert.equal(checkpoints.at(-1).failedCount, 1);
});

test('provider failure retains local metadata repairs and records failure instead of retrying the paid job', async () => {
  modelFailure = true; await request(startPath, selection()); await backgrounds.shift()!();
  assert.equal(translations.length, 1); assert.equal(backgrounds.length, 0);
  assert.ok(persisted.es.meta); assert.doesNotMatch(persisted.hi.meta, /Tune in/);
  assert.equal(checkpoints.at(-1).failedCount, 1); assert.equal(checkpoints.at(-1).successCount, 0);
});

test('a running fill leader prevents overlapping selected work before model calls', async () => {
  leadership = false; const response = await request(startPath, selection());
  assert.equal(response.status, 409); assert.equal(backgrounds.length, 0); assert.equal(translations.length, 0);
});
