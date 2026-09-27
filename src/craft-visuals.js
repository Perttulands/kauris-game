import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original authored geometry. Every factory is synchronous; clones share immutable meshes.
const M={};
for(const [name,color,roughness,metalness] of [
 ['wood','#bc8658',.88,0],['woodLight','#deb47d',.86,0],['woodDark','#76513b',.92,0],['grain','#a4724d',.91,0],['cream','#efdbac',.8,0],
 ['roof','#537c75',.84,0],['roofLight','#72958a',.82,0],['copper','#c48756',.4,.55],['copperDark','#80533d',.57,.4],['patina','#5eaa96',.65,.25],['patinaLight','#98c8af',.72,.15],
 ['iron','#547080',.5,.45],['ironDark','#344b59',.7,.35],['ironLight','#bdcbd0',.36,.5],['ironInset','#78949e',.64,.3],
 ['diamond','#72cfc8',.28,.2],['diamondLight','#d6fff0',.24,.15],['diamondDark','#408d9b',.4,.25],['diamondBlue','#95c7e2',.27,.2],
 ['enamel','#83afa0',.43,.18],['enamelDark','#467d72',.48,.2],['black','#34483f',.8,0]
]) M[name]=new THREE.MeshStandardMaterial({color,roughness,metalness,flatShading:true});
const G={box:new THREE.BoxGeometry(1,1,1),soft:new RoundedBoxGeometry(1,1,1,1,.08),cyl:new THREE.CylinderGeometry(1,1,1,12),ball:new THREE.IcosahedronGeometry(1,1)};
const t=new THREE.Object3D();
class Batch{
 constructor(){this.parts=new Map();}
 geometry(g,mat,matrix){const c=g.index?g.toNonIndexed():g.clone();c.deleteAttribute('uv');if(matrix)c.applyMatrix4(matrix);const m=M[mat];if(!this.parts.has(m))this.parts.set(m,[]);this.parts.get(m).push(c);}
 add(shape,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){t.position.set(x,y,z);t.rotation.set(rx,ry,rz);t.scale.set(sx,sy,sz);t.updateMatrix();this.geometry(G[shape],mat,t.matrix);}
 beam(mat,a,b,r){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);t.position.copy(p).add(q).multiplyScalar(.5);t.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.clone().sub(p).normalize());t.scale.set(r,p.distanceTo(q),r);t.updateMatrix();this.geometry(G.cyl,mat,t.matrix);}
 finish(name){const g=new THREE.Group();g.name=name;for(const [m,p]of this.parts){const geometry=mergeGeometries(p,false);p.forEach(x=>x.dispose());const mesh=new THREE.Mesh(geometry,m);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);}return g;}
}
// Building pieces share painted geometry per family; transparent panes remain a
// separate, explicitly readable surface. The watering can below retains its own
// original material batches and geometry.
const styles={
 wood:{frame:'#795139',panel:'#d3a474',edge:'#efd09a',dark:'#986341',accent:'#638e76'},
 copper:{frame:'#855438',panel:'#79ad94',edge:'#dfa56a',dark:'#467d72',accent:'#c58454'},
 iron:{frame:'#3f5869',panel:'#7f9da5',edge:'#c8d4cd',dark:'#526f7f',accent:'#d3af69'},
 diamond:{frame:'#56969f',panel:'#c0e4df',edge:'#e3fff0',dark:'#709bba',accent:'#90d9cc'},
 fiber:{frame:'#9d7956',panel:'#ddc5a0',edge:'#f5e3bb',dark:'#b28369',accent:'#648e87'}
};
const craftPaint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.80,flatShading:true,side:THREE.DoubleSide});
const craftMetal=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.43,metalness:.35,flatShading:true});
const craftGlass=new THREE.MeshStandardMaterial({color:'#b8efe4',roughness:.12,metalness:.08,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
const cache=new Map(),craftRigs=new WeakMap();
class CraftBatch extends Batch{
 constructor(surface){super();this.surface=surface;}
 geometry(g,color,matrix){const c=g.index?g.toNonIndexed():g.clone();c.deleteAttribute('uv');if(matrix)c.applyMatrix4(matrix);const glass=color==='glass',m=glass?craftGlass:(this.surface==='copper'||this.surface==='iron'||this.surface==='diamond'?craftMetal:craftPaint);
  if(!glass){const rgb=new THREE.Color(color),values=new Float32Array(c.attributes.position.count*3);for(let i=0;i<values.length;i+=3){values[i]=rgb.r;values[i+1]=rgb.g;values[i+2]=rgb.b;}c.setAttribute('color',new THREE.BufferAttribute(values,3));}
  if(!this.parts.has(m))this.parts.set(m,[]);this.parts.get(m).push(c);
 }
 finish(name){const g=super.finish(name);g.traverse(n=>{if(n.isMesh&&n.material===craftGlass){n.userData.readThrough=true;n.castShadow=false;}});return g;}
}
function ring(b,color,x,y,z,r,tube=.035){const g=new THREE.TorusGeometry(r,tube,4,20);g.translate(x,y,z);b.geometry(g,color);g.dispose();}
function framedPanel(b,surface,x,y,w,h){
 const s=styles[surface];b.add('box',s.panel,x,y,-1,w,h,.14);
 for(const side of [-1,1]){
  const z=-1+side*.078;
  if(surface==='wood')for(let j=0,n=Math.max(1,Math.round(h/.28));j<n;j++){
   const yy=y-h/2+(j+.5)*h/n;b.add('box',j%3?s.panel:'#c29160',x,yy,z,w-.012,h/n-.015,.018);
   if(w>.5)b.add('box',s.dark,x+(j%2?.10:-.12)*w,yy-.03,z+side*.011,w*.38,.008,.003);
  }
  if(surface==='copper')for(let j=0,n=Math.max(1,Math.round(h/.65));j<n;j++){
   const yy=y-h/2+(j+.5)*h/n;b.add('soft',j%2?s.panel:'#88b49a',x,yy,z,w-.028,h/n-.026,.035);b.add('box',s.edge,x-w/2+.025,yy,z+side*.025,.025,h/n-.01,.02);
  }
  if(surface==='iron'){
   b.add('soft',s.dark,x,y,z,w-.03,h-.03,.025);b.add('soft',s.panel,x,y,z+side*.018,Math.max(.03,w-.13),Math.max(.03,h-.13),.025);
   for(const xx of [x-w/2+.055,x+w/2-.055])for(const yy of [y-h/2+.065,y+h/2-.065])b.add('cyl',s.edge,xx,yy,z+side*.04,.022,.018,.022,Math.PI/2);
  }
  if(surface==='diamond'){
   b.add('box',s.edge,x,y,z,.025,h-.02,.024);for(const q of [-1,1])b.beam(s.accent,[x+q*w*.45,y-h*.43,z],[x,y+h*.43,z],.017);
  }
  if(surface==='fiber'){
   const nx=Math.max(1,Math.round(w/.18)),ny=Math.max(1,Math.round(h/.19));
   for(let j=0;j<ny;j++)b.add('box',j%3?s.panel:s.dark,x,y-h/2+(j+.5)*h/ny,z,w-.01,h/ny*.58,.018);
   for(let i=0;i<nx;i++)b.add('box',i%3?'#e8d3ad':s.edge,x-w/2+(i+.5)*w/nx,y,z+side*.012,w/nx*.35,h-.015,.012);
  }
 }
}
function frame(b,surface){const s=styles[surface];for(const x of [-.91,.91])b.add('soft',s.frame,x,1.2,-1,.18,2.4,.23);b.add('soft',s.frame,0,2.3,-1,2,.2,.24);b.add('box',s.frame,0,.09,-1,1.82,.18,.22);
 for(const side of[-1,1])for(const x of[-.91,.91]){
  if(surface==='wood')for(const y of[.20,2.28])b.add('cyl',s.edge,x,y,-1+side*.122,.025,.012,.025,Math.PI/2);
  if(surface==='copper')b.add('box',s.edge,x,1.24,-1+side*.12,.026,2.12,.024);
  if(surface==='iron')for(const y of[.18,2.28]){b.add('box',s.panel,x,y,-1+side*.13,.19,.16,.024);b.add('cyl',s.edge,x,y,-1+side*.149,.023,.015,.023,Math.PI/2);}
 }
}
function glass(b,x,y,z,w,h,rx=0,rz=0){b.add('box','glass',x,y,z,w,h,.006,rx,0,rz);}
function portPanel(b,surface){
 const s=styles[surface],shape=new THREE.Shape();shape.moveTo(-.82,.18);shape.lineTo(.82,.18);shape.lineTo(.82,2.2);shape.lineTo(-.82,2.2);shape.closePath();
 const hole=new THREE.Path();hole.absarc(0,1.39,.56,0,Math.PI*2,true);shape.holes.push(hole);
 const g=new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:false,curveSegments:20});g.translate(0,0,-1.07);b.geometry(g,s.panel);g.dispose();
 for(const side of[-1,1]){
  ring(b,s.edge,0,1.39,-1+side*.084,.582,.045);ring(b,s.frame,0,1.39,-1+side*.084,.635,.016);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;b.add('cyl',s.edge,Math.cos(a)*.657,1.39+Math.sin(a)*.657,-1+side*.086,.022,.015,.022,Math.PI/2);}
  b.add('soft',s.frame,0,.60,-1+side*.07,1.42,.09,.24);
 }
}
function clothStrip(b,s,x,y,z,width,height){
 // Wide folded ribbons give cloth a silhouette without thousands of threads.
 const g=new THREE.PlaneGeometry(width,height,8,3),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const px=p.getX(i),py=p.getY(i);p.setZ(i,.035*Math.cos(px/width*Math.PI*8)*(1-(py/height+.5)*.55));}g.computeVertexNormals();g.translate(x,y,z);b.geometry(g,s.panel);g.dispose();
 b.add('box',s.accent,x,y-height/2+.045,z,width,.035,.024);
}
function roof(b,surface){
 const s=styles[surface],slope=Math.atan2(.8,1),length=Math.hypot(1,.8);
 for(const side of[-1,1]){
  if(surface==='diamond'){
   // Actual opening between four structural rails: no hidden opaque roof plane.
   for(const u of[.05,.95])b.add('box',s.frame,side*u,.8-u*.8,0,.11,.09,2,0,0,-side*slope);
   for(const z of[-.94,.94])b.add('box',s.edge,side*.5,.4,z,length,.08,.12,0,0,-side*slope);
   const pane=new THREE.PlaneGeometry(length*.82,1.76);pane.rotateX(-Math.PI/2);pane.rotateZ(-side*slope);pane.translate(side*.5,.405,0);b.geometry(pane,'glass');pane.dispose();
   b.add('box',s.edge,side*.5,.445,0,length,.032,.036,0,0,-side*slope);
  }else{
   b.add('box',s.frame,side*.5,.4,0,length+.06,.075,2.06,0,0,-side*slope);
   if(surface==='wood')for(let row=0;row<4;row++)for(let col=0;col<5;col++){
    const u=(row+.5)/4;b.add('box',row%2?'#60867a':'#719586',side*u,.83-u*.8,-.81+col*.405,length/4+.014,.053,.39,0,0,-side*slope);
   }
   if(surface==='copper')for(let col=0;col<7;col++){
    const z=-.87+col*.29;b.add('soft',col%3?s.panel:'#92b9a0',side*.5,.429,z,length,.047,.283,0,0,-side*slope);b.add('cyl',s.edge,side*.98,.047,z,.024,.267,.024,Math.PI/2);
   }
   if(surface==='iron')for(let col=0;col<5;col++){
    const z=-.82+col*.41;b.add('box',s.panel,side*.5,.436,z,length,.047,.397,0,0,-side*slope);b.add('box',s.edge,side*.5,.468,z-.18,length,.023,.024,0,0,-side*slope);
   }
   if(surface==='fiber'){
    b.add('box',s.panel,side*.5,.445,0,length,.03,2,0,0,-side*slope);
    for(const z of[-.84,-.40,.40,.84])b.add('box',s.accent,side*.5,.464,z,length,.013,.045,0,0,-side*slope);
    for(let j=0;j<12;j++)b.add('box',s.edge,side*.86,.142,-.94+j*.171,.043,.015,.018,0,0,-side*slope);
   }
  }
 }
 if(surface!=='diamond'){
  const shape=new THREE.Shape();shape.moveTo(-1,0);shape.lineTo(1,0);shape.lineTo(0,.8);shape.closePath();const cap=new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:false});
  for(const z of[-1,.93]){const g=cap.clone();g.translate(0,0,z);b.geometry(g,s.panel);g.dispose();}cap.dispose();
 }
 for(const z of[-1.015,1.015])for(const side of[-1,1])b.beam(s.edge,[side*.97,.045,z],[0,.80,z],.029);
 b.add('cyl',s.frame,0,.82,0,.044,2.08,.044,Math.PI/2);
}
export function createCraftPiece(kind,material='wood'){
 const surface=styles[material]?material:'wood',key=`${kind}:${surface}`;
 if(!cache.has(key)){
  const b=new CraftBatch(surface),s=styles[surface],moving=[];
  if(kind==='floor'){
   b.add('box',s.frame,0,.025,0,2,.15,2);
   if(surface==='wood')for(let i=0;i<8;i++){b.add('box',i%3?s.panel:'#bd8858',-.875+i*.25,.122,0,.239,.056,1.97);for(const z of[-.83,.83])b.add('cyl',s.frame,-.875+i*.25,.15,z,.016,.001,.016);}
   if(surface==='copper')for(let i=0;i<3;i++)for(let j=0;j<3;j++){b.add('soft',(i+j)%2?s.panel:s.accent,(i-1)*.64,.122,(j-1)*.64,.62,.056,.62);}
   if(surface==='iron'){b.add('box',s.panel,0,.119,0,1.94,.062,1.94);for(let i=-3;i<=3;i++)for(let j=-2;j<=2;j++)b.add('box',s.edge,i*.23,.15,j*.31,.16,.001,.025,0,(i+j)%2?.6:-.6);}
   if(surface==='diamond'){b.add('box',s.panel,0,.119,0,1.95,.062,1.95);for(const x of[-.77,.77])for(const z of[-.77,.77])b.add('box',s.accent,x,.15,z,.16,.001,.16,0,Math.PI/4);for(const q of[-1,1])b.add('box',s.edge,q*.87,.15,0,.023,.001,1.75);}
   if(surface==='fiber'){
    b.add('box',s.panel,0,.123,0,1.93,.054,1.93);for(let i=0;i<15;i++)b.add('box',i%4?s.edge:s.dark,-.9+i*.128,.15,0,.039,.001,1.86);
    for(const z of[-.75,-.60,.60,.75])b.add('box',s.accent,0,.149,z,1.83,.002,.066);
    for(let i=-2;i<=2;i++)b.add('box',s.dark,i*.28,.149,0,.16,.002,.16,0,Math.PI/4);
   }
   for(const q of[-1,1]){b.add('box',s.frame,q*.963,.14,0,.064,.02,2);b.add('box',s.frame,0,.14,q*.963,1.89,.02,.064);}
  }else if(kind==='roof')roof(b,surface);
  else{
   frame(b,surface);
   if(kind==='door'){
    for(const x of[-.75,.75])framedPanel(b,surface,x,1.1,.32,2.18);
    for(const x of[-.60,.60])b.add('soft',s.edge,x,1.04,-1,.12,2.08,.27);
    b.add('soft',s.edge,0,2.145,-1,1.32,.13,.27);
    if(surface==='wood')for(const side of[-1,1]){b.beam(s.edge,[-.47,2.24,-1+side*.135],[0,2.33,-1+side*.135],.018);b.beam(s.edge,[0,2.33,-1+side*.135],[.47,2.24,-1+side*.135],.018);}
    if(surface==='iron')for(const side of[-1,1]){ring(b,s.accent,.77,1.19,-1+side*.16,.11,.019);b.beam(s.edge,[.77,1.08,-1+side*.16],[.77,1.30,-1+side*.16],.012);b.beam(s.edge,[.66,1.19,-1+side*.16],[.88,1.19,-1+side*.16],.012);}
    if(surface==='fiber')for(const x of[-.76,.76]){const cloth=new CraftBatch(surface);clothStrip(cloth,s,0,-.87,0,.21,1.74);cloth.add('box',s.accent,0,-1.03,.025,.22,.058,.023);const g=cloth.finish('craft:cloth');g.position.set(x,2.08,-1.16);moving.push(g);}
   }else if(kind==='window'){
    if(surface==='copper'||surface==='iron')portPanel(b,surface);
    else{
     framedPanel(b,surface,0,.37,1.80,.74);framedPanel(b,surface,0,2.075,1.80,.25);
     for(const x of[-.76,.76])framedPanel(b,surface,x,1.36,.23,1.24);
     for(const x of[-.68,.68])b.add('soft',s.edge,x,1.36,-1,.085,1.30,.26);
     for(const y of[.745,1.985])b.add('soft',s.edge,0,y,-1,1.445,.085,.27);
     if(surface==='diamond')glass(b,0,1.36,-1,1.27,1.16);
     if(surface==='wood'){
      b.add('box',s.edge,0,1.37,-1,.045,1.18,.09);b.add('box',s.edge,0,1.37,-1,1.27,.045,.09);
      for(const x of[-.785,.785]){b.add('box',s.accent,x,1.36,-1.14,.18,1.08,.055);for(const y of[.97,1.24,1.51,1.78])b.add('box',s.edge,x,y,-1.174,.18,.03,.014);}
      b.add('box',s.frame,0,.67,-1.17,1.25,.16,.27);b.add('box',s.panel,0,.71,-1.305,1.29,.04,.02);
      for(let j=0;j<5;j++){const x=(j-2)*.22;b.beam(s.accent,[x,.73,-1.18],[x+.025,.91+(j%2)*.045,-1.19],.012);b.add('ball',j%2?'#eac888':'#c78170',x+.025,.91+(j%2)*.045,-1.19,.048,.047,.036);}
     }
     if(surface==='fiber'){b.add('cyl',s.accent,0,1.965,-1.14,.055,1.27,.055,0,0,Math.PI/2);const cloth=new CraftBatch(surface);clothStrip(cloth,s,0,-.10,0,1.23,.20);const g=cloth.finish('craft:shade');g.position.set(0,1.955,-1.15);moving.push(g);}
    }
   }else{
    framedPanel(b,surface,0,1.16,1.80,2.18);
    if(surface==='wood')for(const side of[-1,1])b.beam(s.frame,[-.78,.23,-1+side*.11],[.78,2.16,-1+side*.11],.042);
    if(surface==='iron')for(const side of[-1,1])b.add('box',s.edge,0,1.16,-1+side*.12,.065,2.08,.021);
   }
  }
  const g=b.finish(`craft-${key}`);for(const child of moving)g.add(child);
  if(kind==='roof'&&surface==='iron'){
   const v=new CraftBatch(surface);v.beam(s.edge,[0,-.09,0],[0,.08,0],.014);v.add('box',s.accent,.065,.04,0,.20,.056,.015);v.add('box',s.edge,-.09,.04,0,.07,.072,.016,0,0,.3);const vane=v.finish('craft:vane');vane.position.set(.66,.58,0);g.add(vane);
  }
  cache.set(key,g);
 }
 const result=cache.get(key).clone(),joints=[];result.traverse(n=>{if(n.name.startsWith('craft:'))joints.push(n);});craftRigs.set(result,joints);return result;
}
export function animateCraftPiece(group,{time=0,wind=0}={}){
 const joints=craftRigs.get(group);if(!joints)return;wind=THREE.MathUtils.clamp(wind,-1,1);
 for(const n of joints){if(n.name==='craft:vane')n.rotation.y=Math.sin(time*.31)*.5+wind*.3;else n.rotation.x=Math.sin(time*1.3+n.position.x)*.045*wind;}
}
let canTemplate;
export function createWateringCan(){
 if(!canTemplate){
  const b=new Batch();
  // Rounded enamel vessel, rolled rim, open handle and a continuous rising spout.
  const profile=[[0,-.23],[.12,-.23],[.19,-.20],[.205,-.12],[.20,.14],[.175,.20],[.142,.21]].map(([x,y])=>new THREE.Vector2(x,y));
  const vessel=new THREE.LatheGeometry(profile,16);b.geometry(vessel,'enamel');vessel.dispose();
  b.add('cyl','enamelDark',0,.194,0,.145,.012,.145);
  const rim=new THREE.TorusGeometry(.156,.015,5,16);rim.rotateX(Math.PI/2);rim.translate(0,.210,0);b.geometry(rim,'cream');rim.dispose();
  b.add('cyl','enamelDark',0,-.219,0,.15,.022,.15);
  const handlePath=new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.10,.18),new THREE.Vector3(0,-.08,.31),new THREE.Vector3(0,.20,.34),new THREE.Vector3(0,.34,.20),new THREE.Vector3(0,.28,0)]);
  const handle=new THREE.TubeGeometry(handlePath,14,.026,6,false);b.geometry(handle,'enamelDark');handle.dispose();
  b.beam('cream',[0,.278,.035],[0,.319,.16],.029);
  const spoutPath=new THREE.CatmullRomCurve3([new THREE.Vector3(-.11,-.11,-.08),new THREE.Vector3(-.21,-.08,-.13),new THREE.Vector3(-.30,.12,-.20),new THREE.Vector3(-.36,.225,-.265)]);
  const spout=new THREE.TubeGeometry(spoutPath,10,.036,8,false);b.geometry(spout,'copper');spout.dispose();
  const rose=new THREE.Vector3(-.371,.242,-.276),direction=new THREE.Vector3(-.4,.7,-.6).normalize();
  t.position.copy(rose);t.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);t.scale.set(.084,.035,.084);t.updateMatrix();b.geometry(G.cyl,'cream',t.matrix);
  const face=rose.clone().addScaledVector(direction,.019),rotation=t.quaternion.clone();
  for(let i=0;i<9;i++){const a=i*Math.PI*2/8,r=i===8?0:.051,point=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r).applyQuaternion(rotation).add(face);t.position.copy(point);t.quaternion.copy(rotation);t.scale.set(.007,.003,.007);t.updateMatrix();b.geometry(G.cyl,'enamelDark',t.matrix);}
  for(const side of [-1,1]){
   b.add('ball','cream',side*.197,-.015,0,.005,.09,.073);
   b.beam('enamelDark',[side*.205,-.065,0],[side*.205,.046,0],.007);
   for(const q of [-1,1])b.add('ball','enamelDark',side*.207,.005+q*.026,q*.029,.005,.014,.030,q*.5);
  }
  canTemplate=b.finish('tool-watering-can');canTemplate.userData.spout=face.toArray();
 }
 return canTemplate.clone();
}
