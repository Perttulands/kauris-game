import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from 'three';
import {createOuterLife} from '../src/outer-life.js';
import {sampleWorld} from '../src/world-layout.js';
import {propBoxes} from '../src/delights.js';
import {touches} from '../src/building.js';

test('outer crab uses lazy delight callback, physically occupies shelter, and retirement frees claim',()=>{
 const shelter={id:1,kind:'crabShelter',gx:29,gz:11,baseY:sampleWorld(58,22).height,rotation:1,hostId:null,visited:false};
 const state={buildings:[],delights:[shelter]},motion=new Map([[1,{visitorId:null,request:25}]]);let toys=null,visits=0;
 const life=createOuterLife({scene:new Scene(),state,solidsAt:()=>[],getDelights:()=>toys});
 toys={motion,claim(id,actor){const q=motion.get(id);if(q.visitorId&&q.visitorId!==actor)return false;q.visitorId=actor;return true;},release(actor){for(const q of motion.values())if(q.visitorId===actor)q.visitorId=null;},visited(){visits++;shelter.visited=true;}};
 const player={x:60,z:22};let identity=null,inside=false,maxStep=0;
 for(let i=0;i<650;i++){
  const before=new Map(life.readingObjects().map(a=>[a.id,{x:a.x,z:a.z}]));
  life.update(.1,player);
  for(const a of life.readingObjects().filter(a=>a.kind==='crab')){
   if(before.has(a.id))maxStep=Math.max(maxStep,Math.hypot(a.x-before.get(a.id).x,a.z-before.get(a.id).z));
   if(a.shelterId===1){identity??=a.model;assert.equal(a.model,identity);if(Math.hypot(a.x-58,a.z-22)<.045)inside=true;}
   for(const box of propBoxes(shelter))assert.equal(touches(box,a.x,a.z,a.profile.radius)&&box.maxY>a.y+a.profile.minY&&box.minY<a.y+a.profile.maxY,false,'crab must clear shelter solids');
  }
 }
 assert.ok(inside&&visits>0,JSON.stringify({shelter,claims:[...motion],crabs:life.readingObjects().filter(a=>a.kind==='crab').map(({id,x,y,z,shelterId,visitStage})=>({id,x,y,z,shelterId,visitStage}))}));assert.ok(maxStep<=.06500001);
 // Wait until a visitor holds the lease, then retire its actual habitat.
 for(let i=0;i<300&&!motion.get(1).visitorId;i++)life.update(.1,player);
 assert.ok(motion.get(1).visitorId);life.update(.1,{x:400,z:400});assert.equal(motion.get(1).visitorId,null);
});
