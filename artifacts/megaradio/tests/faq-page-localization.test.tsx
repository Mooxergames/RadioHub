import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAQ_PAGE_ITEMS, resolveFaqPageItems } from '@workspace/seo-shared/faq-schema';
import FaqPage from '../src/pages/faq';
const state = vi.hoisted(() => ({ language: 'de', translations: {} as Record<string, string> }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ localeTranslations: state.translations }) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({ currentLanguage: state.language, getLocalizedUrl: (path: string) => `/${state.language}/localized${path}` }) }));
vi.mock('@/components/SeoHead', () => ({ SeoHead: () => null }));
describe('missing appended FAQ locale keys', () => {
  it.each(['en','de','tr','es','fr','pt','it','ru','ar','zh','ja','ko','hi','he'])('%s resolves matching visible Q&A without English seed fallback', language => {
    state.language = language; state.translations = {};
    const items = resolveFaqPageItems(language, (_key, fallback) => fallback);
    expect(items).toHaveLength(23);
    const languages = items.find(item => item.id === 'faq-languages-supported')!;
    expect(languages.answer.length).toBeGreaterThan(20);
    expect(languages.answer).not.toContain('57');
    if (language !== 'en') for (const item of items) {
      const source = FAQ_PAGE_ITEMS.find(source => source.qKey.replaceAll('_', '-') === item.id)!;
      expect(item.question).not.toBe(source.qFallback);
      expect(item.answer).not.toBe(source.aFallback);
    }
    render(<FaqPage />);
    expect(screen.getByText(languages.question)).toBeInTheDocument();
    expect(screen.getByText(languages.answer)).toBeInTheDocument();
    expect(screen.getByTestId('link-contact')).toHaveAttribute('href', `/${language}/localized/contact`);
  });
  it('keeps existing localized and custom first-ten copy, replacing only exact known seed values', () => {
    const custom = { faq_what_is_radio: 'Custom first question', faq_how_search: 'Meine eigene Suchfrage',
      faq_how_search_answer: 'Meine eigene Antwort', faq_languages_supported_answer: 'Our interface is available in 57 languages and stations broadcast in dozens more — local language broadcasting from every region.' };
    const items = resolveFaqPageItems('de', (key, fallback) => custom[key as keyof typeof custom] ?? fallback);
    expect(items.find(item => item.id === 'faq-what-is-radio')?.question).toBe(custom.faq_what_is_radio);
    expect(items.find(item => item.id === 'faq-how-search')?.question).toBe(custom.faq_how_search);
    expect(items.find(item => item.id === 'faq-how-search')?.answer).toBe(custom.faq_how_search_answer);
    expect(items.find(item => item.id === 'faq-languages-supported')?.answer).not.toContain('57');
    const seeded = resolveFaqPageItems('de', (key, fallback) => key === 'faq_how_search' ? FAQ_PAGE_ITEMS[10].qFallback : fallback);
    expect(seeded.find(item => item.id === 'faq-how-search')?.question).not.toBe(FAQ_PAGE_ITEMS[10].qFallback);
  });
});
