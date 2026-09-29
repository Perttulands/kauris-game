import * as THREE from 'three';
import {solidInterval} from './reef-collision.js';
import {TERRAIN,terrainHeight} from './terrain.js';
import {createMarineAnimal,animateMarineAnimal,MARINE_PROFILES} from './marine-visuals.js';
const smooth=t=>t*t*(3-2*t),lerp=(a,b,t)=>a+(b-a)*t;
// One continuous visitor: quiet intervals happen far offshore, never by visibility toggles.
export function createWhaleMotion({solidsAt=()=>[]}={}){
 // Sample the complete offshore corridor once, including the yaw/pitch envelope.
 // The grid is terraced: clamping depth per frame would make a whale jump at edges.
 const profile=MARINE_PROFILES.whale,radius=profile.radius+.15,margin=.1*radius;
 let floor=-Infinity;for(let x=-25;x<=0;x+=1)for(let z=77;z<=110;z+=1){floor=Math.max(floor,terrainHeight(x,z));for(const s of solidsAt(x,z))if(x>=s.minX&&x<=s.maxX&&z>=s.minZ&&z<=s.maxZ)floor=Math.max(floor,s.maxY);}
 const deepY=floor-profile.minY+margin+.25;
 const clearAt=(x,y,z)=>{for(let dx=-radius;dx<=radius;dx+=.75)for(let dz=-radius;dz<=radius;dz+=.75)if(dx*dx+dz*dz<=radius*radius&&y+profile.minY-margin<=terrainHeight(x+dx,z+dz)+.05)return false;return !solidsAt(x,z).some(s=>{const v=solidInterval(s,x,z,radius);return v&&y+profile.minY-margin<v.maxY&&y+profile.maxY+margin>v.minY;});};
 const a={kind:'whale',x:-12,y:deepY,z:104,yaw:Math.PI,pitch:0,phase:0,speed:0,stage:'quiet',elapsed:0,cycle:0,blow:false,profile:MARINE_PROFILES.whale};let started=false,stageTime=0;
 const waypoints=[[-12,deepY,104],[-12,deepY,84],[-12,Math.max(deepY,TERRAIN.waterY-.38),82],[-20,deepY,90],[-12,deepY,104]],durations=[45,22,18,26,30];
 return {actor:a,clearAt,update(dt,player){if(dt<=0)return a;a.blow=false;if(!started){if(player.z<70)return a;started=true;}a.elapsed+=dt;stageTime+=dt;
  const old={x:a.x,y:a.y,z:a.z},index=['quiet','approach','surface','depart','deep'].indexOf(a.stage),duration=index===0?durations[0]+a.cycle%3*25:durations[index];
  const t=Math.min(1,stageTime/duration),u=smooth(t),from=waypoints[Math.max(0,index-1)],to=waypoints[index];
  if(index===0){a.x=-12+Math.sin(stageTime*.08)*1.4;a.z=104+Math.sin(stageTime*.04)*.6;a.y=deepY+Math.sin(stageTime*.12)*.2;}
  else {const start=a.segmentStart??from;a.x=lerp(start[0],to[0],u);a.y=lerp(start[1],to[1],u);a.z=lerp(start[2],to[2],u);}
  if(!clearAt(a.x,a.y,a.z)){a.x=old.x;a.y=old.y;a.z=old.z;}
  const dx=a.x-old.x,dy=a.y-old.y,dz=a.z-old.z;a.speed=Math.hypot(dx,dy,dz)/Math.max(.001,dt);if(Math.hypot(dx,dz)>.00001){const target=Math.atan2(dx,dz);a.yaw+=Math.atan2(Math.sin(target-a.yaw),Math.cos(target-a.yaw))*Math.min(1,dt*.8);}a.pitch=Math.max(-.1,Math.min(.1,-Math.atan2(dy,Math.max(.1,a.speed))));a.phase+=dt*(.12+a.speed*.15);
  if(stageTime>=duration){a.segmentStart=[a.x,a.y,a.z];stageTime=0;if(index===4){a.stage='quiet';a.cycle++;}else {a.stage=['quiet','approach','surface','depart','deep'][index+1];if(index===2)a.blow=true;}}
  return a;
 }};
}
export function createWhaleSystem({scene,event,solidsAt}){
 const motion=createWhaleMotion({solidsAt}),a=motion.actor,model=createMarineAnimal('whale');scene.add(model);let blowLife=0;
 const points=new Float32Array(24*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));const mist=new THREE.Points(geometry,new THREE.PointsMaterial({color:'#e5f6ef',size:.11,transparent:true,opacity:.5,depthWrite:false}));mist.frustumCulled=false;scene.add(mist);
 const ripple=new THREE.Mesh(new THREE.RingGeometry(.4,.46,32),new THREE.MeshBasicMaterial({color:'#d9f5ea',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));ripple.rotation.x=-Math.PI/2;scene.add(ripple);const origin=new THREE.Vector3();
 function update(dt,player){motion.update(dt,player);model.position.set(a.x,a.y,a.z);model.rotation.set(a.pitch,a.yaw,0,'YXZ');animateMarineAnimal(model,{time:a.elapsed,dt,speed:a.speed,phase:a.phase,turn:0,activity:a.stage});model.updateMatrixWorld(true);
  if(a.blow){blowLife=3;const marker=model.getObjectByName('anchor:blowhole');marker?.getWorldPosition(origin);if(!marker)origin.set(a.x,TERRAIN.waterY,a.z);event('whale',{x:a.x,y:a.y,z:a.z});}
  blowLife=Math.max(0,blowLife-dt);mist.visible=ripple.visible=blowLife>0;if(blowLife>0){const t=3-blowLife;for(let i=0;i<24;i++){const u=(t+i/24*.6)%1.7,angle=i*2.399;points[i*3]=origin.x+Math.cos(angle)*u*.23;points[i*3+1]=Math.max(origin.y,TERRAIN.waterY)+u*1.25-u*u*.3;points[i*3+2]=origin.z+Math.sin(angle)*u*.23;}geometry.attributes.position.needsUpdate=true;mist.material.opacity=blowLife/3*.45;ripple.position.set(origin.x,TERRAIN.waterY+.025,origin.z);ripple.scale.setScalar(1+t*1.3);ripple.material.opacity=blowLife/3*.5;}
 }
 update(0,{z:0});return {model,actor:a,update,snapshot:()=>({...a,profile:{...a.profile},floor:terrainHeight(a.x,a.z),blowLife})};
}
