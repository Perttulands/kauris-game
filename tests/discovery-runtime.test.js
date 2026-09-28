import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGardenSystem} from '../src/garden-runtime.js';
import {freshState,serialize,deserialize} from '../src/state.js';
import {DISCOVERIES} from '../src/garden.js';

function runtime(state,player={x:0,z:9}){
 const rewards=[],scene=new THREE.Scene();
 const system=createGardenSystem({scene,getState:()=>state,getPlayer:()=>player,canStand:()=>true,onDiscover:r=>rewards.push(r)});
 system.sync();return {system,rewards,player};
}
function appearance(system,id,collected){
 const root=system.discoveries.get(id);
 assert.ok(root?.visible,'Landmark stays in the scene');
 assert.equal(root.getObjectByName('discovery-landmark').visible,true,'Scenery is retained');
 assert.equal(root.getObjectByName('discovery-cache').visible,!collected,'Only uncollected tokens are visible');
 assert.equal(root.getObjectByName('discovery-glints').visible,!collected,'Only uncollected sparkles are visible');
}
test('real proximity discovery hides token and sparkles immediately; revisits do not reward again',()=>{
 const state=freshState(),before=structuredClone({inventory:state.inventory,buildings:state.buildings,plots:state.plots}),r=runtime(state);
 for(const d of DISCOVERIES){
  appearance(r.system,d.id,false);r.player.x=d.x;r.player.z=d.z;r.system.update(.1,1);
  appearance(r.system,d.id,true);assert.ok(state.unlockedSeeds.includes(d.unlock));
  r.system.update(.1,2);assert.equal(r.rewards.filter(x=>x.id===d.id).length,1);
 }
 assert.deepEqual(r.rewards.map(x=>x.newSeed),[true,true,false]);
 assert.deepEqual({inventory:state.inventory,buildings:state.buildings,plots:state.plots},before);
});
test('saved discoveries start hidden on sync before any unpaused frame, without rewards or migration',()=>{
 const state=freshState(),r=runtime(state);
 for(const d of DISCOVERIES){r.player.x=d.x;r.player.z=d.z;r.system.update(.1,1);}
 const raw=serialize(state),loaded=deserialize(raw),restored=runtime(loaded);
 for(const d of DISCOVERIES)appearance(restored.system,d.id,true);
 assert.deepEqual(loaded,state);assert.deepEqual(restored.rewards,[]);
 restored.system.sync();restored.system.update(.1,20);
 assert.deepEqual(restored.rewards,[]);assert.equal(serialize(loaded),raw);
});
