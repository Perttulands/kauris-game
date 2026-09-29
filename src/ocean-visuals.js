import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {convexSolid} from './reef-collision.js';

// Marine assets sample caller terrain; exact hard geometry supplies lead-owned collision.
// Water and actor motion remain runtime-owned; soft planting has no collision.
const M={};
for(const [name,color]of Object.entries({sand:'#d3c6a5',sandLight:'#ece0bc',stone:'#557e78',stoneLight:'#81a099',coral:'#df9982',coralTip:'#f4c8a3',violet:'#a48aaf',violetTip:'#d3bacd',ochre:'#d3b269',kelp:'#468c78',kelpLight:'#7db590',shell:'#ead7ba',shellShade:'#b7a59a',fish:'#e6b660',fishLight:'#fff0bf',fishBlue:'#62b9b6',fishDark:'#397781',eye:'#263e42'}))M[name]=new THREE.MeshStandardMaterial({color,roughness:name.startsWith('fish')?.52:.88,flatShading:true});
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
 const reefSolids=[],backdropBounds=[];
 // Streamed indexed terrain now supplies both the seabed and its action ray.
 const b=new Batch();let seed=78912;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 // Batch.add returns the exact transformed copy later merged into the rendered mesh.
 const addRock=(shape,mat,...args)=>{const geometry=b.add(shape,mat,...args);reefSolids.push(convexSolid(Array.from(geometry.attributes.position.array)));};
 // Reef beds form two banks flanking the house clearing and its open sand approach.
 for(const side of [-1,1])for(let row=0;row<9;row++){
  const x=side*(15.4+random()*5.4),z=35.5+row*3.2,y=heightAt(x,z),scale=.9+random()*1.0;
  if(y>=terrain.waterY)continue;
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
 // Foreground-facing reef terraces sit around the reef, in the arrival view.
 const rx=terrain.reef.x,rz=terrain.reef.z+2,base=heightAt(rx,rz);
 for(const side of [-1,1])for(let bed=0;bed<3;bed++){
  const x=rx+side*(5.15+bed*3.20),z=terrain.reef.z+1.35+bed*1.05,y=heightAt(x,z),rise=bed===1?1.42:.95;
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
 // All supporting forms remain beside the passage; central swim corridor stays clear.
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
 // Former visual-only far ridges are retired; the sea continues through chunks.
 // Sandy shell stepping motifs lead through the arch; never raised enough to hide a floor.
 for(let i=0;i<5;i++)scallop(b,rx+Math.sin(i*1.9)*.9,base-.07,rz-2+i*.58,.35+i*.027,.25);
 root.add(b.finish('reef-beds-and-shell-crown'));root.userData.reefSolids=reefSolids;root.userData.backdropBounds=backdropBounds;return root;
}
