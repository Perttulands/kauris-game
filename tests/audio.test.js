import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio,soundBuffer,soundKind} from '../src/audio.js';
import {PROFILES} from '../src/audio-profiles.js';
class Param {
 constructor(){this.value=0;this.events=[];}
 setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}
 linearRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t]);}
 cancelAndHoldAtTime(t){this.events.push(['hold',t]);}
 cancelScheduledValues(){}
}
class Context {
 constructor(){this.currentTime=0;this.sampleRate=48000;this.state='suspended';this.destination={};this.sources=[];Context.latest=this;}
 node(extra={}){return {disconnects:0,connect(){return this},disconnect(){this.disconnects++},...extra};}
 createGain(){return this.node({gain:new Param()});}
 createStereoPanner(){return this.node({pan:new Param()});}
 createDynamicsCompressor(){return this.node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,new Param()])));}
 createWaveShaper(){return this.node();}
 createBuffer(c,n,r){const data=new Float32Array(n);return {length:n,duration:n/r,sampleRate:r,getChannelData:()=>data};}
 createBufferSource(){const s=this.node({start:()=>{if(this.failStart)throw Error('failure');},stop(){this.stopped=true;}});this.sources.push(s);return s;}
 resume(){this.state='running';return Promise.resolve();}
 suspend(){this.state='suspended';return Promise.resolve();}
 close(){this.state='closed';return Promise.resolve();}
}
const storage={getItem:()=>null,setItem(){}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(fn){const original=globalThis.AudioContext;globalThis.AudioContext=Context;const a=createAudio(storage);try{a.start();await Promise.resolve();await fn(a,Context.latest);}finally{a.pause();await sleep(35);globalThis.AudioContext=original;}}
test('semantic profiles retain action identity for every paid material and unknown requests are silent',async()=>{
 for(const material of ['wood','copper','iron','diamond','fiber'])assert.equal(new Set(['step','dig','chop'].map(k=>soundKind(k,material))).size,3);
 assert.equal(soundKind('nonexistent'),null);
 await fixture((a,c)=>{assert.equal(a.play('nonexistent'),false);assert.equal(a.play('grow'),false);assert.equal(a.play('water'),false);assert.equal(c.sources.length,0);});
});
test('held water survives render stalls; repeat updates reuse one source and re-entry cancels release',async()=>{
 await fixture((a,c)=>{
  a.setContinuous('player:water','water',{active:true});const first=c.sources[0];
  for(let i=0;i<200;i++){c.currentTime+=.1;a.setContinuous('player:water','water',{active:true,gain:.8});}
  c.currentTime+=.5;a.environment({shoreDistance:100});assert.equal(c.sources.length,1);assert.equal(first.stopped,undefined);
  a.setContinuous('player:water','water',{active:false});assert.equal(a.snapshot().continuous[0].releasing,true);
  c.currentTime+=.05;a.setContinuous('player:water','water',{active:true});assert.equal(c.sources.length,1);assert.equal(a.snapshot().continuous[0].releasing,false);
  a.setContinuous('player:water','water',{active:false});c.currentTime+=.04;a.environment({shoreDistance:100});assert.equal(a.snapshot().continuous[0].releasing,true);c.currentTime+=.061;assert.equal(a.snapshot().voices,0);assert.equal(first.stopped,true);
 });
});
test('step does not suppress a dig; independent sources and notification category limits are enforced',async()=>{
 await fixture((a,c)=>{
  assert.ok(a.play('step',{material:'wood'}));assert.ok(a.play('dig',{material:'wood'}));
  assert.ok(a.play('discover',{sourceId:'cache:one',x:0,z:0}));c.currentTime=2;assert.equal(a.play('arrival',{sourceId:'resident:1',x:0,z:0}),false);
  c.currentTime=10.01;assert.ok(a.play('arrival',{sourceId:'resident:1',x:0,z:0}));
  c.currentTime=11;assert.ok(a.play('bell',{sourceId:'bell:1'}));assert.equal(a.play('bell',{sourceId:'bell:2'}),false);
 });
});
test('bounded mix protects player actions and water from a mechanism storm, including release tails',async()=>{
 await fixture((a,c)=>{
  for(let i=0;i<20;i++)a.setContinuous(`prop:${i}:wheel`,'wheel',{active:true,x:i+1,z:0});
  assert.equal(a.snapshot().categories.continuous,4);
  assert.ok(a.setContinuous('player:water','water',{active:true}));
  for(let i=0;i<20;i++)a.play('bell',{sourceId:`b:${i}`,x:0,z:0});
  for(let i=0;i<20;i++)a.play('chop',{sourceId:`p:${i}`});
  assert.ok(a.snapshot().continuous.some(v=>v.id==='player:water'));
  assert.ok(a.play('dig'));assert.ok(a.snapshot().voices<=12);assert.ok(a.snapshot().categories.foreground<=6);assert.ok(a.snapshot().highWater<=12);
  c.currentTime+=.02;a.setContinuous('player:water','water',{active:false});assert.ok(a.snapshot().voices<=12);
 });
});
test('spatial range and shore input are independent of world z; quiet exploration does not notify',async()=>{
 await fixture((a,c)=>{
  assert.equal(a.play('bell',{x:25,z:0}),false);assert.ok(a.play('whale',{x:40,z:0}));
  a.environment({x:0,z:-900,shoreDistance:0,underwater:false});assert.ok(a.snapshot().continuous.some(v=>v.kind==='shore'));
  a.environment({shoreDistance:100});c.currentTime+=.11;assert.ok(!a.snapshot().continuous.some(v=>v.kind==='shore'));
  for(let i=0;i<600;i++){c.currentTime+=.1;a.environment({x:i,z:-900,shoreDistance:5});}
  assert.ok(!a.snapshot().events.some(e=>['discover','arrival'].includes(e.request)));assert.ok(a.snapshot().bufferBytes<16*1024*1024);
 });
});
test('pause/mute release all nodes; rapid resume has no old loop/backlog and muted calls are not queued',async()=>{
 await fixture(async(a,c)=>{
  a.setContinuous('player:water','water',{active:true});a.play('dig');a.pause();assert.equal(a.play('dig'),false);
  await sleep(35);assert.equal(a.snapshot().voices,0);assert.equal(c.state,'suspended');assert.ok(c.sources.every(s=>s.stopped&&s.disconnects));
  a.start();await Promise.resolve();assert.equal(a.snapshot().voices,0);
  a.setContinuous('player:water','water',{active:true});a.pause();a.start();await Promise.resolve();assert.equal(a.snapshot().voices,0);
  a.toggle();assert.equal(a.setContinuous('player:water','water',{active:true}),false);a.toggle();await Promise.resolve();assert.equal(a.snapshot().voices,0);
  assert.ok(a.play('chop'));await sleep(40);assert.equal(c.state,'running');
 });
});
test('failed source allocation and denied storage cannot escape into gameplay',async()=>{
 await fixture((a,c)=>{c.failStart=true;assert.doesNotThrow(()=>{a.play('dig');a.setContinuous('player:water','water',{active:true});a.environment({shoreDistance:0});});assert.equal(a.snapshot().voices,0);assert.ok(c.sources.every(s=>s.stopped&&s.disconnects));});
 const a=createAudio({getItem(){throw Error('denied')},setItem(){throw Error('denied')}});assert.doesNotThrow(()=>{a.start();a.pause();a.toggle()});assert.equal(a.muted,true);
});
test('deterministic continuous buffers have no silent seam or DC drift at either sample rate',()=>{
 for(const rate of [44100,48000])for(const kind of Object.keys(PROFILES).filter(k=>PROFILES[k].loop)){
  const c=new Context();c.sampleRate=rate;const b=soundBuffer(c,soundKind(kind)),data=b.getChannelData(0),n=data.length;
  let mean=0,sum=0;for(const v of data){assert.ok(Number.isFinite(v));mean+=v;sum+=v*v;}
  assert.ok(Math.abs(mean/n)<1e-6);
  const rms=Math.sqrt(sum/n),w=Math.floor(rate*.02);let seam=0;for(let j=-w;j<w;j++)seam+=data[(j+n)%n]**2;
  assert.ok(Math.sqrt(seam/(2*w))>rms*.45,`${kind} boundary RMS`);
  assert.ok(Math.abs(data[0]-data[n-1])<rms*3,`${kind} boundary jump`);
 }
});

test('actual bird calls have independent critter global/source caps and finite range',async()=>{
 await fixture((a,c)=>{
  assert.ok(a.play('bird',{sourceId:'bird:one',x:2,z:0}));
  c.currentTime=2;assert.equal(a.play('bird',{sourceId:'bird:two',x:3,z:0}),false);
  c.currentTime=3.1;assert.equal(a.play('bird',{sourceId:'bird:one',x:2,z:0}),false);assert.ok(a.play('bird',{sourceId:'bird:two',x:3,z:0}));
  assert.ok(a.play('discover',{sourceId:'cache:one',x:2,z:0}),'critter is not a UI notification');
  c.currentTime=7;assert.equal(a.play('bird',{sourceId:'bird:far',x:25,z:0}),false);
  c.currentTime=10.1;assert.ok(a.play('bird',{sourceId:'bird:one',x:2,z:0}));
 });
});
