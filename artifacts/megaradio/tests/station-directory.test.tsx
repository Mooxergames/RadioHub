import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getLanguageFromPath, SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { reverseTranslateUrl, translateUrl } from '@workspace/seo-shared/url-translations';
import { isStationDirectoryPath, type StationDirectoryData } from '@workspace/seo-shared/station-directory';

let initialGuard: (url: string) => boolean;
vi.mock('@/utils/ssr-seo-head', async importOriginal => ({
  ...await importOriginal<typeof import('../src/utils/ssr-seo-head')>(),
  preserveInitialSsrHead: (url: string) => initialGuard(url),
}));
vi.mock('@/lib/translation-navigation-prefetch', () => ({ prefetchNavigationTranslations: vi.fn() }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  language: window.location.pathname.split('/')[1], t: (key: string, fallback?: string) => fallback || key,
}) }));
vi.mock('@/components/lazy-routes', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/lazy-routes')>(),
  Radios: ({ selectedCountry }: { selectedCountry?: string }) => <span>Generic radios: {selectedCountry}</span>,
  StationDetails: () => <span>Station detail</span>,
}));

import { PublicRouter } from '../src/App';
import { SeoPageWrapper } from '../src/components/SeoPageWrapper';
import { createInitialSsrHeadGuard } from '../src/utils/ssr-seo-head';

const origin = window.location.origin;
let client: QueryClient;
let requests: Array<{ url: string; signal?: AbortSignal | null }>;
let respond: (url: string) => Response | Promise<Response>;

function fixture(url: string) {
  const parsed = new URL(url, origin);
  const { language, cleanPath } = getLanguageFromPath(parsed.pathname);
  const english = reverseTranslateUrl(cleanPath, language);
  const letter = english.split('/')[2] || null;
  const currentPage = Number(parsed.searchParams.get('page') || 1);
  const localized = (route: string) => `/${language}${translateUrl(route, language)}`;
  const route = letter ? `/stations/${letter}` : '/stations';
  const stationDirectory: StationDirectoryData = {
    h1: `${language} directory ${letter || 'all'} page ${currentPage}`,
    letter, currentPage, totalPages: 100,
    navLabel: `${language} A-Z`, paginationLabel: `${language} pages`,
    stations: Array.from({ length: 60 }, (_, index) => ({
      href: localized(`/station/${letter || 'all'}-${currentPage}-${index}`),
      name: `${letter || 'all'} exact ${currentPage} ${index}`,
      logoUrl: index === 0 ? '/images/logo-icon.webp' : null,
      alt: `${language} logo ${index}`,
    })),
    letters: ['0-9', ...'abcdefghijklmnopqrstuvwxyz'].map(value => ({
      href: localized(`/stations/${value}`), label: value.toUpperCase(), current: value === letter,
    })),
    pages: [1, 2, 51, 100].map(page => ({
      page, href: `${localized(route)}${page === 1 ? '' : `?page=${page}`}`, current: page === currentPage,
      ...(page === currentPage - 1 ? { rel: 'prev' as const } : page === currentPage + 1 ? { rel: 'next' as const } : {}),
    })),
  };
  return {
    seoTags: {
      title: stationDirectory.h1, description: 'Exact server directory',
      canonical: `${origin}${url}`, robots: 'index, follow',
      hreflangs: [{ hreflang: language, url: `${origin}${url}` }],
    },
    structuredData: { global: [], page: [{ '@type': 'CollectionPage', name: stationDirectory.h1 }] },
    stationDirectory,
  };
}

function seedSsr(url: string) {
  window.history.replaceState({}, '', url);
  initialGuard = createInitialSsrHeadGuard(window.location.pathname + window.location.search);
  document.head.innerHTML = `<title>SSR directory</title>
    <meta name="robots" content="index, follow">
    <link rel="canonical" data-managed="seo-head" href="${origin}${url}">
    <link rel="alternate" hreflang="en" href="${origin}${url}">`;
}
function visit(url: string) {
  act(() => { window.history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); });
}
function showPage() {
  return render(<QueryClientProvider client={client}><Router><SeoPageWrapper>
    <PublicRouter selectedCountry={localStorage.getItem('selectedCountry') || 'all'} onCountryChange={vi.fn()} />
  </SeoPageWrapper></Router></QueryClientProvider>);
}
function stationLinks() {
  return [...document.querySelectorAll<HTMLAnchorElement>('.station-directory-list a')];
}
async function expectDirectory(url: string) {
  const expected = fixture(url).stationDirectory;
  await screen.findByRole('heading', { name: expected.h1 });
  expect(stationLinks().map(link => ({ href: link.getAttribute('href'), name: link.querySelector('.station-directory-name')?.textContent })))
    .toEqual(expected.stations.map(station => ({ href: station.href, name: station.name })));
}

beforeEach(() => {
  requests = [];
  localStorage.clear(); localStorage.setItem('selectedCountry', 'Türkiye');
  seedSsr('/en/stations/z');
  client = new QueryClient({ defaultOptions: { queries: {
    retry: false, gcTime: Infinity,
    queryFn: async ({ queryKey, signal }) => (await fetch(String(queryKey[0]), { signal })).json(),
  } } });
  respond = url => Response.json(fixture(url));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn((input: string, options?: RequestInit) => {
    const url = new URL(input, origin);
    if (url.pathname !== '/api/seo/page-data') return Promise.resolve(Response.json([]));
    const target = url.searchParams.get('url')!;
    expect(url.searchParams.get('slim')).toBe('1');
    requests.push({ url: target, signal: options?.signal });
    return Promise.resolve(respond(target));
  }));
});
afterEach(() => {
  cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.head.replaceChildren();
});

describe('server-backed station directory with real QueryClient and Wouter', () => {
  it('loads the exact 60 Z stations once despite saved Türkiye and preserves the complete initial SSR head', async () => {
    const head = document.head.innerHTML;
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    showPage(); await expectDirectory('/en/stations/z');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/en/stations/z');
    expect(document.head.innerHTML).toBe(head);
    expect(localStorage.getItem('selectedCountry')).toBe('Türkiye');
    expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
    const logo = screen.getByRole('img', { name: 'en logo 0' });
    expect(logo).toHaveAttribute('src', fixture('/en/stations/z').stationDirectory.stations[0].logoUrl);
    expect(screen.queryByText(/Generic radios/)).not.toBeInTheDocument();
  });

  it.each(SITEMAP_PRIORITY_LANGUAGES.universal14)('%s uses the DTO heading and all server-provided localized anchors unchanged', async language => {
    const url = `/${language}${translateUrl('/stations/z', language)}`;
    seedSsr(url); showPage(); await expectDirectory(url);
    const directory = fixture(url).stationDirectory;
    const letters = within(screen.getByRole('navigation', { name: directory.navLabel })).getAllByRole('link');
    expect(letters).toHaveLength(27);
    expect(letters.map(link => link.getAttribute('href'))).toEqual(directory.letters.map(letter => letter.href));
    expect(within(screen.getByRole('navigation', { name: directory.paginationLabel })).getAllByRole('link').map(link => link.getAttribute('href')))
      .toEqual(directory.pages.map(page => page.href));
    expect(requests).toHaveLength(1);
    expect(window.location.pathname).toBe(new URL(url, origin).pathname);
    expect(requests[0].url).toBe(new URL(url, origin).pathname);
  });

  it('replaces Z with A without reusing prior data, even with global keep-previous placeholders', async () => {
    client.setQueryDefaults(['/api/seo/page-data'], { placeholderData: previous => previous });
    showPage(); await expectDirectory('/en/stations/z');
    let resolve!: (response: Response) => void;
    respond = () => new Promise<Response>(done => { resolve = done; });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'en A-Z' })).getByRole('link', { name: 'A', exact: true }));
    expect(stationLinks()).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    await act(async () => { resolve(Response.json(fixture('/en/stations/a'))); });
    await expectDirectory('/en/stations/a');
    expect(requests.map(request => request.url)).toEqual(['/en/stations/z', '/en/stations/a']);
    expect(document.title).toBe(fixture('/en/stations/a').seoTags.title);
  });

  it('preserves page 2, browser back/forward and the exact path/search query key', async () => {
    showPage(); await expectDirectory('/en/stations/z');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'en pages' })).getByRole('link', { name: '2', exact: true }));
    await expectDirectory('/en/stations/z?page=2');
    expect(window.location.search).toBe('?page=2');
    expect(client.getQueryData(['/api/seo/page-data', '/en/stations/z?page=2', 'en'])).toMatchObject({ httpStatus: 200 });
    act(() => window.history.back()); await expectDirectory('/en/stations/z');
    act(() => window.history.forward()); await expectDirectory('/en/stations/z?page=2');
    expect(requests.map(request => request.url)).toEqual(['/en/stations/z', '/en/stations/z?page=2']);
  });

  it.each(['page=02', 'page=51', 'page=2&source=az%20nav&filter=z', 'page=2&page=3', 'source=%41%2520&page=2'])('leaves backend-owned query validation untouched: %s', async search => {
    const url = `/en/stations/z?${search}`;
    seedSsr(url); showPage(); await expectDirectory(url);
    expect(window.location.search).toBe(`?${search}`);
    expect(requests.map(request => request.url)).toEqual([url]);
  });

  it('aborts obsolete requests and cannot apply their late list or head to the current route', async () => {
    const pending = new Map<string, (response: Response) => void>();
    respond = url => new Promise<Response>(resolve => { pending.set(url, resolve); });
    initialGuard = createInitialSsrHeadGuard(null);
    const view = showPage();
    await waitFor(() => expect(pending.has('/en/stations/z')).toBe(true));
    const oldSignal = requests[0].signal;
    visit('/en/stations/a');
    await waitFor(() => expect(pending.has('/en/stations/a')).toBe(true));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { pending.get('/en/stations/a')!(Response.json(fixture('/en/stations/a'))); });
    await expectDirectory('/en/stations/a');
    await act(async () => { pending.get('/en/stations/z')!(Response.json(fixture('/en/stations/z'))); });
    await expectDirectory('/en/stations/a');
    expect(document.title).toBe(fixture('/en/stations/a').seoTags.title);
    visit('/en/stations/z?page=2');
    await waitFor(() => expect(pending.has('/en/stations/z?page=2')).toBe(true));
    const signal = requests.at(-1)!.signal;
    view.unmount(); expect(signal?.aborted).toBe(true);
  });

  it('uses one request with the new language when navigating between locales', async () => {
    showPage(); await expectDirectory('/en/stations/z');
    visit('/de/sender/z'); await expectDirectory('/de/sender/z');
    expect(requests.map(request => request.url)).toEqual(['/en/stations/z', '/de/sender/z']);
    expect(client.getQueryData(['/api/seo/page-data', '/de/sender/z', 'de'])).toBeDefined();
    expect(client.getQueryData(['/api/seo/page-data', '/de/sender/z', 'en'])).toBeUndefined();
  });

  it('shares the exact reversed-path predicate for DE hub, A-Z and station details; /radios stays generic', async () => {
    const cases = [
      ['/sender', true], ['/sender/z', true], ['/sender/0-9', true], ['/sender/z-fm', false],
      ['/station/z', true], ['/stations/z', true], ['/stations/zz', false], ['/stations/a/extra', false], ['/radios', false],
    ] as const;
    for (const [route, directory] of cases) expect(isStationDirectoryPath(reverseTranslateUrl(route, 'de')), route).toBe(directory);
    seedSsr('/de/sender'); showPage(); await expectDirectory('/de/sender');
    visit('/de/sender/z'); await expectDirectory('/de/sender/z');
    visit('/de/sender/z-fm'); await screen.findByText('Station detail');
    visit('/de/radios'); await screen.findByText('Generic radios: Türkiye');
    const app = readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const wrapper = readFileSync(path.resolve('src/components/SeoPageWrapper.tsx'), 'utf8');
    expect(app).toContain('isStationDirectoryPath(pathToUse)');
    expect(wrapper).toContain('isStationDirectoryPath(routePath)');
  });

  it('still skips the duplicate initial SEO query on a non-directory SSR page', async () => {
    seedSsr('/de/sender/z-fm');
    const head = document.head.innerHTML;
    showPage(); await screen.findByText('Station detail');
    expect(requests).toHaveLength(0);
    expect(document.head.innerHTML).toBe(head);
  });

  it('applies authoritative404 even if the initial SSR head was still indexable', async () => {
    respond = () => Response.json({ seoTags: {
      title: 'Catalogue removed', robots: 'noindex, follow', noIndex: true, hreflangs: [],
    }, structuredData: { global: [], page: [] } }, { status: 404 });
    showPage();
    await screen.findByRole('heading', { name: /404/ });
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    expect(document.querySelectorAll('link[hreflang]')).toHaveLength(0);
    expect(document.title).toBe('Catalogue removed');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('renders an authoritative empty first page instead of a loading placeholder', async () => {
    respond = url => {
      const payload = fixture(url);
      payload.stationDirectory.stations = [];
      payload.stationDirectory.totalPages = 1;
      payload.stationDirectory.pages = [{ page: 1, href: url, current: true }];
      return Response.json(payload);
    };
    showPage();
    await screen.findByText('No results found. Try another search.');
    expect(document.querySelector('.region-directory-skeleton')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies real 404 metadata after a successful route and restores index/hreflangs when navigating back', async () => {
    initialGuard = createInitialSsrHeadGuard(null);
    showPage(); await expectDirectory('/en/stations/z');
    await waitFor(() => expect(document.title).toBe(fixture('/en/stations/z').seoTags.title));
    respond = url => Response.json({ seoTags: {
      title: 'Server not found', description: 'Not found', canonical: `${origin}${url}`,
      robots: 'noindex, follow', hreflangs: [],
    } }, { status: 404 });
    visit('/en/stations/z?page=99999');
    await screen.findByRole('heading', { name: /404/ });
    await waitFor(() => expect(document.title).toBe('Server not found'));
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
    expect(document.querySelectorAll('link[hreflang]')).toHaveLength(0);
    expect(stationLinks()).toHaveLength(0);
    expect(client.getQueryData(['/api/seo/page-data', '/en/stations/z?page=99999', 'en'])).toMatchObject({ httpStatus: 404 });
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    act(() => window.history.back()); await expectDirectory('/en/stations/z');
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow'));
    expect(document.querySelectorAll('link[hreflang]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/en/stations/z`);
  });

  it.each(['503', 'network', 'missing', 'malformed', 'over-limit'] as const)('%s is a retryable alert, never an empty result or 404', async failure => {
    respond = url => {
      if (failure === '503') return new Response(null, { status: 503 });
      if (failure === 'network') return Promise.reject(new TypeError('Network unavailable'));
      const payload = fixture(url);
      if (failure === 'missing') return Response.json({ seoTags: payload.seoTags });
      if (failure === 'malformed') return Response.json({ ...payload, stationDirectory: { ...payload.stationDirectory, stations: [{ name: 'Bad', href: '//unsafe' }] } });
      return Response.json({ ...payload, stationDirectory: { ...payload.stationDirectory, stations: [...payload.stationDirectory.stations, payload.stationDirectory.stations[0]] } });
    };
    showPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load this page.');
    expect(screen.queryByRole('heading', { name: /404/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
    expect(requests).toHaveLength(1);
    respond = url => Response.json(fixture(url));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await expectDirectory('/en/stations/z');
    expect(requests).toHaveLength(2);
  });

  it('has no component-owned query, URL mutation, country filter or metadata owner', () => {
    const source = readFileSync(path.resolve('src/pages/StationDirectory.tsx'), 'utf8');
    for (const forbidden of ['useQuery', 'useLocation', 'useSearch', 'navigate', 'history.', 'window.location', 'URLSearchParams', 'selectedCountry', 'SeoHead', 'document.title']) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(/\bfetch\(/);
  });
});
