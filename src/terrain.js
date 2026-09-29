import {GRID,sampleCell,cellAt} from './surface-grid.js';
export const TERRAIN=Object.freeze({waterY:GRID.waterY,minX:-999700,maxX:999700,minZ:-999700,maxZ:999700,shoreStart:27,shoreEnd:39,oceanFloor:-7.2,deepStart:70,deepEnd:86,deepFloor:-14.1,reef:{x:0,z:60}});
export const inWorld=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=999700&&Math.abs(z)<=999700;
export const terrainHeight=(x,z)=>{const {gx,gz}=cellAt(x,z);return sampleCell(gx,gz).height;};
export function buildBase(gx,gz){if(!Number.isSafeInteger(gx)||!Number.isSafeInteger(gz)||!inWorld(gx*2,gz*2))return null;return sampleCell(gx,gz).height;}
// Resident habitat follows the occupied slab top, not the roof. Ignore waterline contact.
export const isUnderwaterHome=baseY=>TERRAIN.waterY-(baseY+.15)>.02+1e-6;
