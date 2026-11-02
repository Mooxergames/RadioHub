import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TranslationProvider } from '../src/hooks/useTranslation';
import HomeFaq from '../src/components/HomeFaq';
import { HOME_FAQ_ITEM_IDS, resolveHomeFaqContent } from '@workspace/seo-shared/faq-schema';
import { renderTranslationBootstrap } from '../../api-server/src/seo/translation-bootstrap';
import { renderHomeFaqBody } from '../../api-server/src/seo/home-faq-body';

vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => {
  const language = window.location.pathname.split('/')[1];
  return { currentLanguage: language, getLocalizedUrl: (path: string) => `/${language}${path}` };
} }));

const locales = ['en', 'de', 'tr', 'es', 'fr', 'pt', 'it', 'ru', 'ar', 'zh', 'ja', 'ko', 'hi', 'he'];
let client: QueryClient | undefined;
afterEach(() => {
  cleanup(); client?.clear();
  delete window.__INITIAL_LANGUAGE__; delete window.__INITIAL_TRANSLATIONS__;
});

function mount(language: string, translations?: Record<string, string>, failQueries = false) {
  window.history.replaceState({}, '', `/${language}`);
  if (translations) {
    const bootstrap = renderTranslationBootstrap(language, translations, 'home');
    window.__INITIAL_LANGUAGE__ = language;
    window.__INITIAL_TRANSLATIONS__ = JSON.parse(bootstrap.match(/window\.__INITIAL_TRANSLATIONS__=(.*?);window\.__PRELOADED__/s)![1]);
  }
  client = new QueryClient({ defaultOptions: { queries: {
    retry: false, staleTime: Infinity,
    queryFn: failQueries ? () => Promise.reject(new Error('Dictionary unavailable')) : () => new Promise(() => {}),
  } } });
  client.setQueryData(['/api/auth/me'], null);
  if (language !== 'en') client.setQueryData(['/api/translations', 'en'], {
    footer_faq: 'Unrelated English heading', faq_is_radio_free: 'Unrelated English question',
    faq_help_platform_answer: 'Unrelated English intro',
  });
  return render(<QueryClientProvider client={client}><TranslationProvider><HomeFaq /></TranslationProvider></QueryClientProvider>);
}

it.each(locales)('%s renders the same eight localized answers in SSR and React', language => {
  const expected = resolveHomeFaqContent(language);
  const view = mount(language);
  const section = screen.getByTestId('home-faq');
  expect(section).toHaveAttribute('lang', language);
  expect(section).toHaveAttribute('dir', ['ar', 'he'].includes(language) ? 'rtl' : 'ltr');
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(expected.title);
  expect(screen.getByText(expected.intro)).toBeInTheDocument();
  expect(view.container.querySelectorAll('details')).toHaveLength(8);
  expect([...view.container.querySelectorAll('details')].map(node => node.id)).toEqual(HOME_FAQ_ITEM_IDS.map(id => `home-${id}`));
  const server = document.createElement('div');
  server.innerHTML = renderHomeFaqBody(language, {}, `/${language}/faq`);
  const copyBlocks = (root: Element) => [...root.querySelectorAll('h2, h3, p, a')].map(node => node.textContent!.trim());
  expect(copyBlocks(server)).toEqual(copyBlocks(section));
  for (const item of expected.items) {
    const details = document.getElementById(`home-${item.id}`) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('h3')).toHaveTextContent(item.question);
    expect(details.querySelector('p')).toHaveTextContent(item.answer);
  }
  expect(screen.getByRole('link', { name: expected.linkLabel })).toHaveAttribute('href', `/${language}/faq`);
  expect(screen.queryByText('Unrelated English heading')).toBeNull();
  expect(view.container.querySelectorAll('script')).toHaveLength(0);
});

it.each(locales)('%s retains custom first-paint copy through delayed and failed dictionaries', async language => {
  const custom = {
    footer_faq: `${language} custom heading`, faq_page_title: `${language} custom link`,
    faq_help_platform_answer: `${language} <intro> & "safe"`,
    faq_is_radio_free: `${language} custom question`,
    faq_is_radio_free_answer: `${language} </script><script>not executable</script>`,
  };
  const view = mount(language, custom, true);
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(custom.footer_faq);
  expect(screen.getByText(custom.faq_is_radio_free_answer)).toBeInTheDocument();
  expect(screen.getByText(custom.faq_help_platform_answer)).toBeInTheDocument();
  const server = document.createElement('div');
  server.innerHTML = renderHomeFaqBody(language, custom, `/${language}/faq`);
  expect([...server.querySelectorAll('h2, h3, p, a')].map(node => node.textContent!.trim()))
    .toEqual([...screen.getByTestId('home-faq').querySelectorAll('h2, h3, p, a')].map(node => node.textContent!.trim()));
  await act(async () => { await client!.refetchQueries({ queryKey: ['/api/translations', language] }); });
  expect(screen.getByText(custom.faq_is_radio_free_answer)).toBeInTheDocument();
  await act(async () => { client!.setQueryData(['/api/translations', language], custom); });
  expect(screen.getByText(custom.faq_is_radio_free_answer)).toBeInTheDocument();
  expect(view.container.querySelectorAll('script')).toHaveLength(0);
  const details = document.getElementById('home-faq-is-radio-free') as HTMLDetailsElement;
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(true);
  fireEvent.click(details.querySelector('summary')!);
  expect(details.open).toBe(false);
});
