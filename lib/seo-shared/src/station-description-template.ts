/** Missing-only catalogue summary, not an editorial article or indexing signal.
 * Country, tags and vote counts cannot establish programming, popularity,
 * cultural relevance or stream reliability. Never pad sparse source data.
 */
export interface TemplateStationInfo {
  name: string;
  country?: string;
  countryCode?: string;
  state?: string;
  tags?: string;
  language?: string;
  votes?: number;
  bitrate?: number;
  codec?: string;
  homepage?: string;
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';

export function buildTemplateDescription(station: TemplateStationInfo): { full: string; meta: string } {
  const name = text(station.name);
  if (!name) return { full: '', meta: '' };
  const rawCountry = text(station.country);
  const country = /^(unknown|n\/?a|none|null|undefined|global|worldwide|xx|zz)$/i.test(rawCountry) ? '' : rawCountry;
  const state = text(station.state);
  const location = [state, country].filter((value, index, values) => value
    && values.findIndex(part => part.toLowerCase() === value.toLowerCase()) === index).join(', ');
  const tags = [...new Set(text(station.tags).split(/[,;]/u).map(value => value.trim()).filter(Boolean))];
  const language = text(station.language);
  const codec = text(station.codec);
  const bitrate = typeof station.bitrate === 'number' && Number.isFinite(station.bitrate) && station.bitrate > 0
    ? `${station.bitrate} kbps` : '';
  const format = [bitrate, codec].filter(Boolean).join(' ');
  const sentences = [`${name} is listed as a radio station.`];
  if (location) sentences.push(`Catalogue region: ${location}.`);
  if (tags.length) sentences.push(`Catalogue tags: ${tags.join(', ')}.`);
  if (language) sentences.push(`Reported broadcast language: ${language}.`);
  if (format) sentences.push(`Listed stream format: ${format}.`);
  try {
    const homepage = new URL(text(station.homepage));
    if (['http:', 'https:'].includes(homepage.protocol) && !homepage.username && !homepage.password) {
      sentences.push(`Listed website: ${homepage.href}`);
    }
  } catch { /* Missing or malformed websites are not factual evidence. */ }
  if (sentences.length === 1) return { full: '', meta: '' };
  const meta = `${name}${location ? `, ${location}` : ''}${tags.length ? `: ${tags.slice(0, 3).join(', ')}` : ''}. Radio station information.`;
  return { full: sentences.join(' '), meta: meta.length <= 160 ? meta : meta.slice(0, 157).trimEnd() + '...' };
}

export interface VisibleDescriptionStationInfo extends TemplateStationInfo {
  description?: unknown;
  descriptions?: unknown;
}

/** Visible article only, not metadata or an indexing signal. Each candidate is
 * cleaned before selection: locale full/string -> legacy -> English -> template.
 * Pass getStationCountryName(station, 'en') as templateCountry in every locale:
 * the existing factual fallback stays English, and sparse records may stay empty.
 * Stored prose keeps its internal whitespace and complete tail; callers escape it.
 */
export function selectStationVisibleDescription(
  station: VisibleDescriptionStationInfo | null | undefined,
  language: string,
  templateCountry: string,
): string {
  if (!station) return '';
  const descriptions = station.descriptions && typeof station.descriptions === 'object' && !Array.isArray(station.descriptions)
    ? station.descriptions as Record<string, unknown> : undefined;
  const article = (entry: unknown): string => {
    const value = typeof entry === 'string' ? entry
      : entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as { full?: unknown }).full : undefined;
    // Match SSR's leading marker safeguards; brackets inside prose stay intact.
    return typeof value === 'string'
      ? value.replace(/^(?:\s*\[[^\]]*\]\s*)+/u, '')
        .replace(/\{STATION_NAME\}/g, () => typeof station.name === 'string' ? station.name : '').trim() : '';
  };
  const legacy = typeof station.description === 'string' ? station.description : undefined;
  for (const entry of [descriptions?.[language], legacy, descriptions?.en]) {
    const candidate = article(entry);
    if (candidate) return candidate;
  }
  return buildTemplateDescription({ ...station, country: templateCountry }).full;
}

/** Fill individual gaps without replacing any valid stored prose or metadata. */
export function missingEnglishDescriptionPatch(station: TemplateStationInfo & { descriptions?: any; manualEditFields?: any }): Record<string, string> {
  if (station.manualEditFields?.descriptions === true) return {};
  const english = station.descriptions?.en;
  // Legacy string articles and unknown scalar/array shapes need explicit review.
  if (english != null && (typeof english !== 'object' || Array.isArray(english))) return {};
  const template = buildTemplateDescription(station);
  const patch: Record<string, string> = {};
  for (const field of ['full', 'meta'] as const) {
    if (!text(english?.[field]) && template[field]) patch[`descriptions.en.${field}`] = template[field];
  }
  return patch;
}
