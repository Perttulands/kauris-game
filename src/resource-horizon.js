import {InstancedMesh,CylinderGeometry,LatheGeometry,Vector2,IcosahedronGeometry,MeshStandardMaterial,Object3D,Color} from 'three';
import {nearbyResources} from './world-data.js';
// Domain queries intentionally retain all old identities. Presentation is local.
export function fullResourceCandidates(state,x,z){
 const nearby=nearbyResources(state,x,z,32),distance=r=>Math.hypot(r.gx*2-x,r.gz*2-z);
 return [...nearby.filter(r=>!r.id.startsWith('w1:')&&distance(r)<=48),...nearby.filter(r=>r.id.startsWith('w1:')).sort((a,b)=>distance(a)-distance(b)).slice(0,24)];
}
export function nearCoverBounds(bounds,x,z,radius=40){
 const dx=Math.max(bounds.min.x-x,0,x-bounds.max.x),dz=Math.max(bounds.min.z-z,0,z-bounds.max.z);
 return dx*dx+dz*dz<=radius*radius;
}
// Distant silhouettes are the same live candidates. Close trees always use the
// authored rigs; no decorative resource is added to a paid clearing or save.
export function createResourceHorizon(scene){
 const bark=new MeshStandardMaterial({color:'#826b50',roughness:1}),leaf=new MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true});
 const capacity=48;
 const stems=new InstancedMesh(new CylinderGeometry(.13,.19,1,5),bark,capacity),crowns=new InstancedMesh(new IcosahedronGeometry(1,1),leaf,capacity),pines=new InstancedMesh(new LatheGeometry([[0,-1],[1,-.92],[.43,-.15],[.79,-.23],[.29,.42],[.53,.32],[0,1]].map(([r,y])=>new Vector2(r,y)),7),leaf,capacity),pose=new Object3D(),color=new Color();
 for(const m of [stems,crowns,pines]){m.count=0;m.castShadow=false;scene.add(m);}let ids=[];
 function update(state,x,z,fullIds){
  const items=nearbyResources(state,x,z,112).filter(r=>Math.hypot(r.gx*2-x,r.gz*2-z)<=112&&!fullIds.has(r.id)&&!['flowers','starflower'].includes(r.kind)).sort((a,b)=>Math.hypot(a.gx*2-x,a.gz*2-z)-Math.hypot(b.gx*2-x,b.gz*2-z)).slice(0,48);
  const planted=Object.entries(state.plots).filter(([,p])=>p.seed&&p.growth>=.25&&Math.hypot(p.gx*2-x,p.gz*2-z)>48&&Math.hypot(p.gx*2-x,p.gz*2-z)<=112&&!['flowers','starflower'].includes(p.seed)).map(([id,p])=>({id:'plot:'+id,gx:p.gx,gz:p.gz,kind:p.seed,baseY:0,yaw:0,scale:Math.max(.25,p.growth)}));
  items.push(...planted);items.sort((a,b)=>Math.hypot(a.gx*2-x,a.gz*2-z)-Math.hypot(b.gx*2-x,b.gz*2-z));items.length=Math.min(capacity,items.length);ids=items.map(r=>r.id);
  stems.count=items.length;let leafIndex=0,pineIndex=0;
  items.forEach((r,i)=>{const h=r.kind==='pine'?3.8:r.kind==='willow'?2.4:2.7;pose.position.set(r.gx*2,r.baseY+h*r.scale*.5,r.gz*2);pose.rotation.set(0,r.yaw,0);pose.scale.set(r.scale,h*r.scale,r.scale);pose.updateMatrix();stems.setMatrixAt(i,pose.matrix);pose.position.y=r.baseY+h*r.scale;pose.scale.set(1.25*r.scale,(r.kind==='pine'?2:1.3)*r.scale,1.15*r.scale);pose.updateMatrix();const canopy=r.kind==='pine'?pines:crowns,at=r.kind==='pine'?pineIndex++:leafIndex++;canopy.setMatrixAt(at,pose.matrix);color.set(({golden:'#d6b864',copper:'#b97b58',iron:'#91a5a1',diamond:'#74bcbf',pine:'#38735e',birch:'#91b75e',willow:'#83aa64'})[r.kind]??'#59965b');canopy.setColorAt(at,color);});
  crowns.count=leafIndex;pines.count=pineIndex;
  for(const m of [stems,crowns,pines]){m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();}
 }
 return {update,snapshot:()=>({count:ids.length,ids})};
}
