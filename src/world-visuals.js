import * as THREE from 'three';
import {REGIONS,sampleWorld as sharedSample} from './world-layout.js';

// Shared immutable palette; a chunk owns only its buffers. No GPU texture uploads
// or materials are allocated when crossing a chunk boundary.
const terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
const rockMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,flatShading:true});
const foliageMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
const colors=Object.fromEntries(Object.entries({grass:'#659263',grassLight:'#87ab77',grassDark:'#477653',earth:'#aa9974',sand:'#cbbd9e',sandLight:'#e1d2af',wetSand:'#a5b5a4',deep:'#638f88',paleStone:'#9fa796',warmStone:'#b7a07d',seaStone:'#6d9690',stem:'#5b8056',clover:'#75a17a',flower:'#e5c781',pink:'#d5aaa3',kelp:'#528f75',kelpTip:'#80ad83',shell:'#e3d2af',coral:'#c89472'}).map(([k,c])=>[k,new THREE.Color(c)]));
terrainMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 terrainPoint;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPoint=position;');
 shader.fragmentShader=`varying vec3 terrainPoint;
  float meadowHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
  float meadowNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(meadowHash(i),meadowHash(i+vec2(1,0)),f.x),mix(meadowHash(i+vec2(0,1)),meadowHash(i+vec2(1,1)),f.x),f.y);}
  `+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float phase=terrainPoint.z*5.4+sin(terrainPoint.x*.31)*2.7+sin(terrainPoint.z*.17)*1.8;
  float ripple=pow(.5+.5*sin(phase),6.0)*(1.0-smoothstep(.4,2.5,fwidth(phase)));
  diffuseColor.rgb*=1.0-.065*ripple*(1.0-smoothstep(-.2,.1,terrainPoint.y));
  vec2 grainPoint=terrainPoint.xz*23.0;
  float grainAA=1.0-smoothstep(.35,1.2,max(fwidth(grainPoint.x),fwidth(grainPoint.y)));
  float grassDetail=.12*(meadowNoise(terrainPoint.xz*2.8)-.5)+.09*(meadowHash(floor(grainPoint))-.5)*grainAA;
  diffuseColor.rgb*=1.0+grassDetail*smoothstep(-.12,.04,terrainPoint.y);
 `);
};
terrainMaterial.customProgramCacheKey=()=> 'kauris-world-terrain-v2';
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function routeDistance(x,z){let d=Infinity;for(const r of REGIONS)for(let i=1;i<r.route.length;i++){const a=r.route[i-1],b=r.route[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));d=Math.min(d,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return d;}
const scratch=new THREE.Color();
function groundColor(x,y,z,shoreDistance){
 const broad=(Math.sin(x*.113+Math.sin(z*.07))+.6*Math.cos(z*.137-x*.036))/1.6;
 if(y<-.12){scratch.copy(colors.sand).lerp(y<-4?colors.deep:colors.sandLight,smooth(-1,-10,y)*.42+.12+.09*broad);}
 else{
  scratch.copy(colors.grass).lerp(broad>0?colors.grassLight:colors.grassDark,Math.abs(broad)*.24);
  const worn=(1-smooth(.6,2,routeDistance(x,z)))*.46;
  scratch.lerp(colors.earth,worn);
  // A level inland garden is grass, not a beach: elevation alone is insufficient.
  const coastal=1-smooth(0,8,shoreDistance);
  scratch.lerp(colors.sandLight,(1-smooth(-.12,.38,y))*.34*coastal);
 }
 return [scratch.r,scratch.g,scratch.b];
}
const gridEdges={x:[-28,28],z:[-28,...Array.from({length:13},(_,i)=>27+i),70,86,112]};
function axis(min,max,which){const values=[min,max];for(let n=min+1;n<max;n+=2)values.push(n);for(let n=Math.ceil(min/32)*32;n<max;n+=32)values.push(n);for(const n of gridEdges[which])if(n>min&&n<max)values.push(n);return [...new Set(values)].sort((a,b)=>a-b);}
function terrain(descriptor,sampleWorld,holes){
 const {bounds:b}=descriptor,xs=axis(b.minX-2,b.maxX+2,'x'),zs=axis(b.minZ-2,b.maxZ+2,'z'),positions=[],paint=[],normalIndices=[],indices=[],holeSet=new Set(holes.map(p=>`${p.gx},${p.gz}`));
 // One ghost cell around the chunk supplies all shared-vertex incident faces.
 // Compute area-weighted normals on it, then render only the interior triangles.
 for(const z of zs)for(const x of xs){const sample=sampleWorld(x,z),y=sample.height;positions.push(x,y,z);paint.push(...groundColor(x,y,z,sample.shoreDistance));}
 for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){
  const a=j*xs.length+i,c=a+xs.length;normalIndices.push(a,c,a+1,a+1,c,c+1);
  if(xs[i]<b.minX||xs[i+1]>b.maxX||zs[j]<b.minZ||zs[j+1]>b.maxZ)continue;
  // The existing editable meadow has its own729 live top faces and hole walls.
  if(xs[i]>=-27&&xs[i+1]<=27&&zs[j]>=-27&&zs[j+1]<=27)continue;
  if(holeSet.has(`${Math.round((xs[i]+xs[i+1])/4)},${Math.round((zs[j]+zs[j+1])/4)}`))continue;
  indices.push(a,c,a+1,a+1,c,c+1);
 }
 if(!indices.length)return null;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(paint,3));geometry.setIndex(normalIndices);geometry.computeVertexNormals();geometry.setIndex(indices);geometry.computeBoundingSphere();
 const mesh=new THREE.Mesh(geometry,terrainMaterial);mesh.name=`terrain:${descriptor.id}`;mesh.receiveShadow=true;mesh.userData.worldGround=true;return mesh;
}
function batch(material,name){const positions=[],paint=[];return {
 triangle(a,b,c,color,shade=1){positions.push(...a,...b,...c);for(let i=0;i<3;i++)paint.push(color.r*shade,color.g*shade,color.b*shade);},
 finish(){if(!positions.length)return null;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(paint,3));g.computeVertexNormals();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;return mesh;}
 };}
function ribbon(b,x,y,z,h,a,width,color,bend=.36){
 const dx=Math.cos(a),dz=Math.sin(a),point=(t,side)=>{const w=Math.sin(Math.PI*t)*width,reach=h*bend*t*t;return [x+dx*reach-dz*w*side,y+h*(t-.13*t*t),z+dz*reach+dx*w*side];};
 for(let j=0;j<3;j++){const t=j/3,u=(j+1)/3,l=point(t,-1),r=point(t,1),ll=point(u,-1),rr=point(u,1);b.triangle(l,r,ll,color,.93+j*.025);b.triangle(r,rr,ll,color,1);}
}
function leaf(b,x,y,z,a,size,color){
 const dx=Math.cos(a),dz=Math.sin(a),p=[x,y,z],tip=[x+dx*size,y+size*.15,z+dz*size],mid=[x+dx*size*.48,y+size*.25,z+dz*size*.48];
 const l=[mid[0]-dz*size*.28,y+size*.12,mid[2]+dx*size*.28],r=[mid[0]+dz*size*.28,y+size*.12,mid[2]-dx*size*.28];
 b.triangle(p,l,mid,color,.94);b.triangle(l,tip,mid,color,1);b.triangle(p,mid,r,color,.90);b.triangle(r,mid,tip,color,.97);
}
function botanical(b,d){
 const {x,y,z,yaw:a,scale:s,kind,variant:v}=d;
 if(kind==='shell'){
  const point=(j,t)=>{const angle=a-.98+j*1.96/10,r=.27*s*t;return [x+Math.sin(angle)*r,y+.025+Math.sin(t*Math.PI)*.06*s+t*t*.035*s+(j%2)*t*.009,z+Math.cos(angle)*r];};
  for(let j=0;j<10;j++)for(let k=0;k<3;k++){const t=k/3,u=(k+1)/3;b.triangle(point(j,t),point(j,u),point(j+1,t),colors.shell,j%2?.92:1);b.triangle(point(j+1,t),point(j,u),point(j+1,u),colors.shell,j%2?.92:1);}return;
 }
 if(kind==='sea-fan'){
  // Small soft fan colonies share the vegetation batch; clear routes have none.
  for(let j=0;j<5;j++){
   const spread=(j-2)*.13*s,h=(.42+.18*Math.sin((j+1)*.52))*s,xx=x+Math.cos(a)*spread,zz=z+Math.sin(a)*spread;
   ribbon(b,xx,y,zz,h,a+(j-2)*.5,.027*s,colors.coral,.31);
   for(let k=1;k<4;k++)leaf(b,xx,y+h*k*.22,zz,a+(k%2?1:-1)*1.1,.15*s,colors.coral);
  }return;
 }
 if(kind==='kelp'){
  for(let i=0;i<4;i++)ribbon(b,x+Math.sin(i*2.4)*.11,y,z+Math.cos(i*2.4)*.11,(.8+i*.17)*s,a+i*1.9,.10*s,i%2?colors.kelp:colors.kelpTip,.53);return;
 }
 if(kind==='clover'){
  for(let k=0;k<3;k++){const xx=x+Math.cos(k*2.4+a)*.15*s,zz=z+Math.sin(k*2.4+a)*.15*s;for(let j=0;j<3;j++)leaf(b,xx,y+.055+k*.025,zz,a+j*2.094+k,.20*s,colors.clover);}return;
 }
 for(let k=0;k<3;k++){
  const xx=x+Math.cos(k*2.4+a)*.16*s,zz=z+Math.sin(k*2.4+a)*.16*s;
  for(let j=0;j<3;j++)ribbon(b,xx,y,zz,(kind==='reed'?.56:.26)*s*(.8+j*.22),a+k+j*.8,(kind==='reed'?.026:.028)*s,j%2?colors.grass:colors.grassLight,.38);
  if(kind==='blossom'){
   const h=.28*s+k*.04;ribbon(b,xx,y,zz,h,a,.008,colors.stem,.08);
   for(let i=0;i<5;i++)leaf(b,xx,y+h*.85,zz,a+i*1.257,.095*s,v%2?colors.flower:colors.pink);
  }
 }
}
export function createWorldChunk(descriptor,{sampleWorld=sharedSample,excludedCells=[],holes=[],detail=true}={}){
 const group=new THREE.Group();group.name=`chunk:${descriptor.id}`;
 const ground=terrain(descriptor,sampleWorld,holes),groundMeshes=ground?[ground]:[];if(ground)group.add(ground);
 if(detail){
  const stone=batch(rockMaterial,'hard-shore-stone'),plants=batch(foliageMaterial,'botanical-verges');
  // Lead filters paid-occupancy conflicts in descriptor solids for BOTH physics
  // and presentation. Never silently hide a hard rock only in its visible mesh.
  for(const solid of descriptor.solids){const color=colors[solid.material]??colors.paleStone;for(let i=0;i<solid.indices.length;i+=3){const points=solid.indices.slice(i,i+3).map(n=>solid.vertices.slice(n*3,n*3+3));stone.triangle(...points,color,.91+(i%9)*.012);}}
  for(const d of descriptor.decorations){if(d.kind.startsWith('habitat-'))continue;if(excludedCells.some(p=>Math.abs(d.x-p.gx*2)<1.7&&Math.abs(d.z-p.gz*2)<1.7))continue;botanical(plants,d);}
  for(const mesh of [stone.finish(),plants.finish()])if(mesh)group.add(mesh);
 }
 let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});group.clear();};
 group.userData.chunkId=descriptor.id;group.userData.detail=detail;return {group,groundMeshes,dispose};
}
