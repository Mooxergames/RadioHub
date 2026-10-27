import React, { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeoMetaTags } from '@workspace/seo-shared/seo-config';

const state = vi.hoisted(() => ({ location: '/en/station/fixture' }));
vi.mock('wouter', () => ({ useLocation: () => [state.location, vi.fn()], useSearch: () => '' }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ language: 'en' }) }));
vi.mock('@/utils/ssr-seo-head', async importOriginal => ({
  ...await importOriginal<typeof import('../src/utils/ssr-seo-head')>(), preserveInitialSsrHead: () => false,
}));

import { SeoHead as ServerDataHead } from '../src/components/seo/SeoHead';
import { SeoHead as FallbackHead } from '../src/components/SeoHead';

const origin = window.location.origin;
function expectSize(width?: number, height?: number) {
  for (const [axis, expected] of [['width', width], ['height', height]] as const) {
    const tags = document.querySelectorAll(`meta[property="og:image:${axis}"]`);
    expect(tags).toHaveLength(expected === undefined ? 0 : 1);
    if (expected !== undefined) expect(tags[0]).toHaveAttribute('content', String(expected));
  }
}
beforeEach(() => {
  state.location = '/en/station/fixture';
  document.head.innerHTML = '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">';
});

describe('both client SEO owners update the dimensions of the actual OG image', () => {
  it('server-data head follows station -> genre -> custom known -> unknown without stale dimensions', () => {
    const tags = (ogImage?: string) => ({ title: 'Current route', description: 'Current description', ogImage } as SeoMetaTags);
    const view = render(<StrictMode><ServerDataHead seoData={tags(`${origin}/api/og-image/fixture`)} /></StrictMode>);
    expectSize(1200, 630);
    view.rerender(<StrictMode><ServerDataHead seoData={tags()} /></StrictMode>);
    expectSize(194, 180);
    view.rerender(<StrictMode><ServerDataHead seoData={tags(`${origin}/api/og-image/custom?lang=tr`)} /></StrictMode>);
    expectSize(1200, 630);
    for (const image of ['https://custom.invalid/banner.jpg', 'https://custom.invalid/images/logo-icon.webp', '/uploads/custom.webp']) {
      view.rerender(<StrictMode><ServerDataHead seoData={tags(image)} /></StrictMode>);
      expectSize();
    }
  });

  it('fallback head follows station -> genre -> custom known -> unknown using real generated tags', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false, queryFn: async () => ({}) } } });
    client.setQueryData(['/api/translations', 'en'], {});
    const station = (favicon: string) => ({ name: 'Fixture Radio', slug: 'fixture', favicon });
    const tree = (pageType: 'station' | 'genres', favicon?: string) => <StrictMode><QueryClientProvider client={client}>
      <FallbackHead pageType={pageType} genreName={pageType === 'genres' ? 'Pop' : undefined} stationData={favicon ? station(favicon) : undefined} />
    </QueryClientProvider></StrictMode>;
    const view = render(tree('station', `${origin}/api/og-image/fixture`));
    await waitFor(() => expectSize(1200, 630));
    state.location = '/en/genres/pop';
    view.rerender(tree('genres'));
    await waitFor(() => expectSize(194, 180));
    state.location = '/en/station/custom';
    view.rerender(tree('station', `${origin}/images/logo-icon.webp`));
    await waitFor(() => expectSize(194, 180));
    view.rerender(tree('station', 'https://custom.invalid/banner.jpg'));
    await waitFor(() => expectSize());
    view.unmount(); client.clear();
  });

  it('a deferred genre template cannot restore old image dimensions after a station navigation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, queryFn: async () => ({}) } } });
    const tree = (genre: boolean) => <StrictMode><QueryClientProvider client={client}>
      <FallbackHead pageType={genre ? 'genres' : 'station'} genreName={genre ? 'Pop' : undefined}
        stationData={genre ? undefined : { name: 'Unknown image', slug: 'unknown', favicon: 'https://custom.invalid/unknown.jpg' }} />
    </QueryClientProvider></StrictMode>;
    state.location = '/en/genres/pop';
    const view = render(tree(true));
    state.location = '/en/station/unknown';
    view.rerender(tree(false));
    await waitFor(() => expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute('content', 'https://custom.invalid/unknown.jpg'));
    await Promise.resolve();
    expectSize();
    view.unmount(); client.clear();
  });
});
