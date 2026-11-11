const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('docs/mobile/preview/preview-theme.js','utf8');
function host(width,height,top,bottom){
 const style=()=>({setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}});
 const img={style:style()},label={style:style()};
 const node=()=>({style:style(),classList:{values:new Set(),toggle(key,force){if(force===undefined)force=!this.values.has(key);if(force)this.values.add(key);else this.values.delete(key)},remove(key){this.values.delete(key)},contains(key){return this.values.has(key)}},querySelector:()=>img,querySelectorAll:()=>[img,label]});
 const elements={status:node(),home:node(),screen:node()},iframe={style:style(),contentWindow:{}};let listener;
 const window={};const document={documentElement:{style:style()},getElementById:id=>elements[id],querySelector:()=>iframe};
 vm.runInNewContext(code,{window,document,addEventListener:(name,fn)=>{listener=fn}});
 const bridge=window.MegaPreviewTheme.attach({width,height,top,bottom,flags:{home:true,tabDock:true}});
 const event=(screen,visible,extra={})=>listener({origin:'http://localhost:8081',source:iframe.contentWindow,data:{type:'megaradio-preview-theme',screen,visible,...extra}});
 return {elements,iframe,bridge,event};
}
for(const p of [[430,932,59,34],[393,852,59,34],[360,740,24,24],[412,915,24,24],[320,640,24,24],[466,678,24,21],[890,626,24,21],[393,873,24,24],[360,780,24,24],[360,840,24,24]]){
 const h=host(...p);assert.equal(h.elements.screen.classList.contains('ads'),false,'no unrelated paywall artwork');assert.equal(h.iframe.style.top,p[2]+'px');assert.equal(h.iframe.style.height,(p[1]-p[2]-p[3])+'px');assert.deepEqual(JSON.parse(h.iframe.name.slice(13)),{top:p[2],bottom:p[3],width:p[0],height:p[1]});
 h.event('removeAds',true);assert.equal(h.elements.screen.classList.contains('ads'),true);h.event('removeAds',false);assert.equal(h.elements.screen.classList.contains('ads'),false);h.event('premium',true);h.event('premiumProgress',1);assert.equal(h.elements.home.style.background,'#131313','modal overrides underlying Home dock');assert.equal(h.elements.status.style['--premium-progress'],1);
 h.event('premium',false);h.event('home',false);h.event('player',true);assert.match(h.elements.status.style.background,/player-background-glow/);assert.equal(h.elements.home.style.background,'#131313','player overrides stale tab dock');
 h.event('privateDiscoveryChoices',true);assert.equal(h.elements.status.style.background,'#1B1B1B');assert.equal(h.elements.home.style.background,'#1B1B1B');h.event('genrePicker',true);assert.equal(h.elements.status.style.background,'#101010');assert.equal(h.elements.home.style.background,'#101010');h.event('genrePicker',false);h.event('privateDiscoveryChoices',false);
 h.event('player',false);h.event('home',true,{scrollY:90});assert.match(h.elements.status.style.background,/home-background-glow/);assert.match(h.elements.status.style.background,/-426px/);assert.equal(h.elements.home.style.background,'#171717');
}
console.log('PASS 10 device metrics, Home → Premium → Player → Home chrome ownership and scrolling');
