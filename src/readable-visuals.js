import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Presentation only. The caller owns semantic state, transforms, visibility and
// timeouts. These objects must not be included in action or reading ray roots.
export function createReadableWorld(){
 const group=new THREE.Group();group.name='readable-world';
 const geometries=new Set(),materials=new Set();
 const ownGeometry=g=>(geometries.add(g),g),ownMaterial=m=>(materials.add(m),m);
 const standard=(color,roughness=.85)=>ownMaterial(new THREE.MeshStandardMaterial({color,roughness}));
 const soilMaterials={dry:standard('#997756',1),wet:standard('#594435',.58)};
 const paint=ownMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83}));
 const valid=standard('#eff2ca'),invalid=standard('#e49b76'),damp=standard('#706553',.48),crack=standard('#574331');
 const ghost=ownMaterial(new THREE.MeshBasicMaterial({color:'#d3e4dd',transparent:true,opacity:.5,depthWrite:false}));
 const replace=ownMaterial(new THREE.MeshBasicMaterial({color:'#efbc87',transparent:true,opacity:.85,depthWrite:false}));
 const unit=ownGeometry(new THREE.BoxGeometry(1,1,1)),peg=ownGeometry(new THREE.CylinderGeometry(1,1,1,6));
 const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3();
 function mesh(geometry,material,parent=group){const m=new THREE.Mesh(geometry,material);parent.add(m);return m;}
 // Batched rods retain the same assembled timber vocabulary as paid pieces.
 function batch(parts){
  const pieces=[];
  for(const p of parts){
   const g=unit.toNonIndexed();g.deleteAttribute('uv');
   transform.position.set(...p.slice(0,3));transform.rotation.set(0,0,p[6]??0);transform.scale.set(...p.slice(3,6));transform.updateMatrix();g.applyMatrix4(transform.matrix);
   const color=new THREE.Color(p[7]??'#e7ce96'),rgb=new Float32Array(g.attributes.position.count*3);
   for(let i=0;i<rgb.length;i+=3){rgb[i]=color.r;rgb[i+1]=color.g;rgb[i+2]=color.b;}
   g.setAttribute('color',new THREE.BufferAttribute(rgb,3));pieces.push(g);
  }
  const result=ownGeometry(mergeGeometries(pieces,false));pieces.forEach(g=>g.dispose());return result;
 }
 function groundLines(lines,width=.025,y=.043){
  const parts=lines.map(([x,z,xx,zz])=>{
   const dx=xx-x,dz=zz-z,g=unit.toNonIndexed();g.deleteAttribute('uv');
   transform.position.set((x+xx)/2,y,(z+zz)/2);transform.rotation.set(0,-Math.atan2(dz,dx),0);transform.scale.set(Math.hypot(dx,dz),.009,width);transform.updateMatrix();g.applyMatrix4(transform.matrix);return g;
  });
  const result=ownGeometry(mergeGeometries(parts,false));parts.forEach(g=>g.dispose());return result;
 }
 const targetRoot=new THREE.Group();group.add(targetRoot);
 const dry=mesh(groundLines([[-.7,-.45,-.23,-.2],[-.23,-.2,-.4,.21],[-.4,.21,-.18,.64],[-.4,.21,-.73,.4],[.3,-.68,.48,-.23],[.48,-.23,.26,.23],[.26,.23,.59,.55],[.48,-.23,.77,-.15]]),crack,targetRoot);
 const wet=mesh(ownGeometry(new THREE.RingGeometry(.42,.48,18).rotateX(-Math.PI/2)),damp,targetRoot);wet.position.y=.041;wet.scale.set(1.35,1,.85);
 // Ripe plots receive four short marks on their soil, not a loose collectible.
 // The same ground attachment works for a tree trunk or a spread of flower stems.
 const harvest=mesh(groundLines([
  [-.86,-.58,-.86,-.86],[-.86,-.86,-.58,-.86],[.58,-.86,.86,-.86],[.86,-.86,.86,-.58],
  [.86,.58,.86,.86],[.86,.86,.58,.86],[-.58,.86,-.86,.86],[-.86,.86,-.86,.58]
 ],.055,.046),standard('#e4c786'),targetRoot);harvest.name='ripe-soil-marks';
 const placementRoot=new THREE.Group();group.add(placementRoot);
 const square=groundLines([[-.99,-.99,.99,-.99],[.99,-.99,.99,.99],[.99,.99,-.99,.99],[-.99,.99,-.99,-.99]],.04,.04);
 const edge=groundLines([[-.98,-1,.98,-1],[-.98,-1,-.98,-.7],[.98,-1,.98,-.7]],.05,.045);
 const contact=mesh(square,valid,placementRoot);
 const cross=mesh(groundLines([[-.33,-.33,.33,.33],[-.33,.33,.33,-.33]],.06,.055),invalid,placementRoot);
 const support=new THREE.InstancedMesh(peg,valid,4);support.instanceMatrix.setUsage(THREE.DynamicDrawUsage);support.frustumCulled=false;group.add(support);
 const bounds=new THREE.LineSegments(ownGeometry(new THREE.EdgesGeometry(unit)),ownMaterial(new THREE.LineBasicMaterial({color:'#e49b76'})));group.add(bounds);
 const houseRoot=new THREE.Group();group.add(houseRoot);
 const roofGeometry=batch([
  [-.5,.4,-1,Math.hypot(1,.8),.055,.055,Math.atan2(.8,1)],[.5,.4,-1,Math.hypot(1,.8),.055,.055,-Math.atan2(.8,1)],
  [-.5,.4,1,Math.hypot(1,.8),.055,.055,Math.atan2(.8,1)],[.5,.4,1,Math.hypot(1,.8),.055,.055,-Math.atan2(.8,1)],
  [0,.8,0,.055,.055,2],[-1,0,0,.055,.055,2],[1,0,0,.055,.055,2]
 ]);
 const wallGeometry=batch([[-.94,1.2,-1,.07,2.4,.07],[.94,1.2,-1,.07,2.4,.07],[0,2.36,-1,1.9,.07,.07],[0,.08,-1,1.9,.07,.07]]);
 const doorGeometry=batch([[-.55,1,-1,.08,2,.08],[.55,1,-1,.08,2,.08],[0,2,-1,1.18,.08,.08]]);
 const missing=mesh(roofGeometry,ghost,houseRoot);
 // On replacement the paid wall remains. A crossed frame marks deliberate
 // removal on either face; it is not a pretend open/valid doorway through it.
 const replacement=mesh(batch([
  [0,1.2,-1.14,1.3,.085,.025,Math.PI/4],[0,1.2,-1.14,1.3,.085,.025,-Math.PI/4],
  [0,1.2,-.86,1.3,.085,.025,Math.PI/4],[0,1.2,-.86,1.3,.085,.025,-Math.PI/4]
 ]),replace,houseRoot);
 const beacon=mesh(batch([
  [0,.46,0,.075,.92,.075,0,'#866347'],[0,.12,0,.19,.07,.17,0,'#b49365'],
  [-.24,1.01,0,.065,.39,.09,0,'#e2c794'],[.24,1.01,0,.065,.39,.09,0,'#e2c794'],[0,.83,0,.51,.055,.09,0,'#d4b37f'],
  [-.16,1.29,0,.42,.09,.18,Math.PI/5,'#6d968b'],[.16,1.29,0,.42,.09,.18,-Math.PI/5,'#6d968b'],
  [-.075,.94,0,.035,.22,.1,0,'#a47b53'],[.075,.94,0,.035,.22,.1,0,'#a47b53'],[0,1.05,0,.18,.035,.1,0,'#a47b53']
 ]),paint);
 function place(object,descriptor){object.position.set(descriptor.x,descriptor.y,descriptor.z);object.rotation.y=(descriptor.rotation??0)*Math.PI/2;}
 let disposed=false;
 function update({active=false,target=null,placement=null,houseNeed=null,home=null}={}){
  if(disposed)return;
  group.visible=!!active;
  targetRoot.visible=!!target;placementRoot.visible=!!placement;houseRoot.visible=!!houseNeed;beacon.visible=!!home;
  support.visible=!!placement?.supportSegments?.length;bounds.visible=!!placement?.invalidBounds&&!placement.ok;
  if(!active)return;
  if(target){place(targetRoot,target);dry.visible=target.kind==='dry';wet.visible=target.kind==='wet';harvest.visible=target.kind==='harvest';}
  if(placement){
   place(placementRoot,placement);contact.geometry=['wall','window','door'].includes(placement.kind)?edge:square;contact.material=placement.ok?valid:invalid;cross.visible=!placement.ok;
   const segments=placement.supportSegments??[];support.count=Math.min(4,segments.length);
   for(let i=0;i<support.count;i++){
    a.fromArray(segments[i].a);b.fromArray(segments[i].b);transform.position.copy(a).add(b).multiplyScalar(.5);b.sub(a);const length=b.length();
    transform.quaternion.setFromUnitVectors(up,length?b.multiplyScalar(1/length):up);transform.scale.set(.028,length,.028);transform.updateMatrix();support.setMatrixAt(i,transform.matrix);
   }
   if(support.count)support.instanceMatrix.needsUpdate=true;
   if(bounds.visible){const v=placement.invalidBounds;bounds.position.set((v.minX+v.maxX)/2,(v.minY+v.maxY)/2,(v.minZ+v.maxZ)/2);bounds.scale.set(v.maxX-v.minX,v.maxY-v.minY,v.maxZ-v.minZ);}
  }
  if(houseNeed){place(houseRoot,houseNeed);missing.geometry=houseNeed.kind==='roof'?roofGeometry:houseNeed.kind==='door'?doorGeometry:wallGeometry;missing.material=houseNeed.replace?replace:ghost;replacement.visible=!!houseNeed.replace;}
  if(home)place(beacon,home);
 }
 update();
 return {group,soilMaterials,update,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
