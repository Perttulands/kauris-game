import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Box3} from 'three';
import {REGIONS,describeChunk,resourceById,sampleWorld} from '../src/world-layout.js';
import {sampleCell,chunkAt} from '../src/surface-grid.js';
import {nearbyResources} from '../src/world-data.js';
import {freshState,serialize,harvest} from '../src/state.js';
import {fullResourceCandidates,createResourceHorizon} from '../src/resource-horizon.js';
import {createStagedTree} from '../src/garden-visuals.js';
import {createWorldRuntime} from '../src/world-runtime.js';
import {createOuterLife} from '../src/outer-life.js';
import {createGardenSystem} from '../src/garden-runtime.js';
import {nearPresentation,showPresentation} from '../src/presentation-distance.js';
import {createMarineLife,MARINE_COUNTS} from '../src/marine.js';
import {MARINE_PROFILES} from '../src/marine-visuals.js';
import {createOceanWorld} from '../src/ocean-visuals.js';
import {TERRAIN,terrainHeight} from '../src/terrain.js';

const points=[[-58,-14],[-8,-66],[64,-24],[-76,62],[250,-130],[0,9]];
const nearby=(s,x,z,r)=>nearbyResources(s,x,z,r).filter(a=>Math.hypot(a.gx*2-x,a.gz*2-z)<=r);
test('distinct sampled destinations frame useful resources and leave open soil without terrain overrides',()=>{
 const s=freshState(),before=serialize(s),centres=['reed-cove','birch-downs','amber-bay','seagrass-sound'];
 for(const id of centres){const r=REGIONS.find(r=>r.id===id),soil=sampleWorld(r.x,r.z),resources=nearby(s,r.x,r.z,16);
  assert.equal(soil.substrate,'soil');assert.equal(soil.waterY,null);assert.ok(resources.length>=4,id);
  assert.ok(resources.every(a=>Math.hypot(a.gx*2-r.x,a.gz*2-r.z)>=5),id+' clear centre');
  assert.ok(resources.some(a=>id==='amber-bay'?['copper','iron','diamond'].includes(a.kind):['birch','pine','willow','oak'].includes(a.kind)));
  assert.ok(r.purpose&&r.route.length>=3);assert.equal(soil.height,sampleCell(soil.gx,soil.gz).height);
 }
 const reef=REGIONS.find(r=>r.id==='reef');assert.ok(sampleWorld(reef.x,reef.z).height<TERRAIN.waterY-2.4);
 assert.equal(serialize(s),before);
});
test('appending composition keeps previous resource IDs resolvable and descriptors deterministic',()=>{
 const old=[[-26,-80,'pine'],[-18,-84,'pine'],[-8,-84,'pine'],[-2,-48,'birch'],[6,-50,'birch'],[-78,-18,'willow'],[-52,10,'willow'],[-76,-14,'flowers'],[82,-28,'pine'],[46,-24,'copper'],[82,-36,'iron'],[78,-14,'flowers'],[-94,74,'willow'],[-94,70,'flowers']];
 old.forEach(([x,z,kind],i)=>{const c=chunkAt(x,z),r=resourceById(`w1:r:${c.cx}:${c.cz}:${i+2}`);assert.equal(r.gx*2,x);assert.equal(r.gz*2,z);assert.equal(r.kind,kind);});
 for(const [x,z] of points){const c=chunkAt(x,z),a=describeChunk(c.cx,c.cz);describeChunk(c.cx+3,c.cz-2);assert.deepEqual(describeChunk(c.cx,c.cz),a);for(const r of a.resources)assert.deepEqual(resourceById(r.id),r);}
});
test('near interaction models stay bounded and do not disappear at the old32m cutoff',()=>{
 const s=freshState();for(const [x,z] of points){const selected=fullResourceCandidates(s,x,z),ids=new Set(selected.map(r=>r.id));assert.ok(selected.filter(r=>r.id.startsWith('w1:')).length<=24);for(const r of nearby(s,x,z,12))assert.ok(ids.has(r.id),'near actor '+r.id);}
 const r=resourceById('w1:r:1:-1:11');assert.ok(fullResourceCandidates(s,r.gx*2+31.9,r.gz*2).some(a=>a.id===r.id));assert.ok(fullResourceCandidates(s,r.gx*2+32.1,r.gz*2).some(a=>a.id===r.id));
});
test('distant species use the authored mature geometry, roots and scale instead of generic crowns',()=>{
 const s=freshState();s.plots['0,0']={gx:0,gz:0,baseY:0,phase:'filled',seed:'golden',growth:1,water:1};const scene=new Scene(),h=createResourceHorizon(scene),before=serialize(s);h.update(s,60,0,new Set());assert.ok(h.snapshot().count<=48);assert.ok(h.snapshot().geometryBytes<6*1024*1024);
 for(const mesh of scene.children){const kind=mesh.name.split(':')[1],model=createStagedTree(kind);model.updateMatrixWorld(true);const actual=new Box3();model.traverseVisible(o=>{if(o.isMesh)actual.union(new Box3().setFromObject(o));});const proxy=mesh.geometry.boundingBox;assert.ok(proxy.min.distanceTo(actual.min)<1e-5);assert.ok(proxy.max.distanceTo(actual.max)<1e-5);assert.ok(mesh.geometry.attributes.color);}
 assert.equal(serialize(s),before);
});
test('nearby presentation hysteresis preserves simulation visibility through repeated boundary crossings',()=>{
 const actor=new Group();actor.position.x=31.9;assert.ok(nearPresentation(actor,0,0,32));
 for(const x of [32.1,31.9,33,32.1]){actor.position.x=x;assert.ok(nearPresentation(actor,0,0,32));}
 actor.position.x=36.1;assert.equal(nearPresentation(actor,0,0,32),false);showPresentation(actor,false);assert.equal(actor.visible,true);
 actor.userData.plot='0,0';actor.position.x=47.9;assert.ok(nearPresentation(actor,0,0,48));actor.position.x=48.1;assert.equal(nearPresentation(actor,0,0,48),false,'no overlap with planted horizon batch');
});
test('garden visitors retain their nearby patch through sorting and harvest',()=>{
 const s=freshState();s.plots={'0,0':{gx:0,gz:0,baseY:0,seed:'flowers',phase:'filled',growth:1,water:1},'4,0':{gx:4,gz:0,baseY:0,seed:'flowers',phase:'filled',growth:1,water:1}};
 let player={x:0,z:2};const garden=createGardenSystem({scene:new Scene(),getState:()=>s,getPlayer:()=>player,canStand:()=>true,onDiscover:()=>{}});
 garden.update(.016,0);const a=garden.readingObjects().find(a=>a.kind==='butterfly'&&a.index===0),root=a.model,at=garden.snapshot().find(a=>a.kind==='butterfly').at;assert.equal(at,'0,0');
 player={x:8,z:2};garden.update(.016,.016);assert.equal(garden.snapshot().find(a=>a.kind==='butterfly').at,at);assert.equal(a.model,root);
 assert.ok(harvest(s,0,0).ok);const before=serialize(s);garden.update(.016,.032);assert.equal(garden.snapshot().find(a=>a.kind==='butterfly').at,at);assert.equal(a.model.visible,true);assert.equal(serialize(s),before);
});
test('outer visitors keep their live identity across chunk boundaries and unrelated persistent edits',()=>{
 const s=freshState(),scene=new Scene(),world=createWorldRuntime(s),life=createOuterLife({scene,state:s,solidsAt:(x,z)=>world.solidsAt(x,z)});
 life.update(.1,{x:63.9,z:-18});const first=life.readingObjects().find(a=>a.id==='w1:h:3');assert.ok(first);const model=first.model;
 for(const x of [64.1,63.9,64.1]){s.plots['0,0']={gx:0,gz:0,baseY:0,phase:'hole',seed:null,growth:0,water:0};life.update(.1,{x,z:-18});assert.equal(life.readingObjects().find(a=>a.id===first.id)?.model,model);}
 for(const [x,z] of points)life.update(.1,{x,z});assert.ok(scene.children.length<=24);
});
test('all marine inhabitants fit the sampled water column and terrace footprint with continuous movement',()=>{
 const reefSolids=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight}).userData.reefSolids,life=createMarineLife({profiles:MARINE_PROFILES,reefSolids});
 const counts=life.animals.reduce((o,a)=>(o[a.kind]=(o[a.kind]??0)+1,o),{});assert.deepEqual(counts,MARINE_COUNTS);
 for(let i=0;i<600;i++){const before=life.snapshot();life.update(1/60);life.animals.forEach((a,j)=>{assert.ok(life.clearAt(a,a.x,a.y,a.z),a.id+' clearance at '+i);assert.ok(Math.hypot(a.x-before[j].x,a.y-before[j].y,a.z-before[j].z)<.03);});}
 const paused=life.snapshot();life.update(0);assert.deepEqual(life.snapshot(),paused);
});
test('world cache and true-species horizon remain within the shared generated-geometry budget on revisits',()=>{
 const s=freshState();s.plots['0,0']={gx:0,gz:0,baseY:0,phase:'filled',seed:'golden',growth:1,water:1};const before=serialize(s),world=createWorldRuntime(s),h=createResourceHorizon(new Scene());
 for(const [x,z] of [...points,...points]){for(let i=0;i<110;i++)world.update(x,z);h.update(s,x,z,new Set(fullResourceCandidates(s,x,z).map(r=>r.id)));const q=world.snapshot();assert.equal(q.active,81);assert.ok(q.detail<=25);assert.ok(q.cache<=100);assert.ok(q.descriptors<=128);assert.ok(q.bytes+h.snapshot().geometryBytes<=24*1024*1024);}
 assert.equal(serialize(s),before);
});
