import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { getLanguageFromPath } from '@workspace/seo-shared/seo-config';
import { isStationDirectoryPath } from '@workspace/seo-shared/station-directory';

vi.mock('@/lib/translation-navigation-prefetch', () => ({ prefetchNavigationTranslations: vi.fn() }));
vi.mock('@/components/lazy-routes', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/lazy-routes')>(),
  StationDetails: () => <h1>Station detail</h1>,
  GenreLanding: () => <h1>Genre detail</h1>,
  PrivacyPolicy: () => <h1>Privacy policy</h1>,
  TermsAndConditions: () => <h1>Terms and conditions</h1>,
  StationDirectory: () => <h1>Station directory</h1>,
  NotFound: () => <h1>Not found</h1>,
}));
import { PublicRouter } from '../src/App';

afterEach(cleanup);

it.each([
  ['/nl/radios/profiel', '/station/profiel', 'Station detail'],
  ['/sv/radios/profil', '/station/profil', 'Station detail'],
  ['/nl/sender/safe-fm', '/station/safe-fm', 'Station detail'],
  ['/rs/station/lorfm-30', '/station/lorfm-30', 'Station detail'],
  ['/rs/stanica/lorfm-30', '/station/lorfm-30', 'Station detail'],
  ['/hu/radios/exclusively-stevie-wonder', '/station/exclusively-stevie-wonder', 'Station detail'],
  ['/hu/radio/j1-gold', '/station/j1-gold', 'Station detail'],
  ['/nl/station/a', '/station/a', 'Station detail'],
  ['/nl/station/x', '/station/x', 'Station detail'],
  ['/nl/stations/a', '/stations/a', 'Station directory'],
  ['/nl/radios/x', '/stations/x', 'Station directory'],
  ['/nl/genre/pop', '/genres/pop', 'Genre detail'],
  ['/sv/zhanry/pop', '/genres/pop', 'Genre detail'],
  ['/nl/pages/privacy-policy/', '/privacy-policy', 'Privacy policy'],
  ['/sv/pages/terms-and-conditions/', '/terms-and-conditions', 'Terms and conditions'],
  ['/af/ontdek-musiek/album/1771020838', '/ontdek-musiek/album/1771020838', 'Not found'],
])('R6-01/02/05: real PublicRouter retains %s and selects its normalized page', async (path, internal, heading) => {
  localStorage.clear();
  window.history.replaceState({}, '', path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><PublicRouter /></QueryClientProvider>);
  expect(getLanguageFromPath(path)).toEqual({ language: 'en', cleanPath: internal });
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  expect(window.location.pathname).toBe(path);
  await act(async () => { window.history.pushState({}, '', '/nl/sender/another-fm'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(await screen.findByRole('heading', { name: 'Station detail' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/nl/sender/another-fm');
  view.unmount(); client.clear();
});

it('only retired explicit plural paths are directory routes; active locale aliases remain supported', () => {
  expect(isStationDirectoryPath('/station/a', false)).toBe(false);
  expect(isStationDirectoryPath('/stations/a', false)).toBe(true);
  expect(isStationDirectoryPath('/station/a')).toBe(true);
});
