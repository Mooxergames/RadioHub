import { boundedSeoReadQuery } from './postgres-seo-read-query';
import { SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { SSR_STATION_LINK_LIMIT, type StationLinkMetadata } from '../seo/station-link-locale';
import { getSeoReadDeadline, withSeoReadDeadline } from '../utils/seo-read-deadline';

/** One ID-bounded read per rendered page; never fetch full prose or source JSON. */
export async function readSeoStationLinkMetadata(ids: readonly string[]): Promise<StationLinkMetadata[]> {
  if (ids.length > SSR_STATION_LINK_LIMIT) throw new RangeError('SSR station link metadata exceeds 100 IDs');
  if (ids.length === 0) return [];
  const context = getSeoReadDeadline();
  // Optional enrichment must not consume the remaining critical render budget.
  const expiresAt = Math.min(Date.now() + 500, (context?.expiresAt ?? Infinity) - 250);
  // The native trigger maintains these masks in the description transaction.
  // Missing summaries stay unknown, rather than inventing an empty language set.
  return withSeoReadDeadline({ expiresAt, signal: context?.signal }, async () => (await boundedSeoReadQuery(`SELECT s.id AS _id,s.slug,s.name,s.url,s.homepage,s.tags_raw AS tags,s.bitrate,
    CASE WHEN s.is_list_visible=false THEN s.source->>'stationPageMode' ELSE NULL END AS "stationPageMode",
    s.country,s.country_code AS "countryCode",s.language_codes AS "languageCodes",
    s.no_index AS "noIndex",s.redirect_to_slug AS "redirectToSlug",
    ARRAY(SELECT locale.language FROM unnest($2::text[]) WITH ORDINALITY locale(language,position)
      WHERE (d.full_mask & d.meta_mask & (1 << (locale.position::integer-1)))<>0
      ORDER BY locale.language) AS "completeDescriptionLanguages"
    FROM stations s JOIN station_description_summary d ON d.station_id=s.id
    WHERE s.id=ANY($1::text[])`, [ids, SITEMAP_PRIORITY_LANGUAGES.universal14])).rows);
}
