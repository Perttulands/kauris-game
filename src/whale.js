import * as THREE from 'three';
import {solidInterval} from './reef-collision.js';
import {TERRAIN,terrainHeight} from './terrain.js';
import {createMarineAnimal,animateMarineAnimal,MARINE_PROFILES} from './marine-visuals.js';
const smooth=t=>t*t*(3-2*t),lerp=(a,b,t)=>a+(b-a)*t;
// One continuous visitor per loaded neighborhood. Corridors are sampled, not named coves.
export function findWhaleCorridor(player,solidsAt=()=>[]){
 const px=player.x??0,pz=player.z??0;
 if(terrainHeight(px,pz)>TERRAIN.waterY-1)return null;
 const profile=MARINE_PROFILES.whale,margin=.1*(profile.radius+.15);
 for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,cx=Math.round(px/8)*8+Math.cos(angle)*40,cz=Math.round(pz/8)*8+Math.sin(angle)*40;
  if(terrainHeight(cx,cz)>TERRAIN.waterY-4)continue;
  const length=Math.hypot(cx-px,cz-pz),away=[(cx-px)/length,(cz-pz)/length],side=[away[1],-away[0]];
  const horizontal=(x,z)=>[cx+side[0]*x+away[0]*z,cz+side[1]*x+away[1]*z];
  const route=[[0,12],[0,-8],[0,-10],[8,2],[0,12]];
  let floor=-Infinity;
  // Sweep the actual corridor; nearby land outside the body route is harmless.
  for(let j=1;j<route.length;j++)for(let t=0;t<=1.001;t+=.05){
   const [x,z]=horizontal(lerp(route[j-1][0],route[j][0],t),lerp(route[j-1][1],route[j][1],t));
   for(let dx=-5;dx<=5;dx+=1)for(let dz=-5;dz<=5;dz+=1){
    if(dx*dx+dz*dz>25)continue;
    floor=Math.max(floor,terrainHeight(x+dx,z+dz));
    for(const solid of solidsAt(x+dx,z+dz)){
     const v=solidInterval(solid,x+dx,z+dz,.1);
     if(v)floor=Math.max(floor,v.maxY);
    }
   }
  }
  const deepY=floor-profile.minY+margin+.3;
  if(deepY+profile.maxY+margin>TERRAIN.waterY-.15)continue;
  const point=(x,z,y=deepY)=>{const p=horizontal(x,z);return [p[0],y,p[1]];};
  return {cx,cz,deepY,waypoints:[point(0,12),point(0,-8),point(0,-10,Math.max(deepY,TERRAIN.waterY-.38)),point(8,2),point(0,12)]};
 }
 return null;
}
export function createWhaleMotion({solidsAt=()=>[],paidSolids=()=>[]}={}){
 let paid=[];const physicalAt=(x,z)=>[...solidsAt(x,z),...paid.filter(b=>x+5>=b.minX&&x-5<=b.maxX&&z+5>=b.minZ&&z-5<=b.maxZ)];
 const profile=MARINE_PROFILES.whale,radius=profile.radius+.15,margin=.1*radius;
 const clearAt=(x,y,z)=>{for(let dx=-radius;dx<=radius;dx+=.75)for(let dz=-radius;dz<=radius;dz+=.75)if(dx*dx+dz*dz<=radius*radius&&y+profile.minY-margin<=terrainHeight(x+dx,z+dz)+.05)return false;return !physicalAt(x,z).some(s=>{const v=solidInterval(s,x,z,radius);return v&&y+profile.minY-margin<v.maxY&&y+profile.maxY+margin>v.minY;});};
 const a={kind:'whale',active:false,x:0,y:-11,z:0,yaw:0,pitch:0,phase:0,speed:0,stage:'dormant',elapsed:0,cycle:0,blow:false,profile,admissions:0};
 let corridor=null,stageTime=0,retry=0;
 const stages=['quiet','approach','surface','depart','deep'],durations=[20,22,18,26,30];
 return {actor:a,clearAt,update(dt,player){
  if(dt<=0)return a;paid=paidSolids().map(b=>({...b,planes:b.planes??[]}));dt=Math.min(.1,dt);a.blow=false;retry=Math.max(0,retry-dt);
  if(a.active&&Math.hypot(a.x-(player.x??0),a.z-(player.z??0))>160){a.active=false;a.stage='dormant';corridor=null;retry=0;}
  if(!a.active){
   if(retry>0)return a;retry=5;corridor=findWhaleCorridor(player,physicalAt);
   if(!corridor||!corridor.waypoints.every(p=>clearAt(...p)))return a;
   const p=corridor.waypoints[0];Object.assign(a,{active:true,x:p[0],y:p[1],z:p[2],stage:'quiet',elapsed:0,cycle:0,segmentStart:p,admissions:a.admissions+1});stageTime=0;
   return a; // Admission precedes presentation; never teleport an existing visible whale.
  }
  a.elapsed+=dt;const acceptedTime=stageTime;stageTime+=dt;
  const old={x:a.x,y:a.y,z:a.z},index=stages.indexOf(a.stage),duration=index===0?(a.cycle?70+a.cycle%3*25:20):durations[index],t=Math.min(1,stageTime/duration),u=smooth(t),to=corridor.waypoints[index];
  if(index===0){const p=corridor.waypoints[0];a.x=p[0]+Math.sin(stageTime*.08)*1.4;a.z=p[2]+Math.sin(stageTime*.04)*.6;a.y=p[1]+Math.sin(stageTime*.12)*.2;}
  else {const start=a.segmentStart;a.x=lerp(start[0],to[0],u);a.y=lerp(start[1],to[1],u);a.z=lerp(start[2],to[2],u);}
  const distance=Math.hypot(a.x-old.x,a.y-old.y,a.z-old.z),steps=Math.max(1,Math.ceil(distance/.05));
  let clear=distance<=.2;
  for(let i=1;clear&&i<=steps;i++){const u=i/steps;clear=clearAt(lerp(old.x,a.x,u),lerp(old.y,a.y,u),lerp(old.z,a.z,u));}
  if(!clear){a.x=old.x;a.y=old.y;a.z=old.z;stageTime=acceptedTime;}
  const dx=a.x-old.x,dy=a.y-old.y,dz=a.z-old.z;a.speed=Math.hypot(dx,dy,dz)/dt;
  if(Math.hypot(dx,dz)>.00001){const target=Math.atan2(dx,dz);a.yaw+=Math.atan2(Math.sin(target-a.yaw),Math.cos(target-a.yaw))*Math.min(1,dt*.8);}
  a.pitch=Math.max(-.1,Math.min(.1,-Math.atan2(dy,Math.max(.1,a.speed))));a.phase+=dt*(.12+a.speed*.15);
  if(stageTime>=duration){a.segmentStart=[a.x,a.y,a.z];stageTime=0;if(index===4){a.stage='quiet';a.cycle++;}else {a.stage=stages[index+1];if(index===2)a.blow=true;}}
  return a;
 }};
}
export function createWhaleSystem({scene,event,solidsAt,paidSolids}){
 const motion=createWhaleMotion({solidsAt,paidSolids}),a=motion.actor,model=createMarineAnimal('whale');scene.add(model);let blowLife=0;
 const points=new Float32Array(24*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));const mist=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#e5f6ef',size:.11,transparent:true,opacity:.5,depthWrite:false}));mist.frustumCulled=false;scene.add(mist);
 const ripple=new THREE.Mesh(new THREE.RingGeometry(.4,.46,32),new THREE.MeshBasicMaterial({color:'#d9f5ea',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));ripple.rotation.x=-Math.PI/2;scene.add(ripple);const origin=new THREE.Vector3();
 function update(dt,player){motion.update(dt,player);model.visible=a.active;model.position.set(a.x,a.y,a.z);model.rotation.set(a.pitch,a.yaw,0,'YXZ');animateMarineAnimal(model,{time:a.elapsed,dt,speed:a.speed,phase:a.phase,turn:0,activity:a.stage});model.updateMatrixWorld(true);
  if(a.blow){blowLife=3;const marker=model.getObjectByName('anchor:blowhole');marker?.getWorldPosition(origin);if(!marker)origin.set(a.x,TERRAIN.waterY,a.z);event('whale',{x:a.x,y:a.y,z:a.z});}
  blowLife=Math.max(0,blowLife-dt);mist.visible=ripple.visible=blowLife>0;if(blowLife>0){const t=3-blowLife;for(let i=0;i<24;i++){const u=(t+i/24*.6)%1.7,angle=i*2.399;points[i*3]=origin.x+Math.cos(angle)*u*.23;points[i*3+1]=Math.max(origin.y,TERRAIN.waterY)+u*1.25-u*u*.3;points[i*3+2]=origin.z+Math.sin(angle)*u*.23;}geometry.attributes.position.needsUpdate=true;mist.material.opacity=blowLife/3*.45;ripple.position.set(origin.x,TERRAIN.waterY+.025,origin.z);ripple.scale.setScalar(1+t*1.3);ripple.material.opacity=blowLife/3*.5;}
 }
 update(0,{z:0});return {model,actor:a,update,snapshot:()=>({...a,profile:{...a.profile},floor:terrainHeight(a.x,a.z),blowLife})};
}
