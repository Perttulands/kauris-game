import {createCrabShelterVisits} from './crab-shelter-visits.js';
import {createMarineAnimal,animateMarineAnimal,MARINE_PROFILES} from './marine-visuals.js';
import {createAnimal,animateAnimal} from './garden-visuals.js';
import {nearbyChunks} from './world-data.js';
import {sampleWorld} from './world-layout.js';
import {TERRAIN} from './terrain.js';
import {solidInterval} from './reef-collision.js';
import {buildingBoxes,touches} from './building.js';
import {propBoxes,propAnchor} from './delights.js';
import {SEA_LIMITS} from './sea-habitats.js';

// Transient bounded populations, stable through chunk/quality changes.
export function createOuterLife({scene,state,solidsAt,getDelights=()=>null}){
 const actors=new Map(),retryAfter=new Map(),omitted=new Map();let time=0,observed=[];
 const kindOf=m=>m.kind.slice(8);
 function clear(a,x,y,z){
  const r=a.profile.radius,minY=y+a.profile.minY,maxY=y+a.profile.maxY,floor=sampleWorld(x,z).height;
  if(a.kind==='fish'&&(maxY>TERRAIN.waterY-.18||minY<Math.max(...[[0,0],[r,0],[-r,0],[0,r],[0,-r]].map(([dx,dz])=>sampleWorld(x+dx,z+dz).height))+.2))return false;
  if(a.kind==='bird'&&floor<TERRAIN.waterY)return false;
  if(a.kind==='crab'){const levels=[[r,0],[-r,0],[0,r],[0,-r]].map(([dx,dz])=>sampleWorld(x+dx,z+dz).height);if(Math.max(...levels)-Math.min(...levels)>.16||floor>TERRAIN.waterY+.25)return false;}
  if(solidsAt(x,z).some(s=>{const v=solidInterval(s,x,z,r);return v&&v.minY<maxY&&v.maxY>minY+.01;}))return false;
  if([...state.buildings.flatMap(buildingBoxes),...state.delights.flatMap(p=>propBoxes(p))].some(b=>touches(b,x,z,r)&&b.maxY>minY&&b.minY<maxY))return false;
  return ![...actors.values()].some(b=>b!==a&&Math.abs(b.y-y)<.6&&Math.hypot(b.x-x,b.z-z)<r+b.profile.radius+.04);
 }
 function rootY(a,x,z){const h=sampleWorld(x,z).height;return a.kind==='crab'?h:a.kind==='fish'?Math.min(TERRAIN.waterY-.6,Math.max(TERRAIN.waterY-1.1,h+.7)):h+2.2+Math.sin(time*.8+a.home.variant)*.18;}
 const shelterVisits=createCrabShelterVisits({
  getShelters:()=>state.delights.map(p=>({...p,requestUntil:getDelights()?.motion?.get(p.id)?.request??0,visitorId:getDelights()?.motion?.get(p.id)?.visitorId??null})),
  anchor:propAnchor,claim:(id,actor)=>getDelights()?.claim(id,actor)??false,
  release:actor=>getDelights()?.release(actor),visited:id=>getDelights()?.visited(id),
  groundY:(_a,x,z)=>sampleWorld(x,z).height,
  canTravel:(a,from,to)=>{const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.1));for(let i=0;i<=n;i++){const x=from.x+(to.x-from.x)*i/n,z=from.z+(to.z-from.z)*i/n;if(!clear(a,x,rootY(a,x,z),z))return false;}return true;},
  move:(a,target,dt)=>{const dx=target.x-a.x,dz=target.z-a.z,d=Math.hypot(dx,dz),step=Math.min(d,dt*.65),n=Math.max(1,Math.ceil(step/.08)),ox=a.x,oz=a.z;for(let i=1;i<=n&&d>0;i++){const x=ox+dx/d*step*i/n,z=oz+dz/d*step*i/n,y=rootY(a,x,z);if(!clear(a,x,y,z))break;Object.assign(a,{x,y,z});}a.speed=Math.hypot(a.x-ox,a.z-oz)/dt;}
 });
 function retire(a){shelterVisits.release(a.id);scene.remove(a.model);const skeletons=new Set();a.model.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();for(const {material} of a.fade)material.dispose();actors.delete(a.id);}
 function admit(m,index){
  const kind=kindOf(m),profile=kind==='bird'?{radius:.5,minY:-.07,maxY:.42}:MARINE_PROFILES[kind];
  if(!profile)return false;
  const a={id:index?m.id+':'+index:m.id,kind,home:m,homeX:m.x,homeZ:m.z,profile,index,x:m.x,z:m.z,y:0,yaw:m.yaw,phase:index*.21,speed:0,activity:'idle',born:time,fade:[]};
  const ox=kind==='fish'?(index%2?1:-1)*.65:0,oz=kind==='fish'?(index>1?.65:-.65):0;
  let found=false;
  for(let i=0;i<25&&!found;i++){
   const angle=i*2.4,r=i===0?0:.2+(i-1)*.11,x=m.x+ox+Math.cos(angle)*r,z=m.z+oz+Math.sin(angle)*r,y=rootY(a,x,z);
   if(clear(a,x,y,z)){Object.assign(a,{x,y,z});found=true;}
  }
  if(!found)return false;
  a.model=kind==='bird'?createAnimal('bird'):createMarineAnimal(kind,(m.variant+index)%2);
  if(kind==='bird')a.model.scale.setScalar(.7);
  // Private fade materials; immutable shared factory materials remain untouched.
  const materials=new Map();a.model.traverse(o=>{if(!o.isMesh)return;const clone=source=>{if(!materials.has(source)){const material=source.clone();materials.set(source,material);a.fade.push({material,opacity:source.opacity,transparent:source.transparent});}return materials.get(source);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});
  a.model.position.set(a.x,a.y,a.z);actors.set(a.id,a);scene.add(a.model);return true;
 }
 function update(dt,player){
  dt=Math.min(.1,Math.max(0,dt));if(dt===0)return;time+=dt;
  const markers=nearbyChunks(player.x,player.z,SEA_LIMITS.retire).flatMap(d=>d.decorations).filter(d=>d.kind.startsWith('habitat-'));
  for(const a of [...actors.values()])if(Math.hypot(a.home.x-player.x,a.home.z-player.z)>SEA_LIMITS.retire)retire(a);
  const active=new Set([...actors.values()].map(a=>a.home.id));
  observed=markers.filter(m=>Math.hypot(m.x-player.x,m.z-player.z)<=SEA_LIMITS.entry).sort((a,b)=>Number(active.has(b.id))-Number(active.has(a.id))||Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z)||a.id.localeCompare(b.id));
  const ids=new Set(markers.map(m=>m.id));for(const map of [retryAfter,omitted])for(const id of map.keys())if(!ids.has(id))map.delete(id);
  let attempts=0;
  for(const m of observed){
   if(active.has(m.id)||time<(retryAfter.get(m.id)??0))continue;
   const kind=kindOf(m),count=[...actors.values()].filter(a=>a.kind===kind).length,available=(SEA_LIMITS[kind]??0)-count;
   if(available<=0){omitted.set(m.id,'pool');continue;}
   if(attempts++>=1)break; // At most one new habitat/group per frame.
   let added=0;for(let i=0;i<Math.min(kind==='fish'?4:1,available);i++)if(admit(m,i))added++;
   if(!added){retryAfter.set(m.id,time+5);omitted.set(m.id,'clearance');}else omitted.delete(m.id);
  }
  for(const a of actors.values()){
   const origin={x:a.x,z:a.z},visiting=a.kind==='crab'&&shelterVisits.update(a,dt,time);
   if(!visiting){
   const m=a.home,pause=a.kind==='crab'&&(time+m.variant)%15>10,r=a.kind==='crab'?.7:a.kind==='fish'?1.8:2.8,rate=a.kind==='crab'?.09:a.kind==='fish'?.17:.4,t=time*rate+m.variant*2;
   const ox=a.kind==='fish'?(a.index%2?1:-1)*.65:0,oz=a.kind==='fish'?(a.index>1?.65:-.65):0;
   const tx=m.x+Math.cos(t)*r+ox,tz=m.z+Math.sin(t)*r+oz,dx=tx-a.x,dz=tz-a.z,d=Math.hypot(dx,dz),step=Math.min(d,dt*(pause?0:a.kind==='crab'?.2:a.kind==='fish'?.6:1.2)),x=a.x+dx/Math.max(d,.001)*step,z=a.z+dz/Math.max(d,.001)*step,wantedY=rootY(a,x,z),y=a.kind==='crab'?wantedY:a.y+Math.max(-dt*.4,Math.min(dt*.4,wantedY-a.y));let moved=0;
   if(clear(a,x,y,z)){moved=Math.hypot(x-a.x,z-a.z);if(moved>.00001)a.yaw=a.kind==='crab'?Math.atan2(-(z-a.z),x-a.x):Math.atan2(x-a.x,z-a.z);Object.assign(a,{x,y,z});}
   a.speed=moved/Math.max(dt,.001);a.activity=a.speed>.015?'travel':'idle';
   }
   a.phase+=a.kind==='crab'?Math.hypot(a.x-origin.x,a.z-origin.z)/a.profile.stride:dt*(.3+a.speed*2.3);
   const fade=Math.min(1,(time-a.born)/.8);for(const f of a.fade){f.material.opacity=f.opacity*fade;f.material.transparent=fade<1||f.transparent;}
   a.model.visible=true;a.model.position.set(a.x,a.y,a.z);a.model.rotation.y=a.yaw;
   if(a.kind==='bird')animateAnimal(a.model,{time,walk:a.speed>0?1:0,perch:0});else animateMarineAnimal(a.model,{time,dt,speed:a.speed,turn:0,activity:a.activity,phase:a.phase});a.model.updateMatrixWorld(true);
  }
 }
 return {update,readingObjects:()=>[...actors.values()],diagnostics:()=>({candidates:observed.map(m=>m.id),omitted:[...omitted].map(([id,reason])=>({id,reason})),count:actors.size}),snapshot:()=>[...actors.values()].map(({id,kind,x,y,z,phase,speed,activity,profile,model,home})=>({id,habitatId:home.id,kind,x,y,z,phase,speed,activity,profile,modelId:model.uuid,presented:!!(model.layers.mask&1)}))};
}
