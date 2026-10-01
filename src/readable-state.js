import {plotMoisture} from './state.js';
import {houseReadiness} from './residents.js';
import {elevation,edgeKey,wallLike} from './building.js';
export function plotStage(p){return p?.phase==='filled'&&p.seed?(p.growth>=1?'harvest':plotMoisture(p)>0?'wet':'dry'):null;}
export function houseNeed(buildings,gx,gz,baseY=0){
 const h=houseReadiness(buildings,gx,gz,baseY);if(!h||h.complete)return null;
 const cells=new Set(h.cells),walls=new Map(buildings.filter(b=>wallLike(b)&&elevation(b)===baseY).map(b=>[edgeKey(b),b]));
 const edges=[];for(const key of h.cells){const [x,z]=key.split(',').map(Number);[[0,-1],[-1,0],[0,1],[1,0]].forEach(([dx,dz],rotation)=>{if(!cells.has(`${x+dx},${z+dz}`))edges.push({gx:x,gz:z,rotation,kind:'wall',level:0,baseY});});}
 const empty=edges.find(e=>!walls.has(edgeKey(e)));
 const shape=(b,kind,replace=false)=>({id:`${gx},${gz}:${baseY}:${kind}`,kind,x:b.gx*2,y:baseY+(kind==='roof'?2.4:0),z:b.gz*2,rotation:b.rotation??0,replace});
 if(empty)return shape(empty,h.doors.length?'wall':'door');
 if(!h.doors.length){const edge=edges.find(e=>walls.has(edgeKey(e)));if(edge)return shape(walls.get(edgeKey(edge)),'door',true);}
 const roof=h.cells.find(key=>!buildings.some(b=>['roof','floor'].includes(b.kind)&&elevation(b)===elevation({baseY,level:1})&&`${b.gx},${b.gz}`===key));if(roof){const [x,z]=roof.split(',').map(Number);return shape({gx:x,gz:z},'roof');}return null;
}
