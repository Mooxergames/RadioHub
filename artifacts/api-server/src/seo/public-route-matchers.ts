import { GLOBAL_REVERSE_URL_TRANSLATIONS, URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';
import { ACTIVE_SITEMAP_LANGUAGES, COUNTRY_TO_LANGUAGE, SEO_LANGUAGES } from '@workspace/seo-shared/seo-config';

export const PUBLIC_SEO_LOCALE_CODES = new Set([
  ...SEO_LANGUAGES.filter(language => language.enabled).map(language => language.code),
  ...Object.keys(COUNTRY_TO_LANGUAGE),
].filter(code => /^[a-z]{2}$/.test(code)));

export function resolveBareDiscoveryPath(url: string): { language: string; cleanPath: string } | undefined {
  const match = /^\/([^/]+)\/?$/.exec(url.split('?')[0].split('#')[0]);
  if (!match) return undefined;
  try {
    // Accept normal UTF-8 URL encoding, not encoded ASCII route boundaries or
    // locale lookalikes. Decode once, before two-character locale detection.
    if (/%[0-7][0-9a-f]/i.test(match[1])) return undefined;
    const root = decodeURIComponent(match[1]);
    const mapping = GLOBAL_REVERSE_URL_TRANSLATIONS.get(root);
    if (!mapping || !['trending', 'recommendations', 'favorites'].includes(mapping.english)) return undefined;
    const language = mapping.english === root ? 'en' : ACTIVE_SITEMAP_LANGUAGES.find(
      locale => URL_TRANSLATIONS[locale]?.[mapping.english] === root) || mapping.sourceLanguage;
    return { language, cleanPath: `/${mapping.english}` };
  } catch { return undefined; }
}

export function decodePublicSeoPath(url: string): string | null {
  try {
    const rawSegments = url.split('?')[0].split('#')[0].split('/');
    const segments = rawSegments.map(segment => decodeURIComponent(segment));
    const root = rawSegments.findIndex(segment => segment !== '');
    // Only exact known bare discovery roots have a single-decode renderer
    // contract. Encoded locales and all other encoded bare roots stay rejected.
    if (root >= 0 && rawSegments[root] !== segments[root] && !resolveBareDiscoveryPath(url)) return null;
    // Decoding must never create a new route boundary inside a path segment.
    if (segments.some(segment => /[/\\?#\u0000-\u001f\u007f]/u.test(segment))) return null;
    return segments.join('/');
  } catch {
    return null;
  }
}

export function collectSeoTranslations(key: string): string[] {
  const values = new Set([key]);
  for (const translations of Object.values(URL_TRANSLATIONS)) {
    const value = translations[key];
    if (value) values.add(value);
  }
  return [...values].map(value => value.replace(/[.*+?${}()|[\]\\]/g, '\\$&'));
}

export function buildPublicSeoRouteMatchers() {
  const alternatives = (key: string) => collectSeoTranslations(key).join('|');
  const stations = [...new Set([...collectSeoTranslations('stations'), ...collectSeoTranslations('station')])].join('|');
  // A locale is a complete path segment, never the first two letters of a slug.
  const locales = [...PUBLIC_SEO_LOCALE_CODES].join('|');
  const prefix = `^\\/(?:(?:${locales})\\/)?`;
  return {
    stationPage: new RegExp(`${prefix}(?:${stations})\\/`, 'u'),
    homepage: new RegExp(`^\\/(?:(?:${locales})\\/?)?$`, 'u'),
    regionsPage: new RegExp(`${prefix}(?:${alternatives('regions')})(\\/.*)?$`, 'u'),
    genresPage: new RegExp(`${prefix}(?:${alternatives('genres')})(?:\\/.*)?$`, 'u'),
    aboutPage: new RegExp(`${prefix}(?:${alternatives('about')})\\/?$`, 'u'),
    contactPage: new RegExp(`${prefix}(?:${alternatives('contact')})\\/?$`, 'u'),
    privacyPage: new RegExp(`${prefix}(?:${alternatives('privacy-policy')})\\/?$`, 'u'),
    countryPage: new RegExp(`${prefix}country\\/.+$`, 'u'),
    stationsPage: new RegExp(`${prefix}(?:${stations})\\/?$`, 'u'),
    searchPage: new RegExp(`${prefix}(?:${alternatives('search')})\\/?$`, 'u'),
    faqPage: new RegExp(`${prefix}(?:${alternatives('faq')})\\/?$`, 'u'),
    termsPage: new RegExp(`${prefix}(?:${alternatives('terms-and-conditions')})\\/?$`, 'u'),
    applicationsPage: new RegExp(`${prefix}(?:${alternatives('applications')})\\/?$`, 'u'),
    usersPage: new RegExp(`${prefix}(?:${alternatives('users')})\\/?$`, 'u'),
    discoveryPage: new RegExp(`${prefix}(?:${alternatives('trending')}|${alternatives('recommendations')})\\/?$`, 'u'),
    blogPage: new RegExp(`${prefix}blog(?:\\/|$)`, 'u'),
  };
}
