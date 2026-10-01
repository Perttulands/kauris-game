import {createCrabShelterVisits} from './crab-shelter-visits.js';
import {TERRAIN,terrainHeight} from './terrain.js';
import {solidInterval} from './reef-collision.js';
import {propBoxes,propAnchor} from './delights.js';
import {findHomes} from './residents.js';
import {adjacentCells,baseOf,buildingBoxes,canonicalPiece,elevation} from './building.js';

// Transient inhabitants: never read or write inventories, plots or saved actors.
// The visual factory supplies conservative bounds including every moving limb.
const TAU=Math.PI*2,STEP=1/60;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const swimming=kind=>kind==='fish'||kind==='turtle';
const still=kind=>kind==='starfish'||kind==='anemone';
export const MARINE_COUNTS=Object.freeze({fish:12,crab:3,turtle:1,octopus:1,starfish:6,anemone:3});

function occupied(buildings,context=buildings){
 const boxes=buildings.flatMap(buildingBoxes),cells=new Map(),homes=findHomes(context);
 for(const b of buildings){
  const adjacent=adjacentCells(b),nearHomes=homes.filter(h=>h.baseY===baseOf(b)&&adjacent.some(c=>h.cells.includes(`${c.gx},${c.gz}`)));
  // Physical boundaries stay solid. A paid floor identifies the protected room
  // even before its roof is finished; do not reserve empty exterior water.
  const floorSide=adjacent.filter(c=>context.some(f=>f.kind==='floor'&&f.gx===c.gx&&f.gz===c.gz&&elevation(f)===elevation(b)));
  const reserved=nearHomes.length?adjacent.filter(c=>nearHomes.some(h=>h.cells.includes(`${c.gx},${c.gz}`))):floorSide.length?floorSide:adjacent;
  for(const c of reserved){
  const key=`${c.gx},${c.gz}:${baseOf(b)}`,base=baseOf(b),old=cells.get(key);
  if(old)old.maxY=Math.max(old.maxY,base+(b.level+1)*2.4+.3);
  else cells.set(key,{minX:c.gx*2-1.25,maxX:c.gx*2+1.25,minZ:c.gz*2-1.25,maxZ:c.gz*2+1.25,minY:base-.1,maxY:base+(b.level+1)*2.4+.3});
 }}
 return boxes.concat([...cells.values()]);
}
export function createMarineLife({profiles,reefSolids=[],buildings=[],solidsAt=()=>[]}){
 let time=0,remainder=0,obstacles=occupied(buildings),props=[],toys=null,windows=[];
 const animals=[],schools=[{x:3,y:-4.6,z:42,at:0},{x:-4,y:-4.8,z:48,at:0},{x:2,y:-4.1,z:55,at:0}];
 const schoolRoutes=[[[3,42],[6,45],[1,46],[-1,41]],[[-4,48],[-6,51],[-2,53],[0,48]],[[2,55],[4,57],[0,58],[-2,54]]];
 const turtleRoute=[[-1,46],[2,43],[4,49],[-1,53],[-4,48]];

 // Circle broad phase encloses yaw and all limb poses. Ground footprints must
 // fit one terrace; swimmers include their pitch/roll envelope above the seabed.
 function clearAt(a,x,y,z,separation=true){
  const p=a.profile,r=p.radius+(a.swims?Math.max(Math.abs(p.minY),Math.abs(p.maxY))*.32:0);
  if(x-r<TERRAIN.minX||x+r>TERRAIN.maxX||z-r<TERRAIN.minZ||z+r>TERRAIN.maxZ)return false;
  let low=y+p.minY-(a.swims?.32*r:0),high=y+p.maxY+(a.swims?.32*r:0);
  const floors=[[0,0],[r,0],[-r,0],[0,r],[0,-r]].map(([dx,dz])=>terrainHeight(x+dx,z+dz));
  if(!a.swims){
   if(Math.abs(y-floors[0]-.008)>.015||Math.max(...floors)-Math.min(...floors)>.085)return false;
  }else if(low<Math.max(...floors)+.08)return false;
  if(a.kind!=='crab'&&high>TERRAIN.waterY-.12)return false;
  for(const s of [...reefSolids,...solidsAt(x,z)]){
   if(x+r<s.minX||x-r>s.maxX||z+r<s.minZ||z-r>s.maxZ||low>=s.maxY+.015||high<=s.minY-.015)continue;
   const interval=solidInterval(s,x,z,r);
   if(interval&&high>interval.minY-.015&&low<interval.maxY+.015)return false;
  }
  for(const b of [...obstacles,...props.flatMap(p=>propBoxes(p))])if(x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ&&high>b.minY&&low<b.maxY)return false;
  if(separation)for(const b of animals){
   if(b===a||!b.active)continue;
   if(high+.03>b.y+b.profile.minY-b.verticalMargin&&low-.03<b.y+b.profile.maxY+b.verticalMargin&&Math.hypot(x-b.x,z-b.z)<r+b.radius+.035)return false;
  }
  return true;
 }
 function swimY(a,x,z,wanted){
  const p=a.profile,r=p.radius+Math.max(Math.abs(p.minY),Math.abs(p.maxY))*.32;
  const floor=Math.max(...[[0,0],[r,0],[-r,0],[0,r],[0,-r]].map(([dx,dz])=>terrainHeight(x+dx,z+dz)));
  return clamp(wanted,floor+.45-p.minY+.32*r,TERRAIN.waterY-.13-p.maxY-.32*r);
 }
 function add(kind,index,x,y,z,yaw=0){
  const profile=profiles[kind];if(!profile)return;
  const a={id:`${kind}:${index}`,kind,index,variant:kind==='fish'?Math.floor(index/4)%2:index,profile,swims:swimming(kind),x,y,z,yaw,pitch:0,roll:0,speed:0,turn:0,phase:index*.173,radius:profile.radius,verticalMargin:0,activity:'idle',active:false,homeX:x,homeZ:z,target:0,avoid:0,avoidSide:index%2?1:-1,crabSide:1};
  // Only initial placement searches. Later blockers stop motion; no respawning or
  // relocating an animal through walls when a paid building changes.
  for(let i=0;i<33;i++){
   const radius=i===0?0:Math.ceil(i/8)*.75,theta=i*2.399963;
   const nx=x+Math.cos(theta)*radius,nz=z+Math.sin(theta)*radius,ny=a.swims?swimY(a,nx,nz,y):terrainHeight(nx,nz)+.008;
   if(!clearAt(a,nx,ny,nz))continue;
   Object.assign(a,{x:nx,y:ny,z:nz,homeX:nx,homeZ:nz,active:true});break;
  }
  if(a.active){animals.push(a);poseGround(a);}
 }
 function poseGround(a){
  a.radius=a.profile.radius+(a.swims?Math.max(Math.abs(a.profile.minY),Math.abs(a.profile.maxY))*.32:0);
  a.verticalMargin=a.swims?a.radius*.32:0;
  // Ground animals stand on one terrace. They stop at a step rather than tilt
  // into an imaginary continuous slope or snap across a .3m cell edge.
  if(!a.swims){a.pitch=0;a.roll=0;}
 }
 for(let i=0;i<12;i++){const group=Math.floor(i/4),s=schools[group],j=i%4;add('fish',i,s.x+(j%2?1:-1)*.65,s.y+(j>1?.32:-.26),s.z+(j>1?.8:-.8),.4+group);}
 add('crab',0,2.8,0,32.6,Math.PI);add('crab',1,-2,0,36.8,Math.PI);add('crab',2,3.2,0,40,Math.PI);
 add('turtle',0,-1,-4.45,46,.4);add('octopus',0,.15,0,61.4,Math.PI);
 for(const [i,x,z] of [[0,1.4,39.5],[1,-1.5,41],[2,4.5,41],[3,-4,40],[4,15,52],[5,-.7,63.8]])add('starfish',i,x,0,z,i*.8);
 for(const [i,x,z] of [[0,-3.2,41],[1,15,49],[2,-15,54]])add('anemone',i,x,0,z,i);

 function move(a,vx,vy,vz,dt){
  const ox=a.x,oy=a.y,oz=a.z,steps=Math.max(1,Math.ceil(Math.hypot(vx,vy,vz)*dt/.08));
  for(let i=1;i<=steps;i++){
   const x=ox+vx*dt*i/steps,z=oz+vz*dt*i/steps,y=a.swims?oy+vy*dt*i/steps:terrainHeight(x,z)+.008;
   if(!clearAt(a,x,y,z)){a.avoid=time+1.4;break;}
   a.x=x;a.y=y;a.z=z;
  }
  a.speed=Math.hypot(a.x-ox,a.y-oy,a.z-oz)/dt;
  if(a.kind==='crab')a.phase+=((a.x-ox)*Math.cos(a.yaw)-(a.z-oz)*Math.sin(a.yaw))/a.profile.stride;
  else if(a.kind==='octopus')a.phase+=Math.hypot(a.x-ox,a.z-oz)/a.profile.stride;
  else if(a.kind==='fish')a.phase+=dt*(.3+a.speed*2.3);
  poseGround(a);
 }
 function steer(a,tx,ty,tz,wanted,dt){
  let dx=tx-a.x,dz=tz-a.z;
  // Repel before contact. Circle clearance below is still authoritative.
  for(const b of animals){
   if(b===a||!b.active||Math.abs(b.y-a.y)>1)continue;
   const sx=a.x-b.x,sz=a.z-b.z,d=Math.hypot(sx,sz),gap=a.radius+b.radius+.55;
   if(d<gap&&d>.001){dx+=sx/d*(gap-d)*2.5;dz+=sz/d*(gap-d)*2.5;}
  }
  const desired=Math.atan2(dx,dz)+(a.avoid>time?a.avoidSide*1.2:0),before=a.yaw;
  a.yaw+=clamp(angle(desired-a.yaw),-dt*(a.kind==='turtle'?.65:1.65),dt*(a.kind==='turtle'?.65:1.65));
  a.turn=clamp(angle(a.yaw-before)/(dt*1.2),-1,1);
  ty=a.swims?swimY(a,a.x,a.z,ty):ty;
  const speed=wanted*Math.max(.12,Math.cos(angle(desired-a.yaw))),vy=a.swims?clamp((ty-a.y)*.65,-.22,.22):0;
  move(a,Math.sin(a.yaw)*speed,vy,Math.cos(a.yaw)*speed,dt);
  if(a.swims){a.pitch+=(clamp(-Math.atan2(vy,Math.max(.1,a.speed)),-.16,.16)-a.pitch)*Math.min(1,dt*2);a.roll+=(-a.turn*(a.kind==='turtle'?.16:.12)-a.roll)*Math.min(1,dt*3);}
 }
 const shelterVisits=createCrabShelterVisits({
  getShelters:()=>props.map(p=>({...p,requestUntil:toys?.motion?.get(p.id)?.request??0,visitorId:toys?.motion?.get(p.id)?.visitorId??null})),
  anchor:propAnchor,claim:(id,actor)=>toys?.claim(id,actor)??false,
  release:actor=>toys?.release(actor),visited:id=>toys?.visited(id),
  groundY:(_a,x,z)=>terrainHeight(x,z)+.008,
  canTravel:(a,from,to)=>{const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.1));for(let i=0;i<=n;i++){const x=from.x+(to.x-from.x)*i/n,z=from.z+(to.z-from.z)*i/n;if(!clearAt(a,x,terrainHeight(x,z)+.008,z))return false;}return true;},
  move:(a,target,dt)=>{const dx=target.x-a.x,dz=target.z-a.z,d=Math.hypot(dx,dz);if(d>0){const speed=Math.min(.65,d/dt);move(a,dx/d*speed,0,dz/d*speed,dt);}}
 });
 function setWindows(next){
  const homes=findHomes(next);windows=[];
  for(const b of next)if(b.material==='diamond'&&b.kind==='window'&&b.level===0&&baseOf(b)<-1){
   const cells=adjacentCells(b),home=homes.find(h=>h.baseY===baseOf(b)&&h.cells.some(k=>cells.some(c=>k===`${c.gx},${c.gz}`)));if(!home)continue;
   const edge=canonicalPiece(b),inside=cells.find(c=>home.cells.includes(`${c.gx},${c.gz}`)),axis=edge.rotation,nx=axis?(inside.gx===edge.gx?-1:1):0,nz=axis?0:(inside.gz===edge.gz?-1:1),x=edge.gx*2-(axis?1:0),z=edge.gz*2-(axis?0:1);
   windows.push({id:b.id,x:x+nx*.95,y:baseOf(b)+1.25,z:z+nz*.95,nx,nz,inside:{x:x-nx*.68,z:z-nz*.68},baseY:baseOf(b)});
  }
 }
 setWindows(buildings);
 function step(dt,player){
  time+=dt;
  for(let i=0;i<schools.length;i++){
   const s=schools[i],route=schoolRoutes[i],p=route[s.at],dx=p[0]-s.x,dz=p[1]-s.z,d=Math.hypot(dx,dz);
   if(d<.2)s.at=(s.at+1)%route.length;
   else{const distance=Math.min(d,dt*.24);s.x+=dx/d*distance;s.z+=dz/d*distance;}
  }
  for(const a of animals){
   a.turn=0;
   if(still(a.kind)){a.activity='idle';a.phase+=dt*.07;continue;}
   const near=player&&Math.hypot(player.x-a.x,player.y-a.y,player.z-a.z)<1.6;
   if(a.kind==='crab'){
    if(shelterVisits.update(a,dt,time))continue;
    const cycle=(time+a.index*4.1)%16;
    a.activity=near?'alert':cycle<5?'forage':cycle<7?'idle':'move';
    if(a.activity==='move'){
     if(a.x>a.homeX+1.25)a.crabSide=-1;else if(a.x<a.homeX-1.25)a.crabSide=1;
     const wanted=.21*Math.min(1,(cycle-7)*2,(16-cycle)*2);
     move(a,a.crabSide*wanted,0,0,dt);
     if(a.speed<.005)a.crabSide=-a.crabSide;
    }else a.speed=0;
   }else if(a.kind==='octopus'){
    const cycle=time%28;a.activity=cycle<7?'idle':cycle<15?'forage':'move';
    if(a.activity==='move'){
     const tx=a.homeX+(a.target%2?.65:-.65),tz=a.homeZ+(a.target%2?-.2:.3);
     if(Math.hypot(a.x-tx,a.z-tz)<.16){a.target++;a.activity='forage';a.speed=0;}
     else steer(a,tx,a.y,tz,.095,dt);
    }else a.speed=0;
   }else if(a.kind==='turtle'){
    a.phase+=dt/3.8;const cycle=time%48,graze=cycle>34;
    a.activity=graze?'forage':'move';
    const point=turtleRoute[a.target%turtleRoute.length];
    if(!graze&&Math.hypot(a.x-point[0],a.z-point[1])<.65)a.target++;
    const stroke=(a.phase%1)<.32?Math.sin(a.phase%1/.32*Math.PI):0;
    steer(a,graze?a.x+Math.sin(a.yaw)*1:point[0],graze?terrainHeight(a.x,a.z)+.68:-4.45+.25*Math.sin(time*.09),graze?a.z+Math.cos(a.yaw)*1:point[1],graze?.075:.23+.34*stroke,dt);
   }else{
    const window=a.index%4===0&&time>=(a.windowCooldown??0)?windows.find(w=>Math.hypot(w.x-a.x,w.z-a.z)<9):null;
    if(a.windowId!==window?.id){a.windowWait=0;a.windowStarted=time;}a.windowId=window?.id??null;if(window){a.activity='curious';const d=Math.hypot(window.x-a.x,window.y-a.y,window.z-a.z);if(d>.2)steer(a,window.x,window.y,window.z,.3,dt);else {a.speed=0;a.yaw=Math.atan2(-window.nx,-window.nz);a.phase+=dt*.3;a.windowWait+=dt;}if(a.windowWait>8||time-a.windowStarted>30)a.windowCooldown=time+38;continue;}
    const s=schools[Math.floor(a.index/4)],j=a.index%4,cycle=(time+a.index*1.7)%23;
    a.activity=cycle>18?'forage':'move';
    steer(a,s.x+(j%2?1:-1)*(.7+.12*Math.sin(time*.21+a.index)),s.y+(j>1?.32:-.26)+.12*Math.sin(time*.35+a.index),s.z+(j>1?.9:-.9),a.activity==='forage'?.14:.40+.035*(a.index%3),dt);
   }
  }
 }
 return {
  animals,profiles,
  update(dt,player){if(!(dt>0))return;remainder+=Math.min(dt,.1);while(remainder>=STEP){step(STEP,player);remainder-=STEP;}},
  setBuildings(next){buildings=next;obstacles=occupied(next);setWindows(next);},
  setDelights(next,system){props=next;toys=system;},
  greet(point){for(const a of animals)if(a.kind==='crab'&&a.shelterId&&Math.hypot(a.x-point.x,a.z-point.z)<5)a.greetUntil=time+3;},
  get windows(){return windows;},
  clearAt,
  overlapsBuilding(piece){
   const candidate=occupied([piece],[...buildings,piece]);
   return animals.some(a=>candidate.some(b=>a.x+a.radius>b.minX&&a.x-a.radius<b.maxX&&a.z+a.radius>b.minZ&&a.z-a.radius<b.maxZ&&a.y+a.profile.maxY+a.verticalMargin>b.minY&&a.y+a.profile.minY-a.verticalMargin<b.maxY));
  },
  snapshot:()=>animals.map(({id,kind,index,variant,x,y,z,yaw,pitch,roll,speed,turn,phase,activity,profile,radius,verticalMargin,shelterId,visitStage,windowId,greetUntil})=>({id,kind,index,variant,x,y,z,yaw,pitch,roll,speed,turn,phase,activity,radius,shelterId,visitStage,windowId,greeting:(greetUntil??0)>time,minY:profile.minY-verticalMargin,maxY:profile.maxY+verticalMargin})),
  get time(){return time;},
 };
}
