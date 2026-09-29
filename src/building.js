import {sampleCell,surfaceAt} from './surface-grid.js';
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
export const elevation=b=>Math.round((baseOf(b)+(b.level??0)*2.4)*1e6)/1e6;
export function edgeKey(b){const c=canonicalPiece({...b,kind:b.kind??'wall'});return `${c.rotation===0?'h':'v'}:${c.gx},${c.gz}:${elevation(c)}`;}
// A starter room's edge walls straddle the four neighbouring terrain cells.
// Lift its floor to clear those edges; ordinary support validation still bounds the legs.
export function starterFloorPlane(gx,gz){
 return Math.max(...[[0,0],[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dz])=>sampleCell(gx+dx,gz+dz).height));
}
export function foundationDepth(b,state={plots:{}}){
 if(b.kind!=='floor'||b.level!==0)return null;
 const ground=surfaceAt(state,b.gx*2,b.gz*2).floor,depth=elevation(b)-ground;
 return depth>=-.001&&depth<=2.400001?Math.round(Math.max(0,depth)*1e6)/1e6:null;
}
export function foundationBoxes(b,state){
 const depth=foundationDepth(b,state);if(depth===null||depth<.06)return [];
 return [-.78,.78].flatMap(x=>[-.78,.78].map(z=>({minX:b.gx*2+x-.09,maxX:b.gx*2+x+.09,minZ:b.gz*2+z-.09,maxZ:b.gz*2+z+.09,minY:elevation(b)-depth,maxY:elevation(b)-.05})));
}
// Only paths originating at real ground anchors may contribute support.
export function supportedPieces(buildings,state={plots:{}}){
 const floors=new Map(),walls=new Map(),slabs=new Map(),supported=new Set(),queue=[];
 const key=(gx,gz,y)=>`${gx},${gz}:${Math.round(y*1e6)/1e6}`;
 const index=(map,k,b)=>{if(!map.has(k))map.set(k,[]);map.get(k).push(b);};
 const admit=b=>{if(!supported.has(b)){supported.add(b);queue.push(b);}};
 for(const b of buildings){
  const y=elevation(b),k=key(b.gx,b.gz,y);
  if(b.kind==='floor')index(floors,k,b);
  if(b.kind==='floor'||b.kind==='roof')index(slabs,k,b);
  if(wallLike(b))for(const c of adjacentCells(b))index(walls,key(c.gx,c.gz,y),b);
  if(foundationDepth(b,state)!==null)admit(b);
 }
 for(let i=0;i<queue.length;i++){
  const b=queue[i],y=elevation(b);
  if(b.kind==='floor'){
   for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]])for(const next of floors.get(key(b.gx+dx,b.gz+dz,y))??[])admit(next);
   for(const next of walls.get(key(b.gx,b.gz,y))??[])admit(next);
  }else if(wallLike(b))for(const c of adjacentCells(b))for(const next of slabs.get(key(c.gx,c.gz,y+2.4))??[])admit(next);
 }
 return supported;
}
export function terrainClear(b){
 return buildingBoxes(b,{supports:false}).every(a=>{for(const x of [a.minX+.001,a.maxX-.001])for(const z of [a.minZ+.001,a.maxZ-.001]){const gx=Math.floor((x+1)/2),gz=Math.floor((z+1)/2);if(sampleCell(gx,gz).height>a.minY+.051)return false;}return true;});
}
export function buildingBoxes(b,{supports=true,state}={}){
 const base=elevation(b);
 let parts;
 if(b.kind==='floor')parts=[[-1,1,-1,1,base-.05,base+.15]];
 else if(b.kind==='roof')parts=[[-1,1,-1,1,base,base+.8]];
 else if(b.kind==='door')parts=[[-1,-.5,-1.1,-.9,base,base+2.4],[.5,1,-1.1,-.9,base,base+2.4],[-.5,.5,-1.1,-.9,base+2,base+2.4]];
 else parts=[[-1,1,-1.1,-.9,base,base+2.4]];
 const boxes=parts.map(([x0,x1,z0,z1,minY,maxY])=>{
  const corners=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]].map(([x,z])=>{for(let i=0;i<b.rotation;i++)[x,z]=[z,-x];return [x+b.gx*2,z+b.gz*2];});
  return {minX:Math.min(...corners.map(c=>c[0])),maxX:Math.max(...corners.map(c=>c[0])),minZ:Math.min(...corners.map(c=>c[1])),maxZ:Math.max(...corners.map(c=>c[1])),minY,maxY};
 });
 return supports?[...boxes,...foundationBoxes(b,state)]:boxes;
}
export const touches=(a,x,z,r=.24)=>x+r>a.minX&&x-r<a.maxX&&z+r>a.minZ&&z-r<a.maxZ;
export function piecesOverlap(a,b){
 const ay=elevation(a),by=elevation(b);
 // Intentional structural joints: floor edge to wall and wall top to next slab.
 if(wallLike(a)!==wallLike(b)){
  const wall=wallLike(a)?a:b,slab=wallLike(a)?b:a;
  if((slab.kind==='floor'&&elevation(wall)===elevation(slab))||Math.abs(elevation(wall)+2.4-elevation(slab))<.000001)return false;
 }
 if(wallLike(a)&&wallLike(b)&&ay===by)return edgeKey(a)===edgeKey(b);
 return buildingBoxes(a).some(x=>buildingBoxes(b).some(y=>x.minX<y.maxX-.001&&x.maxX>y.minX+.001&&x.minZ<y.maxZ-.001&&x.maxZ>y.minZ+.001&&x.minY<y.maxY-.001&&x.maxY>y.minY+.001));
}
export function placementClearance(b,{eye=null,bodies=[],solids=[]}={}){
 const boxes=buildingBoxes(b);
 if(eye&&Math.min(...boxes.map(a=>Math.hypot(eye.x-Math.max(a.minX,Math.min(a.maxX,eye.x)),eye.y-Math.max(a.minY,Math.min(a.maxY,eye.y)),eye.z-Math.max(a.minZ,Math.min(a.maxZ,eye.z)))))>6)return 'message.closer';
 if(bodies.some(body=>boxes.some(a=>touches(a,body.x,body.z,body.radius??.24)&&a.maxY>body.feet+(body.step??.02)&&a.minY<body.feet+(body.height??1.7))))return 'message.stepAside';
 if(boxes.some(a=>solids.some(r=>a.minX<r.maxX-.001&&a.maxX>r.minX+.001&&a.minZ<r.maxZ-.001&&a.maxZ>r.minZ+.001&&a.minY<r.maxY-.001&&a.maxY>r.minY+.001)))return 'message.terrainBlocked';
 return null;
}
