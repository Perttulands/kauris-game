import test from 'node:test';import assert from 'node:assert/strict';
import {isUnderwaterHome,TERRAIN} from '../src/terrain.js';import {findHomes,houseReadiness,reconcileResidents,readResidents} from '../src/residents.js';
const room=(baseY,level=0)=>['floor','door','wall','wall','wall','roof'].map((kind,i)=>({id:i+1,kind,gx:0,gz:35,baseY,level:level+(kind==='roof'?1:0),rotation:i===0||i===5?0:i-1,material:'wood'}));
test('diver habitat follows submerged walkable slab, including roofs above water',()=>{
 for(const [baseY,ocean] of [[-7.5,true],[-3.9,true],[-2.1,true],[-1.98,true],[-1.97,false],[-1.96,false],[-1.95,false],[-1.8,false],[0,false]]){assert.equal(isUnderwaterHome(baseY),ocean,String(baseY));const buildings=room(baseY),home=findHomes(buildings)[0];assert.equal(home.habitat,ocean?'ocean':'land');assert.equal(houseReadiness(buildings,0,35,baseY).habitat,home.habitat);assert.equal(houseReadiness(buildings.filter(b=>b.kind!=='roof'),0,35,baseY).habitat,home.habitat);}
 assert.ok(-3.9+2.4>TERRAIN.waterY,'test room ceiling actually emerges');
});
test('upper rooms use absolute occupied elevation and dry upper piers stay land',()=>{
 for(const [baseY,level,expected] of [[-4.5,1,'ocean'],[-3.9,1,'land'],[-4.5,2,'land']]){const buildings=room(baseY,level),y=Math.round((baseY+level*2.4)*1e6)/1e6,home=findHomes(buildings)[0];assert.equal(home.baseY,y);assert.equal(home.habitat,expected);assert.equal(houseReadiness(buildings,0,35,y).habitat,expected);}
});
test('saved resident identity and route survive habitat recomputation',()=>{
 const s={buildings:room(-3.9),residents:[]};reconcileResidents(s);const r=s.residents[0];Object.assign(r,{habitat:'land',x:0,z:70,status:'home',arrived:true,routeStage:2,outfit:3});const loaded=readResidents([r])[0];assert.equal(loaded.habitat,'ocean');for(const key of ['id','baseY','x','z','status','arrived','routeStage','outfit'])assert.equal(loaded[key],r[key]);s.residents=[loaded];reconcileResidents(s);assert.equal(s.residents.length,1);assert.equal(s.residents[0].id,r.id);assert.equal(s.residents[0].habitat,'ocean');
});
