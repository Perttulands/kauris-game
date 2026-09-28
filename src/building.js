// Saved anchors and facing are visual transforms; canonical copies identify physical edges.
export const wallLike=b=>['wall','window','door'].includes(b.kind);
export const baseOf=b=>b.baseY===undefined?0:b.baseY;
export const rotationCount=kind=>kind==='wall'?2:4;
export function placementTransform({kind,gx,gz,rotation},point){
 rotation=((rotation%rotationCount(kind))+rotationCount(kind))%rotationCount(kind);
 if(wallLike({kind})){
  const axis=rotation%2;
  if(axis===0&&point.z>gz*2)gz++;
  if(axis===1&&point.x>gx*2)gx++;
  // Choose the physical edge first, then retain the requested visible facing.
  if(rotation===2)gz--;
  else if(rotation===3)gx--;
 }
 return {gx,gz,rotation};
}
// Query-only projection: never use this copy to rewrite a paid/save transform.
export function canonicalPiece(b){
 const c={...b,baseY:baseOf(b)};
 if(wallLike(c)){if(c.rotation===2){c.gz++;c.rotation=0;}else if(c.rotation===3){c.gx++;c.rotation=1;}}
 return c;
}
export function adjacentCells(b){
 const c=canonicalPiece(b);
 return wallLike(c)?[{gx:c.gx,gz:c.gz},c.rotation===0?{gx:c.gx,gz:c.gz-1}:{gx:c.gx-1,gz:c.gz}]:[{gx:c.gx,gz:c.gz}];
}
export function edgeKey(b){const c=canonicalPiece({...b,kind:b.kind??'wall'});return `${c.rotation===0?'h':'v'}:${c.gx},${c.gz}:${baseOf(c)}:${c.level}`;}
export function buildingBoxes(b){
 const base=baseOf(b)+b.level*2.4;
 let parts;
 if(b.kind==='floor')parts=[[-1,1,-1,1,base-.05,base+.15]];
 else if(b.kind==='roof')parts=[[-1,1,-1,1,base,base+.8]];
 else if(b.kind==='door')parts=[[-1,-.5,-1.1,-.9,base,base+2.4],[.5,1,-1.1,-.9,base,base+2.4],[-.5,.5,-1.1,-.9,base+2,base+2.4]];
 else parts=[[-1,1,-1.1,-.9,base,base+2.4]];
 return parts.map(([x0,x1,z0,z1,minY,maxY])=>{
  const corners=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]].map(([x,z])=>{for(let i=0;i<b.rotation;i++)[x,z]=[z,-x];return [x+b.gx*2,z+b.gz*2];});
  return {minX:Math.min(...corners.map(c=>c[0])),maxX:Math.max(...corners.map(c=>c[0])),minZ:Math.min(...corners.map(c=>c[1])),maxZ:Math.max(...corners.map(c=>c[1])),minY,maxY};
 });
}
export const touches=(a,x,z,r=.24)=>x+r>a.minX&&x-r<a.maxX&&z+r>a.minZ&&z-r<a.maxZ;
