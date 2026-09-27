// Shared physical terrain. Asset factories sample these heights; saves store bases.
export const TERRAIN=Object.freeze({waterY:-1.8,minX:-26.65,maxX:26.65,minZ:-26.65,maxZ:112,shoreStart:27,shoreEnd:39,oceanFloor:-7.2,deepStart:70,deepEnd:86,deepFloor:-14,pads:[{minGX:-6,maxGX:6,minGZ:22,maxGZ:29,baseY:-7.2}],reef:{x:0,z:60}});
export const inWorld=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&x>=TERRAIN.minX&&x<=TERRAIN.maxX&&z>=TERRAIN.minZ&&z<=TERRAIN.maxZ;
export function terrainHeight(x,z){const t=Math.max(0,Math.min(1,(z-TERRAIN.shoreStart)/(TERRAIN.shoreEnd-TERRAIN.shoreStart)));const deep=Math.max(0,Math.min(1,(z-TERRAIN.deepStart)/(TERRAIN.deepEnd-TERRAIN.deepStart)));return (t===0?0:TERRAIN.oceanFloor*t*t*(3-2*t))+(TERRAIN.deepFloor-TERRAIN.oceanFloor)*deep*deep*(3-2*deep);}
export function buildBase(gx,gz){
 if(!Number.isInteger(gx)||!Number.isInteger(gz))return null;
 if(Math.abs(gx)<=13&&Math.abs(gz)<=13)return 0;
 return TERRAIN.pads.find(p=>gx>=p.minGX&&gx<=p.maxGX&&gz>=p.minGZ&&gz<=p.maxGZ)?.baseY??null;
}
export const isUnderwaterHome=baseY=>baseY+2.4<TERRAIN.waterY;
