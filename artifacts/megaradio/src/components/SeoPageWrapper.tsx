import { useLayoutEffect, useMemo } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useSeoRouting } from "@/hooks/useSeoRouting";
import { SeoHead } from "@/components/seo/SeoHead";
import { SeoMetaTags } from "@workspace/seo-shared/seo-config";
import { useLocation, useSearch } from "wouter";
import { preserveInitialSsrHead, ServerSeoHeadContext } from "@/utils/ssr-seo-head";
import { clearGenreStationLists, clearPageStructuredData, withoutGenreStationLists, type ServerStructuredData } from "@/utils/server-structured-data";

interface SeoPageWrapperProps {
  children: React.ReactNode;
  pageType?: string;
}

// SSR owns the initial head. Only fetch page-specific data after navigation
// (or on a dev page with no SSR head), without downloading the translation
// dictionary and station lists a second time.
export function SeoPageWrapper({ children, pageType = 'home' }: SeoPageWrapperProps) {
  const { currentLanguage, englishPath } = useSeoRouting();
  const [location] = useLocation();
  const search = useSearch();
  
  // CRITICAL FIX: Use full URL with country code, not just cleanPath
  // This ensures the API returns SEO in the correct language
  const fullUrl = `${location}${search ? `?${search}` : ''}`;
  const ssrHeadAlreadyCorrect = preserveInitialSsrHead(fullUrl);
  const isGenreDetail = /^\/genres\/.+/.test((englishPath || '').split(/[?#]/)[0]);

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
  // slim=1 keeps only metadata and structured data, excluding duplicate
  // translations/urlTranslations/pageData dictionaries and station records.
  const { data: seoData } = useQuery<{ seoTags?: SeoMetaTags; structuredData?: ServerStructuredData }>({
    queryKey: ['/api/seo/page-data', fullUrl, currentLanguage],
    enabled: !ssrHeadAlreadyCorrect,
    placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/seo/page-data?url=${encodeURIComponent(fullUrl)}&slim=1`, { signal });
      if (!response.ok) throw new Error(`SEO page data unavailable (${response.status})`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const structuredData = useMemo(() => seoData?.structuredData && isGenreDetail
    ? withoutGenreStationLists(seoData.structuredData) : seoData?.structuredData,
  [seoData?.structuredData, isGenreDetail]);

  return (
    <ServerSeoHeadContext.Provider value={true}>
      {/* Never replace a complete SSR head with homepage translation keys or
          the previous route's tags while the current request is pending. */}
      {!ssrHeadAlreadyCorrect && seoData?.seoTags && <SeoHead key={fullUrl} seoData={seoData.seoTags} structuredData={structuredData} />}
      {children}
    </ServerSeoHeadContext.Provider>
  );
}
