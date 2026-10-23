/** Automatic merging needs matching identity AND a shared actual endpoint. */
export const DUPLICATE_POLICY_FIELDS = ['_id', 'name', 'country', 'countryCode', 'city', 'state', 'url', 'urlResolved', 'manualEditFields'] as const;
type StationIdentity = Record<string, any>;
const normalizedText = (value: unknown): string => typeof value === 'string'
  ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';

function endpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    // Fragments are not sent to the broadcaster. Path case, protocol and the
    // full query string remain significant; host-only/fuzzy matches are unsafe.
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function stationEndpoints(doc: StationIdentity): Set<string> {
  const candidates = [doc.url];
  if (doc.manualEditFields?.url !== true || doc.manualEditFields?.urlResolved === true) candidates.push(doc.urlResolved);
  return new Set(candidates.map(endpoint).filter((url): url is string => url !== null));
}

/** Extract disjoint, independently verified subsets. A bridge record with two
 * URLs must never turn two different broadcasts into a transitive match. */
export function partitionDuplicateGroup<T extends StationIdentity>(docs: readonly T[]): { groups: T[][]; remaining: T[] } {
  if (assessDuplicateMerge(docs).eligible) return { groups: [[...docs]], remaining: [] };
  const buckets = new Map<string, T[]>();
  for (const doc of docs) for (const url of stationEndpoints(doc)) {
    const bucket = buckets.get(url) || [];
    bucket.push(doc); buckets.set(url, bucket);
  }
  const claimed = new Set<T>(), groups: T[][] = [];
  const candidates = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [, bucket] of candidates) {
    const available = bucket.filter(doc => !claimed.has(doc));
    if (!assessDuplicateMerge(available).eligible) continue;
    groups.push(available);
    available.forEach(doc => claimed.add(doc));
  }
  return { groups, remaining: docs.filter(doc => !claimed.has(doc)) };
}

export function assessDuplicateMerge(docs: readonly StationIdentity[]): { eligible: boolean; reason: string } {
  const identity = assessDuplicateGroup(docs);
  if (!identity.eligible) return identity;
  if (docs.some(doc => doc.noIndex === true && doc.manualEditFields?.noIndex === true)) {
    return { eligible: false, reason: 'Manual SEO exclusion requires review' };
  }
  if (docs.some(doc => typeof doc.redirectToSlug === 'string' && doc.redirectToSlug.trim())) {
    return { eligible: false, reason: 'Existing redirect requires review' };
  }
  return identity;
}

/** Do not redirect an open page into an automatically excluded clone just
 * because that clone has more votes. Explicit manual primary choices remain. */
export function compareDuplicateSurvivors(a: StationIdentity, b: StationIdentity): number {
  return Number(a.noIndex === true) - Number(b.noIndex === true)
    || (Number(b.votes) || 0) - (Number(a.votes) || 0) || String(a._id).localeCompare(String(b._id));
}

/** A reviewed redirect keeps both records intact, so conflicting country
 * metadata can be retained. Require the same name AND exact primary endpoint;
 * stale resolved URLs, host-only matches and fuzzy names are not evidence. */
export function assessDuplicateRedirect(source: StationIdentity, target: StationIdentity): { eligible: boolean; reason: string } {
  const name = normalizedText(source.name);
  if (!name || name !== normalizedText(target.name)) {
    return { eligible: false, reason: 'Station names must match exactly' };
  }
  const sourceEndpoint = endpoint(source.url), targetEndpoint = endpoint(target.url);
  if (!sourceEndpoint || sourceEndpoint !== targetEndpoint) {
    return { eligible: false, reason: 'Stations must share the exact primary HTTP stream endpoint' };
  }
  return { eligible: true, reason: 'Matching station name and exact primary HTTP stream endpoint' };
}

export function assessDuplicateGroup(docs: readonly StationIdentity[]): { eligible: boolean; reason: string } {
  const reject = (reason: string) => ({ eligible: false, reason });
  if (docs.length < 2) return reject('At least two current stations are required');
  const names = docs.map(doc => normalizedText(doc.name));
  if (!names[0] || names.some(name => name !== names[0])) return reject('Station names do not match exactly');
  const countries = docs.map(doc => normalizedText(doc.country));
  const countryCodes = docs.map(doc => normalizedText(doc.countryCode));
  const knownCodes = new Set(countryCodes.filter(Boolean));
  if (knownCodes.size > 1) return reject('Country codes conflict');
  if (countries.some(Boolean)) {
    if (!countries[0] || countries.some(country => country !== countries[0])) return reject('Countries do not match exactly');
  } else if (!countryCodes[0] || countryCodes.some(code => code !== countryCodes[0])) {
    return reject('Country identity is missing');
  }
  for (const field of ['city', 'state']) {
    if (new Set(docs.map(doc => normalizedText(doc[field])).filter(Boolean)).size > 1) return reject(`Known ${field} values conflict`);
  }
  let shared: Set<string> | undefined;
  for (const doc of docs) {
    const urls = stationEndpoints(doc);
    shared = shared === undefined ? urls : new Set([...shared].filter(url => urls.has(url)));
    if (!shared.size) return reject('No shared actual HTTP stream endpoint across every station');
  }
  return { eligible: true, reason: 'Exact station identity and shared actual HTTP stream endpoint' };
}
