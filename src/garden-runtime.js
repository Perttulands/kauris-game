import * as THREE from 'three';
import {createDiscovery,animateDiscovery,createAnimal,animateAnimal} from './garden-visuals.js';
import {activeDiscoveries,discover,gardenAttractors} from './garden.js';
export function createGardenSystem({scene,getState,getPlayer,canStand,treeHeight=()=>3.5,onDiscover,getDelights=()=>null,flyClear=()=>true}){
 const discoveries=new Map(),animals=[];
 for(const [kind,count] of [['butterfly',12],['bee',6],['grub',4],['bird',3],['deer',2]])for(let i=0;i<count;i++){const model=createAnimal(kind);model.visible=false;scene.add(model);animals.push({kind,index:i,model,at:null,walking:0,perch:0});}
 function sync(){const active=activeDiscoveries(getState());for(const [id,g] of discoveries)if(!active.some(d=>d.id===id)){scene.remove(g);discoveries.delete(id);}for(const d of active)if(!discoveries.has(d.id)){const g=createDiscovery(d);g.position.set(d.x,0,d.z);scene.add(g);discoveries.set(d.id,g);}}
 function visitBirdhouse(a,dt,time){
  if(a.kind!=='bird'||a.index!==0)return false;
  const toys=getDelights(),p=getState().delights.filter(p=>p.kind==='birdhouse').sort((p,q)=>p.id-q.id).find(p=>toys?.claim(p.id,'bird:0'));if(!p)return false;
  const perch=toys.anchor(p.id,'perch');if(!perch)return false;
  if(!a.model.visible){a.model.position.set(perch.x+3,perch.y+2,perch.z+3);a.model.visible=true;}
  if(a.homeId!==p.id){a.homeId=p.id;a.homeStage=0;a.homeTime=0;}
  a.homeTime+=dt;let target;
  const front={x:Math.sin(p.rotation*Math.PI/2),z:Math.cos(p.rotation*Math.PI/2)};
  if(a.homeStage===0)target={x:perch.x+front.x*1.4,y:perch.y+1,z:perch.z+front.z*1.4};
  else target=perch;
  const old=a.model.position.clone(),vector=new THREE.Vector3(target.x,target.y,target.z).sub(old),distance=vector.length(),step=Math.min(distance,dt*.9),next=old.clone().addScaledVector(vector.normalize(),step);
  if(distance<.001){if(a.homeStage===0)a.homeStage=1;else{toys.visited(p.id);a.model.rotation.y=p.rotation*Math.PI/2+Math.PI;}}
  else if(flyClear(next.x,next.y,next.z,p.id))a.model.position.copy(next);
  const moved=a.model.position.distanceTo(old),landed=a.homeStage===1&&distance<.03;a.walking=moved>0?1:0;a.perch=landed?1:0;a.at='birdhouse:'+p.id;
  if(moved>0)a.model.rotation.y=Math.atan2(next.x-old.x,next.z-old.z);animateAnimal(a.model,{time,walk:a.walking,perch:a.perch});return true;
 }
 function update(dt,time){
  sync();const s=getState(),player=getPlayer();for(const d of activeDiscoveries(s)){
   if(Math.hypot(player.x-d.x,player.z-d.z)<2){const r=discover(s,d.id);if(r.ok)onDiscover(r);}
   animateDiscovery(discoveries.get(d.id),{time,found:s.discoveries.includes(d.id)});
  }
  const attraction=gardenAttractors(s);for(const list of Object.values(attraction))list.sort((a,b)=>Math.hypot(a.gx*2-player.x,a.gz*2-player.z)-Math.hypot(b.gx*2-player.x,b.gz*2-player.z));
  for(const a of animals){
   if(visitBirdhouse(a,dt,time))continue;
   const list=['butterfly','bee'].includes(a.kind)?attraction.flowers:a.kind==='bird'?attraction.trees:attraction.leafy;
   const p=list[['butterfly','bee','grub'].includes(a.kind)?Math.floor(a.index/(a.kind==='butterfly'?6:3)):a.index];
   if(!p){a.model.visible=false;a.at=null;continue;}
   const key=`${p.gx},${p.gz}`,baseX=p.gx*2,baseZ=p.gz*2,t=time+a.index*2.7;
   let x,z,y,walk=0,perch=0;
   if(a.kind==='butterfly'){x=baseX+Math.cos(t*1.3)*(.6+a.index%3*.2);z=baseZ+Math.sin(t*.94)*.8;y=.65+Math.sin(t*2)*.2;walk=1;}
   else if(a.kind==='bee'){x=baseX+Math.cos(t*1.1)*.65;z=baseZ+Math.sin(t*1.4)*.6;y=.5+Math.sin(t*.9)*.14;walk=1;}
   else if(a.kind==='grub'){x=baseX+Math.cos(t*.12+a.index)*1.3;z=baseZ+Math.sin(t*.12+a.index)*1.3;y=.018;walk=1;if(!canStand(x,z)){a.model.visible=false;continue;}}
   else if(a.kind==='bird'){
    // One closed flight cycle joins the same perch at both ends, without radius jumps.
    const phase=t%18,air=phase<7,ease=q=>q*q*(3-2*q);
    const blend=air?ease(Math.min(1,phase/1.25,(7-phase)/1.25)):0;
    const angle=5.6+Math.PI*2*ease(Math.min(1,phase/7)),radius=.25+1.55*blend;
    x=baseX+Math.cos(angle)*radius;z=baseZ+Math.sin(angle)*radius;y=treeHeight(key)+blend*(.45+Math.sin(phase*Math.PI/7)*.15);walk=blend;perch=1-blend;
   }else{
    const phase=Math.floor(t/7)%4,angle=a.index*2+phase*Math.PI/2,tx=baseX+Math.cos(angle)*2.3,tz=baseZ+Math.sin(angle)*2.3;
    if(a.at!==key){const points=Array.from({length:12},(_,i)=>({x:baseX+Math.cos(i*Math.PI/6)*2.3,z:baseZ+Math.sin(i*Math.PI/6)*2.3}));const safe=points.find(p=>canStand(p.x,p.z));if(!safe){a.model.visible=false;continue;}a.model.position.set(safe.x,0,safe.z);}
    x=a.model.position.x;z=a.model.position.z;y=0;const dx=tx-x,dz=tz-z,d=Math.hypot(dx,dz),step=Math.min(d,dt*.5),nx=x+dx/(d||1)*step,nz=z+dz/(d||1)*step;
    if(d>.08&&canStand(nx,nz)){x=nx;z=nz;walk=1;}
   }
   if(a.kind==='butterfly'&&a.index===0){const toys=getDelights(),cloth=s.delights.find(p=>['hammock','curtain'].includes(p.kind)&&p.baseY>=0);if(cloth){const target=toys.anchor(cloth.id,cloth.kind==='hammock'?'seat':'cloth');const old=a.model.position;if(a.model.visible){const v=new THREE.Vector3(target.x+.15,target.y+.08,target.z).sub(old),d=v.length();if(d<.03){x=target.x+.15;y=target.y+.08;z=target.z;walk=.1;perch=1;}else {v.normalize().multiplyScalar(Math.min(d,dt*.65));x=old.x+v.x;y=old.y+v.y;z=old.z+v.z;}}}}
   if(a.kind==='deer'&&!canStand(x,z)){a.model.visible=false;continue;}
   const old=a.model.position.clone();a.model.visible=true;a.model.position.set(x,y,z);if(walk)a.model.rotation.y=Math.atan2(x-old.x,z-old.z);a.at=key;a.walking=walk;a.perch=perch;animateAnimal(a.model,{time:t,walk,perch,sniff:a.kind==='deer'?1-walk:0});
  }
 }
 function reset(){for(const a of animals){a.at=null;a.model.visible=false;}sync();}
 return {sync,update,reset,discoveries,readingObjects:()=>animals.filter(a=>a.model.visible).map(a=>({kind:a.kind,model:a.model,index:a.index})),snapshot:()=>animals.filter(a=>a.model.visible).map(a=>({kind:a.kind,at:a.at,x:a.model.position.x,y:a.model.position.y,z:a.model.position.z,walking:a.walking,perch:a.perch}))};
}
