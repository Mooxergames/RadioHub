import { createHash } from 'node:crypto';
import { stripPlaceholders } from '../routes/shared-utils';
import { descriptionLocaleProtected } from '../services/description-repair-policy';
import { REVIEWED_DESCRIPTION_PREIMAGES } from './reviewed-description-preimages';
import { getReviewedDescriptionCopy } from './reviewed-description-copy';

const profiles = new Map<string, typeof REVIEWED_DESCRIPTION_PREIMAGES[number]>(
  REVIEWED_DESCRIPTION_PREIMAGES.map(profile => [profile.identity._id, profile]),
);
const record = (value: unknown): value is Record<string, any> => !!value
  && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

function descriptionPair(value: unknown): { full: string; meta: string } | undefined {
  if (!record(value) || typeof value.full !== 'string' || typeof value.meta !== 'string') return;
  // The API already performs this cleanup; SSR reads the stored representation.
  // Compare the same public text on both paths without modifying either source.
  return { full: stripPlaceholders(value.full), meta: stripPlaceholders(value.meta) };
}

export function inspectReviewedDescriptions(station: unknown): {
  reason: string;
  appliedLanguages: string[];
  skippedLanguages: Array<{ language: string; reason: string }>;
} {
  const result = { reason: 'unreviewed-identity', appliedLanguages: [] as string[],
    skippedLanguages: [] as Array<{ language: string; reason: string }> };
  if (!record(station)) return result;
  const profile = profiles.get(String(station._id ?? ''));
  if (!profile || !Object.entries(profile.identity).every(([key, value]) => (station[key] ?? null) === value)
    || station.noIndex !== false || station.isListVisible !== true || station.redirectToSlug) return result;
  if (!Object.hasOwn(station, 'manualEditFields') || !record(station.manualEditFields)) {
    return { ...result, reason: 'unknown-manual-protection' };
  }
  const manual = station.manualEditFields;
  if ((Object.hasOwn(manual, 'description') && manual.description !== false)
    || descriptionLocaleProtected(manual, 'en')) return { ...result, reason: 'protected-source' };
  if (!record(station.descriptions)) return { ...result, reason: 'malformed-descriptions' };
  const english = descriptionPair(station.descriptions.en);
  if (!english || hash(JSON.stringify(english)) !== profile.englishSourceSha256) {
    return { ...result, reason: 'changed-source' };
  }
  result.reason = 'reviewed-source';
  for (const [language, expected] of Object.entries(profile.locales)) {
    const pair = descriptionPair(station.descriptions[language]);
    if (descriptionLocaleProtected(manual, language)) {
      result.skippedLanguages.push({ language, reason: 'manual-protection' });
    } else if (!pair || hash(pair.full) !== expected.fullSha256 || hash(pair.meta) !== expected.metaSha256) {
      result.skippedLanguages.push({ language, reason: 'changed-description' });
    } else if (getReviewedDescriptionCopy(profile.identity.slug, language)) result.appliedLanguages.push(language);
    else result.skippedLanguages.push({ language, reason: 'unreviewed-language' });
  }
  return result;
}

/** Reversible presentation only: never writes data or changes playback/indexability. */
export function withReviewedDescriptions<T>(station: T): T {
  const review = inspectReviewedDescriptions(station);
  if (!review.appliedLanguages.length || !record(station)) return station;
  const descriptions = { ...station.descriptions };
  for (const language of review.appliedLanguages) {
    descriptions[language] = { ...descriptions[language], ...getReviewedDescriptionCopy(station.slug, language) };
  }
  return { ...station, descriptions };
}
