import {PROFILES,profileKey,synthesize,AUDIO_SAMPLES,PENTATONIC} from './audio-profiles.js';
export {AUDIO_SAMPLES,PENTATONIC};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
const LIMITS=Object.freeze({continuous:4,foreground:6,world:2});
export function soundKind(request,material,surface){return profileKey(request,material,surface);}
export function soundBuffer(context,key){return synthesize(context,key.includes(':')?key:profileKey(key));}
export function createMix(context,destination=context.destination){
 const input=context.createGain(),compressor=context.createDynamicsCompressor(),limiter=context.createWaveShaper(),output=context.createGain();
 input.gain.value=.55;compressor.threshold.value=-15;compressor.knee.value=12;compressor.ratio.value=6;compressor.attack.value=.006;compressor.release.value=.15;
 const curve=new Float32Array(2049);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*1.4)/1.4;}
 limiter.curve=curve;limiter.oversample='2x';output.gain.value=1;
 input.connect(compressor).connect(limiter).connect(output).connect(destination);
 input.output=output;input.dispose=()=>{for(const n of [input,compressor,limiter,output])try{n.disconnect();}catch{}};
 return input;
}
export function scheduleSound(context,mix,key,{at=context.currentTime,volume=1,pan=0,loop=false,buffer,attack=.008}={}){
 let source,gain,panner,disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;for(const n of [source,gain,panner])try{n?.disconnect();}catch{}};
 try{
  source=context.createBufferSource();gain=context.createGain();panner=context.createStereoPanner();source.buffer=buffer??soundBuffer(context,key);source.loop=loop;
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);panner.pan.value=pan;
  source.connect(gain).connect(panner).connect(mix);source.start(at);if(!loop)source.stop(at+source.buffer.duration);
  return {source,gain,panner,dispose};
 }catch(error){try{source?.stop();}catch{}dispose();throw error;}
}
function ramp(param,value,at,seconds){
 if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(at);
 else {const current=param.value;param.cancelScheduledValues(at);param.setValueAtTime(current,at);}
 param.linearRampToValueAtTime(value,at+seconds);
}
export function createAudio(storage){
 let context,mix,muted=false,paused=true,underwater=false,epoch=0,shutdownTimer=null,serial=0,highWater=0;
 let listener={x:0,y:0,z:0,yaw:0,shoreDistance:Infinity,surface:'grass',region:'legacy'};
 const active=new Set(),continuous=new Map(),buffers=new Map(),last=new Map(),diagnosticLast=new Map(),events=[],diagnostics=[];
 const counts={admitted:0,dropped:0,stopped:0};
 try{storage??=globalThis.localStorage;muted=storage?.getItem('kauris-muted')==='1';}catch{}
 const now=()=>context?.currentTime??0;
 function boundedSet(map,key,value,max=128){map.delete(key);map.set(key,value);if(map.size>max)map.delete(map.keys().next().value);}
 function record(action,request,options={},reason){
  const entry={sequence:++serial,action,request,kind:profileKey(request,options.material,options.surface),sourceId:options.sourceId??null,category:PROFILES[request]?.category??(Object.hasOwn(PROFILES,request)?'foreground':null),material:options.material??null,time:now(),x:options.x??null,y:options.y??null,z:options.z??null};
  if(reason)entry.reason=reason;
  if(action==='admit'){Object.assign(entry,{gain:options.gain,pan:options.pan});events.push(entry);if(events.length>256)events.shift();counts.admitted++;}
  else {counts[action==='drop'?'dropped':'stopped']++;const key=`${action}:${request}:${reason}`;if(now()-(diagnosticLast.get(key)??-Infinity)<1)return;boundedSet(diagnosticLast,key,now());diagnostics.push(entry);if(diagnostics.length>128)diagnostics.shift();}
 }
 function finish(v,reason='ended'){
  if(!active.delete(v))return;
  if(v.timer)clearTimeout(v.timer);if(continuous.get(v.id)===v)continuous.delete(v.id);
  try{v.source.stop();}catch{}v.dispose();record('stop',v.request,{...v.options,sourceId:v.id},reason);
 }
 function reap(){for(const v of active)if(v.releaseAt!==undefined&&now()>=v.releaseAt||!v.loop&&now()>=v.endsAt)finish(v);}
 function stopAll(reason){for(const v of [...active])finish(v,reason);continuous.clear();}
 function quiet(){
  const token=++epoch;if(shutdownTimer)clearTimeout(shutdownTimer);shutdownTimer=null;
  if(!context||!mix)return;
  try{ramp(mix.output.gain,0,now(),.025);}catch{stopAll('transition-failure');}
  shutdownTimer=setTimeout(()=>{shutdownTimer=null;if(token!==epoch)return;stopAll('transition');try{Promise.resolve(context.suspend()).catch(()=>{});}catch{}},30);
 }
 function start(){
  paused=false;if(muted)return;
  const token=++epoch;
  if(shutdownTimer){clearTimeout(shutdownTimer);shutdownTimer=null;stopAll('restart');}
  try{
   if(!context){context=new (globalThis.AudioContext||globalThis.webkitAudioContext)();try{mix=createMix(context);}catch(error){try{Promise.resolve(context.close()).catch(()=>{});}catch{}context=null;throw error;}}
   Promise.resolve(context.resume()).then(()=>{if(token!==epoch)return;if(paused||muted){quiet();return;}try{ramp(mix.output.gain,1,now(),.02);}catch{quiet();}}).catch(()=>{});
  }catch{}
 }
 function ready(){reap();return !paused&&!muted&&context?.state==='running'&&!!mix;}
 function getBuffer(key){
  let buffer=buffers.get(key);if(buffer){buffers.delete(key);buffers.set(key,buffer);return buffer;}
  buffer=soundBuffer(context,key);buffers.set(key,buffer);if(buffers.size>48){const stale=[...buffers.keys()].find(k=>!PROFILES[k.split(':')[0]].loop);buffers.delete(stale);}return buffer;
 }
 function spatial(request,options,level){
  const profile=PROFILES[request];let gain=clamp(finite(level,1),0,1)*profile.gain,pan=0,distance=0;
  if(Number.isFinite(options.x)&&Number.isFinite(options.z)){
   const dx=options.x-listener.x,dz=options.z-listener.z,dy=finite(options.y,listener.y)-listener.y;distance=Math.hypot(dx,dy,dz);
   const range=profile.range??24;if(distance>=range)return {gain:0,pan:0,distance};
   const fade=clamp((range-distance)/6,0,1);gain*=fade/(1+(distance/(request==='whale'?22:8))**2);
   pan=clamp((dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(1,distance),-1,1);
  }
  return {gain,pan,distance};
 }
 function admit(category,priority,distance){
  reap();const candidates=[...active].filter(v=>v.category===category);
  if(candidates.length<LIMITS[category]&&active.size<12)return true;
  const pool=candidates.length>=LIMITS[category]?candidates:[...active];
  pool.sort((a,b)=>a.priority-b.priority||b.distance-a.distance||a.started-b.started);
  const victim=pool[0];
  if(victim&&(victim.releaseAt!==undefined||victim.priority<priority||victim.priority===priority&&(category==='foreground'||distance+.5<victim.distance))){finish(victim,'priority');return true;}
  return false;
 }
 function launch(request,options,loop,id,level){
  const p=PROFILES[request],category=p.category??'foreground',position=spatial(request,options,level);
  if(position.gain<.0001){record('drop',request,options,'distance');return null;}
  if(!admit(category,p.priority,position.distance)){record('drop',request,options,'polyphony');return null;}
  try{
   const key=profileKey(request,options.material,options.surface),buffer=getBuffer(key);
   const v=scheduleSound(context,mix,key,{...position,volume:position.gain,loop,buffer,attack:loop?.035:.004});
   Object.assign(v,{id,request,options:{...options},loop,category,priority:p.priority,distance:position.distance,level,started:now(),endsAt:now()+buffer.duration,targetGain:position.gain,targetPan:position.pan});
   active.add(v);if(loop)continuous.set(id,v);v.source.onended=()=>finish(v);highWater=Math.max(highWater,active.size);
   record('admit',request,{...options,sourceId:id,...position});return v;
  }catch{record('drop',request,options,'audio-failure');return null;}
 }
 function play(request,options={}){
  const p=Object.hasOwn(PROFILES,request)?PROFILES[request]:null;
  if(!p||p.loop){record('drop',request,options,'unknown-or-continuous');return false;}
  if(!ready())return false;
  const time=now(),id=String(options.sourceId??`player:${request}`),key=`${request}:${id}`;
  if(time-(last.get(key)??-Infinity)<p.rate||p.notification&&time-(last.get('notification')??-Infinity)<10||p.critter&&time-(last.get('critter-global')??-Infinity)<3||request==='bell'&&time-(last.get('bell-global')??-Infinity)<.6){record('drop',request,options,'rate');return false;}
  if(!launch(request,options,false,id,options.volume??1))return false;
  boundedSet(last,key,time);if(p.notification)boundedSet(last,'notification',time);if(request==='bell')boundedSet(last,'bell-global',time);if(p.critter)boundedSet(last,'critter-global',time);return true;
 }
 function release(v,seconds=.1){
  if(v.releaseAt!==undefined)return;
  try{ramp(v.gain.gain,0,now(),seconds);v.releaseAt=now()+seconds;v.timer=setTimeout(()=>{v.timer=null;if(v.releaseAt!==undefined)finish(v,'release');},seconds*1000+10);}
  catch{finish(v,'audio-failure');}
 }
 function updateVoice(v,options,level){
  const pos=spatial(v.request,options,level);v.options={...options};v.level=level;v.distance=pos.distance;
  if(pos.gain<.0001){release(v);return;}
  try{
   if(v.releaseAt!==undefined){if(v.timer)clearTimeout(v.timer);v.timer=null;delete v.releaseAt;v.targetGain=-1;}
   if(Math.abs(v.targetGain-pos.gain)>.0001){ramp(v.gain.gain,pos.gain,now(),.06);v.targetGain=pos.gain;}
   if(Math.abs(v.targetPan-pos.pan)>.001){ramp(v.panner.pan,pos.pan,now(),.04);v.targetPan=pos.pan;}
  }catch{finish(v,'audio-failure');}
 }
 function setContinuous(id,kind,options={}){
  if(typeof id!=='string'||!id||!['water','wheel','liftMove'].includes(kind)){record('drop',kind,options,'unknown-continuous');return false;}
  reap();const v=continuous.get(id);
  if(!options.active){if(v)release(v);return false;}
  if(!ready())return false;
  if(v&&v.request===kind){updateVoice(v,options,options.gain??1);return true;}
  if(v)finish(v,'kind-changed');return !!launch(kind,{...options,sourceId:id},true,id,options.gain??1);
 }
 function environment(next={}){
  for(const key of ['x','y','z','yaw'])listener[key]=finite(next[key],listener[key]);
  listener.shoreDistance=Number.isFinite(next.shoreDistance)?Math.abs(next.shoreDistance):Infinity;listener.region=next.region??listener.region;listener.surface=next.surface??listener.surface;underwater=!!next.underwater;
  if(!ready())return;
  for(const v of [...continuous.values()])if(!v.id.startsWith('ambient:')&&v.releaseAt===undefined)updateVoice(v,v.options,v.level);
  const sea=clamp(1-listener.shoreDistance/24,0,1);
  for(const [kind,level] of [['shore',underwater?0:sea*.65],['underwater',underwater?.65:0]]){
   const id=`ambient:${kind}`,v=continuous.get(id);
   if(level===0){if(v)release(v,.1);continue;}
   if(v)updateVoice(v,{},level);else launch(kind,{},true,id,level);
  }
 }
 function pause(){paused=true;quiet();}
 return {start,play,setContinuous,pause,environment,get muted(){return muted;},toggle(){muted=!muted;try{storage?.setItem('kauris-muted',muted?'1':'0');}catch{}if(muted)quiet();else if(!paused)start();return muted;},
  snapshot(){reap();return {muted,paused,state:context?.state??'not-started',voices:active.size,voiceLimit:12,highWater,underwater,counts:{...counts},categories:Object.fromEntries(Object.keys(LIMITS).map(k=>[k,[...active].filter(v=>v.category===k).length])),continuous:[...continuous.values()].map(v=>({id:v.id,kind:v.request,releasing:v.releaseAt!==undefined,gain:v.targetGain})),bufferBytes:[...buffers.values()].reduce((s,b)=>s+b.length*4,0),events:[...events],diagnostics:[...diagnostics]};}
 };
}
export async function renderAudioSampler(OfflineContext){
 const span=AUDIO_SAMPLES.reduce((s,k)=>s+(PROFILES[k].loop?2:PROFILES[k].duration)+.35,0)+1;
 const context=new OfflineContext(2,Math.ceil(span*48000),48000),mix=createMix(context),events=[];let at=.15;
 for(const kind of AUDIO_SAMPLES){const p=PROFILES[kind],duration=p.loop?2:p.duration;const v=scheduleSound(context,mix,profileKey(kind),{at,volume:p.gain,loop:!!p.loop});if(p.loop){v.gain.gain.setValueAtTime(p.gain,at+duration-.1);v.gain.gain.linearRampToValueAtTime(0,at+duration);v.source.stop(at+duration);}events.push({kind,at,duration});at+=duration+.35;}
 return {buffer:await context.startRendering(),events};
}
