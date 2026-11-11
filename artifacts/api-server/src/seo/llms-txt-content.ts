import { ACTIVE_SITEMAP_LANGUAGES, SEO_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { blogIdsForLocale, blogPath, isCoreBlogId, type BlogLocale } from '@workspace/seo-shared/blog-manifest';
import type { BlogLocaleContent } from '@workspace/seo-shared/blog';
import copy from './llms-locales.json';
import stationSelections from './llms-station-selections.json';
import { buildLocalizedUrl } from './url-helpers';
import { AZ_KEY_RE } from './az-station-index';

export const LLMS_ORIGIN = 'https://themegaradio.com';
export type LlmsLocale = (typeof ACTIVE_SITEMAP_LANGUAGES)[number];

export interface LlmsDiscovery {
  countries: ReadonlyArray<{ region: string; country: string }>;
  genres: Partial<Record<LlmsLocale, readonly string[]>>;
  languages: readonly string[];
  translations: Map<string, string>;
}

export const EMPTY_LLMS_DISCOVERY: LlmsDiscovery = {
  countries: [], genres: {}, languages: [], translations: new Map(),
};

export function isLlmsLocale(locale: string): locale is LlmsLocale {
  return ACTIVE_SITEMAP_LANGUAGES.some(active => active === locale);
}

// Keep editorial text on one Markdown line and escape link-label delimiters.
function markdownText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
    .replace(/\\/g, '\\\\').replace(/[\[\]<>*`_]/g, '\\$&').trim();
}

export interface LlmsSelectedStation {
  name: string;
  path: string;
  country?: string;
  countryCode?: string;
  tags?: readonly string[];
}

/** A dated editorial snapshot, not a live health or listener-ranking feed. */
export function readLlmsStationSelection(locale: LlmsLocale, input: unknown = stationSelections): {
  verifiedOn: string; stations: readonly LlmsSelectedStation[];
} | null {
  if (!isLlmsLocale(locale) || !input || typeof input !== 'object' || Array.isArray(input)) return null;
  const snapshot = input as Record<string, unknown>;
  if (Object.keys(snapshot).some(key => !['verifiedOn', 'selectionBasis', 'selections'].includes(key))
    || snapshot.selectionBasis !== 'directory-votes-editorial-v1' || typeof snapshot.verifiedOn !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.verifiedOn)) return null;
  const date = new Date(`${snapshot.verifiedOn}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== snapshot.verifiedOn) return null;
  if (!snapshot.selections || typeof snapshot.selections !== 'object' || Array.isArray(snapshot.selections)) return null;
  const selections = snapshot.selections as Record<string, unknown>;
  if (Object.keys(selections).some(key => !isLlmsLocale(key)) || !Object.hasOwn(selections, locale)) return null;
  const entries = selections[locale];
  if (!Array.isArray(entries) || entries.length !== 40) return null;
  const prefix = buildLocalizedUrl('/station', locale, undefined, new Map()) + '/';
  const paths = new Set<string>();
  const output: LlmsSelectedStation[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some(key => !['name', 'path', 'country', 'countryCode', 'tags'].includes(key))) return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 240
      || typeof row.path !== 'string' || row.path.length > 2048 || !row.path.startsWith(prefix)
      || /[\\?#\s\u0000-\u001f\u007f-\u009f<>"'`()\[\]]/u.test(row.path)) return null;
    try {
      const url = new URL(row.path, LLMS_ORIGIN);
      const slug = decodeURIComponent(row.path.slice(prefix.length));
      if (url.href !== LLMS_ORIGIN + row.path || url.origin !== LLMS_ORIGIN || url.search || url.hash
        || !slug || slug !== slug.trim() || /[\\/?#%\s\u0000-\u001f\u007f-\u009f]/u.test(slug)
        || ['.', '..'].includes(slug) || AZ_KEY_RE.test(slug.toLowerCase()) || /^-?\d+$/.test(slug)
        || paths.has(url.href)) return null;
      paths.add(url.href);
    } catch { return null; }
    if (row.country !== undefined && (typeof row.country !== 'string' || row.country.length > 120)) return null;
    if (row.countryCode !== undefined && (typeof row.countryCode !== 'string' || !/^[A-Z]{2}$/.test(row.countryCode))) return null;
    if (row.tags !== undefined && (!Array.isArray(row.tags) || row.tags.length > 3
      || row.tags.some(tag => typeof tag !== 'string' || tag.length > 64))) return null;
    output.push({ name: row.name, path: row.path, ...(row.country !== undefined ? { country: row.country as string } : {}),
      ...(row.countryCode !== undefined ? { countryCode: row.countryCode as string } : {}),
      ...(row.tags !== undefined ? { tags: row.tags as string[] } : {}) });
  }
  return { verifiedOn: snapshot.verifiedOn, stations: output };
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

  const selection = readLlmsStationSelection(locale);
  if (selection) {
    section(text.sections.stations);
    lines.push(markdownText(text.stationSelectionNote), '', `${markdownText(text.stationSelectionCheckedOn)}: ${selection.verifiedOn}`, '');
    for (const station of selection.stations) {
      const metadata = [station.country, station.tags?.filter(Boolean).join(', ')].filter(Boolean).join(' | ');
      // Preserve the publication-verified path even while optional route
      // translations are cold, unavailable, or changed after the snapshot.
      link(station.name, baseUrl + station.path, metadata);
    }
    lines.push('');
  }

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
  const genres = discovery.genres[locale] || [];
  if (discovery.languages.includes(locale) && genres.length) {
    section(text.sections.genres);
    for (const genre of genres) link(genre, `${url('/genres')}/${encodeURIComponent(genre)}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildLlmsTxtCoreBody(locale: LlmsLocale): string {
  return renderLlmsTxtBody(LLMS_ORIGIN, locale);
}
