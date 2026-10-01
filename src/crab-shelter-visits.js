// Shared transient visits; the delight runtime remains the sole claim authority.
export function createCrabShelterVisits({getShelters,anchor,claim,release:releaseClaim,visited,canTravel,groundY,move}){
 const visits=new Map(),retry=new Map(),skipped=new Map();
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 function path(actor,from,to,shelter){
  if(!point(to)||!Number.isFinite(groundY(actor,to.x,to.z)))return null;
  if(canTravel(actor,from,to))return [to];
  // Reuse the small local corner/sidestep search, never world navigation.
  const nodes=[from,to,...[[2,2],[2,-2],[-2,2],[-2,-2],[0,2.4],[2.4,0],[-2.4,0],[0,-2.4]].map(([x,z])=>({x:shelter.gx*2+x,z:shelter.gz*2+z})),...[[-1.5,0],[1.5,0],[0,1.5],[0,-1.5],[0,3],[0,-3],[-1.5,3],[1.5,3],[-3,0],[3,0]].map(([x,z])=>({x:from.x+x,z:from.z+z}))];
  const queue=[0],parents=new Map([[0,-1]]);
  for(const i of queue)for(let j=1;j<nodes.length;j++){
   if(parents.has(j)||!canTravel(actor,nodes[i],nodes[j]))continue;
   parents.set(j,i);
   if(j===1){const result=[];for(let k=1;k!==0;k=parents.get(k))result.unshift(nodes[k]);return result;}
   queue.push(j);
  }
  return null;
 }
 function clear(actor,time,cooldown=0,skip=false){
  const visit=visits.get(actor.id);
  if(skip&&visit){let denied=skipped.get(actor.id);if(!denied)skipped.set(actor.id,denied=new Map());denied.set(visit.id,time+8);}
  releaseClaim(actor.id);visits.delete(actor.id);actor.shelterId=null;actor.visitStage=0;
  actor.homeCooldown=time+cooldown;retry.set(actor.id,time+cooldown);
 }
 function update(actor,dt,time){
  if(!(dt>0)||actor.kind!=='crab')return false;
  const shelters=getShelters().filter(p=>p.kind==='crabShelter');
  let visit=visits.get(actor.id),shelter=visit&&shelters.find(p=>p.id===visit.id);
  if(visit&&!shelter){clear(actor,time);visit=null;}
  if(!visit){
   if(time<(retry.get(actor.id)??0))return false;
   const denied=skipped.get(actor.id);
   if(denied)for(const [id,until] of denied)if(until<=time||!shelters.some(p=>p.id===id))denied.delete(id);
   const candidates=shelters.filter(p=>(!p.visitorId||p.visitorId===actor.id)&&distance(actor,{x:p.gx*2,z:p.gz*2})<20&&!denied?.has(p.id));
   candidates.sort((a,b)=>Number((b.requestUntil??0)>time)-Number((a.requestUntil??0)>time)||distance(actor,{x:a.gx*2,z:a.gz*2})-distance(actor,{x:b.gx*2,z:b.gz*2})||a.id-b.id);
   for(const p of candidates){
    const entry=anchor(p,'entry'),inside=anchor(p,'inside'),outbound=path(actor,actor,entry,p);
    if(!outbound||!path(actor,entry,inside,p)||!path(actor,inside,entry,p))continue;
    if(!claim(p.id,actor.id))continue;
    shelter=p;visit={id:p.id,stage:0,path:outbound,blocked:0,replanAt:time,stay:0,home:{x:actor.homeX??actor.x,z:actor.homeZ??actor.z}};
    visits.set(actor.id,visit);actor.shelterId=p.id;actor.visitStage=0;break;
   }
   if(!visit){retry.set(actor.id,time+2);return false;}
  }
  actor.speed=0;
  if((actor.greetUntil??0)>time){actor.activity='alert';return true;}
  const goal=visit.stage===3?visit.home:anchor(shelter,visit.stage===1?'inside':'entry');
  if(!point(goal)){clear(actor,time,0,true);return false;}
  if(distance(actor,goal)<.045){
   visit.blocked=0;visit.path=null;
   if(visit.stage===1){
    actor.activity=Math.sin(time*.4)>.5?'forage':'idle';actor.yaw=shelter.rotation*Math.PI/2;
    if(!visit.rewarded){visited(shelter.id);visit.rewarded=true;}
    visit.stay+=dt;if(visit.stay<12)return true;
   }
   if(visit.stage===3){clear(actor,time,12);return true;}
   actor.visitStage=++visit.stage;visit.replanAt=time;return true;
  }
  if((!visit.path||!visit.path.length)&&time>=visit.replanAt){visit.path=path(actor,actor,goal,shelter);visit.replanAt=time+2;}
  while(visit.path?.length>1&&distance(actor,visit.path[0])<.045)visit.path.shift();
  const next=visit.path?.[0],before={x:actor.x,z:actor.z};
  if(next&&canTravel(actor,actor,next)){
   actor.yaw=Math.atan2(-(next.z-actor.z),next.x-actor.x);move(actor,next,dt);
  }else visit.path=null;
  const moved=distance(before,actor);
  actor.activity=moved>.00001?'move':'idle';
  visit.blocked=moved>.00001?0:visit.blocked+dt;
  if(visit.blocked>=3){clear(actor,time,0,true);return false;}
  return true;
 }
 return {update,release(actorId){releaseClaim(actorId);visits.delete(actorId);retry.delete(actorId);skipped.delete(actorId);}};
}
