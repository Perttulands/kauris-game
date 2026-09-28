import {Group} from 'three';
import {createWorldChunk} from './world-visuals.js';
import {sampleWorld} from './world-layout.js';
import {worldChunk,nearbyChunks,descriptorCount} from './world-data.js';
import {convexSolid} from './reef-collision.js';
import {adjacentCells} from './building.js';

// Paid state wins before a descriptor is handed to either renderer or collision.
export function occupiedCells(state){return [...Object.values(state.plots),...state.buildings.flatMap(adjacentCells),...state.delights];}
export function clearDescriptor(descriptor,cells){
 const solids=descriptor.solids.filter(s=>!cells.some(p=>{let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<s.vertices.length;i+=3){minX=Math.min(minX,s.vertices[i]);maxX=Math.max(maxX,s.vertices[i]);minZ=Math.min(minZ,s.vertices[i+2]);maxZ=Math.max(maxZ,s.vertices[i+2]);}return p.gx*2+1.5>=minX&&p.gx*2-1.5<=maxX&&p.gz*2+1.5>=minZ&&p.gz*2-1.5<=maxZ;}));
 return solids.length===descriptor.solids.length?descriptor:{...descriptor,solids};
}
export function createWorldRuntime(state){
 const group=new Group(),cache=new Map(),hulls=new Map(),jobs=new Map(),active=new Set(),dirty=new Set();let cells=[],cellKeys=new Map(),version=0,centre='',lastJobs=[],updateTimes=[],overheadTimes=[],generationMs=0,peakBytes=0,clock=0;
 group.name='continuous-world';
 const key=(cx,cz)=>`${cx},${cz}`;
 function localCells(cx,cz){return cells.filter(p=>p.gx*2>=cx*32-3&&p.gx*2<cx*32+35&&p.gz*2>=cz*32-3&&p.gz*2<cz*32+35);}
 function remove(k){dirty.delete(k);const entry=cache.get(k);if(!entry)return;group.remove(entry.mesh.group);entry.mesh.dispose();cache.delete(k);version++;}
 function queue(cx,cz,detail,priority=0){const k=key(cx,cz),old=cache.get(k);if(old?.detail===detail&&!dirty.has(k))return;jobs.set(k,{cx,cz,detail,priority:old?.detail&&!detail?-2:priority});}
 function build(job){const started=performance.now(),{cx,cz,detail}=job,k=key(cx,cz),local=localCells(cx,cz),descriptor=clearDescriptor(worldChunk(cx,cz),local),holes=local.filter(p=>state.plots[`${p.gx},${p.gz}`]?.phase==='hole');
  const mesh=createWorldChunk(descriptor,{sampleWorld,excludedCells:local,holes,detail});let bytes=0,triangles=0;
  mesh.group.traverse(o=>{if(o.isMesh){for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;bytes+=o.geometry.index?.array.byteLength??0;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  remove(k);dirty.delete(k);mesh.group.visible=active.has(k);group.add(mesh.group);cache.set(k,{mesh,detail,cx,cz,last:clock,bytes,triangles});version++;const duration=performance.now()-started;generationMs+=duration;lastJobs.push(duration);if(lastJobs.length>180)lastJobs.shift();
 }
 function sync(){
  const next=occupiedCells(state),keys=new Map(next.map(p=>[`${p.gx},${p.gz}`,state.plots[`${p.gx},${p.gz}`]?.phase??'occupied'])),changed=[];
  for(const [k,v] of keys)if(cellKeys.get(k)!==v)changed.push(k);for(const k of cellKeys.keys())if(!keys.has(k))changed.push(k);
  cells=next;cellKeys=keys;
  for(const cell of changed){const [gx,gz]=cell.split(',').map(Number);for(const d of nearbyChunks(gx*2,gz*2,3)){const k=d.id.slice(3).replace(':',',');hulls.delete(k);dirty.add(k);const entry=cache.get(k);if(entry){const pending=jobs.get(k);jobs.set(k,{cx:entry.cx,cz:entry.cz,detail:pending?.detail??entry.detail,priority:pending?.priority===-2?-2:-1});}}}
 }
 function update(x,z){const updateStart=performance.now(),generationStart=generationMs;clock++;const cx=Math.floor(x/32),cz=Math.floor(z/32),at=key(cx,cz);
  if(at!==centre){centre=at;active.clear();jobs.clear();for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){const nx=cx+dx,nz=cz+dz,k=key(nx,nz),detail=Math.abs(dx)<=2&&Math.abs(dz)<=2;active.add(k);queue(nx,nz,detail,Math.hypot(dx,dz)+(detail?0:1));const e=cache.get(k);if(e)e.last=clock;}
   for(const [k,e] of cache)e.mesh.group.visible=active.has(k);
  }
  // Tiny near-ground fallback precedes detail work, including a new loaded save.
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const nx=cx+dx,nz=cz+dz,k=key(nx,nz);if(!cache.has(k)){build({cx:nx,cz:nz,detail:false});queue(nx,nz,true,Math.hypot(dx,dz));}}
  // One complete queued build per frame. Its timing includes numeric generation,
  // occupancy masks, geometry and disposal, rather than a pre-call budget guess.
  const next=[...jobs].sort((a,b)=>a[1].priority-b[1].priority)[0];if(next){jobs.delete(next[0]);build(next[1]);}
  while(cache.size>100){const candidates=[...cache].filter(([k])=>!active.has(k)).sort((a,b)=>a[1].last-b[1].last);if(!candidates.length)break;remove(candidates[0][0]);}
  peakBytes=Math.max(peakBytes,[...cache.values()].reduce((sum,e)=>sum+e.bytes,0));const duration=performance.now()-updateStart;updateTimes.push(duration);overheadTimes.push(Math.max(0,duration-(generationMs-generationStart)));if(updateTimes.length>180){updateTimes.shift();overheadTimes.shift();}
 }
 function solidsAt(x,z){return nearbyChunks(x,z,3).flatMap(d=>{const k=d.id.slice(3).replace(':',',');let result=hulls.get(k);if(result){hulls.delete(k);hulls.set(k,result);return result;}result=clearDescriptor(d,cells).solids.map(s=>({...convexSolid(s.vertices),id:s.id}));hulls.set(k,result);while(hulls.size>128)hulls.delete(hulls.keys().next().value);return result;});}
 function roots(){return [...cache].filter(([k])=>active.has(k)).map(([,e])=>e.mesh.group);}
 function groundMeshes(){return [...cache].filter(([k])=>active.has(k)).flatMap(([,e])=>e.mesh.groundMeshes);}
 function snapshot(){return {version,active:active.size,detail:[...cache].filter(([k,e])=>active.has(k)&&e.detail).length,cache:cache.size,descriptors:descriptorCount(),hulls:hulls.size,queued:jobs.size,bytes:[...cache.values()].reduce((n,e)=>n+e.bytes,0),peakBytes,triangles:[...cache].filter(([k])=>active.has(k)).reduce((n,[,e])=>n+e.triangles,0),jobMs:lastJobs.slice(),updateMs:updateTimes.slice(),overheadMs:overheadTimes.slice()};}
 sync();return {group,sync,update,solidsAt,roots,groundMeshes,snapshot,get version(){return version;}};
}
