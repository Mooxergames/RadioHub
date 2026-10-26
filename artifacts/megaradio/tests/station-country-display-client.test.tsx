import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACTIVE_SITEMAP_LANGUAGES, getStationCountryName, getStationCountryQuery } from '@workspace/seo-shared/seo-config';
import { getStationRelatedHeading } from '@workspace/seo-shared/station-page-copy';

const state = vi.hoisted(() => ({ language: 'en', related: vi.fn() }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  cleanPath: '/station/country-fixture', currentLanguage: state.language,
  getLocalizedUrl: (path: string) => `/${state.language}${path}`,
}) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  language: state.language, localeTranslations: {}, t: (_key: string, fallback: string) => fallback,
}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null, isAuthenticated: false }) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isPremium: true, isLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({
  currentStation: null, isPlaying: false, stationMeta: null, hasError: false,
  playStation: vi.fn(), pauseStation: vi.fn(), stopStation: vi.fn(),
}) }));
vi.mock('@/hooks/useStationRatings', () => ({ useStationRatings: () => ({ statsStatus: 'ready' }) }));
vi.mock('@/hooks/useStationRelatedStations', async importOriginal => ({
  ...await importOriginal<typeof import('../src/hooks/useStationRelatedStations')>(),
  useStationRelatedStations: state.related,
}));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/components/RouteBreadcrumbs', () => ({ useBreadcrumbLastItemName: vi.fn() }));
vi.mock('@/components/star-rating', () => ({ StarRating: () => null }));
vi.mock('@/components/ui/station-control-button-group', () => ({ default: () => null }));
vi.mock('@/components/ui/favorite-button', () => ({ default: () => null }));
vi.mock('@/components/ui/listening-timer', () => ({ ListeningTimer: () => null }));
import StationDetails from '../src/pages/stations/[id]';

const seed = { _id: 'country-id', slug: 'country-fixture', name: 'Country Fixture',
  url: 'https://fixture.invalid/live', country: 'Unknown', countryCode: 'GB', tags: 'news' };
let client: QueryClient;
beforeEach(() => {
  state.language = 'en';
  window.history.replaceState({}, '', '/en/station/country-fixture');
  client = new QueryClient({ defaultOptions: { queries: {
    queryFn: async () => [], retry: false, gcTime: 0,
  } } });
  state.related.mockReset();
  state.related.mockReturnValue({
    allSimilarStations: [{ ...seed, _id: 'similar', name: 'Similar News' }],
    allCountryStations: [{ ...seed, _id: 'country', name: 'Country News' }],
    loadingSimilar: false, loadingCountry: false, countryStationsTotal: 99,
  });
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
function mount(station = seed) {
  client.setQueryData(['/api/station/country-fixture'], station);
  return render(<QueryClientProvider client={client}><StationDetails /></QueryClientProvider>);
}

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: uses localized country labels/headings and stable API identities', language => {
  state.language = language;
  mount();
  const country = getStationCountryName(seed, language);
  expect(screen.getByRole('heading', { name: getStationRelatedHeading(language, 'country', country) })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: getStationRelatedHeading(language, 'country', '') })).toBeInTheDocument();
  expect(screen.getAllByText(country).length).toBeGreaterThan(0);
  expect(document.body.textContent).not.toContain('Unknown');
  expect(state.related).toHaveBeenCalledWith(expect.objectContaining({ _id: seed._id }), getStationCountryQuery(seed), 'country-fixture');
  fireEvent.click(screen.getByTestId('button-see-more-country'));
  fireEvent.click(screen.getByTestId('button-see-more-country'));
  expect(new URLSearchParams(window.location.search).get('country')).toBe(getStationCountryQuery(seed));
  expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

it('hides unknown-country rows, counts and country expansion even when related data still exists', () => {
  mount({ ...seed, countryCode: 'XX' });
  expect(screen.queryByTestId('button-see-more-country')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Country News/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  expect(state.related.mock.calls[0][1]).toBe('');
});
