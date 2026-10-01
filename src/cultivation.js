import {sampleCell} from './surface-grid.js';
const sea={kelp:{radius:.65,height:1.8},coralPlant:{radius:.65,height:1.1},pearlPlant:{radius:.6,height:.9}};
export function plantVolume(p,{reserve=false}={}){
 if(!p?.seed)return null;
 const aquatic=sea[p.seed],flower=p.seed==='flowers'||p.seed==='starflower';
 if(!reserve&&(p.growth<=.3||flower))return null;
 const radius=aquatic?.radius??(reserve?(flower?.9:3.5):.2*p.growth),height=aquatic?.height??(flower?1.2:8);
 return {minX:p.gx*2-radius,maxX:p.gx*2+radius,minZ:p.gz*2-radius,maxZ:p.gz*2+radius,minY:p.baseY,maxY:p.baseY+height,planes:[]};
}
export function submergedPlantSolids(s,x,z){
 const boxes=[];
 for(const p of Object.values(s.plots)){
  if(sampleCell(p.gx,p.gz).waterY===null||Math.abs(p.gx*2-x)>=9||Math.abs(p.gz*2-z)>=9)continue;
  if(p.phase==='hole')boxes.push({minX:p.gx*2-1,maxX:p.gx*2+1,minZ:p.gz*2-1,maxZ:p.gz*2+1,minY:p.baseY-.6,maxY:p.baseY+.5,planes:[]});
  if(p.seed)boxes.push(plantVolume(p,{reserve:true}));
 }
 return boxes;
}
