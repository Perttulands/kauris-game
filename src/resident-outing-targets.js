import {surfaceAt} from './surface-grid.js';
import {plantVolume} from './cultivation.js';
// Destinations are suggestions only: resident runtime checks both complete routes.
export function residentOutingTargets(state,resident,{canStand,surface=(x,z)=>surfaceAt(state,x,z)}){
 const d=resident.door,home={x:d.x-d.nx*.95-d.nz*.28,z:d.z-d.nz*.95+d.nx*.28},plants=[],shores=[];
 const distance=p=>Math.hypot(p.x-home.x,p.z-home.z);
 const safe=p=>distance(p)<9&&canStand(p.x,p.z,resident.baseY??0);
 for(const p of Object.values(state.plots)){
  if(!p.seed||p.phase!=='filled'||p.growth<.3||Math.hypot(p.gx*2-home.x,p.gz*2-home.z)>10)continue;
  const v=plantVolume(p),offset=Math.max(1.1,v?(v.maxX-v.minX)/2+.55:0);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const point={id:'plant:'+p.gx+','+p.gz+':'+dx+','+dz,kind:'plant',x:p.gx*2+dx*offset,z:p.gz*2+dz*offset,lookAt:{x:p.gx*2,z:p.gz*2}};
   if(safe(point))plants.push(point);
  }
 }
 const gx=Math.round(home.x/2),gz=Math.round(home.z/2);
 for(let x=gx-4;x<=gx+4;x++)for(let z=gz-4;z<=gz+4;z++){
  const point={id:'shore:'+x+','+z,kind:'shore',x:x*2,z:z*2},here=surface(point.x,point.z);
  if((resident.habitat==='ocean')!==(here.waterY!==null)||!safe(point))continue;
  const edge=[[2,0],[-2,0],[0,2],[0,-2]].map(([dx,dz])=>({x:point.x+dx,z:point.z+dz})).find(p=>(surface(p.x,p.z).waterY!==null)!==(here.waterY!==null));
  if(edge)shores.push({...point,lookAt:resident.habitat==='ocean'?{x:point.x+(point.x-edge.x),z:point.z+(point.z-edge.z)}:edge});
 }
 plants.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));shores.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));
 return [...plants.slice(0,4),...shores.slice(0,4),...plants.slice(4),...shores.slice(4)].slice(0,8);
}
