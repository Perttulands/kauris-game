// A placement may replace the space under the player's feet with a real support.
// Queries are pure: payment and position change only after the caller revalidates.
export function standingPlacement({body,volumes,supports=[],solids=[],bodies=[]}){
 const r=body.radius??.24,h=body.height??1.65;
 const overlap=(a,lo,hi)=>body.x+r>a.minX+.001&&body.x-r<a.maxX-.001&&body.z+r>a.minZ+.001&&body.z-r<a.maxZ-.001&&a.maxY>lo+.001&&a.minY<hi-.001;
 if(!volumes.some(a=>overlap(a,body.feet,body.feet+h)))return {ok:true,landingFeet:null};
 const tops=supports.filter(a=>body.x-r>=a.minX-.001&&body.x+r<=a.maxX+.001&&body.z-r>=a.minZ-.001&&body.z+r<=a.maxZ+.001&&a.maxY>body.feet+.001&&a.minY<body.feet+h).map(a=>a.maxY).sort((a,b)=>a-b);
 for(const top of tops){
  if(volumes.some(a=>overlap(a,top,top+h)))continue;
  if(solids.some(a=>overlap(a,body.feet+.02,top+h)))continue;
  if(bodies.some(b=>overlap({minX:b.x-(b.radius??.24),maxX:b.x+(b.radius??.24),minZ:b.z-(b.radius??.24),maxZ:b.z+(b.radius??.24),minY:b.feet,maxY:b.feet+(b.height??1.65)},body.feet+.02,top+h)))continue;
  return {ok:true,landingFeet:top};
 }
 return {ok:false,code:'message.stepAside'};
}
