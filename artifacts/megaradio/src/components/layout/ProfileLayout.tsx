import { useAuth } from "@/hooks/useAuth";
import { logoutAccount } from '@/lib/logout';
import { toast } from '@/hooks/use-toast';
import { useLocation } from "wouter";
import { useEffect, startTransition } from "react";
import { useSeoRouting } from "@/hooks/useSeoRouting";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/useTranslation';
import { getProfileNavCopy } from '@/lib/profile-nav-copy';
import { PROFILE_CONTENT_INSET, hasProfileContentBreadcrumbs } from '@/lib/profile-layout';
import { ProfileNavIcon } from './profile-nav-icon';

function NavLink({ href, children, isActive }: { href: string; children: React.ReactNode; isActive: boolean }) {
  const [, navigate] = useLocation();
  return (
    <a
      href={href}
      aria-current={isActive ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        startTransition(() => { navigate(href); });
      }}
      className={`group flex min-h-[45px] cursor-pointer items-center rounded-[5px] px-5 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF4199] ${isActive ? 'bg-[#2D2D2D]' : ''}`}
    >
      {children}
    </a>
  );
}

interface ProfileLayoutProps {
  children: React.ReactNode;
}

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  const { user } = useAuth();
  const { language, localeTranslations } = useTranslation();
  const navCopy = getProfileNavCopy(language);
  const englishNav = getProfileNavCopy('en');
  const navLabel = (key: string, name: keyof typeof navCopy) => {
    const value = localeTranslations?.[key]?.trim();
    return value && !(language !== 'en' && value === englishNav[name]) ? value : navCopy[name];
  };
  const { getLocalizedUrl, englishPath } = useSeoRouting();
  const isMessagesPage = englishPath.replace(/\/$/, '') === '/profile/messages';
  const [location] = useLocation();

  const queryClient = useQueryClient();

  // Preload all profile sub-pages when ProfileLayout first mounts.
  // This prevents the React 18 "suspended during synchronous input" warning
  // that occurs when lazy-loaded components haven't been fetched yet at click time.
  useEffect(() => {
    Promise.allSettled([
      import("@/pages/messages"),
      import("@/pages/favorites"),
      import("@/pages/profile-discover"),
      import("@/pages/profile-settings"),
      import("@/pages/profile-connections"),
      import("@/pages/notifications-view"),
    ]);

    // Prefetch global stations so Discover page shows data instantly.
    // The backend serves this from an in-memory precomputed cache (warm since
    // the 4h cron), so the fetch is fast. staleTime matches the Discover page
    // so TanStack Query reuses this cache entry when the user navigates there.
    queryClient.prefetchQuery({
      queryKey: ["/api/stations/global-100"],
      queryFn: async () => {
        const res = await fetch("/api/stations/precomputed?countryName=global&page=1&limit=100&slim=1", {
          credentials: "include",
        });
        if (!res.ok) return [];
        const result = await res.json();
        return result.data || [];
      },
      staleTime: 7 * 24 * 60 * 60 * 1000,
    });
  }, [queryClient]);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count", user?._id || (user as any)?.id || ''],
    queryFn: async ({ signal }) => (await apiRequest('GET', '/api/messages/unread-count', { signal })).json(),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const unreadCount = unreadData?.count ?? 0;
  
  // Get clean path for comparison
  const isActive = (path: string) => {
    const currentPath = location.split(/[?#]/)[0].replace(/\/$/, '');
    const targetPath = path.replace(/\/$/, '');
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
  };

  return (
    <div data-layout="user" className={`text-white bg-[#0E0E0E] ${isMessagesPage ? 'h-full min-h-0' : 'min-h-screen'}`}>
      {/* NO HEADER HERE - RadioHeader is provided by PlayerWrapper in App.tsx for ALL pages */}

      <div className={`text-white ${isMessagesPage ? 'h-full min-h-0' : ''}`}>
        {/* Sidebar Navigation - fixed full-width layout */}
        <div className="
          hidden
          lg:fixed lg:inset-y-0 lg:left-0 lg:top-[90px] lg:z-10 lg:w-[250px] lg:flex-col lg:bg-[#151515]
          lg:flex xl:top-[105px]
        ">
          <div className="flex h-full flex-col justify-between overflow-y-auto px-[30px]">
            {/* Main Navigation Links - Reference: space-y-5 */}
            <div className="space-y-[14px] pt-7">
              <NavLink href={getLocalizedUrl("/profile/favorites")} isActive={isActive(getLocalizedUrl("/profile/favorites"))}>
                <ProfileNavIcon name="favorites" />
                <div className="text-base font-bold">{navLabel('nav_your_favorites', 'favorites')}</div>
              </NavLink>

              <NavLink href={getLocalizedUrl("/profile/discover")} isActive={isActive(getLocalizedUrl("/profile/discover"))}>
                <ProfileNavIcon name="discover" />
                <div className="text-base font-bold">{navLabel('user_menu_discover', 'discover')}</div>
              </NavLink>

              <NavLink href={getLocalizedUrl("/profile/settings")} isActive={isActive(getLocalizedUrl("/profile/settings")) || ["/profile/followers", "/profile/following"].includes(englishPath.replace(/\/$/, ""))}>
                <ProfileNavIcon name="profile" />
                <div className="text-base font-bold">{navLabel('user_menu_profile', 'profile')}</div>
              </NavLink>

              <NavLink href={getLocalizedUrl("/profile/messages")} isActive={isActive(getLocalizedUrl("/profile/messages"))}>
                <ProfileNavIcon name="messages" />
                <div className="text-base font-bold flex-1">{navLabel('messages', 'messages')}</div>
                {unreadCount > 0 && (
                  <span className="bg-[#FF4199] text-white text-[12px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            </div>

            {/* Bottom Navigation Links */}
            <div className="mb-4 space-y-5">
              <NavLink href={getLocalizedUrl("/feedback")} isActive={isActive(getLocalizedUrl("/feedback"))}>
                <ProfileNavIcon name="feedback" />
                <div className="text-base font-bold">{navLabel('feedback', 'feedback')}</div>
              </NavLink>

              <button
                onClick={() => {
                  logoutAccount()
                    .then(() => {
                      window.location.href = getLocalizedUrl('/');
                    })
                    .catch(() => {
                      toast({ title: 'Logout failed. Please try again.', variant: 'destructive' });
                    });
                }}
                className="flex w-full cursor-pointer items-center rounded px-5 py-3 text-left"
              >
                <ProfileNavIcon name="logout" />
                <div className="text-base font-bold">{navLabel('nav_logout', 'logout')}</div>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area - full width with sidebar offset */}
        <div className={`relative w-full ${isMessagesPage ? 'h-full min-h-0' : ''}`}>
          <div className={`w-full bg-[#0E0E0E] ${isMessagesPage ? 'h-full min-h-0 lg:pl-[250px]' : ''}`}>
            <div className={isMessagesPage ? 'h-full min-h-0' : `${PROFILE_CONTENT_INSET} ${hasProfileContentBreadcrumbs(englishPath) ? 'pt-5 pb-8' : 'py-8'}`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
