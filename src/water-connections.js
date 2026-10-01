import {waterGeometry,waterJoinPlans} from './water-geometry.js';
import {plantVolume} from './cultivation.js';
import {WATER_PORTS,WATER_KINDS,waterPoint,rotateWater,pumpIntake} from './water-spec.js';
import {propBoxes,boxesOverlap} from './delights.js';
import {buildingBoxes} from './building.js';
import {sampleCell,cellAt,surfaceAt} from './surface-grid.js';
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function waterPorts(p){
 const ports=WATER_PORTS[p.kind]??{};
 return Object.entries(ports).map(([name,point])=>{
  const local=name==='inlet'?[-1,0]:name==='drive'?(p.kind==='lift'?[0,-1]:[0,1]):point[2]>.5?[0,1]:[1,0];
  const [nx,nz]=rotateWater(...local,p.rotation);
  return {name,...waterPoint(p,point),nx,nz};
 });
}
export function segmentBox(a,b,r=.025){return {minX:Math.min(a.x,b.x)-r,maxX:Math.max(a.x,b.x)+r,minY:Math.min(a.y,b.y)-r,maxY:Math.max(a.y,b.y)+r,minZ:Math.min(a.z,b.z)-r,maxZ:Math.max(a.z,b.z)+r};}
export function connectionClear(s,a,b,owners=[],radius=.025,solidsAt=()=>[]){
 const hard=[...Object.values(s.plots??{}).map(p=>plantVolume(p,{reserve:true})).filter(Boolean),...(s.buildings??[]).flatMap(buildingBoxes),...s.delights.filter(p=>!owners.includes(p.id)).flatMap(p=>propBoxes(p))];
 const steps=Math.max(1,Math.ceil(length(a,b)/.05));
 for(let i=0;i<=steps;i++){
  const u=i/steps,p={x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u},c=cellAt(p.x,p.z);
  if(p.y-radius<sampleCell(c.gx,c.gz).height-.001)return false;
  const bounds=segmentBox(p,p,radius);
  if([...hard,...solidsAt(p.x,p.z)].some(q=>boxesOverlap(bounds,q,.001)))return false;
 }
 return true;
}
function socketAllows(bounds,solid,point){
 if(!point)return false;
 const lo={x:Math.max(bounds.minX,solid.minX),y:Math.max(bounds.minY,solid.minY),z:Math.max(bounds.minZ,solid.minZ)},hi={x:Math.min(bounds.maxX,solid.maxX),y:Math.min(bounds.maxY,solid.maxY),z:Math.min(bounds.maxZ,solid.maxZ)};
 return [lo.x,hi.x].every(x=>[lo.y,hi.y].every(y=>[lo.z,hi.z].every(z=>Math.hypot(x-point.x,y-point.y,z-point.z)<=.245)));
}
export function waterGeometryClear(s,plan,{solidsAt=()=>[],sockets=new Map(),intakeOwner=null}={}){
 const hard=[...Object.values(s.plots??{}).map(p=>plantVolume(p,{reserve:true})).filter(Boolean),...(s.buildings??[]).flatMap(buildingBoxes)];
 for(const box of plan.boxes){
  for(const x of [box.minX,(box.minX+box.maxX)/2,box.maxX])for(const z of [box.minZ,(box.minZ+box.maxZ)/2,box.maxZ]){
   if(box.minY<surfaceAt(s,x,z).floor-.004)return false;
   if(solidsAt(x,z).some(q=>boxesOverlap(box,q,.001)))return false;
  }
  if(hard.some(q=>boxesOverlap(box,q,.001)))return false;
  for(const p of s.delights)for(const q of propBoxes(p,{includeIntake:p.id!==intakeOwner,envelope:p.kind==='lift'})){
   if(boxesOverlap(box,q,.001)&&!socketAllows(box,q,sockets.get(p.id)))return false;
  }
 }
 return true;
}
export function describeWaterNetwork(s,{solidsAt=()=>[]}={}){
 const props=s.delights,ports=new Map(props.map(p=>[p.id,waterPorts(p)])),edges=[],rejected=[],drives=[],joins=[],intakes=[];
 const nodes=props.filter(p=>WATER_KINDS.includes(p.kind)).map(p=>{
  const source=p.kind==='pump'?pumpIntake(p):null;
  let sourceValid=false;
  if(source?.ok){
   const path=[[0,1.1,-.6],source.intake.elbow,source.intake.mouth].map(a=>waterPoint(p,a)),[nx,nz]=rotateWater(0,-1,p.rotation);
   const plan=waterGeometry({key:'intake:'+p.id,kind:'pipe',from:p.id,port:'intake',path,nx,nz});
   sourceValid=!!plan&&waterGeometryClear(s,plan,{solidsAt,sockets:new Map([[p.id,path[0]]]),intakeOwner:p.id});
   if(plan)intakes.push({...plan,valid:sourceValid});
  }
  return {id:p.id,kind:p.kind,on:p.on,sourceValid};
 });
 for(const p of props.filter(p=>WATER_KINDS.includes(p.kind)).sort((a,b)=>a.id-b.id)){
  for(const out of ports.get(p.id).filter(a=>a.name.startsWith('outlet'))){
   const candidates=props.filter(q=>q.id!==p.id&&q.gx*2===p.gx*2+out.nx*2&&q.gz*2===p.gz*2+out.nz*2).sort((a,b)=>a.id-b.id);
   for(const q of candidates){
    const into=ports.get(q.id).find(a=>a.name==='inlet');let reason=null,plan=null;
    if(!into)reason='no-inlet';
    else if(out.nx!==-into.nx||out.nz!==-into.nz)reason='facing';
    else if(Math.hypot(out.x-into.x,out.z-into.z)>.25)reason='gap';
    else if(p.kind!=='pump'&&out.y+1e-6<into.y)reason='uphill';
    else{
     plan=waterJoinPlans(p,q,out,into).find(plan=>waterGeometryClear(s,plan,{solidsAt,sockets:new Map([[p.id,out],[q.id,into]])}));
     if(!plan)reason='blocked';
    }
    const edge={from:p.id,to:q.id,port:out.name,a:out,b:into};
    if(reason)rejected.push({...edge,reason});else {edges.push(edge);joins.push(plan);break;}
   }
  }
 }
 // Both intersecting joins become dry; never let ID/order hide a collision.
 const blocked=new Set();
 for(let i=0;i<joins.length;i++)for(let j=i+1;j<joins.length;j++)if(joins[i].boxes.some(a=>joins[j].boxes.some(b=>boxesOverlap(a,b,.001)))){blocked.add(joins[i].key);blocked.add(joins[j].key);}
 for(let i=edges.length-1;i>=0;i--)if(blocked.has(joins[i].key)){rejected.push({...edges[i],reason:'blocked'});edges.splice(i,1);joins.splice(i,1);}
 for(const lift of props.filter(p=>p.kind==='lift').sort((a,b)=>a.id-b.id)){
  const b=ports.get(lift.id).find(a=>a.name==='drive');
  for(const wheel of props.filter(p=>p.kind==='waterWheel'&&p.rotation===lift.rotation).sort((a,b)=>a.id-b.id)){
   const [dx,dz]=rotateWater(0,2,wheel.rotation),a=ports.get(wheel.id).find(p=>p.name==='drive');
   if(lift.gx*2!==wheel.gx*2+dx||lift.gz*2!==wheel.gz*2+dz||Math.abs(lift.baseY-wheel.baseY)>.1||length(a,b)>.25)continue;
   if(connectionClear(s,a,b,[wheel.id,lift.id],.12,solidsAt))drives.push({from:wheel.id,to:lift.id,a,b});
   else rejected.push({from:wheel.id,to:lift.id,port:'drive',a,b,reason:'blocked'});
   break;
  }
 }
 return {nodes,edges,rejected,drives,joins,intakes};
}

export function waterReservations(s,options){return describeWaterNetwork(s,options).joins.flatMap(p=>p.boxes);}
