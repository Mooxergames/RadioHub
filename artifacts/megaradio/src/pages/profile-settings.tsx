import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useSeoRouting } from '@/hooks/useSeoRouting';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, CircleAlert, Loader2, Pencil } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PublicProfileAvatar } from '@/components/ui/public-profile-avatar';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, oauthBearerHeader, resolveApiUrl } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/useTranslation';
import { ACTIVE_SITEMAP_LANGUAGES, SEO_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { ManageSubscriptionButton } from '@/components/ManageSubscriptionButton';
import { ProfileSettingsNotifications } from '@/components/profile-settings-notifications';
import { RouteBreadcrumbs } from '@/components/RouteBreadcrumbs';
import { getProfileSettingsCopy } from '@/lib/profile-settings-copy';
import { profileSettingsDefaults, profileSettingsPayload, profileSettingsSchema, type ProfileSettingsData, type SettingsUser } from '@/lib/profile-settings-form';
import { getLocalizedCountryDisplayName } from '@/utils/localized-country';
import { invalidateCommunityProfiles } from '@/lib/community-profile';

const panelClass = 'min-w-0 rounded-[10px] bg-[#151515] p-5 sm:p-[30px]';
const inputClass = 'h-12 min-w-0 rounded-lg border-[#656565] bg-transparent px-4 text-base text-white focus-visible:border-[#FF4199] focus-visible:ring-[#FF4199]/30';
const switchClass = 'data-[state=checked]:bg-[#FF4199] data-[state=unchecked]:bg-[#383838] focus-visible:ring-[#FF4199] [&>span]:bg-white';

function SettingsContent() {
  const { user } = useAuth();
  return <ProfileSettingsForm key={String(user?._id || 'anonymous')} user={user} />;
}

function ProfileSettingsForm({ user }: { user: SettingsUser | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language = 'en', localeTranslations } = useTranslation();
  const copy = getProfileSettingsCopy(language, localeTranslations);
  const { getLocalizedUrl } = useSeoRouting();
  const avatarRequirements = `${copy.avatarHint} · ≥100×100 px`;
  const active = useRef(true);
  const avatarObjectUrl = useRef('');
  const savePending = useRef(false);
  const submittedDraft = useRef<ProfileSettingsData | undefined>(undefined);
  const avatarPending = useRef(false);
  const lastUploadedAvatar = useRef('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [saveResult, setSaveResult] = useState<'saved' | 'error' | null>(null);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; if (avatarObjectUrl.current) URL.revokeObjectURL(avatarObjectUrl.current); };
  }, []);

  const { data: countries = [] } = useQuery<string[]>({ queryKey: ['/api/filters/countries'] });
  const languages = SEO_LANGUAGES.filter(item => ACTIVE_SITEMAP_LANGUAGES.some(code => code === item.code));
  const form = useForm<ProfileSettingsData>({ resolver: zodResolver(profileSettingsSchema(copy)), defaultValues: profileSettingsDefaults(user) });
  const { isDirty, errors } = form.formState;
  const autoplay = form.watch('is_autoplay_at_login');


  useEffect(() => {
    if (user && !form.formState.isDirty && !savePending.current) form.reset(profileSettingsDefaults(user));
  }, [user, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileSettingsData) => (await apiRequest('PUT', '/api/auth/profile', { body: profileSettingsPayload(data) })).json(),
    onSuccess: (_result, submitted) => {
      if (!active.current) return;
      setSaveResult('saved');
      toast({ title: copy.success, description: copy.saved });
      void queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      invalidateCommunityProfiles(queryClient);
      // Schema trimming normalizes the payload; compare against the raw draft.
      // Newer edits made during the request must remain in the form.
      if (JSON.stringify(form.getValues()) === JSON.stringify(submittedDraft.current)) form.reset({ ...submitted, password: '' });
      else {
        // Discard must return to the last successful save, even if its refetch
        // is delayed. Keep any edits typed while that request was running.
        form.reset({ ...submitted, password: '' }, { keepValues: true, keepDirty: true });
        if (form.getValues('password') === submitted.password) form.setValue('password', '', { shouldDirty: true });
      }
    },
    onError: () => {
      if (!active.current) return;
      setSaveResult('error');
      toast({ title: copy.error, description: copy.saveFailed, variant: 'destructive' });
    },
    onSettled: () => { savePending.current = false; }, retry: false,
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData(); formData.append('avatar', file);
      const response = await fetch(resolveApiUrl('/api/user/avatar'), { method: 'POST', body: formData, credentials: 'include', headers: oauthBearerHeader() });
      if (!response.ok) throw new Error(response.status === 400 || response.status === 413 ? avatarRequirements : copy.avatarFailed);
      const data = await response.json();
      if (typeof data.avatar !== 'string' || !data.avatar) throw new Error(copy.avatarFailed);
      return data as { avatar: string };
    },
    onSuccess: data => {
      if (!active.current) return;
      lastUploadedAvatar.current = data.avatar;
      setAvatarPreview(data.avatar);
      toast({ title: copy.success, description: copy.avatarSaved });
      void queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      invalidateCommunityProfiles(queryClient);
    },
    onError: error => {
      if (!active.current) return;
      setAvatarPreview(lastUploadedAvatar.current);
      toast({ title: copy.error, description: error.message === avatarRequirements ? avatarRequirements : copy.avatarFailed, variant: 'destructive' });
    },
    onSettled: () => {
      avatarPending.current = false;
      if (avatarObjectUrl.current) { URL.revokeObjectURL(avatarObjectUrl.current); avatarObjectUrl.current = ''; }
    }, retry: false,
  });

  const selectProfileImage = () => {
    if (avatarPending.current) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    // Attach before opening the picker so immediate selection cannot be missed.
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !active.current || avatarPending.current) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
        toast({ title: copy.error, description: avatarRequirements, variant: 'destructive' }); return;
      }
      avatarPending.current = true;
      if (avatarObjectUrl.current) URL.revokeObjectURL(avatarObjectUrl.current);
      avatarObjectUrl.current = URL.createObjectURL(file);
      setAvatarPreview(avatarObjectUrl.current);
      updateAvatarMutation.mutate(file);
    };
    input.click();
  };

  const onSubmit = (data: ProfileSettingsData) => {
    if (savePending.current) return;
    savePending.current = true; submittedDraft.current = form.getValues(); setSaveResult(null);
    updateProfileMutation.mutate(data);
  };
  const resetDraft = () => { form.reset(); setSaveResult(null); };
  const countryOptions = [...new Set([...(user?.location ? [user.location] : []), ...countries])];
  const avatar = avatarPreview || user?.avatar;
  const avatarName = user?.fullName || user?.username || copy.profile;
  const stats = [{ label: copy.followers, value: user?.followersCount, path: '/profile/followers' }, { label: copy.following, value: user?.followingCount, path: '/profile/following' }];

  const numberFormat = new Intl.NumberFormat(language);
  // The account API stores totalListeningTime in minutes.
  const listeningMinutes = user?.totalListeningTime;
  const listeningDuration = typeof listeningMinutes === 'number' && Number.isFinite(listeningMinutes)
    ? `${new Intl.NumberFormat(language, { style: 'unit', unit: 'hour', unitDisplay: 'short' }).format(Math.floor(Math.max(0, listeningMinutes) / 60))} ${new Intl.NumberFormat(language, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(Math.floor(Math.max(0, listeningMinutes) % 60))}`
    : '—';
  const favoriteCount = user?.favoriteStationsCount;

  return <div className="w-full min-w-0 px-2 pb-10 font-['Ubuntu',sans-serif] text-white sm:px-0" dir={language === 'ar' || language === 'he' ? 'rtl' : undefined}>
    <h1 className="text-2xl font-bold leading-8">{copy.profile}</h1>
    <RouteBreadcrumbs placement="content" />
    <section aria-label={copy.profile} className="mb-5 rounded-[10px] bg-[#151515] px-5 py-5 sm:px-[30px]">
      <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col items-center gap-4 text-center sm:flex-row sm:gap-8 sm:text-start">
          <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
            {avatar?.startsWith('blob:') ? <img width={96} height={96} src={avatar} alt={avatarName} className="h-full w-full rounded-full object-cover" /> : <PublicProfileAvatar profile={{ avatar }} name={avatarName} size={96} className="h-full w-full" />}
            <button type="button" onClick={selectProfileImage} disabled={updateAvatarMutation.isPending} aria-label={copy.changeAvatar} aria-describedby="profile-avatar-requirements" title={copy.changeAvatar} className="absolute -bottom-2 -end-2 flex h-11 w-11 items-center justify-center rounded-full text-[#151515] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199] disabled:opacity-60">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-[#151515] bg-white transition-colors hover:bg-[#ffcfe4]">
                {updateAvatarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
            </button>
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-2xl">{avatarName}</h2>
            <p className="mt-1 break-all text-sm text-[#a3a3a3]" dir="auto">{user?.email}</p>
            <p id="profile-avatar-requirements" className="sr-only">{avatarRequirements}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:justify-start sm:border-t sm:border-white/[0.06] sm:pt-5 xl:flex-nowrap xl:border-0 xl:pt-0">
          {stats.map(({ label, value, path }, index) => <Link key={path} href={getLocalizedUrl(path)} className={`group flex min-h-11 min-w-0 items-baseline gap-2 rounded-sm py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF4199] ${index ? 'border-s border-white/10 ps-5' : ''}`}>
            <span className="text-xl font-bold tabular-nums xl:text-2xl">{numberFormat.format(typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0)}</span>
            <span className="text-sm text-[#777] transition-colors group-hover:text-[#FF4199] sm:text-base xl:text-xl">{label}</span>
          </Link>)}
        </div>
      </div>
    </section>
    <section aria-label={copy.listening} className="mb-5 hidden min-w-0 items-center gap-10 rounded-[10px] bg-[#151515] px-[30px] py-6 sm:flex xl:mb-6">
      <img src="/icons/profile/listening-activity.svg" width={103} height={62} alt="" className="hidden h-[62px] w-[103px] shrink-0 sm:block" />
      <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-4 sm:gap-x-10">
        <div className="min-w-0"><dt className="text-sm text-[#969696]">{copy.listening}</dt><dd className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{listeningDuration}</dd></div>
        <div className="min-w-0"><dt className="text-sm text-[#969696]">{copy.savedStations}</dt><dd className="mt-1 text-lg font-bold tabular-nums sm:text-xl">{typeof favoriteCount === 'number' && Number.isFinite(favoriteCount) ? numberFormat.format(Math.max(0, Math.floor(favoriteCount))) : '—'}</dd></div>
      </dl>
    </section>
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 xl:space-y-6">
      <div className="grid min-w-0 items-stretch gap-5 md:grid-cols-2 xl:gap-[30px]">
        <section className={`${panelClass} min-h-[300px] md:min-h-[415px]`} aria-labelledby="profile-playback-title">
          <h2 id="profile-playback-title" className="mb-4 text-base font-bold">{copy.playback}</h2>
          <label htmlFor="is_autoplay_at_login" className="flex min-h-11 cursor-pointer items-center gap-4 text-sm">
            <Checkbox id="is_autoplay_at_login" checked={autoplay} onCheckedChange={checked => form.setValue('is_autoplay_at_login', checked === true, { shouldDirty: true })} aria-describedby="profile-autoplay-description" className="h-6 w-6 rounded-[5px] border-[#FF4199] data-[state=checked]:bg-[#FF4199] data-[state=checked]:text-white focus-visible:ring-[#FF4199]" />
            {copy.autoplay}
          </label>
          <p id="profile-autoplay-description" className="sr-only">{copy.autoplayHint}</p>
          <fieldset disabled={!autoplay} className="mt-2 space-y-1 border-t border-white/[0.08] pt-3 disabled:opacity-50">
            <legend className="sr-only">{copy.playback}</legend>
            {([{ value: 'LAST_PLAYED', label: copy.lastPlayed }, { value: 'RANDOM', label: copy.random }, { value: 'FAVORITE', label: copy.favorite }] as const).map(({ value, label }) => <label key={value} className={`flex min-h-12 items-center gap-4 text-sm ${autoplay ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <input className="h-6 w-6 shrink-0 appearance-none rounded-full border-2 border-[#FF4199] bg-transparent checked:border-[#FF4199] checked:bg-[#FF4199] checked:bg-none checked:shadow-[inset_0_0_0_3px_#151515] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FF4199]" value={value} type="radio" {...form.register('play_at_login')} />
              <span className="min-w-0">{label}</span>
            </label>)}
          </fieldset>
        </section>
        <section className={panelClass} aria-label={`${copy.country}, ${copy.language}`}>
          <div className="space-y-6">
            <div className="min-w-0">
              <Label htmlFor="profile-country" className="mb-3 block text-sm font-bold">{copy.country}</Label>
              <Select value={form.watch('country')} onValueChange={value => form.setValue('country', value, { shouldDirty: true })}>
                <SelectTrigger id="profile-country" className={inputClass}><SelectValue placeholder={copy.selectCountry} /></SelectTrigger>
                <SelectContent className="max-h-72 border-white/10 bg-[#202020] text-white">{countryOptions.map(country => <SelectItem key={country} value={country}>{getLocalizedCountryDisplayName(country, language)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="profile-language" className="mb-3 block text-sm font-bold">{copy.language}</Label>
              <Select value={form.watch('language')} onValueChange={value => form.setValue('language', value, { shouldDirty: true })}>
                <SelectTrigger id="profile-language" className={inputClass}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72 border-white/10 bg-[#202020] text-white">{languages.map(item => <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-8 flex items-start justify-between gap-4 border-t border-white/[0.08] pt-6">
            <div className="min-w-0">
              <Label htmlFor="profile-public" className="text-sm font-bold">{copy.publicProfile}</Label>
              <p id="profile-public-description" className="mt-2 text-sm leading-relaxed text-[#a3a3a3]">{copy.privacyHint}</p>
            </div>
            <Switch id="profile-public" aria-describedby="profile-public-description" checked={form.watch('is_public_profile')} onCheckedChange={checked => form.setValue('is_public_profile', checked, { shouldDirty: true })} className={switchClass} />
          </div>
        </section>
      </div>
      <section className={panelClass} aria-labelledby="profile-details-title">
        <h2 id="profile-details-title" className="mb-6 text-base font-bold">{copy.details}</h2>
        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor="profile-name" className="mb-3 block text-sm font-bold">{copy.name}</Label>
            <Input id="profile-name" autoComplete="name" className={inputClass} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'profile-name-error' : undefined} {...form.register('name')} />
            {errors.name && <p id="profile-name-error" role="alert" className="mt-2 text-sm text-[#ff91aa]">{errors.name.message}</p>}
          </div>
          <div className="min-w-0">
            <Label htmlFor="profile-email" className="mb-3 block text-sm font-bold">{copy.email}</Label>
            <Input id="profile-email" type="email" autoComplete="email" dir="ltr" className={inputClass} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'profile-email-error' : undefined} {...form.register('email')} />
            {errors.email && <p id="profile-email-error" role="alert" className="mt-2 text-sm text-[#ff91aa]">{errors.email.message}</p>}
          </div>
          <div className="min-w-0 md:col-span-2">
            <Label htmlFor="profile-password" className="mb-3 block text-sm font-bold">{copy.password}</Label>
            <Input id="profile-password" type="password" autoComplete="new-password" className={inputClass} aria-invalid={!!errors.password} aria-describedby={`profile-password-hint${errors.password ? ' profile-password-error' : ''}`} {...form.register('password')} />
            <p id="profile-password-hint" className="mt-2 text-xs leading-relaxed text-[#969696]">{copy.passwordHint}</p>
            {errors.password && <p id="profile-password-error" role="alert" className="mt-2 text-sm text-[#ff91aa]">{errors.password.message}</p>}
          </div>
        </div>
      </section>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p role={saveResult === 'error' ? 'alert' : 'status'} className={`flex min-w-0 items-center gap-2 text-sm ${saveResult === 'error' ? 'text-[#ff91aa]' : 'text-[#a3a3a3]'}`}>
          {saveResult === 'error' ? <><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{copy.saveFailed}</> : isDirty ? <><span className="h-2 w-2 shrink-0 rounded-full bg-[#FF4199]" aria-hidden="true" />{copy.unsaved}</> : saveResult === 'saved' ? <><Check className="h-4 w-4 shrink-0 text-[#FF4199]" aria-hidden="true" />{copy.saved}</> : null}
        </p>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          {isDirty && <Button type="button" variant="ghost" disabled={updateProfileMutation.isPending} onClick={resetDraft} className="h-auto min-h-11 whitespace-normal text-[#c4c4c4] hover:bg-white/5 hover:text-white">{copy.cancel}</Button>}
          <Button type="submit" disabled={updateProfileMutation.isPending || !isDirty} className="h-auto min-h-12 whitespace-normal rounded-lg bg-[#FF4199] px-6 py-3 font-bold text-white hover:bg-[#ff73b3] focus-visible:ring-[#FF4199] disabled:opacity-40">
            {updateProfileMutation.isPending && <Loader2 className="me-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}{updateProfileMutation.isPending ? copy.saving : copy.save}
          </Button>
        </div>
      </div>
    </form>
    <div className="mt-6"><ProfileSettingsNotifications copy={copy} /></div>
    {user?.subscription?.plan && user.subscription.plan !== 'none' && <div className={`mt-6 ${panelClass}`}><ManageSubscriptionButton /></div>}
  </div>;
}

export default function ProfileSettings() {
  return <ProtectedRoute><SettingsContent /></ProtectedRoute>;
}
