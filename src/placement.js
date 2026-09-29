import {adjacentCells,wallLike,placementTransform,baseOf,elevation,starterFloorPlane} from './building.js';
// Choose the aimed support plane before validation. Never search for an affordable
// or unoccupied substitute after the preview has established the intended piece.
export function assistedPlacement(choice,target,hit,buildings){
 const {levelExplicit,...selection}=choice;let level=choice.level;
 if(hit&&levelExplicit===false)level=hit.level+(wallLike(hit)&&['floor','roof'].includes(choice.kind)?1:choice.kind==='roof'&&hit.kind==='floor'?1:0);
 choice={...selection,level};
 let {gx,gz}=target,baseY=target.baseY??0;const point=target.point;
 if(hit){
  baseY=baseOf(hit);
  if(hit.kind==='floor'&&choice.kind==='floor'&&choice.level===hit.level){
   const dx=point.x-hit.gx*2,dz=point.z-hit.gz*2;
   if(Math.max(Math.abs(dx),Math.abs(dz))>.55){gx=hit.gx+(Math.abs(dx)>Math.abs(dz)?Math.sign(dx):0);gz=hit.gz+(Math.abs(dx)>Math.abs(dz)?0:Math.sign(dz));}
  }
  if(wallLike(hit)&&['roof','floor'].includes(choice.kind)){
   const cells=adjacentCells(hit).filter(c=>buildings.some(b=>b.kind==='floor'&&elevation(b)===elevation(hit)&&b.gx===c.gx&&b.gz===c.gz));
   if(cells.length){cells.sort((a,b)=>Math.hypot(point.x-a.gx*2,point.z-a.gz*2)-Math.hypot(point.x-b.gx*2,point.z-b.gz*2)||a.gx-b.gx||a.gz-b.gz);({gx,gz}=cells[0]);}
  }
 }else if(choice.kind==='floor'&&choice.level===0){
  // Aiming beside an existing deck edge deliberately continues that plane.
  const nearby=buildings.filter(b=>b.kind==='floor'&&Math.abs(b.gx-gx)+Math.abs(b.gz-gz)===1)
   .map(b=>({b,d:Math.hypot(point.x-(gx+b.gx),point.z-(gz+b.gz))})).filter(q=>q.d<=.45).sort((a,b)=>a.d-b.d||a.b.id-b.b.id);
  if(nearby.length)baseY=elevation(nearby[0].b);
  else baseY=Math.max(baseY,starterFloorPlane(gx,gz));
 }
 return {...choice,...placementTransform({...choice,gx,gz},point),baseY};
}
