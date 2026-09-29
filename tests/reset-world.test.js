import test from 'node:test';import assert from 'node:assert/strict';
import {createMarineLife,MARINE_COUNTS} from '../src/marine.js';
import {MARINE_PROFILES} from '../src/marine-visuals.js';
import {createWorldRuntime} from '../src/world-runtime.js';
import {freshState} from '../src/state.js';
import {createOceanWorld} from '../src/ocean-visuals.js';
import {TERRAIN,terrainHeight} from '../src/terrain.js';
import {createWhaleMotion} from '../src/whale.js';
import {createOuterLife} from '../src/outer-life.js';
import {Scene,Box3,Raycaster,Vector3,Mesh} from 'three';
import {createWorldChunk} from '../src/world-visuals.js';
import {describeChunk} from '../src/world-layout.js';
const world=createWorldRuntime(freshState()),reef=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight}).userData.reefSolids;
const solidsAt=(x,z)=>world.solidsAt(x,z);
test('complete marine population moves continuously clear of generated and authored hard geometry',()=>{
 const m=createMarineLife({profiles:MARINE_PROFILES,reefSolids:reef,solidsAt}),counts={};for(const a of m.animals)counts[a.kind]=(counts[a.kind]??0)+1;assert.deepEqual(counts,MARINE_COUNTS);
 for(let i=0;i<1800;i++){const old=m.snapshot();m.update(1/30);for(const [j,a] of m.animals.entries()){assert.ok(m.clearAt(a,a.x,a.y,a.z),a.id);assert.ok(Math.hypot(a.x-old[j].x,a.y-old[j].y,a.z-old[j].z)<.04);}}
 const a=m.animals[0],fake={minX:a.x-1,maxX:a.x+1,minZ:a.z-1,maxZ:a.z+1,minY:a.y-1,maxY:a.y+1,planes:[]};const blocked=createMarineLife({profiles:MARINE_PROFILES,solidsAt:()=>[fake]});assert.equal(blocked.clearAt(a,a.x,a.y,a.z,false),false,'callback participates in actual clearance');
});
test('whale completes repeated sampled-body routes without terrain snapping or solid intersection',()=>{
 const solidsAt=(x,z)=>[...reef,...world.solidsAt(x,z)],m=createWhaleMotion({solidsAt}),stages=new Set();let blows=0,travel=0;
 for(let i=0;i<5000;i++){const a=m.actor,old=[a.x,a.y,a.z];m.update(.1,{z:80});stages.add(a.stage);if(a.blow)blows++;assert.ok(m.clearAt(a.x,a.y,a.z));const d=Math.hypot(a.x-old[0],a.y-old[1],a.z-old[2]);assert.ok(d<.2);travel+=d;}
 assert.equal(stages.size,5);assert.ok(blows>=2);assert.ok(travel>80);const before=JSON.stringify(m.actor);m.update(0,{z:80});assert.equal(JSON.stringify(m.actor),before);
});

test('outer fish remain in the sampled water column and flying birds fit their declared scaled bodies',()=>{
 const state=freshState(),life=createOuterLife({scene:new Scene(),state,solidsAt});
 for(let i=0;i<600;i++){life.update(1/30,{x:-58,z:-14});for(const a of life.readingObjects()){
  if(a.kind==='fish'){const r=a.profile.radius;for(const [dx,dz] of [[0,0],[r,0],[-r,0],[0,r],[0,-r]])assert.ok(a.y+a.profile.minY>=terrainHeight(a.x+dx,a.z+dz)+.2);assert.ok(a.y+a.profile.maxY<=TERRAIN.waterY-.18);}
  if(a.kind==='bird'){assert.ok(a.y-terrainHeight(a.x,a.z)>2);const b=new Box3().setFromObject(a.model);assert.ok(b.min.y>=a.y+a.profile.minY);assert.ok(b.max.y<=a.y+a.profile.maxY);}
 }}assert.ok(life.readingObjects().some(a=>a.kind==='fish'));assert.ok(life.readingObjects().some(a=>a.kind==='bird'));
});

test('passable island reeds do not swallow the harvest ray while hard scenery remains raycastable',()=>{
 const d=describeChunk(-3,1),chunk=createWorldChunk(d),plants=chunk.group.getObjectByName('botanical-verges'),stone=chunk.group.getObjectByName('hard-shore-stone');assert.ok(plants);chunk.group.updateMatrixWorld(true);
 const from=new Vector3(-70.27608822822276,1.7,61.99230522950063),direction=new Vector3(.06645277786543427,-.2188151222340046,-.9735008837159239),ray=new Raycaster(from,direction,0,6);
 const formerlyBlocked=[];Mesh.prototype.raycast.call(plants,ray,formerlyBlocked);assert.ok(formerlyBlocked.length,'the old soft-cover ray really intersected this failed approach');assert.equal(ray.intersectObject(plants).length,0);if(stone)assert.notEqual(stone.raycast,plants.raycast);chunk.dispose();
});
