// Recorded-only audio. Gameplay never waits for assets and late loads never replay intent.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const ROOT=`${import.meta.env?.BASE_URL??'/'}audio/`;
const MAX_BYTES=2*1024*1024,MAX_DECODED=16*1024*1024,MAX_VOICES=12;
const ACTIONS=Object.freeze({step:{gain:.48,rate:.34},dig:{gain:.8,rate:.15},fill:{gain:.85,rate:.15},plant:{bank:'fill',gain:.45,rate:.15},chop:{gain:.85,rate:.15},build:{gain:.65,rate:.15},remove:{bank:'build',gain:.5,rate:.15},swim:{gain:.65,rate:.65},bell:{gain:.45,rate:.6}});
function target(param,value,time,seconds){
 // Hold the current envelope before retargeting; discard obsolete automation.
 if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(time);
 else {const current=param.value;param.cancelScheduledValues(time);param.setValueAtTime(current,time);}
 param.setTargetAtTime(value,time,Math.max(.005,seconds/3));
}
export function createAudio(storage){
 let context,master,compressor,manifest,manifestJob,muted=false,paused=true,epoch=0,quietTimer;
 let decodedBytes=0,loading=0,highWater=0,loadHighWater=0,manifestAttempts=0;
 let listener={x:0,y:0,z:0,yaw:0,waterDistance:32,submersion:0};
 const buffers=new Map(),states=new Map(),attempts=new Map(),active=new Set(),loops=new Map(),last=new Map(),variants=new Map(),events=[],diagnostics=[];
 const counts={admitted:0,dropped:0,stopped:0};
 try{storage??=globalThis.localStorage;muted=storage?.getItem('kauris-muted')==='1';}catch{}
 const time=()=>context?.currentTime??0;
 function note(reason,kind){counts.dropped++;if(diagnostics.at(-1)?.reason===reason&&diagnostics.at(-1)?.kind===kind)return;diagnostics.push({reason,kind,time:time()});if(diagnostics.length>64)diagnostics.shift();}
 function bounded(map,key,value){map.delete(key);map.set(key,value);if(map.size>128)map.delete(map.keys().next().value);}
 function finish(v){
  if(!active.delete(v))return;clearTimeout(v.timer);if(loops.get(v.id)===v)loops.delete(v.id);
  try{v.source.stop();}catch{}for(const n of [v.source,v.gain,v.pan,v.filter])try{n?.disconnect();}catch{}counts.stopped++;
 }
 function reap(){for(const v of active)if(v.releaseAt!==undefined&&time()>=v.releaseAt||!v.loop&&time()>=v.endsAt)finish(v);}
 function release(v,seconds=.25){
  if(v.releaseAt!==undefined)return;
  target(v.gain.gain,0,time(),seconds);v.releaseAt=time()+seconds;v.targetGain=0;
  v.timer=setTimeout(()=>finish(v),seconds*1000+5);
 }
 function quiet(){
  const token=++epoch;clearTimeout(quietTimer);if(!context)return;
  try{target(master.gain,0,time(),.03);}catch{}
  quietTimer=setTimeout(()=>{if(token!==epoch)return;for(const v of [...active])finish(v);last.clear();try{Promise.resolve(context.suspend()).catch(()=>{});}catch{}},40);
 }
 async function bytes(url,cap){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('http');
   if(Number(response.headers.get('content-length'))>cap)throw Error('size');
   const reader=response.body?.getReader();
   if(!reader)throw Error('stream');
   const chunks=[];let length=0;
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>cap){await reader.cancel();throw Error('size');}chunks.push(value);}
   const out=new Uint8Array(length);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out.buffer;
  }finally{clearTimeout(timer);}
 }
 function validate(data){
  if(data?.version!==1||!data.assets||!data.banks)throw Error('manifest');
  const rows=Object.entries(data.assets);if(!rows.length||rows.length>64)throw Error('manifest');let size=0,decoded=0;
  for(const [id,a] of rows){
   if(!/^[a-z0-9-]+$/.test(id)||!a||!/^[a-z0-9-]+\.ogg$/.test(a.file)||!Number.isInteger(a.bytes)||a.bytes<1||a.bytes>512*1024||!Number.isFinite(a.duration)||a.duration<=0||a.duration>30||![1,2].includes(a.channels))throw Error('manifest');
   size+=a.bytes;decoded+=Math.ceil((a.duration+.05)*context.sampleRate)*a.channels*4;
  }
  if(size>MAX_BYTES||decoded>MAX_DECODED)throw Error('budget');
  for(const key of ['step-soft','step-hard','step-wood','dig','fill','chop','build','swim','water','shore','bell'])if(!Array.isArray(data.banks[key])||!data.banks[key].length||data.banks[key].some(id=>!Object.hasOwn(data.assets,id)))throw Error('bank');
  return data;
 }
 function pump(){
  if(!manifest||paused||muted)return;
  const priority=[...manifest.banks['step-soft'],...manifest.banks.water,...manifest.banks['step-hard'],...manifest.banks['step-wood'],...Object.keys(manifest.assets)];
  for(const id of new Set(priority)){
   if(loading>=2)break;if(states.has(id))continue;
   states.set(id,'loading');attempts.set(id,(attempts.get(id)??0)+1);loading++;loadHighWater=Math.max(loadHighWater,loading);
   const a=manifest.assets[id];
   (async()=>{
    try{
     const raw=await bytes(ROOT+a.file,a.bytes);if(raw.byteLength!==a.bytes)throw Error('size');
     const buffer=await context.decodeAudioData(raw),size=buffer.length*buffer.numberOfChannels*4;
     if(buffer.duration>a.duration+.05||buffer.numberOfChannels!==a.channels||decodedBytes+size>MAX_DECODED)throw Error('decode-budget');
     buffers.set(id,buffer);decodedBytes+=size;states.set(id,'ready');
    }catch{states.set(id,'failed');note('load-failed',id);}
    finally{loading--;pump();}
   })();
  }
 }
 function load(){
  if(manifest){pump();return;}
  if(manifestJob||manifestAttempts>=2)return;
  manifestAttempts++;
  manifestJob=(async()=>{try{manifest=validate(JSON.parse(new TextDecoder().decode(await bytes(ROOT+'manifest.json',128*1024))));}catch{note('manifest-failed','assets');}finally{manifestJob=null;pump();}})();
 }
 function start(){
  const resuming=paused;paused=false;if(muted)return;
  const token=++epoch;
  if(quietTimer){clearTimeout(quietTimer);quietTimer=null;for(const v of [...active])finish(v);last.clear();}
  try{
   if(!context){
    context=new (globalThis.AudioContext||globalThis.webkitAudioContext)({sampleRate:48000});master=context.createGain();master.gain.value=0;
    compressor=context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=10;compressor.ratio.value=5;compressor.attack.value=.005;compressor.release.value=.15;
    master.connect(compressor).connect(context.destination);
   }
   Promise.resolve(context.resume()).then(()=>{if(token===epoch&&!paused&&!muted)target(master.gain,.8,time(),.03);}).catch(()=>{});
   if(resuming)for(const [id,state] of states)if(state==='failed'&&attempts.get(id)<2)states.delete(id);
   load();
  }catch{note('unavailable','context');}
 }
 const ready=()=>!paused&&!muted&&context?.state==='running'&&!!manifest;
 function select(bank){
  const list=manifest?.banks[bank]?.filter(id=>buffers.has(id))??[];if(!list.length)return null;
  const prior=variants.get(bank);if(bank.startsWith('step-')&&list.length===1&&list[0]===prior)return null;
  const choices=list.filter(id=>id!==prior),id=(choices.length?choices:list)[Math.floor(Math.random()*(choices.length||list.length))];
  return id;
 }
 function position(options,level){
  let gain=clamp(finite(level,1)),pan=0;
  if(Number.isFinite(options.x)&&Number.isFinite(options.z)){
   const dx=options.x-listener.x,dz=options.z-listener.z,dy=finite(options.y,listener.y)-listener.y,d=Math.hypot(dx,dy,dz);
   gain*=clamp((24-d)/6)/(1+(d/8)**2);pan=clamp((dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(1,d),-1,1);
  }
  return {gain,pan};
 }
 function launch(kind,bank,id,options,level,loop=false){
  reap();const asset=select(bank);if(!asset){note('not-loaded',kind);return null;}
  const pos=position(options,level);if(pos.gain<.0001)return null;
  // Six actions and four held sources leave room for the environmental layer and tails.
  const category=loop?(kind==='shore'?'environment':'continuous'):'foreground';
  const same=[...active].filter(v=>v.category===category),cap=category==='foreground'?6:category==='continuous'?4:1;
  if(same.length>=cap){if(category==='foreground')release(same[0],.025);else return null;}
  if(active.size>=MAX_VOICES){note('voice-cap',kind);return null;}
  let source,gain,pan,filter;
  try{
   source=context.createBufferSource();gain=context.createGain();pan=context.createStereoPanner();source.buffer=buffers.get(asset);source.loop=loop;
   source.connect(gain).connect(pan);if(kind==='shore'){filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=12000;pan.connect(filter).connect(master);}else pan.connect(master);
   gain.gain.value=0;pan.pan.value=pos.pan;target(gain.gain,pos.gain,time(),kind==='shore'?2:loop?.15:.012);source.start();
   const v={id,kind,asset,source,gain,pan,filter,loop,category,options:{...options},level,targetGain:pos.gain,targetPan:pos.pan,endsAt:time()+source.buffer.duration};
   active.add(v);if(loop)loops.set(id,v);source.onended=()=>finish(v);highWater=Math.max(highWater,active.size);variants.set(bank,asset);
   counts.admitted++;events.push({kind,asset,sourceId:id,time:time(),gain:pos.gain,pan:pos.pan});if(events.length>128)events.shift();return v;
  }catch{try{source?.stop();}catch{}for(const node of [source,gain,pan,filter])try{node?.disconnect();}catch{}note('source-failed',kind);return null;}
 }
 function update(v,options,level,seconds=.12){
  if(v.releaseAt!==undefined){clearTimeout(v.timer);delete v.releaseAt;v.targetGain=-1;}
  v.options={...options};v.level=level;const p=position(options,level);
  if(Math.abs(p.gain-v.targetGain)>.0001){target(v.gain.gain,p.gain,time(),seconds);v.targetGain=p.gain;}
  if(Math.abs(p.pan-v.targetPan)>.001){target(v.pan.pan,p.pan,time(),.06);v.targetPan=p.pan;}
 }
 function play(kind,options={}){
  const p=Object.hasOwn(ACTIONS,kind)?ACTIONS[kind]:null;if(!p||!ready())return false;reap();
  const key=`${kind}:${String(options.sourceId??'player').slice(0,100)}`;
  // The global gait/stroke limits also prevent multiple callers from defeating cadence.
  const rateKey=kind==='step'||kind==='swim'?kind:key;
  if(time()-(last.get(rateKey)??-Infinity)<p.rate)return false;
  const bank=kind==='step'?(options.material==='wood'||options.surface==='wood'?'step-wood':['copper','iron','diamond'].includes(options.material)||['rock','stone'].includes(options.surface)?'step-hard':'step-soft'):(p.bank??kind);
  const v=launch(kind,bank,options.sourceId??`player:${kind}`,options,p.gain*clamp(finite(options.volume,1)));
  if(v)bounded(last,rateKey,time());return !!v;
 }
 function setContinuous(id,kind,options={}){
  if(typeof id!=='string'||id.length>128||!id||kind!=='water')return false;reap();const v=loops.get(id);
  if(!options.active){if(v)release(v);return false;}
  if(!ready())return false;
  const level=.7*clamp(finite(options.gain,1));if(v){update(v,options,level);return true;}
  return !!launch(kind,'water',id,options,level,true);
 }
 function environment(next={}){
  for(const key of ['x','y','z','yaw'])listener[key]=finite(next[key],listener[key]);
  listener.waterDistance=clamp(finite(next.waterDistance,32),0,32);listener.submersion=clamp(finite(next.submersion));
  if(!ready())return;reap();
  for(const v of loops.values())if(v.kind==='water'&&v.releaseAt===undefined)update(v,v.options,v.level);
  const near=clamp(1-listener.waterDistance/24),level=.6*near*near*(1-.6*listener.submersion),v=loops.get('ambient:shore');
  if(level<.0001){if(v)release(v,2);return;}
  // Keep phase through every shore/submersion crossing; a single recording avoids comb filtering.
  const voice=v??(level>.002?launch('shore','shore','ambient:shore',{},level,true):null);
  if(voice){update(voice,{},level,2);const hz=12000*(650/12000)**listener.submersion;if(Math.abs((voice.hz??12000)-hz)>1){target(voice.filter.frequency,hz,time(),1.5);voice.hz=hz;}}
 }
 function pause(){paused=true;quiet();}
 return {start,pause,play,setContinuous,environment,get muted(){return muted;},toggle(){muted=!muted;try{storage?.setItem('kauris-muted',muted?'1':'0');}catch{}if(muted)quiet();else if(!paused)start();return muted;},
  snapshot(){reap();return {muted,paused,state:context?.state??'not-started',voices:active.size,voiceLimit:MAX_VOICES,highWater,decodedBytes,bufferBytes:decodedBytes,loading,loadHighWater,ready:buffers.size,failed:[...states.values()].filter(s=>s==='failed').length,manifest:!!manifest,submersion:listener.submersion,counts:{...counts},continuous:[...loops.values()].map(v=>({id:v.id,kind:v.kind,asset:v.asset,releasing:v.releaseAt!==undefined,gain:v.targetGain})),events:[...events],diagnostics:[...diagnostics]};}
 };
}
