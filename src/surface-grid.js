// The only terrain authority: 2m cells, .3m terraces and a fixed waterline.
// Presentation chunks contain 16 cells and start at cell edges, including negatives.
export const GRID=Object.freeze({size:2,step:.3,chunkCells:16,chunkSize:32,waterY:-1.8,seed:731947});
export const cellAt=(x,z)=>({gx:Math.floor((x+1)/2),gz:Math.floor((z+1)/2)});
export const chunkAt=(x,z)=>({cx:Math.floor((x+1)/32),cz:Math.floor((z+1)/32)});
export const chunkBounds=(cx,cz)=>({minX:cx*32-1,maxX:(cx+1)*32-1,minZ:cz*32-1,maxZ:(cz+1)*32-1});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ellipse=(x,z,cx,cz,rx,rz)=>(1-Math.hypot((x-cx)/rx,(z-cz)/rz))*Math.min(rx,rz);
export function landDistance(x,z){
 const near=Math.max(ellipse(x,z,0,-55,95,85),ellipse(x,z,-77,62,23,20),ellipse(x,z,69,94,28,23));
 // Gentle distant archipelagos continue in every direction; no perimeter wall.
 const far=24*(Math.sin(x/95)+Math.cos(z/110)) + 9*Math.sin((x+z)/65);
 const blend=clamp((Math.hypot(x,z)-170)/100,0,1);
 return near*(1-blend)+far*blend;
}
export function regionAt(x,z){
 if(z>28)return x< -35?'seagrass-sound':'reef';
 if(x< -40)return 'reed-cove';if(x>40)return 'amber-bay';if(z< -40)return 'birch-downs';return 'orchard';
}
// Broad climbable grove edges frame the north approach, with an open central
// lawn. Compact lobes vanish outside their natural footprint; they never change
// permissions or reserve ground. The steepest raw rise is <.15m per metre, so
// adjacent 2m cells remain at most one .3m terrace apart after quantization.
const inlandRises=Object.freeze([
 Object.freeze({x:-22,z:-104,rx:24,rz:30,height:2.1}),
 Object.freeze({x:28,z:-91,rx:24,rz:32,height:2.1}),
 Object.freeze({x:2,z:-119,rx:28,rz:24,height:1.8}),
]);
function groveRise(x,z){
 let height=0;
 for(const r of inlandRises){const t=Math.max(0,1-((x-r.x)/r.rx)**2-((z-r.z)/r.rz)**2);height=Math.max(height,r.height*t*t);}
 // A broad, walkable eastern shoulder supports the grove backdrop.
 // Max-norm ramps keep each cardinal 2m rise <=.3m, including corners.
 const shoulder=3.3*Math.max(0,1-Math.max(Math.abs(x-30)/24,Math.abs(z+96)/34));
 // A modest level garden pocket inside the grove; the enclosing shoulder
 // blends down by <=.28m per cell rather than ending in a concealed wall.
 const pocketDistance=Math.max(0,22-x,x-28,-92-z,z+84);
 return Math.min(Math.max(height,shoulder),2.1+.14*pocketDistance);
}
export function sampleCell(gx,gz){
 if(!Number.isSafeInteger(gx)||!Number.isSafeInteger(gz)||Math.abs(gx)>499999||Math.abs(gz)>499999)throw new RangeError('Invalid surface cell');
 const x=gx*2,z=gz*2,shoreDistance=landDistance(x,z);
 // Broad soil terraces remain level near arrival; every cell follows this rule.
 const rise=clamp((Math.hypot(x,z)-45)/60,0,1)*Math.max(0,Math.sin(x/48)*Math.cos(z/53))*1.2;
 // Continue the coastal ramp until it meets the inland rise. Switching at
 // distance12 used to create a .9m cliff beside otherwise walkable soil.
 const raw=Math.min(Math.max(rise,groveRise(x,z)),(shoreDistance-12)*.15);
 const height=Math.round(clamp(raw,-14.1,3.3)/.3)*3/10;
 const waterY=height<GRID.waterY?GRID.waterY:null;
 const substrate=shoreDistance<10?'sand':rise>.9?'rock':'soil';
 return {gx,gz,height,substrate,waterY,region:regionAt(x,z),shoreDistance};
}
export function surfaceAt(state,x,z){
 const {gx,gz}=cellAt(x,z),cell=sampleCell(gx,gz),plot=state?.plots?.[`${cell.gx},${cell.gz}`];
 return {...cell,floor:cell.height-(plot?.phase==='hole'?.6:0)};
}
