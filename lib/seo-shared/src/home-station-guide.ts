export const HOME_STATION_GUIDE = {
  heading: 'Explore ORF Hitradio Ö3',
  description: 'Get to know this Austrian station with programme and podcast links, FM reception information and answers to common listening questions.',
  label: 'ORF Hitradio Ö3 station guide (in German)',
  href: '/de/sender/orf-hitradio-o3',
  language: 'de',
} as const;

export function getHomeStationGuide(language: string) {
  return language === 'en' ? HOME_STATION_GUIDE : null;
}
