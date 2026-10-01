import * as THREE from 'three';
import {createTree,createBuildPiece,createTool,createResident} from '../src/visuals.js';
import {createAnimal} from '../src/garden-visuals.js';
import {createMarineAnimal} from '../src/marine-visuals.js';
import {createDelight} from '../src/delight-visuals.js';
import {DELIGHT_KEYS} from '../src/delights.js';
import {SEEDS,PIECES,MATERIALS} from '../src/state.js';
// Offline only: preserved original catalogue camera, lighting, framing and key set.
export function renderCatalogue(renderer){
 const size=160,target=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
 const oldTarget=renderer.getRenderTarget(),oldClear=renderer.getClearColor(new THREE.Color()),oldAlpha=renderer.getClearAlpha(),oldShadow=renderer.shadowMap.enabled;
 const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
 scene.add(new THREE.HemisphereLight('#f7fbf0','#6c8173',2.2));const sun=new THREE.DirectionalLight('#fff3de',2.4);sun.position.set(-4,7,5);scene.add(sun);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),pixels=new Uint8Array(size*size*4),img=ctx.createImageData(size,size),pictures={};
 const models=[...DELIGHT_KEYS.map(k=>['prop:'+k,()=>createDelight(k)]),...['butterfly','bird','deer','bee','grub'].map(k=>['animal:'+k,()=>createAnimal(k)]),...['crab','turtle','octopus','starfish','anemone','whale'].map(k=>['animal:'+k,()=>createMarineAnimal(k)]),...[0,1].map(v=>['animal:fish:'+v,()=>createMarineAnimal('fish',v)]),...Array.from({length:4},(_,v)=>Array.from({length:4},(_,o)=>[`diver:${v}:${o}`,()=>createResident(v,o,true)])).flat(),...Array.from({length:4},(_,v)=>Array.from({length:4},(_,o)=>[`resident:${v}:${o}`,()=>createResident(v,o)])).flat(),...Object.keys(SEEDS).map(k=>[`seed:${k}`,()=>createTree(k)]),...Object.keys(PIECES).flatMap(k=>MATERIALS.map(m=>[`piece:${k}:${m}`,()=>createBuildPiece(k,m)])),...['shovel','seed','fill','hose','axe','build','remove'].map(k=>[`tool:${k}`,()=>createTool(k)])];
 try{
  renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor('#000000',0);
  for(const [key,make] of models){
   const model=make(),bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3());
   model.position.sub(center);scene.add(model);
   // Thin floors/roofs project wider than their axis-aligned longest side. One
   // padded world-space frame across ALL materials preserves comparison scale.
   const r=/^piece:(floor|roof):/.test(key)?1.7:Math.max(extent.y,extent.x,extent.z)*(key==='prop:cornerChannel'?.80:.69);camera.left=-r;camera.right=r;camera.top=r;camera.bottom=-r;camera.position.set(key==='tool:hose'?-5:5,3.2,6);camera.lookAt(0,0,0);camera.updateProjectionMatrix();
   renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,pixels);
   for(let y=0;y<size;y++)img.data.set(pixels.subarray((size-1-y)*size*4,(size-y)*size*4),y*size*4);
   ctx.putImageData(img,0,0);pictures[key]=canvas.toDataURL('image/png');scene.remove(model);model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.dispose();});
   // Tree geometries are factory-cached. Keep shared resources alive.
  }
 }finally{
  renderer.setRenderTarget(oldTarget);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);renderer.setClearColor(oldClear,oldAlpha);renderer.shadowMap.enabled=oldShadow;target.dispose();
 }
 return pictures;
}
