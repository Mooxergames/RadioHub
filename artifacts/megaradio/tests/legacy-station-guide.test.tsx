import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LEGACY_STATION_GUIDES, buildLegacyStationGuideSeo, buildLegacyStationGuideSchema, renderLegacyStationGuideHtml } from '@workspace/seo-shared/legacy-station-guides';
import { LEGACY_STATION_GUIDE_ROUTES, getLegacyStationGuideRoute } from '@workspace/seo-shared/legacy-station-guide-routes';

vi.mock('@/lib/initial-home-components', () => ({ InitialStation: () => <h1>Real catalogue station</h1> }));
vi.mock('@/pages/not-found', () => ({ default: () => <h1>Not found</h1> }));
vi.mock('@/utils/ssr-seo-head', async importOriginal => ({
  ...await importOriginal<typeof import('../src/utils/ssr-seo-head')>(),
  preserveInitialSsrHead: () => true,
}));
vi.mock('@/lib/translation-navigation-prefetch', () => ({ prefetchNavigationTranslations: vi.fn() }));
import LegacyStationGuidePage from '../src/pages/legacy-station-guide';
import { SeoPageWrapper } from '../src/components/SeoPageWrapper';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnMount: false } } });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); client.clear(); document.querySelectorAll('meta[name="megaradio-legacy-guide"],script[data-managed="seo-structured-data"]').forEach(node => node.remove()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(path: string) {
  window.history.replaceState({}, '', path);
  return render(<QueryClientProvider client={client}><audio data-testid="existing-player" /><SeoPageWrapper><LegacyStationGuidePage /></SeoPageWrapper></QueryClientProvider>);
}
function payload(index = 0) {
  const guide = LEGACY_STATION_GUIDES[index];
  return { legacyGuideId: guide.id, seoTags: buildLegacyStationGuideSeo(guide), structuredData: { global: [], page: buildLegacyStationGuideSchema(guide) } };
}

it.each(LEGACY_STATION_GUIDES)('verifies ownership despite an existing SSR head before rendering $id', async guide => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify(payload(guide.language === 'ar' ? 1 : 0))));
  vi.stubGlobal('fetch', fetcher);
  const view = mount(guide.path);
  await view.findByRole('heading', { level: 1, name: guide.title });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toContain('/api/seo/page-data?url=');
  expect(view.container.querySelector('main')).toHaveAttribute('lang', guide.language);
  expect(view.container.querySelector('main')).toHaveAttribute('dir', guide.language === 'ar' ? 'rtl' : 'ltr');
  expect(view.container.querySelectorAll('audio')).toHaveLength(1);
  expect(view.container.querySelector('button[aria-label*="Play"]')).toBeNull();
  expect(view.container.querySelectorAll('a[target="_blank"]')).toHaveLength(guide.choices.reduce((n, c) => n + 1 + c.sources.length, 0));
  for (const choice of guide.choices) expect(view.getByText(choice.copy)).toBeVisible();
  const player = view.getByTestId('existing-player');
  fireEvent.click(view.container.querySelector(`a[href="/${guide.language}"]`)!);
  await waitFor(() => expect(window.location.pathname).toBe(`/${guide.language}`));
  expect(view.getByTestId('existing-player')).toBe(player);
});

it('a real catalogue owner is not replaced by a guide or selected broadcaster', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ seoTags: { title: 'Real station' } }))));
  const view = mount(LEGACY_STATION_GUIDES[0].path);
  await view.findByRole('heading', { name: 'Real catalogue station' });
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
});

it('a cached guide payload is rechecked on navigation so it cannot hide a new catalogue owner', async () => {
  const guide = LEGACY_STATION_GUIDES[0];
  client.setQueryData(['/api/seo/page-data', guide.path, guide.language], payload());
  let resolve!: (value: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', fetcher);
  const view = mount(guide.path);
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
  expect(view.container.querySelector('main')).toHaveAttribute('aria-busy', 'true');
  expect(fetcher).toHaveBeenCalledTimes(1);
  resolve(new Response(JSON.stringify({ legacyGuideId: null, seoTags: { title: 'New station' } })));
  await view.findByRole('heading', { name: 'Real catalogue station' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
});

it('a definite410 invalidates even verified initial SSR content, canonical and page entities', async () => {
  const guide = LEGACY_STATION_GUIDES[0];
  const marker = document.createElement('meta'); marker.name = 'megaradio-legacy-guide'; marker.content = guide.id; document.head.appendChild(marker);
  const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = buildLegacyStationGuideSeo(guide).canonical!; document.head.appendChild(canonical);
  const schema = document.createElement('script'); schema.type = 'application/ld+json'; schema.dataset.managed = 'seo-structured-data'; schema.dataset.schemaScope = 'page'; schema.textContent = JSON.stringify(buildLegacyStationGuideSchema(guide)[1]); document.head.appendChild(schema);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ legacyGuideId: null, seoTags: { title: 'Page unavailable', noIndex: true } }), { status: 410 })));
  const view = mount(guide.path);
  await view.findByRole('heading', { name: 'Not found' });
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
  expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  expect(document.querySelector('script[data-managed="seo-structured-data"][data-schema-scope="page"]')).toBeNull();
});

it('a fresh real owner replaces the initial guide title, canonical, robots and page schema together', async () => {
  const guide = LEGACY_STATION_GUIDES[0];
  const marker = document.createElement('meta'); marker.name = 'megaradio-legacy-guide'; marker.content = guide.id; document.head.appendChild(marker);
  const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = buildLegacyStationGuideSeo(guide).canonical!; document.head.appendChild(canonical);
  const schema = document.createElement('script'); schema.type = 'application/ld+json'; schema.dataset.managed = 'seo-structured-data'; schema.dataset.schemaScope = 'page'; schema.textContent = JSON.stringify(buildLegacyStationGuideSchema(guide)[1]); document.head.appendChild(schema);
  const stationCanonical = 'https://themegaradio.com/en/station/real-owner';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ legacyGuideId: null,
    seoTags: { title: 'Real owner title', canonical: stationCanonical, robots: 'index, follow', hreflangs: [] },
    structuredData: { global: [], page: [{ '@context': 'https://schema.org', '@type': 'RadioBroadcastService', name: 'Real owner' }] },
  }))));
  const view = mount(guide.path);
  await view.findByRole('heading', { name: 'Real catalogue station' });
  expect(document.title).toBe('Real owner title');
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', stationCanonical);
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  const schemas = [...document.querySelectorAll('script[data-managed="seo-structured-data"][data-schema-scope="page"]')].map(node => JSON.parse(node.textContent!));
  expect(schemas.map(node => node['@type'])).toEqual(['RadioBroadcastService']);
});

it('keeps a route-verified complete SSR guide visible while the fresh ownership request is pending', async () => {
  const guide = LEGACY_STATION_GUIDES[0];
  const marker = document.createElement('meta');
  marker.name = 'megaradio-legacy-guide'; marker.content = guide.id; document.head.appendChild(marker);
  let resolve!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const view = mount(guide.path);
  expect(view.getByRole('heading', { name: guide.title })).toBeVisible();
  resolve(new Response(JSON.stringify({ seoTags: { title: 'New real station owner' } })));
  await view.findByRole('heading', { name: 'Real catalogue station' });
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
});

it('does not accept a different guide ID from a stale or incorrect page payload', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload(1)))));
  const view = mount(LEGACY_STATION_GUIDES[0].path);
  await view.findByRole('heading', { name: 'Real catalogue station' });
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
});

it('transient metadata failure exposes retry rather than a false restoration', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValue(new Response(JSON.stringify(payload())));
  vi.stubGlobal('fetch', fetcher);
  const view = mount(LEGACY_STATION_GUIDES[0].path);
  const retry = await view.findByRole('button', { name: 'Try again' });
  expect(view.container.querySelector('[data-legacy-guide-id]')).toBeNull();
  fireEvent.click(retry);
  await view.findByRole('heading', { name: LEGACY_STATION_GUIDES[0].title });
});

it('route-only manifest cannot drift from reviewed content and never matches neighbouring slugs', () => {
  expect(LEGACY_STATION_GUIDE_ROUTES.map(({ id, path, sourcePaths, language }) => ({ id, path, sourcePaths, language })))
    .toEqual(LEGACY_STATION_GUIDES.map(({ id, path, sourcePaths, language }) => ({ id, path, sourcePaths, language })));
  for (const path of ['/en/station/radar-4', '/af/station/radar-40', '/af/station/radar-4/extra', '//example.org/af/station/radar-4', '/af/station/%72adar-4']) {
    expect(getLegacyStationGuideRoute(path)).toBeNull();
  }
});

it('text and untrusted source URLs cannot inject editorial markup or active links', () => {
  const guide = structuredClone(LEGACY_STATION_GUIDES[0]) as any;
  guide.title = '<img src=x onerror=alert(1)>';
  guide.choices[0].officialListen = { label: '<script>bad</script>', url: 'javascript:alert(1)' };
  guide.choices[0].sources = [{ label: 'Invalid source', url: '//example.org' }];
  const html = renderLegacyStationGuideHtml(guide);
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('href="//example.org');
  expect(JSON.stringify(buildLegacyStationGuideSchema(guide))).not.toContain('javascript:');
});
