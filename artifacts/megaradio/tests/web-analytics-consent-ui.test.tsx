import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import PrivacySettingsButton, { WebAnalyticsConsentNotice } from '../src/components/ads/PrivacySettingsButton';
import { getWebAnalyticsCopy, WEB_ANALYTICS_COPY } from '../src/lib/web-analytics-copy';
import { setWebAnalyticsConsent } from '../src/lib/web-analytics-consent';
import { publicMeasurementUrl, suspendGoogleMeasurement } from '../src/lib/google-tag-manager';

const state = vi.hoisted(() => ({
  configured: true, publicPage: true, locked: false, saveSucceeds: true,
  choice: 'unknown' as 'unknown' | 'denied' | 'granted',
  listeners: new Set<() => void>(),
}));
vi.mock('../src/lib/google-tag-manager', () => ({
  isGoogleMeasurementConfigured: () => state.configured,
  isGoogleMeasurementLocked: () => state.locked,
  publicMeasurementUrl: vi.fn(() => state.publicPage ? `${window.location.origin}/en` : null),
  suspendGoogleMeasurement: vi.fn(() => { state.locked = true; }),
}));
vi.mock('../src/lib/web-analytics-consent', () => ({
  getWebAnalyticsConsent: () => state.choice,
  setWebAnalyticsConsent: vi.fn((choice: 'granted' | 'denied') => {
    if (!state.saveSucceeds) {
      state.choice = 'denied';
      state.locked = true;
      state.listeners.forEach(listener => listener());
      return false;
    }
    if (state.choice === 'granted' && choice === 'denied') state.locked = true;
    state.choice = choice;
    state.listeners.forEach(listener => listener());
    return true;
  }),
  subscribeWebAnalyticsConsent: (listener: () => void) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
}));

const host = window as any;
beforeEach(() => {
  state.configured = true; state.publicPage = true; state.locked = false;
  state.saveSucceeds = true; state.choice = 'unknown';
  delete host.googlefc;
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); delete host.googlefc; expect(state.listeners.size).toBe(0); });

function renderFooter(language = 'en') {
  return render(<footer>
    <WebAnalyticsConsentNotice language={language} />
    <PrivacySettingsButton language={language} />
  </footer>);
}

async function openSettings(language = 'en') {
  fireEvent.click(screen.getByRole('button', { name: getWebAnalyticsCopy(language).privacySettings }));
  return screen.findByRole('dialog', { name: getWebAnalyticsCopy(language).privacySettings });
}

it('has complete immutable copy in exactly the 14 supported locales', () => {
  expect(Object.keys(WEB_ANALYTICS_COPY).sort()).toEqual([...ACTIVE_SITEMAP_LANGUAGES].sort());
  expect(Object.isFrozen(WEB_ANALYTICS_COPY)).toBe(true);
  for (const language of ACTIVE_SITEMAP_LANGUAGES) {
    const copy = WEB_ANALYTICS_COPY[language];
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.keys(copy).sort()).toEqual(Object.keys(WEB_ANALYTICS_COPY.en).sort());
    for (const [key, value] of Object.entries(copy)) {
      expect(value.trim()).not.toBe('');
      if (language !== 'en' && key !== 'direction') expect(value).not.toBe(WEB_ANALYTICS_COPY.en[key as keyof typeof copy]);
    }
    expect(copy.direction).toBe(['ar', 'he'].includes(language) ? 'rtl' : 'ltr');
  }
  expect(getWebAnalyticsCopy('toString')).toBe(WEB_ANALYTICS_COPY.en);
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: offers equal inline choices, translated labels and direction without opening a dialog', language => {
  renderFooter(language);
  const copy = getWebAnalyticsCopy(language);
  const notice = screen.getByRole('region', { name: copy.noticeTitle });
  expect(notice.closest('footer')).not.toBeNull();
  expect(notice).toHaveAttribute('dir', copy.direction);
  expect(notice).toHaveAttribute('lang', language);
  expect(notice).toHaveClass('w-full');
  expect(notice.className).not.toMatch(/fixed|absolute|sticky/);
  const allow = within(notice).getByRole('button', { name: copy.allow, exact: true });
  const deny = within(notice).getByRole('button', { name: copy.continueWithout, exact: true });
  expect(allow.className).toBe(deny.className);
  expect(allow.tabIndex).toBe(deny.tabIndex);
  expect(within(notice).getByRole('button', { name: copy.settings, exact: true })).toBeVisible();
  expect(screen.getByRole('button', { name: copy.privacySettings })).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(setWebAnalyticsConsent).not.toHaveBeenCalled();
  expect(suspendGoogleMeasurement).not.toHaveBeenCalled();
  expect(document.querySelector('script[src*="google"]')).toBeNull();
  expect(publicMeasurementUrl).toHaveBeenCalledWith(window.location.href, window.location.origin);
});

it.each(['granted', 'denied'] as const)('hides the notice after an existing %s choice but keeps privacy settings available', choice => {
  state.choice = choice;
  renderFooter();
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
  expect(screen.getByTestId('privacy-settings')).toBeVisible();
});

it('does not show a notice on non-public pages or without a configured Google measurement', () => {
  state.publicPage = false;
  const view = renderFooter();
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
  expect(screen.getByTestId('privacy-settings')).toBeVisible();
  state.configured = false;
  view.rerender(<footer><WebAnalyticsConsentNotice language="en" /><PrivacySettingsButton language="en" /></footer>);
  expect(screen.queryByRole('button')).toBeNull();
});

it.each([['Allow', 'granted'], ['Continue without', 'denied']] as const)('%s persists only the explicit analytics choice', (label, choice) => {
  const show = vi.fn();
  host.googlefc = { callbackQueue: [], showRevocationMessage: show };
  renderFooter();
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
  expect(setWebAnalyticsConsent).toHaveBeenCalledTimes(1);
  expect(setWebAnalyticsConsent).toHaveBeenCalledWith(choice);
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
  expect(screen.getByTestId('privacy-settings')).toHaveFocus();
  expect(show).not.toHaveBeenCalled();
  expect(suspendGoogleMeasurement).not.toHaveBeenCalled();
  expect(host.googlefc.callbackQueue).toHaveLength(4);
});

it.each(['allow', 'continueWithout'] as const)('keeps a translated footer alert on failed %s persistence even when the store fails closed', command => {
  state.saveSucceeds = false;
  renderFooter('tr');
  fireEvent.click(screen.getByRole('button', { name: WEB_ANALYTICS_COPY.tr[command], exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent(WEB_ANALYTICS_COPY.tr.saveError);
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
  expect(state.choice).toBe('denied');
  expect(screen.getByTestId('web-analytics-settings')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('%s: opens an accessible translated dialog with analytics off until explicitly saved', async language => {
  renderFooter(language);
  const dialog = await openSettings(language);
  const copy = getWebAnalyticsCopy(language);
  expect(dialog).toHaveAttribute('dir', copy.direction);
  expect(dialog).toHaveAttribute('lang', language);
  expect(dialog).toHaveAccessibleDescription(copy.description);
  const toggle = within(dialog).getByRole('switch', { name: copy.analyticsLabel });
  expect(toggle).toHaveAttribute('dir', copy.direction);
  if (copy.direction === 'rtl') expect(toggle).toHaveClass('[&>span[data-state=checked]]:-translate-x-5');
  expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(toggle).toHaveAccessibleDescription(copy.advertisingDisabled);
  expect(within(dialog).getByRole('button', { name: copy.close, exact: true })).toBeVisible();
  expect(within(dialog).queryByRole('button', { name: copy.adsSettings })).toBeNull();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(setWebAnalyticsConsent).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: copy.save, exact: true }));
  expect(setWebAnalyticsConsent).toHaveBeenCalledTimes(1);
  expect(setWebAnalyticsConsent).toHaveBeenCalledWith('granted');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('leaves the dialog open with a translated error when saving fails, and permits retry', async () => {
  state.saveSucceeds = false;
  renderFooter('he');
  const dialog = await openSettings('he');
  fireEvent.click(within(dialog).getByRole('switch'));
  fireEvent.click(within(dialog).getByRole('button', { name: WEB_ANALYTICS_COPY.he.save }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent(WEB_ANALYTICS_COPY.he.saveError);
  expect(dialog).toBeVisible();
  expect(state.choice).toBe('denied');
  state.saveSucceeds = true;
  fireEvent.click(within(dialog).getByRole('switch'));
  fireEvent.click(within(dialog).getByRole('button', { name: WEB_ANALYTICS_COPY.he.save }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
});

it('keeps the inline Settings dialog and failure alert mounted when the store changes from unknown to denied', async () => {
  state.saveSucceeds = false;
  renderFooter();
  fireEvent.click(screen.getByTestId('web-analytics-settings'));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('switch'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  expect(state.choice).toBe('denied');
  expect(screen.queryByTestId('web-analytics-notice')).toBeNull();
  expect(dialog).toBeVisible();
  expect(within(dialog).getByRole('alert')).toHaveTextContent(WEB_ANALYTICS_COPY.en.saveError);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
  await waitFor(() => expect(screen.getByTestId('privacy-settings')).toHaveFocus());
});

it('can retry a failed inline choice through Settings and restore focus to the persistent privacy entry', async () => {
  state.saveSucceeds = false;
  renderFooter();
  fireEvent.click(screen.getByRole('button', { name: 'Allow', exact: true }));
  expect(screen.getByRole('alert')).toHaveTextContent(WEB_ANALYTICS_COPY.en.saveError);
  fireEvent.click(screen.getByTestId('web-analytics-settings'));
  const dialog = await screen.findByRole('dialog');
  expect(screen.queryByRole('alert')).toBeNull();
  state.saveSucceeds = true;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(setWebAnalyticsConsent).toHaveBeenLastCalledWith('denied');
  await waitFor(() => expect(screen.getByTestId('privacy-settings')).toHaveFocus());
});

it('can explicitly decline from the default-off dialog without any advertising consent', async () => {
  renderFooter();
  const dialog = await openSettings();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  expect(setWebAnalyticsConsent).toHaveBeenCalledTimes(1);
  expect(setWebAnalyticsConsent).toHaveBeenCalledWith('denied');
  expect(suspendGoogleMeasurement).not.toHaveBeenCalled();
});

it('reflects external store updates and removes StrictMode subscriptions on unmount', async () => {
  const view = render(<StrictMode><PrivacySettingsButton language="en" /></StrictMode>);
  const dialog = await openSettings();
  act(() => { state.choice = 'granted'; state.listeners.forEach(listener => listener()); });
  expect(within(dialog).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  view.unmount();
  expect(state.listeners.size).toBe(0);
});

it('explains a locked re-grant on the next full page load without forcing reload or resetting the page', async () => {
  state.choice = 'granted';
  renderFooter();
  let dialog = await openSettings();
  fireEvent.click(within(dialog).getByRole('switch'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  expect(state.choice).toBe('denied');
  expect(state.locked).toBe(true);
  dialog = await openSettings();
  fireEvent.click(within(dialog).getByRole('switch'));
  const location = window.location.href;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save', exact: true }));
  expect(screen.getByRole('status')).toHaveTextContent(WEB_ANALYTICS_COPY.en.nextLoad);
  expect(window.location.href).toBe(location);
  expect(screen.getByTestId('privacy-settings')).toBeVisible();
  dialog = await openSettings();
  expect(within(dialog).getByRole('status')).toHaveTextContent(WEB_ANALYTICS_COPY.en.nextLoad);
});

it('preserves suspension before the supported queued advertising action, independently of analytics', async () => {
  const show = vi.fn();
  const queue = { push: vi.fn((entry: any) => Object.values(entry).forEach((callback: any) => callback())) };
  const api = host.googlefc = { callbackQueue: queue, showRevocationMessage: show };
  render(<PrivacySettingsButton language="en" />);
  const dialog = await openSettings();
  expect(show).not.toHaveBeenCalled();
  expect(queue.push).toHaveBeenCalledTimes(2);
  fireEvent.click(within(dialog).getByRole('button', { name: WEB_ANALYTICS_COPY.en.adsSettings }));
  expect(host.googlefc).toBe(api);
  expect(suspendGoogleMeasurement).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledTimes(1);
  expect(vi.mocked(suspendGoogleMeasurement).mock.invocationCallOrder[0]).toBeLessThan(queue.push.mock.invocationCallOrder[2]);
  expect(queue.push.mock.invocationCallOrder[2]).toBeLessThan(show.mock.invocationCallOrder[0]);
  expect(setWebAnalyticsConsent).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('shows the separate advertising action only after CMP readiness, even while the dialog is open', async () => {
  host.googlefc = { callbackQueue: [] };
  render(<PrivacySettingsButton language="en" />);
  const dialog = await openSettings();
  expect(within(dialog).queryByRole('button', { name: WEB_ANALYTICS_COPY.en.adsSettings })).toBeNull();
  host.googlefc.showRevocationMessage = vi.fn();
  act(() => host.googlefc.callbackQueue.forEach((entry: any) => Object.values(entry).forEach((callback: any) => callback())));
  expect(within(dialog).getByRole('button', { name: WEB_ANALYTICS_COPY.en.adsSettings })).toBeVisible();
  expect(host.googlefc.showRevocationMessage).not.toHaveBeenCalled();
});

it('opens from inline Settings only on demand and restores focus there on Escape without saving', async () => {
  const user = userEvent.setup();
  renderFooter();
  const trigger = screen.getByTestId('web-analytics-settings');
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  await user.click(within(dialog).getByRole('switch'));
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(trigger).toHaveFocus();
  expect(setWebAnalyticsConsent).not.toHaveBeenCalled();
  expect(screen.getByTestId('web-analytics-notice')).toBeVisible();
});

it('contains keyboard focus and restores the footer entry on localized close', async () => {
  const user = userEvent.setup();
  renderFooter('ar');
  const trigger = screen.getByTestId('privacy-settings');
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog');
  const close = within(dialog).getByRole('button', { name: WEB_ANALYTICS_COPY.ar.close });
  await waitFor(() => expect(close).toHaveFocus());
  await user.tab({ shift: true });
  expect(within(dialog).getByRole('button', { name: WEB_ANALYTICS_COPY.ar.save })).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.click(close);
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(setWebAnalyticsConsent).not.toHaveBeenCalled();
});
