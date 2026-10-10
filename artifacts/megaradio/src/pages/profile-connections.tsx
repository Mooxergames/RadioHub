import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import { useSeoRouting } from '@/hooks/useSeoRouting';
import { useToast } from '@/hooks/use-toast';
import { PublicProfileAvatar } from '@/components/ui/public-profile-avatar';
import { Button } from '@/components/ui/button';
import { RouteBreadcrumbs, useBreadcrumbLastItemName } from '@/components/RouteBreadcrumbs';
import { getQueryFn, apiRequest } from '@/lib/queryClient';
import { communityDisplayName, invalidateCommunityProfiles } from '@/lib/community-profile';
import { getProfileSettingsCopy } from '@/lib/profile-settings-copy';
import { publicProfileLabels } from '@/lib/public-profile-labels';
import { connectionPage, profileConnectionsCopy, type ConnectionDirection, type ConnectionPage } from '@/lib/profile-connections';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF4199]';
const PAGE_SIZE = 20;

export default function ProfileConnections({ direction }: { direction: ConnectionDirection }) {
  const { user } = useAuth();
  return <ConnectionsList key={user?._id || 'anonymous'} viewer={user?._id} direction={direction} />;
}

function ConnectionsList({ viewer, direction }: { viewer?: string; direction: ConnectionDirection }) {
  const { language, localeTranslations } = useTranslation();
  const labels = getProfileSettingsCopy(language, localeTranslations);
  const profileLabels = publicProfileLabels(language, localeTranslations);
  const copy = profileConnectionsCopy(language, localeTranslations);
  const { getLocalizedUrl } = useSeoRouting();
  const { toast } = useToast();
  const client = useQueryClient();
  const mounted = useRef(true);
  const currentDirection = useRef(direction);
  currentDirection.current = direction;
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useBreadcrumbLastItemName(direction === 'followers' ? labels.followers : labels.following);

  const query = useInfiniteQuery({
    queryKey: ['profile-connections', viewer, direction],
    initialPageParam: 1,
    queryFn: async context => {
      const path = `/api/user-engagement/connections/${direction}?page=${context.pageParam}&limit=${PAGE_SIZE}`;
      return connectionPage(await getQueryFn<unknown>({ on401: 'throw' })({ ...context, queryKey: [path] }), direction);
    },
    getNextPageParam: (page: ConnectionPage) => page.pagination.page < page.pagination.pages ? page.pagination.page + 1 : undefined,
    enabled: !!viewer,
    retry: false,
    staleTime: 0,
  });
  const people = [...new Map((query.data?.pages.flatMap(page => page.people) || []).map(person => [person._id, person])).values()];
  const mutation = useMutation({
    mutationFn: (action: { id: string; direction: ConnectionDirection }) => apiRequest('POST',
      `/api/user-engagement/${action.direction === 'followers' ? 'remove-follower' : 'unfollow'}/${encodeURIComponent(action.id)}`),
    onSuccess: async (_response, action) => {
      // Reset pagination after a deletion so shifted rows aren't skipped.
      await client.resetQueries({ queryKey: ['profile-connections', viewer, action.direction], exact: true });
      if (!mounted.current) return;
      void client.invalidateQueries({ queryKey: ['/api/auth/me'] });
      void client.invalidateQueries({ queryKey: ['/api/user/following'] });
      void client.invalidateQueries({ queryKey: [`/api/user/is-following/${action.id}`] });
      invalidateCommunityProfiles(client);
      if (currentDirection.current === action.direction) toast({ title: action.direction === 'followers' ? copy.removed : profileLabels.unfollowed });
    },
    onError: (_error, action) => {
      if (mounted.current && currentDirection.current === action.direction) toast({ title: profileLabels.followFailed, variant: 'destructive' });
    },
    onSettled: () => { pending.current = false; },
    retry: false,
  });
  const remove = (id: string) => {
    if (!viewer || pending.current || id === viewer) return;
    pending.current = true;
    mutation.mutate({ id, direction });
  };

  return <div className="w-full min-w-0 px-3 pb-10 font-['Ubuntu',sans-serif] text-white sm:px-0" dir={language === 'ar' || language === 'he' ? 'rtl' : undefined}>
    <h1 className="sr-only">{direction === 'followers' ? labels.followers : labels.following}</h1>
    <nav aria-label={labels.profile} className="flex min-w-0 gap-6 sm:gap-12">
      {(['followers', 'following'] as const).map(tab => <Link key={tab} href={getLocalizedUrl(`/profile/${tab}`)} aria-current={tab === direction ? 'page' : undefined}
        className={`relative inline-flex min-h-12 items-center pb-3 text-base font-bold transition-colors sm:text-2xl ${focus} ${tab === direction ? 'text-white after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:bg-[#FF4199] sm:after:h-[5px]' : 'text-[#737373] hover:text-white'}`}>
        {tab === 'followers' ? labels.followers : labels.following}
      </Link>)}
    </nav>
    <RouteBreadcrumbs placement="content" />
    <div aria-busy={query.isFetching}>
      <ul className="space-y-3 sm:space-y-5">
        {people.map(person => {
          const name = communityDisplayName(person, profileLabels.anonymous);
          const actionLabel = direction === 'followers' ? copy.remove : profileLabels.unfollow;
          const removing = mutation.isPending && mutation.variables?.id === person._id && mutation.variables.direction === direction;
          return <li key={person._id} className="flex min-h-[72px] min-w-0 items-center gap-3 rounded-[10px] bg-[#202020] px-3 py-3 sm:min-h-[130px] sm:gap-5 sm:px-[30px] sm:py-4">
            <Link href={getLocalizedUrl(`/users/${encodeURIComponent(person.slug || person._id)}`)} className={`group flex min-w-0 flex-1 items-center gap-3 rounded-sm sm:gap-[30px] ${focus}`}>
              <span aria-hidden="true"><PublicProfileAvatar profile={person} name={name} size={96} className="h-10 w-10 sm:h-24 sm:w-24" /></span>
              <div className="min-w-0">
                <h2 className="line-clamp-2 break-words text-sm font-bold leading-snug group-hover:text-[#ff9bca] sm:text-2xl" title={name}>{name}</h2>
                <p className="mt-0.5 text-xs text-[#969696] sm:text-base">{new Intl.NumberFormat(language).format(Math.max(0, Math.floor(person.followersCount || 0)))} {language.split('-')[0] === 'tr' ? 'takipçi' : labels.followers}</p>
              </div>
            </Link>
            {person._id !== viewer && <Button type="button" aria-label={`${actionLabel}: ${name}`} disabled={mutation.isPending} onClick={() => remove(person._id)}
              className={`h-auto min-h-11 min-w-[72px] max-w-[38%] shrink-0 whitespace-normal rounded-[5px] bg-[#FF4199] px-3 py-2 text-xs font-bold text-white hover:bg-[#eb3489] disabled:opacity-50 sm:min-w-[120px] sm:px-5 sm:text-sm ${focus}`}>
              {removing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : actionLabel}
            </Button>}
          </li>;
        })}
      </ul>
      {query.isPending && <div role="status" className="space-y-3 sm:space-y-5"><span className="sr-only">{copy.loading}</span>{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[72px] rounded-[10px] bg-[#202020] motion-safe:animate-pulse sm:h-[130px]" aria-hidden="true" />)}</div>}
      {!query.isPending && !query.isError && people.length === 0 && <p role="status" className="rounded-[10px] bg-[#202020] px-6 py-14 text-center text-[#a3a3a3]">{direction === 'followers' ? copy.emptyFollowers : copy.emptyFollowing}</p>}
      {query.isError && <div role="alert" className="mt-5 rounded-[10px] bg-[#202020] p-6 text-center"><p className="text-sm text-[#bdbdbd]">{copy.error}</p><Button type="button" variant="ghost" disabled={query.isFetching} onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())} className={`mt-3 text-[#FF4199] ${focus}`}>{profileLabels.retry}</Button></div>}
      {query.hasNextPage && !query.isError && <div className="mt-8 flex justify-center"><Button type="button" disabled={query.isFetching || mutation.isPending} onClick={() => void query.fetchNextPage()} className={`h-auto min-h-11 rounded-full bg-[#333] px-6 py-3 text-sm font-bold text-white hover:bg-[#444] ${focus}`}>
        {query.isFetchingNextPage && <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden="true" />}{copy.more}
      </Button></div>}
    </div>
  </div>;
}
