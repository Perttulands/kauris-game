import * as THREE from 'three';
import {PLACES,WORLD_OBSTACLES} from './world-data.js';
import {DISCOVERIES} from './garden.js';

// The cover is disposable per occupancy revision. It owns all its geometry/materials.
const rigs=new WeakMap();
export function createMeadowCover({excludedCells=[]}={}){
 const group=new THREE.Group();group.name='living-meadow-cover';
 const occupied=new Set(excludedCells.map(c=>`${c.gx},${c.gz}`));
 const buckets=Array.from({length:16},()=>({position:[],color:[]}));
 const palette=['#548363','#659571','#79a577','#8bb47e','#a4bd81'].map(c=>new THREE.Color(c));
 const dark=new THREE.Color('#426e55'),petal=new THREE.Color('#f2dfaa'),pink=new THREE.Color('#d6a4ac');
 let seed=64173;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const routes=[...PLACES,...DISCOVERIES,{x:0,z:27}].map(p=>({vx:p.x,vz:p.z-9,len:Math.hypot(p.x,p.z-9)}));
 const routeDistance=(x,z)=>{let distance=Infinity;for(let i=0;i<routes.length;i++){const {vx,vz,len}=routes[i],t=THREE.MathUtils.clamp((x*vx+(z-9)*vz)/(len*len),0,1),bend=Math.sin(t*Math.PI)*(i%2?1.6:-1.8),cx=t*vx-vz/len*bend,cz=9+t*vz+vx/len*bend;distance=Math.min(distance,Math.hypot(x-cx,z-cz));}return distance;};
 const route=(x,z)=>{
  // A quiet arrival room and broad curved walking routes, independent of cell edges.
  if(Math.hypot(x,z-9)<2.3)return true;
  if(WORLD_OBSTACLES.some(p=>x>p.minX-.3&&x<p.maxX+.3&&z>p.minZ-.3&&z<p.maxZ+.3))return true;
  if(routeDistance(x,z)<1.27)return true;
  // Existing discovery approaches remain readable without hardcoding solid footprints.
  if(Math.abs(x)<1.2&&z<0)return true;
  return false;
 };
 const free=(x,z,r)=>{
  for(let gx=Math.floor((x-r+1)/2);gx<=Math.floor((x+r+1)/2);gx++)for(let gz=Math.floor((z-r+1)/2);gz<=Math.floor((z+r+1)/2);gz++)if(occupied.has(`${gx},${gz}`))return false;
  return true;
 };
 const triangle=(b,a,c,d,color,shade=1)=>{b.position.push(...a,...c,...d);for(let i=0;i<3;i++)b.color.push(color.r*shade,color.g*shade,color.b*shade);};
 // Curved tapering ribbons replace rigid diamond fans. Each has a soft shoulder,
 // a narrow tip and its own lean; patches share a palette rather than striping blades.
 const blade=(b,x,z,h,a,w,color)=>{
  const dx=Math.cos(a),dz=Math.sin(a),lean=h*(.35+.42*Math.sin(a*2.7+x)),curl=.12*Math.sin(z*1.7+a),point=(t,side)=>{
   const width=w*Math.pow(Math.sin(Math.PI*t),.7),bend=lean*t*t;
   return [x+dx*bend-dz*(side*width+curl*h*t*t),.006+h*(t-.19*t*t),z+dz*bend+dx*(side*width+curl*h*t*t)];
  };
  for(let j=0;j<4;j++){const t=j/4,u=(j+1)/4,l=point(t,-1),r=point(t,1),ll=point(u,-1),rr=point(u,1);triangle(b,l,r,ll,color,.91+j*.025);triangle(b,r,rr,ll,color,.94+j*.02);}
 };
 const leaf=(b,x,y,z,a,size,color)=>{
  const dx=Math.cos(a),dz=Math.sin(a),rise=size*(.12+.20*Math.sin(a*1.7)),center=[x+dx*size*.53,y+rise*.53+.033,z+dz*size*.53];
  // Cupped heart-shaped leaflets on raised stalks, with a quiet central fold.
  const outline=[[0,0],[.22,-.37],[.65,-.45],[.93,-.26],[.82,0],[.93,.26],[.65,.45],[.22,.37]];
  const points=outline.map(([u,v])=>[x+(dx*u-dz*v)*size,y+u*rise+Math.abs(v)*size*.15,z+(dz*u+dx*v)*size]);
  for(let i=0;i<points.length;i++)triangle(b,center,points[i],points[(i+1)%points.length],color,i<4?1:.94);
 };
 const stalk=(b,x,y,z,dx,dz,color)=>{
  const bottom=[x,.008,z],top=[x+dx,y,z+dz];
  triangle(b,[bottom[0]-.005,bottom[1],bottom[2]], [bottom[0]+.005,bottom[1],bottom[2]],top,color,.85);
  triangle(b,[bottom[0],bottom[1],bottom[2]-.005], [bottom[0],bottom[1],bottom[2]+.005],top,color);
 };
 const bloom=(b,x,y,z,size,color)=>{
  stalk(b,x,y,z,0,0,dark);
  for(let j=0;j<5;j++)leaf(b,x,y,z,j*1.257,size,color);
  const c=[x,y+.019,z];for(let j=0;j<6;j++){const a=j*Math.PI/3,d=(j+1)*Math.PI/3;triangle(b,c,[x+Math.cos(a)*size*.26,y+.018,z+Math.sin(a)*size*.26],[x+Math.cos(d)*size*.26,y+.018,z+Math.sin(d)*size*.26],petal);}
 };
 let clumps=0;
 for(let i=0;i<13500;i++){
  const x=(random()-.5)*51.5,z=(random()-.5)*51.5,patch=Math.sin(x*.29+Math.sin(z*.16)*1.6)+Math.cos(z*.34-x*.11)+.45*Math.sin(x*.77+z*.43);
  if(patch<-.2||route(x,z)||!free(x,z,.65))continue;
  // Visible broad fans and clover carpets; height steps up along the outer beds.
  const fringe=Math.max(Math.abs(x),Math.abs(z))>14,threshold=fringe?.80:.39;
  if(random()>threshold)continue;
  const b=buckets[Math.min(3,Math.floor((x+26)/13))+4*Math.min(3,Math.floor((z+26)/13))],height=(fringe?.27:.18)+random()*(fringe?.27:.19),a=random()*Math.PI*2;
  clumps++;
  const verge=routeDistance(x,z)<2.2,clover=Math.sin(x*.53-z*.37)>.20;
  const shade=palette[1+Math.floor((.5+.5*Math.sin(x*.18+z*.13))*2.9)];
  if(clover){
   // Two asymmetrical trefoils make a low rising carpet, never a five-leaf stamp.
   for(let j=0;j<2;j++){
    const angle=a+j*2.4,h=.065+random()*.115,dx=Math.cos(angle)*.065,dz=Math.sin(angle)*.065;
    stalk(b,x,h,z,dx,dz,dark);
    for(let k=0;k<3;k++)leaf(b,x+dx,h,z+dz,angle+k*2.094,.14+random()*.085,shade);
   }
   blade(b,x+.06,z,height*.66,a+.7,.023,palette[1]);
  }else{
   const sweep=a+.5*Math.sin(x*.15+z*.21),low=patch<.7;
   for(let j=0;j<3;j++)blade(b,x+(random()-.5)*.17,z+(random()-.5)*.17,height*(low?.62:1)*(.62+random()*.48),sweep+(j-1)*.8,.017+random()*.020,shade);
   if(i%3===0)leaf(b,x,.025,z,a,.18,shade);
   // Sparse arching seed heads add a botanical counterpoint without extra clumps.
   if(fringe&&i%23===0){
    const h=height*1.12,dx=Math.cos(a)*.12,dz=Math.sin(a)*.12;stalk(b,x,h,z,dx,dz,dark);
    for(let k=0;k<3;k++){const yy=h-k*.035;leaf(b,x+dx,yy,z+dz,a+k*2.4,.039,petal);}
   }
  }
  // Small grouped daisies gather on verges and the edges of dense leaf beds.
  if((verge&&i%7===0)||(clover&&patch>1.15&&i%13===0))for(let j=0;j<3;j++){
   const a=j*2.399,xx=x+Math.cos(a)*.14,zz=z+Math.sin(a)*.14;
   bloom(b,xx,.24+j*.045+(fringe?.09:0),zz,.074+(j%2)*.015,i%2?petal:pink);
  }

 }
 const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.94,flatShading:true});
 const time={value:0};
 material.onBeforeCompile=shader=>{
  shader.uniforms.meadowTime=time;
  shader.vertexShader='uniform float meadowTime;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(position.x*.57 + position.z*.38 + meadowTime*1.35) * smoothstep(.025,.32,position.y) * .025;\ntransformed.z += cos(position.x*.35 + meadowTime*.95) * smoothstep(.025,.32,position.y) * .012;');
 };
 material.customProgramCacheKey=()=> 'kauris-meadow-cover-v3';
 for(const b of buckets)if(b.position.length){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.position,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.color,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.03;const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);}
 group.userData.privateResources=true;group.userData.clumps=clumps;rigs.set(group,time);return group;
}
export function animateMeadowCover(group,{time=0}={}){const uniform=rigs.get(group);if(uniform)uniform.value=Number.isFinite(time)?time:0;}
