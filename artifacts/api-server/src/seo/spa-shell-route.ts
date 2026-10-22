import { getLanguageFromPath } from '@workspace/seo-shared/seo-config';
import { reverseTranslateUrl, URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';

// Public SEO routes are handled upstream. Preserve the client's known route
// families (including private flows), not every arbitrary path as a200 shell.
const routeRoots = new Set([
  ...Object.values(URL_TRANSLATIONS).flatMap(translations => Object.keys(translations)),
  'admin', 'admin-login', 'api-docs', 'api-user', 'auth', 'activate', 'premium',
  'tv', 'cast-receiver', 'country', 'blog', 'search', 'faq', 'llms', 'reset-password',
]);

export function isKnownSpaShellRoute(pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(new URL(pathname, 'https://themegaradio.com').pathname);
    const { language, cleanPath } = getLanguageFromPath(decoded);
    const english = reverseTranslateUrl(cleanPath, language);
    if (english === '/' || english === '') return true;
    const root = english.split('/').filter(Boolean)[0];
    return routeRoots.has(root);
  } catch { return false; }
}
