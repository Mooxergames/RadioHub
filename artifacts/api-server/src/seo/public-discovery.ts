import { buildCommunityPageSeo } from '@workspace/seo-shared/community-page-seo-templates';
import { isJunkStation } from './junk-station-rules';

export type PublicDiscoveryKind = 'trending' | 'recommendations';

const TRENDING_HEADINGS: Record<string, string> = {
  en: 'Trending Radio Stations', de: 'Beliebte Radiosender', tr: 'Trend Radyo İstasyonları',
  es: 'Emisoras de Radio en Tendencia', fr: 'Stations de Radio Tendance', it: 'Stazioni Radio di Tendenza',
  pt: 'Estações de Rádio em Alta', ru: 'Популярные радиостанции', ar: 'محطات الراديو الرائجة',
  zh: '热门广播电台', ja: '人気のラジオ局', ko: '인기 라디오 방송국', hi: 'लोकप्रिय रेडियो स्टेशन', he: 'תחנות רדיו פופולריות',
};

export function trendingPageSeo(language: string, translations: Record<string, string>) {
  const h1 = translations.general_trending_stations?.trim() || TRENDING_HEADINGS[language] || TRENDING_HEADINGS.en;
  return {
    h1,
    title: `${h1} | Mega Radio`,
    description: translations.trending_discover_popular_description?.trim()
      || `${h1}. ${buildCommunityPageSeo('stations', language, translations).description}`,
  };
}

/** Same anonymous sources as the UI: no session, user ID, listening history or
 * private favorites. Project cards before they reach SEO payloads/caches. */
export async function loadPublicDiscoveryStations(kind: PublicDiscoveryKind) {
  let stations: any[];
  if (kind === 'recommendations') {
    const { getRecommendationPool } = await import('../services/recommendation-pool');
    stations = (await getRecommendationPool({ country: null, genres: [] })).stations;
  } else {
    const { pgTrendingStations } = await import('../data/postgres-engagement-store');
    const { publicStationCache } = await import('../public-station-cache');
    stations = (await publicStationCache.getOrSetSingleFlight('seo:trending:v2:24',
      () => pgTrendingStations(undefined, 24), { ttl: 60 })).trending
      .map((row: any) => ({ ...row.station, _id: row.stationId }));
  }
  const fields = ['_id', 'name', 'slug', 'url', 'favicon', 'logoAssets', 'country', 'countryCode', 'tags'];
  return stations.filter((station: any) => station?.slug && station.isListVisible !== false
    && station.noIndex === false && !isJunkStation(station)).slice(0, 24)
    .map((station: any) => Object.fromEntries(fields.map(field => [field, station[field]])));
}
