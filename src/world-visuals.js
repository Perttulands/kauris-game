import {sampleCell,cellAt,GRID} from './surface-grid.js';
import * as THREE from 'three';
import {REGIONS} from './world-layout.js';

// Shared immutable palette; a chunk owns only its buffers. No GPU texture uploads
// or materials are allocated when crossing a chunk boundary.
const terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
const rockMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,flatShading:true});
const foliageMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
const colors=Object.fromEntries(Object.entries({grass:'#659263',grassLight:'#87ab77',grassDark:'#477653',groveFloor:'#416b50',flowerGround:'#9fa373',birchMeadow:'#a6b383',coveMeadow:'#729c87',bayMeadow:'#b3ad76',islandMeadow:'#8cafa0',earth:'#aa9974',sand:'#cbbd9e',sandLight:'#e1d2af',wetSand:'#a5b5a4',deep:'#638f88',paleStone:'#9fa796',warmStone:'#b7a07d',seaStone:'#6d9690',stem:'#5b8056',clover:'#75a17a',flower:'#e5c781',pink:'#d5aaa3',kelp:'#528f75',kelpTip:'#80ad83',shell:'#e3d2af',coral:'#c89472'}).map(([k,c])=>[k,new THREE.Color(c)]));
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
const scratch=new THREE.Color(),meadowPalettes={'birch-downs':'birchMeadow','reed-cove':'coveMeadow','amber-bay':'bayMeadow','seagrass-sound':'islandMeadow'};
// Wide quiet ground shapes bind the new north grove edges into one place.
// These are meadow finishes, not shadows or occupancy restrictions; harvesting
// opens the same usable ground and every rectangle retains its sampled height.
const groveBeds=[[-15,-98,8,15],[27,-96,12,13],[1,-112,12,6],[-12,-46,6,9],[18,-60,6,8]];
function groundColor(x,y,z,shoreDistance,substrate){
 const broad=(Math.sin(x*.113+Math.sin(z*.07))+.6*Math.cos(z*.137-x*.036))/1.6;
 if(substrate==='rock'){scratch.copy(colors.paleStone).lerp(colors.warmStone,.18+.12*broad);}
 else if(substrate==='sand'){scratch.copy(colors.sand).lerp(y<-4?colors.deep:colors.sandLight,smooth(-1,-10,y)*.42+.12+.09*broad);}
 else{
  scratch.copy(colors.grass).lerp(broad>0?colors.grassLight:colors.grassDark,Math.abs(broad)*.24);
  for(const r of REGIONS){const palette=meadowPalettes[r.id];if(!palette)continue;const d=Math.hypot((x-r.x)/1.1,z-r.z),weight=(1-smooth(10,42,d))*(.55+.1*broad);scratch.lerp(colors[palette],weight);}
  for(const [cx,cz,rx,rz] of groveBeds){
   const d=Math.hypot((x-cx)/rx,(z-cz)/rz);
   const bed=1-smooth(.4,1.15,d);
   scratch.lerp(colors.groveFloor,bed*.56);
   const verge=smooth(.3,.65,d)*(1-smooth(.65,1.05,d));
   scratch.lerp(colors.flowerGround,verge*.30);
  }
  const worn=(1-smooth(.6,2,routeDistance(x,z)))*.46;
  scratch.lerp(colors.earth,worn);
  // A level inland garden is grass, not a beach: elevation alone is insufficient.
  const coastal=1-smooth(0,8,shoreDistance);
  scratch.lerp(colors.sandLight,(1-smooth(-.12,.38,y))*.34*coastal);
 }
 return [scratch.r,scratch.g,scratch.b];
}
// Cells own their top and only the exposed side above a lower neighbour.
// Adjacent chunks query the same cells, so there are no skirt overlaps or seams.
// A hole lowers its outgoing terrace side. plotSurfaces owns the excavation
// below each neighbour's original terrace, avoiding overlapping inner walls.
// Depth tint and grazing-angle reflection keep the stepped seabed readable near
// shore without letting its terrace stripes replace the surface. The underside
// stays transparent; this changes no water occupancy, heights or targeting.
const waterMaterial=new THREE.MeshPhysicalMaterial({color:'#ffffff',roughness:.3,metalness:.03,transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide});
waterMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='attribute float waterDepth; varying float seaDepth; varying vec3 seaPoint;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nseaDepth=waterDepth; seaPoint=position;');
 shader.fragmentShader='varying float seaDepth; varying vec3 seaPoint;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float depthTint=1.0-exp(-seaDepth*.38);
  float grazing=pow(1.0-abs(normalize(cameraPosition-seaPoint).y),3.0);
  vec3 shallow=vec3(.07,.37,.40),deep=vec3(.025,.17,.26);
  diffuseColor.rgb*=mix(shallow,deep,depthTint);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.30,.57,.63),grazing*.3);
  float wavePhase=seaPoint.x*.65+seaPoint.z*.92+sin(seaPoint.x*.24)*1.8;
  float waveAA=1.0-smoothstep(.4,1.8,fwidth(wavePhase));
  float crest=pow(.5+.5*sin(wavePhase),16.0)*waveAA;
  diffuseColor.rgb+=vec3(.02,.035,.04)*crest;
  diffuseColor.a=cameraPosition.y>=seaPoint.y?min(.985,.52+.40*depthTint+.28*grazing):.12;
 `);
};
waterMaterial.customProgramCacheKey=()=> 'kauris-depth-water-v1';
// Linear vertex colours need byte precision, not three float32 channels. Keep
// the exact geometry/population while bounding the larger botanical groupings.
// Packed normals keep the same unit directions (terrain normals are axis exact)
// and release the temporary float buffer after construction.
function packNormals(g){const n=g.attributes.normal;g.setAttribute('normal',new THREE.Int8BufferAttribute(Array.from(n.array,v=>Math.round(v*127)),3,true));}
const colorAttribute=values=>new THREE.Uint8BufferAttribute(values.map(v=>Math.round(Math.max(0,Math.min(1,v))*255)),3,true);
function terrain(descriptor,holes){
 const positions=[],paint=[],water=[],waterDepth=[],b=descriptor.bounds,holeSet=new Set(holes.map(p=>`${p.gx},${p.gz}`));
 const quad=(a,c,d,e,color)=>{positions.push(...a,...c,...d,...a,...d,...e);for(let i=0;i<6;i++)paint.push(...color);};
 for(let gz=(b.minZ+1)/2;gz<(b.maxZ+1)/2;gz++)for(let gx=(b.minX+1)/2;gx<(b.maxX+1)/2;gx++){
  const s=sampleCell(gx,gz),x=gx*2,z=gz*2,y=s.height-(holeSet.has(`${gx},${gz}`)?.6:0),loX=x-1,hiX=x+1,loZ=z-1,hiZ=z+1;
  const color=groundColor(x,y,z,s.shoreDistance,s.substrate);
  if(!holeSet.has(`${gx},${gz}`))quad([loX,y,loZ],[loX,y,hiZ],[hiX,y,hiZ],[hiX,y,loZ],color);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const lower=sampleCell(gx+dx,gz+dz).height;if(lower>=y)continue;
   const side=s.substrate==='soil'?colors.earth:s.substrate==='rock'?colors.paleStone:colors.sand;
   const shade=s.waterY!==null?color.map(c=>c*.92):[side.r*.78,side.g*.78,side.b*.78];
   if(dx===1)quad([hiX,y,hiZ],[hiX,lower,hiZ],[hiX,lower,loZ],[hiX,y,loZ],shade);
   if(dx===-1)quad([loX,y,loZ],[loX,lower,loZ],[loX,lower,hiZ],[loX,y,hiZ],shade);
   if(dz===1)quad([loX,y,hiZ],[loX,lower,hiZ],[hiX,lower,hiZ],[hiX,y,hiZ],shade);
   if(dz===-1)quad([hiX,y,loZ],[hiX,lower,loZ],[loX,lower,loZ],[loX,y,loZ],shade);
  }
  if(s.waterY!==null){const w=s.waterY;water.push(loX,w,loZ,loX,w,hiZ,hiX,w,hiZ,loX,w,loZ,hiX,w,hiZ,hiX,w,loZ);for(let i=0;i<6;i++)waterDepth.push(w-s.height);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',colorAttribute(paint));geometry.computeVertexNormals();packNormals(geometry);geometry.computeBoundingSphere();
 const ground=new THREE.Mesh(geometry,terrainMaterial);ground.name=`terrain:${descriptor.id}`;ground.receiveShadow=true;ground.userData.worldGround=true;
 const cast=ground.raycast;ground.raycast=function(raycaster,hits){const candidates=[];cast.call(this,raycaster,candidates);for(const hit of candidates){if(hit.face.normal.y>.5){const {gx,gz}=cellAt(hit.point.x,hit.point.z);if(Math.abs(hit.point.y-sampleCell(gx,gz).height)>1e-5)continue;}hits.push(hit);}};

 let sea=null;if(water.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(water,3));g.setAttribute('waterDepth',new THREE.Float32BufferAttribute(waterDepth,1));g.computeVertexNormals();packNormals(g);g.computeBoundingSphere();sea=new THREE.Mesh(g,waterMaterial);sea.name=`water:${descriptor.id}`;sea.userData.worldWater=true;sea.raycast=()=>{};}
 return {ground,sea};
}
function batch(material,name){const positions=[],paint=[];return {
 triangle(a,b,c,color,shade=1){positions.push(...a,...b,...c);for(let i=0;i<3;i++)paint.push(color.r*shade,color.g*shade,color.b*shade);},
 finish(){if(!positions.length)return null;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',colorAttribute(paint));g.computeVertexNormals();packNormals(g);g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;return mesh;}
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
export function createWorldChunk(descriptor,{excludedCells=[],holes=[],detail=true}={}){
 const group=new THREE.Group();group.name=`chunk:${descriptor.id}`;
 const {ground,sea}=terrain(descriptor,holes),groundMeshes=[ground];group.add(ground);if(sea)group.add(sea);
 if(detail){
  const stone=batch(rockMaterial,'hard-shore-stone'),plants=batch(foliageMaterial,'botanical-verges');
  // Lead filters paid-occupancy conflicts in descriptor solids for BOTH physics
  // and presentation. Never silently hide a hard rock only in its visible mesh.
  for(const solid of descriptor.solids){const color=colors[solid.material]??colors.paleStone;for(let i=0;i<solid.indices.length;i+=3){const points=solid.indices.slice(i,i+3).map(n=>solid.vertices.slice(n*3,n*3+3));stone.triangle(...points,color,.91+(i%9)*.012);}}
  for(const d of descriptor.decorations){if(d.kind.startsWith('habitat-'))continue;if(excludedCells.some(p=>Math.abs(d.x-p.gx*2)<1.7&&Math.abs(d.z-p.gz*2)<1.7))continue;botanical(plants,d);}
  const stoneMesh=stone.finish(),plantMesh=plants.finish();if(stoneMesh)group.add(stoneMesh);
  // Soft passable cover must not swallow a dig/harvest ray aimed through its blades.
  if(plantMesh){plantMesh.raycast=()=>{};group.add(plantMesh);}
 }
 let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});group.clear();};
 group.userData.chunkId=descriptor.id;group.userData.detail=detail;return {group,groundMeshes,dispose};
}
