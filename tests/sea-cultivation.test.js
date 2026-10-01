import {gardenAttractors} from '../src/garden.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Scene} from 'three';
import {createOuterLife} from '../src/outer-life.js';
import {createWorldRuntime} from '../src/world-runtime.js';
import {freshState,dig,plant,fill,tick,harvest,serialize,deserialize,SEEDS,validateDig,validatePlant,plotMoisture} from '../src/state.js';
import {sampleCell,cellAt,surfaceAt} from '../src/surface-grid.js';
import {createTree,animateTree} from '../src/visuals.js';
import {plantVolume,submergedPlantSolids} from '../src/cultivation.js';
import {plotStage} from '../src/readable-state.js';
test('existing trees and three sea crops grow naturally at saved seabed height and pay once',()=>{
 for(const kind of ['oak','kelp','coralPlant','pearlPlant']){
  const s=freshState(),inventory={...s.inventory};
  assert.ok(dig(s,1,30).ok);assert.ok(plant(s,1,30,kind).ok);
  const hole=serialize(s);for(let i=0;i<20;i++)tick(s,.1);assert.equal(serialize(s),hole,'uncovered seed does not grow');
  assert.equal(fill(s,1,30).code,'message.coveredUnderwater');const p=s.plots['1,30'];assert.equal(p.baseY,sampleCell(1,30).height);assert.equal(plotMoisture(p),1);assert.equal(plotStage(p),'wet');
  tick(s,0);const saved=deserialize(serialize(s));assert.deepEqual(saved.plots['1,30'],p);
  for(let i=0;i<Math.ceil(SEEDS[kind].seconds*10)+2;i++)tick(saved,.1);
  assert.equal(saved.plots['1,30'].growth,1);assert.ok(Object.values(gardenAttractors(saved)).every(list=>!list.some(p=>p.gx===1&&p.gz===30)),'land visitors never spawn underwater');assert.equal(saved.plots['1,30'].water,1);
  assert.ok(harvest(saved,1,30).ok);assert.equal(harvest(saved,1,30).ok,false);
  assert.equal(saved.inventory[SEEDS[kind].resource],inventory[SEEDS[kind].resource]+SEEDS[kind].yield);
 }
});
test('sea seeds reject dry planting without mutation and reject invalid dry saves',()=>{
 const s=freshState();assert.ok(dig(s,0,3).ok);const before=serialize(s);
 assert.equal(validatePlant(s,0,3,'kelp').code,'message.seaSeedWater');assert.equal(plant(s,0,3,'kelp').ok,false);assert.equal(serialize(s),before);
 const bad=JSON.parse(before);bad.plots['0,3'].seed='kelp';assert.throws(()=>deserialize(JSON.stringify(bad)),/Sea seed/);
 assert.ok(plant(s,0,3,'oak').ok);assert.equal(fill(s,0,3).code,'message.covered');tick(s,.1);assert.equal(s.plots['0,3'].growth,0,'dry land still needs watering');
});
test('submerged paid objects retain priority and moisture is effective before first active tick',()=>{
 const s=freshState();assert.ok(dig(s,1,30).ok);
 s.delights.push({id:99,kind:'lamp',gx:2,gz:30,baseY:sampleCell(2,30).height,rotation:0,hostId:null});
 const before=serialize(s);assert.equal(validatePlant(s,1,30,'oak').ok,false);assert.equal(serialize(s),before);
 assert.equal(plotMoisture({gx:1,gz:30,phase:'filled',water:0}),1);
 s.delights=[];assert.ok(plant(s,1,30,'kelp').ok);
 const volumes=submergedPlantSolids(s,2,60);assert.equal(volumes.length,2);assert.ok(volumes.some(v=>v.minY===s.plots['1,30'].baseY));
});
test('sea factory poses fit gameplay reserve and never move the plot root',()=>{
 for(const kind of ['kelp','coralPlant','pearlPlant'])for(let variation=0;variation<3;variation++){
  const g=createTree(kind,{variation}),p={gx:1,gz:30,baseY:-6,seed:kind,growth:1},v=plantVolume(p,{reserve:true});g.position.set(2,-6,60);
  for(const growth of [0,.3,.7,1])for(const time of [0,2,7]){
   animateTree(g,{growth,time});const b=new Box3().setFromObject(g);
   assert.ok(b.min.x>=v.minX-1e-6&&b.max.x<=v.maxX+1e-6&&b.min.z>=v.minZ-1e-6&&b.max.z<=v.maxZ+1e-6);
   assert.ok(b.min.y>=v.minY-1e-6&&b.max.y<=v.maxY+1e-6);assert.deepEqual(g.position.toArray(),[2,-6,60]);
  }
 }
});

test('occupied seabed digging previews and commits reject without mutation; crabs avoid open holes on reload',()=>{
 const s=freshState(),world=createWorldRuntime(s),make=()=>createOuterLife({scene:new Scene(),state:s,solidsAt:(x,z)=>[...world.solidsAt(x,z),...submergedPlantSolids(s,x,z)]});
 const life=make(),player={x:-70,z:8};for(let i=0;i<90;i++)life.update(1/30,player);
 const crab=life.readingObjects().find(a=>a.kind==='crab'&&validateDig(s,cellAt(a.x,a.z).gx,cellAt(a.x,a.z).gz).ok);assert.ok(crab);
 const cell=cellAt(crab.x,crab.z),actors=[{x:crab.x,z:crab.z,feet:crab.y+crab.profile.minY,height:crab.profile.maxY-crab.profile.minY,radius:crab.profile.radius}],before=serialize(s);
 const preview=validateDig(s,cell.gx,cell.gz,{actors});assert.equal(preview.code,'message.creatureRoom');assert.deepEqual(dig(s,cell.gx,cell.gz,{actors}),preview);assert.equal(serialize(s),before);
 assert.ok(dig(s,cell.gx,cell.gz).ok);const reloaded=make();
 for(let i=0;i<300;i++){reloaded.update(1/30,player);for(const a of reloaded.readingObjects().filter(a=>a.kind==='crab'))assert.equal(surfaceAt(s,a.x,a.z).floor,a.y);}
});
