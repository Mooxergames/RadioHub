import { COUNTRY_TO_REGION_SLUG, countrySlug } from '@workspace/seo-shared/country-regions';
import { ALIAS_TO_DB } from '../utils/normalize-country';

interface ExistenceLookup {
  isSlugExistenceReady(): boolean;
  hasCountrySlug(slug: string): boolean;
  hasCityDataForCountry(slug: string): boolean;
  hasCitySlug(country: string, city: string): boolean;
}
const referenceCountries = new Set(Object.keys(COUNTRY_TO_REGION_SLUG).map(countrySlug));
const regionByCountry = new Map(Object.entries(COUNTRY_TO_REGION_SLUG).map(([country, region]) => [countrySlug(country), region]));
const resolveCountry = (requested: string) => referenceCountries.has(requested) ? requested
  : Object.hasOwn(ALIAS_TO_DB, requested) ? countrySlug(ALIAS_TO_DB[requested]) : requested;

/** A country cannot create another self-canonical page under every continent.
 * Only reference-backed identities are normalized; custom catalogue countries
 * and city/listing suffixes are not guessed or discarded.
 */
export function canonicalRegionPath(cleanPath: string): string | null {
  const parts = cleanPath.split('/').filter(Boolean);
  if (parts[0] !== 'regions' || !parts[2]) return null;
  const requested = parts[2].toLowerCase();
  const country = resolveCountry(requested);
  const region = regionByCountry.get(country);
  if (!region || (parts[1] === region && parts[2] === country)) return null;
  return ['','regions',region,country,...parts.slice(3)].join('/');
}

/** Never infer geographic absence from an empty station grid or a cold cache. */
export function regionRouteExistence(cleanPath: string, lookup: ExistenceLookup): 'known' | 'missing' | 'unavailable' {
  const parts = cleanPath.split('/').filter(Boolean);
  const countryIndex = parts[0] === 'regions' ? 2 : parts[0] === 'country' ? 1 : -1;
  if (countryIndex < 0 || !parts[countryIndex]) return 'known';
  const requestedCountry = parts[countryIndex].toLowerCase();
  const country = resolveCountry(requestedCountry);
  const ready = lookup.isSlugExistenceReady();
  if (!referenceCountries.has(country) && !(ready && (lookup.hasCountrySlug(country) || lookup.hasCountrySlug(requestedCountry)))) {
    return ready ? 'missing' : 'unavailable';
  }
  const city = parts[countryIndex + 1]?.toLowerCase();
  if (city && city !== 'stations' && city !== 'cities' && ready && lookup.hasCityDataForCountry(country) && !lookup.hasCitySlug(country, city)) return 'missing';
  return 'known';
}
