import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resolveFaqPageText } from '@workspace/seo-shared/faq-schema';
import { RouteBreadcrumbs } from '../src/components/RouteBreadcrumbs';

const state = vi.hoisted(() => ({ language: 'tr', values: {} as Record<string, string> }));
vi.mock('wouter', () => ({
  useLocation: () => [`/${state.language}/faq`],
  Link: ({href, children, ...props}: any) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({
  t: (key: string, fallback: string) => state.values[key] || fallback,
  localeTranslations: state.values,
}) }));
beforeEach(() => { state.language = 'tr'; state.values = {}; });

it.each(['en','de','tr','es','fr','pt','it','ru','ar','zh','ja','ko','hi','he'])('%s separates navigation and footer custom copy', language => {
  state.language = language;
  state.values = { nav_faq: `${language} navigation`, footer_faq: `${language} footer` };
  render(<RouteBreadcrumbs />);
  expect(screen.getByRole('link', {name: `${language} navigation`})).toHaveAttribute('href', `/${language}/faq`);
  expect(screen.queryByRole('link', {name: `${language} footer`})).toBeNull();
  expect(resolveFaqPageText(language, state.values).label).toBe(`${language} footer`);
});

it('uses native navigation fallback when only a custom footer label exists', () => {
  state.values = { footer_faq: 'Özel alt menü etiketi' };
  render(<RouteBreadcrumbs />);
  expect(screen.getByRole('link', {name: 'Sıkça Sorulan Sorular'})).toHaveAttribute('href', '/tr/faq');
  expect(screen.queryByText(state.values.footer_faq)).toBeNull();
  expect(resolveFaqPageText('tr', state.values).label).toBe(state.values.footer_faq);
});
