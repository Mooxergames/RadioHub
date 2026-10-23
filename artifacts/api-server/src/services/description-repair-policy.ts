export function descriptionRepairIdentity(station: Record<string, any>) {
  return {
    id: station.id ?? station._id, name: station.name ?? null, slug: station.slug ?? null,
    country: station.country ?? null, countryCode: station.countryCode ?? null,
    stationuuid: station.stationuuid ?? null, url: station.url ?? null,
    urlResolved: station.urlResolved || null, slugAliases: station.slugAliases || [],
    noIndex: station.noIndex, redirectToSlug: station.redirectToSlug || null,
    manualEditFields: station.manualEditFields ?? null,
  };
}

export function descriptionLocaleProtected(manual: unknown, language: string): boolean {
  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) return true;
  const flags = manual as Record<string, unknown>;
  return ['descriptions', `descriptions.${language}`, `descriptions.${language}.full`, `descriptions.${language}.meta`]
    .some(key => Object.hasOwn(flags, key) && flags[key] !== false);
}
import { SITEMAP_PRIORITY_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { hasDescriptionText } from './station-description-content';
import { findDescriptionLanguageIssues } from './station-description-validation';


export function inspectSelectedDescriptionRepair(row: {
  id: string; name: string; slug: string | null; reason: string;
  descriptions?: unknown; identity?: ReturnType<typeof descriptionRepairIdentity>;
}, nominatedSource?: 'en') {
  const result = { id: row.id, name: row.name, slug: row.slug, reason: row.reason,
    changes: [] as Array<{ language: string; fields: Array<'full' | 'meta'> }>,
    protectedLanguages: [] as string[], sourceLanguage: undefined as 'en' | undefined, englishSample: '' };
  if (row.reason !== 'eligible-for-content-repair' || !row.identity) return result;
  if (row.descriptions != null && (typeof row.descriptions !== 'object' || Array.isArray(row.descriptions))) {
    return { ...result, reason: 'malformed-descriptions' };
  }
  const descriptions = (row.descriptions || {}) as Record<string, any>;
  result.sourceLanguage = nominatedSource && hasDescriptionText(descriptions.en?.full) ? 'en' : undefined;
  result.englishSample = typeof descriptions.en?.full === 'string' ? descriptions.en.full.slice(0, 400) : '';
  const issues = findDescriptionLanguageIssues(descriptions, SITEMAP_PRIORITY_LANGUAGES.universal14,
    { stationName: row.name, sourceLanguage: result.sourceLanguage });
  for (const language of SITEMAP_PRIORITY_LANGUAGES.universal14) {
    if (descriptionLocaleProtected(row.identity.manualEditFields, language)) { result.protectedLanguages.push(language); continue; }
    const fields = (['full', 'meta'] as const).filter(field => !hasDescriptionText(descriptions[language]?.[field]) ||
      issues.some(issue => issue.language === language && issue.field === field));
    if (fields.length) result.changes.push({ language, fields });
  }
  if (!result.changes.length) result.reason = result.protectedLanguages.length ? 'complete-or-manually-protected' : 'already-complete';
  return result;
}

export function validSelectedDescriptionRepairBody(body: unknown): body is { selectedStationIds: string[]; sourceLanguage?: 'en' } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  return !Object.keys(candidate).some(key => !['selectedStationIds', 'sourceLanguage'].includes(key)) &&
    (candidate.sourceLanguage === undefined || candidate.sourceLanguage === 'en') &&
    Array.isArray(candidate.selectedStationIds) && candidate.selectedStationIds.length >= 1 && candidate.selectedStationIds.length <= 100 &&
    candidate.selectedStationIds.every(id => typeof id === 'string' && Boolean(id) && id.length <= 200) &&
    new Set(candidate.selectedStationIds).size === candidate.selectedStationIds.length;
}
