import test from 'node:test';import assert from 'node:assert/strict';
import {assistedPlacement} from '../src/placement.js';import {terrainClear,foundationDepth,starterFloorPlane,elevation} from '../src/building.js';import {sampleCell} from '../src/surface-grid.js';import {freshState,build,remove,validateBuild,serialize,deserialize} from '../src/state.js';
const floor=(gx,gz,baseY=sampleCell(gx,gz).height)=>({kind:'floor',gx,gz,baseY,level:0,rotation:0,material:'wood'});
const starter=(gx,gz)=>assistedPlacement({...floor(gx,gz),levelExplicit:false},{gx,gz,baseY:sampleCell(gx,gz).height,point:{x:gx*2,z:gz*2}},null,[]);
const put=(s,b)=>{const r=build(s,b);assert.ok(r.ok,JSON.stringify({b,r}));return r.piece;};
test('new starter floors clear every room edge on rectangular slopes without bypassing terrain',()=>{
 for(const [gx,gz] of [[3,23],[0,35],[-38,31],[30,-20],[0,0],[-12,-51]]){const b=starter(gx,gz);assert.equal(b.baseY,starterFloorPlane(gx,gz));assert.ok(foundationDepth(b)!==null);for(let rotation=0;rotation<4;rotation++)for(const kind of ['wall','door','window'])assert.ok(terrainClear({...b,kind,rotation}),JSON.stringify({gx,gz,kind,rotation}));}
 assert.equal(starter(3,23).baseY,-3.9);assert.equal(foundationDepth(starter(3,23)),.3);assert.equal(terrainClear({...floor(3,23),kind:'wall'}),false,'old north wall is genuinely buried');
 const s=freshState();s.inventory.wood=32;assert.equal(validateBuild(s,floor(3,23,-1.5)).code,'message.floorSupport','maximum leg depth remains2.4m');
});
test('existing deck planes and explicit upper-story support are not silently raised',()=>{
 const old={...floor(3,23),id:8};const choice={kind:'floor',material:'wood',level:0,rotation:0,levelExplicit:false};
 const attached=assistedPlacement(choice,{gx:3,gz:23,baseY:-4.2,point:{x:6,z:45.1}},old,[old]);assert.equal(attached.baseY,-4.2);assert.equal(attached.gz,22);assert.equal(terrainClear(attached),false,'blocked attachment stays blocked');
 const edge=assistedPlacement(choice,{gx:3,gz:22,baseY:-3.9,point:{x:6,z:44.9}},null,[old]);assert.equal(edge.baseY,-4.2);
 const upper={...old,level:1};assert.equal(elevation(assistedPlacement({...choice,kind:'wall'},{gx:3,gz:23,point:{x:6,z:45.2}},upper,[upper])),elevation(upper));
});
test('earned partial can be refunded and rebuilt at the same seabed cell with exact paid accounting',()=>{
 const s=freshState();s.inventory.wood=32;const b=floor(3,23),parts=[put(s,b),put(s,{...b,kind:'wall',gx:4,rotation:1}),put(s,{...b,kind:'wall',gz:24}),put(s,{...b,kind:'door',rotation:1})];assert.equal(s.inventory.wood,20);const before=serialize(s);assert.equal(build(s,{...b,kind:'wall'}).code,'message.terrainBlocked');assert.equal(serialize(s),before);
 for(const p of parts.slice().reverse())assert.ok(remove(s,p.id).ok);assert.equal(s.inventory.wood,32);
 const raised=starter(3,23);put(s,raised);for(let rotation=0;rotation<4;rotation++)put(s,{...raised,kind:rotation===1?'door':'wall',rotation});put(s,{...raised,kind:'roof',level:1});assert.equal(s.inventory.wood,14);assert.equal(s.residents.length,1);assert.equal(s.residents[0].habitat,'ocean','occupied floor remains submerged even with an emerged roof');assert.equal(s.residents[0].baseY,-3.9);assert.deepEqual(deserialize(serialize(s)).buildings,s.buildings);
});
