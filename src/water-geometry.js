const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function bounds(a,b,side,up,kind,d){
 const points=[];
 for(const p of [a,b])for(const u of kind==='pipe'?[-d.radius,d.radius]:[-d.waterDepth-d.floorThickness,d.wallHeight])for(const w of kind==='pipe'?[-d.radius,d.radius]:[-d.width/2-d.wallThickness,d.width/2+d.wallThickness])
  points.push({x:p.x+side.x*w+up.x*u,y:p.y+side.y*w+up.y*u,z:p.z+side.z*w+up.z*u});
 return Object.fromEntries(['X','Y','Z'].flatMap(k=>[['min'+k,Math.min(...points.map(p=>p[k.toLowerCase()]))-.00001],['max'+k,Math.max(...points.map(p=>p[k.toLowerCase()]))+.00001]]));
}
export function waterGeometry({key,kind,from,to=null,port,path,nx=1,nz=0}){
 if(!['trough','pipe','spill'].includes(kind)||path.length<2||!path.every(finite))return null;
 const d={width:.26,wallThickness:.035,wallHeight:.10,waterDepth:.03,floorThickness:.04,radius:.10},side={x:-nz,y:0,z:nx},segments=[],boxes=[];
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(length<1e-7)continue;
  const along={x:(b.x-a.x)/length,y:(b.y-a.y)/length,z:(b.z-a.z)/length},up=cross(side,along);
  const segment={a,b,length,along,side,up,bounds:bounds(a,b,side,up,kind,d)};segments.push(segment);
  // Tight conservative pieces, so a long slope does not reserve its empty AABB.
  const n=Math.max(1,Math.ceil(length/.1));
  for(let j=0;j<n;j++){const point=t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});boxes.push(bounds(point(j/n),point((j+1)/n),side,up,kind,d));}
 }
 return {key,kind,from,to,port,path,segments,boxes:kind==='spill'?[]:boxes,...d};
}
export function waterJoinPlans(p,q,out,into){
 if(!finite(out)||!finite(into))return [];
 const common={key:p.id+':'+out.name,from:p.id,to:q.id,port:out.name,nx:out.nx,nz:out.nz};
 if(p.kind==='pump'){
  const path=into.y>out.y?[out,{x:out.x,y:into.y,z:out.z},into]:[out,into];
  return [waterGeometry({...common,kind:'pipe',path})].filter(Boolean);
 }
 if(into.y>out.y+1e-6)return [];
 const direct=waterGeometry({...common,kind:'trough',path:[out,into]});
 // A lipped chute can pass the upstream floor edge before descending.
 const lip={x:into.x-out.nx*.01,y:out.y,z:into.z-out.nz*.01};
 const chute=waterGeometry({...common,kind:'trough',path:[out,lip,{...lip,y:into.y},into]});
 return [direct,chute].filter(Boolean);
}
