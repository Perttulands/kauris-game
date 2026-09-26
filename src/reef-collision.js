import {Vector3} from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';

// Compile each hard rock or small shell cell from the same world vertices rendered.
// Separate convex shell cells preserve the hollow arch; never hull the whole vault.
export function convexSolid(vertices){
 const points=[],seen=new Set(),bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity,minZ:Infinity,maxZ:-Infinity};
 for(let i=0;i<vertices.length;i+=3){
  const [x,y,z]=vertices.slice(i,i+3),key=`${x},${y},${z}`;
  if(![x,y,z].every(Number.isFinite))throw new TypeError('Non-finite reef geometry');
  if(seen.has(key))continue;seen.add(key);points.push(new Vector3(x,y,z));
  bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);
 }
 const hull=new ConvexHull().setFromPoints(points);
 if(!hull.faces.length)throw new TypeError('Reef solids require a closed volume');
 const planes=hull.faces.map(f=>({x:f.normal.x,y:f.normal.y,z:f.normal.z,d:f.constant,horizontal:Math.hypot(f.normal.x,f.normal.z)}));
 return {...bounds,planes};
}

// Vertical interval of the hull expanded by the actor's horizontal radius.
// Radius zero is the exact visible surface; broad bounds only accelerate rejection.
export function solidInterval(s,x,z,radius=0){
 if(x<s.minX-radius||x>s.maxX+radius||z<s.minZ-radius||z>s.maxZ+radius)return null;
 let minY=s.minY,maxY=s.maxY;
 for(const p of s.planes){
  const remaining=p.d-p.x*x-p.z*z+radius*p.horizontal;
  if(Math.abs(p.y)<1e-9){if(remaining<0)return null;}
  else if(p.y>0)maxY=Math.min(maxY,remaining/p.y);
  else minY=Math.max(minY,remaining/p.y);
  if(minY>maxY+1e-7)return null;
 }
 return {minY,maxY};
}
export function reefBlocked(solids,x,z,feet,{radius=.24,height=1.65,step=.31}={}){
 return solids.some(s=>{const a=solidInterval(s,x,z,radius);return a&&a.maxY>feet+step&&a.minY<feet+height;});
}
export function reefFloor(solids,x,z,feet,floor){
 for(const s of solids){const a=solidInterval(s,x,z);if(a&&a.maxY<=feet+.31)floor=Math.max(floor,a.maxY);}
 return floor;
}
export function reefCeiling(solids,x,z,feet,ceiling=Infinity){
 for(const s of solids){const a=solidInterval(s,x,z,.24);if(a&&a.minY>=feet+1.60)ceiling=Math.min(ceiling,a.minY);}
 return ceiling;
}
// Older saves could stop inside previously passable reef art. Lift only those
// actors onto the overlapping hard surface, without moving houses or inventories.
export function reefSafeFeet(solids,x,z,feet){
 const intervals=solids.map(s=>solidInterval(s,x,z,.24)).filter(Boolean).sort((a,b)=>a.minY-b.minY);
 for(const a of intervals)if(a.minY<feet+1.65&&a.maxY>feet+.01)feet=a.maxY;
 return feet;
}
