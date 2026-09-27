import {Box3,Raycaster,Vector3} from 'three';

// Fill the small gaps between a cluster's leaves, not its entire terrain cell.
// Cached real triangle centres provide visibility witnesses; the envelope alone
// never authorizes a hit through scenery or against a removed flower.
export function flowerEnvelope(model,id){
 model.updateWorldMatrix(true,true);
 const bounds=new Box3().setFromObject(model).expandByScalar(.06),samples=[];
 model.traverseVisible(mesh=>{
  if(!mesh.isMesh)return;
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
  const count=Math.floor((index?.count??p.count)/3);
  for(let i=0;i<16&&i<count;i++){
   const triangle=Math.floor((i+.5)*count/Math.min(16,count)),point=new Vector3();
   for(let j=0;j<3;j++)point.add(new Vector3().fromBufferAttribute(p,index?index.getX(triangle*3+j):triangle*3+j));
   samples.push(point.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld));
  }
 });
 return {id,model,bounds,samples};
}
const visible=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true;};
const belongs=(o,root)=>{for(;o;o=o.parent)if(o===root)return true;return false;};
export function flowerTarget(ray,flowers,occluders,maxReach=3.8){
 const probe=new Raycaster(),point=new Vector3();let best=null;
 const first=probe=>probe.intersectObjects(occluders,true).find(hit=>visible(hit.object));
 probe.ray.copy(ray);probe.far=maxReach;
 let blocker,checkedBlocker=false;
 for(const flower of flowers){
  if(!visible(flower.model)||!ray.intersectBox(flower.bounds,point))continue;
  const distance=ray.origin.distanceTo(point);
  if(distance>maxReach||best&&distance>=best.envelopeDistance)continue;
  if(!checkedBlocker){blocker=first(probe);checkedBlocker=true;}
  if(blocker&&blocker.distance+.01<distance&&!belongs(blocker.object,flower.model))continue;
  const nearest=flower.samples.map(point=>({point,angle:ray.direction.angleTo(point.clone().sub(ray.origin))})).sort((a,b)=>a.angle-b.angle).slice(0,6);
  for(const sample of nearest){
   probe.set(ray.origin,sample.point.clone().sub(ray.origin).normalize());
   const hit=first(probe);
   if(hit&&hit.distance<=maxReach&&belongs(hit.object,flower.model)){
    best={id:flower.id,point:hit.point,distance:hit.distance,envelopeDistance:distance};break;
   }
  }
 }
 return best;
}
