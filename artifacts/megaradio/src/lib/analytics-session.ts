/** Product telemetry only: no URLs, query strings, profile names or message contents. */
export type AnalyticsParams = Record<string, string | number>;
export type AnalyticsStation = { id:string; name:string; country?:string; genre?:string };
export type AnalyticsSink = (event:string, params:AnalyticsParams)=>void;
export function analyticsScreenName(segments:readonly string[]):string {
  const path=segments.filter(s=>!s.startsWith('(')).map(s=>s.startsWith('[')?'detail':s.replace(/[^a-zA-Z0-9_-]/g,'')).filter(Boolean).join('/');
  return path==='index'||!path?'home':path.slice(0,100);
}
export class AnalyticsSession {
  private screen=''; private overlays=new Map<string,string>();
  private station:AnalyticsStation|null=null; private state='idle'; private active=true; private since:number|null=null;
  constructor(private emit:AnalyticsSink,private now=()=>typeof performance!=='undefined'?performance.now():Date.now()){}
  context():AnalyticsParams {return {screen_name:[...this.overlays.values()].at(-1)||this.screen||'home',playback_state:this.state,...(this.station?{station_id:this.station.id.slice(0,100),station_name:this.station.name.slice(0,100),station_country:(this.station.country||'').slice(0,100),station_genre:(this.station.genre||'').slice(0,100)}:{})};}
  private screenEvent(){if(!this.active)return;this.emit('screen_view',{...this.context(),screen_class:'MegaRadio'});}
  route(name:string){if(name===this.screen)return;this.screen=name;if(!this.overlays.size)this.screenEvent();}
  overlay(key:string,name:string|null){const before=this.context().screen_name;if(name)this.overlays.set(key,name);else this.overlays.delete(key);if(before!==this.context().screen_name)this.screenEvent();}
  playback(station:AnalyticsStation|null,state:string){
    const changed=station?.id!==this.station?.id||state!==this.state;
    if(!changed)return;
    this.flush();this.since=null;this.station=station;this.state=state;
    if(state==='playing'&&station){this.since=this.now();this.emit('station_play',this.context());}
    else this.emit(state==='error'?'playback_error':'station_state_change',this.context());
  }
  flush(){if(this.since===null)return;const now=this.now(),seconds=Math.floor(Math.max(0,now-this.since)/1000);if(seconds>0){this.emit('listening_time',{...this.context(),duration_seconds:seconds});this.since+=seconds*1000;}if(this.state!=='playing')this.since=null;}
  setActive(active:boolean){if(this.active===active)return;this.flush();this.active=active;this.emit(active?'app_foreground':'app_background',this.context());if(active)this.screenEvent();}
  heartbeat(){if(!this.active)return;this.flush();this.emit('activity_heartbeat',this.context());}
  dispose(){this.flush();this.since=null;}
}
