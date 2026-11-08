import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { normalizeCountryFilter, resolveToDbName } from '../src/utils/normalize-country';

const queries: any[] = [], entries = new Map<string, any>();
let databaseFails = false;
mock.module('../src/postgres-runtime', { namedExports: { getPostgresPool: () => ({ query: async (query: any) => {
  queries.push(query);
  if (databaseFails) throw new Error('fixture private database detail');
  const country = query.values[0];
  return { rows: !country || ['austria', 'germany', 'example land'].includes(country)
    ? [{ id: 'fixture', name: 'Fixture Radio', country, is_list_visible: true, source: { privateNotes: 'fixture private note' } }]
    : [] };
} }) } });
mock.module('../src/public-station-cache', { namedExports: { publicStationCache: {
  getOrSetSingleFlight: async (key: string, loader: () => Promise<unknown>) => {
    if (!entries.has(key)) entries.set(key, await loader());
    return entries.get(key);
  },
} } });
mock.module('../src/utils/logger', { namedExports: { logger: { error() {}, warn() {}, log() {} } } });
const { recommendationPoolScope } = await import('../src/services/recommendation-pool');
const { registerRegionsRecommendationsRoutes } = await import('../src/routes/regions-recommendations-routes');
const routes = new Map<string, (req: any, res: any) => Promise<void>>();
const middleware: any[] = [];
registerRegionsRecommendationsRoutes({
  use(_paths: string[], handler: any) { middleware.push(handler); },
  get(path: string, ...handlers: any[]) { routes.set(path, handlers.at(-1)); },
  post() {},
} as any, { requireAdmin() {}, normalizeCountryFilter });
const route = routes.get('/api/recommendations/pool')!;

beforeEach(() => { queries.length = 0; entries.clear(); databaseFails = false; });
after(() => mock.restoreAll());
async function request(query: Record<string, unknown>) {
  const req = { query, method: 'GET', path: '/api/recommendations/pool' };
  const res = {
    statusCode: 200, headers: {} as Record<string, string>, body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    set(key: string, value: string) { this.headers[key.toLowerCase()] = value; return this; },
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value; },
    json(body: any) { this.body = body; return this; },
  };
  for (const handler of middleware) handler(req, res, () => {});
  await route(req, res);
  return res;
}

for (const country of ['constructor', '__proto__', 'CONSTRUCTOR']) {
  test(`${country} is an unknown literal country, never an inherited alias`, () => {
    assert.equal(resolveToDbName(country), country);
    assert.equal(normalizeCountryFilter(country).country.$regex.source, country);
    assert.deepEqual(recommendationPoolScope(country, ''), { country, genres: [] });
  });

  test(`pool country=${country} keeps the unsupported-country empty-result contract`, async () => {
    const res = await request({ country });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { stations: [], total: 0 });
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].values, [country.toLowerCase()]);
  });
}

test('ISO, localized and native country names retain normalization and shared cache identity', async () => {
  for (const country of ['at', 'Austria', '  Austria  ', '\u00d6sterreich']) {
    const res = await request({ country });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, 1);
    assert.doesNotMatch(JSON.stringify(res.body), /private/);
  }
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, ['austria']);
  assert.equal(recommendationPoolScope('Deutschland', '').country, 'Germany');
  assert.equal(recommendationPoolScope('TR', '').country, 'T\u00fcrkiye');
});

test('unmapped names remain exact filters, not errors or global fallbacks', async () => {
  for (const country of ['Example Land', 'No Such Country', 'null']) {
    const res = await request({ country });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, country === 'Example Land' ? 1 : 0);
    assert.deepEqual(queries.at(-1).values, [country.toLowerCase()]);
    assert.match(queries.at(-1).text, /lower\(s.country\)=\$1/);
  }
  assert.equal(normalizeCountryFilter('Example [Land]').country.$regex.source, 'Example \\[Land\\]');
});

test('only the existing global inputs omit the country filter', async () => {
  for (const country of [undefined, '', '  ', 'all', 'ALL', 'Global']) {
    const res = await request({ country });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.total, 1);
  }
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, []);
});

test('invalid input shapes still return 400 without accessing the database', async () => {
  for (const query of [{ country: [] }, { country: {} }, { country: 'x'.repeat(101) },
    { country: 'Austria', genres: 'rock%' }, { country: 'Austria', genres: ['rock'] }]) {
    assert.equal((await request(query)).statusCode, 400);
  }
  assert.equal(queries.length, 0);
});

test('real upstream failures stay private uncached 503s, including for unknown countries', async () => {
  databaseFails = true;
  for (const country of ['Austria', 'No Such Country', 'constructor', '__proto__']) {
    const res = await request({ country });
    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['cdn-cache-control'], 'no-store');
    assert.equal(res.headers['cloudflare-cdn-cache-control'], 'no-store');
    assert.deepEqual(res.body, { error: 'Station data is temporarily unavailable' });
    assert.doesNotMatch(JSON.stringify(res.body), /private/);
  }
  assert.equal(queries.length, 4);
  assert.equal(entries.size, 0);
  databaseFails = false;
  assert.equal((await request({ country: 'Austria' })).statusCode, 200);
});
