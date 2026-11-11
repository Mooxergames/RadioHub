// Keep the route gate tiny; article copy belongs in the lazy page chunk.
export const LEGACY_COMBINED_GENRE_SLUG = '-00s--80--top200-90-s-90s-bass-chillout-dance-deep-house-discofox-schlager-dj-dj-remix-electronic-electronica-festivals-hiphop-hot-adult-contemporary-house-liveradio-livestream-lounge-minimal-moombahton-pop-pop-dance-pop-music-reggae-reggaeton-remixes-rnb-schlager-techno-top-100-top-40-top-40-hits-top-charts-top100-top200-urban';
export const LEGACY_STATION_GUIDE_ROUTES = [
  { id: 'radar-4', path: '/af/station/radar-4', sourcePaths: ['/af/station/radar-4'], language: 'en' },
  { id: 'quran-radio-3', path: '/ar/mahta/quran-radio-3', sourcePaths: ['/ar/station/quran-radio-3', '/ar/mahta/quran-radio-3'], language: 'ar' },
  { id: 'channel-v-international', path: '/am/station/channel-v-international', sourcePaths: ['/am/station/channel-v-international'], language: 'en' },
  { id: 'rock-fm-23', path: '/ar/mahta/rock-fm-23', sourcePaths: ['/ar/station/rock-fm-23', '/ar/mahta/rock-fm-23'], language: 'ar' },
  { id: 'color-bars-test', path: '/hu/radio/1-21', sourcePaths: ['/hu/radio/1-21', '/hu/radios/1-21'], language: 'en' },
  { id: 'radio-labels', path: `/ar/anwaa/${LEGACY_COMBINED_GENRE_SLUG}`, sourcePaths: [`/ar/genres/${LEGACY_COMBINED_GENRE_SLUG}`, `/ar/anwaa/${LEGACY_COMBINED_GENRE_SLUG}`], language: 'ar' },
  { id: 'dfm-radio-rwanda', path: '/no/station/dfm-radio-rwanda', sourcePaths: ['/no/station/dfm-radio-rwanda'], language: 'en' },
  { id: 'radio-dil-se-dil-tak', path: '/am/station/radio-dil-se-dil-tak', sourcePaths: ['/am/station/radio-dil-se-dil-tak'], language: 'en' },
  { id: 'wxb-loud-1023-fm-pampanga', path: '/it/stazione/wxb-loud-1023-fm-pampanga', sourcePaths: ['/it/station/wxb-loud-1023-fm-pampanga', '/it/stazione/wxb-loud-1023-fm-pampanga'], language: 'en' },
  { id: 'disco-2', path: '/am/station/disco-2', sourcePaths: ['/am/station/disco-2'], language: 'en' },
] as const;

export function getLegacyStationGuideRoute(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const pathname = path.split(/[?#]/)[0];
  return LEGACY_STATION_GUIDE_ROUTES.find(guide => (guide.sourcePaths as readonly string[]).includes(pathname)) ?? null;
}
