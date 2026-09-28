import {Mesh} from 'three';

// The visible soil and exposed inner walls are the plot's action surfaces too.
// Using these same triangles avoids an invisible proxy extending beyond the hole.
export function plotSurfaces(plot,plots,{wallGeometry,wallMaterial,soilGeometry,soilMaterial}){
 const {gx,gz}=plot,key=`${gx},${gz}`,surfaces=[];
 if(plot.phase==='hole')for(const [dx,dz,turn] of [[0,1,0],[0,-1,0],[1,0,1],[-1,0,1]]){
  if(plots[`${gx+dx},${gz+dz}`]?.phase==='hole')continue;
  const wall=new Mesh(wallGeometry,wallMaterial);
  wall.position.set(gx*2+dx,-.3,gz*2+dz);wall.rotation.y=turn*Math.PI/2;
  surfaces.push(wall);
 }
 const soil=new Mesh(soilGeometry,soilMaterial);
 soil.position.set(gx*2,plot.phase==='hole'?-.59:.012,gz*2);surfaces.push(soil);
 for(const mesh of surfaces){mesh.receiveShadow=true;mesh.userData.plot=key;}
 return surfaces;
}
