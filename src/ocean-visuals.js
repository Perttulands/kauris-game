import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Marine assets use only the caller's terrain heights. No collision or water surface here.
const M={};
for(const [name,color]of Object.entries({sand:'#c7d4b3',sandLight:'#e5e1bd',stone:'#557e78',stoneLight:'#81a099',coral:'#df9982',coralTip:'#f4c8a3',violet:'#a48aaf',violetTip:'#d3bacd',ochre:'#d3b269',kelp:'#468c78',kelpLight:'#7db590',shell:'#ead7ba',shellShade:'#b7a59a',fish:'#e6b660',fishLight:'#fff0bf',fishBlue:'#62b9b6',fishDark:'#397781',eye:'#263e42'}))M[name]=new THREE.MeshStandardMaterial({color,roughness:name.startsWith('fish')?.52:.88,flatShading:true});
M.kelp.side=THREE.DoubleSide;M.kelpLight.side=THREE.DoubleSide;
const G={rock:new THREE.IcosahedronGeometry(1,1),rough:new THREE.IcosahedronGeometry(1,0),cyl:new THREE.CylinderGeometry(1,1,1,7),cone:new THREE.ConeGeometry(1,1,8)};
const xform=new THREE.Object3D();
class Batch{
 constructor(){this.parts=new Map();}
 geometry(geometry,mat,matrix){const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.deleteAttribute('uv');if(matrix)g.applyMatrix4(matrix);const m=M[mat];if(!this.parts.has(m))this.parts.set(m,[]);this.parts.get(m).push(g);}
 add(shape,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){xform.position.set(x,y,z);xform.rotation.set(rx,ry,rz);xform.scale.set(sx,sy,sz);xform.updateMatrix();this.geometry(G[shape],mat,xform.matrix);}
 beam(mat,a,b,r1,r2=r1){const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b);const g=new THREE.CylinderGeometry(r2,r1,p.distanceTo(q),7);xform.position.copy(p).add(q).multiplyScalar(.5);xform.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.clone().sub(p).normalize());xform.scale.set(1,1,1);xform.updateMatrix();this.geometry(g,mat,xform.matrix);g.dispose();}
 finish(name,painted=false){
  const group=new THREE.Group();group.name=name;
  if(painted){
   const pieces=[];for(const [mat,parts]of this.parts)for(const g of parts){const colors=[];for(let i=0;i<g.attributes.position.count;i++)colors.push(mat.color.r,mat.color.g,mat.color.b);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));pieces.push(g);}
   const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());if(!M.fishPaint)M.fishPaint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.57,flatShading:true});group.add(new THREE.Mesh(geometry,M.fishPaint));
  }else for(const [mat,parts]of this.parts){const g=mergeGeometries(parts,false);parts.forEach(x=>x.dispose());const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);}
  return group;
 }
}
function triangles(b,mat,vertices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();b.geometry(g,mat);g.dispose();}
function coral(b,x,y,z,size,variant){
 const mat=variant%2?'violet':'coral',tipMat=variant%2?'violetTip':'coralTip';
 b.add('rough','stone',x,y+.06,z,size*.43,.12,size*.36,0,variant);
 const trunk=[x+.04,y+size*.54,z];b.beam(mat,[x,y,z],trunk,size*.105,size*.062);
 for(let i=0;i<5;i++){
  const a=i*2.399+variant,base=[x+.02,y+size*(.20+i*.064),z],joint=[x+Math.cos(a)*size*.26,y+size*(.54+i*.065),z+Math.sin(a)*size*.26];
  b.beam(mat,base,joint,size*.063,size*.039);
  for(const side of [-1,1]){const end=[joint[0]+Math.cos(a+side*.75)*size*.15,joint[1]+size*(.22+(i%2)*.1),joint[2]+Math.sin(a+side*.75)*size*.15];b.beam(mat,joint,end,size*.043,size*.022);b.add('rock',tipMat,...end,size*.034,size*.046,size*.034);}
 }
}
function cup(b,x,y,z,size,variant){
 const points=[[0,0],[.30,.02],[.31,.24],[.44,.56],[.52,.64],[.45,.67],[.38,.59],[.26,.27],[.21,.10],[0,.08]].map(([r,h])=>new THREE.Vector2(r*size,h*size));
 const g=new THREE.LatheGeometry(points,9);xform.position.set(x,y,z);xform.rotation.set(.12,variant,.10);xform.scale.set(1,1,1);xform.updateMatrix();b.geometry(g,variant%2?'ochre':'violet',xform.matrix);g.dispose();
 b.add('rock',variant%2?'coralTip':'violetTip',x,y+.13,z,size*.15,.06,size*.15);
}
function kelp(b,x,y,z,h,phase){
 const points=[];for(let i=0;i<8;i++){const t=i/7;points.push([x+Math.sin(t*3.4+phase)*h*.12*t,y+h*t,z+Math.cos(t*3+phase)*h*.10*t]);}
 for(let i=0;i<7;i++){
  b.beam('kelp',points[i],points[i+1],.018,.011);
  const p=points[i+1],side=i%2?1:-1,w=h*(.10-.007*i),a=phase+side*.7;
  const vertices=[],end=[p[0]+Math.cos(a)*w*2,p[1]+h*.13,p[2]+Math.sin(a)*w*2];
  const c=[(p[0]+end[0])/2,p[1]+h*.05,(p[2]+end[2])/2],l=[c[0]-Math.sin(a)*w*.45,c[1]+.02,c[2]+Math.cos(a)*w*.45],r=[c[0]+Math.sin(a)*w*.45,c[1]-.02,c[2]-Math.cos(a)*w*.45];
  vertices.push(...p,...l,...end,...p,...end,...r);triangles(b,i%3?'kelp':'kelpLight',vertices);
 }
}
function scallop(b,x,y,z,r,angle){
 // A ribbed, cupped scallop rather than a generic faceted rock.
 const vertices=[],ribs=12,steps=5,point=(a,t)=>[x+Math.sin(a)*r*t,y+.12+Math.sin(t*Math.PI)*r*.12+Math.pow(t,2)*r*.14,z+Math.cos(a)*r*t];
 for(let i=0;i<ribs;i++)for(let j=0;j<steps;j++){
  const a=angle-.98+i*1.96/ribs,c=angle-.98+(i+1)*1.96/ribs,t=j/steps,u=(j+1)/steps;
  const p=point(a,t),q=point(c,t),s=point(a,u),v=point(c,u);vertices.push(...p,...q,...s,...q,...v,...s);
 }
 triangles(b,'shell',vertices);
 for(let i=0;i<=ribs;i++){const a=angle-.98+i*1.96/ribs;let previous=point(a,0);for(let j=1;j<=steps;j++){const next=point(a,j/steps);b.beam(i%3?'shellShade':'coralTip',previous,next,.008*r);previous=next;}}
}
export function createOceanWorld({terrain,heightAt}){
 if(!terrain||typeof heightAt!=='function')throw new TypeError('Ocean visuals require authoritative terrain and heightAt');
 const root=new THREE.Group();root.name='shell-garden-ocean';
 // Continuous sand mesh, exactly sampled on the authoritative ramp and flat seabed.
 const positions=[],colors=[],c0=new THREE.Color('#b7c9ac'),c1=new THREE.Color('#e0ddba');
 const nx=54,nz=Math.ceil((terrain.maxZ-terrain.shoreStart)*2);
 const vertex=(ix,iz)=>{const x=terrain.minX+(terrain.maxX-terrain.minX)*ix/nx,z=terrain.shoreStart+(terrain.maxZ-terrain.shoreStart)*iz/nz;return [x,heightAt(x,z),z];};
 for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
  const a=vertex(ix,iz),b=vertex(ix+1,iz),c=vertex(ix,iz+1),d=vertex(ix+1,iz+1);
  for(const p of [a,c,b,b,c,d]){positions.push(...p);const patch=.53+.17*Math.sin(p[0]*.33+Math.sin(p[2]*.2))+.10*Math.cos(p[2]*.47-p[0]*.14),color=c0.clone().lerp(c1,patch);colors.push(color.r,color.g,color.b);}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
 const ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.name='ocean-ground';ground.receiveShadow=true;root.add(ground);
 const b=new Batch();let seed=78912;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const padClear=(x,z,r=0)=>!terrain.pads.some(p=>x+r>p.minGX*2-1&&x-r<p.maxGX*2+1&&z+r>p.minGZ*2-1&&z-r<p.maxGZ*2+1);
 // Reef beds form two banks flanking the house clearing and its open sand approach.
 for(const side of [-1,1])for(let row=0;row<9;row++){
  const x=side*(15.4+random()*5.4),z=35.5+row*3.2,y=heightAt(x,z),scale=.9+random()*1.0;
  if(!padClear(x,z,2.2))continue;
  b.add('rock','stone',x,y+.19,z,scale*1.5,.38+scale*.12,scale,0,row*.71,.08);
  b.add('rough','stoneLight',x+.35,y+.34,z,scale,.22,scale*.65,0,row);
  coral(b,x-.25,y+.45,z,scale*.81,row);
  cup(b,x+scale*.65,y+.08,z+.48,.60+random()*.35,row);
  for(let k=0;k<3;k++){const xx=x+side*(1.0+k*.48),zz=z+(random()-.5)*1.7;kelp(b,xx,heightAt(xx,zz),zz,1.2+random()*1.9,row+k*.71);}
  if(row%2===0)scallop(b,x-side*1.55,heightAt(x-side*1.55,z),z,.44,row*.77);
 }
 // Smaller coral fingers establish a gradual shallows-to-reef transition.
 for(let i=0;i<34;i++){
  const x=(random()-.5)*48,z=terrain.shoreStart+2+random()*13;if(Math.abs(x)<4)continue;
  const y=heightAt(x,z);if(y>terrain.waterY-.6)continue;
  if(i%3===0)coral(b,x,y,z,.35+random()*.55,i);else if(i%3===1)scallop(b,x,y,z,.28+random()*.26,i);else kelp(b,x,y,z,.35+random()*.55,i);
 }
 // Shell crown landmark: ribs curve over a generous open arch, joined to planted bases.
 const rx=terrain.reef.x,rz=terrain.reef.z+2,base=heightAt(rx,rz);
 for(const side of [-1,1]){
  b.add('rock','stone',rx+side*3.6,base+.34,rz,1.6,.68,1.25,0,side*.3);
  b.add('rough','shellShade',rx+side*3.1,base+.80,rz,.80,1.12,.65,0,side*.25);
  coral(b,rx+side*4.3,base+.25,rz-1.0,1.55,side+2);
  cup(b,rx+side*3.3,base+.12,rz-1.55,.9,side+2);
  for(let j=0;j<3;j++)kelp(b,rx+side*(5.0+j*.38),base,rz+j*.50,1.9+j*.31,j+side);
 }
 for(let rib=0;rib<7;rib++){
  const depth=(rib-3)*.18,wide=3.18+Math.abs(rib-3)*.065,height=3.55-Math.abs(rib-3)*.13;
  let previous;for(let i=0;i<=18;i++){
   const a=Math.PI*i/18,p=[rx+Math.cos(a)*wide,base+.65+Math.sin(a)*height,rz+depth+Math.sin(a)*.38];
   if(previous)b.beam(rib%2?'shell':'shellShade',previous,p,rib===3?.16:.085);previous=p;
  }
 }
 // Sandy shell stepping motifs lead through the arch; never raised enough to hide a floor.
 for(let i=0;i<5;i++)scallop(b,rx+Math.sin(i*1.9)*.9,base-.07,rz-2+i*.58,.35+i*.027,.25);
 root.add(b.finish('reef-beds-and-shell-crown'));return root;
}
const fishTemplates=new Map(),fishRigs=new WeakMap();
function fin(parts,mat,points){const vertices=[];for(let i=1;i<points.length-1;i++)vertices.push(...points[0],...points[i],...points[i+1],...points[0],...points[i+1],...points[i]);triangles(parts,mat,vertices);}
export function createMarineAnimal(kind='fish',variant=0){
 const v=Math.abs(Math.trunc(variant)||0)%3,key=`${kind}:${v}`;
 if(!fishTemplates.has(key)){
  const root=new THREE.Group();root.name=`marine-${key}`;const b=new Batch(),main=v===1?'fishBlue':'fish',stripe=v===1?'fishDark':'fishLight';
  b.add('rock',main,0,0,.025,.085,v===2?.12:.105,.205);
  b.add('rock','fishLight',0,-.038,.075,.072,.060,.145);
  b.add('rock',main,0,.003,.188,.068,.066,.063);
  b.add('rock','coralTip',0,-.010,.244,.025,.020,.015);
  for(const side of [-1,1]){
   b.add('rock','fishLight',side*.057,.035,.164,.017,.029,.029);
   b.add('rock','eye',side*.068,.036,.171,.010,.018,.018);
   b.add('rock','shell',side*.074,.045,.177,.003,.005,.005);
   b.beam(stripe,[side*.068,.046,.103],[side*.072,-.043,.106],.005);
   for(let j=0;j<3;j++)b.add('rough',stripe,side*(.078-j*.008),.004,-.022-j*.050,.008,.070-j*.007,.013,0,side*.12,.15);
  }
  fin(b,main,[[0,.068,.10],[0,.172,-.016],[0,.129,-.126],[0,.048,-.164]]);
  fin(b,stripe,[[0,-.063,.045],[0,-.137,-.078],[0,-.050,-.128]]);
  root.add(b.finish('fish-body',true));
  const tail=new THREE.Group();tail.name='fish-tail';tail.position.z=-.14;const tailParts=new Batch();tailParts.add('rock',main,0,0,-.025,.038,.052,.065);
  fin(tailParts,main,[[0,0,-.027],[0,.105,-.151],[0,.030,-.134],[0,0,-.10],[0,-.038,-.143],[0,-.104,-.154]]);
  tailParts.beam(stripe,[0,0,-.054],[0,.085,-.139],.004);tailParts.beam(stripe,[0,0,-.054],[0,-.084,-.141],.004);tail.add(tailParts.finish('fish-tail-fin',true));root.add(tail);
  for(const side of [-1,1]){const f=new THREE.Group();f.name=side<0?'fish-left-fin':'fish-right-fin';f.position.set(side*.057,-.024,.077);const p=new Batch();fin(p,stripe,[[0,0,0],[side*.075,-.035,-.010],[side*.068,-.044,-.069],[0,0,-.046]]);f.add(p.finish('pectoral',true));root.add(f);}
  fishTemplates.set(key,root);
 }
 const root=fishTemplates.get(key).clone();fishRigs.set(root,{tail:root.getObjectByName('fish-tail'),left:root.getObjectByName('fish-left-fin'),right:root.getObjectByName('fish-right-fin')});return root;
}
export function animateMarineAnimal(group,{time=0,swim=1}={}){
 const r=fishRigs.get(group);if(!r)return;const t=Number.isFinite(time)?time:0,s=THREE.MathUtils.clamp(Number.isFinite(swim)?swim:0,0,1);
 r.tail.rotation.y=Math.sin(t*(4+3*s))*(.12+.23*s);r.left.rotation.z=.15+Math.sin(t*5)*.27;r.right.rotation.z=-.15-Math.sin(t*5)*.27;
}
