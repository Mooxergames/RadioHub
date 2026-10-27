export interface StationDirectoryData {
  h1: string;
  letter: string | null;
  currentPage: number;
  totalPages: number;
  navLabel: string;
  paginationLabel: string;
  stations: Array<{ href: string; name: string; logoUrl: string | null; alt: string }>;
  letters: Array<{ label: string; href: string; current: boolean }>;
  pages: Array<{ page: number; href: string; current: boolean; rel?: 'prev' | 'next' }>;
}

/** Call after locale segments have been reverse-translated. */
export function isStationDirectoryPath(path: string): boolean {
  return path === '/stations' || /^\/stations?\/(?:0-9|[a-z])$/.test(path);
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const localHref = (value: unknown): value is string =>
  text(value) && value.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u0020]/.test(value);
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const imageUrl = (value: unknown): boolean => value === null || localHref(value)
  || (text(value) && /^https?:\/\//i.test(value));

export function isStationDirectoryData(value: unknown): value is StationDirectoryData {
  if (!record(value) || !text(value.h1) || !text(value.navLabel) || !text(value.paginationLabel)
    || !(value.letter === null || (text(value.letter) && /^(?:0-9|[a-z])$/.test(value.letter)))
    || !positiveInteger(value.currentPage) || !positiveInteger(value.totalPages) || value.currentPage > value.totalPages
    || !Array.isArray(value.stations) || value.stations.length > 60
    || !Array.isArray(value.letters) || value.letters.length !== 27
    || !Array.isArray(value.pages) || value.pages.length > 50) return false;
  return value.stations.every(station => record(station) && text(station.name) && localHref(station.href)
      && imageUrl(station.logoUrl) && text(station.alt))
    && value.letters.every(letter => record(letter) && text(letter.label) && localHref(letter.href) && typeof letter.current === 'boolean')
    && value.pages.every(page => record(page) && positiveInteger(page.page) && localHref(page.href)
      && typeof page.current === 'boolean' && (page.rel === undefined || page.rel === 'prev' || page.rel === 'next'));
}
