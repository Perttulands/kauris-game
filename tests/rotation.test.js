import test from 'node:test';
import assert from 'node:assert/strict';
import {rotationCount,placementTransform,canonicalPiece,edgeKey,adjacentCells,buildingBoxes} from '../src/building.js';
import {freshState,build,serialize,deserialize,PIECES} from '../src/state.js';
import {findHomes,reconcileResidents} from '../src/residents.js';
import {createMarineLife} from '../src/marine.js';
import {MARINE_PROFILES} from '../src/marine-visuals.js';
import {DELIGHT_KEYS} from '../src/delights.js';

const piece=(kind,gx=0,gz=0,rotation=0,baseY=0)=>({kind,gx,gz,rotation,baseY,level:kind==='roof'?1:0,material:'wood'});
const funded=()=>{const s=freshState();for(const material in s.inventory)s.inventory[material]=100;return s;};
const paid=(b,id)=>({...b,id,cost:PIECES[b.kind].cost});
const orderedBoxes=b=>buildingBoxes(b).map(a=>Object.fromEntries(Object.entries(a).map(([k,v])=>[k,Math.round(v*1e8)/1e8]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
function opposite(b){const c=canonicalPiece(b),rotation=(b.rotation+2)%4;return {...b,gx:c.gx-(rotation===3?1:0),gz:c.gz-(rotation===2?1:0),rotation};}

test('shared UI rotation count collapses only plain walls, retaining every other selection at four',()=>{
 for(const kind of [...Object.keys(PIECES),...DELIGHT_KEYS]){
  let rotation=0;const seen=[];for(let i=0;i<4;i++){seen.push(rotation);rotation=(rotation+1)%rotationCount(kind);}
  assert.deepEqual(seen,kind==='wall'?[0,1,0,1]:[0,1,2,3],kind);
 }
});

test('placement helper retains facing on both aim-selected edges without mutating input',()=>{
 for(const kind of ['door','window','wall'])for(const point of [{x:5.5,z:7.5},{x:6.5,z:8.5}]){
  const results=[];
  for(let rotation=0;rotation<4;rotation++){
   const input={kind,gx:3,gz:4,rotation},snapshot={...input},p={...point};
   const got=placementTransform(input,point);assert.deepEqual(input,snapshot);assert.deepEqual(point,p);
   const effective=kind==='wall'?rotation%2:rotation,axis=effective%2;
   assert.deepEqual(got,{gx:3+(axis===1&&point.x>6?1:0)-(effective===3?1:0),gz:4+(axis===0&&point.z>8?1:0)-(effective===2?1:0),rotation:effective});
   results.push({...piece(kind),...got});
  }
  for(const [a,b] of [[0,2],[1,3]]){assert.equal(edgeKey(results[a]),edgeKey(results[b]));assert.deepEqual(orderedBoxes(results[a]),orderedBoxes(results[b]));assert.deepEqual(adjacentCells(results[a]),adjacentCells(results[b]));}
 }
 for(const kind of ['floor','roof',...DELIGHT_KEYS])for(let rotation=0;rotation<4;rotation++)assert.deepEqual(placementTransform({kind,gx:3,gz:4,rotation},{x:7,z:9}),{gx:3,gz:4,rotation});
});

test('directional placement output survives real build and repeated save/load with exact paid transforms',()=>{
 for(const kind of ['door','window'])for(let rotation=0;rotation<4;rotation++){
  const s=funded();assert.ok(build(s,piece('floor')).ok);
  const transform=placementTransform({kind,gx:0,gz:0,rotation},{x:.7,z:.7});
  const request={...piece(kind),...transform,material:kind==='door'?'fiber':'wood'},unchanged={...request};
  const result=build(s,request);assert.ok(result.ok,result.code);assert.deepEqual(request,unchanged);
  assert.deepEqual(result.piece,{id:2,...request,cost:PIECES[kind].cost});
  let loaded=s;for(let i=0;i<3;i++){loaded=deserialize(serialize(loaded));assert.deepEqual(loaded.buildings.find(b=>b.id===2),result.piece);assert.deepEqual(loaded.inventory,s.inventory);}
 }
});

test('opposite-facing boundary duplicates reject across kinds without spending material',()=>{
 for(let rotation=0;rotation<4;rotation++){
  const s=funded();assert.ok(build(s,piece('floor')).ok);
  const placed={...piece('window'),...placementTransform({kind:'window',gx:0,gz:0,rotation},{x:.7,z:.7})};
  assert.ok(build(s,placed).ok);const before=serialize(s);
  for(const kind of ['door','wall','window']){const rejected=build(s,{...opposite(placed),kind});assert.equal(rejected.code,'message.occupied');assert.equal(serialize(s),before);}
 }
});

test('legacy raw rotations and canonical boundary14 records retain paid fields, geometry and home identity',()=>{
 for(const canonical of [false,true]){
  const s=funded(),room=[piece('floor',13,13),...['door','wall','window','wall'].map((kind,r)=>piece(kind,13,13,r)),piece('roof',13,13,3)];
  s.buildings=room.map((b,i)=>paid(canonical?canonicalPiece(b):b,i+1));s.nextId=7;reconcileResidents(s);s.residents[0].outfit=2;
  const originals=structuredClone(s.buildings),home=findHomes(s.buildings),residents=structuredClone(s.residents);
  // Legacy version1 omitted baseY; its default must not change the old root/yaw.
  for(const b of s.buildings)delete b.baseY;
  let loaded=deserialize(serialize(s));
  assert.deepEqual(loaded.buildings,originals);assert.deepEqual(findHomes(loaded.buildings),home);assert.deepEqual(loaded.residents,residents);
  for(const b of loaded.buildings)assert.deepEqual(buildingBoxes(b),buildingBoxes(originals.find(a=>a.id===b.id)));
  assert.deepEqual(deserialize(serialize(loaded)),loaded);
  if(canonical){assert.ok(loaded.buildings.some(b=>b.gx===14));assert.ok(loaded.buildings.some(b=>b.gz===14));}
  else assert.deepEqual(loaded.buildings.slice(1,5).map(b=>b.rotation),[0,1,2,3]);
 }
});

test('marine window midpoint and home-facing targets are independent of visible orientation',()=>{
 const directions=[[0,-1],[-1,0],[0,1],[1,0]];
 for(let r=0;r<4;r++){
  const room=[piece('floor',0,25,0,-7.2),...directions.map((_,i)=>({...piece(i===r?'window':i===(r+2)%4?'door':'wall',0,25,i,-7.2),material:i===r?'diamond':'wood'})),piece('roof',0,25,0,-7.2)].map((b,i)=>paid(b,i+1));
  const flipped=room.map(b=>b.kind==='window'||b.kind==='door'?opposite(b):b),before=structuredClone(flipped);
  assert.deepEqual(findHomes(flipped),findHomes(room));
  const a=createMarineLife({profiles:MARINE_PROFILES,buildings:room}),b=createMarineLife({profiles:MARINE_PROFILES,buildings:flipped});
  assert.equal(a.windows.length,1);assert.deepEqual(b.windows,a.windows);assert.deepEqual(flipped,before);
  const [nx,nz]=directions[r],w=a.windows[0];assert.equal(w.nx,nx);assert.equal(w.nz,nz);
  assert.ok(Math.abs(w.x-nx*1.95)<1e-9);assert.ok(Math.abs(w.z-(50+nz*1.95))<1e-9);
  assert.ok(Math.abs(w.inside.x-nx*.32)<1e-9);assert.ok(Math.abs(w.inside.z-(50+nz*.32))<1e-9);
 }
});
