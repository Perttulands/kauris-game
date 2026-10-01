import {plantVolume} from './cultivation.js';
import {WATER_PORTS,WATER_KINDS,waterPoint,rotateWater,pumpIntake} from './water-spec.js';
import {propBoxes,boxesOverlap} from './delights.js';
import {buildingBoxes} from './building.js';
import {sampleCell,cellAt} from './surface-grid.js';
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
export function describeWaterNetwork(s,{solidsAt=()=>[]}={}){
 const props=s.delights,ports=new Map(props.map(p=>[p.id,waterPorts(p)])),edges=[],rejected=[],drives=[];
 const nodes=props.filter(p=>WATER_KINDS.includes(p.kind)).map(p=>{
  const source=p.kind==='pump'?pumpIntake(p):null,points=source?.ok?[[0,1.1,-.6],source.intake.elbow,source.intake.mouth].map(a=>waterPoint(p,a)):[];
  return {id:p.id,kind:p.kind,on:p.on,sourceValid:!!source?.ok&&points.slice(1).every((b,i)=>connectionClear(s,points[i],b,[p.id],.1,solidsAt))};
 });
 for(const p of props.filter(p=>WATER_KINDS.includes(p.kind)).sort((a,b)=>a.id-b.id)){
  for(const out of ports.get(p.id).filter(a=>a.name.startsWith('outlet'))){
   const candidates=props.filter(q=>q.id!==p.id&&q.gx*2===p.gx*2+out.nx*2&&q.gz*2===p.gz*2+out.nz*2).sort((a,b)=>a.id-b.id);
   for(const q of candidates){
    const into=ports.get(q.id).find(a=>a.name==='inlet');let reason=null;
    if(!into)reason='no-inlet';
    else if(out.nx!==-into.nx||out.nz!==-into.nz)reason='facing';
    else if(Math.hypot(out.x-into.x,out.z-into.z)>.25)reason='gap';
    else if(out.y+1e-6<into.y)reason='uphill';
    else if(out.y-into.y>.600001)reason='drop';
    else if(!connectionClear(s,out,into,[p.id,q.id],.025,solidsAt))reason='blocked';
    const edge={from:p.id,to:q.id,port:out.name,a:out,b:into};
    if(reason)rejected.push({...edge,reason});else {edges.push(edge);break;}
   }
  }
 }
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
 return {nodes,edges,rejected,drives};
}
