import {AnalyticsSession} from './analytics-session';
import {trackStructuredEvent,setAnalyticsProperty} from './analytics';
let previous='';
export const analyticsSession=new AnalyticsSession((name,params)=>{
 const properties={current_screen:String(params.screen_name||'home'),current_station:String(params.station_id||'none'),playback_state:String(params.playback_state||'idle')};
 const key=JSON.stringify(properties);if(key!==previous){previous=key;for(const [name,value]of Object.entries(properties))setAnalyticsProperty(name,value);}
 // Public web routes already emit exactly one page_view; avoid double-counting GA Views.
 if(name!=='screen_view')trackStructuredEvent(name,params);
});
