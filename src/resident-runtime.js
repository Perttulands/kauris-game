import * as THREE from 'three';
import {createResident,animateResident,setResidentOutfit} from './visuals.js';
import {createDelight} from './delight-visuals.js';
import {propAnchor,propPoint} from './delights.js';
import {findHomes} from './residents.js';
// Short doorway corridors, not world navigation. Obstructed friends wait and retry.
export function createResidentSystem({scene,getState,canStand,floorHeight,notice,changed,getPlayer=()=>null,getDelights=()=>null,getWindows=()=>[]}){
 const models=new Map(),motion=new Map(),gifts=new Map();
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
 function sync(){for(const r of getState().residents??[]){const g=models.get(r.id),m=motion.get(r.id);if(g&&m.outfit!==(r.outfit??0)){setResidentOutfit(g,r.outfit??0);m.outfit=r.outfit??0;}}for(const [id,g] of models)if(!getState().residents?.some(r=>r.id===id)){scene.remove(g);models.delete(id);motion.delete(id);if(gifts.has(id)){scene.remove(gifts.get(id));gifts.delete(id);}}for(const r of getState().residents??[])if(!models.has(r.id)){const g=createResident(r.variant,r.outfit??0,r.habitat==='ocean');g.userData.residentId=r.id;models.set(r.id,g);scene.add(g);const bundle=createDelight('bundle');bundle.name='housewarming-bundle';bundle.position.set(0,.67,.34);bundle.scale.setScalar(.8);g.getObjectByName('resident-body').add(bundle);bundle.visible=(r.welcomeStage??0)<2;const m={bundle,supportFeet:null,recoverRide:!!r.rideId,visits:0,walking:0,wave:0,retry:0,timer:0,trip:null,sit:0,outfit:r.outfit??0,yaw:null};motion.set(r.id,m);
  // Rest is transient, but a saved body at a real hammock seat still needs its
  // support immediately, including the paused welcome frame after reload.
  const seatProp=!r.rideId&&r.status==='home'&&(getState().delights??[]).find(p=>p.kind==='hammock'&&Math.abs(p.baseY-(r.baseY??0))<.2&&Math.hypot(r.x-p.gx*2,r.z-p.gz*2)<.24);
  if(seatProp){const seat=propAnchor(seatProp,'seat');m.recoverRest=seatProp.id;m.supportFeet=seat.y-.171;m.sit=m.rest=1;g.position.set(seat.x,m.supportFeet,seat.z);g.rotation.y=seatProp.rotation*Math.PI/2;animateResident(g,{time:0,sit:1,rest:1,diver:r.habitat==='ocean'});}
 }}
 function planEncounter(r,m,home,inner,near,outer){
  const toys=getDelights();if(!toys)return null;
  const window=getWindows().find(w=>Math.abs(w.baseY-(r.baseY??0))<.1&&r.cells.includes(`${Math.round(w.inside.x/2)},${Math.round(w.inside.z/2)}`));
  const windowTrip=(window&&corridor(r,window.inside,r.baseY??0)&&corridor(window.inside,home,r.baseY??0))?{points:[window.inside,home],index:0,pause:0,outside:-1,window,actionIndex:0,acting:false,actionTime:0}:null;
  if(r.preference==='watch'&&m.visits%3===0&&windowTrip)return windowTrip;
  const preferred=(r.preference==='ride'?1:0)+m.visits;
  const nearby=getState().delights.filter(p=>['hammock','lift'].includes(p.kind)&&Math.abs(p.baseY-(r.baseY??0))<.2&&Math.hypot(p.gx*2-home.x,p.gz*2-home.z)<9&&(!toys.motion.get(p.id)?.visitorId||toys.motion.get(p.id).visitorId==='resident:'+r.id));
  nearby.sort((a,b)=>((toys.motion.get(b.id)?.request??0)>(m.now??0)?100:0)-((toys.motion.get(a.id)?.request??0)>(m.now??0)?100:0)||((preferred%2?'lift':'hammock')===b.kind?1:0)-((preferred%2?'lift':'hammock')===a.kind?1:0));
  for(const p of nearby){if(p.kind==='lift'&&p.liftY>.01)continue;const entry=p.kind==='lift'?propPoint(p,[0,0,1.35]):propAnchor(p,'use'),center={x:p.gx*2,z:p.gz*2},approach={x:entry.x,z:entry.z},points=[inner,near,outer,approach,center,approach,outer,near,inner,home];let previous=r;
   if(!points.every(q=>{const safe=corridor(previous,q,r.baseY??0);previous=q;return safe;}))continue;
   if(!toys.claim(p.id,'resident:'+r.id))continue;return {points,index:0,pause:0,outside:-1,propId:p.id,actionIndex:4,actionTime:0,acting:false};
  }

  return windowTrip;
 }
 function perform(r,g,m,trip,dt){
  const toys=getDelights(),p=getState().delights.find(p=>p.id===trip.propId);trip.actionTime+=dt;
  if(trip.window){g.rotation.y=Math.atan2(trip.window.nx,trip.window.nz);m.wave=Math.max(m.wave,.7);return trip.actionTime<8;}
  if(!p){r.rideId=null;m.supportFeet=null;return false;}
  if(p.kind==='hammock'){const seat=toys.anchor(p.id,'seat');m.sit=1;m.rest=1;r.x=seat.x;r.z=seat.z;m.supportFeet=seat.y-.171;g.rotation.y=p.rotation*Math.PI/2;g.rotation.z=(toys.motion.get(p.id)?.swing??0)*.06;return trip.actionTime<12;}
  if(p.kind==='lift'){const q=toys.motion.get(p.id);r.rideId=p.id;m.supportFeet=p.baseY+.15+p.liftY;
   if(!trip.started){trip.started=true;trip.down=!!m.recoverRide;m.recoverRide=false;q.target=trip.down?0:2.4;changed();}
   if(!trip.down&&p.liftY>2.399){trip.dwell=(trip.dwell??0)+dt;if(trip.dwell>3){trip.down=true;q.target=0;}}
   if(trip.down&&p.liftY<.001){r.rideId=null;m.supportFeet=null;changed();return false;}return true;
  }return false;
 }
 function housewarming(r,g,m,dt){
  m.bundle.visible=(r.welcomeStage??0)<2;
  if(r.status==='home'&&r.welcomeStage<2){r.welcomeStage=1;m.unpack=(m.unpack??0)+dt;m.wave=0;if(m.unpack>2){r.welcomeStage=2;r.gifts=true;m.wave=2.5;changed();}}
  if(!r.gifts)return;
  if(!gifts.has(r.id)){const group=new THREE.Group();group.add(createDelight('cushion'),createDelight('flower'));scene.add(group);gifts.set(r.id,group);}
  const group=gifts.get(r.id),[gx,gz]=r.anchor.split(',').map(Number),spots=[[-.45,.45],[.45,.45],[-.45,-.45],[.45,-.45]].filter(([dx,dz])=>Math.hypot(gx*2+dx-r.door.x,gz*2+dz-r.door.z)>.85&&canStand(gx*2+dx,gz*2+dz,r.baseY??0));group.visible=r.status==='home'&&spots.length>=2;
  if(group.visible)for(let i=0;i<2;i++){const x=gx*2+spots[i][0],z=gz*2+spots[i][1];group.children[i].position.set(x,floorHeight(x,z,r.baseY??0),z);}
 }
 function stroll(r,g,m,dt){
  const d=r.door,home=rest(d),outer={x:d.x+d.nx*1.5,z:d.z+d.nz*1.5},near={x:d.x+d.nx*.45,z:d.z+d.nz*.45},inner={x:d.x-d.nx*.55,z:d.z-d.nz*.55};
  m.timer+=dt;m.sit=0;
  if(!m.trip){
   if(m.timer<12+r.id%3*2)return;
   const away=Math.hypot(r.x-home.x,r.z-home.z)>.4;
   const encounter=!away?planEncounter(r,m,home,inner,near,outer):null;if(encounter){m.trip=encounter;}
   const points=away?[near,inner,home]:[inner,near,outer,near,inner,home];let previous=r;
   if(!points.every(p=>{const safe=corridor(previous,p,r.baseY??0);previous=p;return safe;})){m.timer=8;return;}
   m.trip??={points,index:0,pause:0,outside:away?-1:2};
  }
  const trip=m.trip;if(trip.acting){if(perform(r,g,m,trip,dt))return;trip.acting=false;trip.index++;m.sit=0;m.rest=0;m.supportFeet=null;m.visits++;g.rotation.z=0;getDelights()?.release('resident:'+r.id);}
  if(trip.pause>0){trip.pause-=dt;m.sit=1;g.rotation.y=Math.atan2(d.nx,d.nz);return;}
  const target=trip.points[trip.index];if(!target){m.trip=null;m.timer=0;return;}
  const dx=target.x-r.x,dz=target.z-r.z,distance=Math.hypot(dx,dz);
  if(distance<.03){if(trip.index===trip.actionIndex){trip.acting=true;return;}if(trip.index===trip.outside){trip.pause=6;m.wave=1.5;}trip.index++;return;}
  if(!corridor(r,target,r.baseY??0)){m.trip=null;m.timer=8;getDelights()?.release('resident:'+r.id);return;}
  const step=Math.min(distance,dt*.6);r.x+=dx/distance*step;r.z+=dz/distance*step;g.rotation.y=Math.atan2(dx,dz);m.walking=1;changed();
 }
 function update(dt,time){
  sync();for(const r of getState().residents??[]){const g=models.get(r.id),m=motion.get(r.id);m.now=time;m.walking=0;m.blocked=false;m.rest=0;m.wave=Math.max(0,m.wave-dt);m.sit=0;if(m.outfit!==(r.outfit??0)){setResidentOutfit(g,r.outfit??0);m.outfit=r.outfit??0;}if(r.status!=='home'&&!r.rideId){m.trip=null;m.timer=0;getDelights()?.release('resident:'+r.id);}
   if(r.x===null){m.retry-=dt;if(m.retry<=0){m.retry=1;if(prepare(r))changed();}g.visible=r.x!==null;if(!g.visible)continue;}
   g.visible=true;
   if(!r.notified){r.notified=true;m.wave=2.2;notice(r);changed();}
   if(r.status==='arriving'){
    const points=waypoints(r.door),target=points[r.routeStage]??points[2],dx=target.x-r.x,dz=target.z-r.z,distance=Math.hypot(dx,dz),step=Math.min(distance,dt*.85);
    // Test the full remaining leg before moving, including the resident body width.
    if(distance<.025){r.routeStage++;changed();if(r.routeStage>=3){r.routeStage=2;r.arrived=true;r.status='home';m.wave=2.5;}}
    else if(corridor(r,target,r.baseY??0)){r.x+=dx/distance*step;r.z+=dz/distance*step;g.rotation.y=Math.atan2(dx,dz);m.walking=1;changed();}else m.blocked=true;
   }else if(r.status==='home'||r.rideId){
    if(m.recoverRest){const p=getState().delights.find(p=>p.id===m.recoverRest),d=r.door;delete m.recoverRest;
     if(p&&getDelights()?.claim(p.id,'resident:'+r.id))m.trip={points:[{x:p.gx*2,z:p.gz*2},propAnchor(p,'use'),{x:d.x+d.nx*1.5,z:d.z+d.nz*1.5},{x:d.x+d.nx*.45,z:d.z+d.nz*.45},{x:d.x-d.nx*.55,z:d.z-d.nz*.55},rest(d)],index:0,acting:true,propId:p.id,actionIndex:0,actionTime:0,outside:-1};
    }
    if(r.rideId&&!m.trip){const p=getState().delights.find(p=>p.id===r.rideId),home=rest(r.door),near={x:r.door.x+r.door.nx*.45,z:r.door.z+r.door.nz*.45},inner={x:r.door.x-r.door.nx*.55,z:r.door.z-r.door.nz*.55};if(p){m.trip={points:[{x:p.gx*2,z:p.gz*2},propPoint(p,[0,0,1.35]),near,inner,home],index:0,acting:true,propId:p.id,actionTime:0,outside:-1};getDelights()?.claim(p.id,'resident:'+r.id);}}
    if(r.welcomeStage>=2||r.rideId)stroll(r,g,m,dt);if(!m.walking&&!m.trip?.acting)g.rotation.y=Math.atan2(r.door.nx,r.door.nz)+Math.sin(time*.35+r.id)*.16;
   }else g.rotation.y=Math.atan2(r.door.nx,r.door.nz);
   const player=getPlayer(),near=player&&Math.hypot(player.x-r.x,player.z-r.z)<4;
   if(near&&!m.walking&&Math.sin(time*.6+r.id)>.9)m.wave=Math.max(m.wave,.7);
   const flowers=Object.values(getState().plots??{}).filter(p=>['flowers','starflower'].includes(p.seed)&&p.growth>.5&&Math.hypot(p.gx*2-r.x,p.gz*2-r.z)<5);
   const look=flowers.length?.9:near?.25:0;
   const targetYaw=g.rotation.y;if(m.yaw===null)m.yaw=targetYaw;else m.yaw+=Math.atan2(Math.sin(targetYaw-m.yaw),Math.cos(targetYaw-m.yaw))*(1-Math.exp(-dt*12));g.rotation.y=m.yaw;
   housewarming(r,g,m,dt);g.position.set(r.x,m.supportFeet??floorHeight(r.x,r.z,r.baseY??0),r.z);animateResident(g,{time:time+r.id,walk:m.walking,wave:Math.min(1,m.wave),sit:m.sit,look,celebrate:m.wave>1.5?1:0,moveSpeed:r.status==='arriving'?.85:.6,diver:r.habitat==='ocean',carry:r.welcomeStage<2?1:0,rest:m.rest});
  }
 }
 return {sync,update,models,motion,bodies:()=>getState().residents.filter(r=>r.x!==null).map(r=>({id:'resident:'+r.id,x:r.x,z:r.z,feet:motion.get(r.id)?.supportFeet??floorHeight(r.x,r.z,r.baseY??0),radius:.31,height:1.7})),carry:(ids,delta)=>{for(const r of getState().residents)if(ids.includes('resident:'+r.id)){const m=motion.get(r.id);m.supportFeet=(m.supportFeet??floorHeight(r.x,r.z,r.baseY??0))+delta;models.get(r.id).position.y=m.supportFeet;}}};
}
