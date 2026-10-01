import * as THREE from 'three';

// All geometry decisions belong to the supplied plan. These resources are shared
// across joins; lifecycle disposal never invalidates another join or toy.
const box=new THREE.BoxGeometry(1,1,1);
const pipe=new THREE.CylinderGeometry(1,1,1,16,1,true,Math.PI/6,Math.PI*5/3);
const core=new THREE.CylinderGeometry(1,1,1,12,1,true);
const copper=new THREE.MeshStandardMaterial({color:'#d29862',roughness:.66,metalness:.10,side:THREE.DoubleSide});
const patina=new THREE.MeshStandardMaterial({color:'#7ba995',roughness:.66,metalness:.10});
const water=new THREE.MeshStandardMaterial({color:'#69d7e5',roughness:.24,metalness:.02,emissive:'#278ca5',emissiveIntensity:.18,side:THREE.DoubleSide});
const foam=new THREE.MeshStandardMaterial({color:'#c9eeed',roughness:.35,emissive:'#c9eeed',emissiveIntensity:.08});
const rigs=new WeakMap();
const vec=p=>new THREE.Vector3(p.x,p.y,p.z);
function frame(s){return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec(s.side),vec(s.up),vec(s.along).negate()));}
function mesh(root,geometry,material,name,position,scale,rotation){
 const m=new THREE.Mesh(geometry,material);m.name=name;m.position.copy(position);m.scale.set(...scale);m.quaternion.copy(rotation);root.add(m);return m;
}
export function createWaterJoin(plan){
 if(!plan||!['trough','pipe','spill'].includes(plan.kind)||!Array.isArray(plan.segments))throw new TypeError('Authoritative water join plan required');
 const root=new THREE.Group();root.name='water-join:'+plan.key;
 const wet=new THREE.Group();wet.name='flow';root.add(wet);
 const segments=[];
 for(const s of plan.segments){
  if(!(s.length>0)||![s.a,s.b,s.along,s.side,s.up].every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)))throw new TypeError('Finite planned segment basis required');
  const center=vec(s.a).add(vec(s.b)).multiplyScalar(.5),up=vec(s.up),side=vec(s.side),rotation=frame(s);
  segments.push({...s,rotation,startVector:vec(s.a),alongVector:vec(s.along),upVector:up,sideVector:side});
  if(plan.kind==='trough'){
   // Floor ends at the lip interiors; only copper owns the exterior side faces.
   mesh(root,box,patina,'floor',center.clone().addScaledVector(up,-plan.waterDepth-plan.floorThickness/2),[plan.width,plan.floorThickness,s.length],rotation);
   const height=plan.wallHeight+plan.waterDepth+plan.floorThickness;
   for(const sign of [-1,1])mesh(root,box,copper,'lip',center.clone().addScaledVector(side,sign*(plan.width+plan.wallThickness)/2).addScaledVector(up,(plan.wallHeight-plan.waterDepth-plan.floorThickness)/2),[plan.wallThickness,height,s.length],rotation);
  }
  if(plan.kind==='pipe'){
   const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),vec(s.along));
   const open=new THREE.Vector3(0,0,1).applyQuaternion(q),across=vec(s.along).cross(open);
   segments.at(-1).pipeOpen=open;
   segments.at(-1).pipeRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,open,vec(s.along).negate()));
   // A narrow open inspection stripe reveals the moving supply within the pipe.
   mesh(root,pipe,copper,'delivery-pipe',center,[plan.radius,s.length,plan.radius],q);
   mesh(wet,core,water,'pipe-water',center,[plan.radius*.72,s.length,plan.radius*.72],q);
  }else mesh(wet,box,water,'water-ribbon',center.clone().addScaledVector(up,-.002),[plan.width,.004,s.length],rotation);
 }
 const total=segments.reduce((n,s)=>n+s.length,0);
 const count=Math.max(1,Math.ceil(total/.35));
 const drops=Array.from({length:count},(_,i)=>{
  const m=new THREE.Mesh(box,foam);m.name='downstream-foam';wet.add(m);
  // Uneven, staggered streamwise glints, never a row of full-width crossbars.
  // Stable variation is prepared once; animation only changes existing transforms.
  const seed=(i*.61803398875)%1,offset=(i+(i===0?0:(seed-.5)*.55))*total/count;
  return {mesh:m,offset:plan.kind==='pipe'?i*total/count:offset,
   width:plan.width*(.12+seed*.10),length:.07+((i*.38196601125)%1)*.075,
   lateral:plan.width*(i%2===0?1:-1)*(.16+seed*.13)};
 });
 rigs.set(root,{wet,segments,total,drops,kind:plan.kind,width:plan.width,radius:plan.radius,disposed:false});
 animateWaterJoin(root,{time:0,flow:0});return root;
}
export function animateWaterJoin(group,{time=0,flow=0}={}){
 const r=rigs.get(group);if(!r||r.disposed)return;
 const rate=Number.isFinite(flow)?Math.max(0,flow):0;
 r.wet.visible=rate>0;if(!r.wet.visible||!r.total)return;
 const t=Number.isFinite(time)?time:0;
 for(const drop of r.drops){
  const m=drop.mesh;
  let d=((t*(.35+Math.min(rate,2)*.3)+drop.offset)%r.total+r.total)%r.total;
  let s=r.segments[r.segments.length-1];
  for(const candidate of r.segments){s=candidate;if(d<=s.length)break;d-=s.length;}
  // Keep the complete dash within its segment and authoritative ribbon width.
  const length=Math.min(r.kind==='pipe'?.055:drop.length,s.length),at=Math.max(length/2,Math.min(s.length-length/2,d));
  m.position.copy(s.startVector).addScaledVector(s.alongVector,at);
  if(r.kind==='pipe')m.position.addScaledVector(s.pipeOpen,r.radius*.80);
  else m.position.addScaledVector(s.upVector,.002).addScaledVector(s.sideVector,drop.lateral);
  m.quaternion.copy(r.kind==='pipe'?s.pipeRotation:s.rotation);m.scale.set(r.kind==='pipe'?r.radius*.65:drop.width,.003,length);
 }
}
export function disposeWaterJoin(group){
 const r=rigs.get(group);if(!r||r.disposed)return;
 r.disposed=true;group.removeFromParent();group.clear();rigs.delete(group);
}
