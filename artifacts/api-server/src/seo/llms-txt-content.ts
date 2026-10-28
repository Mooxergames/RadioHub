import { ACTIVE_SITEMAP_LANGUAGES, SEO_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { blogIdsForLocale, blogPath, isCoreBlogId, type BlogLocale } from '@workspace/seo-shared/blog-manifest';
import type { BlogLocaleContent } from '@workspace/seo-shared/blog';
import copy from './llms-locales.json';
import { buildLocalizedUrl } from './url-helpers';

export const LLMS_ORIGIN = 'https://themegaradio.com';
export type LlmsLocale = (typeof ACTIVE_SITEMAP_LANGUAGES)[number];

export interface LlmsDiscovery {
  countries: ReadonlyArray<{ region: string; country: string }>;
  genres: readonly string[];
  languages: readonly string[];
  translations: Map<string, string>;
}

export const EMPTY_LLMS_DISCOVERY: LlmsDiscovery = {
  countries: [], genres: [], languages: [], translations: new Map(),
};

export function isLlmsLocale(locale: string): locale is LlmsLocale {
  return ACTIVE_SITEMAP_LANGUAGES.some(active => active === locale);
}

// Keep editorial text on one Markdown line and escape link-label delimiters.
function markdownText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/\\/g, '\\\\').replace(/[\[\]<>*`_]/g, '\\$&').trim();
}

export function renderLlmsTxtBody(
  baseUrl: string,
  locale: LlmsLocale,
  discovery: LlmsDiscovery = EMPTY_LLMS_DISCOVERY,
  blog?: BlogLocaleContent,
): string {
  const text = copy[locale];
  const url = (path: string) => baseUrl + buildLocalizedUrl(path, locale, undefined, discovery.translations);
  const lines = ['# MegaRadio', '', `> ${markdownText(text.summary)}`, ''];
  for (const paragraph of [text.provenance, text.listening, text.metadata, text.appsNote, text.rights, text.developer]) {
    lines.push(markdownText(paragraph), '');
  }
  const section = (title: string) => lines.push(`## ${markdownText(title)}`);
  const link = (label: string, href: string, description?: string) =>
    lines.push(`- [${markdownText(label)}](${href})${description ? ': ' + markdownText(description) : ''}`);

  section(text.sections.browse);
  link(text.labels.home, `${baseUrl}/${locale}`);
  for (const key of ['stations', 'genres', 'regions', 'applications'] as const) link(text.labels[key], url(`/${key}`));
  lines.push('');

  section(text.sections.guides);
  link(text.labels.blog, baseUrl + blogPath(locale as BlogLocale));
  if (blog) {
    const available = new Set(blogIdsForLocale(locale as BlogLocale));
    const core = blog.articles.filter(article => available.has(article.id) && isCoreBlogId(article.id));
    const market = blog.articles.filter(article => available.has(article.id) && !isCoreBlogId(article.id)).slice(0, 4);
    for (const article of [...core, ...market]) {
      const label = locale === 'en' && article.id === 'radio-data-usage' ? 'Radio Data Usage'
        : locale === 'en' && article.id === 'listen-to-radio-online' ? 'Listen to Radio Online' : article.title;
      link(label, baseUrl + blogPath(locale as BlogLocale, article.id), article.description);
    }
  }
  lines.push('');

  section(text.sections.policies);
  for (const [label, path] of [
    ['about', '/about'], ['faq', '/faq'], ['contact', '/contact'],
    ['privacy', '/privacy-policy'], ['terms', '/terms-and-conditions'],
  ] as const) link(text.labels[label], url(path));
  lines.push('');

  section(text.sections.discovery);
  link(text.labels.sitemap, `${baseUrl}/sitemap-index.xml`);
  link(text.labels.robots, `${baseUrl}/robots.txt`);
  lines.push('');

  section(text.sections.languages);
  for (const lang of ACTIVE_SITEMAP_LANGUAGES) {
    const name = SEO_LANGUAGES.find(entry => entry.code === lang)?.name || lang;
    link(`${name} (${lang})`, `${baseUrl}/${lang}/llms.txt`);
  }
  lines.push('');

  if (discovery.languages.includes(locale) && discovery.countries.length) {
    section(text.sections.countries);
    for (const { region, country } of discovery.countries) {
      // Geographic and genre identifiers are not translatable UI segments.
      link(country, `${url('/regions')}/${encodeURIComponent(region)}/${encodeURIComponent(country)}`);
    }
    lines.push('');
  }
  if (discovery.languages.includes(locale) && discovery.genres.length) {
    section(text.sections.genres);
    for (const genre of discovery.genres) link(genre, `${url('/genres')}/${encodeURIComponent(genre)}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildLlmsTxtCoreBody(locale: LlmsLocale): string {
  return renderLlmsTxtBody(LLMS_ORIGIN, locale);
}
