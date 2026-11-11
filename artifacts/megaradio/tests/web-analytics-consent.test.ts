import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createWebAnalyticsConsentStore, getWebAnalyticsConsent, setWebAnalyticsConsent, subscribeWebAnalyticsConsent,
  WEB_ANALYTICS_CONSENT_KEY as KEY, WEB_ANALYTICS_CONSENT_MAX_AGE_MS as TTL,
  type WebAnalyticsConsent,
} from '../src/lib/web-analytics-consent';

const TIME = Date.UTC(2026, 10, 3);
const record = (choice: 'granted' | 'denied' = 'granted', updatedAt = TIME) => JSON.stringify({version:1,choice,updatedAt});
let data: Map<string, string>;
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let store: ReturnType<typeof createWebAnalyticsConsentStore>;
const unsubscribers: (() => void)[] = [];
const subscribe = (listener: () => void) => {
  const unsubscribe = store.subscribe(listener); unsubscribers.push(unsubscribe); return unsubscribe;
};
const storageEvent = (key: string | null = KEY) => window.dispatchEvent(new StorageEvent('storage', {key}));

beforeEach(() => {
  vi.useFakeTimers({now:TIME});
  data = new Map();
  storage = {
    getItem: vi.fn(key => data.get(key) ?? null),
    setItem: vi.fn((key, value) => { data.set(key, value); }),
    removeItem: vi.fn(key => { data.delete(key); }),
  };
  store = createWebAnalyticsConsentStore({host:window,storage:() => storage});
});
afterEach(() => {
  unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
  vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear();
});

it('exposes the exact public contract and is unknown without a saved choice', () => {
  localStorage.clear();
  const listener = vi.fn(); const unsubscribe = subscribeWebAnalyticsConsent(listener);
  const initial: WebAnalyticsConsent = getWebAnalyticsConsent();
  expect(initial).toBe('unknown');
  expect(setWebAnalyticsConsent('granted')).toBe(true);
  expect(getWebAnalyticsConsent()).toBe('granted');
  expect(setWebAnalyticsConsent('denied')).toBe(true);
  expect(getWebAnalyticsConsent()).toBe('denied');
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it.each(['granted', 'denied'] as const)('saves a versioned %s choice and verifies read-back', choice => {
  expect(store.set(choice)).toBe(true);
  expect(data.get(KEY)).toBe(record(choice));
  expect(storage.getItem).toHaveBeenCalledWith(KEY);
  expect(store.get()).toBe(choice);
});

it.each([
  'null', '[]', '{}', 'malformed', '"granted"',
  JSON.stringify({version:2,choice:'granted',updatedAt:TIME}),
  JSON.stringify({version:1,choice:'unknown',updatedAt:TIME}),
  JSON.stringify({version:1,choice:true,updatedAt:TIME}),
  JSON.stringify({version:1,choice:'granted',updatedAt:String(TIME)}),
  record('granted', -1), record('granted', TIME + 1), record('granted', TIME + 0.5),
  record('granted', TIME - TTL), record('granted', TIME - TTL - 1),
])('fails closed for malformed, unsupported, future or expired data: %s', raw => {
  data.set(KEY, raw);
  expect(store.get()).not.toBe('granted');
});

it('never renews updatedAt when probing a stored grant', () => {
  const raw = record('granted', TIME - TTL + 10);
  data.set(KEY, raw);
  expect(store.get()).toBe('granted');
  vi.advanceTimersByTime(9); expect(store.get()).toBe('granted');
  expect(data.get(KEY)).toBe(raw);
  expect(vi.mocked(storage.setItem).mock.calls.every(([key]) => key !== KEY)).toBe(true);
  vi.advanceTimersByTime(1); expect(store.get()).not.toBe('granted');
});

it('does not overwrite a concurrent denial during a stored-grant probe', () => {
  data.set(KEY, record());
  vi.mocked(storage.setItem).mockImplementation((key, value) => {
    data.set(key, value);
    if (key !== KEY) data.set(KEY, record('denied'));
  });
  expect(store.get()).not.toBe('granted');
  expect(data.get(KEY)).toBe(record('denied'));
});

it('isolates two interleaved stores so one probe cleanup cannot revoke the other grant', () => {
  data.set(KEY, record());
  const other = createWebAnalyticsConsentStore({host:window,storage:() => storage});
  let interleaved = false;
  let otherChoice: WebAnalyticsConsent | undefined;
  let activeKeys: string[] = [];
  vi.mocked(storage.setItem).mockImplementation((key, value) => {
    data.set(key, value);
    if (key !== KEY && !interleaved) {
      interleaved = true;
      otherChoice = other.get();
    } else if (key !== KEY) {
      activeKeys = [...data.keys()].filter(key => key !== KEY);
    }
  });
  expect(store.get()).toBe('granted'); expect(otherChoice).toBe('granted');
  expect(activeKeys).toHaveLength(2); expect(new Set(activeKeys).size).toBe(2);
  expect(activeKeys.every(key => key.startsWith(`${KEY}:probe:`))).toBe(true);
  expect([...data.entries()]).toEqual([[KEY, record()]]);
  expect(vi.mocked(storage.removeItem).mock.calls.map(([key]) => key).sort()).toEqual([...activeKeys].sort());
});

it('cleans up a failed interleaved store probe without deleting the other active probe', () => {
  data.set(KEY, record());
  const other = createWebAnalyticsConsentStore({host:window,storage:() => storage});
  let outerKey: string | undefined;
  let failedKey: string | undefined;
  let otherChoice: WebAnalyticsConsent | undefined;
  vi.mocked(storage.setItem).mockImplementation((key, value) => {
    data.set(key, value);
    if (!outerKey) {
      outerKey = key;
      otherChoice = other.get();
    } else {
      failedKey = key;
      throw new Error('Inner probe failed after write');
    }
  });
  expect(store.get()).toBe('granted'); expect(otherChoice).toBe('denied');
  expect(failedKey).not.toBe(outerKey);
  expect(storage.removeItem).toHaveBeenCalledWith(failedKey);
  expect(storage.removeItem).toHaveBeenCalledWith(outerKey);
  expect([...data.entries()]).toEqual([[KEY, record()]]);
});

it.each(['write', 'read', 'mismatch'])('attempts finally cleanup after a probe %s failure without changing consent', failure => {
  data.set(KEY, record());
  vi.mocked(storage.setItem).mockImplementation((key, value) => {
    data.set(key, value);
    if (failure === 'write') throw new Error('Failed after write');
  });
  vi.mocked(storage.getItem).mockImplementation(key => {
    if (key === KEY) return data.get(key) ?? null;
    if (failure === 'read') throw new Error('Probe read failed');
    return null;
  });
  expect(store.get()).toBe('denied');
  expect(storage.removeItem).toHaveBeenCalledOnce();
  expect(vi.mocked(storage.removeItem).mock.calls[0][0]).toMatch(new RegExp(`^${KEY}:probe:`));
  expect([...data.entries()]).toEqual([[KEY, record()]]);
});

it.each(['getItem', 'setItem', 'removeItem'] as const)('fails closed if a stored-grant %s probe fails', method => {
  data.set(KEY, record());
  vi.mocked(storage[method]).mockImplementation(() => { throw new Error('Storage blocked'); });
  expect(() => store.get()).not.toThrow();
  expect(store.get()).toBe('denied');
});

it('fails closed when the storage getter is unavailable, including SSR', () => {
  const unavailable = createWebAnalyticsConsentStore({storage:() => {throw new Error('SecurityError');}});
  expect(unavailable.get()).not.toBe('granted');
  expect(unavailable.set('granted')).toBe(false);
  const server = createWebAnalyticsConsentStore();
  expect(server.get()).not.toBe('granted'); expect(server.set('granted')).toBe(false);
});

it.each(['granted', 'denied'] as const)('never reports a failed %s write as saved', choice => {
  vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('QuotaExceededError'); });
  expect(store.set(choice)).toBe(false); expect(store.get()).toBe('denied');
});

it.each(['missing', 'mismatch', 'throw'] as const)('requires exact grant read-back: %s', failure => {
  vi.mocked(storage.getItem).mockImplementation(() => {
    if (failure === 'throw') throw new Error('SecurityError');
    return failure === 'missing' ? null : record('denied');
  });
  expect(store.set('granted')).toBe(false); expect(store.get()).toBe('denied');
});

it('notifies denial synchronously before accessing storage, even if persistence fails', () => {
  expect(store.set('granted')).toBe(true);
  const access = vi.fn(() => storage);
  store = createWebAnalyticsConsentStore({host:window,storage:access});
  const order: string[] = [];
  const observed: unknown[] = [];
  subscribe(() => {
    order.push('notify');
    observed.push([store.get(), data.get(KEY), access.mock.calls.length]);
  });
  access.mockClear();
  vi.mocked(storage.setItem).mockImplementation(() => { order.push('write'); throw new Error('Blocked'); });
  expect(store.set('denied')).toBe(false);
  expect(order.slice(0, 2)).toEqual(['notify', 'write']);
  expect(observed[0]).toEqual(['denied', record(), 0]);
  expect(store.get()).toBe('denied');
});

it('does not let a throwing subscriber suppress other synchronous revocations', () => {
  subscribe(() => { throw new Error('Broken subscriber'); });
  const listener = vi.fn(() => store.get());
  subscribe(listener);
  expect(store.set('denied')).toBe(true); expect(listener).toHaveBeenCalledOnce();
  expect(listener.mock.results[0].value).toBe('denied');
});

it('cannot regrant or recursively save inside the synchronous denial notification', () => {
  expect(store.set('granted')).toBe(true);
  const attempts: unknown[] = [];
  subscribe(() => { attempts.push([store.set('granted'), store.set('denied'), store.get()]); });
  expect(store.set('denied')).toBe(true);
  expect(attempts).toEqual([[false, false, 'denied']]);
  expect(store.get()).toBe('denied'); expect(data.get(KEY)).toBe(record('denied'));
});

it('documents the persistence limit: failed denial stays denied here but an old grant may survive a new document', () => {
  data.set(KEY, record());
  const original = storage.setItem;
  storage.setItem = () => { throw new Error('Blocked'); };
  expect(store.set('denied')).toBe(false);
  storage.setItem = original;
  expect(store.get()).toBe('denied');
  const nextDocument = createWebAnalyticsConsentStore({storage:() => storage});
  expect(nextDocument.get()).toBe('granted');
});

it('can save a later explicit regrant after a transient persistence failure', () => {
  const original = storage.setItem;
  storage.setItem = () => { throw new Error('Blocked'); };
  expect(store.set('granted')).toBe(false);
  storage.setItem = original;
  expect(store.set('granted')).toBe(true); expect(store.get()).toBe('granted');
});

it.each([KEY, null])('observes cross-tab removal and clear, reading storage rather than trusting event payload: %s', key => {
  data.set(KEY, record());
  const listener = vi.fn(); subscribe(listener);
  data.delete(KEY);
  window.dispatchEvent(new StorageEvent('storage', {key,newValue:record()}));
  expect(store.get()).toBe('unknown'); expect(listener).toHaveBeenCalledOnce();
});

it('observes cross-tab denial and grant without echoing unrelated storage changes', () => {
  const listener = vi.fn(); subscribe(listener);
  data.set(KEY, record()); storageEvent(); expect(store.get()).toBe('granted');
  data.set(KEY, record('denied')); storageEvent(); expect(store.get()).toBe('denied');
  storageEvent('auth');
  window.dispatchEvent(new StorageEvent('storage', {key:KEY,storageArea:sessionStorage}));
  expect(listener).toHaveBeenCalledTimes(2);
});

it.each(['denied', 'removed', 'expired'])('does not let a new subscriber mask an existing listener grant-to-%s transition', change => {
  data.set(KEY, record());
  const existing = vi.fn(() => store.get()); subscribe(existing);
  if (change === 'removed') data.delete(KEY);
  else data.set(KEY, change === 'denied' ? record('denied') : record('granted', TIME - TTL));
  const added = vi.fn(); subscribe(added);
  expect(existing).toHaveBeenCalledOnce();
  expect(existing.mock.results[0].value).toBe(change === 'denied' ? 'denied' : 'unknown');
  expect(added).toHaveBeenCalledOnce();
  storageEvent(change === 'removed' ? null : KEY);
  expect(existing).toHaveBeenCalledOnce(); expect(added).toHaveBeenCalledOnce();
});

it('checks expiry on visibility restoration and every read', () => {
  data.set(KEY, record()); const listener = vi.fn(); subscribe(listener);
  vi.setSystemTime(TIME + TTL);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(listener).toHaveBeenCalledOnce(); expect(store.get()).not.toBe('granted');
});

it('expires idle grants with bounded, clamped timers and cleans up subscriptions', () => {
  data.set(KEY, record());
  const timeout = vi.spyOn(window, 'setTimeout');
  const listener = vi.fn(); const unsubscribe = subscribe(listener);
  vi.advanceTimersByTime(TTL - 1); expect(store.get()).toBe('granted');
  expect(timeout.mock.calls.every(([, delay]) => Number(delay) <= 2_147_483_647)).toBe(true);
  vi.advanceTimersByTime(1); expect(store.get()).not.toBe('granted'); expect(listener).toHaveBeenCalledOnce();
  unsubscribe(); expect(vi.getTimerCount()).toBe(0);
  data.set(KEY, record('denied', Date.now())); storageEvent();
  document.dispatchEvent(new Event('visibilitychange')); expect(listener).toHaveBeenCalledOnce();
});

it('rejects invalid runtime choices and invalid clocks without granting', () => {
  expect(store.set('unknown' as 'granted')).toBe(false);
  const invalidClock = createWebAnalyticsConsentStore({storage:() => storage,now:() => NaN});
  expect(invalidClock.set('granted')).toBe(false); expect(invalidClock.get()).not.toBe('granted');
});
