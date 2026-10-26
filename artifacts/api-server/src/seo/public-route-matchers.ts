import { URL_TRANSLATIONS } from '@workspace/seo-shared/url-translations';

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
  const prefix = '^\\/(?:[a-z]{2}\\/)?';
  return {
    stationPage: new RegExp(`${prefix}(?:${stations})\\/`, 'u'),
    homepage: /^\/([a-z]{2}\/?)?$/,
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
  };
}
