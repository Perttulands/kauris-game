import {InstancedMesh,MeshStandardMaterial,Object3D,Float32BufferAttribute} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createStagedTree} from './garden-visuals.js';
import {nearbyResources} from './world-data.js';

// Keep close actors through the caller's 8m bookkeeping boundaries. Interactable
// resources win over retained distant models; the bounded selection is not state.
const previousFull=new WeakMap();
export function fullResourceCandidates(state,x,z){
 const previous=previousFull.get(state)??new Set(),distance=r=>Math.hypot(r.gx*2-x,r.gz*2-z);
 const nearby=nearbyResources(state,x,z,40),legacy=nearby.filter(r=>!r.id.startsWith('w1:')&&distance(r)<=48);
 const outer=nearby.filter(r=>r.id.startsWith('w1:')&&distance(r)<=(previous.has(r.id)?40:32)).sort((a,b)=>{
  const da=distance(a),db=distance(b);return (da<=12?-100:previous.has(a.id)?-8:0)+da-((db<=12?-100:previous.has(b.id)?-8:0)+db)||a.id.localeCompare(b.id);
 }).slice(0,24);
 previousFull.set(state,new Set(outer.map(r=>r.id)));return [...legacy,...outer];
}
export function nearCoverBounds(bounds,x,z,radius=40){
 const dx=Math.max(bounds.min.x-x,0,x-bounds.max.x),dz=Math.max(bounds.min.z-z,0,z-bounds.max.z);
 return dx*dx+dz*dz<=radius*radius;
}

// Freeze the real mature species rig into one vertex-colour mesh. This preserves
// forked mineral boughs, willow curtains and spruce headroom in distant views.
// Templates are shared across worlds; no placeholder crown or new LOD manager.
const templates=new Map(),factoryTimes=new Map(),material=new MeshStandardMaterial({vertexColors:true,roughness:.9,flatShading:true});
function silhouette(kind){
 if(templates.has(kind))return templates.get(kind);
 const started=performance.now(),model=createStagedTree(kind,{variation:0}),parts=[];model.updateMatrixWorld(true);
 model.traverseVisible(o=>{if(!o.isMesh)return;
  const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
  g.morphAttributes={};g.deleteAttribute('uv');g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');
  const color=o.material.color,existing=g.attributes.color,paint=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<paint.length/3;i++){paint[i*3]=color.r*(existing?.getX(i)??1);paint[i*3+1]=color.g*(existing?.getY(i)??1);paint[i*3+2]=color.b*(existing?.getZ(i)??1);}
  g.setAttribute('color',new Float32BufferAttribute(paint,3));parts.push(g);
 });
 const geometry=mergeGeometries(parts,false);for(const g of parts)g.dispose();geometry.computeBoundingBox();geometry.computeBoundingSphere();templates.set(kind,geometry);factoryTimes.set(kind,performance.now()-started);return geometry;
}
export function createResourceHorizon(scene){
 const capacity=48,batches=new Map(),pose=new Object3D();let ids=[];
 function batch(kind){let mesh=batches.get(kind);if(!mesh){mesh=new InstancedMesh(silhouette(kind),material,capacity);mesh.name='resource-horizon:'+kind;mesh.count=0;mesh.castShadow=false;mesh.raycast=()=>{};scene.add(mesh);batches.set(kind,mesh);}return mesh;}
 function update(state,x,z,fullIds){
  const distance=r=>Math.hypot(r.gx*2-x,r.gz*2-z),flower=k=>k==='flowers'||k==='starflower';
  const items=nearbyResources(state,x,z,112).filter(r=>distance(r)<=112&&!fullIds.has(r.id)&&!flower(r.kind));
  for(const [id,p] of Object.entries(state.plots))if(p.seed&&p.growth>=.25&&distance(p)>48&&distance(p)<=112&&!flower(p.seed))items.push({id:'plot:'+id,gx:p.gx,gz:p.gz,kind:p.seed,baseY:p.baseY,yaw:0,scale:Math.max(.25,p.growth)});
  items.sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id));items.length=Math.min(capacity,items.length);ids=items.map(r=>r.id);
  for(const m of batches.values())m.count=0;
  for(const r of items){const m=batch(r.kind);pose.position.set(r.gx*2,r.baseY,r.gz*2);pose.rotation.set(0,r.yaw,0);pose.scale.setScalar(r.scale);pose.updateMatrix();m.setMatrixAt(m.count++,pose.matrix);}
  for(const m of batches.values()){m.visible=m.count>0;m.instanceMatrix.needsUpdate=true;if(m.count)m.computeBoundingSphere();}
 }
 return {update,snapshot:()=>({count:ids.length,ids,factoryMs:Object.fromEntries(factoryTimes),geometryBytes:[...batches.values()].reduce((n,m)=>n+Object.values(m.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0),0)})};
}
