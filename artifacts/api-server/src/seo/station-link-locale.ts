import { getIndexableLanguagesForStation } from './junk-station-rules';
import { buildLocalizedUrl } from './url-helpers';

export const SSR_STATION_LINK_LIMIT = 100;
export interface StationLinkTarget { _id?: unknown; slug?: unknown }
export type StationLinkMetadata = Parameters<typeof getIndexableLanguagesForStation>[0] & {
  _id: string; slug: string; completeDescriptionLanguages: string[];
};
export type StationLinkLanguages = Record<string, { slug: string; language: string }>;

/** Only actual station-directory catalog rows participate in this correction. */
export function collectStationLinkTargets(data: Record<string, any>): StationLinkTarget[] {
  const targets = new Map<string, StationLinkTarget>();
  for (const station of Array.isArray(data.catalogStations) ? data.catalogStations : []) {
    if (typeof station?._id !== 'string' || !station._id || typeof station.slug !== 'string' || !station.slug) continue;
    if (!targets.has(station._id)) targets.set(station._id, station);
    if (targets.size === SSR_STATION_LINK_LIMIT) break;
  }
  return [...targets.values()];
}

/** Metadata must come from the native SQL projection, never card/provider JSON. */
export function resolveStationLinkLanguages(
  targets: readonly StationLinkTarget[], metadata: readonly StationLinkMetadata[], requestedLanguage: string,
  qualifiedLanguages: readonly string[],
): StationLinkLanguages {
  const targetsById = new Map(targets.map(target => [target._id, target]));
  const resolved: StationLinkLanguages = Object.create(null);
  for (const row of metadata) {
    const target = targetsById.get(row._id);
    if (!target || !row.slug || target.slug !== row.slug || !Array.isArray(row.completeDescriptionLanguages)
      || !row.completeDescriptionLanguages.every(language => typeof language === 'string')) continue;
    const eligible = getIndexableLanguagesForStation(row, qualifiedLanguages, row.completeDescriptionLanguages);
    const language = eligible.includes(requestedLanguage) ? requestedLanguage : eligible.includes('en') ? 'en' : undefined;
    // Missing metadata or an excluded target is not evidence for an English URL.
    if (language) resolved[row._id] = { slug: row.slug, language };
  }
  return resolved;
}

export function buildStationLinkUrl(
  station: StationLinkTarget, requestedLanguage: string, languages?: StationLinkLanguages,
  urlTranslations?: Map<string, string>,
): string {
  const id = typeof station._id === 'string' ? station._id : '';
  const decision = languages && Object.hasOwn(languages, id) ? languages[id] : undefined;
  const language = decision && decision.slug === station.slug && /^[a-z]{2}$/.test(decision.language)
    ? decision.language : requestedLanguage;
  return buildLocalizedUrl(`/station/${station.slug || station._id}`, language, undefined, urlTranslations);
}
