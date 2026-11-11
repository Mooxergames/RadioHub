import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TranslationProvider } from '../src/hooks/useTranslation';
import { getFaqHelpCopy, resolveFaqPageItems, resolveFaqPageText } from '@workspace/seo-shared/faq-schema';
import { generateSeoTags } from '@workspace/seo-shared/seo-config';
import { renderTranslationBootstrap } from '../../api-server/src/seo/translation-bootstrap';
import FaqPage from '../src/pages/faq';

vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => {
  const language = window.location.pathname.split('/')[1];
  return { currentLanguage: language, getLocalizedUrl: (path: string) => `/${language}${path}` };
} }));

const locales = ['en','de','tr','es','fr','pt','it','ru','ar','zh','ja','ko','hi','he'];
let client: QueryClient | undefined;
afterEach(() => {
  cleanup(); client?.clear();
  delete window.__INITIAL_LANGUAGE__; delete window.__INITIAL_TRANSLATIONS__;
});

it.each(locales)('%s keeps custom SSR answers on first render and after delayed locale data', async language => {
  window.history.replaceState({}, '', `/${language}/faq`);
  const custom = {
    faq_help_platform: `${language} < & " **custom question**`,
    faq_help_platform_answer: `${language} </script><script>not executable</script> [custom](text)`,
    faq_page_h1: `${language} custom heading`, faq_page_intro: `${language} custom intro`,
    faq_page_title: `${language} custom title`, faq_page_description: `${language} custom description`,
    footer_faq: `${language} custom footer`,
  };
  const bootstrap = renderTranslationBootstrap(language, custom, 'faq');
  const initial = bootstrap.match(/window\.__INITIAL_TRANSLATIONS__=(.*?);window\.__PRELOADED__/s)![1];
  window.__INITIAL_LANGUAGE__ = language;
  window.__INITIAL_TRANSLATIONS__ = JSON.parse(initial);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: () => new Promise(() => {}) } } });
  client.setQueryData(['/api/auth/me'], null);
  if (language !== 'en') client.setQueryData(['/api/translations', 'en'], { faq_help_platform: 'Different English API question', faq_more_help_text: 'Different English help' });
  const view = render(<QueryClientProvider client={client}><TranslationProvider><FaqPage /></TranslationProvider></QueryClientProvider>);
  expect(screen.getByRole('heading', {level: 1})).toHaveTextContent(custom.faq_page_h1);
  expect(screen.getByText(custom.faq_page_intro)).toBeInTheDocument();
  const items = resolveFaqPageItems(language, (key, fallback) => custom[key as keyof typeof custom] || fallback);
  for (const item of items) {
    expect(document.getElementById(item.id)).not.toBeNull();
    expect(screen.getByText(item.question)).toBeInTheDocument();
    expect(screen.getByText(item.answer)).toBeInTheDocument();
  }
  expect(view.container.querySelectorAll('details')).toHaveLength(23);
  expect(view.container.querySelectorAll('script')).toHaveLength(0);
  expect(screen.queryByText('Different English API question')).toBeNull();
  await act(async () => { client!.setQueryData(['/api/translations', language], custom); });
  await waitFor(() => expect(screen.getByText(custom.faq_help_platform_answer)).toBeInTheDocument());
  expect(resolveFaqPageText(language, window.__INITIAL_TRANSLATIONS__).label).toBe(custom.footer_faq);
  const seo = generateSeoTags('faq', language, custom, '/faq', 'https://themegaradio.com');
  expect(seo.title).toBe(custom.faq_page_title);
  expect(seo.description).toBe(custom.faq_page_description);
  expect(seo.twitterTitle).toBe(custom.faq_page_title);
});

it.each(locales)('%s stays native with empty locale even if English dictionary arrives first', language => {
  window.history.replaceState({}, '', `/${language}/faq`);
  client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity, queryFn: () => new Promise(() => {})}}});
  client.setQueryData(['/api/auth/me'], null);
  if (language !== 'en') client.setQueryData(['/api/translations', 'en'], { faq_page_h1: 'Unrelated English seed', faq_help_platform: 'Unrelated question' });
  render(<QueryClientProvider client={client}><TranslationProvider><FaqPage /></TranslationProvider></QueryClientProvider>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(getFaqHelpCopy(language).title);
  expect(screen.queryByText('Unrelated English seed')).toBeNull();
  expect(screen.getByText(getFaqHelpCopy(language).items[0][0])).toBeInTheDocument();
});

it('keeps collapsed answers in the DOM, supports native disclosure and reveals hash targets', async () => {
  window.history.replaceState({}, '', '/tr/faq#faq-help-mobile-data');
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } } });
  client.setQueryData(['/api/auth/me'], null);
  const view = render(<QueryClientProvider client={client}><TranslationProvider><FaqPage /></TranslationProvider></QueryClientProvider>);
  const details = document.getElementById('faq-help-mobile-data') as HTMLDetailsElement;
  expect(details.open).toBe(true);
  const closed = document.getElementById('faq-help-audio-quality') as HTMLDetailsElement;
  expect(closed.open).toBe(false);
  expect(closed.querySelector('p')!.textContent!.length).toBeGreaterThan(20);
  fireEvent.click(closed.querySelector('summary')!);
  expect(closed.open).toBe(true);
  await act(async () => {
    window.history.replaceState({}, '', '/tr/faq#faq-help-track-information');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect((document.getElementById('faq-help-track-information') as HTMLDetailsElement).open).toBe(true);
  expect(new Set([...view.container.querySelectorAll('[id]')].map(node => node.id)).size).toBe(23);
});

it('replaces exact old device/request seeds but retains almost-identical custom copy', () => {
  const old = 'Mega Radio works on desktops, laptops, smartphones, tablets, smart speakers, smart TVs and car infotainment systems.';
  const resolve = (answer: string) => resolveFaqPageItems('tr', (key, fallback) => key === 'faq_supported_devices_answer' ? answer : fallback)
    .find(item => item.id === 'faq-supported-devices')!.answer;
  expect(resolve(old)).toBe(getFaqHelpCopy('tr').deviceAnswer);
  expect(resolve(`${old} Custom exception.`)).toBe(`${old} Custom exception.`);
  const request = resolveFaqPageItems('tr', (key, fallback) => key === 'faq_request_station_answer'
    ? 'Use the Request Station form to submit your favourite broadcaster — our team reviews and adds new stations regularly.' : fallback);
  expect(request.find(item => item.id === 'faq-request-station')?.answer).toBe(getFaqHelpCopy('tr').requestAnswer);
});
