// Authoritative paid toy definitions, anchors and physical rules. No renderer/state cycle.
import {TERRAIN,terrainHeight,buildBase,inWorld} from './terrain.js';
import {buildingBoxes,baseOf,touches} from './building.js';
import {WILD_RESOURCES,WORLD_OBSTACLES,wildFootprint,cellFootprint,overlaps,nearbyResources,localSolidBounds} from './world-data.js';
import {activeDiscoveries} from './garden.js';
const box=(minX,maxX,minY,maxY,minZ,maxZ)=>({minX,maxX,minY,maxY,minZ,maxZ});
const post=(x,z,height,width=.1)=>box(x-width/2,x+width/2,0,height,z-width/2,z+width/2);
const freeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')freeze(v);return Object.freeze(o);};
export const DELIGHTS=freeze({
 birdhouse:{material:'wood',cost:6,size:[.55,1.65,1.16],boxes:[post(0,0,1.3,.12),box(-.28,.28,1.0,1.65,-.28,.28)],anchors:{perch:[0,.97,.55],use:[0,1.2,.4]}},
 crabShelter:{material:'wood',cost:4,size:[1.88,.78,1.76],boxes:[box(-.94,-.82,0,.72,-.88,.88),box(.82,.94,0,.72,-.88,.88),box(-.82,.82,0,.72,-.88,-.76),box(-.94,.94,.60,.78,-.88,.88)],anchors:{entry:[0,0,1.7],inside:[0,0,0],shell:[.55,.02,1.08],use:[0,.4,1]}},
 gutter:{material:'copper',cost:4,size:[1.8,1.25,.9],boxes:[post(-.65,0,.8),post(.65,0,.8),box(-.9,.9,.65,.85,-.4,.4)],anchors:{pour:[0,1.05,0],outlet:[.9,.72,0],use:[0,.9,.55]}},
 waterWheel:{material:'copper',cost:6,size:[1.8,1.25,.9],boxes:[box(-.9,.9,0,.22,-.4,.4),post(0,0,1.1,.15)],anchors:{inlet:[-.9,.72,0],outlet:[.6,.15,.2],axle:[0,.65,0],use:[0,.7,.6]}},
 bell:{material:'copper',cost:3,size:[.65,1.25,.5],boxes:[post(-.27,0,1.25),post(.27,0,1.25),box(-.32,.32,1.12,1.25,-.1,.1)],anchors:{bell:[0,.9,0],use:[0,.85,.5]}},
 lift:{material:'iron',cost:8,size:[2,3,2],boxes:[post(-.92,-.92,3,.12),post(.92,-.92,3,.12),post(-.92,.92,3,.12),post(.92,.92,3,.12)],platform:box(-.775,.775,.05,.15,-.775,.775),travel:2.4,speed:.55,anchors:{platform:[0,.15,0],use:[-.85,1.0,1]}},
 lamp:{material:'diamond',cost:5,size:[.55,1.2,.55],boxes:[post(0,0,.9,.13),box(-.27,.27,.85,1.2,-.27,.27)],anchors:{light:[0,1.05,0],use:[0,1,.45]}},
 curtain:{material:'fiber',cost:4,size:[1.25,1.5,.4],boxes:[post(-.59,0,1.5),post(.59,0,1.5),box(-.625,.625,1.42,1.5,-.06,.06)],anchors:{cloth:[0,.8,0],use:[0,.8,.5]}},
 hammock:{material:'fiber',cost:6,size:[2,1.3,1.35],boxes:[post(-.88,0,1.3,.12),post(.88,0,1.3,.12)],anchors:{seat:[0,.5,0],left:[-.82,1.1,0],right:[.82,1.1,0],use:[0,.65,.8]}},
 windsock:{material:'fiber',cost:3,size:[2,1.8,1],boxes:[post(-.85,0,1.8,.1),post(.85,0,1.8,.1)],anchors:{cloth:[0,1.55,0],use:[0,1.1,.6]}},
});
export const DELIGHT_KEYS=Object.freeze(Object.keys(DELIGHTS));
export function rotateXZ(x,z,rotation){for(let i=0;i<rotation;i++)[x,z]=[z,-x];return [x,z];}
export function propPoint(p,point){const [x,z]=rotateXZ(point[0],point[2],p.rotation);return {x:p.gx*2+x,y:p.baseY+point[1],z:p.gz*2+z};}
export function propAnchor(p,name){return propPoint(p,DELIGHTS[p.kind].anchors[name]??[0,0,0]);}
function worldBox(p,b){const corners=[[b.minX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.minZ],[b.maxX,b.maxZ]].map(([x,z])=>rotateXZ(x,z,p.rotation));return {minX:p.gx*2+Math.min(...corners.map(c=>c[0])),maxX:p.gx*2+Math.max(...corners.map(c=>c[0])),minZ:p.gz*2+Math.min(...corners.map(c=>c[1])),maxZ:p.gz*2+Math.max(...corners.map(c=>c[1])),minY:p.baseY+b.minY,maxY:p.baseY+b.maxY};}
export function propBoxes(p,{reserve=false,envelope=false,liftY=p.liftY??0}={}){
 const spec=DELIGHTS[p.kind];if(!spec)return [];
 if(reserve)return [worldBox(p,box(-.98,.98,0,spec.size[1],-.98,.98))];
 if(envelope)return [worldBox(p,box(-spec.size[0]/2,spec.size[0]/2,0,spec.size[1],-spec.size[2]/2,spec.size[2]/2))];
 const parts=[...spec.boxes];if(p.kind==='lift')parts.push({...spec.platform,minY:spec.platform.minY+liftY,maxY:spec.platform.maxY+liftY});return parts.map(b=>worldBox(p,b));
}
export const boxesOverlap=(a,b,margin=0)=>a.minX<b.maxX-margin&&a.maxX>b.minX+margin&&a.minZ<b.maxZ-margin&&a.maxZ>b.minZ+margin&&a.minY<b.maxY-margin&&a.maxY>b.minY+margin;
export function naturalPropBase(kind,gx,gz){
 return buildBase(gx,gz);
}
export function propSupport(s,kind,gx,gz,hostId=null){
 if(hostId!==null){const floor=s.buildings.find(b=>b.id===hostId&&b.kind==='floor'&&b.gx===gx&&b.gz===gz);return floor&&kind!=='lift'?baseOf(floor)+floor.level*2.4+.15:null;}
 return naturalPropBase(kind,gx,gz);
}
const result=(ok,code,params={},extra={})=>({ok,code,params,...extra});
const no=code=>result(false,code);
function blockedNatural(s,p){
 if(p.hostId!==null)return false;
 const footprint=cellFootprint(p.gx,p.gz);
 return activeDiscoveries(s).some(d=>overlaps(footprint,d.bounds))||nearbyResources(s,(footprint.minX+footprint.maxX)/2,(footprint.minZ+footprint.maxZ)/2,5).some(r=>overlaps(footprint,wildFootprint(r)))||localSolidBounds((footprint.minX+footprint.maxX)/2,(footprint.minZ+footprint.maxZ)/2,5).some(o=>overlaps(footprint,o))||WORLD_OBSTACLES.some(o=>!s.worldHidden?.includes(o.id)&&overlaps(footprint,o));
}
export function validateDelight(s,p,{legacy=false}={}){
 const spec=Object.hasOwn(DELIGHTS,p?.kind)?DELIGHTS[p.kind]:null;if(!spec||!Number.isInteger(p.gx)||!Number.isInteger(p.gz)||!Number.isInteger(p.rotation)||p.rotation<0||p.rotation>3||!Number.isFinite(p.baseY)||!inWorld(p.gx*2-1,p.gz*2-1)||!inWorld(p.gx*2+1,p.gz*2+1))return no('message.invalidToy');
 if((s.delights?.length??0)>=80)return no('message.toyLimit');
 if(propSupport(s,p.kind,p.gx,p.gz,p.hostId??null)!==p.baseY)return no('message.toySupport');
 if(p.kind==='birdhouse'&&p.baseY<TERRAIN.waterY)return no('message.birdDry');
 // A shelter needs actual shallow seabed, independent of authored place names.
 if(p.kind==='crabShelter'&&!(p.hostId==null&&p.baseY<TERRAIN.waterY&&p.baseY>=TERRAIN.waterY-3))return no('message.crabShore');
 if(!legacy&&blockedNatural(s,{...p,hostId:p.hostId??null}))return no('message.clearWild');
 if(p.hostId==null&&s.plots?.[`${p.gx},${p.gz}`])return no('message.clearGround');
 const volume=propBoxes(p,{reserve:true});
 if((s.delights??[]).some(other=>volume.some(a=>propBoxes(other,{reserve:true}).some(b=>boxesOverlap(a,b)))))return no('message.occupied');
 for(const b of s.buildings){if(b.id===p.hostId)continue;if(propBoxes(p,{envelope:true}).some(a=>buildingBoxes(b).some(c=>boxesOverlap(a,c,.001))))return no('message.toyClearance');}
 if(s.inventory[spec.material]<spec.cost)return result(false,'message.needMaterial',{count:spec.cost,material:spec.material});
 return result(true,'message.place');
}
export function placeDelight(s,p){const check=validateDelight(s,p);if(!check.ok)return check;const spec=DELIGHTS[p.kind];s.delights??=[];const id=Math.max(s.nextDelightId??1,Math.max(0,...s.delights.map(x=>x.id))+1);s.nextDelightId=id+1;const prop={id,kind:p.kind,gx:p.gx,gz:p.gz,rotation:p.rotation,baseY:p.baseY,hostId:p.hostId??null,cost:spec.cost,visited:false,liftY:0,on:true};s.inventory[spec.material]-=spec.cost;s.delights.push(prop);s.stats.built++;return result(true,'message.toyPlaced',{noun:'prop.'+p.kind,count:spec.cost,material:spec.material},{prop});}
export function validateRemoveDelight(s,id,{occupied=false}={}){const p=s.delights?.find(p=>p.id===id);if(!p)return no('message.aimPiece');if(p.kind==='lift'&&p.liftY>.02&&occupied)return no('message.lowerLift');return result(true,'message.refunded',{count:p.cost,material:DELIGHTS[p.kind].material});}
export function removeDelight(s,id,options={}){const check=validateRemoveDelight(s,id,options);if(!check.ok)return check;const p=s.delights.find(p=>p.id===id);s.delights=s.delights.filter(p=>p.id!==id);s.inventory[DELIGHTS[p.kind].material]+=p.cost;return check;}
export function readDelights(raw,s){
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>80)throw Error('Invalid toys');const seen=new Set(),out=[];
 for(const p of raw){const spec=Object.hasOwn(DELIGHTS,p?.kind)?DELIGHTS[p.kind]:null;if(!spec||!Number.isSafeInteger(p.id)||p.id<1||seen.has(p.id)||p.cost!==spec.cost||!(p.hostId===null||Number.isSafeInteger(p.hostId)&&p.hostId>0)||typeof p.visited!=='boolean'||typeof p.on!=='boolean'||!Number.isFinite(p.liftY)||p.liftY<0||p.liftY>2.4||p.kind!=='lift'&&p.liftY!==0)throw Error('Invalid toy accounting');
  const next={id:p.id,kind:p.kind,gx:p.gx,gz:p.gz,rotation:p.rotation,baseY:p.baseY,hostId:p.hostId,cost:p.cost,visited:p.visited,liftY:p.liftY,on:p.on};
  const funded={...s,delights:out,inventory:{wood:1e6,copper:1e6,iron:1e6,diamond:1e6,fiber:1e6}};if(!validateDelight(funded,next,{legacy:true}).ok)throw Error('Invalid toy placement');seen.add(p.id);out.push(next);
 }return out;
}
export function connectedWheel(gutter,props){
 if(gutter.kind!=='gutter')return null;const out=propAnchor(gutter,'outlet');
 return props.filter(p=>p.kind==='waterWheel'&&p.rotation===gutter.rotation).sort((a,b)=>a.id-b.id).find(p=>{const into=propAnchor(p,'inlet'),[dx,dz]=rotateXZ(2,0,gutter.rotation);return p.gx*2===gutter.gx*2+dx&&p.gz*2===gutter.gz*2+dz&&Math.hypot(out.x-into.x,out.z-into.z)<=.25&&Math.abs(out.y-into.y)<=.1;})??null;
}
export function nearestProp(p,props,kind,distance){return props.filter(q=>q.kind===kind&&q.id!==p.id&&Math.abs(q.baseY-p.baseY)<1.5&&Math.hypot(q.gx-p.gx,q.gz-p.gz)*2<=distance).sort((a,b)=>Math.hypot(a.gx-p.gx,a.gz-p.gz)-Math.hypot(b.gx-p.gx,b.gz-p.gz)||a.id-b.id)[0]??null;}
export function liftRiders(p,bodies){const slab=propBoxes(p).at(-1);return bodies.filter(b=>Math.abs(b.feet-slab.maxY)<=.08&&touches(slab,b.x,b.z,.05));}
// Both slab faces and supported bodies sweep together; no nearest-platform teleport.
export function stepLift(p,target,dt,bodies,obstacles){
 const desired=Math.max(0,Math.min(2.4,target)),delta=Math.sign(desired-p.liftY)*Math.min(Math.abs(desired-p.liftY),DELIGHTS.lift.speed*Math.min(.1,Math.max(0,dt))),riders=liftRiders(p,bodies);
 if(!delta)return {delta:0,riders:riders.map(b=>b.id),blocked:false};
 const steps=Math.max(1,Math.ceil(Math.abs(delta)/.05));let allowed=0;
 for(let i=1;i<=steps;i++){const d=delta*i/steps,slab=propBoxes(p,{liftY:p.liftY+d}).at(-1);let blocked=obstacles.some(o=>boxesOverlap(slab,o,.001));
  for(const b of bodies){const carried=riders.includes(b),body=box(b.x-(b.radius??.24),b.x+(b.radius??.24),b.feet+(carried?d:0)+.02,b.feet+(carried?d:0)+(b.height??1.65),b.z-(b.radius??.24),b.z+(b.radius??.24));if(carried){if(obstacles.some(o=>boxesOverlap(body,o,.001)))blocked=true;}else if(boxesOverlap(body,slab,.001))blocked=true;}
  if(blocked)return {delta:allowed,riders:riders.map(b=>b.id),blocked:true};allowed=d;
 }return {delta:allowed,riders:riders.map(b=>b.id),blocked:false};
}
export function propFloor(props,x,z,feet,floor){for(const p of props??[])if(p.kind==='lift'){const slab=propBoxes(p).at(-1);if(touches(slab,x,z,.05)&&slab.maxY<=feet+.31)floor=Math.max(floor,slab.maxY);}return floor;}
