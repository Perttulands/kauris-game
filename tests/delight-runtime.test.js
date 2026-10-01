import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createDelightSystem} from '../src/delight-runtime.js';import {createMarineLife} from '../src/marine.js';import {MARINE_PROFILES}from'../src/marine-visuals.js';import {createWhaleMotion}from'../src/whale.js';import {terrainHeight,TERRAIN}from'../src/terrain.js';
const prop=(kind,id,gx,gz=0)=>({kind,id,gx,gz,rotation:0,baseY:0,hostId:null,cost:1,liftY:0,on:true,visited:false});
function system(props){const state={delights:props},events=[],sys=createDelightSystem({scene:new THREE.Scene(),getState:()=>state,getPlayer:()=>({x:0,z:0}),changed:()=>{},event:(...args)=>events.push(args),getBodies:()=>[],moveRiders:()=>{},obstacles:()=>[]});sys.sync();return {sys,events,state};}
test('switching a lamp preserves the same edge ray and other lamps brightness',()=>{
 const {sys}=system([prop('lamp',1,2,1),prop('lamp',2,4,1)]),model=sys.models.get(1),other=sys.models.get(2);
 const origin=new THREE.Vector3(4.270344941584865,1.7,4.481484499386531),direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(-.29,.11,0,'YXZ'));
 const ray=new THREE.Raycaster(origin,direction,0,3),distances=[],brightness=[];
 for(let i=0;i<3;i++){
  sys.update(.01,.01*i);model.updateMatrixWorld(true);
  const hit=ray.intersectObject(model,true)[0];assert.ok(hit,'Same aimed lamp surface survives each switch');distances.push(hit.distance);
  brightness.push(model.getObjectByName('light-core').children[0].material.emissiveIntensity);
  assert.equal(other.getObjectByName('light-core').children[0].material.emissiveIntensity,.28);
  sys.use(1);
 }
 assert.ok(Math.max(...distances)-Math.min(...distances)<1e-10);
 assert.deepEqual(brightness,[.28,0,.28]);
});
test('lamp-pattern response ignores creation order; bell impulse and held pour move actual factory nodes',()=>{
 for(const reverse of [false,true]){const props=[prop('curtain',1,0),prop('lamp',2,1)];if(reverse)props.reverse();const {sys}=system(props);sys.update(.1,.1);assert.equal(sys.models.get(1).getObjectByName('light-pattern').visible,true);sys.use(2);sys.update(.1,.2);assert.equal(sys.models.get(1).getObjectByName('light-pattern').visible,false);}
 const {sys,events}=system([prop('gutter',1,0),prop('waterWheel',2,1),prop('bell',3,2)]);sys.pour(1,.1);sys.update(.1,.1);assert.equal(sys.models.get(1).getObjectByName('pour-stream').visible,true);assert.ok(sys.models.get(2).getObjectByName('rotor').rotation.z!==0);assert.ok(events.some(e=>e[0]==='bell'));sys.update(.1,.2);assert.notEqual(sys.models.get(3).getObjectByName('bell-pivot').rotation.z,0);for(let i=0;i<70;i++)sys.update(.1,.3+i*.1);assert.equal(sys.motion.get(2).flow,0);
});
test('crab reaches placed shelter physically, settles inside and responds to bell without position jump',()=>{
 const shelter={...prop('crabShelter',1,3,20),rotation:3,baseY:terrainHeight(6,40)},visited=[];const life=createMarineLife({profiles:MARINE_PROFILES});life.setDelights([shelter],{claim:()=>true,release:()=>{},visited:id=>visited.push(id)});const a=life.animals.find(a=>a.id==='crab:2');let maxStep=0,inside=false,greeted=false;
 for(let i=0;i<1600;i++){const x=a.x,z=a.z;life.update(.1,null);maxStep=Math.max(maxStep,Math.hypot(a.x-x,a.z-z));if(Math.hypot(a.x-6,a.z-40)<.06){inside=true;if(!greeted){life.greet({x:6,z:42});life.update(.1,null);assert.equal(a.activity,'alert');greeted=true;}}}assert.ok(visited.length>0,JSON.stringify(a));assert.ok(inside&&greeted);assert.ok(maxStep<=.066);assert.ok(a.homeCooldown>0);
});
test('fish reach either exterior window axis while panes and home interiors stay solid',()=>{
 for(const axis of [0,1]){
  const part=(kind,rotation=0,id=1)=>({id,kind,gx:5,gz:24,baseY:terrainHeight(10,48)+.6,level:kind==='roof'?1:0,rotation,material:'diamond'});
  const buildings=[part('floor',0,1),part('roof',0,2),...[0,1,2,3].map(r=>part(r===axis?'window':r===(axis+2)%4?'door':'wall',r,3+r))];
  const life=createMarineLife({profiles:MARINE_PROFILES,buildings}),window=life.windows[0],fish=life.animals.find(a=>a.kind==='fish');
  // Place the approach fixture clear of the sampled-terrain turtle/school spawn.
  Object.assign(fish,{x:window.x+window.nx*1.5,y:window.y,z:window.z+window.nz*1.5});
  assert.ok(life.clearAt(fish,fish.x,fish.y,fish.z),'Approach starts clear of terrain and other animals');
  assert.ok(life.clearAt(fish,window.x,window.y,window.z,false),'Empty water outside the glass is reachable');
  assert.equal(life.clearAt(fish,window.x-window.nx*.95,window.y,window.z-window.nz*.95,false),false,'Physical glass still blocks');
  assert.equal(life.clearAt(fish,10,window.y,48,false),false,'Home interior stays reserved');
  let visitor=null,departed=false,maxStep=0;
  for(let i=0;i<800;i++){
   const before=new Map(life.animals.map(a=>[a.id,[a.x,a.y,a.z]]));life.update(.1,null);
   for(const a of life.animals){const p=before.get(a.id);maxStep=Math.max(maxStep,Math.hypot(a.x-p[0],a.y-p[1],a.z-p[2]));
    if(a.windowId===window.id&&Math.hypot(a.x-window.x,a.y-window.y,a.z-window.z)<.2)visitor=a.id;
    if(visitor===a.id&&a.windowCooldown>0&&a.windowId===null)departed=true;
   }
  }
  assert.ok(visitor,'A real fish reaches the window');assert.ok(departed,'The visit ends and returns to ordinary movement');assert.ok(maxStep<.08,'No teleport through the reservation');
  const incomplete=createMarineLife({profiles:MARINE_PROFILES,buildings:buildings.filter(b=>b.kind!=='roof')});
  assert.ok(incomplete.clearAt(fish,window.x,window.y,window.z,false),'Paid floor identifies the unfinished interior; exterior water stays reachable');
  assert.equal(incomplete.clearAt(fish,10,window.y,48,false),false,'Unfinished interior remains reserved');
  assert.equal(incomplete.clearAt(fish,window.x-window.nx*.95,window.y,window.z-window.nz*.95,false),false,'Unfinished physical glass stays solid');
 }
});
test('whale remains continuously in reachable water with full vertical and horizontal envelope',()=>{
 const motion=createWhaleMotion(),a=motion.actor,stages=new Set();let blows=0,maxStep=0;for(let i=0;i<5000;i++){const old=[a.x,a.y,a.z],wasActive=a.active;motion.update(.1,{z:80});stages.add(a.stage);if(a.blow)blows++;if(wasActive)maxStep=Math.max(maxStep,Math.hypot(a.x-old[0],a.y-old[1],a.z-old[2]));assert.ok(a.x-a.profile.radius>TERRAIN.minX&&a.x+a.profile.radius<TERRAIN.maxX);assert.ok(a.z+a.profile.radius<TERRAIN.maxZ);assert.ok(a.y+a.profile.minY>terrainHeight(a.x,a.z-a.profile.radius));}assert.equal(stages.size,5);assert.ok(blows>=2);assert.ok(maxStep<.2,maxStep);const before=JSON.stringify(a);assert.equal(JSON.stringify(a),before);
});
import {freshState,build,serialize,deserialize}from'../src/state.js';import {placeDelight,propBoxes}from'../src/delights.js';import {buildingBoxes,touches}from'../src/building.js';import {createResidentSystem}from'../src/resident-runtime.js';
import {createGardenSystem} from '../src/garden-runtime.js';
test('bird settles onto the shared authored perch instead of stopping short of it',()=>{
 const {sys}=system([prop('birdhouse',1,0)]),state=freshState();state.delights=[prop('birdhouse',1,0)];
 const garden=createGardenSystem({scene:new THREE.Scene(),getState:()=>state,getPlayer:()=>({x:0,z:0}),canStand:()=>true,getDelights:()=>sys,onDiscover:()=>{}});
 for(let i=0;i<360;i++)garden.update(.05,i*.05);
 const bird=garden.snapshot().find(a=>a.kind==='bird'&&a.at==='birdhouse:1'),perch=sys.anchor(1,'perch');
 assert.ok(bird);assert.equal(bird.perch,1);assert.ok(Math.hypot(bird.x-perch.x,bird.y-perch.y,bird.z-perch.z)<.001);
});
test('actual resident boarding uses clear midpoint, carries both ways and reloads supported identity; hammock uses moving seat',()=>{
 for(const kind of ['lift','hammock']){
  let state=freshState();for(const k of Object.keys(state.inventory))state.inventory[k]=100;
  for(const b of [{kind:'floor',rotation:0,level:0},...[0,1,2,3].map(rotation=>({kind:rotation===0?'door':'wall',rotation,level:0})),{kind:'roof',rotation:0,level:1}])assert.ok(build(state,{...b,gx:0,gz:0,baseY:0,material:'wood'}).ok);
  assert.ok(placeDelight(state,{kind,gx:0,gz:-2,baseY:0,rotation:0,hostId:null}).ok);
  const scene=new THREE.Scene(),obstacles=()=>[...state.buildings.flatMap(buildingBoxes),...state.delights.flatMap(p=>propBoxes(p))];let resident;
  const toys=createDelightSystem({scene,getState:()=>state,getPlayer:()=>({x:10,z:10}),changed:()=>{},event:()=>{},getBodies:()=>resident.bodies(),moveRiders:(ids,d)=>resident.carry(ids,d),obstacles:id=>[...state.buildings.flatMap(buildingBoxes),...state.delights.flatMap(p=>p.id===id?propBoxes(p).slice(0,-1):propBoxes(p))]});toys.sync();
  resident=createResidentSystem({scene,getState:()=>state,canStand:(x,z)=>!obstacles().some(a=>touches(a,x,z,.31)&&a.maxY>.3&&a.minY<1.7),floorHeight:(x,z)=>Math.abs(x)<1&&Math.abs(z)<1?.15:0,notice:()=>{},changed:()=>{},getDelights:()=>toys});
  let highest=0,sat=false,roundtrip=false,reloaded=false;
  for(let i=0;i<1500;i++){resident.update(.1,i*.1);toys.update(.1,i*.1);const r=state.residents[0],m=resident.motion.get(r.id),p=state.delights[0];highest=Math.max(highest,resident.models.get(r.id).position.y);if(kind==='hammock'&&m.sit&&m.trip?.propId){if(!sat){
   const loaded=deserialize(serialize(state)),{sys:restoredToys}=system(loaded.delights);
   const restored=createResidentSystem({scene:new THREE.Scene(),getState:()=>loaded,canStand:(x,z)=>!obstacles().some(a=>touches(a,x,z,.31)&&a.maxY>.3&&a.minY<1.7),floorHeight:(x,z)=>Math.abs(x)<1&&Math.abs(z)<1?.15:0,notice:()=>{},changed:()=>{},getDelights:()=>restoredToys});
   restored.sync();const seated=restored.models.get(r.id),seat=restoredToys.anchor(p.id,'seat');
   assert.equal(seated.getObjectByName('housewarming-bundle').visible,false,'Unpacked gift bundle stays hidden after reload');assert.equal(restored.motion.get(r.id).sit,1,'Reload is supported even before active updates');assert.ok(Math.abs(seated.position.y+.171-seat.y)<1e-8);
   restored.update(.1,0);assert.equal(restored.motion.get(r.id).sit,1);assert.equal(restored.motion.get(r.id).trip.propId,p.id);
   let returned=false;for(let j=0;j<400;j++){restored.update(.1,j*.1);if(!restored.motion.get(r.id).trip&&Math.hypot(loaded.residents[0].x,loaded.residents[0].z)<1){returned=true;break;}}
   assert.ok(returned,'Recovered rest leaves by ordinary supported route');assert.equal(loaded.residents[0].id,r.id);
   assert.deepEqual(loaded.inventory,state.inventory);assert.deepEqual(loaded.buildings,state.buildings);toys.use(p.id);
  }sat=true;const seat=toys.anchor(p.id,'seat'),model=resident.models.get(r.id);assert.ok(Math.hypot(model.position.x-seat.x,model.position.y+.171-seat.y,model.position.z-seat.z)<.04);}if(kind==='lift'&&r.rideId&&p.liftY>1&&!reloaded){const d=deserialize(serialize(state));assert.equal(d.residents[0].rideId,p.id);assert.equal(d.delights[0].liftY,p.liftY);reloaded=true;}if(reloaded&&r.rideId===null&&p.liftY===0)roundtrip=true;}
  assert.equal(state.residents[0].gifts,true);assert.equal(state.residents[0].welcomeStage,2);
  if(kind==='lift'){assert.ok(highest>2.54,highest);assert.ok(reloaded&&roundtrip);}else assert.ok(sat);
 }
});

test('original crab zero can claim and enter its nearby shelter, not only crab two',()=>{
 const shelter={...prop('crabShelter',1,3,16),rotation:3,baseY:terrainHeight(6,32)},owners=new Map(),visited=[];
 const life=createMarineLife({profiles:MARINE_PROFILES});
 life.setDelights([shelter],{claim:(id,a)=>{if(owners.has(id)&&owners.get(id)!==a)return false;owners.set(id,a);return true;},release:a=>{for(const [id,o] of owners)if(o===a)owners.delete(id);},visited:id=>visited.push(id)});
 let zeroInside=false;
 for(let i=0;i<800;i++){life.update(.1,null);const a=life.animals.find(a=>a.id==='crab:0');zeroInside ||= a.shelterId===1&&Math.hypot(a.x-6,a.z-32)<.045;}
 assert.ok(zeroInside&&visited.length>0);
});
