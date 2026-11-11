import type pg from 'pg';
import { getPostgresPool } from '../postgres-runtime';
import { AZ_INDEX_KEYS, azSlugBounds } from '../seo/az-station-index';
import { stationVisibilitySql } from '../utils/station-visibility';
import { catalogShape, type CatalogDocument } from './postgres-catalog-store';

// Check catalog identities, not index names or deparsed SQL. text_ops is the
// built-in btree family for the text comparisons and ordering below (not
// text_pattern_ops). The second key retains the id column's own collation.
const indexReadySql = `SELECT EXISTS (
  SELECT 1 FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
  JOIN pg_catalog.pg_class ix ON ix.oid=i.indexrelid AND ix.relnamespace=t.relnamespace
  JOIN pg_catalog.pg_am am ON am.oid=ix.relam AND am.amname='btree'
  JOIN pg_catalog.pg_attribute slug ON slug.attrelid=t.oid AND slug.attname='slug' AND NOT slug.attisdropped
  JOIN pg_catalog.pg_attribute id ON id.attrelid=t.oid AND id.attname='id' AND NOT id.attisdropped
  JOIN pg_catalog.pg_collation c ON c.oid=i.indcollation[0]
  JOIN pg_catalog.pg_namespace cn ON cn.oid=c.collnamespace AND cn.nspname='pg_catalog'
  JOIN pg_catalog.pg_opclass op ON op.oid=i.indclass[0] AND op.oid=i.indclass[1]
  JOIN pg_catalog.pg_namespace opn ON opn.oid=op.opcnamespace AND opn.nspname='pg_catalog'
  WHERE t.oid=pg_catalog.to_regclass('stations') AND t.relkind='r' AND ix.relkind='i'
    AND ix.relname='stations_az_slug_c_id_idx'
    AND i.indisvalid AND i.indisready AND i.indislive
    AND i.indpred IS NULL AND i.indexprs IS NULL
    AND i.indnkeyatts=2 AND i.indnatts=2
    AND i.indkey[0]=slug.attnum AND i.indkey[1]=id.attnum
    AND slug.atttypid='pg_catalog.text'::pg_catalog.regtype AND id.atttypid=slug.atttypid
    AND c.collname='C' AND c.collprovider='c' AND c.collisdeterministic
    AND i.indcollation[1]=id.attcollation
    AND i.indoption[0]=0 AND i.indoption[1]=0
    AND op.opcname='text_ops' AND op.opcmethod=am.oid AND op.opcintype=slug.atttypid
) AS ready`;

const whereSql = `s.slug COLLATE "C" >= $1::text AND s.slug COLLATE "C" < $2::text
  AND ${stationVisibilitySql('s')} AND (s.no_index <> true OR s.no_index IS NULL)`;

// Private SSR budget, matching pgSeoCatalog: transaction-local limits cannot
// leak to import/maintenance clients. No process memo survives pool/schema
// changes, and a failed preflight never permits a binary range query.
async function boundedRead<T>(read: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '4000ms'");
    await client.query('LOCK TABLE stations IN ACCESS SHARE MODE');
    const result = await read(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function readAzStationPage(key: string, page: number, pageSize: number): Promise<{ docs: CatalogDocument[]; total: number }> {
  if (!AZ_INDEX_KEYS.includes(key) || !Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 60) {
    throw new RangeError('Invalid A-Z station page (pageSize must be 1..60)');
  }
  const { gte, lt } = azSlugBounds(key);
  return boundedRead(async client => {
    if ((await client.query(indexReadySql)).rows[0]?.ready !== true) {
      throw Object.assign(new Error('A-Z station index is not ready; verify migration 0045 before serving'),
        { code: 'AZ_INDEX_NOT_READY', retryable: true });
    }
    const bounds = [gte, lt];
    const count = await client.query(`SELECT count(*) AS total FROM stations s WHERE ${whereSql}`, bounds);
    const total = Number(count.rows[0]?.total);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid A-Z station count');
    // Only compute OFFSET after count: huge safe-integer pages issue no row
    // query, and even page 1 of an empty bucket needs no range scan for rows.
    if (total === 0 || page > Math.ceil(total / pageSize)) return { docs: [], total };
    const rows = await client.query(`SELECT s.* FROM stations s WHERE ${whereSql}
      ORDER BY s.slug COLLATE "C" ASC NULLS LAST, s.id ASC NULLS LAST LIMIT $3 OFFSET $4`,
    [...bounds, pageSize, (page - 1) * pageSize]);
    return { docs: rows.rows.map(catalogShape), total };
  });
}
