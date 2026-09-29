import {chunkAt,sampleCell} from './surface-grid.js';
import {describeChunk,resourceById} from './world-layout.js';
// Stable identities are save data. Never renumber resources when adding scenery.
export const PLACES = [
 {id:'grove',x:-20,z:8,name:'Willow grove',icon:'wood'},
 {id:'minerals',x:20,z:-12,name:'Crystal garden',icon:'diamond'},
 {id:'windmill',x:-18,z:-20,name:'Windmill garden',icon:'fiber'},
];
export const WORLD_OBSTACLES = [{id:'windmill',minX:-20,maxX:-16,minZ:-22,maxZ:-18,height:8}];
const pockets = {
 grove:[[-11,3,'willow'],[-12,6,'birch'],[-9,7,'oak'],[-12,9,'pine'],[-8,10,'birch'],[-11,1,'oak'],[-10,5,'flowers'],[-8,5,'flowers']],
 minerals:[[10,-8,'copper'],[12,-6,'iron'],[10,-4,'diamond'],[12,-10,'diamond'],[9,-11,'copper'],[12,-2,'iron'],[9,-6,'flowers']],
 windmill:[[-12,-11,'birch'],[-11,-7,'oak'],[-7,-12,'pine'],[-12,-4,'willow'],[-7,-8,'flowers'],[-9,-7,'flowers'],[-11,-12,'flowers']],
 shore:[[-5,12,'willow'],[5,12,'oak'],[9,11,'birch'],[12,8,'pine'],[11,3,'oak'],[8,5,'flowers'],[2,-12,'pine'],[5,-12,'birch']],
};
export const WILD_RESOURCES=Object.entries(pockets).flatMap(([place,entries])=>entries.map(([gx,gz,kind],i)=>({id:`${place}-${i+1}`,gx,gz,kind,scale:kind==='flowers'?.95:.88+(i%3)*.08,yaw:i*1.7,place,baseY:sampleCell(gx,gz).height})));
export const wildFootprint=r=>({minX:r.gx*2-.65,maxX:r.gx*2+.65,minZ:r.gz*2-.65,maxZ:r.gz*2+.65});
export const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
export const cellFootprint=(gx,gz,margin=0)=>({minX:gx*2-1-margin,maxX:gx*2+1+margin,minZ:gz*2-1-margin,maxZ:gz*2+1+margin});

// Bounded numeric descriptors also supply collision/identity before meshes load.
const descriptors=new Map();
export function worldChunk(cx,cz){
 const key=`${cx},${cz}`;let value=descriptors.get(key);
 if(value)descriptors.delete(key);else value=describeChunk(cx,cz);
 descriptors.set(key,value);while(descriptors.size>128)descriptors.delete(descriptors.keys().next().value);
 return value;
}
export function nearbyChunks(x,z,radius=2){
 const result=[];for(let cx=chunkAt(x-radius,z).cx;cx<=chunkAt(x+radius,z).cx;cx++)for(let cz=chunkAt(x,z-radius).cz;cz<=chunkAt(x,z+radius).cz;cz++)result.push(worldChunk(cx,cz));return result;
}
export const resourceRecord=id=>WILD_RESOURCES.find(r=>r.id===id)??resourceById(id);
export const descriptorCount=()=>descriptors.size;
export function resourceSuppressed(s,r){
 if(!r.id.startsWith('w1:'))return false;
 const intersects=p=>Math.abs(p.gx-r.gx)<=1.5&&Math.abs(p.gz-r.gz)<=1.5;
 return Object.values(s.plots).some(intersects)||s.buildings.some(intersects)||(s.delights??[]).some(intersects);
}
export function nearbyResources(s,x,z,radius=34){
 return [...WILD_RESOURCES,...nearbyChunks(x,z,radius).flatMap(c=>c.resources)].filter(r=>!s.wildRemoved?.includes(r.id)&&!resourceSuppressed(s,r)&&(!r.id.startsWith('w1:')||Math.hypot(r.gx*2-x,r.gz*2-z)<=radius));
}
export function localSolidBounds(x,z,radius=2){return nearbyChunks(x,z,radius).flatMap(c=>c.solids).map(s=>{
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(let i=0;i<s.vertices.length;i+=3){minX=Math.min(minX,s.vertices[i]);maxX=Math.max(maxX,s.vertices[i]);minZ=Math.min(minZ,s.vertices[i+2]);maxZ=Math.max(maxZ,s.vertices[i+2]);}return {...s,minX,maxX,minZ,maxZ};
});}
