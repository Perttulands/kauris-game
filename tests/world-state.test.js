import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,serialize,deserialize,dig,fill,plant,water,tick,harvest,harvestWild,build,remove,validCell,validateDig} from '../src/state.js';
import {resourceRecord,worldChunk,descriptorCount} from '../src/world-data.js';
import {sampleWorld,describeChunk} from '../src/world-layout.js';
import {sampleCell,cellAt} from '../src/surface-grid.js';
import {terrainHeight,inWorld,buildBase} from '../src/terrain.js';

test('sampled grid has a continuous outer domain and preserves paid reset saves',()=>{
 for(let z=-28;z<=112;z+=.25)for(const x of [-28,-13,0,28]){const c=cellAt(x,z);assert.equal(terrainHeight(x,z),sampleCell(c.gx,c.gz).height);}
 assert.ok(inWorld(-1000,1000));assert.equal(inWorld(Infinity,0),false);
 const s=freshState();s.inventory.wood=2;assert.ok(build(s,{gx:0,gz:0,kind:'floor',material:'wood',level:0,rotation:0}).ok);s.player={x:2,y:.15,z:2,yaw:1.2,pitch:-.6};const loaded=deserialize(serialize(s));assert.deepEqual(loaded.buildings,s.buildings);assert.deepEqual(loaded.inventory,s.inventory);assert.deepEqual(loaded.player,s.player);assert.deepEqual(loaded.plots,s.plots);
});
test('outer flat clearing supports the whole existing paid garden/build loop and reload',()=>{
 const s=freshState(),gx=-4,gz=-33;assert.equal(sampleWorld(gx*2,gz*2).height,0);assert.equal(terrainHeight(gx*2,gz*2),0);assert.ok(validCell(gx,gz));assert.ok(dig(s,gx,gz).ok);assert.ok(plant(s,gx,gz,'oak').ok);assert.ok(fill(s,gx,gz).ok);
 for(let i=0;i<220;i++){water(s,gx,gz,.1);tick(s,.1);}assert.ok(harvest(s,gx,gz).ok);assert.equal(s.inventory.wood,18);assert.ok(build(s,{gx,gz,kind:'floor',material:'wood',rotation:0,level:0,baseY:0}).ok);const loaded=deserialize(serialize(s));assert.deepEqual(loaded.buildings,s.buildings);assert.ok(remove(loaded,s.buildings[0].id).ok);assert.equal(loaded.inventory.wood,18);
});
test('generated harvest survives unloaded descriptor eviction and does not reward twice',()=>{
 let r;for(let x=-5;x<=5&&!r;x++)for(let z=-5;z<=5&&!r;z++)r=describeChunk(x,z).resources[0];assert.ok(r);const s=freshState(),before=structuredClone(s.inventory);assert.ok(harvestWild(s,r.id).ok);const paid=structuredClone(s.inventory);for(let i=0;i<180;i++)worldChunk(i,20);assert.ok(descriptorCount()<=128);const loaded=deserialize(serialize(s));assert.ok(loaded.wildRemoved.includes(r.id));assert.equal(harvestWild(loaded,r.id).ok,false);assert.deepEqual(loaded.inventory,paid);assert.notDeepEqual(paid,before);assert.equal(resourceRecord(r.id).baseY,sampleWorld(r.gx*2,r.gz*2).height);assert.equal(resourceRecord(r.id.replace('w1:r:','w1:r:00')),null);
});
test('global plot and wild removal limits reject before irreversible mutation',()=>{
 const s=freshState();s.plots=Object.fromEntries(Array.from({length:729},(_,i)=>[String(i),{gx:10000+i,gz:10000,phase:'hole'}]));const before=serialize(s);assert.equal(validateDig(s,-4,-33).code,'message.plotLimit');assert.equal(dig(s,-4,-33).ok,false);assert.equal(serialize(s),before);
 s.wildRemoved=Array.from({length:5000},(_,i)=>'old-'+i);const prior=serialize(s);assert.equal(harvestWild(s,'grove-1').code,'message.worldLimit');assert.equal(serialize(s),prior);assert.equal(buildBase(-4,-33),0);
});

test('accepted player numeric extremes leave room for the complete prefetched footprint',()=>{
 for(const x of [-999700,999700])for(const z of [-999700,999700]){assert.ok(inWorld(x,z));const cx=Math.floor(x/32),cz=Math.floor(z/32);for(const dx of [-5,5])for(const dz of [-5,5]){const d=describeChunk(cx+dx,cz+dz);for(const xx of [d.bounds.minX,d.bounds.maxX])for(const zz of [d.bounds.minZ,d.bounds.maxZ])assert.ok(Number.isFinite(sampleWorld(xx,zz).height));}}
 assert.equal(inWorld(999900,0),false);
});
