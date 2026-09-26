import * as THREE from 'three';
import {createResident,animateResident,setResidentOutfit} from './visuals.js';
import {findHomes} from './residents.js';
// Short doorway corridors, not world navigation. Obstructed friends wait and retry.
export function createResidentSystem({scene,getState,canStand,floorHeight,notice,changed,getPlayer=()=>null}){
 const models=new Map(),motion=new Map();
 const rest=d=>({x:d.x-d.nx*.95-d.nz*.28,z:d.z-d.nz*.95+d.nx*.28});
 const waypoints=d=>[{x:d.x+d.nx*.45,z:d.z+d.nz*.45},{x:d.x-d.nx*.55,z:d.z-d.nz*.55},rest(d)];
 function corridor(a,b,baseY=0){const count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08);for(let i=0;i<=count;i++){const t=i/Math.max(1,count);if(!canStand(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,baseY))return false;}return true;}
 function prepare(r){
  const home=findHomes(getState().buildings).find(h=>h.baseY===(r.baseY??0)&&h.cells.some(k=>r.cells.includes(k)));
  for(const d of home?.doors??[r.door])for(const distance of (r.habitat==='ocean'?[1.5,.75]:[1.5])){
   const start={x:d.x+d.nx*distance,z:d.z+d.nz*distance},points=waypoints(d);let previous=start;
   if(!canStand(start.x,start.z,r.baseY??0)||!points.every(p=>{const ok=corridor(previous,p,r.baseY??0);previous=p;return ok;}))continue;
   r.door=d;r.x=start.x;r.z=start.z;r.routeStage=0;return true;
  }
  // Still visible nearby when the complete corridor is blocked, without teleporting inside.
  const d=r.door;for(const distance of [1.5,2.2,3])for(const side of [0,1,-1,2,-2]){
   const x=d.x+d.nx*distance-d.nz*side,z=d.z+d.nz*distance+d.nx*side;
   if(canStand(x,z,r.baseY??0)){r.x=x;r.z=z;r.routeStage=0;return true;}
  }
  // An outward-facing edge doorway may have no approach on land. Keep the friend
  // visible on a safe exterior side; never spawn inside or beyond the island.
  const cells=r.cells.map(k=>k.split(',').map(Number)),minX=Math.min(...cells.map(c=>c[0]*2))-2.2,maxX=Math.max(...cells.map(c=>c[0]*2))+2.2,minZ=Math.min(...cells.map(c=>c[1]*2))-2.2,maxZ=Math.max(...cells.map(c=>c[1]*2))+2.2,candidates=[];
  for(let x=minX;x<=maxX;x+=1)for(const z of [minZ,maxZ])candidates.push({x,z});
  for(let z=minZ;z<=maxZ;z+=1)for(const x of [minX,maxX])candidates.push({x,z});
  candidates.sort((a,b)=>Math.hypot(a.x-d.x,a.z-d.z)-Math.hypot(b.x-d.x,b.z-d.z));
  const safe=candidates.find(p=>canStand(p.x,p.z,r.baseY??0));if(safe){r.x=safe.x;r.z=safe.z;r.routeStage=0;return true;}
  return false;
 }
 function sync(){for(const r of getState().residents??[]){const g=models.get(r.id),m=motion.get(r.id);if(g&&m.outfit!==(r.outfit??0)){setResidentOutfit(g,r.outfit??0);m.outfit=r.outfit??0;}}for(const [id,g] of models)if(!getState().residents?.some(r=>r.id===id)){scene.remove(g);models.delete(id);motion.delete(id);}for(const r of getState().residents??[])if(!models.has(r.id)){const g=createResident(r.variant,r.outfit??0,r.habitat==='ocean');g.userData.residentId=r.id;models.set(r.id,g);scene.add(g);motion.set(r.id,{walking:0,wave:0,retry:0,timer:0,trip:null,sit:0,outfit:r.outfit??0,yaw:null});}}
 function stroll(r,g,m,dt){
  const d=r.door,home=rest(d),outer={x:d.x+d.nx*1.5,z:d.z+d.nz*1.5},near={x:d.x+d.nx*.45,z:d.z+d.nz*.45},inner={x:d.x-d.nx*.55,z:d.z-d.nz*.55};
  m.timer+=dt;m.sit=0;
  if(!m.trip){
   if(m.timer<12+r.id%3*2)return;
   const away=Math.hypot(r.x-home.x,r.z-home.z)>.4;
   const points=away?[near,inner,home]:[inner,near,outer,near,inner,home];let previous=r;
   if(!points.every(p=>{const safe=corridor(previous,p,r.baseY??0);previous=p;return safe;})){m.timer=8;return;}
   m.trip={points,index:0,pause:0,outside:away?-1:2};
  }
  const trip=m.trip;if(trip.pause>0){trip.pause-=dt;m.sit=1;g.rotation.y=Math.atan2(d.nx,d.nz);return;}
  const target=trip.points[trip.index];if(!target){m.trip=null;m.timer=0;return;}
  const dx=target.x-r.x,dz=target.z-r.z,distance=Math.hypot(dx,dz);
  if(distance<.03){if(trip.index===trip.outside){trip.pause=6;m.wave=1.5;}trip.index++;return;}
  if(!corridor(r,target,r.baseY??0)){m.trip=null;m.timer=8;return;}
  const step=Math.min(distance,dt*.6);r.x+=dx/distance*step;r.z+=dz/distance*step;g.rotation.y=Math.atan2(dx,dz);m.walking=1;changed();
 }
 function update(dt,time){
  sync();for(const r of getState().residents??[]){const g=models.get(r.id),m=motion.get(r.id);m.walking=0;m.blocked=false;m.wave=Math.max(0,m.wave-dt);m.sit=0;if(m.outfit!==(r.outfit??0)){setResidentOutfit(g,r.outfit??0);m.outfit=r.outfit??0;}if(r.status!=='home'){m.trip=null;m.timer=0;}
   if(r.x===null){m.retry-=dt;if(m.retry<=0){m.retry=1;if(prepare(r))changed();}g.visible=r.x!==null;if(!g.visible)continue;}
   g.visible=true;
   if(!r.notified){r.notified=true;m.wave=2.2;notice(r);changed();}
   if(r.status==='arriving'){
    const points=waypoints(r.door),target=points[r.routeStage]??points[2],dx=target.x-r.x,dz=target.z-r.z,distance=Math.hypot(dx,dz),step=Math.min(distance,dt*.85);
    // Test the full remaining leg before moving, including the resident body width.
    if(distance<.025){r.routeStage++;changed();if(r.routeStage>=3){r.routeStage=2;r.arrived=true;r.status='home';m.wave=2.5;}}
    else if(corridor(r,target,r.baseY??0)){r.x+=dx/distance*step;r.z+=dz/distance*step;g.rotation.y=Math.atan2(dx,dz);m.walking=1;changed();}else m.blocked=true;
   }else if(r.status==='home'){
    stroll(r,g,m,dt);if(!m.walking)g.rotation.y=Math.atan2(r.door.nx,r.door.nz)+Math.sin(time*.35+r.id)*.16;
   }else g.rotation.y=Math.atan2(r.door.nx,r.door.nz);
   const player=getPlayer(),near=player&&Math.hypot(player.x-r.x,player.z-r.z)<4;
   if(near&&!m.walking&&Math.sin(time*.6+r.id)>.9)m.wave=Math.max(m.wave,.7);
   const flowers=Object.values(getState().plots??{}).filter(p=>['flowers','starflower'].includes(p.seed)&&p.growth>.5&&Math.hypot(p.gx*2-r.x,p.gz*2-r.z)<5);
   const look=flowers.length?.9:near?.25:0;
   const targetYaw=g.rotation.y;if(m.yaw===null)m.yaw=targetYaw;else m.yaw+=Math.atan2(Math.sin(targetYaw-m.yaw),Math.cos(targetYaw-m.yaw))*(1-Math.exp(-dt*12));g.rotation.y=m.yaw;
   g.position.set(r.x,floorHeight(r.x,r.z,r.baseY??0),r.z);animateResident(g,{time:time+r.id,walk:m.walking,wave:Math.min(1,m.wave),sit:m.sit,look,celebrate:m.wave>1.5?1:0,moveSpeed:r.status==='arriving'?.85:.6,diver:r.habitat==='ocean'});
  }
 }
 return {sync,update,models,motion};
}
