import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,dig,plant,fill,water,tick,harvest,build,remove,serialize,deserialize} from '../src/state.js';
function funded(){const s=freshState();harvest(s,-7,-6);harvest(s,-9,-8);return s;}
const piece=(kind='floor',level=0,rotation=0)=>({gx:0,gz:0,kind,level,rotation,material:'wood'});
test('cultivation enforces the sequence; dry and uncovered seeds never grow',()=>{
 const s=freshState();assert.equal(plant(s,0,0,'oak').ok,false);assert.ok(dig(s,0,0).ok);assert.ok(plant(s,0,0,'oak').ok);
 assert.equal(plant(s,0,0,'diamond').ok,false);assert.equal(water(s,0,0,.1).ok,false);
 for(let i=0;i<300;i++)tick(s,.1);assert.equal(s.plots['0,0'].growth,0);fill(s,0,0);
 tick(s,.1);assert.equal(s.plots['0,0'].growth,0);
 for(let i=0;i<220;i++){water(s,0,0,.1);tick(s,.1);}assert.equal(s.plots['0,0'].growth,1);
 const before=s.inventory.wood;assert.ok(harvest(s,0,0).ok);assert.equal(s.inventory.wood,before+18);assert.equal(harvest(s,0,0).ok,false);assert.equal(s.inventory.wood,before+18);
});
test('build costs, shared edges, support and exact refunds',()=>{
 const s=funded();const start=s.inventory.wood;
 assert.equal(build(s,piece('wall')).ok,false);assert.equal(s.inventory.wood,start);
 const f=build(s,piece()).piece;assert.equal(s.inventory.wood,start-2);assert.equal(build(s,piece()).ok,false);
 const wall=build(s,piece('door')).piece;assert.equal(build(s,piece('wall')).ok,false);
 assert.equal(remove(s,f.id).ok,false);const roof=build(s,piece('roof',1)).piece;assert.ok(roof);
 assert.equal(remove(s,wall.id).ok,false);remove(s,roof.id);remove(s,wall.id);remove(s,f.id);assert.equal(s.inventory.wood,start);assert.equal(remove(s,f.id).ok,false);
 assert.equal(build(s,{...piece(),material:'diamond'}).ok,false);
});
test('cultivation and construction do not overlap',()=>{
 const s=funded();dig(s,0,0);assert.equal(build(s,piece()).ok,false);fill(s,0,0);assert.ok(build(s,piece()).ok);assert.equal(dig(s,0,0).ok,false);
 assert.equal(dig(s,100,0).ok,false);
});
test('save round-trip preserves paid structures and plants; tampering cannot issue refunds',()=>{
 const s=funded();build(s,piece());build(s,piece('window'));build(s,piece('roof',1));dig(s,2,2);plant(s,2,2,'diamond');fill(s,2,2);water(s,2,2,.1);tick(s,.1);
 const restored=deserialize(serialize(s));assert.deepEqual(restored,s);
 const bad=JSON.parse(serialize(s));bad.buildings[0].cost=999;assert.throws(()=>deserialize(JSON.stringify(bad)));
 bad.buildings[0].cost=2;bad.buildings.shift();assert.throws(()=>deserialize(JSON.stringify(bad)));
 const inv=JSON.parse(serialize(s));inv.inventory.wood=-1;assert.throws(()=>deserialize(JSON.stringify(inv)));
});
