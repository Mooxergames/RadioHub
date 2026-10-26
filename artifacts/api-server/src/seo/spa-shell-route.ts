import { getLanguageFromPath } from '@workspace/seo-shared/seo-config';
import { GLOBAL_REVERSE_URL_TRANSLATIONS, URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { decodePublicSeoPath, PUBLIC_SEO_LOCALE_CODES } from './public-route-matchers';

// Public SEO routes are handled upstream. Preserve the client's known route
// families (including private flows), not every arbitrary path as a200 shell.
const routeRoots = new Set([
  ...Object.values(URL_TRANSLATIONS).flatMap(translations => Object.keys(translations)),
  'admin', 'admin-login', 'api-docs', 'api-user', 'auth', 'activate', 'premium',
  'tv', 'cast-receiver', 'country', 'blog', 'search', 'faq', 'llms', 'reset-password',
]);

export function isKnownSpaShellRoute(pathname: string): boolean {
  try {
    const rawPath = new URL(pathname, 'https://themegaradio.com').pathname;
    const decoded = decodePublicSeoPath(rawPath);
    if (decoded === null) return false;
    const prefix = decoded.split('/').filter(Boolean)[0];
    if (/^[a-z]{2}$/.test(prefix) && !PUBLIC_SEO_LOCALE_CODES.has(prefix) && !routeRoots.has(prefix)) return false;
    // This parser already decodes/translates locale paths. Repeating it can
    // promote an encoded separator into a real, but nonexistent, SPA route.
    const { cleanPath } = getLanguageFromPath(rawPath);
    if (cleanPath === '/' || cleanPath === '') return true;
    const root = cleanPath.split('/').filter(Boolean)[0];
    return routeRoots.has(root)
      || (root === prefix && routeRoots.has(GLOBAL_REVERSE_URL_TRANSLATIONS.get(root)?.english || ''));
  } catch { return false; }
}
