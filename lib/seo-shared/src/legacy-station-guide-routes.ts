// Keep the route gate tiny; article copy belongs in the lazy page chunk.
export const LEGACY_STATION_GUIDE_ROUTES = [
  { id: 'radar-4', path: '/af/station/radar-4', sourcePaths: ['/af/station/radar-4'], language: 'en' },
  { id: 'rock-fm-23', path: '/ar/mahta/rock-fm-23', sourcePaths: ['/ar/station/rock-fm-23', '/ar/mahta/rock-fm-23'], language: 'ar' },
] as const;

export function getLegacyStationGuideRoute(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const pathname = path.split(/[?#]/)[0];
  return LEGACY_STATION_GUIDE_ROUTES.find(guide => (guide.sourcePaths as readonly string[]).includes(pathname)) ?? null;
}
