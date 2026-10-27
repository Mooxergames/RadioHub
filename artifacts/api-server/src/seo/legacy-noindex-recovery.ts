import { evaluateJunkStation, frequencyClusterKey, frequencyPrefixBaseSlug, isNumericOnlySlug, slugifyStationName } from './junk-station-rules';
import { AUDIT_LANGUAGES, auditCsvCell } from './station-indexability-audit';
import { assessDuplicateGroup, assessDuplicateRedirect } from '../utils/station-duplicate-policy';

export const RECOVERY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const RECOVERY_CANDIDATE_LIMIT = 100;
export interface RecoveryIdentity {
  id: string; name: string; slug: string | null; country: string | null; countryCode: string | null;
  url: string; urlResolved: string | null;
  stationuuid?: string;
  homepage?: string | null;
  slugAliases?: string[];
  city?: string | null; state?: string | null;
  noIndex?: boolean; redirectToSlug?: string | null; manualEditFields?: unknown;
  englishContentComplete?: boolean;
}
export interface RecoveryStation extends RecoveryIdentity {
  stationuuid: string; noIndex: boolean; redirectToSlug: string | null;
  manualEditFields: unknown; automaticNoIndex: unknown;
  lastCheckOk: boolean | null; lastCheckTime: Date | string | null; lastCheckOkTime: unknown;
  completeLanguageCount: number; englishContentComplete?: boolean;
  rowVersion: string; sourceIsObject: boolean; journalIsObject: boolean;
}
export interface RecoveryCandidate {
  id: string; slug: string; name: string; country: string; countryCode: string;
  redirectToSlug?: string;
  lastCheckOkTime: string | null; completeLanguageCount: number;
  evidence: { provenance: 'legacy-unknown' | 'owned-duplicate' | 'owned-retired-name-heuristic'; providerUuidPresent: true;
    providerLastCheckOk: boolean | null; recentProviderSuccess: boolean; identityPeers: number;
    recoveryBasis: 'complete-unique-information-page' | 'canonical-of-excluded-duplicates' | 'verified-duplicate-redirect';
    excludedDuplicateIds?: string[] };
}

/** Deliberately broader than the automatic-merge identity test: punctuation,
 * whitespace and accents are insufficient to rule out a plausible sibling. */
const normalized = (value: unknown): string => typeof value === 'string'
  ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '';
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
export function recoveryEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192 || !/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function pageBrand(name: string): { brand: string; frequencies: string[] } {
  const frequencies: string[] = [];
  const words = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[\s([\-]+(?:\d{2,3}\s*(?:kbps|kbit(?:s)?|kb|k)?\s*)?(?:mp3|aacp|aac\+?|flac|ogg|opus|dab\+?)(?:\s*\d{2,3}\s*(?:kbps|kbit(?:s)?|kb|k)?)?[\s)\]]*$/, ' ')
    .replace(/\b(\d{2,4}(?:[.,]\d{1,2})?)\s*(fm|am|mhz|khz)\b/g, (_match, number: string, band: string) => {
      frequencies.push(`${number.replace(',', '.')}:${band}`); return ' ';
    }).replace(/\bradio\b/g, '');
  return { brand: words.replace(/[^\p{L}\p{N}]/gu, ''), frequencies };
}

function informationHomepage(value: unknown): string | null {
  const endpoint = recoveryEndpoint(value);
  if (!endpoint) return null;
  const url = new URL(endpoint);
  const host = url.hostname.replace(/^www\./, '');
  if (['facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tunein.com', 'radio.garden', 'radio-browser.info']
    .some(domain => host === domain || host.endsWith(`.${domain}`))) return null;
  return `${host}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/$/, '')}${url.search}`;
}

/** Homepage equality is information-page identity, not audio equality. Never
 * reuse this as a station merge or stream replacement rule. */
function sameHomepageInformationGroup(rows: RecoveryIdentity[]): boolean {
  if (rows.length < 2) return false;
  const homepage = informationHomepage(rows[0].homepage);
  const country = normalized(rows[0].countryCode);
  const brands = rows.map(row => pageBrand(row.name));
  return Boolean(homepage && /^[a-z]{2}$/.test(country) && brands[0].brand.length >= 4 &&
    rows.every((row, i) => informationHomepage(row.homepage) === homepage && normalized(row.countryCode) === country &&
      brands[i].brand === brands[0].brand) && new Set(brands.flatMap(row => row.frequencies)).size <= 1 &&
    ['city', 'state'].every(field => new Set(rows.map(row => normalized(row[field as 'city' | 'state'])).filter(Boolean)).size <= 1));
}

function mexicanPrimaryInformationGroup(rows: RecoveryIdentity[], sameBrand: boolean): boolean {
  if (rows.length < 2 || rows.some(row => row.countryCode?.toUpperCase() !== 'MX' ||
    recoveryEndpoint(row.url) !== recoveryEndpoint(rows[0].url))) return false;
  const names = rows.map(row => row.name.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase());
  const calls = names.map(name => [...new Set(name.match(/\bX[EH][A-Z]{1,6}-(?:FM|AM)\b/g) || [])]);
  if (calls.some(ids => ids.length !== 1 || ids[0] !== calls[0][0]) ||
    new Set(rows.flatMap(row => pageBrand(row.name).frequencies)).size > 1) return false;
  const channels = names.map(name => [...new Set(name.match(/\bHD\s*-?\s*[1-4]\b/g) || [])].map(normalized).sort().join('|'));
  if (new Set(channels).size > 1) return false;
  if (!sameBrand) return true;
  // A closed group cannot choose a current brand from a licence alone.
  // Ignore duplicated frequency/city decorations, not actual brand words.
  const brands = names.map(name => normalized(name.split(/\s+-\s+/)[0]
    .replace(/\([^)]*\)/g, '').replace(/\b\d{2,4}(?:[.,]\d{1,2})?\b/g, '').replace(/\b(?:RADIO|FM|AM)\b/g, '')));
  return brands[0].length >= 4 && brands.every(brand => brand === brands[0]);
}

/** Page consolidation only, never station merging. A generic Radio prefix or
 * an optional frequency may vary, but actual primary URLs, location and any
 * two known frequencies must agree. Different brands remain blocked. */
function assessPageCopyGroup(rows: RecoveryIdentity[]): boolean {
  if (rows.length < 2 || rows.some(row => recoveryEndpoint(row.url) !== recoveryEndpoint(rows[0].url))) return false;
  if (assessDuplicateGroup(rows).eligible) return true;
  const brands = rows.map(row => pageBrand(row.name));
  if (brands[0].brand.length < 4 || brands.some(row => row.brand !== brands[0].brand) ||
      new Set(brands.flatMap(row => row.frequencies)).size > 1) return false;
  return assessDuplicateGroup(rows.map(row => ({ ...row, name: brands[0].brand }))).eligible;
}

export function createRecoveryIdentityIndex() {
  const identities = new Map<string, RecoveryIdentity>();
  type Peer = { id: string; country: string; code: string };
  const names = new Map<string, Array<{ id: string; country: string; code: string }>>();
  const endpoints = new Map<string, Set<string>>();
  const informationPages = new Map<string, Set<string>>();
  const slugs = new Map<string, Set<string>>();
  const nativeSlugs = new Map<string, Set<string>>();
  const incomingRedirects = new Set<string>();
  const slugFamilies = new Map<string, Peer[]>();
  const uuids = new Map<string, Set<string>>();
  const familyKeys = (slug: string | null) => {
    const keys = new Set<string>();
    if (!slug) return keys;
    const canonical = frequencyClusterKey(slug);
    if (!canonical) return keys;
    keys.add(slug.trim().toLowerCase());
    keys.add(canonical);
    const base = frequencyPrefixBaseSlug(canonical);
    if (base) keys.add(base);
    for (const key of [...keys]) {
      // Recovery only: numbers and formats may be legitimate identities, but
      // these historical sibling shapes still require manual review.
      keys.add(key.replace(/-(?:mp3|aac|aacp|flac|ogg|opus|dab|128|192|256|320)(?:-\d+)?$/, ''));
      keys.add(key.replace(/-\d+$/, ''));
    }
    // A separator difference or stacked delivery suffix must not make a
    // format variant look unique after retiring the old name heuristic.
    for (const key of [...keys]) {
      let base = key;
      for (let n = 0; n < 4; n++) {
        const next = base.replace(/-(?:mp3|aac|aacp|flac|ogg|opus|dab|plus|kbps|kbs|kb|kbit|kbits|\d{2,3}(?:k(?:b(?:p?s)?)?)?|[1-9]|10)$/, '');
        if (next === base) break;
        keys.add(next); base = next;
      }
    }
    return new Set([...keys].map(normalized).filter(Boolean));
  };
  const plausibleCountry = (peer: Peer, country: string, code: string) =>
    !peer.country || !peer.code || peer.country === country || peer.code === code;
  const peerIds = (station: RecoveryIdentity & { automaticNoIndex?: unknown }, limit = 11) => {
    const ids = new Set<string>();
    const add = (id: string) => { if (id !== station.id) ids.add(id); return ids.size >= limit; };
    const country = normalized(station.country), code = normalized(station.countryCode);
    const pageKey = informationKey(station);
    if (pageKey) for (const id of informationPages.get(pageKey) || []) if (add(id)) return ids;
    for (const peer of names.get(normalized(station.name)) || []) {
      if (plausibleCountry(peer, country, code) && add(peer.id)) return ids;
    }
    for (const id of uuids.get(station.stationuuid?.toLowerCase() || '') || []) if (add(id)) return ids;
    for (const key of familyKeys(station.slug)) {
      for (const peer of slugFamilies.get(key) || []) if (plausibleCountry(peer, country, code) && add(peer.id)) return ids;
    }
    for (const value of [station.url, station.urlResolved]) {
      const endpoint = recoveryEndpoint(value);
      if (endpoint) for (const id of endpoints.get(endpoint) || []) if (add(id)) return ids;
    }
    const provenance = station.automaticNoIndex as { reason?: string } | null;
    const target = typeof provenance?.reason === 'string' && provenance.reason.startsWith('duplicate-of:')
      ? provenance.reason.slice('duplicate-of:'.length) : null;
    for (const slug of [station.slug, ...(station.slugAliases || []), target]) {
      if (slug) for (const id of slugs.get(slug) || []) if (add(id)) return ids;
    }
    return ids;
  };
  const identityPeerSets = (station: RecoveryIdentity & { automaticNoIndex?: unknown }) => {
    const sets = [uuids.get(station.stationuuid?.toLowerCase() || '')];
    for (const value of [station.url, station.urlResolved]) {
      const endpoint = recoveryEndpoint(value);
      if (endpoint) sets.push(endpoints.get(endpoint));
    }
    for (const slug of [station.slug, ...(station.slugAliases || [])]) {
      if (!slug) continue;
      const owners = nativeSlugs.get(slug);
      // The public reader and SSR resolve native slugs before legacy aliases.
      // An alias shadowed by another native page cannot own that URL or turn
      // two independently addressed broadcasts into duplicate identities.
      if (!owners) sets.push(slugs.get(slug));
      else if (slug === station.slug) sets.push(owners);
    }
    const reason = (station.automaticNoIndex as { reason?: unknown } | null)?.reason;
    if (typeof reason === 'string' && reason.startsWith('duplicate-of:')) {
      const target = reason.slice('duplicate-of:'.length);
      sets.push(nativeSlugs.get(target) || slugs.get(target));
    }
    return sets;
  };
  let total = 0;
  const informationKey = (station: RecoveryIdentity) => {
    const homepage = informationHomepage(station.homepage), brand = pageBrand(station.name).brand;
    const country = normalized(station.countryCode);
    return homepage && brand.length >= 4 && /^[a-z]{2}$/.test(country) ? JSON.stringify([homepage, brand, country]) : null;
  };
  const canonicalOrder = (a: RecoveryIdentity, b: RecoveryIdentity) =>
    Number(b.slug === slugifyStationName(b.name)) - Number(a.slug === slugifyStationName(a.name)) ||
    Number(pageBrand(a.name).frequencies.length > 0) - Number(pageBrand(b.name).frequencies.length > 0) ||
    a.slug!.length - b.slug!.length || a.id.localeCompare(b.id);
  return {
    get total() { return total; },
    add(station: RecoveryIdentity) {
      total++;
      identities.set(station.id, station);
      if (station.slug) {
        const owners = nativeSlugs.get(station.slug) || new Set<string>();
        owners.add(station.id); nativeSlugs.set(station.slug, owners);
      }
      if (station.redirectToSlug) incomingRedirects.add(station.redirectToSlug);
      const peer = { id: station.id, country: normalized(station.country), code: normalized(station.countryCode) };
      const name = normalized(station.name);
      if (name) {
        const peers = names.get(name) || [];
        peers.push(peer);
        names.set(name, peers);
      }
      for (const value of [station.url, station.urlResolved]) {
        const endpoint = recoveryEndpoint(value);
        if (endpoint) { const ids = endpoints.get(endpoint) || new Set<string>(); ids.add(station.id); endpoints.set(endpoint, ids); }
      }
      const pageKey = informationKey(station);
      if (pageKey) {
        const ids = informationPages.get(pageKey) || new Set<string>(); ids.add(station.id); informationPages.set(pageKey, ids);
      }
      for (const slug of [station.slug, ...(station.slugAliases || [])]) {
        if (!slug) continue;
        const ids = slugs.get(slug) || new Set<string>(); ids.add(station.id); slugs.set(slug, ids);
      }
      for (const key of familyKeys(station.slug)) {
        const peers = slugFamilies.get(key) || []; peers.push(peer); slugFamilies.set(key, peers);
      }
      if (station.stationuuid) {
        const key = station.stationuuid.toLowerCase();
        const ids = uuids.get(key) || new Set<string>(); ids.add(station.id); uuids.set(key, ids);
      }
    },
    hasPeer(station: RecoveryStation): boolean {
      return peerIds(station, 1).size > 0;
    },
    hasIdentityConflict(station: RecoveryStation): boolean {
      // Similar names, frequency prefixes and format suffixes are discovery
      // hints, not evidence that two independently addressed pages are copies.
      for (const ids of identityPeerSets(station)) if (ids) for (const id of ids) if (id !== station.id) return true;
      const key = informationKey(station);
      if (key) for (const id of informationPages.get(key) || []) {
        if (id !== station.id && sameHomepageInformationGroup([station, identities.get(id)!])) return true;
      }
      return false;
    },
    duplicateRedirectTarget(station: RecoveryStation): RecoveryIdentity | null {
      if (!station.slug || incomingRedirects.has(station.slug) || nativeSlugs.get(station.slug)?.size !== 1) return null;
      const endpoint = recoveryEndpoint(station.url);
      if (!endpoint) return null;
      // Endpoint candidates precede fuzzy name hints and are not truncated.
      const pageKey = informationKey(station);
      const possibleIds = new Set([...(endpoints.get(endpoint) || []), ...(pageKey ? informationPages.get(pageKey) || [] : [])]);
      const matches = [...possibleIds].map(id => identities.get(id)!).filter(peer =>
        peer.id !== station.id && peer.noIndex === false && !peer.redirectToSlug && peer.englishContentComplete === true &&
        /^[a-z0-9][a-z0-9-]{0,199}$/.test(peer.slug || '') && nativeSlugs.get(peer.slug!)?.size === 1 &&
        !isNumericOnlySlug(peer.slug) && !evaluateJunkStation({ name: peer.name, slug: peer.slug || undefined, url: peer.url }).isJunk &&
        (assessDuplicateRedirect(station, peer).eligible || assessPageCopyGroup([station, peer]) || sameHomepageInformationGroup([station, peer]) ||
          mexicanPrimaryInformationGroup([station, peer], false)));
      const base = matches.filter(peer => peer.slug === slugifyStationName(station.name));
      if (base.length === 1) return base[0];
      if (matches.length === 1) return matches[0];
      // All alternatives must themselves be equivalent; a bridge record may
      // not authorize choosing between different broadcasts or frequencies.
      return matches.length > 1 && (assessPageCopyGroup([station, ...matches]) || sameHomepageInformationGroup([station, ...matches]) ||
        mexicanPrimaryInformationGroup([station, ...matches], false))
        ? matches.sort(canonicalOrder)[0] : null;
    },
    reviewPeers(station: RecoveryStation): RecoveryIdentity[] {
      return [...peerIds(station)].sort().map(id => identities.get(id)!);
    },
    closedPrimaryCanonicalPeers(station: RecoveryStation): RecoveryIdentity[] | null {
      const endpoint = recoveryEndpoint(station.url);
      const ids = endpoint ? endpoints.get(endpoint) : undefined;
      if (!ids || ids.size < 2 || ids.size > 50) return null;
      const rows = [...ids].sort().map(id => identities.get(id)!);
      for (const row of rows) {
        const manual = row.manualEditFields;
        if (row.noIndex !== true || row.redirectToSlug || recoveryEndpoint(row.url) !== endpoint ||
            !manual || typeof manual !== 'object' || Array.isArray(manual) ||
            ['noIndex', 'slug', 'redirectToSlug', 'name', 'country', 'countryCode', 'city', 'state', 'url', 'urlResolved']
              .some(key => Object.hasOwn(manual, key)) ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.stationuuid || '')) return null;
      }
      const ready = rows.filter(row => row.englishContentComplete === true && row.name.length <= 160 &&
        /^[a-z0-9][a-z0-9-]{0,179}$/.test(row.slug || '') && !isNumericOnlySlug(row.slug) &&
        !evaluateJunkStation({ name: row.name, slug: row.slug || undefined, url: row.url }).isJunk);
      // Ranking is independent of the reviewed row, including name variants:
      // there must never be two independently selected winners in one group.
      ready.sort(canonicalOrder);
      if (ready[0]?.id !== station.id || !(assessPageCopyGroup(rows) || mexicanPrimaryInformationGroup(rows, true))) return null;
      // Every strong identity edge must stay inside the exact-primary group.
      for (const row of rows) for (const peers of identityPeerSets(row.id === station.id ? station : row)) {
        if (peers) for (const id of peers) if (!ids.has(id)) return null;
      }
      return rows.filter(row => row.id !== station.id);
    },
    closedInformationCanonicalPeers(station: RecoveryStation): RecoveryIdentity[] | null {
      const key = informationKey(station), ids = key ? informationPages.get(key) : undefined;
      if (!ids || ids.size < 2 || ids.size > 50) return null;
      const rows = [...ids].sort().map(id => identities.get(id)!);
      if (!sameHomepageInformationGroup(rows)) return null;
      for (const row of rows) {
        const manual = row.manualEditFields;
        if (row.noIndex !== true || row.redirectToSlug || !manual || typeof manual !== 'object' || Array.isArray(manual) ||
          ['noIndex', 'slug', 'redirectToSlug', 'name', 'country', 'countryCode', 'city', 'state', 'url', 'urlResolved']
            .some(field => Object.hasOwn(manual, field)) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.stationuuid || '') ||
          !recoveryEndpoint(row.url)) return null;
        for (const peers of identityPeerSets(row.id === station.id ? station : row)) {
          if (peers) for (const id of peers) if (!ids.has(id)) return null;
        }
      }
      const ready = rows.filter(row => row.englishContentComplete === true && row.name.length <= 160 &&
        /^[a-z0-9][a-z0-9-]{0,179}$/.test(row.slug || '') && nativeSlugs.get(row.slug!)?.size === 1 &&
        !isNumericOnlySlug(row.slug) && !evaluateJunkStation({ name: row.name, slug: row.slug || undefined, url: row.url }).isJunk);
      ready.sort(canonicalOrder);
      return ready[0]?.id === station.id ? rows.filter(row => row.id !== station.id) : null;
    },
    cityEvidenceIds(onlyIds?: ReadonlySet<string>): string[] {
      const ids = new Set<string>();
      for (const identity of identities.values()) {
        if (identity.noIndex !== true || onlyIds && !onlyIds.has(identity.id)) continue;
        const endpoint = recoveryEndpoint(identity.url), key = informationKey(identity);
        const possibleIds = new Set([...(endpoint ? endpoints.get(endpoint) || [] : []), ...(key ? informationPages.get(key) || [] : [])]);
        for (const id of possibleIds) {
          const peer = identities.get(id)!;
          if (id !== identity.id && !assessDuplicateRedirect(identity, peer).eligible &&
            (assessPageCopyGroup([identity, peer]) || sameHomepageInformationGroup([identity, peer]))) {
            ids.add(identity.id); ids.add(id);
          }
        }
        const peers = this.excludedCanonicalPeers(identity as RecoveryStation) || this.closedPrimaryCanonicalPeers(identity as RecoveryStation) ||
          this.closedInformationCanonicalPeers(identity as RecoveryStation);
        if (peers) for (const row of [identity, ...peers]) ids.add(row.id);
        const target = !peers ? this.duplicateRedirectTarget(identity as RecoveryStation) : null;
        if (target && !assessDuplicateRedirect(identity, target).eligible) {
          ids.add(identity.id); ids.add(target.id);
        }
      }
      return [...ids];
    },
    setCityEvidence(id: string, city: string | null) {
      const identity = identities.get(id);
      if (identity) identity.city = city;
    },
    excludedCanonicalPeers(station: RecoveryStation): RecoveryIdentity[] | null {
      if (station.slug !== slugifyStationName(station.name)) return null;
      if (!station.manualEditFields || typeof station.manualEditFields !== 'object' || Array.isArray(station.manualEditFields)) return null;
      if (['name', 'country', 'countryCode', 'city', 'state'].some(key => Object.hasOwn(station.manualEditFields as object, key))) return null;
      const ids = peerIds(station);
      if (!ids.size || ids.size > 10) return null;
      const peers = [...ids].sort().map(id => identities.get(id)!);
      const group = new Set([station.id, ...ids]);
      const slugsSeen = new Set([station.slug]);
      for (const peer of peers) {
        const suffix = peer.slug?.slice(station.slug.length + 1);
        const manual = peer.manualEditFields;
        if (peer.noIndex !== true || peer.redirectToSlug || !peer.slug?.startsWith(`${station.slug}-`) ||
            !/^(?:[1-9]|10)$/.test(suffix || '') || slugsSeen.has(peer.slug) ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(peer.stationuuid || '') ||
            !manual || typeof manual !== 'object' || Array.isArray(manual) ||
            ['noIndex', 'slug', 'redirectToSlug', 'name', 'country', 'countryCode', 'city', 'state', 'url', 'urlResolved']
              .some(key => Object.hasOwn(manual, key))) return null;
        slugsSeen.add(peer.slug);
        // A duplicate's own aliases/endpoints must not hide a third identity
        // outside this closed group, including already indexable stations.
        if ([...peerIds(peer)].some(id => !group.has(id))) return null;
      }
      return assessDuplicateGroup([station, ...peers]).eligible ? peers : null;
    },
  };
}
export type RecoveryIdentityIndex = ReturnType<typeof createRecoveryIdentityIndex>;

/** An unknown flag alone is never evidence for recovery. Complete retained
 * information and identity must pass every guard. Stream availability is
 * recorded as evidence; it does not determine this information page's SEO. */
function reviewLegacyNoindex(station: RecoveryStation, index: RecoveryIdentityIndex, now: number, purpose: 'recovery' | 'content-repair'):
  { reason: string; candidate?: RecoveryCandidate; peerEvidence?: RecoveryIdentity[] } {
  const reject = (reason: string) => ({ reason });
  if (station.noIndex !== true) return reject('not-noindex');
  const manual = station.manualEditFields;
  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) return reject('ambiguous-manual-flags');
  if (['noIndex', 'slug', 'redirectToSlug'].some(key => Object.hasOwn(manual, key))) return reject('manual-protection');
  if (station.redirectToSlug) return reject('redirect');
  if (!station.sourceIsObject || !station.journalIsObject) return reject('ambiguous-metadata');
  const provenance = station.automaticNoIndex as Record<string, unknown> | null;
  const owned = provenance?.owner === 'radiohub-junk-policy' && provenance.version === 1 && provenance.active === true;
  const ownedDuplicate = owned && typeof provenance.reason === 'string' && provenance.reason.startsWith('duplicate-of:') &&
    provenance.reason.length > 'duplicate-of:'.length;
  const retiredNameHeuristic = owned && typeof provenance.reason === 'string' &&
    (provenance.reason.startsWith('codec-suffix:') || provenance.reason.startsWith('song-or-program-name:') ||
      ['test-feed:white-noise', 'test-feed:pink-noise'].includes(provenance.reason));
  if (provenance != null && !ownedDuplicate && !retiredNameHeuristic) return reject('other-provenance');
  if (!text(station.slug)) return reject('missing-slug');
  if (station.name.length > 160 || station.slug.length > 180) return reject('ambiguous-long-identity');
  if (isNumericOnlySlug(station.slug)) return reject('numeric-slug');
  const junk = evaluateJunkStation({ name: station.name, slug: station.slug, url: station.url });
  if (junk.isJunk) return reject(`junk:${junk.reason}`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(station.stationuuid)) return reject('missing-provider-uuid');
  if (!normalized(station.name) || (purpose === 'content-repair' &&
      (!text(station.country) || !/^[a-z]{2}$/i.test(station.countryCode || '')))) return reject('missing-country-identity');
  if (!recoveryEndpoint(station.url) || (station.urlResolved && !recoveryEndpoint(station.urlResolved))) return reject('ambiguous-stream-endpoint');
  if (['lastCheckOk', 'lastCheckTime', 'lastCheckOkTime', 'url', 'urlResolved'].some(key => Object.hasOwn(manual, key))) return reject('manual-provider-evidence');
  const checkedAt = station.lastCheckTime == null ? NaN : new Date(station.lastCheckTime).getTime();
  // A failed latest check is never relabelled as a successful check. Only an
  // explicit successful timestamp, or a check actually marked successful,
  // can supply this optional historical evidence.
  const successfulAt = station.lastCheckOkTime == null ? (station.lastCheckOk === true ? checkedAt : NaN) :
    typeof station.lastCheckOkTime === 'string' ? new Date(station.lastCheckOkTime).getTime() : NaN;
  const knownSuccessfulAt = Number.isFinite(successfulAt) && successfulAt <= now &&
    (!Number.isFinite(checkedAt) || successfulAt <= checkedAt) ? successfulAt : null;
  const recentProviderSuccess = station.lastCheckOk === true && knownSuccessfulAt !== null &&
    [checkedAt, knownSuccessfulAt].every(value => Number.isFinite(value) && value <= now && value >= now - RECOVERY_MAX_AGE_MS);
  const englishComplete = station.englishContentComplete ?? station.completeLanguageCount === AUDIT_LANGUAGES.length;
  if (purpose === 'recovery' && !englishComplete) return reject('incomplete-english-description');
  const conflict = purpose === 'recovery' ? index.hasIdentityConflict(station) : index.hasPeer(station);
  const peers = conflict ? index.excludedCanonicalPeers(station) ||
    (purpose === 'recovery' ? index.closedPrimaryCanonicalPeers(station) || index.closedInformationCanonicalPeers(station) : null) : [];
  const redirectTarget = !peers && purpose === 'recovery' ? index.duplicateRedirectTarget(station) : null;
  if (!peers && !redirectTarget) return reject('plausible-identity-peer');
  const evidencePeers = peers || [redirectTarget!];
  // Missing prose may be repaired after identity review, but this never
  // authorizes noindex recovery or fabricates a complete-language count.
  if (purpose === 'content-repair') return { reason: 'eligible-for-content-repair', ...(evidencePeers.length ? { peerEvidence: evidencePeers } : {}) };
  return { reason: 'eligible', ...(evidencePeers.length ? { peerEvidence: evidencePeers } : {}), candidate: {
    id: station.id, slug: station.slug, name: station.name, country: station.country || '', countryCode: station.countryCode || '',
    ...(redirectTarget ? { redirectToSlug: redirectTarget.slug! } : {}),
    lastCheckOkTime: knownSuccessfulAt === null ? null : new Date(knownSuccessfulAt).toISOString(), completeLanguageCount: station.completeLanguageCount,
    evidence: { provenance: ownedDuplicate ? 'owned-duplicate' : retiredNameHeuristic ? 'owned-retired-name-heuristic' : 'legacy-unknown', providerUuidPresent: true,
      providerLastCheckOk: typeof station.lastCheckOk === 'boolean' ? station.lastCheckOk : null,
      recentProviderSuccess, identityPeers: evidencePeers.length,
      recoveryBasis: redirectTarget ? 'verified-duplicate-redirect' : evidencePeers.length ? 'canonical-of-excluded-duplicates' : 'complete-unique-information-page',
      ...(!redirectTarget && evidencePeers.length ? { excludedDuplicateIds: evidencePeers.map(peer => peer.id) } : {}) },
  } };
}

export function assessLegacyNoindexRecovery(station: RecoveryStation, index: RecoveryIdentityIndex, now: number) {
  return reviewLegacyNoindex(station, index, now, 'recovery');
}

export function assessLegacyNoindexContentRepair(station: RecoveryStation, index: RecoveryIdentityIndex, now: number) {
  return reviewLegacyNoindex(station, index, now, 'content-repair');
}

export const RECOVERY_REVIEW_CSV_HEADER = 'station_id,name,slug,country,country_code,url,stream_url,resolved_stream_url,noindex,recorded_owner,recorded_reason,manual_protection_fields,complete_languages,recovery_guard,repair_basis,plausible_peer_count_at_least,peer_list_truncated,peer_ids,peer_slugs,peer_noindex,verified_information_page_copy_target_slugs\r\n';

/** A first failing guard is not the historical reason for a legacy flag.
 * Peer hints stay explicitly separate from exact name/primary-stream evidence. */
export function recoveryReviewCsv(station: RecoveryStation, index: RecoveryIdentityIndex, now: number): string {
  const decision = assessLegacyNoindexRecovery(station, index, now);
  const peers = index.reviewPeers(station);
  const provenance = station.automaticNoIndex as Record<string, unknown> | null;
  const manual = station.manualEditFields;
  const targets = peers.filter(peer => peer.noIndex === false && !peer.redirectToSlug && peer.slug &&
    !isNumericOnlySlug(peer.slug) && !evaluateJunkStation({ name: peer.name, slug: peer.slug, url: peer.url }).isJunk &&
    assessDuplicateRedirect(station, peer).eligible);
  return [station.id, station.name, station.slug, station.country, station.countryCode,
    station.slug ? `https://themegaradio.com/en/station/${encodeURIComponent(station.slug)}` : '',
    station.url, station.urlResolved,
    station.noIndex, provenance?.owner, provenance?.reason,
    manual && typeof manual === 'object' && !Array.isArray(manual) ? Object.keys(manual).sort().join('|') : 'ambiguous',
    station.completeLanguageCount, decision.reason, decision.candidate?.evidence.recoveryBasis,
    peers.length, peers.length >= 11, peers.map(peer => peer.id).join('|'), peers.map(peer => peer.slug || '').join('|'),
    peers.map(peer => peer.noIndex === true ? 'true' : peer.noIndex === false ? 'false' : 'unknown').join('|'),
    [...new Set([...(decision.candidate?.redirectToSlug ? [decision.candidate.redirectToSlug] : []),
      ...targets.map(peer => peer.slug)])].join('|')].map(auditCsvCell).join(',') + '\r\n';
}
