import type pg from 'pg';
import { PostgresCatalogStore } from './postgres-catalog-store';
import { boundedSeoReadQuery } from './postgres-seo-read-query';

const readStore = new PostgresCatalogStore({ query: boundedSeoReadQuery } as unknown as pg.Pool);
export const pgSeoCatalog = ():Pick<PostgresCatalogStore,'find'|'findOne'|'findById'|'findMergedAlias'|'count'|'groupCount'> => readStore;
