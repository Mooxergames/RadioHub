import type pg from 'pg';
import { getPostgresPool } from '../postgres-runtime';
import { AUDIT_LANGUAGES } from '../seo/station-indexability-audit';
import { descriptionRepairIdentity, descriptionLocaleProtected } from '../services/description-repair-policy';

/** Atomic content-only CAS. The first retained original per locale is private;
 * a repeat repair cannot replace it or alter SEO/identity/playback decisions. */
export async function pgSaveScopedDescriptionRepair(input: {
  identity: ReturnType<typeof descriptionRepairIdentity>; language: string;
  expected: unknown; next: Record<string, any>; jobId: string; actor: string;
}, pool: Pick<pg.Pool, 'connect'> = getPostgresPool()): Promise<{ modifiedCount: number }> {
  if (!AUDIT_LANGUAGES.includes(input.language as any) || !input.jobId || !input.actor ||
      input.identity.noIndex !== true || input.identity.redirectToSlug ||
      descriptionLocaleProtected(input.identity.manualEditFields, input.language)) throw new Error('Invalid scoped description repair');
  const client = await pool.connect();
  let discard = false;
  const lost = () => { discard = true; };
  client.on('error', lost);
  try {
    await client.query({ text: 'BEGIN', query_timeout: 4500 } as pg.QueryConfig);
    await client.query({ text: "SET LOCAL lock_timeout='1s'", query_timeout: 4500 } as pg.QueryConfig);
    await client.query({ text: "SET LOCAL statement_timeout='3s'", query_timeout: 4500 } as pg.QueryConfig);
    await client.query({ text: "SET LOCAL idle_in_transaction_session_timeout='5s'", query_timeout: 4500 } as pg.QueryConfig);
    const result = await client.query({ text: `UPDATE stations s SET
    descriptions=jsonb_set(COALESCE(s.descriptions,'{}'::jsonb),ARRAY[$2]::text[],$4::jsonb,true),
    description_repair_journal=COALESCE(s.description_repair_journal,'{}'::jsonb) || CASE
      WHEN COALESCE(s.description_repair_journal,'{}'::jsonb) ? $2 THEN '{}'::jsonb
      ELSE jsonb_build_object($2::text,jsonb_build_object('version',1,'jobId',$5::text,'actor',$6::text,
        'at',transaction_timestamp(),'before',s.descriptions->$2::text,'localeExisted',COALESCE(s.descriptions,'{}'::jsonb) ? $2)) END,
    updated_at=now()
    WHERE s.id=$1 AND COALESCE(s.descriptions->$2::text,'null'::jsonb)=$3::jsonb
      AND (s.descriptions IS NULL OR jsonb_typeof(s.descriptions)='object')
      AND (s.description_repair_journal IS NULL OR jsonb_typeof(s.description_repair_journal)='object')
      AND jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug,'country',s.country,'countryCode',s.country_code,
        'stationuuid',s.station_uuid,'url',s.url,'urlResolved',NULLIF(s.url_resolved,''),
        'slugAliases',COALESCE(s.slug_aliases,'{}'::text[]),'noIndex',s.no_index,
        'redirectToSlug',NULLIF(s.redirect_to_slug,''),'manualEditFields',s.manual_edit_fields)=$7::jsonb
    RETURNING s.id`, values: [input.identity.id, input.language, JSON.stringify(input.expected ?? null),
      JSON.stringify(input.next), input.jobId, input.actor.slice(0, 200), JSON.stringify(input.identity)], query_timeout: 4500 } as pg.QueryConfig);
    await client.query({ text: 'COMMIT', query_timeout: 4500 } as pg.QueryConfig);
    return { modifiedCount: result.rowCount || 0 };
  } catch (error) {
    try { await client.query({ text: 'ROLLBACK', query_timeout: 500 } as pg.QueryConfig); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
    if (!discard) client.removeListener('error', lost);
  }
}
