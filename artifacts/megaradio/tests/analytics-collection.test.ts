import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../src/lib/flowalive',()=>({faTrackEvent:vi.fn(),faTrackPageView:vi.fn()}));
let idle:(()=>void)[],scripts:any[],signals:any[];
beforeEach(()=>{
 vi.resetModules();idle=[];scripts=[];signals=[];
 vi.stubGlobal('window',{location:{hostname:'themegaradio.com',origin:'https://themegaradio.com',pathname:'/tr/home'},requestIdleCallback:(fn:()=>void)=>{idle.push(fn);},dispatchEvent:(e:any)=>signals.push(e.type)});
 vi.stubGlobal('navigator',{doNotTrack:'0'});
 vi.stubGlobal('document',{querySelector:()=>scripts.length?scripts[0]:null,createElement:()=>({dataset:{}}),head:{appendChild:(s:any)=>scripts.push(s)}});
 vi.stubGlobal('CustomEvent',class {constructor(public type:string){}});
});
afterEach(()=>vi.unstubAllGlobals());
describe('GA4 production collection boundary',()=>{
 it('queues first SPA view before the deferred script and boots Partytown once',async()=>{
  const a=await import('../src/lib/analytics');a.trackPageView('/tr/home?token=private');a.initGA();
  const queue=window.dataLayer.map(x=>Array.from(x));
  expect(queue.filter(x=>x[0]==='config')).toHaveLength(1);
  expect(queue.find(x=>x[0]==='config')?.[2]).toMatchObject({send_page_view:false});
  expect(queue.filter(x=>x[0]==='event'&&x[1]==='page_view')).toHaveLength(1);
  expect(JSON.stringify(queue)).not.toContain('token=');expect(scripts).toHaveLength(0);
  idle.forEach(fn=>fn());expect(scripts).toHaveLength(1);expect(scripts[0].type).toBe('text/partytown');expect(signals).toEqual(['ptupdate']);
 });
 it('clears signed-in identity and never sends private search queries',async()=>{
  const a=await import('../src/lib/analytics');a.setAnalyticsUser('opaque-account');a.setAnalyticsUser(null);a.trackSearch('private@example.com',12);
  const queue=window.dataLayer.map(x=>Array.from(x));expect(queue.filter(x=>x[0]==='config').at(-1)?.[2]).toMatchObject({user_id:null});
  expect(JSON.stringify(queue)).not.toContain('private@example.com');
 });
 it.each(['localhost','127.0.0.1'])('does not send QA traffic from %s',async hostname=>{
  window.location.hostname=hostname;const a=await import('../src/lib/analytics');a.trackPageView('/player');expect(window.dataLayer).toBeUndefined();expect(scripts).toHaveLength(0);
 });
 it('excludes admin pages and user opt-outs',async()=>{
  window.location.pathname='/admin/error-logs';const a=await import('../src/lib/analytics');a.initGA();expect(window.dataLayer).toBeUndefined();
  window.location.pathname='/tr/home';(navigator as any).doNotTrack='1';a.trackEvent('station_play');expect(window.dataLayer).toBeUndefined();
 });
});
