export const STATION_LOGOS_S3_BASE_URL =
  'https://megaradio-station-logos.s3.eu-north-1.amazonaws.com/station-logos';
const SOURCE_ORIGIN = new URL(STATION_LOGOS_S3_BASE_URL).origin;

const UUID = '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}';
const PROCESSED_KEY = new RegExp(`^station-logos/[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}/(?:logo-(?:48|96|256)\\.webp|variants/${UUID}/logo-(?:48|96)\\.webp)$`);

/** One storage grammar for URL emission and anonymous binary delivery. */
export function getPublicStationLogoKey(rawPath: string): string | null {
  if (typeof rawPath !== 'string' || rawPath.length > 400 || /[\\%?#\u0000-\u0020\u007f]/.test(rawPath) || rawPath.includes('..')) return null;
  const key = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
  return PROCESSED_KEY.test(key) ? key : null;
}

/** Unknown, signed and raw-original URLs deliberately keep their old behavior. */
export function normalizePublicStationLogoUrl(value: string): string {
  if (typeof value !== 'string') return '';
  if (/[\\%?#\u0000-\u0020\u007f]/.test(value) || value.includes('..')
    || !value.startsWith(`${STATION_LOGOS_S3_BASE_URL}/`)) return value;
  const rawPath = value.slice(SOURCE_ORIGIN.length);
  const key = getPublicStationLogoKey(rawPath);
  if (!key) return value;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.pathname !== rawPath) return value;
    return `/${key}`;
  } catch {
    return value;
  }
}
