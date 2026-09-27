import {edgeKey,baseOf} from './building.js';
import {inWorld,isUnderwaterHome} from './terrain.js';
export {edgeKey} from './building.js';
const key=(x,z)=>`${x},${z}`;
const parse=k=>k.split(',').map(Number);
const directions=[[0,-1],[ -1,0],[0,1],[1,0]];
const wallKinds=['wall','window','door'];
function wallsOf(buildings){return new Map(buildings.filter(b=>b.level===0&&wallKinds.includes(b.kind)).map(b=>[edgeKey(b),b]));}
function edgeAt(gx,gz,rotation){return edgeKey({gx,gz,rotation,level:0});}
function components(cells,walls,partitions=true){
 const left=new Set(cells),result=[];
 while(left.size){const queue=[left.values().next().value],group=[];left.delete(queue[0]);
  for(let i=0;i<queue.length;i++){const k=queue[i];group.push(k);const [gx,gz]=parse(k);
   directions.forEach(([dx,dz],rotation)=>{const next=key(gx+dx,gz+dz),wall=walls.get(edgeAt(gx,gz,rotation));if(left.has(next)&&(!partitions||!wall||wall.kind==='door')){left.delete(next);queue.push(next);}});
  }result.push(group.sort());
 }return result;
}
function inspect(cells,walls,roofs){
 const set=new Set(cells),doors=[];let covered=0,total=0;
 for(const k of cells){const [gx,gz]=parse(k);directions.forEach(([nx,nz],rotation)=>{if(set.has(key(gx+nx,gz+nz)))return;total++;const w=walls.get(edgeAt(gx,gz,rotation));if(w){covered++;if(w.kind==='door')doors.push({gx,gz,x:gx*2+nx,z:gz*2+nz,nx,nz});}});}
 doors.sort((a,b)=>a.gx-b.gx||a.gz-b.gz||a.nx-b.nx||a.nz-b.nz);
 const roofCount=cells.filter(k=>roofs.has(k)).length;
 return {cells,anchor:cells[0],doors,covered,total,roofCount,complete:covered===total&&doors.length>0&&roofCount===cells.length};
}
function findPlaneHomes(buildings){
 const roofs=new Set(buildings.filter(b=>b.kind==='roof'&&b.level===1).map(b=>key(b.gx,b.gz))),walls=wallsOf(buildings);
 return components(roofs,walls).map(c=>inspect(c,walls,roofs)).filter(h=>h.complete);
}
export function findHomes(buildings){
 return [...new Set(buildings.map(baseOf))].flatMap(baseY=>findPlaneHomes(buildings.filter(b=>baseOf(b)===baseY).map(b=>({...b,baseY:0}))).map(h=>({...h,baseY,habitat:isUnderwaterHome(baseY)?'ocean':'land'})));
}
export function houseReadiness(buildings,gx,gz,baseY=0){
 buildings=buildings.filter(b=>baseOf(b)===baseY).map(b=>({...b,baseY:0}));
 const roofs=new Set(buildings.filter(b=>b.kind==='roof'&&b.level===1).map(b=>key(b.gx,b.gz))),floors=buildings.filter(b=>b.kind==='floor'&&b.level===0).map(b=>key(b.gx,b.gz)),walls=wallsOf(buildings);
 const complete=findHomes(buildings).find(h=>h.cells.includes(key(gx,gz)));if(complete)return complete;
 const group=components(new Set([...roofs,...floors]),walls,false).find(c=>c.includes(key(gx,gz)));
 return group?inspect(group,walls,roofs):null;
}
export function reconcileResidents(s){
 s.residents??=[];const homes=findHomes(s.buildings),claimed=new Set();let nextId=Math.max(0,...s.residents.map(r=>r.id))+1;
 // Existing identities claim compatible homes first, including waiting occupants.
 for(const r of [...s.residents].sort((a,b)=>a.id-b.id)){
  let match=-1,best=0;
  homes.forEach((h,i)=>{if(claimed.has(i)||h.baseY!==baseOf(r))return;const score=(h.cells.includes(r.anchor)?1000:0)+h.cells.filter(k=>r.cells.includes(k)).length;if(score>best){best=score;match=i;}});
  if(match<0){r.status='waiting';continue;}
  const h=homes[match];claimed.add(match);r.cells=h.cells;if(!h.cells.includes(r.anchor))r.anchor=h.anchor;r.door=h.doors[0];r.baseY=h.baseY;r.habitat=h.habitat;
  if(r.status==='waiting')r.status=r.arrived?'home':'arriving';
 }
 homes.forEach((h,i)=>{if(claimed.has(i))return;const id=nextId++;s.residents.push({id,baseY:h.baseY,habitat:h.habitat,variant:(id-1)%4,outfit:0,anchor:h.anchor,cells:h.cells,door:h.doors[0],x:null,z:null,status:'arriving',arrived:false,notified:false,routeStage:0,preference:['watch','rest','ride'][(id-1)%3],welcomeStage:0,gifts:false,rideId:null});});
 return homes;
}
export function readResidents(raw){
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>400)throw Error('Invalid residents');const ids=new Set();
 return raw.map(r=>{
  if(!r||!Number.isSafeInteger(r.id)||r.id<1||ids.has(r.id)||!Array.isArray(r.cells)||!r.cells.length||r.cells.length>400||r.cells.some(k=>typeof k!=='string'||!/^(-?\d+),(-?\d+)$/.test(k))||typeof r.anchor!=='string'||!r.cells.includes(r.anchor)||!['arriving','home','waiting'].includes(r.status)||!Number.isInteger(r.variant)||r.variant<0||r.variant>3||typeof r.arrived!=='boolean'||typeof r.notified!=='boolean'||!Number.isInteger(r.routeStage)||r.routeStage<0||r.routeStage>2||!((r.x===null&&r.z===null)||(Number.isFinite(r.x)&&Number.isFinite(r.z)&&inWorld(r.x,r.z))))throw Error('Invalid resident identity');
  if(![0,-7.2].includes(baseOf(r)))throw Error('Invalid resident elevation');
  if(r.outfit!==undefined&&(!Number.isInteger(r.outfit)||r.outfit<0||r.outfit>3))throw Error('Invalid resident outfit');
  if(r.preference!==undefined&&!['watch','rest','ride'].includes(r.preference)||r.welcomeStage!==undefined&&(!Number.isInteger(r.welcomeStage)||r.welcomeStage<0||r.welcomeStage>2)||r.gifts!==undefined&&typeof r.gifts!=='boolean')throw Error('Invalid resident habit');
  if(r.rideId!==undefined&&r.rideId!==null&&(!Number.isSafeInteger(r.rideId)||r.rideId<1))throw Error('Invalid resident lift');
  const d=r.door;if(!d||!['gx','gz','x','z','nx','nz'].every(k=>Number.isFinite(d[k]))||Math.abs(d.nx)+Math.abs(d.nz)!==1)throw Error('Invalid resident home');ids.add(r.id);
  return {id:r.id,baseY:baseOf(r),habitat:isUnderwaterHome(baseOf(r))?'ocean':'land',variant:r.variant,outfit:r.outfit??0,anchor:r.anchor,cells:[...new Set(r.cells)],door:{...d},x:r.x,z:r.z,status:r.status,arrived:r.arrived,notified:r.notified,routeStage:r.routeStage,preference:r.preference??['watch','rest','ride'][(r.id-1)%3],welcomeStage:r.welcomeStage??(r.arrived?2:0),gifts:r.gifts??false,rideId:r.rideId??null};
 });
}
