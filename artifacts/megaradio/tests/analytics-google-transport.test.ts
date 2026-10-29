import { beforeEach, expect, it, vi } from 'vitest';
import { trackPageView, trackSearch, trackStationPlay, trackEvent, trackUserLogin, trackUserSignup } from '../src/lib/analytics';
import { googleEvent, googlePageView } from '../src/lib/google-tag-manager';
import { faTrackEvent, faTrackPageView } from '../src/lib/flowalive';
vi.mock('../src/lib/google-tag-manager', () => ({ initializeGoogleTagManager: vi.fn(), googlePageView: vi.fn(), googleEvent: vi.fn() }));
vi.mock('../src/lib/flowalive', () => ({ faTrackEvent: vi.fn(), faTrackPageView: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it('preserves the existing non-Google page transport without passing its URL to Google', () => {
  trackPageView('/tr/faq?token=SECRET');
  expect(googlePageView).toHaveBeenCalledWith();
  expect(faTrackPageView).toHaveBeenCalledWith('/tr/faq?token=SECRET');
});
it('never passes search text or raw labels into Google transport', () => {
  trackSearch('private@email.test', 4);
  expect(googleEvent).toHaveBeenCalledWith('search',4);
  expect(JSON.stringify(vi.mocked(googleEvent).mock.calls)).not.toContain('private@');
  expect(faTrackEvent).toHaveBeenCalledWith('search_performed',{query:'private@email.test',results_count:4});
});
it('keeps radio events and existing FlowAlive properties without Google labels', () => {
  trackStationPlay('Station Name','Austria','Jazz');
  expect(googleEvent).toHaveBeenCalledWith('station_play',1);
  expect(faTrackEvent).toHaveBeenCalledWith('station_played',{station_name:'Station Name',country:'Austria',genre:'Jazz'});
  trackEvent('station_play','radio','do-not-send',1);
  expect(JSON.stringify(vi.mocked(googleEvent).mock.calls)).not.toContain('do-not-send');
});
it('retains existing login/signup transport even though Google runtime excludes those event names', () => {
  trackUserLogin('email'); trackUserSignup('google');
  expect(faTrackEvent).toHaveBeenCalledWith('user_logged_in',{method:'email'});
  expect(faTrackEvent).toHaveBeenCalledWith('user_signed_up',{method:'google'});
});
