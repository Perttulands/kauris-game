import {createWaterToy,createWaterToyAddon,animateWaterToy} from './water-toy-visuals.js';
import {NEW_WATER_TOYS,WATER_PORTS} from './water-spec.js';
const waterAttachments=new WeakMap();
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {clone as cloneRig} from 'three/addons/utils/SkeletonUtils.js';
import {DELIGHTS} from './delights.js';

// Original authored village objects. Numeric structure/attachment coordinates
// come from the same immutable records used by placement and body support.
const C={wood:'#ae7951',woodLight:'#d4aa77',woodDark:'#76523d',cream:'#eddbaf',leaf:'#779d7d',copper:'#d29862',patina:'#7ba995',darkCopper:'#865c43',iron:'#607b89',ironLight:'#c0cfce',ironDark:'#3c5667',cloth:'#e5cd9d',stripe:'#789e93',rose:'#ca8b7d',crystal:'#a3ded4',crystalEdge:'#dfede0',water:'#a0decb'};
const paint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.66,metalness:.10,side:THREE.DoubleSide});
const wet=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.20,metalness:.15,side:THREE.DoubleSide});
const glowPaint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,emissive:'#99ccae',emissiveIntensity:.28,side:THREE.DoubleSide});
// Two immutable finishes keep each lamp's on/off appearance independent without
// moving the pickable core or allocating materials during animation.
const lampOffPaint=glowPaint.clone();lampOffPaint.emissiveIntensity=0;
const unit={box:new THREE.BoxGeometry(1,1,1),cyl:new THREE.CylinderGeometry(1,1,1,12),ball:new THREE.IcosahedronGeometry(1,1)};
const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),temp=new THREE.Vector3();
const templates=new Map(),rigs=new WeakMap(),TAU=Math.PI*2,clamp=THREE.MathUtils.clamp;
class Batch{
 constructor(material=paint){this.parts=[];this.material=material;}
 geometry(source,color,matrix){const g=source.index?source.toNonIndexed():source.clone();g.deleteAttribute('uv');if(matrix)g.applyMatrix4(matrix);const c=new THREE.Color(C[color]??color),rgb=new Float32Array(g.attributes.position.count*3);for(let i=0;i<rgb.length;i+=3){rgb[i]=c.r;rgb[i+1]=c.g;rgb[i+2]=c.b;}g.setAttribute('color',new THREE.BufferAttribute(rgb,3));this.parts.push(g);}
 add(shape,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);transform.scale.set(sx,sy,sz);transform.updateMatrix();this.geometry(unit[shape],color,transform.matrix);}
 beam(color,a,b,r=.025){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);transform.position.copy(p).add(q).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(up,q.clone().sub(p).normalize());transform.scale.set(r,p.distanceTo(q),r);transform.updateMatrix();this.geometry(unit.cyl,color,transform.matrix);}
 box(b,color){this.add('box',color,(b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.minZ+b.maxZ)/2,b.maxX-b.minX,b.maxY-b.minY,b.maxZ-b.minZ);}
 ring(color,r,tube,position,rx=0,ry=0){const g=new THREE.TorusGeometry(r,tube,5,20);g.rotateX(rx);g.rotateY(ry);g.translate(...position);this.geometry(g,color);g.dispose();}
 tube(color,points,r=.018){const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(8,points.length*3),r,6,false);this.geometry(g,color);g.dispose();}
 lathe(color,profile,position=[0,0,0],segments=16){const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments);g.translate(...position);this.geometry(g,color);g.dispose();}
 finish(name){const g=new THREE.Group();g.name=name;if(this.parts.length){const geometry=mergeGeometries(this.parts,false);this.parts.forEach(p=>p.dispose());const mesh=new THREE.Mesh(geometry,this.material);mesh.castShadow=this.material!==wet&&this.material!==glowPaint;mesh.receiveShadow=true;g.add(mesh);}return g;}
}
function anchor(group,name,position){const n=new THREE.Object3D();n.name='anchor:'+name;n.position.fromArray(position);group.add(n);return n;}
function child(root,b,name,position=[0,0,0]){const g=b.finish(name);g.position.fromArray(position);root.add(g);return g;}
function panelHole(b,color,w,h,r,cy,z,depth){const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,h);shape.lineTo(-w/2,h);shape.closePath();const hole=new THREE.Path();hole.absarc(0,cy,r,0,TAU,true);shape.holes.push(hole);const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});g.translate(0,0,z);b.geometry(g,color);g.dispose();}
function cloth(root,name,nu,nv,positionFn,colorFn,bonesSpec,weightsFn){
 const p=[],c=[],si=[],sw=[],indices=[],bones=[];
 for(const spec of bonesSpec){const bone=new THREE.Bone();bone.name=name+':'+spec.name;bone.position.fromArray(spec.position);if(spec.parent===undefined)root.add(bone);else{bone.position.sub(new THREE.Vector3(...bonesSpec[spec.parent].position));bones[spec.parent].add(bone);}bones.push(bone);}
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){const u=i/nu,v=j/nv,point=positionFn(u,v),color=new THREE.Color(C[colorFn(u,v)]??colorFn(u,v)),w=weightsFn(u,v);p.push(...point);c.push(color.r,color.g,color.b);si.push(w[0],w[1],0,0);sw.push(1-w[2],w[2],0,0);}
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i;if(name==='windsock')indices.push(a,a+1,a+nu+1,a+1,a+nu+2,a+nu+1);else indices.push(a,a+nu+1,a+1,a+1,a+nu+1,a+nu+2);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(c,3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.SkinnedMesh(geometry,paint);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
 // Full two-metre prop reservation covers every bounded cloth pose for culling.
 mesh.boundingBox=new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,1.8,1));mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.9,0),1.68);return bones;
}
function accessory(kind){
 const b=new Batch();
 if(kind==='bundle'){
  b.add('ball','cloth',0,.14,0,.155,.14,.145);b.add('box','stripe',0,.142,0,.05,.255,.27);b.add('box','rose',0,.15,0,.28,.032,.272);b.add('ball','cream',0,.295,0,.045,.024,.04);
 }else if(kind==='cushion'){
  b.add('ball','rose',0,.066,0,.225,.063,.175);for(let i=-2;i<=2;i++)b.add('box','cloth',i*.061,.117,0,.031,.006,.22);b.add('ball','stripe',0,.12,0,.065,.009,.055);
 }else if(kind==='flower'){
  b.lathe('wood',[[.058,0],[.071,.012],[.090,.13],[.096,.145],[.080,.145],[.072,.122]],[0,0,0],12);b.add('cyl','woodDark',0,.125,0,.071,.014,.071);b.beam('leaf',[0,.13,0],[.016,.285,0],.008);b.add('ball','leaf',-.037,.22,0,.040,.014,.023,0,0,.4);b.add('ball','leaf',.038,.235,0,.036,.014,.021,0,0,-.4);for(let i=0;i<5;i++){const a=i/5*TAU;b.add('ball','rose',.016+Math.cos(a)*.034,.30+Math.sin(a)*.034,.005,.024,.024,.014);}b.add('ball','cream',.016,.30,.02,.022,.022,.012);
 }else if(kind==='shell'){
  const g=new THREE.SphereGeometry(.085,12,6,0,Math.PI,0,Math.PI/2);g.scale(1,.45,1);b.geometry(g,'cream');g.dispose();for(let j=-3;j<=3;j++)b.beam('copper',[0,.013,-.002],[Math.sin(j*.20)*.075,.021,Math.cos(j*.20)*.073],.004);
 }
 const g=b.finish('delight-'+kind);g.userData.delightKind=kind;anchor(g,'bundle',[0,.15,0]);return g;
}
function authored(kind){
 if(!DELIGHTS[kind])return accessory(kind);
 const spec=DELIGHTS[kind],root=new THREE.Group(),b=new Batch();root.name='delight-'+kind;root.userData.delightKind=kind;
 // Every solid starts with the authoritative slab/post. Insets/detail below stay
 // inside it; soft moving surfaces and readable ornament are not extra barriers.
 const solidColor=spec.material==='wood'?'wood':spec.material==='copper'?'patina':spec.material==='iron'?'iron':spec.material==='diamond'?'crystal':'wood';
 if(kind!=='birdhouse'&&kind!=='lamp')spec.boxes.forEach((box,i)=>{if(kind==='crabShelter'){const shell={...box};if(i===0)shell.minX+=.014;if(i===1)shell.maxX-=.014;if(i===3)shell.maxY-=.027;b.box(shell,solidColor);}else if(kind!=='gutter'||i<2)b.box(box,solidColor);});
 if(kind==='birdhouse'){
  b.box(spec.boxes[0],'woodDark');b.add('box','woodLight',0,1.02,0,.52,.045,.52);
  // Honest little nesting aperture and dark interior behind a thick front wall.
  const front=new Batch();panelHole(front,'woodLight',.49,.41,.097,.235,.205,.045);child(root,front,'nest-front',[0,1.03,0]);
  b.add('box','wood',0,1.245,-.228,.49,.43,.045);for(const x of[-.23,.23])b.add('box','wood',x,1.245,0,.045,.43,.48);
  for(const side of[-1,1])b.add('box','leaf',side*.129,1.525,0,.32,.052,.55,0,0,-side*.52);
  b.beam('cream',[-.23,1.44,.235],[0,1.59,.235],.020);b.beam('cream',[0,1.59,.235],[.23,1.44,.235],.020);
  const perch=spec.anchors.perch;
  b.beam('woodDark',[0,perch[1],.19],perch,.022);
  // Brace the lower peg to the existing nest floor; a crossbar meets both feet
  // at their settled toe joints instead of balancing the bird on one centre peg.
  b.beam('woodDark',[0,1.02,.17],[0,perch[1],.25],.017);
  b.beam('woodLight',[-.095,perch[1]-.01,perch[2]-.033],[.095,perch[1]-.01,perch[2]-.033],.012);
  b.add('ball','copper',0,1.01,.251,.043,.028,.014);
 }else if(kind==='crabShelter'){
  // The full 1.64m cavity and front remain untouched; plank/barnacle detail sits
  // on the OUTER faces, never creates an unseen pinch point for the crab.
  for(const side of[-1,1])for(let j=0;j<5;j++)b.add('box',j%2?'woodLight':'wood',side*.933,.29,-.70+j*.34,.008,.54,.31);
  for(let j=0;j<8;j++)b.add('box',j%2?'woodLight':'wood',-.82+j*.235,.7665,0,.218,.027,1.73);
  for(const x of[-.88,.88]){b.add('box','woodDark',x,.38,.873,.118,.59,.012);b.add('ball','cream',x,.55,.870,.026,.026,.010);}
  b.add('box','cream',0,.715,.872,1.84,.044,.014);
  // Warm alternating boards, recessed seams and pale worn end grain stay inside
  // the same roof envelope; no new beam intrudes into the crab's entrance.
  for(let j=0;j<8;j++){const x=-.82+j*.235;b.add('box',j%3?'cream':'woodDark',x,.76,.865,.20,.015,.01);b.add('box','woodDark',x+.065,.7798,-.20+(j%3)*.22,.007,.0004,.40);}
  for(const side of[-1,1])for(let j=0;j<3;j++){
   const z=-.46+j*.44;b.tube('leaf',[[side*.931,.055,z],[side*.931,.19,z+.055],[side*.931,.33,z-.035],[side*.931,.46,z+.02]],.007);
   b.add('ball','leaf',side*.936,.245,z+.075,.004,.035,.083,.3,0,0);b.add('ball','leaf',side*.936,.35,z-.065,.004,.032,.065,-.3,0,0);
  }
  // A shallow scallop-shell badge sits on the lintel, outside the opening.
  b.add('ball','cream',0,.702,.873,.085,.045,.007);
  for(let j=-2;j<=2;j++)b.beam('copper',[0,.670,.877],[j*.029,.716+Math.abs(j)*.007,.877],.002);
  b.add('box','woodDark',0,.626,.874,1.80,.018,.012);
 }else if(kind==='gutter'){
  // Open receiver and trough share the conservative shell box. The trough
  // interior stays visible instead of hiding water under a solid top plate.
  const shell=spec.boxes[2];b.box({...shell,minZ:shell.minZ+.038,maxZ:shell.maxZ-.038,maxY:shell.minY+.045},'patina');for(const side of[-1,1])b.box({...shell,minZ:side<0?shell.minZ:shell.maxZ-.038,maxZ:side<0?shell.minZ+.038:shell.maxZ},'copper');
  b.lathe('copper',[[.11,.80],[.25,.94],[.27,1.055],[.235,1.055],[.22,.955],[.09,.83]],[0,0,0]);
  b.ring('cream',.251,.018,[0,1.055,0],Math.PI/2);
  for(const z of[-.18,.18])b.add('box','copper',.24,.80,z,1.28,.13,.038);
  b.add('box','darkCopper',.22,.736,0,1.34,.024,.36);
  b.tube('copper',[[-.36,.87,.02],[-.20,.84,.01],[.02,.78,0],[.88,.735,0]],.034);
  const water=new Batch(wet);water.add('box','water',.28,.754,0,1.22,.008,.25);water.add('ball','water',0,.95,0,.18,.013,.18);child(root,water,'water');
  const stream=new Batch(wet);stream.add('cyl','water',0,-.16,0,.027,.32,.027);child(root,stream,'pour-stream',spec.anchors.pour);
 }else if(kind==='waterWheel'){
  b.add('box','darkCopper',0,.222,0,1.68,.01,.72);b.add('box','copper',0,.232,.35,1.74,.022,.055);
  b.beam('cream',[-.38,.24,-.19],[0,.78,-.19],.037);b.beam('cream',[.38,.24,-.19],[0,.78,-.19],.037);
  b.tube('copper',[spec.anchors.inlet,[-.63,.72,0],[-.43,.79,0]],.05);
  const wheel=new Batch();for(const z of[-.135,.135]){wheel.ring('copper',.445,.029,[0,0,z]);wheel.ring('cream',.39,.012,[0,0,z]);}
  for(let i=0;i<8;i++){const a=i/8*TAU;wheel.beam('patina',[0,0,0],[Math.cos(a)*.43,Math.sin(a)*.43,0],.026);wheel.add('box','copper',Math.cos(a)*.444,Math.sin(a)*.444,0,.15,.058,.33,0,0,a);}
  wheel.add('cyl','cream',0,0,.02,.072,.43,.072,Math.PI/2);child(root,wheel,'rotor',spec.anchors.axle);
  const water=new Batch(wet);water.tube('water',[[-.83,.726,0],[-.63,.73,0],[-.45,.77,0],[-.34,.66,0]],.027);water.add('box','water',.27,.242,.09,.96,.009,.35);child(root,water,'water');
 }else if(kind==='bell'){
  b.beam('copper',[-.25,1.16,0],[.25,1.16,0],.039);
  const bell=new Batch();bell.lathe('copper',[[.015,.15],[.065,.14],[.11,.06],[.12,-.05],[.18,-.16],[.19,-.19],[.158,-.19],[.095,-.04],[.08,.06],[.015,.115]].reverse());bell.ring('cream',.176,.014,[0,-.174,0],Math.PI/2);bell.beam('darkCopper',[0,.16,0],[0,-.17,0],.011);bell.add('ball','cream',0,-.20,0,.035,.034,.035);const joint=child(root,bell,'bell-pivot',spec.anchors.bell);anchor(joint,'bell',[0,0,0]);
  b.beam('darkCopper',[0,1.17,0],[0,1.035,0],.021);
 }else if(kind==='lift'){
  const deck=new Batch();deck.box(spec.platform,'iron');for(let j=-3;j<=3;j++)deck.add('box','ironLight',j*.19,spec.platform.maxY+.001,0,.075,.002,1.35);const platform=child(root,deck,'platform');anchor(platform,'platform',spec.anchors.platform);
  for(const x of[-.92,.92])for(const z of[-.92,.92]){b.add('box','ironLight',x,1.5,z+.061,.032,2.9,.008);b.add('box','ironDark',x,.055,z,.16,.11,.16);b.add('box','ironLight',x,2.965,z,.15,.07,.15);}
  b.add('box','ironDark',-.92,1.03,.983,.13,.24,.014);b.add('ball','copper',-.92,1.03,.988,.043,.043,.010);
 }else if(kind==='lamp'){
  b.box(spec.boxes[0],'crystal');b.add('cyl','woodDark',0,.055,0,.20,.11,.20);
  // A lantern cage with a faceted core; no heavy opaque cube around the light.
  for(let i=0;i<6;i++){const a=i/6*TAU;b.beam('crystalEdge',[Math.cos(a)*.18,.86,Math.sin(a)*.18],[Math.cos(a)*.16,1.16,Math.sin(a)*.16],.020);}
  b.lathe('crystal',[[0,.82],[.23,.86],[.18,.90]], [0,0,0],6);b.lathe('crystalEdge',[[.18,1.14],[.23,1.17],[0,1.20]],[0,0,0],6);
  const core=new Batch(glowPaint);core.add('ball','cream',0,1.03,0,.13,.13,.13);child(root,core,'light-core');
 }else if(kind==='curtain'){
  b.add('cyl','cream',0,1.44,0,.029,1.22,.029,0,0,Math.PI/2);
  cloth(root,'curtain',16,18,(u,v)=>[-.53+u*1.06,1.40-v*1.17,.023*Math.sin(u*TAU*5)],(u,v)=>v>.85||Math.abs(v-.30)<.035?'stripe':Math.floor(u*8)%4===0?'rose':'cloth',[
   {name:'top',position:[0,1.4,0]},{name:'middle',position:[0,.95,0],parent:0},{name:'hem',position:[0,.45,0],parent:1}
  ],(u,v)=>v<.5?[0,1,v*2]:[1,2,(v-.5)*2]);
  const pattern=new Batch(glowPaint);for(let j=0;j<3;j++)for(let i=0;i<3;i++)pattern.add('box',(i+j)%2?'crystal':'rose',-.32+i*.32,.46+j*.27,.07,.13,.13,.003,0,0,Math.PI/4);child(root,pattern,'light-pattern');
 }else if(kind==='hammock'){
  for(const side of[-1,1])b.beam('cream',[side*.88,1.20,0],[side*.82,1.1,0],.030);
  const bones=cloth(root,'hammock',24,8,(u,v)=>{const x=(u-.5)*1.64;return[x,.5+.60*(x/.82)**2+(v-.5)**2*.14,(v-.5)*.76];},(u,v)=>Math.floor(v*8)%3===0?'stripe':'cloth',[
   {name:'fixed',position:[0,0,0]},{name:'seat',position:spec.anchors.seat}
  ],(u,v)=>[0,1,Math.sin(u*Math.PI)]);
  anchor(bones[1],'seat',[0,0,0]);
  for(const side of[-1,1])for(const z of[-.38,.38])b.beam('cream',[side*.82,1.10,0],[side*.66,.9,z],.012);
 }else if(kind==='windsock'){
  b.beam('cream',[-.85,1.73,0],[.85,1.73,0],.011);
  // Open striped sock: full round mouth, narrowing tail with a soft hanging line.
  cloth(root,'windsock',20,16,(u,v)=>{const a=u*TAU,r=.14*(1-v)+.035;return[-.69+v*1.33,1.52+Math.cos(a)*r-.10*v,Math.sin(a)*r];},(u,v)=>Math.floor(v*7)%2?'stripe':'cloth',[
   {name:'mouth',position:[-.69,1.52,0]},{name:'middle',position:[0,1.47,0],parent:0},{name:'tail',position:[.5,1.43,0],parent:1}
  ],(u,v)=>v<.5?[0,1,v*2]:[1,2,(v-.5)*2]);
  b.ring('copper',.176,.012,[-.69,1.52,0],0,Math.PI/2);b.beam('cream',[-.69,1.7,0],[-.69,1.73,0],.011);
 }
 root.add(b.finish('structure'));
 for(const [name,position]of Object.entries(spec.anchors))if(!root.getObjectByName('anchor:'+name))anchor(root,name,position);
 return root;
}
// Factory templates are keyed by spec identity; retain one immutable merged spec per kind.
const waterSpecs=Object.freeze(Object.fromEntries(Object.entries(DELIGHTS).map(([kind,base])=>[kind,Object.freeze({...base,anchors:Object.freeze({...base.anchors,...WATER_PORTS[kind]??{}})})])));
export function createDelight(kind,{intake=undefined}={}){
 const spec=waterSpecs[kind]??null;
 if(NEW_WATER_TOYS[kind]){
  const g=createWaterToy(kind,{spec,intake:kind==='pump'?(intake===undefined?{mouth:[0,.2,-2],elbow:[0,1.1,-2]}:intake):null});
  g.userData.delightKind=kind;waterAttachments.set(g,g);return g;
 }

 if(!templates.has(kind))templates.set(kind,authored(kind));const root=cloneRig(templates.get(kind)),nodes=new Map();root.traverse(n=>{if(n.name)nodes.set(n.name,n);});rigs.set(root,{kind,nodes});if(WATER_PORTS[kind]){const addon=createWaterToyAddon(kind,{spec});root.add(addon);waterAttachments.set(root,addon);}animateDelight(root);return root;
}
export function animateDelight(group,{time=0,flow=0,phase=0,active=0,swing=0,lift=0,glow=0,on=false,powered=false}={}){
 const water=waterAttachments.get(group);if(water)animateWaterToy(water,{time,flow,phase,on,powered,lift});
 const r=rigs.get(group);if(!r)return;const n=r.nodes;flow=clamp(flow,0,1);active=clamp(active,0,1);glow=clamp(glow,0,1);swing=clamp(swing,-1,1);
 if(n.has('water')){n.get('water').visible=flow>.005;n.get('water').position.y=Math.sin(time*5)*.002*flow;}
 if(n.has('pour-stream')){n.get('pour-stream').visible=active>.005;n.get('pour-stream').scale.x=n.get('pour-stream').scale.z=.7+.3*active;}
 if(n.has('rotor'))n.get('rotor').rotation.z=-(phase%1)*TAU;
 if(n.has('bell-pivot'))n.get('bell-pivot').rotation.z=Math.sin((phase%1)*TAU)*.20*active;
 if(n.has('platform'))n.get('platform').position.y=clamp(lift,0,DELIGHTS.lift.travel);
 if(n.has('light-core')){const core=n.get('light-core');core.scale.setScalar(1);core.children[0].material=glow>.01?glowPaint:lampOffPaint;}
 if(n.has('light-pattern'))n.get('light-pattern').visible=glow>.01;
 if(n.has('curtain:middle')){n.get('curtain:middle').rotation.x=Math.sin(time*1.2)*.075+swing*.05;n.get('curtain:hem').rotation.x=Math.sin(time*1.2-.8)*.08;}
 if(n.has('hammock:seat')){n.get('hammock:seat').position.z=swing*.16;n.get('hammock:seat').position.y=DELIGHTS.hammock.anchors.seat[1]+swing*swing*.035;n.get('hammock:seat').rotation.x=swing*.10;}
 if(n.has('windsock:middle')){n.get('windsock:middle').rotation.y=Math.sin(time*1.7)*.10+swing*.06;n.get('windsock:tail').rotation.y=Math.sin(time*1.7-.8)*.13;n.get('windsock:tail').rotation.x=Math.sin(time*1.5)*.05;}
}

export function disposeDelight(group){
 const skeletons=new Set(),privateGeometry=new Set();
 group.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);if(o.isMesh&&(o.userData.privateGeometry||o.geometry.userData.privateResources))privateGeometry.add(o.geometry);});
 for(const s of skeletons)s.dispose();for(const g of privateGeometry)g.dispose();
}
