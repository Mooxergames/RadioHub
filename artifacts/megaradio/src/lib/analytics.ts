import { faTrackEvent, faTrackPageView } from './flowalive';
import { initializeGoogleTagManager, googlePageView, googleEvent, googleStructuredEvent, googleUser, googleProperty } from './google-tag-manager';

export const initGA = initializeGoogleTagManager;

export const trackPageView = (url: string) => {
  googlePageView();
  faTrackPageView(url);
};

export const trackEvent = (
  action: string,
  _category?: string,
  _label?: string,
  value?: number
) => {
  // Raw labels may contain searches or account data; Google receives only the
  // allowlisted event name and a bounded numeric value.
  googleEvent(action, value);
};

// Detailed product events use the same public-route and explicit-consent gate.
export const trackStructuredEvent=googleStructuredEvent;
export const setAnalyticsUser=googleUser;
export const setAnalyticsProperty=googleProperty;

// Radio-specific analytics events
export const trackStationPlay = (stationName: string, stationCountry: string, stationGenre?: string) => {
  trackEvent('station_play', 'radio', `${stationName} - ${stationCountry}`, 1);
  if (stationGenre) {
    trackEvent('genre_play', 'radio_genre', stationGenre, 1);
  }
  trackEvent('country_play', 'radio_country', stationCountry, 1);

  faTrackEvent('station_played', {
    station_name: stationName,
    country: stationCountry,
    genre: stationGenre || null,
  });
};

export const trackStationFavorite = (stationName: string, stationCountry: string, action: 'add' | 'remove') => {
  trackEvent(`station_favorite_${action}`, 'user_engagement', `${stationName} - ${stationCountry}`, 1);

  faTrackEvent(action === 'add' ? 'station_favorited' : 'station_unfavorited', {
    station_name: stationName,
    country: stationCountry,
  });
};

export const trackUserSignup = (method: 'google' | 'email') => {
  trackEvent('sign_up', 'user_account', method, 1);
  faTrackEvent('user_signed_up', { method });
};

export const trackUserLogin = (method: 'google' | 'email') => {
  trackEvent('login', 'user_account', method, 1);
  faTrackEvent('user_logged_in', { method });
};

export const trackListeningTime = (stationName: string, durationMinutes: number) => {
  trackEvent('listening_time', 'radio_engagement', stationName, durationMinutes);
  faTrackEvent('listening_session_ended', {
    station_name: stationName,
    duration_minutes: durationMinutes,
  });
};

export const trackSearch = (_searchTerm:string,resultsCount:number)=>{
 trackStructuredEvent('search',{results_count:resultsCount});
 faTrackEvent('search_performed',{results_count:resultsCount});
};
