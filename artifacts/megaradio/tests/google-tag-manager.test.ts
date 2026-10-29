import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGoogleTagManager, publicMeasurementUrl, MEGARADIO_GTM_ID } from '../src/lib/google-tag-manager';

const host = window as any;
let status: number | undefined;
let callbacks: Record<string, () => void>[];
let tcf: ((data: {eventStatus?: string}, success: boolean) => void) | undefined;
const scriptCount = () => document.querySelectorAll('script[src*="googletagmanager"]').length;
const events = (type: string) => (host.dataLayer || []).filter((item: any) => item.event === type);
const consentReady = () => callbacks.find(item => item.CONSENT_MODE_DATA_READY)!.CONSENT_MODE_DATA_READY();
const create = (overrides = {}) => createGoogleTagManager({host: window, document, enabled: true,
  containerId: MEGARADIO_GTM_ID, measurementId: 'G-TEST12345', ...overrides});
beforeEach(() => {
  window.history.replaceState({}, '', '/tr/faq');
  status = 1; callbacks = []; tcf = undefined;
  host.googlefc = { callbackQueue: callbacks, getGoogleConsentModeValues: () => ({analyticsStoragePurposeConsentStatus: status}) };
  host.__tcfapi = vi.fn((_cmd, _version, callback) => { tcf = callback; });
  document.querySelectorAll('script[src*="googletagmanager"]').forEach(node => node.remove());
});
afterEach(() => {
  for (const key of ['dataLayer','gtag','googlefc','__tcfapi','__MEGARADIO_GOOGLE_ALLOWED__','ga-disable-G-TEST12345']) delete host[key];
  document.querySelectorAll('script[src*="googletagmanager"]').forEach(node => node.remove());
  vi.restoreAllMocks();
});

it.each([
  {enabled: false}, {containerId: ''}, {containerId: 'G-OTHER'}, {containerId: 'GTM-X&evil=1'},
  {measurementId: ''}, {measurementId: 'AW-12345'},
])('does nothing for disabled or invalid release configuration: %j', config => {
  const runtime = create(config); runtime.initialize(); runtime.pageView(); runtime.event('station_play');
  expect(scriptCount()).toBe(0); expect(host.dataLayer).toBeUndefined(); expect(callbacks).toHaveLength(0);
});

it('registers once and places denied defaults before any container or event', () => {
  const existing = {event: 'existing'};
  host.dataLayer = [existing];
  const runtime = create(); runtime.initialize(); runtime.initialize(); runtime.pageView();
  expect(host.dataLayer[0]).toBe(existing);
  expect(Array.from(host.dataLayer[1])).toEqual(['consent','default',{
    analytics_storage:'denied', ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied',
  }]);
  expect(scriptCount()).toBe(0); expect(callbacks).toHaveLength(2);
  expect(host['ga-disable-G-TEST12345']).toBe(true);
  consentReady(); runtime.initialize(); consentReady(); runtime.pageView();
  expect(scriptCount()).toBe(1);
  const script = document.getElementById('megaradio-gtm') as HTMLScriptElement;
  expect(script.src).toBe(`https://www.googletagmanager.com/gtm.js?id=${MEGARADIO_GTM_ID}`);
  expect(script.type).not.toBe('text/partytown');
  expect(events('gtm.js')).toHaveLength(1); expect(events('megaradio_page_view')).toHaveLength(1);
  expect(host['ga-disable-G-TEST12345']).toBe(false);
});

it.each([0,2,4,undefined,5,NaN])('blocks unknown, denied and unconfigured CMP values: %s', value => {
  status = value; const runtime = create(); runtime.initialize(); consentReady(); runtime.pageView(); runtime.event('station_play');
  expect(scriptCount()).toBe(0); expect(events('megaradio_page_view')).toHaveLength(0); expect(events('megaradio_event')).toHaveLength(0);
});

it.each([1,3])('accepts explicit granted or not-applicable state %s without granting Ads', value => {
  status = value; const runtime = create(); runtime.initialize(); consentReady();
  expect(scriptCount()).toBe(1);
  expect(host.dataLayer.some((item: any) => item[0] === 'consent' && item[1] === 'update')).toBe(false);
});

it('does not infer consent when the CMP is missing or throws', () => {
  delete host.googlefc;
  const runtime = create(); runtime.initialize();
  host.googlefc.callbackQueue.find((entry: any) => entry.CONSENT_MODE_DATA_READY).CONSENT_MODE_DATA_READY();
  runtime.pageView(); expect(scriptCount()).toBe(0);
  host.googlefc.getGoogleConsentModeValues = () => {throw new Error('CMP unavailable');};
  runtime.pageView(); expect(scriptCount()).toBe(0);
});

it('drops pre-consent events and starts with the current page, not the original page', () => {
  const runtime = create(); runtime.initialize(); runtime.event('station_play',1);
  window.history.replaceState({}, '', '/tr/istasyon/kral-fm?utm_source=ai#player'); runtime.pageView();
  consentReady();
  expect(events('megaradio_event')).toHaveLength(0);
  expect(events('megaradio_page_view')).toEqual([{event:'megaradio_page_view',page_location:`${location.origin}/tr/istasyon/kral-fm`,page_referrer:''}]);
});

it('can observe a later initial grant on navigation, but never replays denied events', () => {
  status = 2; const runtime = create(); runtime.initialize(); consentReady(); runtime.event('station_play',1);
  status = 1; window.history.replaceState({}, '', '/tr/faq'); runtime.pageView();
  expect(scriptCount()).toBe(1); expect(events('megaradio_page_view')).toHaveLength(1); expect(events('megaradio_event')).toHaveLength(0);
});

it('deduplicates repeated views but counts A to B to A, stripping query and fragment', () => {
  const runtime = create(); runtime.initialize(); consentReady(); runtime.pageView();
  window.history.replaceState({}, '', '/tr/blog?ref=private#secret'); runtime.pageView(); runtime.pageView();
  window.history.replaceState({}, '', '/tr/faq'); runtime.pageView();
  expect(events('megaradio_page_view').map((event: any) => event.page_location)).toEqual([
    `${location.origin}/tr/faq`, `${location.origin}/tr/blog`, `${location.origin}/tr/faq`,
  ]);
  expect(events('megaradio_page_view')[2].page_referrer).toBe(`${location.origin}/tr/blog`);
});

it.each(['cmpuishown','useractioncomplete'])('locks this document when the CMP signals %s', eventStatus => {
  const runtime = create(); runtime.initialize(); consentReady(); tcf!({eventStatus},true);
  runtime.event('station_play',1); consentReady(); runtime.pageView();
  expect(host['ga-disable-G-TEST12345']).toBe(true); expect(host.__MEGARADIO_GOOGLE_ALLOWED__()).toBe(false);
  expect(events('megaradio_event')).toHaveLength(0); expect(events('megaradio_page_view')).toHaveLength(1);
});

it('locks before the privacy panel and cannot reenable in the same document', () => {
  const runtime = create(); runtime.initialize(); consentReady(); runtime.suspend();
  status = 1; consentReady(); runtime.event('station_play',1); runtime.pageView();
  expect(host['ga-disable-G-TEST12345']).toBe(true); expect(events('megaradio_event')).toHaveLength(0);
});

it('locks on later consent denial, getter failure or private navigation', () => {
  const runtime = create(); runtime.initialize(); consentReady(); status = 2; runtime.event('station_play',1);
  status = 1; runtime.pageView(); expect(host.__MEGARADIO_GOOGLE_ALLOWED__()).toBe(false);
});

it('fails closed without breaking app startup when CMP registration throws', () => {
  host.googlefc.callbackQueue = {push: () => {throw new Error('CMP callback unavailable');}};
  const runtime = create();
  expect(() => runtime.initialize()).not.toThrow();
  expect(scriptCount()).toBe(0); expect(host['ga-disable-G-TEST12345']).toBe(true);
});

it('locks a loaded tag when a later getter throws or a TCF error occurs', () => {
  const runtime = create(); runtime.initialize(); consentReady();
  host.googlefc.getGoogleConsentModeValues = () => {throw new Error('CMP failed');};
  runtime.event('station_play',1);
  expect(host['ga-disable-G-TEST12345']).toBe(true);
  expect(events('megaradio_event')).toHaveLength(0);
  tcf!({},false);
  expect(host.__MEGARADIO_GOOGLE_ALLOWED__()).toBe(false);
});

it('registers a delayed TCF API once without inferring analytics from its purposes', () => {
  delete host.__tcfapi;
  const runtime = create(); runtime.initialize();
  host.__tcfapi = vi.fn((_cmd, _version, callback) => { tcf = callback; });
  const notify = callbacks.find(entry => entry.CONSENT_API_READY)!.CONSENT_API_READY;
  notify(); notify(); expect(host.__tcfapi).toHaveBeenCalledTimes(1);
  tcf!({eventStatus:'tcloaded'},true); expect(scriptCount()).toBe(0);
});

it('does not resume after public to private to public SPA navigation', () => {
  const runtime = create(); runtime.initialize(); consentReady();
  window.history.replaceState({}, '', '/tr/profil/ayarlar'); runtime.pageView();
  window.history.replaceState({}, '', '/tr/faq'); runtime.pageView();
  expect(events('megaradio_page_view')).toHaveLength(1); expect(host['ga-disable-G-TEST12345']).toBe(true);
});

it('does not start if navigation becomes private before delayed consent', () => {
  const runtime = create(); runtime.initialize();
  window.history.replaceState({}, '', '/admin/users'); consentReady();
  expect(scriptCount()).toBe(0);
});

it('sends only allowlisted event names and finite bounded numbers', () => {
  const runtime = create(); runtime.initialize(); consentReady();
  runtime.event('search',8); runtime.event('station_play',Infinity); runtime.event('login',1); runtime.event('email@example.com',1);
  expect(events('megaradio_event')).toEqual([
    {event:'megaradio_event',event_name:'search',value:8}, {event:'megaradio_event',event_name:'station_play'},
  ]);
});

it.each(['/admin','/admin-login','/en/admin','/tr/profil/ayarlar','/en/login','/en/reset-password?token=SECRET',
  '/tr/search?q=private@email.test','/en/faq?access_token=SECRET','/en/faq?code=SECRET','/unknown','/am/faq'])('excludes private/unsupported URL %s', path => {
  expect(publicMeasurementUrl(path, location.origin)).toBeNull();
  window.history.replaceState({}, '', path); const runtime = create(); runtime.initialize(); expect(callbacks).toHaveLength(0); expect(scriptCount()).toBe(0);
});

it.each(['/en','/tr/faq','/de/sender/test-station','/ar/anwaa','/tr/blog/test-post'])('accepts public localized URL %s without query/fragment', path => {
  expect(publicMeasurementUrl(`${path}?utm_source=AI#heading`, location.origin)).toBe(`${location.origin}${path}`);
});

it('keeps Google queues on the main thread, has no noscript tracker or legacy gtag loader', () => {
  const html = readFileSync(`${process.cwd()}/index.html`,'utf8');
  expect(html).toContain("forward: ['clarity']");
  expect(html).not.toMatch(/forward:\s*\[[^\]]*(?:dataLayer|gtag)/);
  expect(html).not.toContain('ns.html?id=GTM-');
  const analytics = readFileSync(`${process.cwd()}/src/lib/analytics.ts`,'utf8');
  expect(analytics).not.toMatch(/gtag\(|gtag\/js|8000/);
});
