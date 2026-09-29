import {Mesh,PlaneGeometry} from 'three';
import {sampleCell} from './surface-grid.js';

const holeBottom=new PlaneGeometry(2,2).rotateX(-Math.PI/2);

// The visible soil and exposed inner walls are the plot's action surfaces too.
// Using these same triangles avoids an invisible proxy extending beyond the hole.
export function plotSurfaces(plot,plots,{wallGeometry,wallMaterial,soilGeometry,soilMaterial}){
 const {gx,gz,baseY}=plot,key=`${gx},${gz}`,surfaces=[];
 if(plot.phase==='hole')for(const [dx,dz,turn] of [[0,1,0],[0,-1,0],[1,0,1],[-1,0,1]]){
  const neighbour=sampleCell(gx+dx,gz+dz),open=plots[`${gx+dx},${gz+dz}`]?.phase==='hole';
  const bottom=baseY-.6,top=Math.min(baseY,neighbour.height-(open?.6:0)),height=top-bottom;
  if(height<1e-6)continue;
  const wall=new Mesh(wallGeometry,wallMaterial);
  wall.position.set(gx*2+dx,(top+bottom)/2,gz*2+dz);wall.scale.y=height/.6;wall.rotation.y=turn*Math.PI/2;
  surfaces.push(wall);
 }
 if(plot.phase==='hole'){const bottom=new Mesh(holeBottom,soilMaterial);bottom.userData.soil=true;bottom.position.set(gx*2,baseY-.6,gz*2);surfaces.push(bottom);}
 if(plot.phase!=='hole'){const soil=new Mesh(soilGeometry,soilMaterial);
 soil.userData.soil=true;soil.position.set(gx*2,baseY+.012,gz*2);surfaces.push(soil);}
 for(const mesh of surfaces){mesh.receiveShadow=true;mesh.userData.plot=key;mesh.updateMatrixWorld(true);}
 return surfaces;
}
