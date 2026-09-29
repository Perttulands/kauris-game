import {adjacentCells,wallLike,placementTransform,baseOf} from './building.js';
// Select geometry first, never search for a different affordable/valid placement.
// A roof aimed at a boundary belongs to the supported interior cell, even when
// the authored wall anchor faces the opposite direction.
export function assistedPlacement(choice,target,hit,buildings){
 let {gx,gz}=target;const point=target.point;
 if(hit&&wallLike(hit)&&['roof','floor'].includes(choice.kind)){
  const cells=adjacentCells(hit).filter(c=>buildings.some(b=>b.kind==='floor'&&b.level===choice.level-1&&baseOf(b)===baseOf(hit)&&b.gx===c.gx&&b.gz===c.gz));
  if(cells.length){cells.sort((a,b)=>Math.hypot(point.x-a.gx*2,point.z-a.gz*2)-Math.hypot(point.x-b.gx*2,point.z-b.gz*2)||a.gx-b.gx||a.gz-b.gz);({gx,gz}=cells[0]);}
 }
 // The existing exact edge projection is itself a forgiving two-metre grid
 // attachment. Keep raw sided rotation; do not canonicalize the paid transform.
 return {...choice,...placementTransform({...choice,gx,gz},point),baseY:target.baseY??0};
}
