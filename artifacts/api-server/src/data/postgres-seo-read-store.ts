import type pg from 'pg';
import { PostgresCatalogStore, type CatalogFilter, type CatalogDocument } from './postgres-catalog-store';
import { boundedSeoReadQuery } from './postgres-seo-read-query';
import { publicStationCache, PUBLIC_STATION_CACHE_MAX_TTL } from '../public-station-cache';
import { withSeoReadDeadline } from '../utils/seo-read-deadline';
import { getPublicStationDeadline, limitPublicStationDeadline } from '../utils/public-station-deadline';

const readStore = new PostgresCatalogStore({ query: boundedSeoReadQuery } as unknown as pg.Pool);
type ReadStore = Pick<PostgresCatalogStore, 'find' | 'findOne' | 'findById' | 'findMergedAlias' | 'count' | 'groupCount'>;
type FindOptions = NonNullable<Parameters<ReadStore['find']>[1]> & { sharedCardsKey?: string };
type SharedCards = { cards: CatalogDocument[]; expiresAt: number };

const seoReadStore: Omit<ReadStore, 'find'> & {
  find(filter?: CatalogFilter, options?: FindOptions): Promise<CatalogDocument[]>;
} = {
  async find(filter = {}, options = {}) {
    if (!options.sharedCardsKey) return readStore.find(filter, options);
    const { sharedCardsKey, ...findOptions } = options;
    // A shared producer owns its budget, not the first HTTP caller's abort.
    // Capture it before cache I/O so a late lookup cannot start new SQL.
    const readExpiresAt = Date.now() + 4000;
    const result = await publicStationCache.getOrSetSingleFlight<SharedCards>(
      `ssr-grid:v1:${sharedCardsKey}`,
      () => withSeoReadDeadline({ expiresAt: readExpiresAt }, async () => {
        if (Date.now() >= readExpiresAt) {
          throw Object.assign(new Error('SEO database read budget exceeded'), { code: 'SEO_READ_TIMEOUT' });
        }
        const cards = await readStore.find(filter, findOptions);
        const expiresAt = Math.min(Date.now() + PUBLIC_STATION_CACHE_MAX_TTL * 1000, getPublicStationDeadline());
        limitPublicStationDeadline(expiresAt);
        return { cards, expiresAt };
      }),
      { ttl: PUBLIC_STATION_CACHE_MAX_TTL },
    );
    // A slow cache publication can outlive freshness while followers wait.
    // Carry the original deadline even when the outer cache entry is gone.
    if (!Number.isFinite(result?.expiresAt) || result.expiresAt <= Date.now() || !Array.isArray(result.cards)) {
      throw Object.assign(new Error('Shared SEO station cards expired'), { code: 'SEO_SHARED_CARDS_EXPIRED' });
    }
    limitPublicStationDeadline(result.expiresAt);
    return result.cards;
  },
  findOne: (...args) => readStore.findOne(...args),
  findById: (...args) => readStore.findById(...args),
  findMergedAlias: (...args) => readStore.findMergedAlias(...args),
  count: (...args) => readStore.count(...args),
  groupCount: (...args) => readStore.groupCount(...args),
};

export const pgSeoCatalog = () => seoReadStore;
