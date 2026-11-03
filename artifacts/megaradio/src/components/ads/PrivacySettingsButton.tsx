import { lazy, Suspense, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { isGoogleMeasurementConfigured, isGoogleMeasurementLocked, publicMeasurementUrl, suspendGoogleMeasurement } from '@/lib/google-tag-manager';
import { getWebAnalyticsConsent, setWebAnalyticsConsent, subscribeWebAnalyticsConsent } from '@/lib/web-analytics-consent';
import { getWebAnalyticsCopy, WEB_ANALYTICS_COPY } from '@/lib/web-analytics-copy';

const PrivacySettingsDialog = lazy(() => import('./PrivacySettingsDialog'));
const getServerConsent = () => 'unknown' as const;
const settingsClass = 'inline-flex min-w-0 items-center min-h-[44px] md:min-h-[30px] text-start bg-transparent border-0 p-0 m-0 cursor-pointer text-xs sm:text-sm text-gray-100 hover:text-[#FF4199] transition-colors [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199] rounded-sm';
const choiceClass = 'inline-flex min-h-11 min-w-0 items-center justify-center rounded-md border border-white/30 bg-transparent px-4 py-2 text-sm font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4199] [overflow-wrap:anywhere]';

export const PRIVACY_SETTINGS_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(WEB_ANALYTICS_COPY).map(([language, copy]) => [language, copy.privacySettings])),
);

interface ConsentApi {
  callbackQueue?: { push(callback: (() => void) | { CONSENT_API_READY: () => void } | { CONSENT_DATA_READY: () => void }): unknown };
  showRevocationMessage?: () => void;
}
type ConsentWindow = Window & { googlefc?: ConsentApi };

function useConsentApiReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const host = window as ConsentWindow;
    const api = host.googlefc ||= {};
    api.callbackQueue ||= [];
    const updateReady = () => {
      if (mounted) setReady(typeof host.googlefc?.showRevocationMessage === 'function');
    };
    // Google can register revocation after its framework API becomes callable.
    // Check both documented lifecycle phases, including an already-loaded SDK.
    updateReady();
    api.callbackQueue.push({ CONSENT_API_READY: updateReady });
    api.callbackQueue.push({ CONSENT_DATA_READY: updateReady });
    return () => { mounted = false; };
  }, []);
  return ready;
}

function openAdvertisingSettings() {
  suspendGoogleMeasurement();
  const api = (window as ConsentWindow).googlefc;
  // Preserve Google's supported queue and suspend before the explicit action.
  if (typeof api?.showRevocationMessage === 'function') {
    api.callbackQueue?.push({ CONSENT_API_READY: () => (window as ConsentWindow).googlefc?.showRevocationMessage?.() });
  }
}

function PrivacySettingsAction({ language, compact = false, renderTrigger }: {
  language: string;
  compact?: boolean;
  renderTrigger?: (trigger: ReactNode) => ReactNode;
}) {
  const ready = useConsentApiReady();
  const choice = useSyncExternalStore(subscribeWebAnalyticsConsent, getWebAnalyticsConsent, getServerConsent);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copy = getWebAnalyticsCopy(language);
  const configured = isGoogleMeasurementConfigured();

  if (!configured && !ready) return null;
  const trigger = <button type="button" ref={triggerRef} data-testid={compact ? 'web-analytics-settings' : 'privacy-settings'}
      id={compact ? undefined : 'footer-privacy-settings'}
      lang={language} dir={copy.direction} className={settingsClass}
      aria-haspopup="dialog" aria-expanded={configured ? open : undefined}
      onClick={() => configured ? setOpen(true) : openAdvertisingSettings()}>
      {compact ? copy.settings : copy.privacySettings}
    </button>;
  return <>
    {renderTrigger ? renderTrigger(trigger) : trigger}
    {!compact && configured && choice === 'granted' && isGoogleMeasurementLocked() && (
      <p role="status" lang={language} dir={copy.direction} className="text-start text-xs leading-5 text-[#c5c5cb] [overflow-wrap:anywhere]">{copy.nextLoad}</p>
    )}
    {open && <Suspense fallback={null}>
      <PrivacySettingsDialog language={language} onOpenChange={setOpen}
        onCloseAutoFocus={() => (triggerRef.current ?? document.getElementById('footer-privacy-settings'))?.focus()}
        onAdvertisingSettings={ready ? openAdvertisingSettings : undefined} />
    </Suspense>}
  </>;
}

/** Available independently of the advertising CMP whenever Google is configured. */
export default function PrivacySettingsButton({ language }: { language: string }) {
  return <PrivacySettingsAction language={language} />;
}

/** Inline footer content only; no first-visit overlay or automatic dialog. */
export function WebAnalyticsConsentNotice({ language }: { language: string }) {
  const choice = useSyncExternalStore(subscribeWebAnalyticsConsent, getWebAnalyticsConsent, getServerConsent);
  const [saveFailed, setSaveFailed] = useState(false);
  const titleId = useId();
  const copy = getWebAnalyticsCopy(language);
  if (!isGoogleMeasurementConfigured()
    || publicMeasurementUrl(window.location.href, window.location.origin) === null) return null;

  const choose = (value: 'granted' | 'denied') => {
    setSaveFailed(!setWebAnalyticsConsent(value));
    document.getElementById('footer-privacy-settings')?.focus();
  };
  // Keep the explicit dialog mounted if a failed save changes the store to denied.
  return <PrivacySettingsAction language={language} compact renderTrigger={settings => choice !== 'unknown' ? (
    saveFailed ? <div lang={language} dir={copy.direction} className="w-full border-b border-white/10 bg-black/40">
      <div className="container mx-auto py-4 text-start text-sm leading-5">
        <p role="alert" className="text-[#ff9fc8]">{copy.saveError}</p>
        <span onClick={() => setSaveFailed(false)}>{settings}</span>
      </div>
    </div> : null
  ) : <section aria-labelledby={titleId} lang={language} dir={copy.direction}
    data-testid="web-analytics-notice" className="w-full border-b border-white/10 bg-black/40">
    <div className="container mx-auto flex min-w-0 flex-col gap-3 py-4 text-start lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="min-w-0 text-sm leading-5 text-[#c5c5cb] [overflow-wrap:anywhere]">
        <h2 id={titleId} className="text-sm font-medium text-white">{copy.noticeTitle}</h2>
        <p className="mt-1">{copy.noticeDescription}</p>
        {saveFailed && <p role="alert" className="mt-2 text-[#ff9fc8]">{copy.saveError}</p>}
      </div>
      <div className="flex min-w-0 flex-col items-stretch gap-2 lg:w-96 lg:shrink-0">
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <button type="button" className={choiceClass} onClick={() => choose('granted')}>{copy.allow}</button>
          <button type="button" className={choiceClass} onClick={() => choose('denied')}>{copy.continueWithout}</button>
        </div>
        {settings}
      </div>
    </div>
  </section>} />;
}
