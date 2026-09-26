import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {convexSolid} from './reef-collision.js';

// Marine assets sample caller terrain; exact hard geometry supplies lead-owned collision.
// Water and actor motion remain runtime-owned; soft planting has no collision.
const M={};
for(const [name,color]of Object.entries({sand:'#c7d4b3',sandLight:'#e5e1bd',stone:'#557e78',stoneLight:'#81a099',coral:'#df9982',coralTip:'#f4c8a3',violet:'#a48aaf',violetTip:'#d3bacd',ochre:'#d3b269',kelp:'#468c78',kelpLight:'#7db590',shell:'#ead7ba',shellShade:'#b7a59a',fish:'#e6b660',fishLight:'#fff0bf',fishBlue:'#62b9b6',fishDark:'#397781',eye:'#263e42'}))M[name]=new THREE.MeshStandardMaterial({color,roughness:name.startsWith('fish')?.52:.88,flatShading:true});
M.kelp.side=THREE.DoubleSide;M.kelpLight.side=THREE.DoubleSide;
const G={rock:new THREE.IcosahedronGeometry(1,1),rough:new THREE.IcosahedronGeometry(1,0),cyl:new THREE.CylinderGeometry(1,1,1,7),cone:new THREE.ConeGeometry(1,1,8)};
const xform=new THREE.Object3D();
class Batch{
 constructor(){this.parts=new Map();}
 geometry(geometry,mat,matrix){const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.deleteAttribute('uv');if(matrix)g.applyMatrix4(matrix);const m=M[mat];if(!this.parts.has(m))this.parts.set(m,[]);this.parts.get(m).push(g);return g;}
 add(shape,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){xform.position.set(x,y,z);xform.rotation.set(rx,ry,rz);xform.scale.set(sx,sy,sz);xform.updateMatrix();return this.geometry(G[shape],mat,xform.matrix);}
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
 // Bent fans, upright fingers and low spreading antlers share one rooted skeleton.
 // Unequal limbs replace the repeated radial Y-forks, with no extra colonies.
 const family=Math.abs(variant)%3,angle=variant*.87;
 const point=(u,v,w)=>[x+size*(Math.cos(angle)*u-Math.sin(angle)*w),y+size*v,z+size*(Math.sin(angle)*u+Math.cos(angle)*w)];
 const spine=[[0,0,0],[.07,.27,.025],[-.035,.53,.07],[.08,family===2?.70:.86,.10]];
 for(let j=0;j<3;j++)b.beam(mat,point(...spine[j]),point(...spine[j+1]),size*(.13-j*.027),size*(.103-j*.025));
 for(let i=0;i<5;i++){
  const a=i*2.399+variant,start=spine[i<2?1:2];
  const tip=family===0?[(i-2)*.265,.70+.13*Math.sin(i*1.7)+.14*(2-Math.abs(i-2)),.09*Math.sin(i*2.1)]:
   family===1?[Math.cos(a)*(.27+i*.025),.65+i*.085,Math.sin(a)*.33]:
   [Math.cos(a)*(.43+i*.022),.46+.14*(i%3),Math.sin(a)*.42];
  const elbow=[start[0]+(tip[0]-start[0])*.58,start[1]+(tip[1]-start[1])*.29,tip[2]*.62];
  const shoulder=[tip[0]*.96,tip[1]-(family===1?.17:.105),tip[2]+.025];
  const width=size*(family===1?.091:.070)*(1-.055*i);
  b.beam(mat,point(...start),point(...elbow),width*1.19,width);
  b.beam(mat,point(...elbow),point(...shoulder),width,width*.74);
  b.beam(tipMat,point(...shoulder),point(...tip),width*.74,width*.55);
  b.add('rock',tipMat,...point(...tip),width*.55,width*.61,width*.55,0,a);
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
  const p=point(a,t),q=point(c,t),s=point(a,u),v=point(c,u);vertices.push(...p,...s,...q,...q,...s,...v);
 }
 triangles(b,'shell',vertices);
 for(let i=0;i<=ribs;i++){const a=angle-.98+i*1.96/ribs;let previous=point(a,0);for(let j=1;j<=steps;j++){const next=point(a,j/steps);b.beam(i%3?'shellShade':'coralTip',previous,next,.008*r);previous=next;}}
}
export function createOceanWorld({terrain,heightAt}){
 if(!terrain||typeof heightAt!=='function')throw new TypeError('Ocean visuals require authoritative terrain and heightAt');
 const root=new THREE.Group();root.name='shell-garden-ocean';
 const reefSolids=[];
 // Continuous terrain extends into visual-only distance; reachable heights stay exact.
 const positions=[],colors=[],c0=new THREE.Color('#90ac98'),c1=new THREE.Color('#e5d4a9');
 const xs=[],zs=[];
 for(let x=terrain.minX-64;x<terrain.minX;x+=4)xs.push(x);
 for(let i=0;i<=54;i++)xs.push(terrain.minX+(terrain.maxX-terrain.minX)*i/54);
 for(let x=terrain.maxX+4;x<=terrain.maxX+64;x+=4)xs.push(x);
 for(let z=terrain.shoreStart;z<terrain.shoreEnd;z+=.5)zs.push(z);
 for(let z=terrain.shoreEnd;z<=terrain.maxZ+18;z++)zs.push(z);
 for(let z=terrain.maxZ+22;z<=terrain.maxZ+94;z+=4)zs.push(z);
 const vertex=(ix,iz)=>[xs[ix],heightAt(xs[ix],zs[iz]),zs[iz]];
 for(let iz=0;iz<zs.length-1;iz++)for(let ix=0;ix<xs.length-1;ix++){
  const a=vertex(ix,iz),b=vertex(ix+1,iz),c=vertex(ix,iz+1),d=vertex(ix+1,iz+1);
  for(const p of [a,c,b,b,c,d]){
   positions.push(...p);
   const channel=Math.exp(-Math.pow((p[0]-Math.sin(p[2]*.13)*2.4)/5.5,2));
   const patch=.28+.19*Math.sin(p[0]*.34+Math.sin(p[2]*.19)*1.8)+.14*Math.cos(p[2]*.37-p[0]*.17);
   const color=c0.clone().lerp(c1,THREE.MathUtils.clamp(patch+channel*.58,0,1));colors.push(color.r,color.g,color.b);
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
 const sandMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
 sandMaterial.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 reefSandPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nreefSandPosition=position.xz;');
  shader.fragmentShader='varying vec2 reefSandPosition;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 sandP=reefSandPosition;
   float sandPatch=sin(sandP.x*.39+sin(sandP.y*.21)*1.7)+.65*cos(sandP.y*.48-sandP.x*.14);
   float sandPhase=sandP.y*6.6+sin(sandP.y*.34+sandP.x*.18)*2.8+sin(sandP.x*.47)*3.1+sin(sandP.x*.19-sandP.y*.15)*2.2;
   float sandAA=1.0-smoothstep(.4,3.2,fwidth(sandPhase));
   float sandRidge=pow(.5+.5*sin(sandPhase),7.0)*sandAA*smoothstep(-.65,.7,sandPatch);
   float sandBed=.5+.5*sin(sandP.x*.77+sin(sandP.y*.29)*1.8);
   diffuseColor.rgb*=1.0-.13*sandRidge-.045*sandBed;
  `);
 };
 sandMaterial.customProgramCacheKey=()=> 'kauris-reef-sand-ripples-v2';
 const ground=new THREE.Mesh(geo,sandMaterial);ground.name='ocean-ground';ground.receiveShadow=true;root.add(ground);
 const b=new Batch();let seed=78912;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // Batch.add returns the exact transformed copy later merged into the rendered mesh.
 const addRock=(shape,mat,...args)=>{const geometry=b.add(shape,mat,...args);reefSolids.push(convexSolid(Array.from(geometry.attributes.position.array)));};
 const padClear=(x,z,r=0)=>!terrain.pads.some(p=>x+r>p.minGX*2-1&&x-r<p.maxGX*2+1&&z+r>p.minGZ*2-1&&z-r<p.maxGZ*2+1);
 // Reef beds form two banks flanking the house clearing and its open sand approach.
 for(const side of [-1,1])for(let row=0;row<9;row++){
  const x=side*(15.4+random()*5.4),z=35.5+row*3.2,y=heightAt(x,z),scale=.9+random()*1.0;
  if(!padClear(x,z,2.2))continue;
  addRock('rock','stone',x,y+.19,z,scale*1.5,.38+scale*.12,scale,0,row*.71,.08);
  addRock('rough','stoneLight',x+.35,y+.34,z,scale,.22,scale*.65,0,row);
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
 // Foreground-facing reef terraces sit BEHIND the pad, in the arrival view.
 const rx=terrain.reef.x,rz=terrain.reef.z+2,base=heightAt(rx,rz);
 for(const side of [-1,1])for(let bed=0;bed<3;bed++){
  const x=rx+side*(5.15+bed*3.20),z=terrain.pads.reduce((n,p)=>Math.max(n,p.maxGZ*2+1),0)+2.35+bed*1.05,y=heightAt(x,z),rise=bed===1?1.42:.95;
  addRock('rock','stone',x,y+.35,z,2.12,.75,1.29,0,side*.24);
  addRock('rough','stoneLight',x-side*.25,y+.85,z+.30,1.61,.44,.94,.10,bed*.55,.08);
  addRock('rock','stone',x+side*.33,y+rise,z+.59,1.12,.48,.76,0,side*.7);
  // Branching coral, layered plate coral and upright cups form distinct masses.
  coral(b,x-side*.75,y+.84,z-.12,1.8+bed*.22,bed+(side>0?1:0));
  coral(b,x+side*.57,y+rise+.31,z+.63,1.35+bed*.24,bed+(side<0?1:0));
  cup(b,x+side*.71,y+.19,z-.71,1.20,bed);
  cup(b,x+side*1.20,y+.16,z-.32,.85,bed+1);
  for(let tier=0;tier<3;tier++){
   const plate=new THREE.CylinderGeometry(.83-tier*.14,.68-tier*.12,.075,13);
   const phase=bed*1.83+side*.72+tier*1.17;
   const attr=plate.attributes.position;for(let i=0;i<attr.count;i++){
    const px=attr.getX(i),pz=attr.getZ(i),a=Math.atan2(pz,px),r=Math.hypot(px,pz);
    const edge=1+.17*Math.sin(a*3+phase)+.085*Math.cos(a*5-phase);
    attr.setXYZ(i,px*edge,attr.getY(i)+r*(.065*Math.cos(a*3+phase)+.11*Math.sin(a+phase)),pz*edge);
   }
   plate.computeVertexNormals();xform.position.set(x-side*.22+Math.sin(phase)*.19,y+.73+tier*(bed===1?.19:.28),z-.71+Math.cos(phase)*.12);xform.rotation.set(.09*Math.sin(phase),bed*.71+side*tier*.36,.16*Math.cos(phase));xform.scale.set(1,1,.70+.13*Math.sin(phase));xform.updateMatrix();b.geometry(plate,tier%2?'coralTip':'coral',xform.matrix);plate.dispose();
  }
  for(let j=0;j<4;j++)kelp(b,x+side*(.67+j*.38),y+.16,z+.76+j*.22,2.6+(j%3)*.47,bed+j*.73);
  scallop(b,x-side*.65,y+.025,z-1.02,.68,side*.45);
 }
 // A substantial scalloped shell vault, with a broad ribbed skin and open passage.
 // All supporting forms remain beyond the build pads; central swim corridor stays clear.
 const shellPoint=(a,u,back=false)=>{
  const radius=2.68+(5.03+.14*Math.cos(a*14)-2.68)*u;
  const height=2.78+(4.45+.11*Math.cos(a*14)-2.78)*u;
  return [rx+Math.cos(a)*radius,base+.45+Math.sin(a)*height,rz-.18+Math.sin(a)*.51+u*.49+(back?.27:0)];
 };
 for(let i=0;i<28;i++){
  const a=i*Math.PI/28,c=(i+1)*Math.PI/28,front=[],back=[];
  for(let j=0;j<3;j++){
   const u=j/3,v=(j+1)/3,p=shellPoint(a,u),q=shellPoint(c,u),r=shellPoint(a,v),t=shellPoint(c,v),p1=shellPoint(a,u,true),q1=shellPoint(c,u,true),r1=shellPoint(a,v,true),t1=shellPoint(c,v,true);
   front.push(...p,...q,...r,...q,...t,...r);back.push(...p1,...r1,...q1,...q1,...r1,...t1);
   // A hull for each small shell cell preserves the real arch opening and concavity.
   reefSolids.push(convexSolid(Array.from(new Float32Array([...p,...q,...r,...t,...p1,...q1,...r1,...t1]))));
  }
  triangles(b,i%4===0?'coralTip':i%2?'shell':'shellShade',front);triangles(b,'shellShade',back);
  for(const edge of [0,1]){const p=shellPoint(a,edge),q=shellPoint(c,edge),r=shellPoint(a,edge,true),t=shellPoint(c,edge,true);triangles(b,'shell', [...p,...q,...r,...q,...t,...r,...p,...r,...q,...q,...r,...t]);}
  if(i%2===0){let previous;for(let j=0;j<=5;j++){const p=shellPoint(a,j/5);p[2]-=.026;if(previous)b.beam('shell',previous,p,.044+(j/5)*.021);previous=p;}}
 }
 for(const side of [-1,1]){
  addRock('rock','stone',rx+side*3.7,base+.32,rz,1.35,.68,1.17,0,side*.3);
  addRock('rough','shellShade',rx+side*3.55,base+.62,rz,.74,.83,.69,0,side*.25);
  cup(b,rx+side*3.25,base+.08,rz-1.05,1.06,side+2);
 }
 // Layered scenic reef ridges beyond the physical boundary hide the straight cutoff.
 // They are unreachable background forms, not new terrain or collider authority.
 for(let row=0;row<3;row++)for(let i=-4;i<=4;i++){
  const x=rx+i*(6.3+row),z=terrain.maxZ+5+row*8+Math.sin(i*1.7)*1.4,y=heightAt(x,z),h=1.55+row*.62+(.5+.5*Math.cos(i*2.3+row))*1.15;
  b.add('rock',row%2?'stoneLight':'stone',x,y+h*.38,z,4.3+row*.6,h*.56,2.8+row*.9,.09,i*.23,.08);
  b.add('rough','stone',x+1,y+h*.66,z+.35,2.8,h*.41,2.1,0,i*.47);
  if(row===0){for(let j=0;j<3;j++)kelp(b,x-1+j*.74,y+.35,z-.7,2.5+j*.4,i+j*.71);coral(b,x+.63,y+h*.79,z,1.5,i+5);}
 }
 // Sandy shell stepping motifs lead through the arch; never raised enough to hide a floor.
 for(let i=0;i<5;i++)scallop(b,rx+Math.sin(i*1.9)*.9,base-.07,rz-2+i*.58,.35+i*.027,.25);
 root.add(b.finish('reef-beds-and-shell-crown'));root.userData.reefSolids=reefSolids;return root;
}
// Low, soft planting within pads yields to funded construction and doorway approaches.
export function createReefCover({terrain,heightAt,excludedCells=[]}){
 if(!terrain||typeof heightAt!=='function')throw new TypeError('Reef cover requires authoritative terrain and heightAt');
 const b=new Batch(),excluded=excludedCells.filter(c=>Number.isFinite(c.gx)&&Number.isFinite(c.gz));
 let seed=41903;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const channel=z=>Math.sin((z-43)*.24)*1.8;
 const ribbon=(x,y,z,h,angle,width,mat)=>{
  const vertices=[],point=(t,side)=>{
   const lean=.37*h*t*t,w=Math.sin(t*Math.PI)*width;
   return [x+Math.cos(angle)*lean-Math.sin(angle)*w*side,y+h*t,z+Math.sin(angle)*lean+Math.cos(angle)*w*side];
  };
  for(let i=0;i<4;i++){const t=i/4,u=(i+1)/4,a=point(t,-1),c=point(t,1),d=point(u,-1),e=point(u,1);vertices.push(...a,...c,...d,...c,...e,...d);}
  triangles(b,mat,vertices);
 };
 let clumps=0;
 for(const pad of terrain.pads)for(let i=0;i<540;i++){
  const minX=pad.minGX*2-.2,maxX=pad.maxGX*2+.2,minZ=pad.minGZ*2-.2,maxZ=pad.maxGZ*2+.2,x=minX+random()*(maxX-minX),z=minZ+random()*(maxZ-minZ);
  // Four-meter winding central swim channel and broad cross-pad construction approach.
  if(Math.abs(x-channel(z))<2.55||Math.abs(z-(pad.minGZ*2+3.0))<1.0)continue;
  const patch=Math.sin(x*.47+Math.sin(z*.36))+Math.cos(z*.69-x*.13);
  if(patch<-.05||random()>.83)continue;
  // Root rejection includes full cell, one-meter doorstep margin and leaf overhang.
  if(excluded.some(c=>Math.abs(x-c.gx*2)<2.65&&Math.abs(z-c.gz*2)<2.65))continue;
  const y=heightAt(x,z),phase=random()*Math.PI*2,h=.42+random()*.42;clumps++;
  for(let j=0;j<6;j++)ribbon(x+(random()-.5)*.13,y,z+(random()-.5)*.13,h*(.72+random()*.28),phase+j*1.047,.085+random()*.055,j%3?'kelp':'kelpLight');
  if(i%5===0){
   // Attached soft branching fans alternate salmon and lilac inside the grass banks.
   const mat=i%2?'coral':'violet',tip=i%2?'coralTip':'violetTip';
   for(let j=0;j<4;j++){
    const a=phase+j*1.57,stem=[x,y+.04,z],fork=[x+Math.cos(a)*.13,y+.25,z+Math.sin(a)*.13];b.beam(mat,stem,fork,.032,.022);
    for(const side of [-1,1]){const end=[fork[0]+Math.cos(a+side*.7)*.10,y+.43+(j%2)*.10,fork[2]+Math.sin(a+side*.7)*.10];b.beam(mat,fork,end,.024,.014);b.add('rough',tip,...end,.031,.043,.031);}
   }
  }
  if(i%9===0)scallop(b,x+.23,y-.035,z+.09,.24,phase);
 }
 const group=b.finish('soft-reef-cover');
 // Batch geometries are already private; detach palettes before exposing disposal ownership.
 group.traverse(o=>{if(o.isMesh)o.material=o.material.clone();});
 group.userData.privateResources=true;group.userData.clumps=clumps;return group;
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
