import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { getLegacyStationGuide, renderLegacyStationGuideHtml } from '@workspace/seo-shared/legacy-station-guides';
import { StationDirectoryContext } from '@/hooks/useStationDirectory';
import { InitialStation } from '@/lib/initial-home-components';
import NotFound from './not-found';
import { preserveInitialSsrHead } from '@/utils/ssr-seo-head';
import { getLanguageFromPath, isSafeStationDetailSlug } from '@workspace/seo-shared/seo-config';
import { syncDocumentLocale } from '@/lib/document-locale';

const AudioChannelTest = lazy(() => import('@/components/audio-channel-test'));
const GenreLanding = lazy(() => import('./genres/genre-landing'));

export default function LegacyStationGuidePage() {
  const [location, navigate] = useLocation();
  const page = useContext(StationDirectoryContext);
  const guide = getLegacyStationGuide(location);
  const articleMarkup = useMemo(() => guide ? { __html: renderLegacyStationGuideHtml(guide) } : undefined, [guide]);
  const genreGuide = !!guide && getLanguageFromPath(guide.path).cleanPath.startsWith('/genres/');
  const [audioHost, setAudioHost] = useState<HTMLElement | null>(null);
  const attachArticle = useCallback((node: HTMLDivElement | null) => {
    setAudioHost(node?.querySelector<HTMLElement>('[data-audio-test-root]') ?? null);
  }, [guide?.id]);
  const initialGuide = guide && preserveInitialSsrHead(window.location.pathname + window.location.search)
    && document.querySelector('meta[name="megaradio-legacy-guide"]')?.getAttribute('content') === guide.id;
  useEffect(() => {
    syncDocumentLocale(getLanguageFromPath(location).language, location);
  }, [location, page?.query.data?.legacyGuideId, page?.query.isFetching]);
  const redirectTo = page?.query.data?.redirectTo;
  let stationRedirect: string | null = null;
  if (redirectTo?.startsWith('/') && !redirectTo.startsWith('//') && !/[\s\\]/.test(redirectTo)) {
    try {
      const url = new URL(redirectTo, window.location.origin);
      const cleanPath = getLanguageFromPath(url.pathname).cleanPath;
      const match = cleanPath.match(/^\/station\/([^/]+)$/);
      if (url.origin === window.location.origin && !url.search && !url.hash && url.pathname !== window.location.pathname
        && (genreGuide ? /^\/genres\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanPath)
          : match && isSafeStationDetailSlug(match[1]))) stationRedirect = url.pathname;
    } catch { /* Invalid server targets must never become external navigation. */ }
  }
  useEffect(() => {
    if (stationRedirect && page?.query.isSuccess && !page.query.isFetching) {
      navigate(stationRedirect + window.location.search + window.location.hash, { replace: true });
    }
  }, [stationRedirect, page?.query.isSuccess, page?.query.isFetching, navigate]);
  useEffect(() => {
    const href = '/blog.css?v=20261111';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  }, []);
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    const href = anchor?.getAttribute('href');
    if (!anchor || anchor.target || !href?.startsWith('/') || href.startsWith('//')) return;
    event.preventDefault(); navigate(href); window.scrollTo({ top: 0 });
  };
  if (!guide || !page) return <NotFound />;
  if (page.query.data?.httpStatus === 410 || page.query.data?.httpStatus === 404) return <NotFound />;
  if (page.query.isError && !initialGuide) return <main className="radio-journal"><button type="button" onClick={() => void page.query.refetch()}>{guide.language === 'ar' ? 'إعادة المحاولة' : 'Try again'}</button></main>;
  if (page.query.isFetching && !initialGuide) return <main className="radio-journal" aria-busy="true"><div className="radio-journal-loading" /></main>;
  if (!page.query.data && !initialGuide) return <main className="radio-journal" aria-busy="true"><div className="radio-journal-loading" /></main>;
  if (redirectTo) return stationRedirect ? <main className="radio-journal" aria-busy="true"><div className="radio-journal-loading" /></main> : <NotFound />;
  // A real catalogue owner takes precedence; a URL match alone is not approval.
  if (page.query.data && page.query.data.legacyGuideId !== guide.id) return genreGuide
    ? <Suspense fallback={null}><GenreLanding /></Suspense> : <InitialStation />;
  return <div onClick={onClick}>
    <div ref={attachArticle} dangerouslySetInnerHTML={articleMarkup} />
    {guide.kind === 'audio-test' && audioHost && createPortal(<Suspense fallback={null}><AudioChannelTest /></Suspense>, audioHost)}
  </div>;
}
