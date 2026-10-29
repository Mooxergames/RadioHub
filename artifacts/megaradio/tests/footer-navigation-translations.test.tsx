import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getFaqHelpCopy } from '@workspace/seo-shared/faq-schema';
import { render, screen, fireEvent } from '@testing-library/react';
const state = vi.hoisted(() => ({ language: 'de', values: {} as Record<string, string>, changeLanguage: vi.fn() }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (key: string, fallback: string) => state.values[key] ?? fallback, localeTranslations: state.values, isLoading: false }) }));
vi.mock('@/hooks/useGlobalPlayer', () => ({ useGlobalPlayer: () => ({ currentStation: null }) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({ getLocalizedUrl: (path: string) => `/${state.language}${path}`, currentLanguage: state.language, changeLanguage: state.changeLanguage }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
vi.mock('@/components/ads/DeferredAdSenseUnit', () => ({ default: () => null }));
vi.mock('wouter', () => ({ Link: ({ children, to, href, ...props }: any) => <a {...props} href={to || href}>{children}</a>, useLocation: () => ['/de', vi.fn()], useSearch: () => '' }));
import Footer from '../src/components/layout/footer';
beforeEach(() => { state.language = 'de'; state.values = { nav_for_you: 'Für Sie', users: 'Nutzer' }; state.changeLanguage.mockClear(); });

it.each(['en','de','tr','es','fr','pt','it','ru','ar','zh','ja','ko','hi','he'])('links directly to the native %s FAQ from the footer', language => {
  state.language = language;
  render(<Footer />);
  expect(screen.getByTestId('footer-faq')).toHaveTextContent(getFaqHelpCopy(language).label);
  expect(screen.getByTestId('footer-faq')).toHaveAttribute('href', `/${language}/faq`);
});

it('keeps custom locale FAQ footer text', () => {
  state.values.footer_faq = 'Unsere Antworten';
  render(<Footer />);
  expect(screen.getByTestId('footer-faq')).toHaveTextContent('Unsere Antworten');
});

it('brand link opens the localized home with one language-neutral accessible name', () => {
  render(<Footer />);
  const brand = screen.getByRole('link', { name: 'MegaRadio', exact: true });
  expect(brand).toHaveAttribute('href', '/de/');
  expect(brand.querySelector('img')).toHaveAttribute('alt', '');
  expect(brand.querySelector('img')).toHaveAttribute('title', 'MegaRadio');
});

it('uses verified existing German navigation translations without changing destinations', () => {
  render(<Footer />);
  expect(screen.getByRole('link', { name: 'Für Sie' })).toHaveAttribute('href', '/de/recommendations');
  expect(screen.getByRole('link', { name: 'Nutzer' })).toHaveAttribute('href', '/de/users');
  expect(screen.queryByRole('link', { name: 'Recommendations' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Listeners' })).toBeNull();
});
it('preserves custom footer translations over the shared-label fallback', () => {
  state.values.footer_recommendations = 'Eigene Empfehlungen'; state.values.footer_users = 'Unsere Hörergemeinschaft';
  render(<Footer />);
  expect(screen.getByRole('link', { name: 'Eigene Empfehlungen' })).toHaveAttribute('href', '/de/recommendations');
  expect(screen.getByRole('link', { name: 'Unsere Hörergemeinschaft' })).toHaveAttribute('href', '/de/users');
});

it('offers exactly the 14 supported public locales, not legacy redirect-only choices', () => {
  render(<Footer />);
  fireEvent.click(screen.getByTestId('footer-language-selector'));
  const codes=screen.getAllByTestId(/^language-option-/).map(el=>el.getAttribute('data-testid')!.replace('language-option-','')).sort();
  expect(codes).toEqual(['en','es','fr','de','pt','it','ru','ar','zh','tr','ja','ko','hi','he'].sort());
  expect(screen.queryByTestId('language-option-nl')).toBeNull();
});

it('preserves supported language switching and closes the picker', () => {
  render(<Footer />);
  fireEvent.click(screen.getByTestId('footer-language-selector'));
  fireEvent.click(screen.getByTestId('language-option-tr'));
  expect(state.changeLanguage).toHaveBeenCalledTimes(1);
  expect(state.changeLanguage).toHaveBeenCalledWith('tr');
  expect(screen.queryByTestId('language-option-tr')).toBeNull();
});

it('searches supported languages by native name and code without reintroducing legacy ones', () => {
  render(<Footer />);
  fireEvent.click(screen.getByTestId('footer-language-selector'));
  const search=screen.getByTestId('language-search-input');
  fireEvent.change(search,{target:{value:'Español'}});
  expect(screen.getAllByTestId(/^language-option-/)).toHaveLength(1);
  expect(screen.getByTestId('language-option-es')).toBeVisible();
  fireEvent.change(search,{target:{value:'nl'}});
  expect(screen.queryAllByTestId(/^language-option-/)).toHaveLength(0);
});
