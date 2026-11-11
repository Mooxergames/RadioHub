import { faTrackEvent, faTrackPageView } from './flowalive';

// Define the gtag function globally
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

// Existing MegaRadio Web stream, verified in GA4 property 530834250.
const measurementId=import.meta.env.VITE_GA_MEASUREMENT_ID||'G-3X2WGQC0J3';
let initialized=false;
function allowed(){return typeof window!=='undefined'&&typeof document!=='undefined'&&['themegaradio.com','www.themegaradio.com'].includes(window.location.hostname)&&!/^\/admin(?:\/|$|-login(?:\/|$))/.test(window.location.pathname)&&navigator.doNotTrack!=='1'&&!(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl;}
export const initGA=()=>{
 if(initialized||!allowed())return;
 initialized=true;
 window.dataLayer=window.dataLayer||[];
 // Queue immediately: navigation before gtag.js finishes must not disappear.
 window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
 window.gtag('js',new Date());
 window.gtag('config',measurementId,{send_page_view:false,allow_google_signals:false,page_location:window.location.origin+window.location.pathname,page_title:'MegaRadio'});
 const load=()=>{
  if(document.querySelector('script[data-mega-ga]'))return;
  const script=document.createElement('script');script.type='text/partytown';script.async=true;script.dataset.megaGa='1';
  script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  window.dispatchEvent(new CustomEvent('ptupdate'));
 };
 if('requestIdleCallback' in window)window.requestIdleCallback(load,{timeout:1500});else setTimeout(load,0);
};
export const trackStructuredEvent=(name:string,params:Record<string,string|number>={})=>{
 if(!allowed())return;initGA();
 window.gtag('event',name,{...params,send_to:measurementId,page_location:window.location.origin+window.location.pathname});
};
export const setAnalyticsUser=(userId:string|null)=>{if(!allowed())return;initGA();window.gtag('config',measurementId,{user_id:userId,send_page_view:false});};
export const setAnalyticsProperty=(name:string,value:string)=>{if(!allowed())return;initGA();window.gtag('set','user_properties',{[name]:value.slice(0,36)});};
export const trackPageView=(url:string)=>{
 const path=url.split(/[?#]/)[0];if(/^\/admin(?:\/|$|-login(?:\/|$))/.test(path))return;
 trackStructuredEvent('page_view',{page_path:path,page_location:typeof window==='undefined'?path:window.location.origin+path});
 faTrackPageView(path);
};
export const trackEvent=(action:string,category?:string,label?:string,value?:number)=>{
 trackStructuredEvent(action,{...(category?{event_category:category}:{}),...(label?{event_label:label.slice(0,100)}:{}),...(value!==undefined?{value}:{})});
};

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

export const trackSearch = (_searchTerm: string, resultsCount: number) => {
  trackStructuredEvent('search', { results_count: resultsCount });
  faTrackEvent('search_performed', { results_count: resultsCount });
};
