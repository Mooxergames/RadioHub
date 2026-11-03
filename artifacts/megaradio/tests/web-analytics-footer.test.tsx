import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import Footer from '../src/components/layout/footer';
import { getWebAnalyticsCopy } from '../src/lib/web-analytics-copy';

const state = vi.hoisted(() => ({
  language: 'en', configured: true, publicPage: true,
  station: { id: 'playing-station' } as { id: string } | null,
  choice: 'unknown' as 'unknown' | 'denied' | 'granted',
}));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({ currentStation: state.station }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  t: (_key: string, fallback: string) => fallback, isLoading: false,
}) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({
  currentLanguage: state.language, changeLanguage: vi.fn(), getLocalizedUrl: (path: string) => `/${state.language}${path}`,
}) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
vi.mock('@/components/ads/DeferredAdSenseUnit', () => ({ default: () => null }));
vi.mock('@/lib/google-tag-manager', () => ({
  isGoogleMeasurementConfigured: () => state.configured,
  isGoogleMeasurementLocked: () => false,
  publicMeasurementUrl: () => state.publicPage ? `${window.location.origin}/en` : null,
  suspendGoogleMeasurement: vi.fn(),
}));
vi.mock('@/lib/web-analytics-consent', () => ({
  getWebAnalyticsConsent: () => state.choice,
  setWebAnalyticsConsent: vi.fn(),
  subscribeWebAnalyticsConsent: () => () => {},
}));

beforeEach(() => {
  state.language = 'en'; state.configured = true; state.publicPage = true;
  state.station = { id: 'playing-station' }; state.choice = 'unknown';
  delete (window as any).googlefc;
});
afterEach(() => { cleanup(); delete (window as any).googlefc; });

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: inserts a full-width inline notice before the existing footer grid and keeps player spacing', language => {
  state.language = language;
  render(<Footer />);
  const footer = screen.getByRole('contentinfo');
  const notice = screen.getByTestId('web-analytics-notice');
  expect(notice.parentElement).toBe(footer);
  expect(notice.nextElementSibling).toHaveClass('container', 'mx-auto');
  expect(notice.nextElementSibling?.querySelector('.md\\:grid-cols-12')).not.toBeNull();
  expect(notice).toHaveAttribute('dir', getWebAnalyticsCopy(language).direction);
  expect(footer.getAttribute('style')).toContain('144px');
  expect(footer.getAttribute('style')).toContain('safe-area-inset-bottom');
  expect(screen.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', `/${language}/privacy-policy`);
  expect(screen.getByTestId('privacy-settings')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('leaves all existing footer geometry untouched when no notice is eligible', () => {
  state.publicPage = false;
  const view = render(<Footer />);
  const footer = screen.getByRole('contentinfo');
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
  const markup = footer.innerHTML;
  const style = footer.getAttribute('style');
  state.configured = false;
  view.rerender(<Footer />);
  expect(footer.getAttribute('style')).toBe(style);
  expect(screen.queryByTestId('privacy-settings')).toBeNull();
  expect(footer.querySelector('.md\\:grid-cols-12')).not.toBeNull();
  expect(markup).toContain('footer-privacy-settings');
});

it('opens settings only after an explicit footer action and does not change the current player identity', async () => {
  render(<Footer />);
  const station = state.station;
  fireEvent.click(screen.getByTestId('privacy-settings'));
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(state.station).toBe(station);
  expect(screen.getByRole('contentinfo', { hidden: true }).getAttribute('style')).toContain('144px');
});
