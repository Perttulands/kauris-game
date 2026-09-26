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
const styles={wood:{frame:'woodDark',panel:'woodLight',edge:'cream'},copper:{frame:'copperDark',panel:'patina',edge:'copper'},iron:{frame:'ironDark',panel:'ironInset',edge:'ironLight'},diamond:{frame:'diamondDark',panel:'diamond',edge:'diamondLight'}};
const cache=new Map();
function crystalPanel(b,x,y,w,h,z,side){
 // Broad bevel planes form the material; there is no glass-sorting dependency.
 const vertices=[],colors=[],base=new THREE.Color(M.diamond.color),light=new THREE.Color(M.diamondLight.color),blue=new THREE.Color(M.diamondBlue.color);
 const corners=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]],inner=corners.map(([u,v])=>[u*.82,v*.88]);
 const triangle=(a,c,d,color)=>{vertices.push(...a,...c,...d);for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);};
 for(let i=0;i<4;i++){const j=(i+1)%4,a=[x+corners[i][0],y+corners[i][1],z],c=[x+corners[j][0],y+corners[j][1],z],d=[x+inner[i][0],y+inner[i][1],z+side*.025],e=[x+inner[j][0],y+inner[j][1],z+side*.025];triangle(a,c,d,i%2?base:light);triangle(c,e,d,i%2?base:light);triangle(d,e,[x,y,z+side*.045],i%2?blue:base);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 // Vertex-color facet geometry is merged separately from ordinary trim.
 if(!M.facet)M.facet=new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,roughness:.30,metalness:.18,side:THREE.DoubleSide,flatShading:true});
 b.geometry(geometry,'facet');geometry.dispose();
}
function panel(b,kind,x,y,w,h){
 const s=styles[kind];
 b.add('box',s.panel,x,y,-1,w,h,.14);
 for(const side of [-1,1]){
  const z=-1+side*.074;
  if(kind==='wood'){
   const count=Math.max(1,Math.round(h/.26));for(let row=0;row<count;row++){
    const yy=y-h/2+(row+.5)*h/count;
    b.add('soft',row%3?'woodLight':'wood',x,yy,z,w-.015,h/count-.016,.025);
    if(w>.5){b.add('box','grain',x+(row%2?-.12:.1)*w,yy-.026,z+side*.014,w*.42,.008,.003);b.add('box','grain',x+(row%2?.20:-.18)*w,yy+.047,z+side*.014,w*.23,.006,.003);}
   }
  }else if(kind==='copper'){
   const nx=Math.max(1,Math.round(w/.60)),ny=Math.max(1,Math.round(h/.60));
   for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
    const xx=x-w/2+(i+.5)*w/nx,yy=y-h/2+(j+.5)*h/ny;
    b.add('soft',(i+j)%3?'patina':'patinaLight',xx,yy,z,w/nx-.025,h/ny-.026,.027);
    b.add('box','copper',xx-w/nx/2+.018,yy,z+side*.020,.032,h/ny,.028);
    if(w/nx>.26)b.add('soft','copper',xx+w/nx*.25,yy+h/ny*.30,z+side*.02,w/nx*.18,h/ny*.07,.011,0,0,.1);
   }
  }else if(kind==='iron'){
   const count=Math.max(1,Math.round(h/.68));for(let i=0;i<count;i++){
    const yy=y-h/2+(i+.5)*h/count;
    b.add('soft','ironDark',x,yy,z,w-.024,h/count-.027,.024);
    b.add('soft','ironInset',x,yy,z+side*.012,Math.max(.05,w-.10),Math.max(.05,h/count-.10),.027);
    if(w>.5)b.add('box','ironLight',x,yy-h/count*.27,z+side*.028,w*.70,.018,.009);
    for(const sx of [-1,1])b.add('cyl','ironLight',x+sx*(w/2-.038),yy,z+side*.034,.018,.012,.018,Math.PI/2);
   }
  }else{
   const count=Math.max(1,Math.round(h/.64));for(let i=0;i<count;i++)crystalPanel(b,x,y-h/2+(i+.5)*h/count,w-.027,h/count-.027,z,side);
  }
 }
}
function wallFrame(b,kind){const s=styles[kind];for(const x of [-.91,.91])b.add('soft',s.frame,x,1.2,-1,.18,2.4,.23);b.add('soft',s.frame,0,2.3,-1,2,.2,.25);
 for(const side of [-1,1])for(const x of [-.91,.91]){
  if(kind==='wood')for(const y of [.24,2.27])b.add('cyl','woodLight',x,y,-1+side*.122,.024,.008,.024,Math.PI/2);
  if(kind==='copper')b.add('box','copper',x,1.23,-1+side*.122,.045,2.17,.018);
  if(kind==='iron')for(const y of [.22,1.2,2.26]){b.add('soft','iron',x,y,-1+side*.123,.176,.16,.02);b.add('cyl','ironLight',x,y,-1+side*.14,.024,.013,.024,Math.PI/2);}
  if(kind==='diamond')crystalPanel(b,x,1.25,.115,2.12,-1+side*.12,side);
 }
}
export function createCraftPiece(kind,material='wood'){
 const surface=styles[material]?material:'wood',key=`${kind}:${surface}`;if(cache.has(key))return cache.get(key).clone();
 const b=new Batch(),s=styles[surface];
 if(kind==='floor'){
  b.add('box',s.frame,0,.033,0,2,.126,2);
  if(surface==='wood')for(let i=0;i<8;i++){const x=-.875+i*.25;b.add('soft',i%3?'wood':'woodLight',x,.116,0,.239,.068,1.97);for(const z of [-.84,.84])b.add('cyl','woodDark',x,.149,z,.017,.002,.017);}
  else if(surface==='copper')for(let i=0;i<3;i++)for(let j=0;j<3;j++){const x=(i-1)*.65,z=(j-1)*.65;b.add('soft',(i+j)%3?'patina':'patinaLight',x,.122,z,.627,.056,.627);b.add('box','copper',x-.32,.143,z,.018,.014,.65);}
  else if(surface==='iron')for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=(i-.5)*.97,z=(j-.5)*.97;b.add('soft','iron',x,.121,z,.94,.058,.94);for(let k=-2;k<=2;k++)b.add('box','ironLight',x+k*.14,.149,z,.055,.002,.54,0,.55);}
  else{
   b.add('box','diamondLight',0,.116,0,1.95,.068,1.95);
   for(let i=0;i<3;i++)for(let j=0;j<3;j++){const x=(i-1)*.58,z=(j-1)*.58;b.add('soft',(i+j)%2?'diamond':'diamondBlue',x,.139,z,.40,.022,.40,0,Math.PI/4);}
   for(const side of [-1,1]){b.add('box','diamondDark',side*.91,.144,0,.04,.012,1.86);b.add('box','diamondDark',0,.144,side*.91,1.86,.012,.04);}
  }
 }else if(kind==='roof'){
  const slope=Math.atan2(.8,1),length=Math.hypot(1,.8);
  for(const side of [-1,1]){
   b.add('box',s.frame,side*.5,.4,0,length+.10,.10,2.10,0,0,-side*slope);
   if(surface==='wood'||surface==='diamond')for(let row=0;row<4;row++)for(let col=0;col<5;col++){
    const u=(row+.5)/4,z=-.82+col*.41;
    b.add('soft',surface==='wood'?(row%2?'roof':'roofLight'):(row+col)%3?'diamond':'diamondLight',side*u,.825-u*.8,z,length/4-.012,.077,.399,0,0,-side*slope);
    if(surface==='diamond')b.add('soft','diamondBlue',side*u,.858-u*.8,z,length/4*.46,.024,.28,0,0,-side*slope);
   }else for(let col=0;col<5;col++){
    const z=-.82+col*.41;b.add('soft',surface==='copper'?(col%3?'patina':'patinaLight'):'iron',side*.5,.432,z,length,.067,.398,0,0,-side*slope);
    b.add('box',surface==='copper'?'copper':'ironLight',side*.5,.476,z-.18,length,.035,.024,0,0,-side*slope);
   }
  }
  const outline=new THREE.Shape();outline.moveTo(-1,0);outline.lineTo(1,0);outline.lineTo(0,.8);outline.closePath();const cap=new THREE.ExtrudeGeometry(outline,{depth:.08,bevelEnabled:false});
  for(const z of [-1,.92]){t.position.set(0,0,z);t.rotation.set(0,0,0);t.scale.set(1,1,1);t.updateMatrix();b.geometry(cap,s.panel,t.matrix);for(const side of [-1,1])b.beam(s.edge,[side*.92,.04,z+.04],[0,.77,z+.04],.037);}
  cap.dispose();b.add('cyl',s.edge,0,.85,0,.077,2.12,.077,Math.PI/2);
 }else{
  wallFrame(b,surface);
  if(kind==='door'){
   for(const x of [-.75,.75])panel(b,surface,x,1.10,.32,2.18);
   for(const x of [-.60,.60])b.add('soft',s.edge,x,1.04,-1,.12,2.08,.28);
   b.add('soft',s.edge,0,2.145,-1,1.32,.13,.28);
   for(const side of [-1,1]){if(surface==='copper')b.add('ball','copper',0,2.25,-1+side*.142,.068,.047,.014);if(surface==='diamond')crystalPanel(b,0,2.25,.22,.09,-1+side*.132,side);}
  }else if(kind==='window'){
   panel(b,surface,0,.39,1.80,.78);panel(b,surface,0,2.065,1.80,.25);for(const x of [-.75,.75])panel(b,surface,x,1.36,.32,1.16);
   for(const x of [-.57,.57])b.add('soft',s.edge,x,1.37,-1,.10,1.18,.28);for(const y of [.81,1.93])b.add('soft',s.edge,0,y,-1,1.24,.12,.28);
   b.add('box',s.edge,0,1.37,-1,.045,1.06,.10);
   if(surface==='wood')b.add('box','cream',0,1.37,-1,1.06,.045,.1);
   if(surface==='diamond')for(const side of [-1,1])b.beam('diamondLight',[0,.88,-1+side*.02],[side*.48,1.37,-1+side*.02],.021);
   for(const side of [-1,1])b.add('soft',s.frame,0,.76,-1+side*.07,1.34,.10,.33);
  }else{
   panel(b,surface,0,1.16,1.80,2.18);b.add('soft',s.frame,0,.13,-1,1.86,.16,.25);
   if(surface==='wood')for(const side of [-1,1])b.beam('woodDark',[-.79,.24,-1+side*.11],[.79,2.17,-1+side*.11],.046);
   if(surface==='iron')for(const side of [-1,1])b.add('box','ironLight',0,1.16,-1+side*.126,.08,2.1,.026);
  }
 }
 const g=b.finish(`craft-${key}`);cache.set(key,g);return g.clone();
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
