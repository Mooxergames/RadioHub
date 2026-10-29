import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router } from 'wouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { translateUrl } from '@workspace/seo-shared/url-translations';

let initialGuard: (url: string) => boolean;
vi.mock('@/utils/ssr-seo-head', async importOriginal => ({
  ...await importOriginal<typeof import('../src/utils/ssr-seo-head')>(),
  preserveInitialSsrHead: (url: string) => initialGuard(url),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  language: window.location.pathname.split('/')[1], localeTranslations: {},
  t: (key: string, fallback?: string) => fallback || key,
}) }));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({
  currentStation: null, isPlaying: false, playStation: vi.fn(), stopStation: vi.fn(),
}) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/favorite-button', () => ({ default: () => null }));

import { createInitialSsrHeadGuard } from '../src/utils/ssr-seo-head';
import { SeoPageWrapper } from '../src/components/SeoPageWrapper';
import { SeoHead } from '../src/components/SeoHead';
import GenreLanding from '../src/pages/genres/genre-landing';
import { useSeoRouting } from '../src/hooks/useSeoRouting';

const origin = window.location.origin;
const stationList = {
  '@type': 'ItemList', numberOfItems: 12,
  itemListElement: Array.from({ length: 12 }, (_, index) => ({
    '@type': 'ListItem', position: index + 1,
    item: { '@type': 'RadioBroadcastService', name: `SSR ${index}`, url: `${origin}/en/station/ssr-${index}` },
  })),
};
const global = [
  { '@type': 'WebSite', '@id': `${origin}/#website`, name: 'Mega Radio' },
  { '@type': 'Organization', '@id': `${origin}/#organization`, name: 'Mega Radio' },
];
const breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Genres' }] };
const collection = { '@type': 'CollectionPage', name: 'Pop', url: `${origin}/en/genres/pop`, mainEntity: stationList };
const structuredData = { global, page: [stationList, collection, breadcrumb] };
const payload = (title: string) => ({
  seoTags: { title, description: 'Current page', canonical: `${origin}${window.location.pathname}${window.location.search}`, robots: 'index, follow' },
  structuredData,
});
let client: QueryClient;
let stationMode: 'ready' | 'loading' | 'empty' | 'error';
let requests: URL[];
let pendingSeo: Map<string, (response: Response) => void>;

function navigate(url: string, replace = false) {
  act(() => {
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
function seedSsr(url = '/en/genres/pop') {
  window.history.replaceState({}, '', url);
  initialGuard = createInitialSsrHeadGuard(url);
  document.head.innerHTML = `<title>SSR Pop</title><link rel="canonical" data-managed="seo-head" href="${origin}${url}">`;
  for (const [scope, schemas] of Object.entries(structuredData)) {
    for (const schema of schemas) {
      const node = document.createElement('script');
      node.type = 'application/ld+json'; node.dataset.managed = 'seo-structured-data'; node.dataset.schemaScope = scope;
      node.textContent = JSON.stringify(schema); document.head.appendChild(node);
    }
  }
  const thirdParty = document.createElement('script');
  thirdParty.id = 'third-party'; thirdParty.type = 'application/ld+json';
  thirdParty.textContent = JSON.stringify(stationList); document.head.appendChild(thirdParty);
}
function pageSchemas() {
  return [...document.querySelectorAll('script[data-managed="seo-structured-data"][data-schema-scope="page"]')]
    .map(node => JSON.parse(node.textContent || '{}'));
}
function expectNoStationLists() {
  expect(pageSchemas().some(schema => schema['@type'] === 'ItemList' || schema.mainEntity?.['@type'] === 'ItemList')).toBe(false);
}
function Content({ country }: { country: string }) {
  const { englishPath } = useSeoRouting();
  return <SeoPageWrapper>
    {englishPath.startsWith('/genres/')
      ? <Route path="/:lang/:section/:slug"><GenreLanding selectedCountry={country} /></Route>
      : <><SeoHead pageType="station" stationData={null} /><span>Station route</span></>}
  </SeoPageWrapper>;
}
function tree(country = localStorage.getItem('selectedCountry') || 'all') {
  return <StrictMode><QueryClientProvider client={client}><Router><Content country={country} /></Router></QueryClientProvider></StrictMode>;
}
function stationLinks() {
  return [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/station/"]')];
}
async function expectStations(country: string, page = 1) {
  await screen.findByRole('heading', { name: `Station ${country} ${page} 0` });
  expect(new Set(stationLinks().map(link => link.href)).size).toBe(15);
  expect(stationLinks().every(link => link.href.includes(`/${country.toLowerCase()}-${page}-`))).toBe(true);
  expectNoStationLists();
}

beforeEach(() => {
  localStorage.clear(); localStorage.setItem('selectedCountry', 'Turkey');
  requests = []; pendingSeo = new Map(); stationMode = 'ready';
  seedSsr();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn((input: string) => {
    const url = new URL(input, origin); requests.push(url);
    if (url.pathname === '/api/seo/page-data') return new Promise<Response>(resolve => pendingSeo.set(url.searchParams.get('url')!, resolve));
    if (url.pathname.includes('/slug/')) return Promise.resolve(Response.json({ name: 'Pop', slug: 'pop' }));
    if (url.pathname.endsWith('/stations')) {
      if (stationMode === 'loading') return new Promise<Response>(() => {});
      if (stationMode === 'error') return Promise.resolve(new Response(null, { status: 503 }));
      const country = url.searchParams.get('country') || 'all';
      const page = Number(url.searchParams.get('page') || 1);
      return Promise.resolve(Response.json({
        stations: stationMode === 'empty' ? [] : Array.from({ length: 15 }, (_, index) => ({
          _id: `${country}-${page}-${index}`, slug: `${country.toLowerCase()}-${page}-${index}`,
          name: `Station ${country} ${page} ${index}`, country,
        })), total: stationMode === 'empty' ? 0 : 30, page, pages: stationMode === 'empty' ? 0 : 2,
      }));
    }
    return Promise.resolve(Response.json({}));
  }));
  client = new QueryClient({ defaultOptions: { queries: {
    retry: false, gcTime: Infinity,
    queryFn: async ({ queryKey, signal }) => {
      const response = await fetch(String(queryKey[0]), { signal });
      if (!response.ok) throw new Error('Unavailable');
      return response.json();
    },
  } } });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.head.replaceChildren(); });

describe('genre client station-list ownership with real SEO and station anchors', () => {
  it('keeps raw SSR valid, removes only server lists even with initial-head guard true, and honors the stored Turkey filter', async () => {
    expect(pageSchemas()).toEqual(structuredData.page);
    const globals = [...document.querySelectorAll('[data-schema-scope="global"]')];
    const thirdParty = document.getElementById('third-party');
    render(tree());
    expectNoStationLists();
    expect(document.title).toBe('SSR Pop');
    expect(pageSchemas()).toEqual([{ '@type': 'CollectionPage', name: 'Pop', url: collection.url }, breadcrumb]);
    expect([...document.querySelectorAll('[data-schema-scope="global"]')]).toEqual(globals);
    expect(document.getElementById('third-party')).toBe(thirdParty);
    expect(JSON.parse(thirdParty!.textContent!)).toEqual(stationList);
    await expectStations('Turkey');
    expect(requests.some(url => url.pathname === '/api/seo/page-data')).toBe(false);
    expect(stationLinks().some(link => link.href.includes('/ssr-'))).toBe(false);
  });

  it('also leaves a clean initial SSR head untouched', async () => {
    document.querySelectorAll('[data-schema-scope="page"]').forEach(node => node.remove());
    const before = document.head.innerHTML;
    render(tree()); await expectStations('Turkey');
    expect(document.head.innerHTML).toBe(before);
  });

  it.each(SITEMAP_PRIORITY_LANGUAGES.universal14)('uses PublicRouter englishPath for the actual localized %s genre route', async language => {
    seedSsr(`/${language}${translateUrl('/genres/pop', language)}`);
    render(tree());
    await screen.findByRole('heading', { name: 'Station Turkey 1 0' });
    expectNoStationLists();
    expect(document.title).toBe('SSR Pop');
    expect(document.querySelectorAll('[data-schema-scope="global"]')).toHaveLength(2);
  });

  it('does not strip lists on the genre index or another page family', () => {
    for (const url of ['/en/genres', '/en/station/pop', '/en/genres-not/pop']) {
      seedSsr(url);
      const view = render(tree());
      expect(pageSchemas()).toEqual(structuredData.page);
      view.unmount();
    }
  });

  it('survives filter changes, page two and browser back/forward with cached immutable SEO payloads', async () => {
    localStorage.setItem('selectedCountry', 'all');
    const cached = payload('Cached page two');
    cached.seoTags.canonical = `${origin}/en/genres/pop?page=2`;
    const before = JSON.stringify(cached);
    Object.freeze(cached.structuredData.page); Object.freeze(cached.structuredData);
    client.setQueryData(['/api/seo/page-data', '/en/genres/pop?page=2', 'en'], cached);
    const view = render(tree('all')); await expectStations('all');
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '/en/genres/pop?page=2');
    fireEvent.click(screen.getByRole('link', { name: '2' }));
    await expectStations('all', 2);
    expect(window.location.search).toBe('?page=2');
    await waitFor(() => expect(document.title).toBe('Cached page two'));
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/en/genres/pop?page=2`);
    expect(client.getQueryData(['/api/seo/page-data', '/en/genres/pop?page=2', 'en'])).toEqual(cached);
    expect(JSON.stringify(cached)).toBe(before);
    act(() => window.history.back()); await expectStations('all');
    act(() => window.history.forward()); await expectStations('all', 2);
    view.rerender(tree('Austria')); await expectStations('Austria');
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('link', { name: '2' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await expectStations('Austria', 2);
    expect(window.location.search).toBe('');
    expectNoStationLists();
  });

  it('does not reuse a previous-route placeholder head when query defaults enable keep-previous-data', async () => {
    client.setQueryDefaults(['/api/seo/page-data'], { placeholderData: previous => previous });
    initialGuard = createInitialSsrHeadGuard(null);
    client.setQueryData(['/api/seo/page-data', '/en/genres/pop', 'en'], payload('Cached genre'));
    render(tree()); await expectStations('Turkey');
    expect(document.title).toBe('Cached genre');
    fireEvent.click(screen.getByRole('link', { name: /^Station Turkey 1 0 / }));
    await screen.findByText('Station route');
    expect(pageSchemas()).toEqual([]);
    expect(document.querySelectorAll('[data-schema-scope="global"]')).toHaveLength(2);
  });

  it.each(['loading', 'empty', 'error'] as const)('omits stale station lists during %s, including a late SEO response', async mode => {
    stationMode = mode;
    initialGuard = createInitialSsrHeadGuard(null);
    render(tree());
    expectNoStationLists();
    await waitFor(() => expect(pendingSeo.has('/en/genres/pop')).toBe(true));
    await act(async () => { pendingSeo.get('/en/genres/pop')!(Response.json(payload('Late genre'))); });
    await waitFor(() => expect(document.title).toBe('Late genre'));
    expectNoStationLists();
    expect(stationLinks()).toHaveLength(0);
    if (mode === 'error') await screen.findByRole('alert');
    else expect(screen.getByRole('status')).toBeInTheDocument();
    expect(pageSchemas()).toContainEqual(breadcrumb);
  });

  it('cannot apply an old route head after genre -> station -> back under StrictMode', async () => {
    localStorage.setItem('selectedCountry', 'all');
    const view = render(tree('all')); await expectStations('all');
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '/en/genres/pop?page=2');
    fireEvent.click(screen.getByRole('link', { name: '2' }));
    await expectStations('all', 2);
    await waitFor(() => expect(pendingSeo.has('/en/genres/pop?page=2')).toBe(true));
    const oldGenreResponse = pendingSeo.get('/en/genres/pop?page=2')!;
    fireEvent.click(screen.getByRole('link', { name: /^Station all 2 0 / }));
    await screen.findByText('Station route');
    const stationUrl = window.location.pathname;
    await waitFor(() => expect(pendingSeo.has(stationUrl)).toBe(true));
    await act(async () => { pendingSeo.get(stationUrl)!(Response.json({
      seoTags: { title: 'Current station', robots: 'noindex, follow' },
      structuredData: { global: [], page: [{ '@type': 'RadioBroadcastService', name: 'Current station' }] },
    })); });
    await waitFor(() => expect(document.title).toBe('Current station'));
    await act(async () => { oldGenreResponse(Response.json(payload('Obsolete genre response'))); });
    expect(document.title).toBe('Current station');
    expect(pageSchemas()).toEqual([{ '@type': 'RadioBroadcastService', name: 'Current station' }]);
    act(() => window.history.back());
    await expectStations('all', 2);
    await waitFor(() => expect(pendingSeo.get('/en/genres/pop?page=2')).not.toBe(oldGenreResponse));
    await act(async () => { pendingSeo.get('/en/genres/pop?page=2')!(Response.json(payload('Returned genre'))); });
    await waitFor(() => expect(document.title).toBe('Returned genre'));
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/en/genres/pop?page=2`);
    expectNoStationLists();
    act(() => window.history.forward()); await screen.findByText('Station route');
    await waitFor(() => expect(document.title).toBe('Current station'));
    expect(pageSchemas()).toEqual([{ '@type': 'RadioBroadcastService', name: 'Current station' }]);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    view.unmount();
  });

  it('ignores a late station response after returning to a genre and preserves its canonical and lists omission', async () => {
    render(tree()); await expectStations('Turkey');
    fireEvent.click(screen.getByRole('link', { name: /^Station Turkey 1 0 / }));
    await screen.findByText('Station route');
    const stationUrl = window.location.pathname;
    await waitFor(() => expect(pendingSeo.has(stationUrl)).toBe(true));
    const oldStationResponse = pendingSeo.get(stationUrl)!;
    act(() => window.history.back());
    await expectStations('Turkey');
    await waitFor(() => expect(pendingSeo.has('/en/genres/pop')).toBe(true));
    await act(async () => { pendingSeo.get('/en/genres/pop')!(Response.json(payload('Back on genre'))); });
    await waitFor(() => expect(document.title).toBe('Back on genre'));
    await act(async () => { oldStationResponse(Response.json({
      seoTags: { title: 'Obsolete station', canonical: `${origin}${stationUrl}` },
      structuredData: { global: [], page: [{ '@type': 'RadioBroadcastService', name: 'Obsolete station' }] },
    })); });
    expect(document.title).toBe('Back on genre');
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/en/genres/pop`);
    expectNoStationLists();
    expect(pageSchemas()).toContainEqual(breadcrumb);
    expect(pageSchemas().some(schema => schema['@type'] === 'RadioBroadcastService')).toBe(false);
  });
});
