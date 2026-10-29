import { getLanguageFromPath, ACTIVE_SITEMAP_LANGUAGES } from '@workspace/seo-shared/seo-config';
import { reverseTranslateUrl } from '@workspace/seo-shared/url-translations';

export const MEGARADIO_GTM_ID = 'GTM-WRF32ZCN';

interface GoogleConsentApi {
  callbackQueue?: { push(callback: Record<string, () => void>): unknown };
  getGoogleConsentModeValues?: () => { analyticsStoragePurposeConsentStatus?: number };
}
type GoogleWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  googlefc?: GoogleConsentApi;
  __tcfapi?: (command: string, version: number, callback: (data: { eventStatus?: string }, success: boolean) => void) => void;
  __MEGARADIO_GOOGLE_ALLOWED__?: () => boolean;
};

/** Only public content paths; account routes and query/fragment values never
 * become measurement dimensions. This is not an authentication boundary. */
export function publicMeasurementUrl(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return null;
    if ([...url.searchParams.keys()].some(key => /token|password|email|oauth|^code$/i.test(key))) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (!ACTIVE_SITEMAP_LANGUAGES.some(language => language === parts[0])) return null;
    const { cleanPath, language } = getLanguageFromPath(url.pathname);
    const path = reverseTranslateUrl(cleanPath, language);
    if (!/^\/(?:about|contact|applications|privacy-policy|terms-and-conditions|faq)?$/.test(path)
      && !/^\/(?:blog|station|stations|genres|regions)(?:\/[\p{L}\p{N}_.%-]+)*$/u.test(path)) return null;
    return `${origin}${url.pathname}`;
  } catch { return null; }
}

const GOOGLE_EVENTS = new Set([
  'station_play', 'genre_play', 'country_play', 'station_favorite_add',
  'station_favorite_remove', 'listening_time', 'search',
]);

export function createGoogleTagManager(options: {
  host: Window; document: Document; enabled: boolean; containerId: string; measurementId: string;
}) {
  const host = options.host as GoogleWindow;
  const doc = options.document;
  const configured = options.enabled && /^GTM-[A-Z0-9]+$/.test(options.containerId)
    && /^G-[A-Z0-9]+$/.test(options.measurementId);
  let initialized = false;
  let ready = false;
  let started = false;
  let locked = false;
  let lastPage: string | null = null;
  let tcfRegistered = false;
  const disableGoogle = (disabled: boolean) => {
    if (/^G-[A-Z0-9]+$/.test(options.measurementId)) {
      (host as unknown as Record<string, unknown>)[`ga-disable-${options.measurementId}`] = disabled;
    }
  };
  const suspend = () => { locked = true; disableGoogle(true); };
  const allowed = () => {
    if (!configured || !ready || locked) return false;
    try {
      const path = publicMeasurementUrl(host.location.href, host.location.origin);
      const consent = host.googlefc?.getGoogleConsentModeValues?.().analyticsStoragePurposeConsentStatus;
      if (!path || (consent !== 1 && consent !== 3)) {
        if (started) suspend();
        return false;
      }
      return true;
    } catch { if (started) suspend(); return false; }
  };
  const push = (value: Record<string, unknown>) => host.dataLayer?.push(value);
  const pageView = () => {
    if (!started || !allowed()) return;
    const page = publicMeasurementUrl(host.location.href, host.location.origin)!;
    if (page === lastPage) return;
    const referrer = lastPage || publicMeasurementUrl(doc.referrer, host.location.origin) || '';
    lastPage = page;
    push({ event: 'megaradio_page_view', page_location: page, page_referrer: referrer });
  };
  const start = () => {
    if (started || !allowed()) return;
    try {
    started = true;
    disableGoogle(false);
    // Safe defaults must already exist when GTM initialization tags execute.
    push({ page_location: publicMeasurementUrl(host.location.href, host.location.origin),
      page_referrer: publicMeasurementUrl(doc.referrer, host.location.origin) || '' });
    push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = doc.createElement('script');
    script.id = 'megaradio-gtm';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${options.containerId}`;
    doc.head.appendChild(script);
    pageView();
    } catch { suspend(); }
  };
  const initialize = () => {
    if (!configured || initialized || locked) return;
    if (!publicMeasurementUrl(host.location.href, host.location.origin)) return;
    initialized = true;
    try {
    disableGoogle(true);
    host.__MEGARADIO_GOOGLE_ALLOWED__ = allowed;
    host.dataLayer ||= [];
    host.gtag ||= function () { host.dataLayer!.push(arguments); };
    // Before React mounts AdSense. The CMP owns subsequent changes; analytics
    // consent must never imply advertising consent.
    host.gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    const api = host.googlefc ||= {};
    api.callbackQueue ||= [];
    const registerTcf = () => {
      if (tcfRegistered || typeof host.__tcfapi !== 'function') return;
      tcfRegistered = true;
      try {
        host.__tcfapi('addEventListener', 2, (data, success) => {
          if (started && (!success || data?.eventStatus === 'cmpuishown' || data?.eventStatus === 'useractioncomplete')) suspend();
        });
      } catch { suspend(); }
    };
    registerTcf();
    api.callbackQueue.push({ CONSENT_API_READY: registerTcf });
    api.callbackQueue.push({ CONSENT_MODE_DATA_READY: () => {
      ready = true;
      start();
    } });
    } catch { suspend(); }
  };
  return {
    initialize, suspend,
    pageView: () => { initialize(); start(); pageView(); },
    event: (name: string, value?: number) => {
      // Drop pre-consent events; never queue callbacks with historical payloads.
      if (!started || !GOOGLE_EVENTS.has(name) || !allowed()) return;
      push({ event: 'megaradio_event', event_name: name,
        ...(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9 ? { value } : {}) });
    },
  };
}

// Separate activation gate: an owned container is not a verified GA4 setup.
// Disabled mode never falls back to the old consent-unaware gtag.js loader.
const runtime = typeof window === 'undefined' ? undefined : createGoogleTagManager({
  host: window, document,
  enabled: import.meta.env.VITE_GTM_ENABLED === 'true',
  containerId: import.meta.env.VITE_GTM_CONTAINER_ID ?? MEGARADIO_GTM_ID,
  measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID || '',
});
export const initializeGoogleTagManager = () => runtime?.initialize();
export const suspendGoogleMeasurement = () => runtime?.suspend();
export const googlePageView = () => runtime?.pageView();
export const googleEvent = (name: string, value?: number) => runtime?.event(name, value);
