import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStationRelatedStations } from '../src/hooks/useStationRelatedStations';
import { getStationCountryQuery } from '@workspace/seo-shared/seo-config';

type Request = { url: URL; signal: AbortSignal; resolve: (value: any) => void };
let requests: Request[];
beforeEach(() => {
  requests = [];
  vi.stubGlobal('fetch', vi.fn((url: string, options: RequestInit) => new Promise(resolve => {
    requests.push({ url: new URL(url, 'https://fixture.invalid'), signal: options.signal!, resolve });
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (request: Request, prefix: string) => act(async () => {
  request.resolve({ ok: true, json: async () => ({
    data: Array.from({ length: 12 }, (_, i) => ({ _id: `${prefix}-${i}`, tags: 'rock' })), pagination: { total: 800 },
  }) });
});
const seed = { _id: 'same', country: 'Austria', countryCode: 'AT', tags: 'rock' };

it('hides completed rows/count before effects on Known -> Unknown and never requests a sentinel', async () => {
  const snapshots: ReturnType<typeof useStationRelatedStations>[] = [];
  const view = renderHook(({ station }) => {
    const value = useStationRelatedStations(station, station.country);
    snapshots.push(value);
    return value;
  }, { initialProps: { station: seed } });
  await response(requests[0], 'similar');
  await response(requests[1], 'country');
  expect(view.result.current.countryStationsTotal).toBe(800);
  snapshots.length = 0;
  view.rerender({ station: { ...seed, country: 'Unknown', countryCode: 'XX', tags: '' } });
  for (const value of snapshots) {
    expect(value.allCountryStations).toEqual([]);
    expect(value.allSimilarStations).toEqual([]);
    expect(value.countryStationsTotal).toBe(0);
    expect(value.loadingCountry).toBe(false);
  }
  expect(requests).toHaveLength(2);
});

it('invalidates both scopes for an ISO-only change and rejects late response bodies', async () => {
  let finish!: (body: any) => void;
  const body = new Promise(resolve => { finish = resolve; });
  const snapshots: ReturnType<typeof useStationRelatedStations>[] = [];
  const view = renderHook(({ station }) => {
    const value = useStationRelatedStations(station, 'Austria');
    snapshots.push(value);
    return value;
  }, { initialProps: { station: seed } });
  await response(requests[0], 'old-similar');
  await act(async () => { requests[1].resolve({ ok: true, json: () => body }); });
  const old = [...requests];
  snapshots.length = 0;
  view.rerender({ station: { ...seed, countryCode: 'DE' } });
  expect(old.every(request => request.signal.aborted)).toBe(true);
  expect(snapshots.every(value => value.allSimilarStations.length === 0 && value.allCountryStations.length === 0 && value.countryStationsTotal === 0)).toBe(true);
  expect(requests).toHaveLength(4);
  await act(async () => { finish({ data: [{ _id: 'late' }], pagination: { total: 999 } }); });
  expect(view.result.current.allCountryStations).toEqual([]);
  expect(view.result.current.countryStationsTotal).toBe(0);
  await response(requests[2], 'new-similar');
  await response(requests[3], 'new-country');
  expect(view.result.current.allCountryStations[0]._id).toBe('new-country-0');
});

it('uses valid ISO for unknown source country and stable selected-country identities', () => {
  renderHook(() => useStationRelatedStations({ ...seed, country: 'Unknown' }, 'AT'));
  expect(requests.map(request => request.url.searchParams.get('countryName'))).toEqual(['Austria', 'Austria']);
  expect(requests.every(request => request.url.searchParams.get('slim') === '1')).toBe(true);
});

it.each(['Turkey', 'Türkiye', 'United Kingdom', 'The United Kingdom Of Great Britain And Northern Ireland'])('preserves accepted legacy API country %s', country => {
  renderHook(() => useStationRelatedStations({ ...seed, country, countryCode: undefined }, country));
  expect(requests.map(request => request.url.searchParams.get('countryName'))).toEqual([country, country]);
});

it('clears pending known-country requests and ignores late resolutions after country becomes unknown', async () => {
  const view = renderHook(({ station }) => useStationRelatedStations(station, station.country), { initialProps: { station: seed } });
  const old = [...requests];
  view.rerender({ station: { ...seed, country: 'Unknown', countryCode: 'ZZ', tags: '' } });
  expect(old.every(request => request.signal.aborted)).toBe(true);
  await response(old[0], 'late-similar');
  await response(old[1], 'late-country');
  expect(requests).toHaveLength(2);
  expect(view.result.current).toMatchObject({ allSimilarStations: [], allCountryStations: [], countryStationsTotal: 0, loadingCountry: false });
});

it('clears known-country rows/counts with unchanged tags while allowing only the global similar fallback', async () => {
  const view = renderHook(({ station }) => useStationRelatedStations(station, station.country), { initialProps: { station: seed } });
  await response(requests[0], 'old-similar');
  await response(requests[1], 'old-country');
  view.rerender({ station: { ...seed, country: 'Unknown', countryCode: 'ZZ' } });
  expect(view.result.current).toMatchObject({ allSimilarStations: [], allCountryStations: [], countryStationsTotal: 0, loadingCountry: false });
  expect(requests.slice(2).map(request => request.url.searchParams.get('countryName'))).toEqual(['global']);
});

it('changes the API country identity for an ISO-only transition with a sentinel source name', () => {
  const station = { ...seed, country: 'Unknown' };
  const view = renderHook(({ station }) => useStationRelatedStations(station, getStationCountryQuery(station)), { initialProps: { station } });
  const old = [...requests];
  view.rerender({ station: { ...station, countryCode: 'DE' } });
  expect(old.every(request => request.signal.aborted)).toBe(true);
  expect(requests.map(request => request.url.searchParams.get('countryName'))).toEqual(['Austria', 'Austria', 'Germany', 'Germany']);
  expect(view.result.current).toMatchObject({ allSimilarStations: [], allCountryStations: [], countryStationsTotal: 0 });
});
