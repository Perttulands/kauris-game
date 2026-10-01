import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,dig,plant,fill,water,tick,harvest,harvestWild,serialize,deserialize,SEEDS,SAVE_KEY} from '../src/state.js';
import {sampleCell,surfaceAt,chunkAt} from '../src/surface-grid.js';
import {createWorldRuntime} from '../src/world-runtime.js';
import {WILD_RESOURCES} from '../src/world-data.js';
test('remote soil at multiple terraces pays only after the planted loop; rock does not mutate',()=>{
 const s=freshState();assert.equal(s.inventory.wood,0);assert.notEqual(SAVE_KEY,'kauris-meadow-v1');
 for(const [gx,gz] of [[0,3],[-20,0],[30,-20],[35,-15]]){
  const baseY=sampleCell(gx,gz).height;assert.ok(dig(s,gx,gz).ok);assert.equal(surfaceAt(s,gx*2,gz*2).floor,baseY-.6);
  assert.ok(fill(s,gx,gz).ok);assert.equal(surfaceAt(s,gx*2,gz*2).floor,baseY);
  assert.ok(dig(s,gx,gz).ok);assert.ok(plant(s,gx,gz,'oak').ok);assert.ok(fill(s,gx,gz).ok);
  for(let n=0;n<20;n++)water(s,gx,gz,.1);
  for(let n=0;n<100;n++)tick(s,.1);
  assert.ok(s.plots[`${gx},${gz}`].growth>.49);assert.equal(harvest(s,gx,gz).ok,false);
  for(let n=0;n<101;n++)tick(s,.1);
  const before=s.inventory.wood;assert.ok(harvest(s,gx,gz).ok);assert.equal(s.inventory.wood,before+18);
  assert.equal(harvest(s,gx,gz).ok,false);
 }
 for(const kind of ['rock']){
  let c;for(let gz=-100;gz<100&&!c;gz++)for(let gx=-100;gx<100;gx++){const q=sampleCell(gx,gz);if(kind==='rock'?q.substrate==='rock':q.waterY!==null){c=q;break;}}
  const before=serialize(s);assert.equal(dig(s,c.gx,c.gz).ok,false);assert.equal(serialize(s),before);
 }
 assert.ok(Object.values(SEEDS).every(s=>s.seconds>=15&&s.seconds<=28));
});
test('cold chunk rebuild and reload preserve elevated holes, growth and harvested wild identity',()=>{
 const s=freshState();dig(s,35,-15);dig(s,30,-20);plant(s,30,-20,'oak');fill(s,30,-20);water(s,30,-20,.1);tick(s,.1);
 const wild=WILD_RESOURCES.find(r=>harvestWild(s,r.id).ok);assert.ok(wild);
 const saved=serialize(s),loaded=deserialize(saved);assert.deepEqual(loaded,s);
 const world=createWorldRuntime(loaded),settle=(x,z)=>{for(let i=0;i<120;i++)world.update(x,z);};
 settle(70,-30);const old=world.groundMeshes().find(m=>m.name==='terrain:w1:2:-1');
 settle(-250,-250);assert.ok(!world.roots().some(r=>r.name==='chunk:w1:2:-1'));
 settle(70,-30);assert.notEqual(world.groundMeshes().find(m=>m.name===old.name),old);assert.equal(serialize(loaded),saved);
 assert.equal(surfaceAt(loaded,70,-30).floor,0);assert.equal(harvestWild(loaded,wild.id).ok,false);
 const bad=JSON.parse(saved);bad.plots['35,-15'].baseY=0;assert.throws(()=>deserialize(JSON.stringify(bad)),/Invalid plot/);
 bad.plots['35,-15'].baseY=.6;bad.worldSeed++;assert.throws(()=>deserialize(JSON.stringify(bad)),/Unsupported save/);
 assert.notDeepEqual(chunkAt(-40,0),chunkAt(70,-30));
});
test('adjacent holes across a terrace share only the exposed depth and keep full bottoms',async()=>{
 const {plotSurfaces}=await import('../src/plot-surfaces.js'),{BoxGeometry,MeshBasicMaterial,Raycaster,Vector3}=await import('three');
 const s=freshState();assert.ok(dig(s,33,-13).ok);assert.ok(dig(s,34,-13).ok);
 const material=new MeshBasicMaterial(),materials={wallGeometry:new BoxGeometry(2,.6,.012),wallMaterial:material,soilGeometry:new BoxGeometry(1.82,.035,1.82),soilMaterial:material};
 const low=s.plots['33,-13'],high=s.plots['34,-13'];assert.equal(high.baseY-low.baseY,.3);
 const lowParts=plotSurfaces(low,s.plots,materials),highParts=plotSurfaces(high,s.plots,materials);
 const shared=lowParts.filter(m=>m.position.x===67);assert.equal(shared.length,1);assert.ok(Math.abs(shared[0].scale.y-.5)<1e-8);
 assert.ok(!highParts.some(m=>m.position.x===67));
 for(const p of [low,high])for(const dx of [-.98,0,.98]){
  const hit=new Raycaster(new Vector3(p.gx*2+dx,4,p.gz*2),new Vector3(0,-1,0)).intersectObjects([...lowParts,...highParts])[0];
  assert.ok(Math.abs(hit.point.y-(p.baseY-.6))<1e-6);
 }
});
