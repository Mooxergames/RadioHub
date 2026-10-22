
import { getMergedWhitelist, getMergedAliases } from './genre-whitelist-store';

// Re-export the static seed under the historical names for any caller
// that wants to read the seed directly (e.g. admin routes that compare
// "is this in the seed or admin-added?"). Lookup callers should always
// go through `isWhitelistedGenreSlug` / `getCanonicalGenreSlug` so they
// pick up admin overrides automatically.
export {
  GENRE_WHITELIST_SEED as GENRE_WHITELIST,
  GENRE_ALIASES_SEED as GENRE_ALIASES,
  MIN_STATIONS_FOR_GENRE_INDEX,
} from './genre-whitelist-seed';

/** Returns true when `slug` (case-insensitive) is on the merged genre whitelist. */
export function isWhitelistedGenreSlug(slug: string | undefined | null): boolean {
  if (!slug) return false;
  return getMergedWhitelist().has(slug.toLowerCase());
}

/**
 * Resolve a request slug to its canonical whitelisted slug.
 *   - Whitelisted slug → returned as-is (lowercased)
 *   - Aliased slug → returns the canonical whitelisted target
 *   - Otherwise → undefined (caller should noindex / drop from sitemap)
 */
export function getCanonicalGenreSlug(slug: string | undefined | null): string | undefined {
  if (!slug) return undefined;
  const lower = slug.toLowerCase();
  const whitelist = getMergedWhitelist();
  if (whitelist.has(lower)) return lower;
  const aliased = getMergedAliases().get(lower);
  if (aliased && whitelist.has(aliased)) return aliased;
  return undefined;
}
