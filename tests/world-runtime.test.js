import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,dig} from '../src/state.js';
import {createWorldRuntime} from '../src/world-runtime.js';
import {sampleWorld} from '../src/world-layout.js';
import {Raycaster,Vector3} from 'three';
const settle=(world,x,z)=>{world.update(x,z);for(let i=0;i<110&&world.snapshot().queued;i++)world.update(x,z);assert.equal(world.snapshot().queued,0);};
test('active terrain/caches stay bounded across routes and revisits, while local dig removes only actual surface',()=>{
 const s=freshState(),world=createWorldRuntime(s);settle(world,0,9);
 for(const [x,z] of [[-8,-66],[-62,-8],[-82,72],[64,-22],[190,-60],[0,9],[-8,-66]]){settle(world,x,z);const m=world.snapshot();assert.equal(m.active,81);assert.ok(m.detail<=25);assert.ok(m.cache<=100);assert.ok(m.bytes<24*1024*1024);assert.ok(m.descriptors<=128);}
 const source=world.groundMeshes().find(m=>m.name==='terrain:w1:-1:-3');world.group.updateMatrixWorld(true);const ray=new Raycaster(new Vector3(-8,5,-66),new Vector3(0,-1,0));assert.ok(ray.intersectObjects(world.groundMeshes()).length);
 assert.ok(dig(s,-4,-33).ok);world.sync();settle(world,-8,-66);world.group.updateMatrixWorld(true);assert.equal(ray.intersectObjects(world.groundMeshes()).length,0,'real top removed from garden hole');assert.notEqual(world.groundMeshes().find(m=>m.name===source.name),source);
 for(const [x,z] of [[-32.001,35],[-31.999,35],[63.99,-20],[64.01,-20]]){settle(world,x,z);world.group.updateMatrixWorld(true);ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));const hit=ray.intersectObjects(world.groundMeshes())[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-sampleWorld(x,z).height)<1e-5);}
});

test('outer garden hole bottom covers its full cell and every face carries the same plot identity',async()=>{
 const {plotSurfaces}=await import('../src/plot-surfaces.js');const {BoxGeometry,MeshBasicMaterial,Group}=await import('three');
 const p={gx:-4,gz:-33,baseY:0,phase:'hole'},material=new MeshBasicMaterial(),parts=plotSurfaces(p,{'-4,-33':p},{wallGeometry:new BoxGeometry(2,.6,.012),wallMaterial:material,soilGeometry:new BoxGeometry(1.82,.035,1.82),soilMaterial:material}),group=new Group();group.add(...parts);group.updateMatrixWorld(true);
 for(const dx of [-.98,-.93,0,.93,.98]){const hits=new Raycaster(new Vector3(-8+dx,1,-66),new Vector3(0,-1,0)).intersectObjects(parts);assert.ok(hits.length,`no open bottom at ${dx}`);assert.equal(hits[0].object.userData.plot,'-4,-33');assert.ok(hits[0].point.y>=-.601);}
});

test('every crossing frame demotes old detail before promotion and sync preserves queued demotion',()=>{
 const state=freshState(),world=createWorldRuntime(state);settle(world,0,9);
 for(const x of [32.1,64.1,96.1,64.1,32.1,0]){
  world.update(x,9);assert.ok(world.snapshot().detail<=25);
  state.plots['-20,0']={gx:-20,gz:0,phase:state.plots['-20,0']?.phase==='hole'?'filled':'hole'};world.sync();
  for(let i=0;i<110;i++){world.update(x,9);assert.ok(world.snapshot().detail<=25,`detail cap at x${x}/frame${i}`);}
  assert.equal(world.snapshot().detail,25);
  assert.ok(world.groundMeshes().length>=75,'terrain stays present');
 }
});
