import { afterEach, expect, it } from 'vitest';
import { syncDocumentLocale } from '../src/lib/document-locale';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { BLOG_LOCALES, blogIdsForLocale, blogLanguage, blogPath } from '@workspace/seo-shared/blog-manifest';

afterEach(() => { document.documentElement.removeAttribute('lang'); document.documentElement.removeAttribute('dir'); });

it('updates both document language and direction through en/ar/de/he and back to en', () => {
  // Simulate an SSR Arabic document; subsequent switches must not inherit it.
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  const root = document.documentElement;
  for (const [language, direction] of [['en', 'ltr'], ['ar', 'rtl'], ['de', 'ltr'], ['he', 'rtl'], ['en', 'ltr']]) {
    syncDocumentLocale(language);
    expect(document.documentElement).toBe(root);
    expect(root.lang).toBe(language);
    expect(root.dir).toBe(direction);
  }
});

it.each(ACTIVE_SITEMAP_LANGUAGES)('matches SSR writing direction for %s', language => {
  syncDocumentLocale(language);
  expect(document.documentElement.lang).toBe(language);
  expect(document.documentElement.dir).toBe(language === 'ar' || language === 'he' ? 'rtl' : 'ltr');
});

it('preserves the actual article language on hydration and resets it on SPA navigation', () => {
  document.documentElement.lang = 'zh-Hant-HK';
  const visits = [
    ['zh', '/zh/blog/rthk-catchup-dates', 'zh-Hant-HK', 'ltr'],
    ['zh', '/zh/blog/listen-to-radio-online', 'zh', 'ltr'],
    ['zh', '/zh/blog/rthk-accessible-player?source=test#section-1', 'zh-Hant-HK', 'ltr'],
    ['zh', '/zh/blog', 'zh', 'ltr'],
    ['zh', '/zh', 'zh', 'ltr'],
    ['ar', '/ar/blog/saudi-quran-reciter-schedule', 'ar', 'rtl'],
    ['he', '/he/blog', 'he', 'rtl'],
    ['en', '/en', 'en', 'ltr'],
  ];
  for (const [language, path, expected, direction] of visits) {
    syncDocumentLocale(language, path);
    expect(document.documentElement.lang).toBe(expected);
    expect(document.documentElement.dir).toBe(direction);
  }
});

it('uses the same document language as SSR for all 194 published blog routes', () => {
  let checked = 0;
  for (const locale of BLOG_LOCALES) {
    for (const id of [undefined, ...blogIdsForLocale(locale)]) {
      syncDocumentLocale(locale, blogPath(locale, id));
      expect(document.documentElement.lang).toBe(blogLanguage(locale, id));
      expect(document.documentElement.dir).toBe(locale === 'ar' || locale === 'he' ? 'rtl' : 'ltr');
      checked++;
    }
  }
  expect(checked).toBe(194);
});

it.each([
  ['zh', '/zh/blog/kral-fm-canli-dinle-sorunlari'],
  ['zh', '/zh/blog/not-a-published-article'],
  ['zh', '/zh/blog/rthk-catchup-dates/extra'],
  ['zh', '/am/blog/rthk-catchup-dates'],
  ['en', '/zh/blog/rthk-catchup-dates'],
])('does not infer a regional language for absent or mismatched routes: %s %s', (language, path) => {
  syncDocumentLocale(language, path);
  expect(document.documentElement.lang).toBe(language);
});
