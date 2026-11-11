import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { MAX_GENRE_DIRECTORY_PAGE } from '@workspace/seo-shared/seo-config';

export function parseGenrePage(search: string): number {
  const values = new URLSearchParams(search).getAll('page');
  if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0])) return 1;
  const page = Number(values[0]);
  return Number.isSafeInteger(page) ? page : 1;
}

export function parseGenreDirectoryPage(search: string): { page: number; valid: boolean } {
  const values = new URLSearchParams(search).getAll('page');
  if (values.length === 0) return { page: 1, valid: true };
  const page = Number(values[0]);
  const valid = values.length === 1 && /^\d+$/.test(values[0])
    && Number.isSafeInteger(page) && page >= 1 && page <= MAX_GENRE_DIRECTORY_PAGE;
  return { page: valid ? page : 1, valid };
}

export function useGenreMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);
  return isMobile;
}

/** URL pagination survives reload/back/forward; only same-page filter changes reset it. */
export function useGenrePagination(filterScope: string) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const previous = useRef({ location, filterScope });
  const filterChanged = previous.current.location === location && previous.current.filterScope !== filterScope;
  const currentPage = filterChanged ? 1 : parseGenrePage(search);

  const navigatePage = (page: number, replace = false) => {
    const params = new URLSearchParams(search);
    if (Number.isSafeInteger(page) && page > 1) params.set('page', String(page));
    else params.delete('page');
    const query = params.toString();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    navigate(`${location}${query ? `?${query}` : ''}${hash}`, { replace });
  };

  useEffect(() => {
    previous.current = { location, filterScope };
    if (filterChanged) navigatePage(1, true);
    // navigatePage intentionally reads the current search, preserving unrelated parameters.
  }, [location, filterScope, filterChanged, search, navigate]);

  const changePage = (page: number) => {
    navigatePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { currentPage, changePage };
}

/** Public detail URLs never inherit the browser's personal country slice. */
export function useGenreDirectoryPagination(personalCountry: string, publicCountry = 'all') {
  const [location, navigate] = useLocation();
  const routerSearch = useSearch();
  // Wouter decodes search once; URLSearchParams must receive the original encoding.
  const search = typeof window !== 'undefined' ? window.location.search : routerSearch;
  const { page: urlPage, valid: validPage } = parseGenreDirectoryPage(search);
  const pageValues = new URLSearchParams(search).getAll('page');
  const [pagination, setPagination] = useState(() => ({
    location, search, personalCountry, publicCountry,
    isPublic: urlPage > 1 || personalCountry === publicCountry,
    localPage: 1, resetUrl: false,
  }));

  // Reset before the query observer sees a changed filter, not in a later effect.
  let current = pagination;
  if (location !== pagination.location || publicCountry !== pagination.publicCountry) {
    current = { location, search, personalCountry, publicCountry,
      isPublic: urlPage > 1 || personalCountry === publicCountry, localPage: 1, resetUrl: false };
  } else if (personalCountry !== pagination.personalCountry) {
    current = { ...pagination, personalCountry, search,
      isPublic: personalCountry === publicCountry, localPage: 1, resetUrl: pageValues.length > 0 };
  } else if (search !== pagination.search) {
    current = { ...pagination, search, isPublic: urlPage > 1 || pagination.isPublic, localPage: 1, resetUrl: false };
  }
  if (current !== pagination) setPagination(current);

  const pageHref = (page: number) => {
    const params = new URLSearchParams(search);
    if (page > 1) params.set('page', String(page));
    else params.delete('page');
    const query = params.toString();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    return `${location}${query ? `?${query}` : ''}${hash}`;
  };

  useEffect(() => {
    if (!current.resetUrl) return;
    navigate(pageHref(1), { replace: true });
    setPagination(previous => ({ ...previous, resetUrl: false }));
  }, [current.resetUrl, location, search, navigate]);

  const changePage = (page: number) => {
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_GENRE_DIRECTORY_PAGE) return;
    if (current.isPublic) navigate(pageHref(page));
    else setPagination(previous => ({ ...previous, localPage: page }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return {
    currentPage: current.resetUrl ? 1 : current.isPublic ? urlPage : current.localPage,
    currentCountry: current.isPublic ? publicCountry : personalCountry,
    isPublic: current.isPublic,
    validPage: current.resetUrl || validPage,
    pageHref,
    changePage,
  };
}
