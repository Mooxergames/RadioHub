// Figma desktop profile shell: 250px sidebar + 30px content gutter.
// Share the inset with breadcrumbs so their first link tracks the page heading.
export const PROFILE_CONTENT_INSET = 'px-2 md:px-8 lg:pl-[280px] lg:pr-[30px]';

export function hasProfileContentBreadcrumbs(path: string) {
  const cleanPath = path.split(/[?#]/)[0].replace(/\/$/, '');
  return cleanPath === '/profile/favorites' || cleanPath === '/profile/discover' || cleanPath === '/profile/settings' || cleanPath === '/profile/followers' || cleanPath === '/profile/following';
}
