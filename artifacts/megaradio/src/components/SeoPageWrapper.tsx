import { useLayoutEffect, useMemo } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useSeoRouting } from "@/hooks/useSeoRouting";
import { SeoHead } from "@/components/seo/SeoHead";
import { getLanguageFromPath } from "@workspace/seo-shared/seo-config";
import { isStationDirectoryData, isStationDirectoryPath } from '@workspace/seo-shared/station-directory';
import { StationDirectoryContext, type SeoPagePayload } from '@/hooks/useStationDirectory';
import { useLocation, useSearch } from "wouter";
import { preserveInitialSsrHead, ServerSeoHeadContext } from "@/utils/ssr-seo-head";
import { clearGenreStationLists, clearPageStructuredData, withoutGenreStationLists } from "@/utils/server-structured-data";

interface SeoPageWrapperProps {
  children: React.ReactNode;
  pageType?: string;
}

// SSR owns the initial head. Catalog pages also need the exact server list;
// other initial pages still skip the duplicate metadata request.
export function SeoPageWrapper({ children, pageType = 'home' }: SeoPageWrapperProps) {
  const { currentLanguage, englishPath } = useSeoRouting();
  const [location] = useLocation();
  const search = useSearch();
  
  const routePath = (englishPath || '').split(/[?#]/)[0];
  const isGenreDetail = /^\/genres\/.+/.test(routePath);
  const isDirectory = isStationDirectoryPath(routePath);
  // Wouter decodes paths/search. Catalog validation and cache identity must
  // retain their original encoding, parameter order and duplicate parameters.
  const fullUrl = isDirectory && typeof window !== 'undefined'
    ? window.location.pathname + window.location.search
    : `${location}${search ? `?${search}` : ''}`;
  const ssrHeadAlreadyCorrect = preserveInitialSsrHead(fullUrl);
  // useSeoRouting synchronizes its language state in an effect. Wait for it
  // on locale changes instead of requesting the new URL with the old locale.
  const directoryLanguageReady = !isDirectory || currentLanguage === getLanguageFromPath(location).language;

  // Remove the old page's entities immediately on route change, including
  // failed/aborted navigation requests. Global entities remain applicable.
  // Layout timing ensures a cached current-route head can apply afterwards.
  useLayoutEffect(() => {
    if (!ssrHeadAlreadyCorrect) clearPageStructuredData();
    // Even the correct initial SSR metadata can describe a different station
    // selection from the browser's saved country filter.
    if (isGenreDetail) clearGenreStationLists();
  }, [fullUrl, ssrHeadAlreadyCorrect, isGenreDetail]);

  // Fetch SEO data from server using FULL URL with country code.
  // slim=1 omits dictionaries; only exact catalog routes include the bounded DTO.
  const query = useQuery<SeoPagePayload, Error>({
    queryKey: ['/api/seo/page-data', fullUrl, currentLanguage],
    enabled: (isDirectory || !ssrHeadAlreadyCorrect) && directoryLanguageReady,
    placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/seo/page-data?url=${encodeURIComponent(fullUrl)}&slim=1`, { signal });
      if (!response.ok && !(isDirectory && response.status === 404)) {
        throw new Error(`SEO page data unavailable (${response.status})`);
      }
      const payload: SeoPagePayload = await response.json();
      if (isDirectory && response.status !== 404 && !isStationDirectoryData(payload?.stationDirectory)) {
        throw new Error('Station directory data unavailable');
      }
      if (isDirectory && response.status === 404 && !payload?.seoTags) {
        throw new Error('Station directory error metadata unavailable');
      }
      return { ...payload, httpStatus: response.status === 404 ? 404 : 200 };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...(isDirectory ? { retry: false } : {}),
  });
  const seoData = query.data;
  const structuredData = useMemo(() => seoData?.structuredData && isGenreDetail
    ? withoutGenreStationLists(seoData.structuredData) : seoData?.structuredData,
  [seoData?.structuredData, isGenreDetail]);

  return (
    <ServerSeoHeadContext.Provider value={true}>
      <StationDirectoryContext.Provider value={{ active: isDirectory, language: currentLanguage, query }}>
        {/* Never replace a complete SSR head with homepage translation keys or
            the previous route's tags while the current request is pending. */}
        {(!ssrHeadAlreadyCorrect || (isDirectory && seoData?.httpStatus === 404)) && seoData?.seoTags
          && <SeoHead key={fullUrl} seoData={seoData.seoTags} structuredData={structuredData}
            clearCanonical={isDirectory && seoData.httpStatus === 404} />}
        {children}
      </StationDirectoryContext.Provider>
    </ServerSeoHeadContext.Provider>
  );
}
