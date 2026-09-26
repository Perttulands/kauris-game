import test from 'node:test';
import assert from 'node:assert/strict';
import {convexSolid,solidInterval,reefBlocked,reefFloor,reefCeiling,reefSafeFeet} from '../src/reef-collision.js';
import {createOceanWorld} from '../src/ocean-visuals.js';
import {TERRAIN,terrainHeight} from '../src/terrain.js';
import {verticalStep} from '../src/movement.js';
import {Scene} from 'three';
import {createResidentSystem} from '../src/resident-runtime.js';
import {reconcileResidents} from '../src/residents.js';
import {buildingBoxes,touches} from '../src/building.js';

test('convex reef surfaces block bodies, support descent and stop ascent without box corners',()=>{
 // A sloped triangular prism: the empty upper-left corner must remain empty.
 const s=convexSolid([-1,-7,49,1,-7,49,1,-5,49,-1,-7,51,1,-7,51,1,-5,51]);
 assert.equal(solidInterval(s,2,50),null);
 assert.equal(reefBlocked([s],-.8,50,-5.4,{radius:0,step:0}),false);
 assert.equal(reefBlocked([s],.8,50,-6.8),true);
 assert.ok(Math.abs(reefFloor([s],0,50,-5.8,-7.2)+6)<1e-6);
 const ceiling=reefCeiling([s],0,50,-8.8);
 assert.equal(ceiling,-7);
 const result=verticalStep({x:0,z:50,feet:-8.8,vy:0,dt:.1,rise:true,floor:-10,ceil:ceiling});
 assert.equal(result.feet,-8.65);
 assert.equal(reefSafeFeet([s],0,50,-6.8),solidInterval(s,0,50,.24).maxY);
 assert.equal(reefSafeFeet([s],4,50,-7.2),-7.2);
});

test('actual reef hard masses share collision, while the arch and funded pads stay clear',()=>{
 const ocean=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight}),solids=ocean.userData.reefSolids;
 assert.ok(solids?.length>50,'hard rocks and individual shell cells are supplied');
 assert.equal(reefBlocked(solids,5.15,61.35,-7.2),true,'reachable terrace blocks a seabed swimmer');
 const floor=reefFloor(solids,5.15,61.35,-3,-7.2);assert.ok(floor>-6.5&&floor<-4.8);
 assert.equal(reefBlocked(solids,3.7,62,-7.2),true,'shell support is solid');
 for(let z=59;z<=65;z+=.2)assert.equal(reefBlocked(solids,0,z,-7.2),false,`arch opening z=${z}`);
 const overhead=reefCeiling(solids,0,62.4,-7.2);assert.ok(overhead>-4.5&&overhead<-3,'shell blocks rising through the overhead lip');
 for(const pad of TERRAIN.pads)for(let x=pad.minGX*2-1;x<=pad.maxGX*2+1;x+=.25)for(let z=pad.minGZ*2-1;z<=pad.maxGZ*2+1;z+=.5)
  assert.equal(reefBlocked(solids,x,z,pad.baseY,{radius:.31,height:1.7,step:.3}),false,`build pad clear ${x},${z}`);
 // A last-row outward door has a short real doorstep before the bank. The
 // resident must use that safe corridor, not spawn in rock or wait forever.
 for(const gx of [-3,-2,2,3]){
  const state={buildings:[{kind:'roof',gx,gz:29,level:1,rotation:0,baseY:-7.2},...[0,1,2,3].map(rotation=>({kind:rotation===2?'door':'wall',gx,gz:29,level:0,rotation,baseY:-7.2}))],residents:[]};
  reconcileResidents(state);
  const canStand=(x,z,base)=>!reefBlocked(solids,x,z,base,{radius:.31,height:1.7,step:.3})&&!state.buildings.flatMap(buildingBoxes).some(a=>touches(a,x,z,.31)&&a.maxY>base+.3&&a.minY<base+1.7);
  const system=createResidentSystem({scene:new Scene(),getState:()=>state,canStand,floorHeight:()=>-7.2,notice:()=>{},changed:()=>{}});
  for(let i=0;i<80;i++){system.update(.1,i*.1);const r=state.residents[0];if(Number.isFinite(r.x))assert.ok(canStand(r.x,r.z,-7.2));}
  assert.equal(state.residents[0].arrived,true,`edge-door diver arrives at gx=${gx}`);
 }
});
