import { blogLanguage, parseBlogPath } from '@workspace/seo-shared/blog-manifest';

/** Match SSR document metadata on SPA navigation, in both RTL/LTR directions. */
export function syncDocumentLocale(language: string, pathname?: string): void {
  if (typeof document === 'undefined') return;
  const blog = pathname ? parseBlogPath(pathname) : null;
  document.documentElement.lang = blog?.locale === language
    ? blogLanguage(blog.locale, blog.id)
    : language;
  document.documentElement.dir = language === 'ar' || language === 'he' ? 'rtl' : 'ltr';
}
