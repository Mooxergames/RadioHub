import { boundedSeoReadQuery } from './postgres-seo-read-query';
import { completeDescriptionLanguagesSql } from './station-description-sql';
import { SSR_STATION_LINK_LIMIT, type StationLinkMetadata } from '../seo/station-link-locale';
import { getSeoReadDeadline, withSeoReadDeadline } from '../utils/seo-read-deadline';

/** One ID-bounded read per rendered page; never fetch full prose or source JSON. */
export async function readSeoStationLinkMetadata(ids: readonly string[]): Promise<StationLinkMetadata[]> {
  if (ids.length > SSR_STATION_LINK_LIMIT) throw new RangeError('SSR station link metadata exceeds 100 IDs');
  if (ids.length === 0) return [];
  const context = getSeoReadDeadline();
  // Optional enrichment must not consume the remaining critical render budget.
  const expiresAt = Math.min(Date.now() + 500, (context?.expiresAt ?? Infinity) - 250);
  return withSeoReadDeadline({ expiresAt, signal: context?.signal }, async () => (await boundedSeoReadQuery(`SELECT id AS _id,slug,name,url,homepage,tags_raw AS tags,bitrate,
    country,country_code AS "countryCode",language_codes AS "languageCodes",
    no_index AS "noIndex",redirect_to_slug AS "redirectToSlug",
    ${completeDescriptionLanguagesSql('descriptions')} AS "completeDescriptionLanguages"
    FROM stations WHERE id=ANY($1::text[])`, [ids])).rows);
}
