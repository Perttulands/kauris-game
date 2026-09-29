import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,build,remove,validateBuild,serialize,deserialize} from '../src/state.js';
import {foundationDepth,foundationBoxes,supportedPieces,elevation,buildingBoxes} from '../src/building.js';
import {assistedPlacement} from '../src/placement.js';
import {sampleCell} from '../src/surface-grid.js';
import {houseReadiness} from '../src/residents.js';
import {homeChoice,safeHomeDestination} from '../src/home.js';
import {createPlacedPiece} from '../src/building-visuals.js';
const floor=(gx,gz,baseY=sampleCell(gx,gz).height)=>({kind:'floor',gx,gz,baseY,level:0,rotation:0,material:'wood'});
const funded=()=>{const s=freshState();for(const m in s.inventory)s.inventory[m]=1000;return s;};
function put(s,b){const r=build(s,b);assert.ok(r.ok,`${JSON.stringify(b)}: ${r.code}`);return r.piece;}
function house(s,gx,gz,y){put(s,floor(gx,gz,y));for(let rotation=0;rotation<4;rotation++)put(s,{...floor(gx,gz,y),kind:rotation===0?'door':'wall',rotation});put(s,{...floor(gx,gz,y),kind:'roof',level:1});}
test('foundations use actual land/seabed and visible bounded support; buried/floating floors fail',()=>{
 for(const [gx,gz] of [[0,0],[30,-20],[0,35]]){const b=floor(gx,gz);assert.equal(foundationDepth(b),0);assert.equal(foundationDepth({...b,baseY:b.baseY+2.4}),2.4);assert.equal(foundationDepth({...b,baseY:b.baseY+2.5}),null);assert.equal(foundationDepth({...b,baseY:b.baseY-.3}),null);}
 const s=funded(),b=floor(0,0,.6);put(s,b);const legs=foundationBoxes(b),g=createPlacedPiece(b);assert.equal(legs.length,4);assert.equal(g.getObjectByName('foundation').visible,true);assert.equal(legs[0].minY,0);assert.ok(Math.abs(legs[0].maxY-.55)<1e-8);assert.equal(buildingBoxes(b).length,5);
 assert.equal(validateBuild(funded(),floor(0,0,-.3)).code,'message.terrainBlocked');assert.equal(validateBuild(funded(),floor(0,0,2.7)).code,'message.floorSupport');
});
test('unlimited connected deck requires a real anchor; removal/refund and shuffled save graph agree',()=>{
 const s=funded(),anchor=put(s,floor(0,15,.6));for(let gz=16;gz<=30;gz++)put(s,floor(0,gz,.6));
 assert.equal(foundationDepth(s.buildings.at(-1)),null);const before=serialize(s);assert.equal(remove(s,anchor.id).ok,false);assert.equal(serialize(s),before);
 s.buildings.reverse();const saved=deserialize(serialize(s));assert.deepEqual(saved.buildings,s.buildings);assert.deepEqual(saved.inventory,s.inventory);
 const leaf=s.buildings[0],wood=s.inventory.wood;assert.ok(remove(s,leaf.id).ok);assert.equal(s.inventory.wood,wood+2);assert.equal(remove(s,leaf.id).ok,false);
 const floating=[floor(0,29,0),floor(0,30,0),floor(1,30,0),floor(1,29,0)];assert.equal(supportedPieces(floating).size,0);
 const redundant=funded(),a=put(redundant,floor(0,0)),b=put(redundant,floor(1,0));assert.ok(remove(redundant,a.id).ok);assert.equal(redundant.buildings[0].id,b.id);
});
test('stories depend on rooted walls and cannot retain a support cycle after their anchor is removed',()=>{
 const s=funded(),f=put(s,floor(0,0)),w=put(s,{...floor(0,0),kind:'wall'}),upper=put(s,{...floor(0,0),level:1});put(s,{...floor(0,0),kind:'wall',level:1});put(s,{...floor(0,0),kind:'roof',level:2});
 assert.equal(remove(s,w.id).ok,false);assert.equal(remove(s,f.id).ok,false);assert.equal(elevation(upper),2.4);
 const roots=s.buildings.filter(b=>b.id!==f.id);assert.equal(supportedPieces(roots).size,0);
});
test('aimed deck edge extends without changing height; terrain-edge attachment stays deliberate',()=>{
 const b={...floor(0,0,.6),id:1},choice={kind:'floor',material:'wood',level:0,rotation:3};
 const p=assistedPlacement(choice,{gx:0,gz:0,baseY:.6,point:{x:.9,z:0}},b,[b]);assert.deepEqual([p.gx,p.gz,p.baseY,p.level,p.rotation],[1,0,.6,0,3]);
 const near=assistedPlacement(choice,{gx:1,gz:0,baseY:0,point:{x:1.1,z:0}},null,[b]);assert.equal(near.baseY,.6);
 const centre=assistedPlacement(choice,{gx:1,gz:0,baseY:0,point:{x:2,z:0}},null,[b]);assert.equal(centre.baseY,0);
});
test('nonzero land home and separate deep home retain resident identity and dry home choice',()=>{
 const s=funded();house(s,0,0,.3);house(s,0,35,sampleCell(0,35).height+.3);
 assert.deepEqual(s.residents.map(r=>r.habitat),['land','ocean']);const readiness=houseReadiness(s.buildings,0,35,sampleCell(0,35).height+.3);assert.equal(readiness.habitat,'ocean');assert.equal(readiness.baseY,sampleCell(0,35).height+.3);s.home=homeChoice(s).record;assert.equal(s.home.baseY,.3);
 const d=deserialize(serialize(s));assert.deepEqual(d.residents,s.residents);assert.deepEqual(d.home,s.home);const destination=safeHomeDestination(d);assert.ok(destination.ok);assert.ok(destination.feet>=-1.45);
});
test('attached upper stories inherit the aimed support while an explicit level stays authoritative',()=>{
 const hit={...floor(0,0,.3),level:1},target={gx:0,gz:0,baseY:.3,point:{x:0,z:-.8}};
 assert.equal(assistedPlacement({kind:'wall',level:0,rotation:0,levelExplicit:false},target,hit,[hit]).level,1);
 assert.equal(assistedPlacement({kind:'wall',level:0,rotation:0,levelExplicit:true},target,hit,[hit]).level,0);
 const wall={...hit,kind:'wall'};assert.equal(assistedPlacement({kind:'roof',level:1,rotation:0,levelExplicit:false},target,wall,[hit,wall]).level,2);
});
test('all material floors preserve authored ray height and share physical preview clearance',async()=>{
 const {Raycaster,Vector3}=await import('three'),{placementClearance}=await import('../src/building.js');
 for(const material of ['wood','copper','iron','diamond','fiber']){const b={...floor(0,0),material},g=createPlacedPiece(b);g.updateMatrixWorld(true);const hits=new Raycaster(new Vector3(0,3,0),new Vector3(0,-1,0)).intersectObject(g,true);assert.ok(hits.length);assert.ok(hits[0].point.y<=.151);}
 const wall={...floor(0,0),kind:'wall'};
 assert.equal(placementClearance(wall,{bodies:[{x:0,z:-1,feet:0}]}),'message.stepAside');assert.equal(placementClearance(wall,{eye:{x:20,y:1,z:0}}),'message.closer');assert.equal(placementClearance(wall,{solids:[{minX:-1,maxX:1,minZ:-2,maxZ:0,minY:0,maxY:1}]}),'message.terrainBlocked');
 const s=funded();put(s,floor(0,0));assert.equal(validateBuild(s,floor(0,0,.1)).code,'message.occupied');
});
test('upper supported floors form the ceiling of the lower room; upper roof closes its own room',()=>{
 const s=funded();put(s,floor(0,0));for(let rotation=0;rotation<4;rotation++)put(s,{...floor(0,0),kind:rotation===0?'door':'wall',rotation});put(s,{...floor(0,0),level:1});assert.equal(s.residents.length,1);
 for(let rotation=0;rotation<4;rotation++)put(s,{...floor(0,0),kind:rotation===0?'door':'wall',rotation,level:1});put(s,{...floor(0,0),kind:'roof',level:2});assert.deepEqual(s.residents.map(r=>r.baseY),[0,2.4]);assert.deepEqual(deserialize(serialize(s)).residents,s.residents);
});
test('every material remains usable for a complete paid home with exact cost and no unsupported refund',()=>{
 for(const material of ['wood','copper','iron','diamond','fiber']){const s=funded(),start=s.inventory[material],parts=[floor(0,0),...[0,1,2,3].map(rotation=>({...floor(0,0),kind:rotation===0?'door':'wall',rotation})),{...floor(0,0),kind:'roof',level:1}];for(const p of parts)put(s,{...p,material});assert.equal(s.inventory[material],start-18);assert.equal(s.residents.length,1);assert.equal(remove(s,s.buildings[0].id).ok,false);}
});
