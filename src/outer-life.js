import {createMarineAnimal,animateMarineAnimal,MARINE_PROFILES} from './marine-visuals.js';
import {createAnimal,animateAnimal} from './garden-visuals.js';
import {nearbyChunks} from './world-data.js';
import {sampleWorld} from './world-layout.js';
import {TERRAIN} from './terrain.js';
import {solidInterval} from './reef-collision.js';
import {buildingBoxes,touches} from './building.js';
import {propBoxes} from './delights.js';

// Six authored habitat visitors reuse existing rigs. Transient, no new save ledger.
export function createOuterLife({scene,state,solidsAt}){
 const actors=new Map();let time=0;
 function clear(a,x,y,z){
  const r=a.profile.radius,minY=y+a.profile.minY,maxY=y+a.profile.maxY,floor=sampleWorld(x,z).height;
  if(a.kind==='fish'&&(maxY>TERRAIN.waterY-.18||minY<floor+.2))return false;
  if(a.kind==='crab'){const levels=[[r,0],[-r,0],[0,r],[0,-r]].map(([dx,dz])=>sampleWorld(x+dx,z+dz).height);if(Math.max(...levels)-Math.min(...levels)>.16||floor>TERRAIN.waterY+.25)return false;}
  if(solidsAt(x,z).some(s=>{const v=solidInterval(s,x,z,r);return v&&v.minY<maxY&&v.maxY>minY+.01;}))return false;
  return ![...state.buildings.flatMap(buildingBoxes),...state.delights.flatMap(p=>propBoxes(p))].some(b=>touches(b,x,z,r)&&b.maxY>minY&&b.minY<maxY);
 }
 function rootY(a,x,z){const h=sampleWorld(x,z).height;return a.kind==='crab'?h:a.kind==='fish'?Math.min(TERRAIN.waterY-.7,h+1.4):h+1.1;}
 function update(dt,player){time+=dt;const markers=nearbyChunks(player.x,player.z,52).flatMap(d=>d.decorations).filter(d=>d.kind.startsWith('habitat-')).filter(d=>Math.hypot(d.x-player.x,d.z-player.z)<48).slice(0,6);
  for(const a of actors.values())a.model.visible=markers.some(m=>m.id===a.id);
  for(const m of markers){let a=actors.get(m.id);if(!a){const kind=m.kind.slice(8),model=kind==='bird'?createAnimal('bird'):createMarineAnimal(kind,m.variant);a={id:m.id,kind,model,home:m,profile:kind==='bird'?{radius:.22,minY:-.1,maxY:.35}:MARINE_PROFILES[kind],x:m.x,z:m.z,y:0,yaw:m.yaw,phase:0,speed:0,activity:'idle'};a.y=rootY(a,a.x,a.z);let found=clear(a,a.x,a.y,a.z);
    for(let i=0;i<24&&!found;i++){const angle=i*2.4,r=.2+i*.11,x=m.x+Math.cos(angle)*r,z=m.z+Math.sin(angle)*r,y=rootY(a,x,z);if(clear(a,x,y,z)){a.x=x;a.z=z;a.y=y;found=true;}}
    if(!found)continue;actors.set(m.id,a);scene.add(model);}
   a.model.visible=true;const pause=a.kind==='crab'&&time%15>10,r=a.kind==='crab'?.7:a.kind==='fish'?1.8:1.1,rate=a.kind==='crab'?.09:a.kind==='fish'?.17:.35,t=time*rate+m.variant*2;
   const tx=m.x+Math.cos(t)*r,tz=m.z+Math.sin(t)*r,dx=tx-a.x,dz=tz-a.z,d=Math.hypot(dx,dz),step=Math.min(d,dt*(pause?0:a.kind==='crab'?.2:a.kind==='fish'?.6:.5)),x=a.x+dx/Math.max(d,.001)*step,z=a.z+dz/Math.max(d,.001)*step,y=rootY(a,x,z);let moved=0;
   if(clear(a,x,y,z)){moved=Math.hypot(x-a.x,z-a.z);if(moved>.00001)a.yaw=a.kind==='crab'?Math.atan2(-(z-a.z),x-a.x):Math.atan2(x-a.x,z-a.z);a.x=x;a.z=z;a.y=y;}
   a.speed=moved/Math.max(dt,.001);a.activity=a.speed>.015?'travel':'idle';a.phase+=a.kind==='crab'?moved/a.profile.stride:dt*(.3+a.speed*2.3);a.model.position.set(a.x,a.y,a.z);a.model.rotation.y=a.yaw;
   if(a.kind==='bird')animateAnimal(a.model,{time,walk:a.speed>0?1:0,perch:0});else animateMarineAnimal(a.model,{time,dt,speed:a.speed,turn:0,activity:a.activity,phase:a.phase});a.model.updateMatrixWorld(true);
  }
  // The authored set is six; cap explicitly if a future descriptor author adds more.
  while(actors.size>6){const spare=[...actors].find(([,a])=>!a.model.visible);if(!spare)break;scene.remove(spare[1].model);actors.delete(spare[0]);}
 }
 return {update,readingObjects:()=>[...actors.values()].filter(a=>a.model.visible),snapshot:()=>[...actors.values()].filter(a=>a.model.visible).map(({id,kind,x,y,z,phase,speed,activity})=>({id,kind,x,y,z,phase,speed,activity}))};
}
