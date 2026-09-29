import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAudio} from '../src/audio.js';
const base=new URL('../public/audio/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
const files=new Map(),metadata=new Map();
for(const a of Object.values(manifest.assets)){const b=await readFile(new URL(a.file,base));files.set(a.file,b);metadata.set(a.sha256,a);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(2);}assert.fail('condition did not settle');}
class Param {
 constructor(){this.value=0;this.events=[];}
 cancelAndHoldAtTime(t){this.events.push({hold:t});}
 setTargetAtTime(v,t,seconds){this.value=v;this.events.push({v,t,seconds});}
}
class Context {
 constructor(){this.currentTime=0;this.sampleRate=48000;this.state='suspended';this.destination={};this.sources=[];Context.latest=this;}
 node(extra={}){return {disconnects:0,connect(){return this},disconnect(){this.disconnects++},...extra};}
 createGain(){return this.node({gain:new Param()});}
 createStereoPanner(){return this.node({pan:new Param()});}
 createBiquadFilter(){return this.node({frequency:new Param()});}
 createDynamicsCompressor(){return this.node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,new Param()])));}
 createBufferSource(){const s=this.node({start:()=>{if(this.failStart)throw Error('allocation');},stop(){this.stopped=true;}});this.sources.push(s);return s;}
 async decodeAudioData(raw){if(this.decodeGate)await this.decodeGate;const a=metadata.get(createHash('sha256').update(new Uint8Array(raw)).digest('hex'));if(!a)throw Error('decode');return {length:Math.round(a.duration*48000),duration:a.duration,numberOfChannels:a.channels};}
 resume(){this.state='running';return Promise.resolve();}
 suspend(){this.state='suspended';return Promise.resolve();}
}
const storage={getItem:()=>null,setItem(){}};
async function fixture(fn,{load=true,fetchOverride}={}){
 const original={AudioContext:globalThis.AudioContext,fetch:globalThis.fetch};let calls=0,inflight=0,maxFetch=0;
 globalThis.AudioContext=Context;
 globalThis.fetch=async(url,options)=>{calls++;inflight++;maxFetch=Math.max(maxFetch,inflight);try{if(fetchOverride){const r=await fetchOverride(url,options);if(r)return r;}const file=String(url).split('/').at(-1);return new Response(file==='manifest.json'?JSON.stringify(manifest):files.get(file),{status:files.has(file)||file==='manifest.json'?200:404});}finally{inflight--;}};
 const a=createAudio(storage);try{a.start();if(load)await until(()=>a.snapshot().ready===files.size);await fn(a,Context.latest,()=>({calls,maxFetch}));}finally{a.pause();await sleep(50);Object.assign(globalThis,original);}
}
test('distributed bank is bounded and every recording has exact provenance',()=>{
 let bytes=0,decoded=0;
 for(const [id,a] of Object.entries(manifest.assets)){
  const b=files.get(a.file);assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256,id);assert.equal(b.length,a.bytes);bytes+=b.length;decoded+=a.decodedBytes;
  assert.equal(a.license,'CC0-1.0');assert.match(a.source,/^https:\/\/(freesound.org|opengameart.org)\//);assert.ok(a.creator&&a.sourceSHA256&&a.sourceURL&&a.processing&&a.metrics);
 }
 assert.ok(bytes<=2*1024*1024);assert.ok(decoded<=16*1024*1024);
 for(const bank of ['step-soft','step-hard','step-wood'])assert.ok(new Set(manifest.banks[bank]).size>=3);
});
test('gesture starts bounded preload without playing or blocking; no event backlog',async()=>{
 await fixture(async(a,c)=>{assert.equal(a.play('dig'),false);assert.equal(a.snapshot().voices,0);await until(()=>a.snapshot().ready===files.size);assert.equal(a.snapshot().voices,0);assert.ok(a.snapshot().loadHighWater<=2);assert.ok(a.snapshot().decodedBytes<=16*1024*1024);assert.ok(a.play('dig'));},{load:false});
});
test('footsteps alternate recorded variants and follow a global minimum gait interval',async()=>{
 await fixture((a,c)=>{let previous;
  for(let i=0;i<24;i++){c.currentTime=i*.4;assert.ok(a.play('step',{sourceId:'player',surface:'grass'}));const asset=a.snapshot().events.at(-1).asset;assert.notEqual(asset,previous);previous=asset;assert.equal(a.play('step',{sourceId:'other',surface:'rock'}),false);}
  assert.ok(a.play('dig'),'step does not suppress dig');for(const kind of ['water','bird','arrival','whale','unknown','toString'])assert.equal(a.play(kind),false);
 });
});
test('30s held pour uses one body, soft release stops, reentry retains phase',async()=>{
 await fixture((a,c)=>{
  assert.ok(a.setContinuous('player:water','water',{active:true}));const source=c.sources[0];
  for(let i=0;i<300;i++){c.currentTime+=.1;a.setContinuous('player:water','water',{active:true});}assert.equal(c.sources.length,1);
  a.setContinuous('player:water','water',{active:false});assert.ok(a.snapshot().continuous[0].releasing);c.currentTime+=.1;a.setContinuous('player:water','water',{active:true});assert.equal(c.sources.length,1);assert.equal(a.snapshot().continuous[0].releasing,false);
  a.setContinuous('player:water','water',{active:false});c.currentTime+=.26;assert.equal(a.snapshot().voices,0);assert.ok(source.stopped&&source.disconnects);
 });
});
test('voice storm including release tails never exceeds twelve voices',async()=>{
 await fixture((a,c)=>{
  a.environment({waterDistance:0,submersion:0});a.setContinuous('player:water','water',{active:true});
  for(let i=0;i<80;i++)a.play('dig',{sourceId:'plot:'+i});
  assert.ok(a.snapshot().voices<=12);assert.ok(a.snapshot().highWater<=12);assert.ok(a.snapshot().continuous.some(v=>v.id==='player:water'));
  c.currentTime+=1;assert.ok(a.play('dig'));a.pause();
 });
});
test('shore/submersion blend uses one phase-stable recording and settles inland',async()=>{
 await fixture((a,c)=>{
  a.environment({x:0,z:-900,waterDistance:0,submersion:0});const source=c.sources[0];
  for(let i=0;i<100;i++){c.currentTime+=.1;a.environment({x:0,z:-900,waterDistance:i%2?8:0,submersion:(i%10)/10});}
  assert.equal(c.sources.length,1);assert.equal(a.snapshot().continuous[0].asset,'shore-loop');assert.ok(!source.stopped);
  a.environment({waterDistance:32,submersion:0});c.currentTime+=1;a.environment({waterDistance:0,submersion:.5});assert.equal(c.sources.length,1);
  a.environment({waterDistance:32});c.currentTime+=2.1;assert.equal(a.snapshot().voices,0);
 });
});
test('pause, mute, rapid resume and load completion cannot replay stale intent',async()=>{
 await fixture(async(a,c)=>{
  a.setContinuous('player:water','water',{active:true});a.pause();assert.equal(a.play('dig'),false);await sleep(50);assert.equal(a.snapshot().voices,0);assert.equal(c.state,'suspended');
  a.start();await Promise.resolve();assert.equal(a.snapshot().voices,0);a.setContinuous('player:water','water',{active:true});a.pause();a.start();await Promise.resolve();assert.equal(a.snapshot().voices,0);
  a.toggle();assert.equal(a.setContinuous('player:water','water',{active:true}),false);a.toggle();await Promise.resolve();assert.equal(a.snapshot().voices,0);assert.ok(a.play('chop'));await sleep(50);assert.equal(c.state,'running');
 });
 await fixture(async(a,c)=>{a.setContinuous('player:water','water',{active:true});a.pause();await sleep(50);assert.equal(a.snapshot().voices,0);a.start();await until(()=>a.snapshot().ready===files.size);assert.equal(a.snapshot().voices,0);},{load:false});
});
test('failed recordings do not block gameplay, retry per explicit resume is bounded',async()=>{
 await fixture(async(a,c,counters)=>{
  await until(()=>a.snapshot().loading===0&&a.snapshot().failed===files.size);assert.equal(a.play('dig'),false);const n=counters().calls;
  for(let i=0;i<20;i++){a.start();a.play('dig');}await sleep(10);assert.equal(counters().calls,n);
  a.pause();a.start();await until(()=>a.snapshot().loading===0&&a.snapshot().failed===files.size);assert.equal(counters().calls,n+files.size);
  a.pause();a.start();await sleep(10);assert.equal(counters().calls,n+files.size);
 },{load:false,fetchOverride:url=>String(url).endsWith('.ogg')?new Response('',{status:404}):null});
});
test('decode finishing after pause may cache but does not create a voice',async()=>{
 await fixture(async(a,c)=>{
  let resolve;c.decodeGate=new Promise(r=>resolve=r);await until(()=>a.snapshot().loading>0);a.pause();resolve();await sleep(50);assert.equal(a.snapshot().voices,0);assert.ok(a.snapshot().ready<=2);assert.equal(c.state,'suspended');
 },{load:false});
});
test('source allocation failures disconnect nodes and never escape into caller',async()=>{
 await fixture((a,c)=>{c.failStart=true;assert.doesNotThrow(()=>{a.play('dig');a.setContinuous('player:water','water',{active:true});a.environment({waterDistance:0});});assert.equal(a.snapshot().voices,0);assert.ok(c.sources.every(s=>s.stopped&&s.disconnects));});
});
test('partial preload never repeats the only available step recording',async()=>{
 await fixture(async(a,c)=>{await until(()=>a.snapshot().loading===0&&a.snapshot().ready===1);assert.ok(a.play('step',{surface:'grass'}));c.currentTime+=.5;assert.equal(a.play('step',{surface:'grass'}),false);},{load:false,fetchOverride:url=>String(url).endsWith('.ogg')&&!String(url).endsWith('step-soft-0.ogg')?new Response('',{status:404}):null});
});
test('oversized manifest is rejected before any recording decode and remains silent',async()=>{
 await fixture(async(a,c,counters)=>{await until(()=>a.snapshot().diagnostics.some(d=>d.reason==='manifest-failed'));assert.equal(a.snapshot().ready,0);assert.equal(a.play('dig'),false);assert.equal(c.sources.length,0);assert.equal(counters().calls,1);},{load:false,fetchOverride:url=>String(url).endsWith('manifest.json')?new Response(JSON.stringify({...manifest,assets:{bad:{file:'bad.ogg',bytes:3*1024*1024,duration:1,channels:1}}})):null});
});
test('deliberate and wheel-driven bell events use the recorded bank and preserve spatial identity',async()=>{
 const {Scene}=await import('three');
 const {createDelightSystem}=await import('../src/delight-runtime.js');
 await fixture((a,c)=>{
  const state={delights:[
   {id:1,kind:'gutter',gx:0,gz:0,baseY:0,rotation:0},
   {id:2,kind:'waterWheel',gx:1,gz:0,baseY:0,rotation:0},
   {id:3,kind:'bell',gx:2,gz:0,baseY:0,rotation:0}
  ]},received=[];
  const system=createDelightSystem({scene:new Scene(),getState:()=>state,getPlayer:()=>({x:0,z:0}),changed(){},event:(kind,point)=>received.push({kind,point,admitted:a.play(kind,point)}),getBodies:()=>[],moveRiders(){},obstacles:()=>[]});
  system.sync();system.use(3);
  assert.equal(received.length,1);assert.equal(received[0].admitted,true);
  assert.deepEqual(received[0].point,{x:4,y:.9,z:0,propId:3,sourceId:'prop:3',material:'copper'});
  assert.equal(a.snapshot().events.at(-1).asset,'bell-0');assert.equal(c.sources[0].loop,false);
  system.use(3);assert.equal(received.length,1,'toy debounce retained');
  c.currentTime=2;system.pour(1,.1);system.update(.1,2);
  assert.equal(received.length,2);assert.equal(received[1].admitted,true);
  assert.deepEqual(received[1].point,received[0].point,'wheel reuses the bell anchor and identity');
  const event=a.snapshot().events.at(-1);assert.equal(event.asset,'bell-0');assert.equal(event.sourceId,'prop:3');assert.ok(event.gain>0&&event.gain<.45);assert.ok(event.pan>0);
  for(const kind of [...manifest.silentKinds,'arbitrary-notification'])assert.equal(a.play(kind),false,kind);
 });
});
test('recorded bell respects repeat, voice caps, natural completion, pause and mute without replay',async()=>{
 await fixture(async(a,c)=>{
  assert.deepEqual(manifest.banks.bell,['bell-0']);assert.ok(!manifest.silentKinds.includes('bell'));
  assert.ok(a.play('bell',{sourceId:'prop:bell'}));
  c.currentTime=.59;assert.equal(a.play('bell',{sourceId:'prop:bell'}),false);
  c.currentTime=.61;assert.ok(a.play('bell',{sourceId:'prop:bell'}));
  c.currentTime=3;assert.equal(a.snapshot().voices,0,'single rings end without a loop');
  assert.ok(c.sources.every(s=>s.stopped&&s.disconnects));
  for(let i=0;i<80;i++)a.play('bell',{sourceId:'prop:'+i});
  assert.ok(a.snapshot().voices<=12);assert.ok(a.snapshot().highWater<=12);
  a.pause();assert.equal(a.play('bell'),false);await sleep(50);assert.equal(a.snapshot().voices,0);assert.equal(c.state,'suspended');
  a.start();await Promise.resolve();assert.equal(a.snapshot().voices,0);assert.ok(a.play('bell'));
  a.toggle();assert.equal(a.play('bell'),false);await sleep(50);assert.equal(a.snapshot().voices,0);
  a.toggle();await Promise.resolve();assert.equal(a.snapshot().voices,0,'unmute never replays a bell');
 });
});


// Exercise the real Return home caller with the real audio engine.
test('Return home restores only active current ambience and preserves paused/muted/failed states',async()=>{
 const {runInNewContext}=await import('node:vm'),main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 const body=main.slice(main.indexOf('function returnHome(){'),main.indexOf('function updateReadable(){'));
 for(const mode of ['active','paused','muted','failed'])await fixture(async(a,c)=>{
  a.environment({waterDistance:0,submersion:0});a.setContinuous('player:water','water',{active:true});a.play('dig');
  if(mode==='paused')a.pause();if(mode==='muted')a.toggle();
  const before=a.snapshot(),noop=()=>{},point={set:noop};
  const scope={audio:a,locked:mode!=='paused',state:{},keys:new Set(['KeyH']),homeHeld:.8,vy:0,rightDrag:false,feet:0,yaw:0,pitch:0,dirty:false,previous:0,
   safeHomeDestination:()=>mode==='failed'?{ok:false,code:'blocked'}:{ok:true,x:0,z:0,feet:0,yaw:0,home:null},homeEnvironment:()=>({}),resetActions:()=>a.setContinuous('player:water','water',{active:false}),
   pos:point,camera:{position:point,rotation:point,updateMatrixWorld:noop},worldRuntime:{update:noop},syncWild:noop,refreshInteractive:noop,save:noop,showHomeStatus:noop,$:()=>({}),t:x=>x,failure:noop};
  assert.equal(runInNewContext(body+';returnHome()',scope),mode!=='failed');
  if(mode==='failed'){assert.deepEqual(a.snapshot(),before);return;}
  await sleep(50);
  for(let i=0;i<120;i++){c.currentTime+=1/60;a.environment({waterDistance:0,submersion:0});}
  const after=a.snapshot();assert.equal(after.paused,mode==='paused');
  assert.equal(after.voices,mode==='active'?1:0,mode);
  if(mode==='active'){assert.equal(after.state,'running');assert.deepEqual(after.continuous.map(v=>v.asset),['shore-loop']);}
  assert.equal(after.events.filter(e=>e.kind==='dig').length,before.events.filter(e=>e.kind==='dig').length,'no one-shot replay');
  assert.ok(!after.continuous.some(v=>v.id==='player:water'),'no held pour replay');
 });
});
