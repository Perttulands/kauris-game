import test from 'node:test';
import assert from 'node:assert/strict';
import {Raycaster,Vector3} from 'three';
import {describeChunk,resourceById} from '../src/world-layout.js';
import {sampleCell,GRID,cellAt} from '../src/surface-grid.js';
import {nearbyResources,WILD_RESOURCES} from '../src/world-data.js';
import {freshState,harvestWild} from '../src/state.js';
import {createWorldChunk} from '../src/world-visuals.js';

test('new grove resources are distinct, harvestable and suppressed by paid occupancy',()=>{
 const state=freshState(),all=[...WILD_RESOURCES];
 for(let cx=-2;cx<=2;cx++)for(let cz=-4;cz<=1;cz++)all.push(...describeChunk(cx,cz).resources);
 const added=all.filter(r=>r.id.startsWith('w1:')&&Number(r.id.split(':')[4])>=48);
 assert.equal(added.length,30);
 for(const r of added){
  assert.deepEqual(resourceById(r.id),r);
  assert.equal(sampleCell(r.gx,r.gz).waterY,null);
  assert.equal(all.filter(q=>q.gx===r.gx&&q.gz===r.gz).length,1,'one resource per cell');
  const s=freshState();assert.ok(nearbyResources(s,r.gx*2,r.gz*2,1).some(q=>q.id===r.id));
  assert.ok(harvestWild(s,r.id).ok);assert.ok(!nearbyResources(s,r.gx*2,r.gz*2,1).some(q=>q.id===r.id));
  assert.ok(s.wildRemoved.includes(r.id));
  const paid=freshState();paid.plots[`${r.gx},${r.gz}`]={gx:r.gx,gz:r.gz,baseY:r.baseY,phase:'hole'};
  assert.ok(!nearbyResources(paid,r.gx*2,r.gz*2,1).some(q=>q.id===r.id));
 }
 for(const z of [-90,-94,-98])assert.ok(!all.some(r=>Math.abs(r.gx*2)<6&&Math.abs(r.gz*2-z)<2),'open north lawn');
});

test('depth-finished water uses authoritative wet cells and never intercepts seabed tool rays',()=>{
 for(const [cx,cz] of [[0,0],[0,1],[-1,1],[1,1]]){
  const chunk=createWorldChunk(describeChunk(cx,cz),{detail:false});
  for(const sea of chunk.group.children.filter(o=>o.userData.worldWater)){
   const p=sea.geometry.attributes.position,d=sea.geometry.attributes.waterDepth;
   assert.equal(d.count,p.count);assert.equal(sea.material.depthWrite,false);
   for(let i=0;i<p.count;i+=6){
    const x=(p.getX(i)+p.getX(i+2))/2,z=(p.getZ(i)+p.getZ(i+2))/2,{gx,gz}=cellAt(x,z),s=sampleCell(gx,gz);
    assert.equal(p.getY(i),Math.fround(GRID.waterY));assert.equal(s.waterY,GRID.waterY);
    assert.ok(Math.abs(d.getX(i)-(GRID.waterY-s.height))<1e-6);
    assert.equal(new Raycaster(new Vector3(x,10,z),new Vector3(0,-1,0)).intersectObject(sea).length,0);
   }
  }
  chunk.dispose();
 }
});

test('combined streamed buffers, horizon and retained full resource geometry fit24MiB',async()=>{
 const {Scene}=await import('three');const {createWorldRuntime}=await import('../src/world-runtime.js');
 const {createResourceHorizon,fullResourceCandidates}=await import('../src/resource-horizon.js');
 const {createStagedTree}=await import('../src/garden-visuals.js');
 const state=freshState(),world=createWorldRuntime(state),horizon=createResourceHorizon(new Scene()),geometry=new Set();
 for(const [x,z] of [[0,9],[-8,-66],[-58,-14],[64,-24],[-76,62],[250,-130],[0,9],[-8,-66]]){
  const full=fullResourceCandidates(state,x,z);
  for(const r of full.filter(r=>r.id.startsWith('w1:'))){const model=createStagedTree(r.kind,{variation:(r.variation??0)%2});model.traverse(o=>{if(o.isMesh)geometry.add(o.geometry);});}
  for(let i=0;i<110;i++)world.update(x,z);horizon.update(state,x,z,new Set(full.map(r=>r.id)));
  const fullBytes=[...geometry].reduce((sum,g)=>sum+Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+Object.values(g.morphAttributes).flat().reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0),0);
  assert.ok(world.snapshot().bytes+horizon.snapshot().geometryBytes+fullBytes<=24*1024*1024,`combined buffer budget at ${x},${z}`);
 }
});

test('recomposed grove retains the original resource removal ledger identity',()=>{
 // These authored IDs predate the grove arrangement; coordinate changes must
 // remain in their original chunk/slot so a harvested resource stays removed.
 for(const id of ['w1:r:0:-3:19','w1:r:0:-4:70','w1:r:0:-4:69','w1:r:0:-3:74']){
  const r=resourceById(id);assert.ok(r,id);
  const state=freshState();state.wildRemoved.push(id);
  assert.ok(!nearbyResources(state,r.gx*2,r.gz*2,2).some(q=>q.id===id));
 }
});
