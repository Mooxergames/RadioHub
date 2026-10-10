import { Redirect } from 'wouter';
import { useSeoRouting } from '@/hooks/useSeoRouting';

/** Keep saved account links working; settings is the single profile screen. */
export default function ProfileRedirect() {
  const { getLocalizedUrl } = useSeoRouting();
  const suffix = typeof window === 'undefined' ? '' : `${window.location.search}${window.location.hash}`;
  return <Redirect replace to={`${getLocalizedUrl('/profile/settings')}${suffix}`} />;
}
