import {useEffect,useRef} from 'react';
import {useLocation} from 'wouter';
import {trackPageView,setAnalyticsUser} from '../lib/analytics';
import {analyticsSession} from '../lib/analytics-runtime';
import {scheduleVisitorPageView} from '../lib/visitor-activity';
import {useQueryClient} from '@tanstack/react-query';
export const useAnalytics=()=>{
 const [location]=useLocation();const previous=useRef<string|null>(null);
 const queryClient=useQueryClient();
 useEffect(()=>scheduleVisitorPageView(location),[location]);
 useEffect(()=>{
  let identity:string|null|undefined;
  const sync=()=>{
   const auth=queryClient.getQueryData<{authenticated?:boolean;user?:{_id:string}|null;_pendingTokenExchange?:boolean}>(['/api/auth/me']);
   if(!auth||auth._pendingTokenExchange)return;
   const next=auth.authenticated?auth.user?._id||null:null;
   if(next!==identity){analyticsSession.flush();identity=next;setAnalyticsUser(next);}
  };
  sync();return queryClient.getQueryCache().subscribe(event=>{if(event.query.queryKey[0]==='/api/auth/me')sync();});
 },[queryClient]);
 useEffect(()=>{if(previous.current===location)return;previous.current=location;trackPageView(location);analyticsSession.route(location.split(/[?#]/)[0]);},[location]);
 useEffect(()=>{
  const visible=()=>analyticsSession.setActive(document.visibilityState!=='hidden');visible();
  document.addEventListener('visibilitychange',visible);
  const timer=setInterval(()=>analyticsSession.heartbeat(),60000);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);analyticsSession.dispose();};
 },[]);
};
