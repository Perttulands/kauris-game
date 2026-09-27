// Original local material synthesis. Bounded voices, one quiet mix, no play dependency.
export const PENTATONIC=Object.freeze([261.626,293.665,329.628,391.995,440]);
export const AUDIO_SAMPLES=Object.freeze(['wood','copper','iron','crystal','cloth','pour','wheel','liftStart','liftArrival','shore','underwater','whale']);
const duration={wood:.23,copper:1.1,iron:.32,crystal:1.35,cloth:.4,pour:.38,wheel:.45,liftStart:.48,liftMove:.4,liftArrival:.8,shore:4,underwater:4,whale:3.5};
const aliases={dig:'wood',fill:'wood',plant:'cloth',chop:'wood',remove:'wood',grow:'crystal',discover:'crystal',harvest:'copper',water:'pour',bell:'copper',step:'wood'};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function soundKind(kind,material){if(['build','remove','chop','step'].includes(kind)&&material)return ({wood:'wood',copper:'copper',iron:'iron',diamond:'crystal',fiber:'cloth'})[material]??'wood';return aliases[kind]??(Object.hasOwn(duration,kind)?kind:'wood');}
export function createMix(context,destination=context.destination){
 const gain=context.createGain(),compressor=context.createDynamicsCompressor(),limiter=context.createWaveShaper();
 gain.gain.value=.55;compressor.threshold.value=-16;compressor.knee.value=12;compressor.ratio.value=8;compressor.attack.value=.008;compressor.release.value=.18;
 const curve=new Float32Array(1025);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*1.4)/1.4;}limiter.curve=curve;limiter.oversample='2x';gain.connect(compressor).connect(limiter).connect(destination);return gain;
}
export function soundBuffer(context,kind){
 const length=duration[kind]??.3,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*length),context.sampleRate),out=buffer.getChannelData(0);let seed=70123,low=0,slow=0;
 for(let i=0;i<out.length;i++){
  const t=i/context.sampleRate,u=t/length;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low+=.13*(noise-low);slow+=.018*(noise-slow);let s=0;
  if(kind==='wood')s=(low*.32+Math.sin(t*2*Math.PI*167)*.32+Math.sin(t*2*Math.PI*321)*.15)*Math.exp(-t*23);
  else if(kind==='iron')s=(low*.22+Math.sin(t*2*Math.PI*193)*.16+Math.sin(t*2*Math.PI*511)*.07)*Math.exp(-t*13);
  else if(kind==='copper'||kind==='crystal'||kind==='liftArrival'){
   const f=kind==='copper'?PENTATONIC[3]:kind==='crystal'?PENTATONIC[2]*2:PENTATONIC[0]*2;
   s=(Math.sin(t*2*Math.PI*f)*.28+Math.sin(t*2*Math.PI*f*2)*.10*Math.exp(-t*3)+Math.sin(t*2*Math.PI*f*3)*.035*Math.exp(-t*6))*Math.exp(-t*(kind==='crystal'?2.8:4.5));
  }else if(kind==='cloth')s=(noise-low)*.18*(.7+.3*Math.sin(t*45))*Math.sin(Math.PI*u);
  else if(kind==='pour')s=(low*.38+(noise-low)*.04)*(1+.17*Math.sin(t*73));
  else if(kind==='wheel')s=low*.13+Math.sin(t*2*Math.PI*102)*.025*(.5+.5*Math.sin(t*32));
  else if(kind==='liftStart'||kind==='liftMove')s=(slow*.3+Math.sin(t*2*Math.PI*(118+Math.sin(t*7)*3))*.04)*Math.sin(Math.PI*u);
  else if(kind==='shore')s=(low*.18+slow*.42)*(.68+.20*Math.sin(t*1.57));
  else if(kind==='underwater')s=slow*.55+Math.sin(t*2*Math.PI*148)*.006;
  else if(kind==='whale'){
   const phase=2*Math.PI*(180*t-10*t*t+2*Math.sin(t*1.5));
   s=(Math.sin(phase)*.14+Math.sin(phase*2)*.085+Math.sin(phase*3)*.035)*Math.pow(Math.sin(Math.PI*u),1.4);
  }
  const edge=Math.min(1,t/.025,(length-t)/.08);out[i]=s*Math.max(0,edge);
 }return buffer;
}
export function scheduleSound(context,mix,kind,{at=context.currentTime,volume=1,pan=0,loop=false,buffer}={}){
 let source,gain,panner,disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;for(const n of [source,gain,panner])try{n?.disconnect();}catch{}};
 try{source=context.createBufferSource();gain=context.createGain();panner=context.createStereoPanner();source.buffer=buffer??soundBuffer(context,kind);source.loop=loop;gain.gain.value=volume;panner.pan.value=pan;source.connect(gain).connect(panner).connect(mix);source.start(at);if(!loop)source.stop(at+source.buffer.duration);return {source,gain,dispose};}
 catch(error){try{source?.stop();}catch{}dispose();throw error;}
}
export async function renderAudioSampler(OfflineContext){
 const span=AUDIO_SAMPLES.reduce((s,k)=>s+duration[k]+.3,0)+2,context=new OfflineContext(2,Math.ceil(span*44100),44100),mix=createMix(context),events=[];let at=.15;
 for(const kind of AUDIO_SAMPLES){scheduleSound(context,mix,kind,{at,volume:kind==='shore'||kind==='underwater'?.5:.85});events.push({kind,at,duration:duration[kind]});at+=duration[kind]+.3;}
 // The final chord checks the shared palette and concurrent headroom.
 for(const kind of ['copper','crystal','liftArrival'])scheduleSound(context,mix,kind,{at,volume:.65});events.push({kind:'combined-palette',at,duration:1.35});
 const buffer=await context.startRendering();return {buffer,events};
}
export function createAudio(storage){
 let context,mix,muted=false,paused=true,listener={x:0,y:0,z:0,yaw:0},underwater=false,serial=0;const active=new Set(),ambient=new Map(),buffers=new Map(),last=new Map(),events=[];
 try{storage??=globalThis.localStorage;muted=storage.getItem('kauris-muted')==='1';}catch{}
 function getBuffer(kind){if(!buffers.has(kind))buffers.set(kind,soundBuffer(context,kind));return buffers.get(kind);}
 function stopAll(){for(const voice of active){try{voice.source.stop();}catch{}voice.dispose();active.delete(voice);}ambient.clear();last.clear();}
 function start(){paused=false;if(muted)return;try{if(!context){context=new (globalThis.AudioContext||globalThis.webkitAudioContext)();mix=createMix(context);}context.resume().then(()=>{if(paused||muted)context.suspend().catch(()=>{});}).catch(()=>{});}catch{}}
 function launch(kind,volume,pan,loop=false){const voice=scheduleSound(context,mix,kind,{volume,pan,loop,buffer:getBuffer(kind)});active.add(voice);voice.source.onended=()=>{active.delete(voice);voice.dispose();};return voice;}
 function play(request,options={}){
  if(paused||muted||!context||context.state!=='running'||active.size>=12)return false;
  const kind=soundKind(request,options.material),now=context.currentTime,rate=kind==='pour'?.25:kind==='wheel'?1.2:kind==='liftMove'?.35:request==='step'?.3:kind==='cloth'?.2:.06;
  if(now-(last.get(kind)??-100)<rate)return false;
  let volume=options.volume??.8,pan=0;
  if(Number.isFinite(options.x)&&Number.isFinite(options.z)){const dx=options.x-listener.x,dz=options.z-listener.z,dy=(options.y??listener.y)-listener.y,d=Math.hypot(dx,dy,dz);volume*=1/(1+(d/(kind==='whale'?28:7))**2);pan=clamp((dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw))/Math.max(1,d),-1,1);}
  if(volume<.006)return false;
  try{launch(kind,volume,pan);last.set(kind,now);events.push({sequence:++serial,kind,request,material:options.material??null,time:now,x:options.x??null,y:options.y??null,z:options.z??null,gain:volume,pan});if(events.length>64)events.shift();return true;}catch{return false;}
 }
 function environment(next){listener={...listener,...next};underwater=!!next.underwater;if(paused||muted||!context||context.state!=='running')return;
  for(const kind of ['shore','underwater']){if(!ambient.has(kind)&&active.size<12)try{ambient.set(kind,launch(kind,0,0,true));}catch{}const voice=ambient.get(kind);if(voice){const nearSea=clamp((listener.z-18)/14,0,1),volume=kind==='underwater'?(underwater?.35:0):(underwater?0:nearSea*.23);try{voice.gain.gain.setTargetAtTime(volume,context.currentTime,.22);}catch{try{voice.source.stop();}catch{}voice.dispose();active.delete(voice);ambient.delete(kind);}}}
 }
 function pause(){paused=true;stopAll();if(context?.state==='running')context.suspend().catch(()=>{});}
 return {start,play,pause,environment,get muted(){return muted;},toggle(){muted=!muted;try{storage.setItem('kauris-muted',muted?'1':'0');}catch{}if(muted){stopAll();context?.suspend().catch(()=>{});}else if(!paused)start();return muted;},snapshot:()=>({muted,paused,state:context?.state??'not-started',voices:active.size,voiceLimit:12,underwater,events:[...events]})};
}
