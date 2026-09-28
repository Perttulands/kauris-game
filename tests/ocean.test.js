import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,build,remove,serialize,deserialize,dig} from '../src/state.js';
import {findHomes,reconcileResidents} from '../src/residents.js';
import {buildingBoxes,edgeKey,canonicalPiece} from '../src/building.js';
import {TERRAIN,terrainHeight,buildBase} from '../src/terrain.js';
import {verticalStep,swimmingAt} from '../src/movement.js';
const part=(kind,gx=0,gz=0,rotation=0,baseY=0)=>({kind,gx,gz,rotation,baseY,level:kind==='roof'?1:0,material:'wood'});
const room=(gx,gz,baseY)=>[part('floor',gx,gz,0,baseY),...['door','wall','window','wall'].map((kind,r)=>part(kind,gx,gz,r,baseY)),part('roof',gx,gz,3,baseY)];
test('legacy opposite walls preserve exact boxes, boundary14, doorway normals, paid cost and home on repeated reload',()=>{
 const s=freshState();s.buildings=room(13,13,0).map((b,i)=>({...b,id:i+1,cost:b.kind==='floor'?2:b.kind==='door'?4:3}));
 s.inventory.wood=18;reconcileResidents(s);s.residents[0].outfit=2;const before=s.buildings.map(b=>({id:b.id,transform:{gx:b.gx,gz:b.gz,rotation:b.rotation},boxes:buildingBoxes(b),key:edgeKey(b)})),home=findHomes(s.buildings)[0];
 for(const b of s.buildings)delete b.baseY;for(const r of s.residents){delete r.baseY;delete r.habitat;}delete s.player.y;
 const loaded=deserialize(serialize(s));
 for(const p of loaded.buildings){const original=before.find(x=>x.id===p.id);assert.deepEqual(buildingBoxes(p),original.boxes);assert.equal(edgeKey(p),original.key);assert.deepEqual({gx:p.gx,gz:p.gz,rotation:p.rotation},original.transform);}
 assert.ok(loaded.buildings.some(b=>canonicalPiece(b).gx===14));assert.ok(loaded.buildings.some(b=>canonicalPiece(b).gz===14));assert.equal(loaded.buildings.find(b=>b.kind==='roof').rotation,3);
 assert.deepEqual(findHomes(loaded.buildings)[0].doors,home.doors);assert.equal(loaded.residents[0].id,s.residents[0].id);assert.equal(loaded.residents[0].outfit,2);assert.deepEqual(loaded.inventory,s.inventory);
 assert.deepEqual(deserialize(serialize(loaded)),loaded);
 const floor=loaded.buildings.find(b=>b.kind==='floor');assert.equal(remove(loaded,floor.id).ok,false);
});
test('underwater paid home uses seabed elevation, diver identity, repair and reload; farming remains land only',()=>{
 const s=freshState();for(const p of room(0,25,-7.2))assert.ok(build(s,p).ok,JSON.stringify(p));
 assert.equal(s.residents.length,1);assert.equal(s.residents[0].habitat,'ocean');assert.equal(s.residents[0].baseY,-7.2);assert.equal(findHomes(s.buildings).length,1);
 s.player={x:0,y:-5.2,z:49,yaw:0,pitch:.2};const d=deserialize(serialize(s));assert.equal(d.player.y,-5.2);assert.deepEqual(d.residents,s.residents);
 assert.equal(build(d,part('floor',1,25,0,0)).ok,false);assert.equal(build(d,part('floor',1,25,0,-4)).ok,false);assert.equal(dig(d,1,25).ok,false);
 const roof=d.buildings.find(b=>b.kind==='roof'),id=d.residents[0].id;assert.ok(remove(d,roof.id).ok);assert.equal(d.residents[0].status,'waiting');assert.ok(build(d,part('roof',0,25,3,-7.2)).ok);assert.equal(d.residents[0].id,id);assert.equal(d.residents.length,1);
 const bad=JSON.parse(serialize(d));bad.buildings[0].baseY=null;assert.throws(()=>deserialize(JSON.stringify(bad)));
 const badPlayer=JSON.parse(serialize(d));badPlayer.player.y=-100;assert.throws(()=>deserialize(JSON.stringify(badPlayer)));
});
test('flat sand supports home and shared slope permits swimming down, stable depth, surface and shore exit',()=>{
 assert.equal(buildBase(0,25),-7.2);assert.equal(buildBase(0,19),null);assert.equal(terrainHeight(0,27),0);assert.equal(terrainHeight(0,39),-7.2);
 let feet=-3.25,vy=0;
 for(let i=0;i<12;i++)({feet,vy}=verticalStep({x:0,z:45,feet,vy,dt:.1,dive:true,floor:-7.2}));assert.ok(feet< -6);
 const depth=feet;({feet,vy}=verticalStep({x:0,z:45,feet,vy,dt:.1,floor:-7.2}));assert.equal(feet,depth);
 for(let i=0;i<30;i++)({feet,vy}=verticalStep({x:0,z:45,feet,vy,dt:.1,rise:true,floor:-7.2}));assert.ok(Math.abs(feet-(TERRAIN.waterY-1.45))<.001);
 for(let z=39;z>=27;z-=.2)({feet,vy}=verticalStep({x:0,z,feet,vy,dt:.1,floor:terrainHeight(0,z)}));assert.ok(feet>-.01);assert.equal(swimmingAt(0,27,feet),false);
 const capped=verticalStep({x:0,z:50,feet:-7,vy:0,dt:1,rise:true,floor:-7.2,ceil:-4.8});assert.ok(capped.feet+1.65<=-4.8+.00001);
});
test('homes on distinct vertical planes cannot exchange resident identities',()=>{
 const buildings=[...room(0,0,0),...room(0,0,-7.2)],s={buildings,residents:[]};reconcileResidents(s);assert.equal(s.residents.length,2);
 const ids=s.residents.map(r=>[r.baseY,r.id]);s.buildings=s.buildings.filter(b=>b.baseY!==0);reconcileResidents(s);
 assert.equal(s.residents.find(r=>r.baseY===0).status,'waiting');assert.deepEqual(s.residents.map(r=>[r.baseY,r.id]),ids);
});
