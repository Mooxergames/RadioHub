import { GENRE_STATIONS_PAGE_SIZE } from '@workspace/seo-shared/seo-config';
import { listStationsFromPostgres } from './station-read-store';
import { boundedSeoReadQuery } from './postgres-seo-read-query';
import { pgSeoCatalog } from './postgres-seo-read-store';
import { publicStationCache, PUBLIC_STATION_CACHE_MAX_TTL } from '../public-station-cache';
import { withSeoReadDeadline } from '../utils/seo-read-deadline';
import { getPublicStationDeadline, limitPublicStationDeadline } from '../utils/public-station-deadline';
import { buildRegionStationScope } from '../services/region-location-data';
import { resolveToDbName } from '../utils/normalize-country';

type DirectoryPage = { stations: any[]; total: number; totalPages: number };
type FreshPage = DirectoryPage & { expiresAt: number };

async function readPage(key: string, load: () => Promise<DirectoryPage>): Promise<DirectoryPage> {
  const expiresAt = Date.now() + 4000;
  const result = await publicStationCache.getOrSetSingleFlight<FreshPage>(`ssr-directory:v1:${key}`,
    () => withSeoReadDeadline({ expiresAt }, async () => {
      if (Date.now() >= expiresAt) throw Object.assign(new Error('SEO directory deadline exceeded'), { code: 'SEO_READ_TIMEOUT' });
      const page = await load();
      return { ...page, expiresAt: Math.min(Date.now() + PUBLIC_STATION_CACHE_MAX_TTL * 1000, getPublicStationDeadline()) };
    }), { ttl: PUBLIC_STATION_CACHE_MAX_TTL });
  if (!Number.isFinite(result?.expiresAt) || result.expiresAt <= Date.now()) {
    throw Object.assign(new Error('SEO directory expired'), { code: 'SEO_SHARED_CARDS_EXPIRED' });
  }
  limitPublicStationDeadline(result.expiresAt);
  return result;
}

export function readSeoGenrePage(slug: string, page: number, country?: string): Promise<DirectoryPage> {
  country = country ? resolveToDbName(country) || country : undefined;
  return readPage(JSON.stringify(['genre', slug, country || '', page, GENRE_STATIONS_PAGE_SIZE]), async () => {
    const data = await listStationsFromPostgres({ genre: slug, country, sort: 'votes', page,
      limit: GENRE_STATIONS_PAGE_SIZE, compact: true }, boundedSeoReadQuery);
    return { stations: data.stations, total: data.totalCount, totalPages: data.pagination.pages };
  });
}

/** Retain the old global, bounded quality sample; a short page is not a thin genre. */
export function readSeoGenreQualityPage(slug: string): Promise<DirectoryPage> {
  return readPage(JSON.stringify(['genre-quality', slug, 24]), async () => {
    const data = await listStationsFromPostgres({ genre: slug, minVotes: 1, sort: 'votes',
      page: 1, limit: 24, compact: true, seoQualitySample: true }, boundedSeoReadQuery);
    return { stations: data.stations, total: data.totalCount, totalPages: data.pagination.pages };
  });
}

export function readSeoCityPage(country: string, city: string, page: number): Promise<DirectoryPage> {
  return readPage(JSON.stringify(['city', country, city, page, 60, 'votes']), async () => {
    const scope = buildRegionStationScope(country, city);
    if (!scope) throw new Error('Unknown city scope');
    const catalog = pgSeoCatalog();
    const total = await catalog.count(scope.filter);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid city count');
    const offset = (page - 1) * 60;
    const stations = offset < total ? await catalog.find(scope.filter, {
      fields: ['_id', 'name', 'slug', 'url', 'noIndex', 'isListVisible', 'favicon', 'logoAssets', 'country', 'countryCode', 'tags', 'votes'],
      sort: { votes: -1, _id: 1 }, limit: 60, offset,
    }) : [];
    return { stations, total, totalPages: Math.ceil(total / 60) };
  });
}
