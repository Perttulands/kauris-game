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

test('actual reef hard masses share collision while the arch stays clear',()=>{
 const ocean=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight}),solids=ocean.userData.reefSolids;
 assert.ok(solids?.length>50,'hard rocks and individual shell cells are supplied');
 assert.equal(reefBlocked(solids,5.15,61.35,-7.2),true,'reachable terrace blocks a seabed swimmer');
 const floor=reefFloor(solids,5.15,61.35,-3,-7.2);assert.ok(floor>-6.5&&floor<-4.8);
 assert.equal(reefBlocked(solids,3.7,62,-7.2),true,'shell support is solid');
 for(let z=59;z<=65;z+=.2)assert.equal(reefBlocked(solids,0,z,-7.2),false,`arch opening z=${z}`);
 const overhead=reefCeiling(solids,0,62.4,-7.2);assert.ok(overhead>-4.5&&overhead<-3,'shell blocks rising through the overhead lip');
});
