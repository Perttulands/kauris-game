import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// These are local all-pose ceilings. Pump intake uses a separate caller-owned
// capsule envelope; the original rigs are not part of addon profiles.
export const WATER_TOY_PROFILES=Object.freeze({
  pump:Object.freeze({radius:1.14,minY:0,maxY:1.6}),
  fountain:Object.freeze({radius:1.02,minY:0,maxY:1.8}),
  cornerChannel:Object.freeze({radius:1.28,minY:0,maxY:1.25}),
  splitter:Object.freeze({radius:1.28,minY:0,maxY:1.25}),
  gutter:Object.freeze({radius:.96,minY:.60,maxY:1.10}),
  waterWheel:Object.freeze({radius:1,minY:.395,maxY:.85}),
  lift:Object.freeze({radius:1.76,minY:.50,maxY:.80}),
});
const C={wood:'#ae7951',woodLight:'#d4aa77',woodDark:'#76523d',cream:'#eddbaf',
  copper:'#d29862',patina:'#7ba995',darkCopper:'#865c43',iron:'#607b89',
  ironLight:'#c0cfce',ironDark:'#3c5667',water:'#a0decb',foam:'#e2f1ce'};
const paint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.66,metalness:.10,side:THREE.DoubleSide});
const wet=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.20,metalness:.15,side:THREE.DoubleSide});
const unit={box:new THREE.BoxGeometry(1,1,1),cyl:new THREE.CylinderGeometry(1,1,1,12),ball:new THREE.IcosahedronGeometry(1,1)};
const transform=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
const templates=new WeakMap(),rigs=new WeakMap(),TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
class Batch{
  constructor(material=paint){this.parts=[];this.material=material;}
  geometry(source,color,matrix){
    const g=source.index?source.toNonIndexed():source.clone();g.deleteAttribute('uv');
    if(matrix)g.applyMatrix4(matrix);
    const c=new THREE.Color(C[color]??color),rgb=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<rgb.length;i+=3){rgb[i]=c.r;rgb[i+1]=c.g;rgb[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(rgb,3));this.parts.push(g);
  }
  add(shape,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
    transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);transform.scale.set(sx,sy,sz);transform.updateMatrix();
    this.geometry(unit[shape],color,transform.matrix);
  }
  box(b,color){
    this.add('box',color,(b.minX+b.maxX)/2,(b.minY+b.maxY)/2,(b.minZ+b.maxZ)/2,b.maxX-b.minX,b.maxY-b.minY,b.maxZ-b.minZ);
  }
  beam(color,a,b,r){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);
    transform.position.copy(p).add(q).multiplyScalar(.5);
    transform.quaternion.setFromUnitVectors(up,q.clone().sub(p).normalize());
    transform.scale.set(r,p.distanceTo(q),r);transform.updateMatrix();this.geometry(unit.cyl,color,transform.matrix);
  }
  ring(color,r,tube,position,rx=0,ry=0){
    const g=new THREE.TorusGeometry(r,tube,5,20);g.rotateX(rx);g.rotateY(ry);g.translate(...position);
    this.geometry(g,color);g.dispose();
  }
  lathe(color,profile,position=[0,0,0],segments=16){
    const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),segments);g.translate(...position);
    this.geometry(g,color);g.dispose();
  }
  finish(name){
    const mesh=new THREE.Mesh(mergeGeometries(this.parts,false),this.material);
    this.parts.forEach(g=>g.dispose());mesh.name=name;mesh.receiveShadow=this.material!==wet;return mesh;
  }
}
function child(root,b,name,position=[0,0,0]){
  const mesh=b.finish(name);mesh.position.fromArray(position);root.add(mesh);return mesh;
}
function anchor(root,name,p){
  const node=new THREE.Object3D();node.name='anchor:'+name;node.position.fromArray(p);root.add(node);
}
function chevron(b,x,y,z,rotation=0,scale=1){
  const points=[[-.055,0,-.06],[.055,0,0],[-.055,0,.06]];
  const c=Math.cos(rotation),s=Math.sin(rotation);
  const world=points.map(p=>[x+(p[0]*c+p[2]*s)*scale,y,z+(-p[0]*s+p[2]*c)*scale]);
  b.beam('cream',world[0],world[1],.009*scale);b.beam('cream',world[1],world[2],.009*scale);
}
function receiver(b,p,axis='x',r=.10){
  // Open connector collar: its bore is visible from both ends.
  const center=p.slice(),i=axis==='x'?0:2;center[i]-=Math.sign(center[i])*.015;
  b.ring('cream',r-.015,.015,center,0,axis==='x'?Math.PI/2:0);
}
function trough(b,x0,x1,z0,z1,y=.65,depth=.20){
  const w=x1-x0,d=z1-z0;
  b.add('box','patina',(x0+x1)/2,y+.018,(z0+z1)/2,w,.036,d);
  // Long sides only: physical ports stay open.
  if(w>d){
    for(const z of [z0+.016,z1-.016])b.add('box','copper',(x0+x1)/2,y+depth/2,z,w,depth,.032);
  }else{
    for(const x of [x0+.016,x1-.016])b.add('box','copper',x,y+depth/2,(z0+z1)/2,.032,depth,d);
  }
}
function makePump(root,b,spec){
  b.box(spec.boxes[0],'darkCopper');
  for(const x of [-.50,.50])for(const z of [-.50,.50]){
    b.add('cyl','cream',x,.177,z,.034,.006,.034);
    b.add('box','woodLight',x,.09,z,.12,.10,.12);
  }
  b.lathe('copper',[[0,.18],[.25,.18],[.31,.27],[.31,1.19],[.27,1.32],[0,1.32]]);
  for(const y of [.31,1.15])b.ring('cream',.31,.018,[0,y,0],Math.PI/2);
  b.add('cyl','darkCopper',0,1.325,0,.25,.035,.25);
  const out=spec.anchors.outlet;
  b.beam('copper',[.25,out[1],0],out,.083);receiver(b,out);
  // Static neck joins the body to the agreed dynamic pipe exit.
  b.beam('copper',[0,1.1,-.30],[0,1.1,-.6],.09);
  b.ring('cream',.075,.014,[0,1.1,-.6]);
  for(let i=0;i<6;i++){
    const a=i*TAU/6;b.add('ball','cream',Math.cos(a)*.23,.83+Math.sin(a)*.23,.22,.019,.019,.018);
  }
  b.add('cyl','darkCopper',0,.83,.281,.175,.027,.175,Math.PI/2);
  const rotor=new Batch();
  rotor.add('cyl','patina',0,0,0,.148,.018,.148,Math.PI/2);
  for(let i=0;i<5;i++){
    const a=i*TAU/5;rotor.beam('cream',[0,0,.014],[Math.cos(a)*.12,Math.sin(a)*.12,.014],.014);
  }
  child(root,rotor,'pump-rotor',[0,.83,.307]);
  const lever=new Batch();
  lever.beam('iron',[0,0,0],[.12,0,0],.018);lever.add('ball','cream',.12,0,0,.032,.032,.022);
  child(root,lever,'pump-switch',[0,.44,.314]);
  const water=new Batch(wet);
  water.beam('water',[.36,1.32,0],[.89,1.32,0],.039);
  child(root,water,'water');
}
function makeFountain(root,b,spec){
  b.box(spec.boxes[0],'darkCopper');
  b.add('box','copper',0,.17,0,1.12,.02,.72);
  b.box(spec.boxes[1],'patina');
  // A shallow open shell bowl stays inside the conservative bowl solid.
  b.lathe('copper',[[0,.60],[.25,.60],[.38,.665],[.39,.715],[.36,.715],[.33,.672],[.22,.625],[0,.625]]);
  b.ring('cream',.374,.013,[0,.704,0],Math.PI/2);
  b.beam('copper',spec.anchors.inlet,[-.33,.72,0],.065);receiver(b,spec.anchors.inlet);
  b.add('cyl','patina',0,.687,0,.072,.13,.072);
  const water=new Batch(wet);water.add('cyl','water',0,.657,0,.27,.012,.27);
  child(root,water,'water');
  const jet=new Batch(wet);
  jet.beam('water',[0,0,0],[0,.87,0],.024);
  jet.add('ball','foam',0,.87,0,.048,.05,.048);
  for(let i=0;i<5;i++){
    const a=i*TAU/5;
    const points=[[0,.72,0],[Math.cos(a)*.12,.64,Math.sin(a)*.12],[Math.cos(a)*.22,.36,Math.sin(a)*.22],[Math.cos(a)*.27,.04,Math.sin(a)*.27]];
    for(let j=0;j<points.length-1;j++)jet.beam(j===0?'foam':'water',points[j],points[j+1],.014);
  }
  child(root,jet,'fountain-jet',[0,.72,0]);
}
function makeChannel(root,b,spec,split){
  for(const box of spec.boxes.slice(0,2))b.box(box,'wood');
  const end=split?.9:.2;
  b.add('box','patina',(-.9+end)/2,.668,0,end+.9,.036,.4);
  b.add('box','copper',(-.9+end)/2,.75,-.184,end+.9,.20,.032);
  b.add('box','copper',-.55,.75,.184,.70,.20,.032);
  if(split)b.add('box','copper',.55,.75,.184,.70,.20,.032);
  else b.add('box','copper',.184,.75,0,.032,.20,.4);
  // Split rails leave the entire T/L junction open.
  trough(b,-.2,.2,.2,.9);
  receiver(b,spec.anchors.inlet,'x');
  if(split)receiver(b,spec.anchors.outletA,'x');
  receiver(b,split?spec.anchors.outletB:spec.anchors.outlet,'z');
  chevron(b,-.55,.698,0,0,.8);
  if(split)chevron(b,.52,.698,0,0,.8);
  chevron(b,0,.698,.53,-Math.PI/2,.8);
  const water=new Batch(wet);
  water.add('box','water',split?0:-.35,.712,0,split?1.8:1.1,.01,.25);
  water.add('box','water',0,.712,.45,.25,.01,.9);child(root,water,'water');
  const pulses=new Batch(wet);
  // Three bright dashes are moved along the open portions, never beyond ports.
  pulses.add('box','foam',-.72,.722,0,.10,.006,.17);
  if(split)pulses.add('box','foam',.26,.722,0,.10,.006,.17);
  pulses.add('box','foam',0,.722,.25,.17,.006,.10);
  const dots=child(root,pulses,'channel-pulses'),source=dots.geometry.attributes.position;
  const travel=source.clone();
  for(let i=0;i<source.count;i++){
    const x=source.getX(i),z=source.getZ(i);
    if(z>.2)travel.setZ(i,z+.50);else travel.setX(i,x+.50);
  }
  dots.geometry.morphAttributes.position=[travel];dots.updateMorphTargets();
}
function makeAddon(root,b,spec,kind){
  if(kind==='gutter'){
    receiver(b,spec.anchors.inlet,'x',.075);
    chevron(b,-.76,.764,0,0,.6);
  }else if(kind==='waterWheel'){
    b.add('box','patina',.71,.400,0,.38,.010,.30);
    for(const z of [-.16,.16])b.add('box','copper',.71,.428,z,.38,.056,.020);
    receiver(b,spec.anchors.outlet,'x',.025);
    b.beam('iron',spec.anchors.drive,[0,.65,.22],.055);
    receiver(b,spec.anchors.drive,'z',.075);
    const water=new Batch(wet);water.add('box','water',.71,.42,0,.36,.012,.25);
    child(root,water,'water');
  }else{
    // Rear arms overlap the original fixed rail footprints; the central
    // crossbar/bearing stays behind the complete legacy rider envelope.
    b.box({minX:-.92,maxX:.92,minY:.59,maxY:.71,minZ:-1.43,maxZ:-1.35},'iron');
    for(const x of [-.92,.92])b.box({minX:x-.06,maxX:x+.06,minY:.59,maxY:.71,minZ:-1.40,maxZ:-.86},'ironDark');
    b.add('box','ironLight',0,.707,-1.39,1.80,.006,.06);
    b.beam('iron',spec.anchors.drive,[0,.65,-1.445],.055);
    receiver(b,spec.anchors.drive,'z',.075);
    const hub=new Batch();hub.add('cyl','copper',0,0,0,.07,.032,.07,Math.PI/2);
    hub.beam('cream',[-.05,0,-.01],[.05,0,-.01],.008);
    child(root,hub,'drive-hub',[0,.65,-1.435]);
  }
}
function authored(kind,spec,addon){
  const root=new THREE.Group(),b=new Batch();root.name=(addon?'water-addon-':'water-toy-')+kind;
  if(addon)makeAddon(root,b,spec,kind);
  else if(kind==='pump')makePump(root,b,spec);
  else if(kind==='fountain')makeFountain(root,b,spec);
  else makeChannel(root,b,spec,kind==='splitter');
  root.add(b.finish('structure'));
  for(const [name,p] of Object.entries(spec.anchors)){
    if(addon){
      if(name==='inlet'||name==='outlet')anchor(root,'water-'+name,p);
      else if(name==='drive')anchor(root,name,p);
    }else anchor(root,name,p);
  }
  return root;
}
function pipe(root,intake){
  if(!intake)return;
  const b=new Batch(),start=[0,1.1,-.6],elbow=intake.elbow,mouth=intake.mouth;
  if(!Array.isArray(elbow)||!Array.isArray(mouth)||elbow.length!==3||mouth.length!==3||
    !elbow.every(Number.isFinite)||!mouth.every(Number.isFinite))throw new TypeError('Finite local intake mouth/elbow required');
  b.beam('copper',start,elbow,.08);b.beam('copper',elbow,mouth,.08);
  b.add('ball','copper',...elbow,.08,.08,.08);
  b.ring('cream',.083,.012,[elbow[0],mouth[1]+.022,elbow[2]],Math.PI/2);
  // Visible dark mouth and strainer remain inside the exact .10 capsule.
  b.add('cyl','ironDark',...mouth,.067,.012,.067);
  for(const x of [-.035,0,.035])b.beam('cream',[mouth[0]+x,mouth[1]-.009,mouth[2]-.05],[mouth[0]+x,mouth[1]-.009,mouth[2]+.05],.005);
  const mesh=child(root,b,'intake-pipe');
  mesh.geometry.userData.privateResources=true;mesh.userData.privateGeometry=true;
  anchor(root,'intake',mouth);
}
function create(kind,spec,intake,addon){
  const supported=addon?['gutter','waterWheel','lift']:['pump','fountain','cornerChannel','splitter'];
  if(!supported.includes(kind))throw new RangeError('Unknown water toy: '+kind);
  if(!spec||!Array.isArray(spec.boxes)||!spec.anchors||!Array.isArray(spec.size))throw new TypeError('Lead-owned immutable water toy spec required');
  let cache=templates.get(spec);if(!cache){cache=new Map();templates.set(spec,cache);}
  const key=(addon?'addon:':'toy:')+kind;
  if(!cache.has(key))cache.set(key,authored(kind,spec,addon));
  const root=cache.get(key).clone();
  if(kind==='pump')pipe(root,intake);
  rigs.set(root,{kind,water:root.getObjectByName('water'),rotor:root.getObjectByName('pump-rotor'),
    lever:root.getObjectByName('pump-switch'),jet:root.getObjectByName('fountain-jet'),
    pulses:root.getObjectByName('channel-pulses'),hub:root.getObjectByName('drive-hub')});
  animateWaterToy(root);return root;
}
export function createWaterToy(kind,{spec,intake=null}={}){return create(kind,spec,intake,false);}
export function createWaterToyAddon(kind,{spec}={}){return create(kind,spec,null,true);}
export function animateWaterToy(group,{time=0,flow=0,phase=0,on=false,powered=false,lift=0}={}){
  const r=rigs.get(group);if(!r)return;
  const f=clamp(flow),p=Number.isFinite(phase)?phase:0;
  if(r.water)r.water.visible=f>.001;
  if(r.rotor)r.rotor.rotation.z=-p*TAU;
  if(r.lever)r.lever.rotation.z=on?Math.PI/4:-Math.PI/4;
  if(r.jet){r.jet.visible=f>.001;r.jet.scale.y=.10+.9*f;}
  if(r.pulses){
    r.pulses.visible=f>.001;
    r.pulses.morphTargetInfluences[0]=((p%1)+1)%1;
  }
  if(r.hub)r.hub.rotation.z=powered?-p*TAU:r.hub.rotation.z;
}
