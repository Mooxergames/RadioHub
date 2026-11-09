import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
const state = vi.hoisted(() => ({ location: '/tr/istasyon/kral-fm', initialSsr: false }));
vi.mock('wouter', () => ({ useLocation: () => [state.location], Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key: string, fallback: string) => key === 'nav_stations' ? 'Fixture directory label' : fallback }) }));
vi.mock('@/utils/ssr-seo-head', () => ({ preserveInitialSsrHead: () => state.initialSsr }));
import { BreadcrumbOverrideProvider, RouteBreadcrumbs, useBreadcrumbLastItemName } from '../src/components/RouteBreadcrumbs';
import { StationDirectoryContext } from '../src/hooks/useStationDirectory';
beforeEach(() => {
  state.initialSsr = false;
  document.head.querySelectorAll('link[rel="canonical"]').forEach(link => link.remove());
});
afterEach(cleanup);

function ResolvedName() {
  useBreadcrumbLastItemName('Resolved Station');
  return null;
}
function breadcrumb(canonical?: string) {
  return <StationDirectoryContext.Provider value={{ active: false, language: 'en', query: {
    data: canonical ? { seoTags: { canonical }, httpStatus: 200 } : undefined,
  } as any }}><BreadcrumbOverrideProvider><ResolvedName /><RouteBreadcrumbs /></BreadcrumbOverrideProvider></StationDirectoryContext.Provider>;
}
function setSsrCanonical(canonical: string) {
  const link = document.createElement('link');
  link.rel = 'canonical'; link.dataset.managed = 'seo-head'; link.href = canonical;
  document.head.appendChild(link);
}
const currentLink = () => document.querySelector('a[aria-current="page"]');

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s station breadcrumb uses the plural catalog path, retaining the singular detail URL', language => {
  const translations = URL_TRANSLATIONS[language];
  const segment = translations?.station || 'station';
  state.location = `/${language}/${segment}/kral-fm`;
  render(<RouteBreadcrumbs />);
  expect(screen.getByRole('link', { name: 'Fixture directory label' })).toHaveAttribute('href', `/${language}/${translations?.stations || 'stations'}`);
  expect(screen.getByRole('link', { name: 'Kral Fm' })).toHaveAttribute('href', state.location);
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s station breadcrumb ignores the retired-only canonical override', language => {
  state.location = `/${language}/${URL_TRANSLATIONS[language]?.station || 'station'}/old-record`;
  render(breadcrumb('https://themegaradio.com/en/station/safe-existing-fm'));
  expect(currentLink()).toHaveAttribute('href', state.location);
});

it.each(['nl', 'sv', 'rs'])('%s alias breadcrumb uses the initial SSR canonical without station bootstrap', language => {
  state.location = `/${language}/station/old-record`;
  window.history.replaceState({}, '', state.location + '?fixtureNoBootstrap=1');
  state.initialSsr = true;
  setSsrCanonical('https://themegaradio.com/en/station/safe-existing-fm');
  render(breadcrumb());
  expect(currentLink()).toHaveTextContent('Resolved Station');
  expect(currentLink()).toHaveAttribute('href', '/en/station/safe-existing-fm');
  expect(window.location.pathname).toBe(state.location);
});

it.each([true, false])('retired singular x retains the exact verified ID canonical (SSR=%s)', initialSsr => {
  state.location = '/nl/station/x';
  state.initialSsr = initialSsr;
  const canonical = 'https://themegaradio.com/en/station/600000000000000000000004';
  if (initialSsr) setSsrCanonical(canonical);
  render(breadcrumb(initialSsr ? undefined : canonical));
  expect(currentLink()).toHaveAttribute('href', '/en/station/600000000000000000000004');
});

it('SPA alias breadcrumb uses current SEO data and never reads a previous page canonical', () => {
  state.location = '/nl/station/old-record';
  setSsrCanonical('https://themegaradio.com/en/station/previous-station');
  const view = render(breadcrumb());
  expect(currentLink()).not.toHaveAttribute('href', '/en/station/previous-station');
  view.rerender(breadcrumb('https://themegaradio.com/en/station/safe-existing-fm'));
  expect(currentLink()).toHaveAttribute('href', '/en/station/safe-existing-fm');
  state.location = '/sv/station/second-alias';
  view.rerender(breadcrumb());
  expect(currentLink()).not.toHaveAttribute('href', '/en/station/safe-existing-fm');
  view.rerender(breadcrumb('https://themegaradio.com/en/station/second-station'));
  expect(currentLink()).toHaveAttribute('href', '/en/station/second-station');
});

it.each([
  'https://external.invalid/en/station/wrong',
  'https://themegaradio.com.external.invalid/en/station/wrong',
  'https://themegaradio.com@external.invalid/en/station/wrong',
  'https://user:password@themegaradio.com/en/station/wrong',
  'javascript:alert(1)', '//external.invalid/en/station/wrong',
  'https://themegaradio.com/en/stations/x', 'https://themegaradio.com/en/profile',
  'https://themegaradio.com/en/station/wrong#fragment',
])('rejects non-own-domain or non-detail canonical %s from SSR and current SEO', canonical => {
  state.location = '/nl/station/old-record';
  const view = render(breadcrumb(canonical));
  expect(currentLink()).toHaveAttribute('href', '/en/station/old-record');
  state.initialSsr = true;
  setSsrCanonical(canonical);
  view.rerender(breadcrumb());
  expect(currentLink()).toHaveAttribute('href', '/en/station/old-record');
});

it('accepts an exact same-origin canonical without changing its target', () => {
  state.location = '/nl/radios/profiel';
  render(breadcrumb(`${window.location.origin}/en/station/profiel`));
  expect(currentLink()).toHaveAttribute('href', '/en/station/profiel');
});

it.each(['/nl/stations/x', '/nl/profile', '/nl/genres/pop', '/qq/station/old-record'])('does not apply station canonical overrides to %s', location => {
  state.location = location;
  render(breadcrumb('https://themegaradio.com/en/station/safe-existing-fm'));
  expect(currentLink()).not.toHaveAttribute('href', '/en/station/safe-existing-fm');
});
