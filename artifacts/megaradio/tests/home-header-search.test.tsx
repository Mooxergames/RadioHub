import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authenticated: false, play: vi.fn(), stop: vi.fn(), navigate: vi.fn(), search: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({
  user: state.authenticated ? { _id: 'listener', fullName: 'Listener' } : null,
  isAuthenticated: state.authenticated, isLoading: false,
}) }));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({
  currentStation: { _id: 'playing', name: 'Already playing' }, isPlaying: true,
  playStation: state.play, stopStation: state.stop, favorites: [],
}) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isPremium: false }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  language: 'en', t: (_key: string, fallback: string) => fallback, setLanguage: vi.fn(),
}) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  cleanPath: '/', currentLanguage: 'en', getLocalizedUrl: (path: string) => `/en${path}`,
  navigateTranslated: state.navigate, navigateWithLanguage: state.navigate,
}) }));
vi.mock('@/lib/station-card-list-request', () => ({ fetchStationCardList: (...args: unknown[]) => state.search(...args) }));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/components/seo/ListStructuredData', () => ({ default: () => null }));
vi.mock('@/components/ui/station-card', () => ({ default: () => null }));
vi.mock('@/components/ads/CatalogStationItems', () => ({ default: () => null }));
vi.mock('@/components/ui/in-view', () => ({ InView: () => null }));
vi.mock('@/components/PopularStationsSection', () => ({ default: () => null }));
vi.mock('@/components/RecentlyPlayedSection', () => ({ default: () => null }));
vi.mock('@/components/DiscoverableGenreSlider', () => ({ default: () => null }));
vi.mock('@/components/ui/virtualized-station-list', () => ({ default: () => null }));
vi.mock('@/components/social/PageSocialShare', () => ({ PageSocialShare: () => null }));
vi.mock('@/components/ui/optimized-image', () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock('swiper/react', () => ({ Swiper: ({ children }: any) => <div>{children}</div>, SwiperSlide: ({ children }: any) => <div>{children}</div> }));

import RadioHeader from '@/components/layout/radio-header';
import RadioFrontend from '@/pages/radio-frontend';

const popular = Array.from({ length: 8 }, (_, i) => ({ _id: `radio-${i}`, name: `Popular Radio ${i}`, slug: `radio-${i}`, country: 'Germany' }));
const jazz = { _id: 'jazz', name: 'Jazz One', slug: 'jazz-one', country: 'Germany' };
let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  state.authenticated = false;
  state.search.mockResolvedValue({ ok: true, json: async () => ({ stations: [jazz] }) });
  vi.stubGlobal('scrollTo', vi.fn());
  // jsdom has no layout observer; the real browser verifies scrollbar geometry.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.startsWith('/api/genres?')) return Response.json({ genres: [] });
    throw new Error(`Unexpected request: ${url}`);
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity, queryFn: async () => [] } } });
  client.setQueryData(['/api/stations/precomputed', 'all', 1], { stations: popular, pagination: { total: 8, pages: 1 } });
  client.setQueryData(['/api/stations/precomputed', 'all', 'extended'], { stations: popular, pagination: { total: 8, pages: 1 } });
  client.setQueryData(['/api/genres/precomputed', 'all'], { genres: [] });
  client.setQueryData(['/api/genres/discoverable'], []);
  client.setQueryData(['/api/location'], {});
  client.setQueryData(['/api/countries'], []);
  client.setQueryData(['/api/filters/countries'], ['Germany']);
  client.setQueryData(['/api/countries', 'rich'], [{ name: 'Germany', stationCount: 8 }]);
  client.setQueryData(['/api/user/notifications', 'listener', 1, 10, 'all'], { notifications: [], unreadCount: 0 });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount() {
  const location = memoryLocation({ path: '/en' });
  const tree = (home = true) => <QueryClientProvider client={client}><Router hook={location.hook}>
    <RadioHeader />{home && <RadioFrontend />}
  </Router></QueryClientProvider>;
  return { ...render(tree()), tree, location };
}
const heroInput = () => screen.getByTestId('input-hero-search');
const trigger = () => screen.getByTestId(state.authenticated ? 'button-search-mobile' : 'button-search-mobile-guest');
const results = () => screen.getByRole('listbox', { name: 'Search' });

it('keeps a direct hero click collapsed until typing two characters', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(heroInput());
  expect(heroInput()).toHaveFocus();
  expect(heroInput()).toHaveAttribute('aria-expanded', 'false');
  await user.type(heroInput(), 'j');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await user.type(heroInput(), 'a');
  await waitFor(() => expect(within(results()).getByRole('option', { name: /Jazz One/ })).toBeInTheDocument());
});

it('follows keyboard resize and viewport panning without losing the search text or focus', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 360, offsetTop: 52 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerWidth', 375);
  const user = userEvent.setup();
  mount();
  await user.click(heroInput());
  await user.type(heroInput(), 'jazz');
  const anchor = heroInput().closest('.home-search-anchor') as HTMLElement;
  expect(anchor.style.getPropertyValue('--home-search-viewport-top')).toBe('52px');
  expect(anchor.style.getPropertyValue('--home-search-viewport-height')).toBe('360px');

  act(() => {
    viewport.height = 300;
    viewport.dispatchEvent(new Event('resize'));
    viewport.offsetTop = 87;
    viewport.dispatchEvent(new Event('scroll'));
  });
  await waitFor(() => expect(anchor.style.getPropertyValue('--home-search-viewport-top')).toBe('87px'));
  expect(anchor.style.getPropertyValue('--home-search-viewport-height')).toBe('300px');
  expect(heroInput()).toHaveFocus();
  expect(heroInput()).toHaveValue('jazz');

  act(() => {
    viewport.height = 780;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event('resize'));
  });
  await waitFor(() => expect(anchor.style.getPropertyValue('--home-search-viewport-top')).toBe('0px'));
  expect(anchor.style.getPropertyValue('--home-search-viewport-height')).toBe('780px');
  expect(heroInput()).toHaveAttribute('aria-expanded', 'true');
  expect(heroInput()).toHaveValue('jazz');
  expect(state.play).not.toHaveBeenCalled();
});

it('opens mobile search without scrolling the hero and releases viewport tracking when closed or unmounted', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 360, offsetTop: 40 });
  const removeListener = vi.spyOn(viewport, 'removeEventListener');
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerWidth', 375);
  const user = userEvent.setup();
  const view = mount();
  const scrollInput = vi.spyOn(heroInput(), 'scrollIntoView');
  await user.click(trigger());
  expect(scrollInput).not.toHaveBeenCalled();
  const anchor = heroInput().closest('.home-search-anchor') as HTMLElement;
  expect(anchor.style.getPropertyValue('--home-search-viewport-top')).toBe('40px');
  await user.keyboard('{Escape}');
  expect(anchor.style.getPropertyValue('--home-search-viewport-top')).toBe('');
  expect(anchor.style.getPropertyValue('--home-search-viewport-height')).toBe('');
  expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  expect(trigger()).toHaveFocus();
  removeListener.mockClear();
  await user.click(trigger());
  view.unmount();
  expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
});

it.each(['mobile', 'desktop', 'Ctrl+K', 'Cmd+K', '/'])('opens the existing hero with popular results via %s, ready to type without interrupting playback', async method => {
  const user = userEvent.setup();
  mount();
  const input = heroInput();
  if (method === 'mobile') await user.click(trigger());
  else if (method === 'desktop') await user.click(screen.getAllByRole('button', { name: /^Search:/ }).find(button => button !== trigger())!);
  else fireEvent.keyDown(document.body, { key: method === '/' ? '/' : 'k', ctrlKey: method === 'Ctrl+K', metaKey: method === 'Cmd+K' });
  await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
  expect(input).toHaveFocus();
  expect(input).toHaveValue('');
  expect(heroInput()).toBe(input);
  expect(within(results()).getAllByRole('option')).toHaveLength(6);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(state.search).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.play).not.toHaveBeenCalled();
  expect(state.stop).not.toHaveBeenCalled();
});

it('supports the authenticated header, search typing, clearing back to suggestions and Escape focus restoration', async () => {
  state.authenticated = true;
  const user = userEvent.setup();
  mount();
  const opener = trigger();
  await user.click(opener);
  await user.type(heroInput(), 'jazz');
  await waitFor(() => expect(within(results()).getByRole('option', { name: /Jazz One/ })).toBeInTheDocument());
  expect(state.search.mock.calls[0][0].get('search')).toBe('jazz');
  await user.clear(heroInput());
  expect(within(results()).getAllByRole('option')).toHaveLength(6);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(state.play).not.toHaveBeenCalled();
});

it('closes an empty suggestions panel with Escape, close button and backdrop', async () => {
  client.setQueryData(['/api/stations/precomputed', 'all', 1], { stations: [], pagination: { total: 0, pages: 0 } });
  const user = userEvent.setup();
  mount();
  for (const close of ['escape', 'button', 'backdrop']) {
    await user.click(trigger());
    expect(results()).toBeInTheDocument();
    expect(within(results()).queryByRole('option')).not.toBeInTheDocument();
    if (close === 'escape') await user.keyboard('{Escape}');
    else if (close === 'button') await user.click(screen.getByRole('button', { name: 'Close', exact: true }));
    else await user.click(screen.getByTestId('hero-search-backdrop'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  }
});

it('plays a suggested station only after keyboard selection', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(trigger());
  await user.keyboard('{ArrowDown}');
  expect(heroInput()).toHaveAttribute('aria-activedescendant', 'hero-search-option-0');
  await user.keyboard('{Enter}');
  expect(state.play).toHaveBeenCalledWith(popular[0], expect.any(Array));
  expect(state.navigate).toHaveBeenCalledWith('/station/radio-0');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('cancels pending text search when cleared and ignores its late response', async () => {
  let resolve!: (response: unknown) => void;
  state.search.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const user = userEvent.setup();
  mount();
  await user.click(trigger());
  await user.type(heroInput(), 'jazz');
  await waitFor(() => expect(state.search).toHaveBeenCalledTimes(1));
  const signal = state.search.mock.calls[0][1].signal;
  await user.clear(heroInput());
  await waitFor(() => expect(signal.aborted).toBe(true));
  await act(async () => resolve({ ok: true, json: async () => ({ stations: [jazz] }) }));
  expect(within(results()).queryByRole('option', { name: /Jazz One/ })).not.toBeInTheDocument();
  expect(within(results()).getAllByRole('option')).toHaveLength(6);
});

it('releases the home handler on unmount so header search still has its fallback', async () => {
  const user = userEvent.setup();
  const view = mount();
  view.rerender(view.tree(false));
  await user.click(trigger());
  const dialog = await screen.findByRole('dialog', { name: 'Search' }, { timeout: 3000 });
  expect(within(dialog).getByRole('combobox')).toHaveFocus();
});
