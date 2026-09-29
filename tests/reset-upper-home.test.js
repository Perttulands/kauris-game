import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,build,serialize,deserialize} from '../src/state.js';
import {houseReadiness} from '../src/residents.js';
import {houseNeed} from '../src/readable-state.js';
import {safeHomeDestination} from '../src/home.js';
function upperRoom({roof=false,balcony=false}={}){
 const s=freshState();s.inventory.wood=1000;
 const put=(gx,gz,kind,level=0,rotation=0)=>{
  const result=build(s,{gx,gz,kind,level,rotation,baseY:0,material:'wood'});
  assert.ok(result.ok,JSON.stringify(result));return result.piece;
 };
 for(const level of [0,1]){
  put(0,0,'floor',level);
  for(let rotation=0;rotation<4;rotation++)put(0,0,rotation===0?'door':'wall',level,rotation);
 }
 if(roof)put(0,0,'roof',2);
 if(balcony)put(0,-1,'floor',1);
 s.home={version:1,kind:'house',anchor:'0,0',baseY:2.4};
 return {s,put};
}
function rebaseUpper(s){
 const copy=structuredClone(s);
 for(const b of copy.buildings)if(b.level>=1&&(b.kind!=='floor'||b.gz===-1)){b.baseY=2.4;b.level--;}
 return deserialize(serialize(copy));
}
test('upper enclosure asks for its missing roof with inherited or rebased records',()=>{
 const {s}=upperRoom();
 for(const state of [s,rebaseUpper(s)]){
  const h=houseReadiness(state.buildings,0,0,2.4);
  assert.equal(h.covered,4);assert.equal(h.doors.length,1);assert.equal(h.roofCount,0);
  assert.deepEqual(houseNeed(state.buildings,0,0,2.4),{id:'0,0:2.4:roof',kind:'roof',x:0,y:4.8,z:0,rotation:0,replace:false});
 }
 const {s:complete}=upperRoom({roof:true});
 for(const state of [complete,rebaseUpper(complete)])assert.equal(houseNeed(state.buildings,0,0,2.4),null);
});
test('upper home return lands on the same balcony regardless of base/level encoding',()=>{
 const {s}=upperRoom({roof:true,balcony:true});
 const before=serialize(s),a=safeHomeDestination(s),b=safeHomeDestination(rebaseUpper(s));
 assert.equal(a.ok,true);assert.equal(a.feet,2.55);assert.deepEqual(a,b);
 assert.equal(serialize(s),before,'return query never mutates the world');
});
test('upper landing retains body and exit checks and falls back safely when blocked',()=>{
 const {s}=upperRoom({roof:true,balcony:true});
 const obstacle={minX:-2,maxX:2,minZ:-4,maxZ:2,minY:2.55,maxY:5};
 const result=safeHomeDestination(s,{obstacles:[obstacle]});
 assert.equal(result.ok,true);assert.equal(result.feet,0);
 assert.equal(safeHomeDestination(s,{obstacles:[{minX:-100,maxX:100,minZ:-100,maxZ:100,minY:-20,maxY:20}]}).ok,false);
 assert.equal(safeHomeDestination(s,{heightAt:()=>-7.2,obstacles:[{...obstacle,minY:-20}]}).ok,false,'submerged fallback is never a safe return');
});
