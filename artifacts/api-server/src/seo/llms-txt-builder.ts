import { pgTopIndexableTags } from '../data/postgres-seo-indexing-store';
import { ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { loadBlogContent, type BlogLocaleContent } from '@workspace/seo-shared/blog';
import type { BlogLocale } from '@workspace/seo-shared/blog-manifest';
import { getActiveManifest, extractTopCountriesFromChunk } from './sitemap-manifest-builder';
import { getCachedQualifiedLanguages } from './qualified-languages';
import { GENRE_WHITELIST_SEED } from './genre-whitelist-seed';
import { performanceCache } from '../performance-cache';
import { logger } from '../utils/logger';
import { SAFE_REGION_SLUG_RE, VALID_CONTINENT_SLUGS } from './url-helpers';
import { EMPTY_LLMS_DISCOVERY, isLlmsLocale, renderLlmsTxtBody, type LlmsDiscovery, type LlmsLocale } from './llms-txt-content';

const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const BODY_CACHE_CAP = 64;
const bodies = new Map<string, string>();
const blogs = new Map<LlmsLocale, Promise<BlogLocaleContent>>();
let snapshot: LlmsDiscovery | null = null;
let expiresAt = 0;
let refresh: Promise<void> | null = null;
let generation = 0;

async function fetchTopGenres(): Promise<string[]> {
  const rows = await pgTopIndexableTags(100);
  return [...new Set(rows.map(row => String(row._id || '').replace(/\s+/g, '-'))
    .filter(slug => GENRE_WHITELIST_SEED.has(slug)))].slice(0, 20);
}

async function fetchTopCountries(): Promise<LlmsDiscovery['countries']> {
  const main = await getActiveManifest('main', 'en');
  if (!main?.chunks?.length) return [];
  const seen = new Set<string>();
  return extractTopCountriesFromChunk(main.chunks[0].stationIds || [])
    .filter(entry => {
      const key = `${entry.regionSlug}/${entry.countrySlug}`;
      if (!VALID_CONTINENT_SLUGS.has(entry.regionSlug) || !SAFE_REGION_SLUG_RE.test(entry.countrySlug) || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 30).map(entry => ({ region: entry.regionSlug, country: entry.countrySlug }));
}

// Share optional discovery work across every origin and language. Requests
// only await local editorial modules, never these PostgreSQL aggregations.
function readDiscovery(): LlmsDiscovery {
  if (Date.now() >= expiresAt && !refresh) {
    const currentGeneration = generation;
    const pending = Promise.allSettled([
      fetchTopCountries(), fetchTopGenres(), getCachedQualifiedLanguages(), performanceCache.getUrlTranslations(),
    ]).then(([countries, genres, languages, translations]) => {
      if (generation !== currentGeneration) return;
      const failed = [countries, genres, languages, translations].some(result => result.status === 'rejected');
      if (failed) logger.warn('llms-txt: discovery refresh unavailable; retaining verified links or the native core guide');
      if (!failed || !snapshot) {
        snapshot = {
          countries: countries.status === 'fulfilled' ? countries.value : [],
          genres: genres.status === 'fulfilled' ? genres.value : [],
          languages: languages.status === 'fulfilled' && Array.isArray(languages.value)
            ? ACTIVE_SITEMAP_LANGUAGES.filter(lang => languages.value.includes(lang)) : [],
          translations: translations.status === 'fulfilled' ? new Map(translations.value) : new Map(),
        };
        bodies.clear();
      }
      expiresAt = Date.now() + (failed ? RETRY_MS : TTL_MS);
    }).catch(() => {
      if (generation !== currentGeneration) return;
      expiresAt = Date.now() + RETRY_MS;
      logger.warn('llms-txt: discovery refresh failed; native guide remains available');
    }).finally(() => { if (refresh === pending) refresh = null; });
    refresh = pending;
  }
  return snapshot || EMPTY_LLMS_DISCOVERY;
}

function loadGuides(locale: LlmsLocale): Promise<BlogLocaleContent> {
  const cached = blogs.get(locale);
  if (cached) return cached;
  const pending = loadBlogContent(locale as BlogLocale).catch(error => {
    if (blogs.get(locale) === pending) blogs.delete(locale);
    throw error;
  });
  blogs.set(locale, pending);
  return pending;
}

export async function buildLlmsTxtBody(baseUrl: string, locale: LlmsLocale = 'en', root = locale === 'en'): Promise<string> {
  if (!isLlmsLocale(locale) || (root && locale !== 'en')) throw new Error('Unsupported LLM guide locale');
  const parsed = new URL(baseUrl);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid LLM guide origin');
  const cleanBase = parsed.origin;
  const discovery = readDiscovery();
  const key = `${cleanBase}:${root ? 'root' : locale}`;
  const cached = bodies.get(key);
  if (cached) {
    bodies.delete(key); bodies.set(key, cached);
    return cached;
  }
  const currentGeneration = generation;
  let blog: BlogLocaleContent | undefined;
  try { blog = await loadGuides(locale); }
  catch { logger.warn('llms-txt: local editorial module unavailable; serving the native core guide'); }
  const body = renderLlmsTxtBody(cleanBase, locale, discovery, blog);
  // A refresh/reset during the local module import must not republish an old
  // snapshot into the newly cleared cache. Failed imports remain retryable.
  if (blog && generation === currentGeneration && discovery === (snapshot || EMPTY_LLMS_DISCOVERY)) {
    bodies.set(key, body);
    if (bodies.size > BODY_CACHE_CAP) bodies.delete(bodies.keys().next().value!);
  }
  return body;
}

export function clearLlmsTxtCache(): void {
  bodies.clear(); blogs.clear(); snapshot = null; expiresAt = 0; refresh = null; generation++;
}
