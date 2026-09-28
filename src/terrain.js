import {sampleWorld,buildSiteAt} from './world-layout.js';
// Shared physical terrain. Asset factories sample these heights; saves store bases.
export const TERRAIN=Object.freeze({waterY:-1.8,minX:-26.65,maxX:26.65,minZ:-26.65,maxZ:112,shoreStart:27,shoreEnd:39,oceanFloor:-7.2,deepStart:70,deepEnd:86,deepFloor:-14,pads:[{minGX:-6,maxGX:6,minGZ:22,maxGZ:29,baseY:-7.2}],reef:{x:0,z:60}});
export const inWorld=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=999700&&Math.abs(z)<=999700;
export const terrainHeight=(x,z)=>sampleWorld(x,z).height;
export function buildBase(gx,gz){
 if(!Number.isInteger(gx)||!Number.isInteger(gz))return null;
 if(Math.abs(gx)<=13&&Math.abs(gz)<=13)return 0;
 return TERRAIN.pads.find(p=>gx>=p.minGX&&gx<=p.maxGX&&gz>=p.minGZ&&gz<=p.maxGZ)?.baseY??buildSiteAt(gx,gz)?.baseY??null;
}
export const isUnderwaterHome=baseY=>baseY+2.4<TERRAIN.waterY;
