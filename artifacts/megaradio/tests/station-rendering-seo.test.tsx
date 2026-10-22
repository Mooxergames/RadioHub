import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getQueryFn } from '../src/lib/queryClient';
import { ServerSeoHeadContext } from '../src/utils/ssr-seo-head';

const state = vi.hoisted(() => ({ language: 'en', slug: 'fixture-radio' }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  cleanPath: `/station/${state.slug}`, currentLanguage: state.language,
  getLocalizedUrl: (path: string) => `/${state.language}${path}`, navigateWithLanguage: vi.fn(),
}) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  language: state.language, localeTranslations: {},
  t: (_key: string, fallback: string) => fallback,
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
  useStationRelatedStations: () => ({ allSimilarStations: [], allCountryStations: [], countryStationsTotal: 0 }),
}));
vi.mock('@/components/RouteBreadcrumbs', () => ({ useBreadcrumbLastItemName: vi.fn() }));
vi.mock('@/components/star-rating', () => ({ StarRating: () => null }));
vi.mock('@/components/ui/station-control-button-group', () => ({ default: () => null }));
vi.mock('@/components/ui/favorite-button', () => ({ default: () => null }));
vi.mock('@/components/ui/listening-timer', () => ({ ListeningTimer: () => null }));
import StationDetails from '../src/pages/stations/[id]';

const article = 'Fixture Radio broadcasts local news and interviews from its studios.';
const seed = { _id: 'fixture-id', slug: 'fixture-radio', name: 'Fixture Radio',
  url: 'https://radio.invalid/live', descriptions: { en: article } };
let client: QueryClient;
let finish: (response: Response) => void;
let fail: (error: Error) => void;

beforeEach(() => {
  state.language = 'en'; state.slug = seed.slug;
  window.history.replaceState({}, '', '/en/station/fixture-radio');
  document.head.innerHTML = `<title>Fixture Radio live</title>
    <link rel="canonical" data-managed="seo-head" href="https://themegaradio.com/en/station/fixture-radio">
    <meta name="robots" content="index, follow">
    <link rel="alternate" hreflang="en" href="https://themegaradio.com/en/station/fixture-radio">`;
  client = new QueryClient({ defaultOptions: { queries: {
    queryFn: getQueryFn({ on401: 'throw' }), retry: false, gcTime: 0,
  } } });
  const pending = new Promise<Response>((resolve, reject) => { finish = resolve; fail = reject; });
  vi.stubGlobal('fetch', vi.fn((url: string) => url === `/api/station/${state.slug}`
    ? pending : Promise.resolve(Response.json(url.startsWith('/api/translations') ? {} : []))));
});
afterEach(() => {
  cleanup(); client.clear(); vi.unstubAllGlobals();
  document.getElementById('station-bootstrap')?.remove();
  document.head.replaceChildren();
});

function bootstrap(station: Record<string, unknown> = seed, language = 'en') {
  const script = document.createElement('script');
  script.id = 'station-bootstrap'; script.type = 'application/json';
  script.textContent = JSON.stringify({ language, station });
  document.body.append(script);
}
function mount() {
  return render(<QueryClientProvider client={client}><ServerSeoHeadContext.Provider value={true}>
    <StationDetails />
  </ServerSeoHeadContext.Provider></QueryClientProvider>);
}
function expectArticle() {
  expect(screen.getByRole('heading', { level: 1, name: seed.name })).toBeInTheDocument();
  expect(screen.getAllByText(article)).toHaveLength(1);
  expect(screen.queryByText('Station not found.')).not.toBeInTheDocument();
}

it('keeps the matching SSR article and head while the complete API request is slow', () => {
  bootstrap(); const head = document.head.innerHTML; mount();
  expectArticle();
  expect(document.head.innerHTML).toBe(head);
  expect(client.getQueryData(['/api/station/fixture-radio'])).toBeUndefined();
});

it.each([408, 429, 500, 502, 503, 'network'] as const)('retains valid SSR content after a %s enrichment failure', async kind => {
  bootstrap(); const head = document.head.innerHTML; mount();
  expectArticle();
  await act(async () => {
    if (kind === 'network') fail(new TypeError('Failed to fetch'));
    else finish(new Response('Temporarily unavailable', { status: kind }));
  });
  await waitFor(() => expect(client.getQueryState(['/api/station/fixture-radio'])?.status).toBe('error'));
  expectArticle();
  expect(document.head.innerHTML).toBe(head);
  expect(client.getQueryData(['/api/station/fixture-radio'])).toBeUndefined();
});

it.each([400, 401, 403, 404, 410])('does not resurrect a station after an authoritative %s response', async status => {
  bootstrap(); mount();
  await act(async () => { finish(new Response('Gone', { status })); });
  await waitFor(() => expect(client.getQueryState(['/api/station/fixture-radio'])?.status).toBe('error'));
  expect(screen.queryByRole('heading', { level: 1, name: seed.name })).not.toBeInTheDocument();
  expect(screen.queryByText(article)).not.toBeInTheDocument();
});

it('replaces observer-only SSR data with the complete API record', async () => {
  bootstrap(); mount();
  const full = { ...seed, descriptions: { en: { full: 'Updated station article from the API.' } } };
  await act(async () => { finish(Response.json(full)); });
  await waitFor(() => expect(screen.getAllByText(full.descriptions.en.full)).toHaveLength(1));
  expect(screen.queryByText(article)).not.toBeInTheDocument();
  expect(client.getQueryData(['/api/station/fixture-radio'])).toEqual(full);
});

it('accepts a successful retry after retaining the SSR article through a failure', async () => {
  bootstrap(); mount();
  await act(async () => { finish(new Response('Temporarily unavailable', { status: 503 })); });
  await waitFor(() => expect(client.getQueryState(['/api/station/fixture-radio'])?.status).toBe('error'));
  expectArticle();
  const full = { ...seed, descriptions: { en: 'Recovered station article.' } };
  vi.mocked(fetch).mockResolvedValue(Response.json(full));
  await act(async () => { await client.refetchQueries({ queryKey: ['/api/station/fixture-radio'] }); });
  await waitFor(() => expect(screen.getAllByText(full.descriptions.en)).toHaveLength(1));
  expect(client.getQueryData(['/api/station/fixture-radio'])).toEqual(full);
});

it('does not change an SSR noindex decision or create alternates during an API outage', async () => {
  bootstrap();
  document.querySelector('meta[name="robots"]')!.setAttribute('content', 'noindex, follow');
  document.querySelector('link[hreflang]')!.remove();
  const head = document.head.innerHTML; mount();
  await act(async () => { finish(new Response('Temporarily unavailable', { status: 503 })); });
  await waitFor(() => expect(client.getQueryState(['/api/station/fixture-radio'])?.status).toBe('error'));
  expectArticle();
  expect(document.head.innerHTML).toBe(head);
});

it.each(['station', 'language'])('does not leak the SSR article to another %s during failed navigation', async kind => {
  bootstrap(); const view = mount();
  if (kind === 'station') state.slug = 'another-radio';
  else state.language = 'de';
  window.history.replaceState({}, '', `/${state.language}/station/${state.slug}`);
  view.rerender(<QueryClientProvider client={client}><ServerSeoHeadContext.Provider value={true}>
    <StationDetails />
  </ServerSeoHeadContext.Provider></QueryClientProvider>);
  await act(async () => { finish(new Response('Temporarily unavailable', { status: 503 })); });
  await waitFor(() => expect(client.getQueryState([`/api/station/${state.slug}`])?.status).toBe('error'));
  expect(screen.queryByText(article)).not.toBeInTheDocument();
});

it('renders the legacy description used by SSR instead of replacing it with generic copy', async () => {
  mount();
  await act(async () => { finish(Response.json({ ...seed, descriptions: {}, description: article })); });
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: seed.name })).toBeInTheDocument());
  expect(screen.getAllByText(article)).toHaveLength(1);
});

it('does not replace the localized SSR legacy article with an unrelated English fallback', async () => {
  state.language = 'de';
  window.history.replaceState({}, '', '/de/sender/fixture-radio');
  mount();
  const localized = 'Dieser Sender bietet Nachrichten und Interviews aus der Region.';
  await act(async () => { finish(Response.json({ ...seed, description: localized })); });
  await waitFor(() => expect(screen.getAllByText(localized)).toHaveLength(1));
  expect(screen.queryByText(article)).not.toBeInTheDocument();
});

it('keeps a slow request without SSR data in loading state, not station-not-found', () => {
  mount();
  expect(screen.getByText('Loading station...')).toBeInTheDocument();
  expect(screen.queryByText('Station not found.')).not.toBeInTheDocument();
});

it('does not turn an API outage without matching SSR data into a station-not-found message', async () => {
  bootstrap({ ...seed, slug: 'another-radio' }); mount();
  await act(async () => { finish(new Response('Temporarily unavailable', { status: 503 })); });
  expect(await screen.findByText('Connection error. Please try again.')).toBeInTheDocument();
  expect(screen.queryByText('Station not found.')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1, name: seed.name })).not.toBeInTheDocument();
});

it('renders the entire original article once before any More interaction', () => {
  const finalSentence = 'The distinctive final programme detail is available without a click.';
  const full = `${'Station-specific programme information. '.repeat(20)}${finalSentence}`;
  bootstrap({ ...seed, descriptions: { en: full } }); mount();
  const paragraphs = screen.getAllByText(full);
  expect(paragraphs).toHaveLength(1);
  expect(full.indexOf(finalSentence)).toBeGreaterThan(470);
  expect(paragraphs[0].textContent).toBe(full);
  expect(paragraphs[0]).toHaveClass('line-clamp-3');
  expect(paragraphs[0]).not.toHaveClass('hidden');
  expect(paragraphs[0]).not.toHaveClass('md:hidden');
  expect(paragraphs[0]).not.toHaveAttribute('aria-hidden');
});

it('prefers the current locale full article over both legacy and English content', async () => {
  state.language = 'de';
  window.history.replaceState({}, '', '/de/sender/fixture-radio');
  const local = 'Das vollstaendige lokale Programm mit Nachrichten und Interviews.';
  mount();
  await act(async () => { finish(Response.json({ ...seed,
    description: 'Legacy text should not replace the local article.',
    descriptions: { en: article, de: { full: local, meta: 'Only metadata, not the article.' } },
  })); });
  await waitFor(() => expect(screen.getAllByText(local)).toHaveLength(1));
  expect(screen.queryByText(article)).not.toBeInTheDocument();
  expect(screen.queryByText('Legacy text should not replace the local article.')).not.toBeInTheDocument();
  expect(screen.queryByText('Only metadata, not the article.')).not.toBeInTheDocument();
});
