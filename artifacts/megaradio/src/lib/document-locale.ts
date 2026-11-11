import { blogLanguage, parseBlogPath } from '@workspace/seo-shared/blog-manifest';
import { getLegacyStationGuideRoute } from '@workspace/seo-shared/legacy-station-guide-routes';

/** Match SSR document metadata on SPA navigation, in both RTL/LTR directions. */
export function syncDocumentLocale(language: string, pathname?: string): void {
  if (typeof document === 'undefined') return;
  const blog = pathname ? parseBlogPath(pathname) : null;
  const guide = pathname ? getLegacyStationGuideRoute(pathname) : null;
  const renderedGuide = guide && document.querySelector(`main[data-legacy-guide-id="${guide.id}"][lang="${guide.language}"]`);
  const documentLanguage = renderedGuide ? guide.language : blog?.locale === language
    ? blogLanguage(blog.locale, blog.id)
    : language;
  document.documentElement.lang = documentLanguage;
  document.documentElement.dir = documentLanguage === 'ar' || documentLanguage === 'he' ? 'rtl' : 'ltr';
}
