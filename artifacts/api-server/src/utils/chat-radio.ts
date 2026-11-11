export interface ChatRadio {version:1;stationId:string;name:string;country:string;genre?:string;logo?:string;intent:'gift'|'together'|'custom';caption?:string}
export function radioRequest(content:string):{stationId:string;intent:'gift'|'together'|'custom';caption?:string}|null{
 try{const data=JSON.parse(content);if(data?.version!==1||typeof data.stationId!=='string'||!/^[a-f0-9]{24}$/i.test(data.stationId)||!['gift','together','custom'].includes(data.intent)||data.caption!==undefined&&(typeof data.caption!=='string'||data.caption.length>300))return null;if(data.intent==='custom'&&!data.caption?.trim())return null;return {stationId:data.stationId,intent:data.intent,caption:data.caption?.trim()||undefined};}catch{return null;}
}
export function canonicalRadio(request:NonNullable<ReturnType<typeof radioRequest>>,station:any):ChatRadio{
 const rawLogo=station.favicon||station.logo||'';
 return {version:1,stationId:String(station._id),name:String(station.name||'Radio').slice(0,140),country:String(station.country||'').slice(0,80),genre:String((Array.isArray(station.genres)?station.genres[0]:'')||String(station.tags||'').split(',')[0]).trim().slice(0,80)||undefined,logo:/^https?:\/\//i.test(rawLogo)?rawLogo.slice(0,600):undefined,intent:request.intent,caption:request.caption};
}
