import { lazy, Suspense } from 'react';
import { Link } from 'wouter';
import { Radio } from 'lucide-react';
import { DirectoryPage, DirectoryStatus } from '@/components/regions/region-directory';
import { useStationDirectory } from '@/hooks/useStationDirectory';
import { getRegionDirectoryCopy } from '@/utils/region-directory-copy';
import './station-directory.css';

const NotFound = lazy(() => import('@/pages/not-found'));

export default function StationDirectory() {
  const { active, language, query } = useStationDirectory();
  const copy = getRegionDirectoryCopy(language);
  if (!active) return null;

  const loading = <DirectoryStatus kind="loading" label={copy.loading} />;
  if (!query.isError && query.data?.httpStatus === 404) {
    return <Suspense fallback={loading}><NotFound /></Suspense>;
  }

  const directory = query.data?.stationDirectory;
  return <div className="station-directory">
    <DirectoryPage title={directory?.h1 || copy.stations}>
      {query.isError ? <DirectoryStatus kind="error" label={copy.error}
        onRetry={() => { void query.refetch(); }} retryLabel={copy.retry} />
        : !directory ? loading : <>
          <nav className="station-directory-letters" aria-label={directory.navLabel}>
            {directory.letters.map(letter => <Link key={letter.href} href={letter.href}
              aria-current={letter.current ? 'page' : undefined}>{letter.label}</Link>)}
          </nav>
          {directory.stations.length === 0 ? <DirectoryStatus kind="empty" label={copy.empty} /> : <ul className="station-directory-list">
            {directory.stations.map(station => <li key={station.href}>
              <Link href={station.href} className="station-directory-station">
                <span className="station-directory-logo">
                  <Radio size={24} aria-hidden="true" />
                  {station.logoUrl && <img src={station.logoUrl} alt={station.alt} width={56} height={56}
                    loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                </span>
                <span className="station-directory-name">{station.name}</span>
              </Link>
            </li>)}
          </ul>}
          {directory.pages.length > 0 && <nav className="station-directory-pagination" aria-label={directory.paginationLabel}>
            {directory.pages.map(page => <Link key={page.href} href={page.href} rel={page.rel}
              aria-current={page.current ? 'page' : undefined}>{page.page}</Link>)}
          </nav>}
        </>}
    </DirectoryPage>
  </div>;
}
