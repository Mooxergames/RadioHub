import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

const state = vi.hoisted(() => ({
  currentStation: {} as Record<string, any>,
  searchStations: [] as Array<Record<string, any>>,
  loadMedia: vi.fn(), requestSession: vi.fn(), playStation: vi.fn(), stopStation: vi.fn(),
}));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({
  currentStation: state.currentStation, stationMeta: { title: 'Live fixture track', artist: 'Fixture artist' },
  playStation: state.playStation, stopStation: state.stopStation,
}) }));
vi.mock('@/hooks/useChromecast', () => ({ useChromecast: () => ({
  isAvailable: true, isConnected: false, requestSession: state.requestSession, loadMedia: state.loadMedia,
}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  currentLanguage: 'en', getLocalizedUrl: (path: string) => `/en${path}`,
}) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  t: (_key: string, fallback?: string) => fallback || '',
}) }));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@tanstack/react-query', () => ({ useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
  data: queryKey[0] === '/api/stations/precomputed' ? { stations: state.searchStations }
    : queryKey[0] === '/api/genres' ? { genres: [] } : [],
  isFetching: false,
}) }));

const apiOrigin = 'https://api.themegaradio.com';
vi.stubEnv('VITE_API_BASE_URL', apiOrigin);
const { getImageUrl, normalizeFaviconUrl, safeBase64Encode } = await import('../src/lib/utils');
const { getStationLogoUrl } = await import('../src/components/ui/station-logo');
const { default: MetaActionsButtonGroup } = await import('../src/components/ui/meta-actions-button-group');
const { default: SearchPage } = await import('../src/pages/search');

const s3 = 'https://megaradio-station-logos.s3.eu-north-1.amazonaws.com';
const folder = 'fixture-radio_11ab1234';
const variant = '00192c50-142c-4a15-abc0-a2ef963cea1a';
const rootPath = `/station-logos/${folder}/logo-256.webp`;
const nestedPath = `/station-logos/${folder}/variants/${variant}/logo-96.webp`;

beforeEach(() => {
  vi.clearAllMocks();
  state.currentStation = { _id: 'fixture', name: 'Fixture Radio', url: 'https://audio.example.invalid/live',
    logoAssets: { webp256: s3 + rootPath }, favicon: s3 + nestedPath };
  state.searchStations = [];
  state.requestSession.mockResolvedValue(undefined);
  state.loadMedia.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network expected in logo consumer tests'); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});
afterAll(() => vi.unstubAllEnvs());

it.each([rootPath, nestedPath])('helpers keep trusted logo %s on the web origin, not the configured API or image proxy', path => {
  const source = s3 + path;
  expect(getImageUrl(source)).toBe(path);
  expect(normalizeFaviconUrl(source)).toBe(path);
  expect(getStationLogoUrl({ name: 'Fixture Radio', logoAssets: { webp96: source } })).toBe(path);
  expect(getStationLogoUrl({ name: 'Fixture Radio', favicon: source })).toBe(path);
  expect(getStationLogoUrl({ name: 'Fixture Radio', localImagePath: source })).toBe(path);
  expect(normalizeFaviconUrl(path)).toBe(path);
});

it.each([
  'https://other.s3.eu-north-1.amazonaws.com/station-logos/fixture/logo-96.webp',
  'https://logos.example/fixture.png',
  `${s3}${rootPath}?X-Amz-Signature=fixture`,
  `${s3}/station-logos/${folder}/original.png`,
  `${apiOrigin}${rootPath}`,
])('unknown, signed, original and API-host assets retain their existing behavior: %s', source => {
  expect(getStationLogoUrl({ name: 'Fixture Radio', logoAssets: { webp96: source } })).toBe(source);
  expect(getImageUrl(source)).toBe(source);
  expect(normalizeFaviconUrl(source)).toBe(`${apiOrigin}/api/image/${safeBase64Encode(source)}`);
});

it('preserves local filename resolution, placeholder and data-image behavior', () => {
  expect(getStationLogoUrl({ name: 'Fixture Radio', logoAssets: { folder, webp96: 'logo-96.webp' } }))
    .toBe(`${apiOrigin}/station-logos/${folder}/logo-96.webp`);
  expect(getStationLogoUrl({ name: 'Fixture Radio', logoAssets: { webp96: nestedPath } }))
    .toBe(`${apiOrigin}${nestedPath}`);
  expect(normalizeFaviconUrl('/legacy.png')).toBe('/legacy.png');
  expect(getImageUrl('data:image/png;base64,fixture')).toBe('data:image/png;base64,fixture');
  expect(normalizeFaviconUrl('data:image/png;base64,fixture')).toBe('data:image/png;base64,fixture');
  expect(getImageUrl(undefined)).toBe('/images/no-image.webp');
  expect(normalizeFaviconUrl(null)).toBe('/images/no-image.webp');
});

it.each(['optimized', 'favicon', 'external', 'fallback'])('Cast resolves %s artwork without changing stream selection or playback', async kind => {
  if (kind !== 'optimized') delete state.currentStation.logoAssets;
  if (kind === 'external') state.currentStation.favicon = 'https://logos.example/fixture.png';
  if (kind === 'fallback') delete state.currentStation.favicon;
  render(<MetaActionsButtonGroup />);
  fireEvent.click(screen.getByTestId('chromecast-button'));
  await waitFor(() => expect(state.loadMedia).toHaveBeenCalledTimes(1));
  const expected = kind === 'optimized' ? location.origin + rootPath
    : kind === 'favicon' ? location.origin + nestedPath
    : kind === 'external' ? state.currentStation.favicon : `${location.origin}/images/logo-icon.webp`;
  expect(state.loadMedia).toHaveBeenCalledWith('https://audio.example.invalid/live', {
    title: 'Live fixture track', artist: 'Fixture artist', stationName: 'Fixture Radio', imageUrl: expected,
  });
  expect(state.requestSession).toHaveBeenCalledTimes(1);
  expect(state.playStation).not.toHaveBeenCalled();
  expect(state.stopStation).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([s3 + rootPath, s3 + nestedPath, 'https://logos.example/fixture.png'])('public search normalizes %s and preserves its explicit decorative alt', source => {
  window.history.replaceState({}, '', '/en/search?q=fixture');
  state.searchStations = [{ _id: 'fixture', name: 'Fixture Radio', slug: 'fixture-radio', favicon: source }];
  const location = memoryLocation({ path: '/en/search' });
  const { container } = render(<Router hook={location.hook}><SearchPage /></Router>);
  const image = container.querySelector('img')!;
  expect(image).toHaveAttribute('src', source.startsWith(s3) ? source.slice(s3.length) : source);
  expect(image).toHaveAttribute('alt', '');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByTestId('link-station-fixture-radio')).toHaveAttribute('href', '/en/station/fixture-radio');
  expect(fetch).not.toHaveBeenCalled();
});

it('home/detail emission and active MediaSession use the shared normalizer at their existing URL boundaries', () => {
  const source = (file: string) => readFileSync(path.resolve(process.cwd(), 'src', file), 'utf8');
  const home = source('pages/radio-frontend.tsx');
  expect(home).toMatch(/<OptimizedImage\s+src=\{normalizePublicStationLogoUrl\(/);
  expect(home).toContain("v.startsWith('http') || v.startsWith('/') ? v");
  expect(home).toContain('alt={`${station.name} favicon`}');
  const detail = source('pages/stations/[id].tsx');
  expect(detail).toMatch(/return normalizePublicStationLogoUrl\(value[\s\S]*?linkedStation\.favicon \|\| '\/images\/no-image\.webp'\)/);
  expect(detail).toContain("value.startsWith('http') || value.startsWith('/') ? value");
  expect(detail).toContain('alt={getStationImageAlt(linkedStation, language, t)}');
  const player = source('hooks/useGlobalPlayer.tsx');
  expect(player).toContain('return normalizePublicStationLogoUrl(station.favicon);');
  expect(player).toContain('return getStreamProxyUrl(`/api/image/${encodedUrl}`);');
  expect(player).toContain("return '/images/logo-icon.webp';");
});
