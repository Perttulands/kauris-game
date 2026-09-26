import test from 'node:test';
import assert from 'node:assert/strict';
import {findHomes,reconcileResidents,readResidents} from '../src/residents.js';
import {freshState,build,remove,serialize,deserialize} from '../src/state.js';
const part=(kind,gx=0,gz=0,rotation=0)=>({kind,gx,gz,rotation,level:kind==='roof'?1:0,material:'wood'});
const room=(gx=0)=>[part('roof',gx),...['door','wall','window','wall'].map((kind,r)=>part(kind,gx,0,r))];
test('complete natural-ground house counts; missing roof, wall or external door does not',()=>{
 const b=room();assert.equal(findHomes(b).length,1);assert.equal(findHomes(b).at(0).cells.length,1);
 for(const kind of ['roof','door','window'])assert.equal(findHomes(b.filter(x=>x.kind!==kind)).length,0);
 assert.equal(findHomes(b.map(x=>x.kind==='door'?{...x,kind:'wall'}:x)).length,0);
 assert.equal(findHomes([part('door')]).length,0);
});
test('connected two-cell enclosure is one home; a missing roof exposes the interior',()=>{
 const b=[part('roof'),part('roof',1),part('door'),part('wall',0,0,1),part('wall',0,0,2),part('wall',1,0,0),part('window',1,0,2),part('wall',1,0,3)];
 assert.equal(findHomes(b).length,1);assert.equal(findHomes(b)[0].cells.length,2);
 assert.equal(findHomes(b.filter(x=>!(x.kind==='roof'&&x.gx===1))).length,0);
 // A real dividing wall can make the remaining roofed room its own enclosed home.
 assert.equal(findHomes([...b.filter(x=>!(x.kind==='roof'&&x.gx===1)),part('wall',0,0,3)]).length,1);
});
test('residents retain identity through opening, repair, reload and harmless wall edits',()=>{
 const s={buildings:room(),residents:[]};reconcileResidents(s);assert.equal(s.residents.length,1);const id=s.residents[0].id;
 s.residents[0].arrived=true;s.residents[0].status='home';s.residents[0].x=.3;s.residents[0].z=.2;s.residents[0].notified=true;
 s.buildings=s.buildings.filter(x=>x.kind!=='roof');reconcileResidents(s);assert.equal(s.residents[0].status,'waiting');
 s.buildings.push(part('roof'));reconcileResidents(s);assert.equal(s.residents[0].status,'home');assert.equal(s.residents[0].id,id);
 s.residents=readResidents(JSON.parse(JSON.stringify(s.residents)));reconcileResidents(s);assert.equal(s.residents.length,1);assert.equal(s.residents[0].notified,true);
 s.buildings=s.buildings.map(x=>x.kind==='window'?{...x,kind:'wall'}:x);reconcileResidents(s);assert.equal(s.residents.length,1);
});
test('separate houses get separate residents; merge and split retain both identities',()=>{
 const s={buildings:[...room(),...room(1)],residents:[]};reconcileResidents(s);assert.equal(s.residents.length,2);
 // Adjacent rooms originally divided by solid wall. Replace shared barrier with an interior door.
 s.buildings=s.buildings.filter(x=>!(x.gx===0&&x.rotation===3&&x.kind==='wall')&&!(x.gx===1&&x.rotation===1&&x.kind==='wall'));
 s.buildings.push(part('door',0,0,3));reconcileResidents(s);assert.equal(s.residents.length,2);assert.equal(s.residents.filter(r=>r.status==='waiting').length,1);
 s.buildings=s.buildings.map(x=>x.kind==='door'&&x.gx===0&&x.rotation===3?{...x,kind:'wall'}:x);reconcileResidents(s);assert.equal(s.residents.length,2);assert.equal(s.residents.filter(r=>r.status==='waiting').length,0);
});
test('normal actual build commands create one resident only on final completion and preserve save',()=>{
 const s=freshState();s.inventory.wood=100;assert.ok(build(s,part('floor')).ok);
 for(const p of room().filter(x=>x.kind!=='roof'))assert.ok(build(s,p).ok);assert.equal(s.residents.length,0);
 const roof=build(s,part('roof'));assert.ok(roof.ok);assert.equal(s.residents.length,1);
 const d=deserialize(serialize(s));assert.deepEqual(d.residents,s.residents);assert.deepEqual(d.inventory,s.inventory);
 remove(d,roof.piece.id);assert.equal(d.residents[0].status,'waiting');build(d,part('roof'));assert.equal(d.residents.length,1);
});
test('overlapping edited home can lose its former anchor without corrupting save identity',()=>{
 const b=[part('roof'),part('roof',1),part('door'),part('wall',0,0,1),part('wall',0,0,2),part('wall',1,0,0),part('window',1,0,2),part('wall',1,0,3)];
 const s={buildings:b,residents:[]};reconcileResidents(s);const id=s.residents[0].id;assert.equal(s.residents[0].anchor,'0,0');
 s.buildings=room(1);reconcileResidents(s);assert.equal(s.residents[0].id,id);assert.equal(s.residents[0].anchor,'1,0');
 assert.deepEqual(readResidents(JSON.parse(JSON.stringify(s.residents))),s.residents);
});
