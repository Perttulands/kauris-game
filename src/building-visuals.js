import * as THREE from 'three';
import {createBuildPiece} from './visuals.js';
import {foundationBoxes,elevation} from './building.js';
const geometry=new THREE.BoxGeometry(1,1,1);
const colors={wood:'#725039',copper:'#9b6348',iron:'#667982',diamond:'#80b9be',fiber:'#8d7953'};
const materials=Object.fromEntries(Object.entries(colors).map(([key,color])=>[key,new THREE.MeshStandardMaterial({color,roughness:.72,metalness:['iron','copper'].includes(key)?.5:0})]));
export function createPlacedPiece(b){
 const group=createBuildPiece(b.kind,b.material);updateFoundation(group,b);return group;
}
// Fixed four pooled legs; preview dimensions change without allocating geometry.
export function updateFoundation(group,b,{ghost=false}={}){
 const boxes=foundationBoxes(b);let legs=group.getObjectByName('foundation');if(!legs&&!boxes.length)return;
 if(!legs){legs=new THREE.Group();legs.name='foundation';for(let i=0;i<4;i++){const mesh=new THREE.Mesh(geometry,ghost?new THREE.MeshBasicMaterial({color:'#d8f5a5',transparent:true,opacity:.4,depthWrite:false}):materials[b.material]??materials.wood);mesh.raycast=function(raycaster,hits){if(legs.visible)THREE.Mesh.prototype.raycast.call(this,raycaster,hits);};mesh.castShadow=!ghost;mesh.receiveShadow=!ghost;legs.add(mesh);}group.add(legs);}
 legs.visible=boxes.length>0;
 boxes.forEach((box,i)=>{const leg=legs.children[i];leg.position.set((box.minX+box.maxX)/2-b.gx*2,(box.minY+box.maxY)/2-elevation(b),(box.minZ+box.maxZ)/2-b.gz*2);leg.scale.set(box.maxX-box.minX,box.maxY-box.minY,box.maxZ-box.minZ);});
}
