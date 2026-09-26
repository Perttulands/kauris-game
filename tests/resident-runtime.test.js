import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createResidentSystem} from '../src/resident-runtime.js';import {reconcileResidents}from'../src/residents.js';
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
