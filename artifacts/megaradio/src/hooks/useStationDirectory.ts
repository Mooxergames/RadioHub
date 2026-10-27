import { createContext, useContext } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SeoMetaTags } from '@workspace/seo-shared/seo-config';
import type { StationDirectoryData } from '@workspace/seo-shared/station-directory';
import type { ServerStructuredData } from '@/utils/server-structured-data';

export interface SeoPagePayload {
  seoTags?: SeoMetaTags;
  structuredData?: ServerStructuredData;
  stationDirectory?: StationDirectoryData;
  httpStatus?: 200 | 404;
}

export const StationDirectoryContext = createContext<{
  active: boolean;
  language: string;
  query: UseQueryResult<SeoPagePayload, Error>;
} | null>(null);

export function useStationDirectory() {
  const context = useContext(StationDirectoryContext);
  if (!context) throw new Error('StationDirectory requires SeoPageWrapper');
  return context;
}
