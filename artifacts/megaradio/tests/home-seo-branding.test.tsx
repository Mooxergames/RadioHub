import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_SITEMAP_LANGUAGES, generateSeoTags, normalizeSeoTitle } from '@workspace/seo-shared/seo-config';
import { buildHomeSeo, buildHomeSeoTitle, HOME_SEO_TEMPLATES } from '@workspace/seo-shared/home-seo-templates';

const state = vi.hoisted(() => ({
  location: '/en', language: 'en', translations: {} as Record<string, string>,
  data: new Map<string, unknown>(), options: [] as any[],
}));
let initialGuard: (url: string) => boolean;
vi.mock('wouter', () => ({ useLocation: () => [state.location, vi.fn()], useSearch: () => '' }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ language: state.language }) }));
vi.mock('@/hooks/useSeoRouting', () => ({ useSeoRouting: () => ({ currentLanguage: state.language, englishPath: '/' }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: any) => {
    state.options.push(options);
    return { data: options.queryKey[0] === '/api/translations'
      ? state.translations : state.data.get(options.queryKey.join('|')) };
  },
}));
vi.mock('@/utils/ssr-seo-head', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/utils/ssr-seo-head')>(),
  preserveInitialSsrHead: (url: string) => initialGuard(url),
}));

import { createInitialSsrHeadGuard } from '../src/utils/ssr-seo-head';
import { SeoHead } from '../src/components/SeoHead';
import { SeoPageWrapper } from '../src/components/SeoPageWrapper';

const legacyCases = [
  ['en', 'Mega Radio: Listen to Free Live Radio & Music from 120 Countries',
    'Listen to Free Live Radio & Music from 120 Countries | Mega Radio'],
  ['de', 'Mega Radio: Kostenlos Live-Radio & Musik aus 120 Ländern hören',
    'Kostenlos Live-Radio & Musik aus 120 Ländern hören | Mega Radio'],
] as const;

function expectHead(title: string) {
  expect(document.title).toBe(title);
  expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute('content', title);
  expect(document.querySelector('meta[name="twitter:title"]')).toHaveAttribute('content', title);
}

beforeEach(() => {
  document.head.innerHTML = '';
  state.location = '/en'; state.language = 'en'; state.translations = {};
  state.data.clear(); state.options = [];
  initialGuard = createInitialSsrHeadGuard(null);
});

describe('homepage-only branding', () => {
  it.each(ACTIVE_SITEMAP_LANGUAGES)('%s uses a concise localized homepage title consistently across head tags', (language) => {
    const expected = `${HOME_SEO_TEMPLATES[language].title} | Mega Radio`;
    const tags = generateSeoTags('home', language, {}, '/', 'https://themegaradio.com');
    expect([...expected].length).toBeLessThanOrEqual(55);
    expect(expected).not.toMatch(/120|\.\.\.|…/);
    expect(tags.title).toBe(expected);
    expect(tags.ogTitle).toBe(expected);
    expect(tags.twitterTitle).toBe(expected);
    expect(expected.match(/Mega Radio/g)).toHaveLength(1);
    if (language !== 'en') expect(HOME_SEO_TEMPLATES[language].title).not.toBe(HOME_SEO_TEMPLATES.en.title);
  });
  it('uses the concise English homepage title in fallback and saved metadata', async () => {
    const expected = 'Free Live Radio Online | Mega Radio';
    expect(buildHomeSeo('en').title).toBe(expected);
    state.translations = { hero_worlds_best_radio: 'Free Live Radio Online' };
    expect(buildHomeSeo('en', state.translations).title).toBe(expected);
    render(<SeoHead pageType="home" />);
    await waitFor(() => expectHead(expected));
  });
  it.each([
    ['zh', 'Mega Radio：来自 120 个国家的免费直播电台', '来自 120 个国家的免费直播电台 | Mega Radio'],
    ['ja', 'Mega Radio：120カ国からの無料ライブラジオ', '120カ国からの無料ライブラジオ | Mega Radio'],
  ])('handles the fullwidth colon in actual %s homepage copy', async (language, raw, expected) => {
    expect(buildHomeSeoTitle(language, raw)).toBe(expected);
    expect(buildHomeSeoTitle(language, expected)).toBe(expected);
    const tags = generateSeoTags('home', language, { meta_title: raw }, '/', 'https://themegaradio.com');
    expect(tags.title).toBe(expected);
    expect(tags.ogTitle).toBe(expected);
    expect(tags.twitterTitle).toBe(expected);
    expect(expected.match(/Mega Radio/g)).toHaveLength(1);
    state.language = language; state.location = `/${language}`;
    state.translations = { meta_title: raw };
    render(<SeoHead pageType="home" />);
    await waitFor(() => expectHead(expected));
  });

  it.each(legacyCases)('keeps the complete legacy %s sentence with one brand', (language, raw, expected) => {
    expect(buildHomeSeoTitle(language, raw)).toBe(expected);
    expect(buildHomeSeo(language, { meta_title: raw }).title).toBe(expected);
    expect(normalizeSeoTitle(expected)).toBe(expected);
    expect(expected.length).toBeGreaterThan(60);
    expect(expected.length).toBeLessThanOrEqual(70);
    expect(normalizeSeoTitle(`${raw} | Mega Radio`)).not.toBe(expected);
  });

  it.each([
    'Custom search title', 'Mega Radio: Custom search title',
    'Mega Radio - Custom search title', 'Mega Radio – Custom search title',
    'Mega Radio — Custom search title', 'Mega Radio | Custom search title',
    'Custom search title | Mega Radio',
    'Mega Radio: Custom search title | Mega Radio | Mega Radio',
    ' mega radio: Custom search title|MEGA RADIO ',
  ])('normalizes only separated edge branding: %s', (raw) => {
    const title = buildHomeSeoTitle('de', raw);
    expect(title).toBe('Custom search title | Mega Radio');
    expect(buildHomeSeoTitle('de', title)).toBe(title);
  });

  it.each([
    'Discover Mega Radio with friends', 'Mega Radioactive music',
    'Mega Radio Deutsch', 'MegaRadio: Independent title',
    'ميغا راديو: راديو مباشر', 'Meine eigene Überschrift "A&B"',
    'Custom live radio picks for music and news from every country',
  ])('preserves meaningful custom copy without a new length limit: %s', (raw) => {
    expect(buildHomeSeoTitle('de', raw)).toBe(`${raw} | Mega Radio`);
    const translations = { meta_title: raw, hero_worlds_best_radio: 'Ignored legacy title' };
    const before = { ...translations };
    expect(buildHomeSeo('de', translations).title).toBe(`${raw} | Mega Radio`);
    expect(translations).toEqual(before);
  });

  it.each(ACTIVE_SITEMAP_LANGUAGES)('%s retains localized fallback and DB precedence', (language) => {
    expect(Object.keys(HOME_SEO_TEMPLATES)).toHaveLength(14);
    const fallback = `${HOME_SEO_TEMPLATES[language].title} | Mega Radio`;
    for (const raw of [undefined, '', '  ', 'Mega Radio', 'Mega Radio:', '| Mega Radio', 'Mega Radio | Mega Radio']) {
      const tags = generateSeoTags('home', language, raw === undefined ? {} : { meta_title: raw }, '/', 'https://themegaradio.com');
      expect(tags.title).toBe(fallback);
      expect(tags.ogTitle).toBe(fallback);
      expect(tags.twitterTitle).toBe(fallback);
      expect(normalizeSeoTitle(tags.title)).toBe(fallback);
      expect(tags.canonical).toBe(`https://themegaradio.com/${language}`);
    }
    expect(buildHomeSeo(language, { meta_title: ' ', hero_worlds_best_radio: 'Legacy custom title' }).title)
      .toBe('Legacy custom title | Mega Radio');
    expect(buildHomeSeo(language, { meta_title: 'Admin title', hero_worlds_best_radio: 'Ignored legacy' }).title)
      .toBe('Admin title | Mega Radio');
  });

  it('retains English fallback for an unsupported locale', () => {
    expect(buildHomeSeo('unknown').title).toBe(`${HOME_SEO_TEMPLATES.en.title} | Mega Radio`);
  });

  it.each(legacyCases)('client fallback applies complete %s metadata and social titles', async (language, raw, expected) => {
    state.language = language; state.location = `/${language}`;
    state.translations = { meta_title: raw };
    render(<SeoHead pageType="home" />);
    await waitFor(() => expectHead(expected));
  });

  it.each(ACTIVE_SITEMAP_LANGUAGES)('%s preserves direct-load metadata then refreshes it on in-app return', (language) => {
    state.language = language; state.location = `/${language}`;
    const seoTags = generateSeoTags('home', language, {}, '/', 'https://themegaradio.com');
    document.head.innerHTML = `<title>${seoTags.title}</title>
      <meta property="og:title" content="${seoTags.title}">
      <meta name="twitter:title" content="${seoTags.title}">
      <link rel="canonical" data-managed="seo-head" href="${seoTags.canonical}">`;
    initialGuard = createInitialSsrHeadGuard(state.location);
    state.translations = { meta_title: 'Stale translations must not replace SSR' };
    const content = <SeoHead pageType="home" />;
    const view = render(<SeoPageWrapper>{content}</SeoPageWrapper>);
    expectHead(seoTags.title);
    expect(state.options.find(option => option.queryKey[0] === '/api/seo/page-data').enabled).toBe(false);
    state.location = `/${language}/faq`;
    view.rerender(<SeoPageWrapper>{content}</SeoPageWrapper>);
    const updated = generateSeoTags('home', language, { meta_title: 'Mega Radio: Updated search title | Mega Radio' }, '/', 'https://themegaradio.com');
    state.location = `/${language}`;
    state.data.set(`/api/seo/page-data|${state.location}|${language}`, { seoTags: updated });
    view.rerender(<SeoPageWrapper>{content}</SeoPageWrapper>);
    expectHead('Updated search title | Mega Radio');
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', seoTags.canonical);
  });
});
