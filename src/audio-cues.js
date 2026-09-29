import {cellAt,sampleCell} from './surface-grid.js';
import {elevation} from './building.js';
// Geometry queries use the authoritative wet cell squares, never a scenic region field.
export function createWaterAudio(sample=sampleCell){
 let key='',wet=[];
 return (x,y,z)=>{
  const cell=cellAt(x,z),c=cell,next=c.gx+','+c.gz;
  if(next!==key){key=next;wet=[];for(let gx=c.gx-17;gx<=c.gx+17;gx++)for(let gz=c.gz-17;gz<=c.gz+17;gz++){const s=sample(gx,gz);if(s.waterY!==null)wet.push(s);}}
  let waterDistance=32,waterY=null;
  for(const c of wet){const dx=Math.max(0,Math.abs(x-c.gx*2)-1),dz=Math.max(0,Math.abs(z-c.gz*2)-1);waterDistance=Math.min(waterDistance,Math.hypot(dx,dz));if(c.gx===cell.gx&&c.gz===cell.gz)waterY=c.waterY;}
  return {waterDistance,submersion:waterY===null?0:Math.max(0,Math.min(1,(waterY+.2-y)/.4))};
 };
}
export function stepSurface(buildings,x,z,feet){
 const floor=buildings.find(b=>b.kind==='floor'&&Math.abs(elevation(b)+.15-feet)<.08&&Math.abs(x-b.gx*2)<1&&Math.abs(z-b.gz*2)<1);
 const {gx,gz}=cellAt(x,z);return floor?{material:floor.material,surface:floor.material==='wood'?'wood':floor.material==='fiber'?'soil':'rock'}:{surface:sampleCell(gx,gz).substrate};
}
export function createMovementAudio(play){
 let steps=0,strokes=0;
 return {
  reset(){steps=strokes=0;},
  update({distance,vertical=0,grounded,swimming,input,options}){
   if(swimming){steps=0;if(!input){strokes=0;return;}strokes+=Math.hypot(distance,vertical);if(strokes>=2.8){strokes=0;play('swim',options);}return;}
   strokes=0;if(!grounded){steps=0;return;}steps+=distance;
   if(steps>=2.4){steps=0;play('step',options);}
  }
 };
}
