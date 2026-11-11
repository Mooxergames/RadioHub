export const AZ_INDEX_KEYS: readonly string[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  '0-9',
];

/** Matches exactly one A-Z index key (already-lowercased input expected). */
export const AZ_KEY_RE = /^(?:0-9|[a-z])$/;

/** Human-facing label: `a` → `A`, `0-9` → `0-9`. */
export function azDisplayLabel(key: string): string {
  return key === '0-9' ? '0-9' : key.toUpperCase();
}

/**
 * Half-open slug range [gte, lt) for a key. Slugs are lowercase ASCII, so
 * plain string bounds turn the letter filter into a pure b-tree range on
 * the unique `{slug:1}` index — no regex, no in-memory sort (the
 * 2026-05-14 incident rule). `:` is the ASCII character after `9`, `{`
 * the one after `z`.
 */
export function azSlugBounds(key: string): { gte: string; lt: string } {
  if (key === '0-9') return { gte: '0', lt: ':' };
  return { gte: key, lt: String.fromCharCode(key.charCodeAt(0) + 1) };
}

/**
 * Detect an A-Z index path on the ALREADY-ENGLISH cleanPath the SSR
 * pipeline produces (localized segments are reverse-translated upstream).
 * Accepts both singular and plural because some languages share one word
 * for station/stations and the reverse map may yield either.
 * Returns the key, or null when the path is not an A-Z index page.
 */
export function matchAzIndexPath(cleanPath: string): string | null {
  const m = /^\/(?:station|stations)\/(0-9|[a-z])$/.exec(cleanPath);
  return m ? m[1] : null;
}
