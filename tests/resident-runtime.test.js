import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createResidentSystem} from '../src/resident-runtime.js';import {reconcileResidents,readResidents}from'../src/residents.js';
const house=gx=>[{kind:'roof',gx,gz:0,level:1,rotation:0},...[0,1,2,3].map(rotation=>({kind:rotation===3?'door':'wall',gx,gz:0,level:0,rotation}))];
test('edge-facing inaccessible doorway waits visibly on land without moving through obstruction',()=>{
 const s={buildings:house(13),residents:[]};reconcileResidents(s);let notices=0;
 const stand=(x,z)=>Math.abs(x)<=26.3&&Math.abs(z)<=26.3&&!(x>=24.9&&Math.abs(z)<1.25);
 const system=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:stand,floorHeight:()=>0,notice:()=>notices++,changed:()=>{}});
 for(let i=0;i<40;i++)system.update(.1,i*.1);const r=s.residents[0];assert.notEqual(r.x,null);assert.ok(stand(r.x,r.z));assert.equal(r.arrived,false);assert.equal(notices,1);assert.equal(system.motion.get(r.id).walking,0);assert.equal(system.models.get(r.id).visible,true);
});
test('resident corridor enters through door, reaches rest, and reset clears old models',()=>{
 const s={buildings:house(0),residents:[]};reconcileResidents(s);
 const system=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:()=>true,floorHeight:()=>0,notice:()=>{},changed:()=>{}});
 for(let i=0;i<60;i++)system.update(.1,i*.1);assert.equal(s.residents[0].arrived,true);assert.equal(system.models.size,1);s.residents=[];system.sync();assert.equal(system.models.size,0);
});
test('doorstep excursion returns through corridor and pauses safely when house opens',()=>{
 const s={buildings:house(0),residents:[],plots:{}};reconcileResidents(s);
 let blocked=false;const system=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:(x,z)=>!blocked||x>1.4,floorHeight:()=>0,notice:()=>{},changed:()=>{}});
 for(let i=0;i<250;i++)system.update(.1,i*.1);const r=s.residents[0];assert.equal(r.arrived,true);assert.ok(system.motion.get(r.id).trip);r.status='waiting';const before={x:r.x,z:r.z};system.update(.1,25.1);assert.deepEqual({x:r.x,z:r.z},before);assert.equal(system.motion.get(r.id).trip,null);
 r.status='home';blocked=true;for(let i=0;i<180;i++)system.update(.1,25.2+i*.1);assert.deepEqual({x:r.x,z:r.z},before);assert.equal(r.id,1);
});

test('diver corridor uses home elevation for every stand check and model floor on arrival',()=>{
 const s={buildings:[{kind:'roof',gx:0,gz:25,level:1,rotation:0,baseY:-7.2},...[0,1,2,3].map(rotation=>({kind:rotation===0?'door':'wall',gx:0,gz:25,level:0,rotation,baseY:-7.2}))],residents:[]};reconcileResidents(s);
 const heights=[];const sys=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:(x,z,base)=>{heights.push(base);return base===-7.2;},floorHeight:(x,z,base)=>base+.15,notice:()=>{},changed:()=>{}});
 for(let i=0;i<100;i++)sys.update(.1,i*.1);
 assert.equal(s.residents[0].status,'home');assert.equal(s.residents[0].habitat,'ocean');assert.ok(heights.length>10&&heights.every(y=>y===-7.2));assert.equal(sys.models.get(s.residents[0].id).position.y,-7.05);
});
test('sampled seabed resident receives visible diving gear and suit, not just an ocean label',()=>{
 const s={buildings:house(0).map(b=>({...b,baseY:-7.5})),residents:[]};reconcileResidents(s);
 const sys=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:()=>true,floorHeight:()=>-7.35,notice:()=>{},changed:()=>{}});sys.sync();const model=sys.models.get(s.residents[0].id);
 assert.equal(model.name,'reef-diver');assert.equal(model.userData.diver,true);assert.ok(model.getObjectByName('diver-helmet')?.visible);assert.ok(model.getObjectByName('diver-pack-and-straps')?.visible);
 const bounds=new THREE.Box3().setFromObject(model.getObjectByName('diver-helmet'));assert.ok(bounds.max.y<1.7);assert.ok(bounds.max.x<=.31&&bounds.min.x>=-.31);
});

test('optional outing targets produce repeated visible plant/shore stops and return through home',()=>{
 const s={buildings:house(0),residents:[],plots:{},delights:[]};reconcileResidents(s);
 const targets=[{id:'plant',kind:'plant',x:4,z:2,lookAt:{x:5,z:2}},{id:'shore',kind:'shore',x:4,z:-2}];
 const sys=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:()=>true,floorHeight:()=>0,notice:()=>{},changed:()=>{},getOutingTargets:()=>targets});
 const seen=new Set();let returned=false,maxStep=0,last=null;
 for(let i=0;i<1800;i++){
  sys.update(.1,i*.1);const r=s.residents[0],m=sys.motion.get(r.id);
  if(last)maxStep=Math.max(maxStep,Math.hypot(r.x-last.x,r.z-last.z));last={x:r.x,z:r.z};
  if(m.trip?.acting&&m.trip.outing)seen.add(m.trip.outing.kind);
  if(seen.size&&r.x<.2&&!m.trip)returned=true;
 }
 assert.deepEqual([...seen].sort(),['plant','shore']);assert.ok(returned);assert.ok(maxStep<=.08500001);
 assert.equal(s.residents[0].id,1);assert.equal(s.residents[0].status,'home');
});
test('blocked outing is rejected; live obstruction and home removal never teleport the resident',()=>{
 const s={buildings:house(0),residents:[],plots:{},delights:[]};reconcileResidents(s);let blocked=false;
 const sys=createResidentSystem({scene:new THREE.Scene(),getState:()=>s,canStand:(x)=>!blocked||x<2.6,floorHeight:()=>0,notice:()=>{},changed:()=>{},getOutingTargets:()=>[{id:'plant',kind:'plant',x:4,z:0}]});
 for(let i=0;i<250;i++)sys.update(.1,i*.1);
 blocked=true;const r=s.residents[0],before={x:r.x,z:r.z},id=r.id;
 sys.update(.1,25);assert.ok(Math.hypot(r.x-before.x,r.z-before.z)<=.0600001);
 s.buildings=s.buildings.filter(b=>b.kind!=='roof');reconcileResidents(s);const held={x:r.x,z:r.z};
 for(let i=0;i<100;i++)sys.update(.1,26+i*.1);
 assert.equal(r.id,id);assert.equal(r.status,'waiting');assert.deepEqual({x:r.x,z:r.z},held);
});

test('reloading an outdoor resident retains saved identity and returns without a position jump',()=>{
 const s={buildings:house(0),residents:[],plots:{},delights:[]};reconcileResidents(s);
 const options={scene:new THREE.Scene(),getState:()=>s,canStand:()=>true,floorHeight:()=>0,notice:()=>{},changed:()=>{},getOutingTargets:()=>[{id:'plant',kind:'plant',x:4,z:2}]};
 const first=createResidentSystem(options);
 for(let i=0;i<400;i++){first.update(.1,i*.1);if(first.motion.get(1)?.trip?.acting)break;}
 const before={...s.residents[0]};assert.ok(before.x>3);
 s.residents=readResidents(JSON.parse(JSON.stringify(s.residents)));reconcileResidents(s);
 const restored=createResidentSystem({...options,scene:new THREE.Scene(),getOutingTargets:()=>[]});
 restored.update(.1,0);assert.equal(s.residents[0].x,before.x);assert.equal(s.residents[0].z,before.z);
 let returned=false,previous={...s.residents[0]};
 for(let i=1;i<700;i++){restored.update(.1,i*.1);const r=s.residents[0];assert.ok(Math.hypot(r.x-previous.x,r.z-previous.z)<=.06000001);returned ||= r.x<.2;previous={...r};}
 assert.ok(returned);assert.equal(s.residents[0].id,before.id);assert.equal(s.residents[0].outfit,before.outfit);
});
