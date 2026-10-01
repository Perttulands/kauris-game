import {waterPorts} from '../src/water-connections.js';
import {waterJoinPlans} from '../src/water-geometry.js';
import {createDelight,animateDelight} from '../src/delight-visuals.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWaterJoin,animateWaterJoin,disposeWaterJoin} from '../src/water-join-visuals.js';
import {createWaterToy,animateWaterToy} from '../src/water-toy-visuals.js';
function plan(kind,a,b,side={x:0,y:0,z:1}){
 const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),along=bv.clone().sub(av).normalize(),sv=new THREE.Vector3(side.x,side.y,side.z),up=sv.clone().cross(along);
 return {key:kind,kind,from:1,to:2,port:'outlet',width:.26,wallThickness:.035,wallHeight:.10,waterDepth:.03,floorThickness:.04,radius:.10,path:[av,bv],segments:[{a:av,b:bv,length:av.distanceTo(bv),along,side:sv,up,bounds:{}}]};
}
function vertices(mesh){
 mesh.updateWorldMatrix(true,false);const a=mesh.geometry.attributes.position;
 return Array.from({length:a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld));
}
test('rotated, sloping and vertical open troughs follow supplied full-width bases and endpoints',()=>{
 for(const [a,b,side] of [
  [[3,2,4],[4,2,4],{x:0,y:0,z:1}],
  [[3,2,4],[3,1.7,5],{x:-1,y:0,z:0}],
  [[3,7,4],[3,1,4],{x:0,y:0,z:1}],
 ]){
  const p=plan('trough',a,b,side),g=createWaterJoin(p),s=p.segments[0];
  assert.deepEqual(g.position.toArray(),[0,0,0]);assert.equal(g.children.filter(c=>c.name==='lip').length,2);
  const floor=g.getObjectByName('floor'),ribbon=g.getObjectByName('water-ribbon');
  for(const m of [floor,...g.children.filter(c=>c.name==='lip')])for(const v of vertices(m)){
   const d=v.sub(s.a),x=d.dot(s.side),y=d.dot(s.up),z=d.dot(s.along);
   assert.ok(Math.abs(x)<=.1650001);assert.ok(y>=-.0700001&&y<=.1000001);assert.ok(z>=-1e-7&&z<=s.length+1e-7);
  }
  assert.equal(ribbon.scale.x,.26);assert.equal(ribbon.scale.z,s.length);
  assert.ok(!g.children.some(c=>/cap/.test(c.name)));
 }
});
test('actual per-port flux controls ribbon/foam; stop keeps physical joins and spill has no dry body',()=>{
 for(const kind of ['trough','pipe','spill']){
  const g=createWaterJoin(plan(kind,[0,0,0],[1,0,0])),wet=g.getObjectByName('flow'),dry=g.children.filter(c=>c!==wet);
  assert.equal(wet.visible,false);assert.equal(dry.length===0,kind==='spill');
  animateWaterJoin(g,{time:0,flow:.25});assert.equal(wet.visible,true);
  const foam=g.getObjectByName('downstream-foam'),before=foam.position.clone(),geometry=foam.geometry;
  animateWaterJoin(g,{time:.1,flow:.25});assert.ok(foam.position.x>before.x);assert.equal(foam.geometry,geometry);
  animateWaterJoin(g,{time:1,flow:0});assert.equal(wet.visible,false);assert.ok(dry.every(m=>m.visible));
  animateWaterJoin(g,{time:2,flow:NaN});assert.equal(wet.visible,false);
 }
});
test('adaptive pipe spans a rise above four metres and every visible vertex stays within its planned radius',()=>{
 const p=plan('pipe',[0,0,0],[0,6,0]),g=createWaterJoin(p);
 animateWaterJoin(g,{time:1,flow:1});
 g.traverse(m=>{if(m.isMesh)for(const v of vertices(m)){assert.ok(Math.hypot(v.x,v.z)<=.100001);assert.ok(v.y>=-1e-6&&v.y<=6.000001);}});
 assert.equal(g.getObjectByName('delivery-pipe').scale.y,6);
});
test('repeated join disposal is idempotent and never disposes shared assets or mutates the source plan',()=>{
 const p=plan('trough',[0,0,0],[1,0,0]),before=JSON.stringify(p),other=createWaterJoin(p);
 const shared=other.getObjectByName('floor').geometry;let disposed=0;shared.addEventListener('dispose',()=>disposed++);
 for(let i=0;i<30;i++){
  const g=createWaterJoin(p),scene=new THREE.Scene();scene.add(g);
  assert.equal(g.getObjectByName('floor').geometry,shared);
  disposeWaterJoin(g);disposeWaterJoin(g);animateWaterJoin(g,{time:2,flow:1});
  assert.equal(g.parent,null);assert.equal(g.children.length,0);
 }
 assert.equal(disposed,0);assert.equal(JSON.stringify(p),before);
 animateWaterJoin(other,{time:1,flow:1});assert.equal(other.getObjectByName('flow').visible,true);
});
test('existing channel factory preserves shared rig geometry and reaches exact outlet endpoints',()=>{
 const spec={boxes:[{minX:-.8,maxX:.8,minY:0,maxY:.2,minZ:-.2,maxZ:.2},{minX:-.2,maxX:.2,minY:0,maxY:.2,minZ:-.8,maxZ:.8}],size:[2,1,2],anchors:{inlet:[-.9,.712,0],outletA:[.9,.712,0],outletB:[0,.712,.9]}};
 const a=createWaterToy('splitter',{spec}),b=createWaterToy('splitter',{spec}),water=a.getObjectByName('water');
 assert.equal(water.geometry,b.getObjectByName('water').geometry);
 const positions=vertices(water);assert.ok(Math.max(...positions.map(p=>p.x))>=.89999);assert.ok(Math.max(...positions.map(p=>p.z))>=.89999);
 animateWaterToy(a,{flow:1,phase:.8});assert.equal(water.visible,true);assert.equal(a.getObjectByName('channel-pulses').morphTargetInfluences[0],.8);
 animateWaterToy(a,{flow:0});assert.equal(water.visible,false);
});

test('pump intake honors own-cell and deep legacy descriptors and tags only its private pipe',()=>{
 const spec={boxes:[{minX:-.55,maxX:.55,minY:0,maxY:.15,minZ:-.55,maxZ:.55}],size:[2,1.6,2],anchors:{outlet:[.9,1.32,0]}};
 for(const [z,y] of [[-.8,-.15],[-2,-12]]){
  const intake={elbow:[0,1.1,z],mouth:[0,y,z]},g=createWaterToy('pump',{spec,intake});
  assert.deepEqual(g.getObjectByName('anchor:intake').position.toArray(),intake.mouth);
  const pipe=g.getObjectByName('intake-pipe');
  assert.equal(pipe.geometry.userData.privateResources,true);assert.equal(pipe.userData.privateGeometry,true);
  const v=vertices(pipe);assert.ok(Math.min(...v.map(p=>p.y))<=y);assert.ok(Math.max(...v.map(p=>p.y))>=1.1);
  for(const p of v)assert.ok([p.x,p.y,p.z].every(Number.isFinite));
  pipe.geometry.dispose();
 }
});

test('pipe motion marks are exposed through the copper opening on vertical and rotated runs',()=>{
 for(const [a,b,side] of [[[0,0,0],[0,6,0],{x:0,y:0,z:1}],[[0,0,0],[0,0,2],{x:-1,y:0,z:0}],[[0,0,0],[-2,1,0],{x:0,y:0,z:-1}]]){
  const p=plan('pipe',a,b,side),g=createWaterJoin(p);animateWaterJoin(g,{time:.17,flow:1});g.updateMatrixWorld(true);
  const marks=g.getObjectsByProperty('name','downstream-foam');assert.ok(marks.length);
  for(const mark of marks){
   const center=mark.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,1,0).applyQuaternion(mark.getWorldQuaternion(new THREE.Quaternion()));
   const ray=new THREE.Raycaster(center.clone().addScaledVector(normal,.4),normal.clone().negate());
   const first=ray.intersectObject(g,true)[0];assert.equal(first?.object,mark,'motion mark is the first visible surface through stripe');
   const axis=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
   for(const v of vertices(mark)){const offset=v.clone().sub(new THREE.Vector3(...a));assert.ok(offset.clone().addScaledVector(axis,-offset.dot(axis)).length()<=.100001);}
  }
  disposeWaterJoin(g);
 }
});

test('exposed water has varied staggered streamwise glints within rotated and vertical ribbons',()=>{
 for(const [a,b,side] of [[[0,0,0],[0,4,0],{x:0,y:0,z:1}],[[2,3,1],[2,1,4],{x:-1,y:0,z:0}],[[0,0,0],[4,0,0],{x:0,y:0,z:1}]]){
  const p=plan('trough',a,b,side),s=p.segments[0],g=createWaterJoin(p);
  animateWaterJoin(g,{time:.13,flow:1});const marks=g.getObjectsByProperty('name','downstream-foam');
  assert.ok(marks.length>3);assert.ok(marks.every(m=>m.scale.x<p.width*.25&&m.scale.z>m.scale.x));
  assert.ok(new Set(marks.map(m=>m.scale.x.toFixed(5))).size>3);
  const lateral=marks.map(m=>m.position.clone().sub(s.a).dot(s.side));
  assert.ok(lateral.some(x=>x>0)&&lateral.some(x=>x<0));
  const positions=marks.map(m=>m.position.clone().sub(s.a).dot(s.along)).sort((a,b)=>a-b),gaps=positions.slice(1).map((x,i)=>(x-positions[i]).toFixed(4));
  assert.ok(new Set(gaps).size>2,'no regular rung spacing');
  for(const m of marks)for(const v of vertices(m)){
   const d=v.sub(s.a);assert.ok(Math.abs(d.dot(s.side))<p.width/2);
   assert.ok(d.dot(s.along)>=-1e-7&&d.dot(s.along)<=s.length+1e-7);
  }
  const m=marks[0],before=m.position.clone(),geometry=m.geometry,material=m.material;
  animateWaterJoin(g,{time:.23,flow:1});assert.ok(m.position.clone().sub(before).dot(s.along)>0);
  assert.equal(m.geometry,geometry);assert.equal(m.material,material);
  const twin=createWaterJoin(p);animateWaterJoin(twin,{time:.23,flow:1});
  assert.deepEqual(twin.getObjectByName('downstream-foam').position.toArray(),m.position.toArray());
  animateWaterJoin(g,{time:.3,flow:0});assert.equal(g.getObjectByName('flow').visible,false);assert.ok(g.getObjectByName('floor').visible);
  disposeWaterJoin(g);disposeWaterJoin(twin);
 }
});

test('channel and gutter exterior walls have one dry surface and contain corner water',()=>{
 const cases=[
  ['cornerChannel',[-.437,.673,-.6],[0,0,1]],['splitter',[-.437,.673,-.6],[0,0,1]],
  ['cornerChannel',[.6,.673,.437],[-1,0,0]],['splitter',[.6,.673,.437],[-1,0,0]],
  ['gutter',[.437,.673,-.8],[0,0,1]],
  ['cornerChannel',[.6,.712,.047],[-1,0,0]],
 ];
 for(const [kind,origin,direction] of cases){
  const g=createDelight(kind);g.updateMatrixWorld(true);
  const hits=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(g,true);
  assert.ok(hits.length);const coincident=hits.filter(h=>Math.abs(h.distance-hits[0].distance)<1e-6);
  assert.equal(coincident.length,1,kind+' has overlapping external faces at '+origin);
 }
 for(const kind of ['cornerChannel','splitter']){
  const g=createDelight(kind),water=g.getObjectByName('water');g.updateMatrixWorld(true);
  if(kind==='cornerChannel')assert.ok(vertices(water).every(v=>v.x<.168),'water stays inside closing wall');
  const hits=new THREE.Raycaster(new THREE.Vector3(.043,1,.057),new THREE.Vector3(0,-1,0)).intersectObject(water);
  assert.equal(hits.filter(h=>Math.abs(h.distance-hits[0].distance)<1e-6).length,1,'junction water has one top face');
 }
});

test('join cross-section and assembled corner/gutter sockets expose one stable exterior',()=>{
 function visible(m){for(let p=m;p;p=p.parent)if(!p.visible)return false;return true;}
 function oneSurface(g,origin,direction,label){
  g.updateMatrixWorld(true);
  const hits=new THREE.Raycaster(origin,direction).intersectObject(g,true).filter(h=>visible(h.object));
  assert.ok(hits.length,label+' remains closed');
  assert.equal(hits.filter(h=>Math.abs(h.distance-hits[0].distance)<1e-6).length,1,label+' has one exterior surface');
 }
 for(const [a,b,side] of [[[0,0,0],[1,0,0],{x:0,y:0,z:1}],[[0,1,0],[0,0,1],{x:-1,y:0,z:0}],[[0,2,0],[0,0,0],{x:0,y:0,z:1}]]){
  const p=plan('trough',a,b,side),s=p.segments[0],g=createWaterJoin(p);
  for(const t of [.017,.31,.79,.983])for(const h of [-.051,.047])for(const sign of [-1,1]){
   const center=s.a.clone().addScaledVector(s.along,s.length*t).addScaledVector(s.up,h);
   oneSurface(g,center.addScaledVector(s.side,sign*.5),s.side.clone().multiplyScalar(-sign),'join floor/lip');
  }
  disposeWaterJoin(g);
 }
 // The actual lower endpoint arrangement reported by the critic.
 const a={id:20,kind:'cornerChannel',gx:-3,gz:23,rotation:3,baseY:-4.2},b={id:22,kind:'gutter',gx:-4,gz:23,rotation:2,baseY:-4.2};
 const out=waterPorts(a).find(p=>p.name==='outlet'),into=waterPorts(b).find(p=>p.name==='inlet'),p=waterJoinPlans(a,b,out,into)[0],scene=new THREE.Group();
 for(const prop of [a,b]){const g=createDelight(prop.kind);g.position.set(prop.gx*2,prop.baseY,prop.gz*2);g.rotation.y=prop.rotation*Math.PI/2;scene.add(g);}
 const join=createWaterJoin(p);scene.add(join);const s=p.segments[0],along=new THREE.Vector3(s.along.x,s.along.y,s.along.z),side=new THREE.Vector3(s.side.x,s.side.y,s.side.z),up=new THREE.Vector3(s.up.x,s.up.y,s.up.z);
 for(const flow of [0,1]){
  animateWaterJoin(join,{time:.23,flow});for(const toy of scene.children.filter(g=>g!==join))animateDelight(toy,{flow});
  for(const t of [-.043,.017,.071,.139,.183,.243])for(const h of [-.051,-.002,.047])for(const sign of [-1,1]){
  const center=new THREE.Vector3(out.x,out.y,out.z).addScaledVector(along,t).addScaledVector(up,h);
  oneSurface(scene,center.addScaledVector(side,sign*.65),side.clone().multiplyScalar(-sign),'assembled socket flow '+flow);
  }
 }
});
