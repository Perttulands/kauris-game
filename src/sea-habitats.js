import {GRID,sampleCell,chunkAt} from './surface-grid.js';
const hash=(x,z,n)=>{let h=GRID.seed^Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(n+1,1274126177);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
export const SEA_LIMITS=Object.freeze({fish:16,crab:4,bird:4,entry:48,retire:64,schoolSize:4});
/** Stable content descriptors only: no actors, renderer, mutable seed or visits. */
export function seaHabitats(cx,cz){
 const result=[];
 for(const [slot,kind] of ['fish','crab'].entries()){
  for(let i=0;i<32;i++){
   const gx=cx*16+Math.floor(hash(cx,cz,slot*97+i*2)*16),gz=cz*16+Math.floor(hash(cx,cz,slot*97+i*2+1)*16),s=sampleCell(gx,gz),x=gx*2,z=gz*2;
   if(Math.abs(x)<26&&z>24&&z<70)continue; // Original inhabited reef owns this corridor.
   const depth=s.waterY===null?0:s.waterY-s.height;
   if(kind==='fish'?depth<1.2:depth<.3-1e-6||depth>3||s.substrate!=='sand')continue;
   result.push({id:`sea:${GRID.seed}:${cx}:${cz}:${slot}`,kind:'habitat-'+kind,x,y:s.height,z,yaw:hash(cx,cz,slot+201)*Math.PI*2,scale:1,variant:Math.floor(hash(cx,cz,slot+211)*3),school:kind==='fish'?4:1});break;
  }
 }
 return result;
}
export function habitatRegion(x,z){return chunkAt(x,z);}
