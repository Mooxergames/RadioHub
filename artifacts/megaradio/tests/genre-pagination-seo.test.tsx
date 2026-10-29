import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_GENRE_DIRECTORY_PAGE } from '@workspace/seo-shared/seo-config';

let initialGuard: (url: string) => boolean;
vi.mock('@/utils/ssr-seo-head', async importOriginal => ({
  ...await importOriginal<typeof import('../src/utils/ssr-seo-head')>(),
  preserveInitialSsrHead: (url: string) => initialGuard(url),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ language: 'de' }) }));

import { SeoHead } from '@/components/SeoHead';
import { createInitialSsrHeadGuard, ServerSeoHeadContext } from '@/utils/ssr-seo-head';

let client: QueryClient;
function visit(url: string) {
  act(() => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
function tree(genreName: string | undefined = 'Jazz', serverOwned = false) {
  return <QueryClientProvider client={client}><Router>
    <ServerSeoHeadContext.Provider value={serverOwned}>
      <SeoHead pageType="genres" genreName={genreName} />
    </ServerSeoHeadContext.Provider>
  </Router></QueryClientProvider>;
}
function expectCanonical(path: string) {
  expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${window.location.origin}${path}`);
  expect(document.querySelector('meta[property="og:url"]')).toHaveAttribute('content', `${window.location.origin}${path}`);
}

beforeEach(() => {
  document.head.innerHTML = '';
  initialGuard = createInitialSsrHeadGuard(null);
  client = new QueryClient({ defaultOptions: { queries: {
    retry: false, gcTime: 0, queryFn: async () => ({}),
  } } });
  visit('/de/genres/jazz?page=2');
});
afterEach(() => { cleanup(); client.clear(); document.head.innerHTML = ''; });

describe('genre detail pagination canonical ownership', () => {
  it('preserves the complete SSR pageN canonical and qualified alternates during hydration', async () => {
    initialGuard = createInitialSsrHeadGuard('/de/genres/jazz?page=2');
    document.head.innerHTML = `<title>SSR Jazz page two</title>
      <link rel="canonical" data-managed="seo-head" href="${window.location.origin}/de/genres/jazz?page=2">
      <link rel="alternate" hreflang="de" href="${window.location.origin}/de/genres/jazz?page=2">
      <link rel="alternate" hreflang="en" href="${window.location.origin}/en/genres/jazz?page=2">`;
    const before = document.head.innerHTML;
    const view = render(tree());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    view.rerender(tree('Jazz Music'));
    expect(document.head.innerHTML).toBe(before);
  });

  it('keeps selfcanonical pageN on client navigation, back and forward, but page one uses the base', async () => {
    render(tree());
    await waitFor(() => expectCanonical('/de/genres/jazz?page=2'));
    visit('/de/genres/jazz?page=3&source=test#grid');
    await waitFor(() => expectCanonical('/de/genres/jazz?page=3'));
    act(() => window.history.back());
    await waitFor(() => expectCanonical('/de/genres/jazz?page=2'));
    act(() => window.history.forward());
    await waitFor(() => expectCanonical('/de/genres/jazz?page=3'));
    visit('/de/genres/jazz?source=test#grid');
    await waitFor(() => expectCanonical('/de/genres/jazz'));
    visit('/de/genres/jazz?page=1');
    await waitFor(() => expectCanonical('/de/genres/jazz'));
  });

  it('does not override the centralized server head even on subsequent renders', async () => {
    document.head.innerHTML = `<title>Server page two</title>
      <link rel="canonical" href="${window.location.origin}/de/genres/jazz?page=2">`;
    const before = document.head.innerHTML;
    const view = render(tree('Jazz', true));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    view.rerender(tree('Jazz Music', true));
    expect(document.head.innerHTML).toBe(before);
  });

  it('preserves explicit URL-country scope instead of converting it to a language', async () => {
    visit('/dz/genres/jazz?page=2'); render(tree());
    await waitFor(() => expectCanonical('/dz/genres/jazz?page=2'));
  });

  it.each(['', '0', '%2532', '2&page=3', String(MAX_GENRE_DIRECTORY_PAGE + 1)])('does not invent a pageN canonical from invalid page %s', async page => {
    visit(`/de/genres/jazz?page=${page}`); render(tree());
    await waitFor(() => expectCanonical('/de/genres/jazz'));
  });

  it.each(['0002', '%32'])('normalizes numeric page %s in the client canonical', async page => {
    visit(`/de/genres/jazz?page=${page}`); render(tree());
    await waitFor(() => expectCanonical('/de/genres/jazz?page=2'));
  });

  it('leaves genre hub canonical behavior unchanged', async () => {
    visit('/de/genres?page=2'); render(tree(''));
    await waitFor(() => expectCanonical('/de/genres'));
  });
});
