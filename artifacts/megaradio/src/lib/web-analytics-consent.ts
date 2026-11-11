export type WebAnalyticsConsent = 'unknown' | 'denied' | 'granted';

export const WEB_ANALYTICS_CONSENT_KEY = 'megaradio:web-analytics-consent:v1';
export const WEB_ANALYTICS_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

type Choice = Exclude<WebAnalyticsConsent, 'unknown'>;
type ConsentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface WebAnalyticsConsentSource {
  get(): WebAnalyticsConsent;
  subscribe(listener: () => void): () => void;
}

export function createWebAnalyticsConsentStore(options: {
  host?: Window;
  storage?: () => ConsentStorage;
  now?: () => number;
} = {}) {
  const host = options.host;
  const storage = options.storage ?? (() => {
    if (!host) throw new Error('Storage unavailable');
    return host.localStorage;
  });
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let forcedDenied = false;
  let revoking = false;
  let snapshot: WebAnalyticsConsent = 'unknown';
  let probeKey: string | undefined;
  let timer: number | undefined;

  const notify = () => {
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* One subscriber must not prevent revocation. */ }
    }
  };
  const clearTimer = () => {
    if (timer !== undefined) host?.clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (remaining: number) => {
    clearTimer();
    if (host && listeners.size && remaining > 0) {
      timer = host.setTimeout(refresh, Math.min(remaining, MAX_TIMEOUT_MS));
    }
  };
  const get = (): WebAnalyticsConsent => {
    clearTimer();
    if (forcedDenied) return 'denied';
    try {
      const db = storage();
      const raw = db.getItem(WEB_ANALYTICS_CONSENT_KEY);
      if (raw === null) return 'unknown';
      const record: unknown = JSON.parse(raw);
      if (!record || typeof record !== 'object' || Array.isArray(record)) return 'unknown';
      const { version, choice, updatedAt } = record as Record<string, unknown>;
      const time = now();
      if (version !== 1 || (choice !== 'granted' && choice !== 'denied')
        || typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0
        || !Number.isSafeInteger(time) || time < updatedAt
        || time - updatedAt >= WEB_ANALYTICS_CONSENT_MAX_AGE_MS) return 'unknown';
      if (choice === 'granted') {
        // Each store owns its ephemeral probe, without rewriting the consent record.
        probeKey ||= `${WEB_ANALYTICS_CONSENT_KEY}:probe:${(host?.crypto ?? globalThis.crypto).getRandomValues(new Uint32Array(4)).join('-')}`;
        let cleanupFailed = false;
        try {
          db.setItem(probeKey, '1');
          if (db.getItem(probeKey) !== '1') throw new Error('Storage read-back failed');
        } finally {
          try { db.removeItem(probeKey); } catch { cleanupFailed = true; }
        }
        if (cleanupFailed || db.getItem(WEB_ANALYTICS_CONSENT_KEY) !== raw) throw new Error('Consent verification failed');
      }
      schedule(WEB_ANALYTICS_CONSENT_MAX_AGE_MS - (time - updatedAt));
      return choice;
    } catch {
      forcedDenied = true;
      return 'denied';
    }
  };
  function refresh() {
    const next = get();
    if (next !== snapshot) {
      snapshot = next;
      notify();
    }
  }
  const set = (choice: Choice): boolean => {
    if ((choice !== 'granted' && choice !== 'denied') || revoking) return false;
    if (choice === 'denied') {
      revoking = true;
      forcedDenied = true;
      clearTimer();
      snapshot = 'denied';
      // Lock measurement synchronously, before even accessing localStorage.
      notify();
    }
    try {
      const updatedAt = now();
      if (!Number.isSafeInteger(updatedAt) || updatedAt < 0) throw new Error('Invalid clock');
      const raw = JSON.stringify({ version: 1, choice, updatedAt });
      const db = storage();
      db.setItem(WEB_ANALYTICS_CONSENT_KEY, raw);
      if (db.getItem(WEB_ANALYTICS_CONSENT_KEY) !== raw) throw new Error('Consent read-back failed');
      forcedDenied = false;
      refresh();
      return !forcedDenied;
    } catch {
      forcedDenied = true;
      clearTimer();
      snapshot = 'denied';
      notify();
      // This document stays denied. If persistence failed, an old saved grant
      // can still revive in a future document when storage becomes available.
      return false;
    } finally {
      revoking = false;
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== WEB_ANALYTICS_CONSENT_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== storage()) return;
    } catch { forcedDenied = true; }
    refresh();
  };
  const subscribe = (listener: () => void) => {
    const first = !listeners.size;
    if (first) {
      host?.addEventListener('storage', onStorage);
      host?.document.addEventListener('visibilitychange', refresh);
    }
    listeners.add(listener);
    // Later subscribers must not hide changes from existing measurement listeners.
    if (first) snapshot = get();
    else refresh();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        clearTimer();
        host?.removeEventListener('storage', onStorage);
        host?.document.removeEventListener('visibilitychange', refresh);
      }
    };
  };
  return { get, set, subscribe };
}

const store = createWebAnalyticsConsentStore({ host: typeof window === 'undefined' ? undefined : window });
export const getWebAnalyticsConsent = (): WebAnalyticsConsent => store.get();
export const setWebAnalyticsConsent = (choice: 'granted' | 'denied'): boolean => store.set(choice);
export const subscribeWebAnalyticsConsent = (listener: () => void): (() => void) => store.subscribe(listener);
