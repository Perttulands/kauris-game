import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original cultivated sea plants. The caller owns the plot/root transform.
export const SEA_PLANT_PROFILES=Object.freeze({
  kelp:Object.freeze({radius:.65,minY:0,maxY:1.8}),
  coralPlant:Object.freeze({radius:.65,minY:0,maxY:1.1}),
  pearlPlant:Object.freeze({radius:.6,minY:0,maxY:.9}),
});
const palette={root:'#697c59',stem:'#548371',leaf:'#6eaa83',edge:'#bdd393',
  kelpDark:'#386f67',copper:'#c88159',coral:'#df9a83',coralLight:'#f1c5a1',
  patina:'#81b4a4',pearl:'#f1edd8',pearlShade:'#adceca',cream:'#faf4cf'};
const paint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.06,side:THREE.DoubleSide});
const pearlPaint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.29,metalness:.18});
const unit={ball:new THREE.IcosahedronGeometry(1,1),cyl:new THREE.CylinderGeometry(1,1,1,7)};
const matrix=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
const templates=new Map(),rigs=new WeakMap(),TAU=Math.PI*2;
const clamp=x=>Math.min(1,Math.max(0,Number.isFinite(x)?x:0));
const ease=(x,a,b)=>{const k=clamp((x-a)/(b-a));return k*k*(3-2*k);};
class Batch{
  constructor(material=paint){this.parts=[];this.material=material;}
  geometry(source,color,transform){
    const g=source.index?source.toNonIndexed():source.clone();
    g.deleteAttribute('uv');if(transform)g.applyMatrix4(transform);
    const c=new THREE.Color(palette[color]??color),rgb=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<rgb.length;i+=3){rgb[i]=c.r;rgb[i+1]=c.g;rgb[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(rgb,3));this.parts.push(g);
  }
  add(shape,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){
    matrix.position.set(x,y,z);matrix.rotation.set(rx,ry,rz);matrix.scale.set(sx,sy,sz);matrix.updateMatrix();
    this.geometry(unit[shape],color,matrix.matrix);
  }
  beam(color,a,b,r){
    const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);
    matrix.position.copy(p).add(q).multiplyScalar(.5);
    matrix.quaternion.setFromUnitVectors(up,q.clone().sub(p).normalize());
    matrix.scale.set(r,p.distanceTo(q),r);matrix.updateMatrix();this.geometry(unit.cyl,color,matrix.matrix);
  }
  finish(name){
    const mesh=new THREE.Mesh(mergeGeometries(this.parts,false),this.material);
    this.parts.forEach(g=>g.dispose());mesh.name=name;mesh.receiveShadow=true;
    // No extra crop shadow casters; the existing scene owns shadow policy.
    return mesh;
  }
}
// A folded blade is a broad continuous surface with a lighter raised midrib.
// Its two edge strips are deliberately unequal, avoiding a repeated flat card.
function ribbon(batch,points,width,color,edge,crossZ=false){
  const left=[],right=[],ridge=[],n=points.length;
  for(let i=0;i<n;i++){
    const t=i/(n-1),w=width*Math.sin(Math.PI*t)**.65;
    const [x,y,z]=points[i];
    left.push(crossZ?[x,y,z-w]:[x-w,y,z]);
    right.push(crossZ?[x,y,z+w*.84]:[x+w*.84,y,z]);
    ridge.push(crossZ?[x,y+.024*Math.sin(Math.PI*t),z]:[x,y,z+.024*Math.sin(Math.PI*t)]);
  }
  for(let i=0;i<n-1;i++)for(const [side,col] of [[left,color],[right,edge]]){
    const a=ridge[i],b=side[i],c=side[i+1],d=ridge[i+1];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...c,...a,...c,...d],3));
    g.computeVertexNormals();batch.geometry(g,col);g.dispose();
  }
}
function makeKelp(v){
  const root=new THREE.Group(),base=new Batch();
  for(let i=0;i<6;i++){
    const a=i*TAU/6;base.beam('root',[0,.04,0],[Math.cos(a)*.23,.035,Math.sin(a)*.23],.027);
  }
  base.add('ball','root',0,.07,0,.14,.065,.13);root.add(base.finish('holdfast'));
  for(let k=0;k<3;k++){
    const b=new Batch(),a=k*TAU/3+v*.2,h=[1.54,1.28,1.10][k];
    const x=Math.cos(a)*.14,z=Math.sin(a)*.14,lean=(k-1)*.12;
    const points=[];
    for(let i=0;i<=10;i++){
      const t=i/10;points.push([x+lean*t+Math.sin(t*5+v*.2)*.065*t,.06+h*t,z+Math.sin(t*6+k)*.095*t]);
    }
    b.beam('stem',[0,0,0],points[1],.025);
    ribbon(b,points,.115,k===1?'kelpDark':'leaf','edge');
    // Paired shorter blades emerge from the same stipe, not floating leaves.
    for(const side of [-1,1]){
      const y=.36+k*.065;
      ribbon(b,[[x,y,z],[x+side*.12,y+.12,z+.03],[x+side*.23,y+.30,z+.04],[x+side*.29,y+.53,z]],
        .065,'leaf','edge');
      b.beam('stem',[x,y,z],[x+side*.1,y+.12,z+.03],.012);
    }
    const mesh=b.finish('frond-'+k);mesh.position.y=.08;root.add(mesh);
  }
  return root;
}
function makeCoral(v){
  const root=new THREE.Group(),base=new Batch();
  base.add('ball','root',0,.065,0,.21,.065,.18);
  for(let i=0;i<5;i++){const a=i*TAU/5;base.beam('patina',[0,.07,0],[Math.cos(a)*.25,.025,Math.sin(a)*.25],.024);}
  root.add(base.finish('holdfast'));
  for(let k=0;k<3;k++){
    const b=new Batch(),a=k*TAU/3+v*.12,dx=Math.cos(a),dz=Math.sin(a);
    const p=[dx*.13,.31,dz*.13],top=[dx*.21,.65+(k===0?.15:0),dz*.21];
    b.beam('copper',[0,0,0],p,.067);b.add('ball','copper',...p,.076,.09,.076);
    b.beam('coral',p,top,.052);b.add('ball','coralLight',...top,.06,.08,.06);
    for(let j=0;j<3;j++){
      const y=.25+j*.15,side=j%2?1:-1;
      const start=[dx*(.10+j*.025),y,dz*(.10+j*.025)];
      const fork=[start[0]+dz*side*.16,y+.10,start[2]-dx*side*.16];
      const tip=[fork[0]+dx*.05,y+.24,fork[2]+dz*.05];
      b.beam('copper',start,fork,.041);b.beam('coral',fork,tip,.03);
      b.add('ball','coralLight',...tip,.048,.06,.048);
      b.add('ball','coral',fork[0],fork[1]+.04,fork[2],.046,.055,.046);
    }
    const mesh=b.finish('coral-branch-'+k);mesh.position.y=.10;root.add(mesh);
  }
  return root;
}
function makePearl(v){
  const root=new THREE.Group(),base=new Batch(),leaves=new Batch(),cups=new Batch(),pearls=new Batch(pearlPaint),budParts=[];
  base.add('ball','root',0,.04,0,.14,.04,.13);root.add(base.finish('holdfast'));
  for(let i=0;i<7;i++){
    const a=i*TAU/7+v*.16,r=.37,dx=Math.cos(a),dz=Math.sin(a);
    // Build along +X, then rotate the completed leaf into a radial rosette.
    const leaf=new Batch();
    ribbon(leaf,[[0,.02,0],[r*.45,.10,0],[r*.85,.18,0],[r,.29,0]],.12,'patina','edge',true);
    const g=mergeGeometries(leaf.parts,false);leaf.parts.forEach(p=>p.dispose());
    g.rotateY(-a);leaves.parts.push(g);
    leaves.beam('stem',[0,.025,0],[dx*r*.84,.17,dz*r*.84],.012);
  }
  for(let i=0;i<3;i++){
    const a=i*TAU/3+v*.1,r=.19,x=Math.cos(a)*r,z=Math.sin(a)*r,h=[.58,.43,.48][i];
    cups.beam('stem',[0,.04,0],[x,h-.08,z],.024);
    for(let j=0;j<5;j++){
      const t=j*TAU/5;
      cups.beam('patina',[x,h-.095,z],[x+Math.cos(t)*.105,h-.01,z+Math.sin(t)*.105],.022);
    }
    const first=pearls.parts.length;
    pearls.add('ball','pearl',x,h,z,.102,.115,.102);
    pearls.add('ball','cream',x-.025,h+.038,z+.067,.024,.028,.015);
    pearls.add('ball','pearlShade',x+.035,h-.025,z-.073,.036,.045,.019);
    for(let j=first;j<pearls.parts.length;j++){
      const bud=pearls.parts[j].clone(),p=bud.attributes.position;
      for(let n=0;n<p.count;n++)p.setXYZ(n,x+(p.getX(n)-x)*.06,h-.06+(p.getY(n)-h)*.06,z+(p.getZ(n)-z)*.06);
      budParts.push(bud);
    }
  }
  const leaf=leaves.finish('rosette'),cup=cups.finish('pearl-cups'),pearl=pearls.finish('pearls');
  const buds=mergeGeometries(budParts,false);budParts.forEach(g=>g.dispose());
  pearl.geometry.morphAttributes.position=[buds.attributes.position.clone()];buds.dispose();pearl.updateMorphTargets();
  leaf.position.y=cup.position.y=pearl.position.y=.04;
  root.add(leaf,cup,pearl);return root;
}
export function createSeaPlant(kind,{variation=0}={}){
  if(!Object.hasOwn(SEA_PLANT_PROFILES,kind))throw new RangeError('Unknown sea plant: '+kind);
  const v=Number.isFinite(variation)?Math.abs(Math.trunc(variation))%3:0,key=kind+':'+v;
  if(!templates.has(key)){
    const root=kind==='kelp'?makeKelp(v):kind==='coralPlant'?makeCoral(v):makePearl(v);
    root.name='sea-plant-'+kind;templates.set(key,root);
  }
  const root=templates.get(key).clone();
  rigs.set(root,{kind,variation:v,parts:root.children});
  animateSeaPlant(root);return root;
}
export function animateSeaPlant(group,{time=0,growth=1,wet=1}={}){
  const rig=rigs.get(group);if(!rig)return;
  const g=clamp(growth),t=Number.isFinite(time)?time:0,w=clamp(wet),parts=rig.parts;
  // Live basal shoot never disappears between phases. Root position/scale stay caller-owned.
  parts[0].scale.setScalar(.4+.6*ease(g,0,.5));
  for(let i=1;i<parts.length;i++){
    const p=parts[i],pearl=rig.kind==='pearlPlant'&&i===3;
    const s=.08+.92*ease(g,.02,.86);
    p.scale.setScalar(s);
    if(pearl)p.morphTargetInfluences[0]=1-ease(g,.62,1);
    p.rotation.y=Math.sin(t*(rig.kind==='kelp'?.8:.55)+(rig.kind==='pearlPlant'?0:i*1.7)+rig.variation)*.085*w;
    // Yaw-only sway keeps the full radial and ground-contact envelopes invariant.
  }
  group.userData.growthStage=g<.27?'sprout':g<.6?'branching':g<.999?'bloom':'ready';
}
