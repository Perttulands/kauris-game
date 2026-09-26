import {TERRAIN,terrainHeight} from './terrain.js';
export function swimmingAt(x,z,feet){return terrainHeight(x,z)<TERRAIN.waterY-.5&&feet<TERRAIN.waterY-.35;}
// Free swimming: buoyancy at the surface, stable depth below, no oxygen or damage.
export function verticalStep({x,z,feet,vy,dt,forward=0,pitch=0,rise=false,dive=false,floor,ceil=Infinity}){
 const swimming=swimmingAt(x,z,feet);let y=feet,v=vy;
 if(swimming){
  v=((rise?1:0)-(dive?1:0))*2.8+forward*Math.sin(pitch)*2.8;
  if(!v&&feet+1.7>TERRAIN.waterY-.35)v=(TERRAIN.waterY-1.45-feet)*3;
  y=feet+v*dt;if(v>0)y=Math.min(Math.max(feet,TERRAIN.waterY-1.45),y);
 }else{v-=16*dt;y+=v*dt;}
 if(y+1.65>ceil&&y>feet){y=Math.max(feet,ceil-1.65);v=0;}
 if(y<=floor){y=floor;v=0;}
 return {feet:y,vy:v,swimming};
}
