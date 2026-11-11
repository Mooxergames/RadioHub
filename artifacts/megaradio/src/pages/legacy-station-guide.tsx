import { useContext, useEffect, type MouseEvent } from 'react';
import { useLocation } from 'wouter';
import { getLegacyStationGuide, renderLegacyStationGuideHtml } from '@workspace/seo-shared/legacy-station-guides';
import { StationDirectoryContext } from '@/hooks/useStationDirectory';
import { InitialStation } from '@/lib/initial-home-components';
import NotFound from './not-found';
import { preserveInitialSsrHead } from '@/utils/ssr-seo-head';

export default function LegacyStationGuidePage() {
  const [location, navigate] = useLocation();
  const page = useContext(StationDirectoryContext);
  const guide = getLegacyStationGuide(location);
  const initialGuide = guide && preserveInitialSsrHead(window.location.pathname + window.location.search)
    && document.querySelector('meta[name="megaradio-legacy-guide"]')?.getAttribute('content') === guide.id;
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
  if (page.query.isError && !initialGuide) return <main className="radio-journal"><button type="button" onClick={() => void page.query.refetch()}>{guide.language === 'ar' ? 'إعادة المحاولة' : 'Try again'}</button></main>;
  if (!page.query.data && !initialGuide) return <main className="radio-journal" aria-busy="true"><div className="radio-journal-loading" /></main>;
  // A real catalogue owner takes precedence; a URL match alone is not approval.
  if (page.query.data && page.query.data.legacyGuideId !== guide.id) return <InitialStation />;
  return <div onClick={onClick} dangerouslySetInnerHTML={{ __html: renderLegacyStationGuideHtml(guide) }} />;
}
