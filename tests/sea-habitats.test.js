import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from 'three';
import {seaHabitats,SEA_LIMITS} from '../src/sea-habitats.js';
import {createOuterLife} from '../src/outer-life.js';
import {createWhaleMotion} from '../src/whale.js';
import {freshState,serialize} from '../src/state.js';
import {createWorldRuntime} from '../src/world-runtime.js';

test('seeded marine descriptors repeat independently of visit order',()=>{
 const coords=[[-4,0],[2,2],[0,3],[-20,11]],first=coords.map(p=>seaHabitats(...p));
 for(const p of [...coords].reverse())seaHabitats(...p);
 assert.deepEqual(coords.map(p=>seaHabitats(...p)),first);
 const all=first.flat();assert.ok(all.some(m=>m.kind==='habitat-fish'));
 assert.equal(new Set(all.map(m=>m.id)).size,all.length);
});
test('both remote coasts admit schools and crabs with bounded stable live identity',()=>{
 const s=freshState(),before=serialize(s),scene=new Scene(),world=createWorldRuntime(s);
 const life=createOuterLife({scene,state:s,solidsAt:(x,z)=>world.solidsAt(x,z)});
 for(const player of [{x:-70,z:8},{x:80,z:80}]){
  for(let i=0;i<90;i++)life.update(1/30,player);
  const actors=life.readingObjects();
  for(const kind of ['fish','crab'])assert.ok(actors.some(a=>a.kind===kind),kind+' at '+JSON.stringify(player));
  for(const kind of ['fish','crab','bird'])assert.ok(actors.filter(a=>a.kind===kind).length<=SEA_LIMITS[kind]);
  assert.ok(scene.children.length<=24);
  const ids=new Map(actors.map(a=>[a.id,a.model]));
  for(let i=0;i<5;i++)life.update(.1,{x:player.x+.1,z:player.z});
  for(const a of life.readingObjects())if(ids.has(a.id))assert.equal(a.model,ids.get(a.id));
  const paused=life.snapshot();life.update(0,player);assert.deepEqual(life.snapshot(),paused);
 }
 assert.equal(serialize(s),before);
});
test('whale approaches two suitable neighborhoods without reanchoring nearby',()=>{
 const m=createWhaleMotion();
 for(const player of [{x:0,z:80},{x:-180,z:0}]){
  const previous=m.actor.admissions;m.update(.1,player);
  assert.equal(m.actor.active,true);assert.equal(m.actor.admissions,previous+1);
  let surfaced=false;
  for(let i=0;i<650;i++){
   const before={...m.actor};m.update(.1,player);
   assert.equal(m.actor.admissions,previous+1);
   assert.ok(m.clearAt(m.actor.x,m.actor.y,m.actor.z));
   assert.ok(Math.hypot(m.actor.x-before.x,m.actor.y-before.y,m.actor.z-before.z)<.2);
   surfaced ||= m.actor.stage==='surface';
  }
  assert.ok(surfaced,'approach within 90 seconds');
 }
 const a={...m.actor};m.update(0,{x:2000,z:2000});assert.deepEqual(m.actor,a);
});

test('retiring marine rigs disposes each private skeleton texture but retains shared geometry',()=>{
 const scene=new Scene(),life=createOuterLife({scene,state:freshState(),solidsAt:()=>[]});
 for(let i=0;i<30;i++)life.update(.1,{x:-70,z:8});
 const skeletons=new Set(),textures=[],geometries=new Set();let geometryDisposals=0,textureDisposals=0;
 for(const a of life.readingObjects())a.model.traverse(o=>{
  if(o.geometry)geometries.add(o.geometry);
  if(o.isSkinnedMesh)skeletons.add(o.skeleton);
 });
 assert.ok(skeletons.size>0);
 for(const g of geometries)g.addEventListener('dispose',()=>geometryDisposals++);
 for(const sk of skeletons){sk.computeBoneTexture();textures.push(sk.boneTexture);sk.boneTexture.addEventListener('dispose',()=>textureDisposals++);}
 life.update(.1,{x:400,z:400});
 assert.equal(textureDisposals,textures.length);assert.equal(geometryDisposals,0);
 for(const sk of skeletons)assert.equal(sk.boneTexture,null);
});
test('whale respects paid admission bodies and resumes blocked progress without catch-up jumps',()=>{
 const player={x:0,z:80},baseline=createWhaleMotion();baseline.update(.1,player);
 const a=baseline.actor,paid=[{minX:a.x-8,maxX:a.x+8,minY:-20,maxY:10,minZ:a.z-8,maxZ:a.z+8}];
 const saved=JSON.stringify(paid),admitted=createWhaleMotion({paidSolids:()=>paid});admitted.update(.1,player);
 assert.equal(JSON.stringify(paid),saved);
 if(admitted.actor.active){assert.ok(Math.hypot(admitted.actor.x-a.x,admitted.actor.z-a.z)>8);assert.ok(admitted.clearAt(admitted.actor.x,admitted.actor.y,admitted.actor.z));}
 let blockers=[];const m=createWhaleMotion({paidSolids:()=>blockers});
 for(let i=0;i<220;i++)m.update(.1,player);
 const held={...m.actor};blockers=[{minX:held.x-8,maxX:held.x+8,minY:-20,maxY:10,minZ:held.z-8,maxZ:held.z+8}];
 for(let i=0;i<100;i++)m.update(.1,player);
 assert.equal(m.actor.x,held.x);assert.equal(m.actor.z,held.z);
 blockers=[];m.update(.1,player);
 assert.ok(Math.hypot(m.actor.x-held.x,m.actor.y-held.y,m.actor.z-held.z)<.2);
});
