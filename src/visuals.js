import * as THREE from 'three';
import {createCraftPiece,createWateringCan} from './craft-visuals.js';
import { createStagedTree, animateStagedTree } from './garden-visuals.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLACES, WILD_RESOURCES, WORLD_OBSTACLES, cellFootprint, overlaps } from './world-data.js';

// All gameplay factories return immediately. Static forms are batched by material.
const M = {};
function material(name, color, roughness = .85, metalness = 0) {
  return M[name] = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
}
material('bark', '#76513b'); material('barkLight', '#b88957'); material('barkDark', '#493a31');
material('birch', '#eee8c9'); material('leaf', '#6e963e'); material('leafLight', '#94b64d');
material('leafDark', '#386348'); material('pine', '#286052'); material('pineLight', '#427c60');
material('willow', '#94b760'); material('copper', '#c57946', .43, .4); material('patina', '#60a593', .6, .35);
material('iron', '#8295a1', .52, .3); material('ironLight', '#bccac7', .42, .3);
material('diamond', '#83e3db', .2, .3); material('diamondLight', '#d5fff0', .18, .25);
material('flowerPink', '#eb9297'); material('flowerGold', '#f7ca65'); material('flowerCream', '#fff1c8');
material('stem', '#577846'); material('wood', '#bb8757'); material('woodLight', '#dcaf74');
material('plankDark', '#926447'); material('trim', '#f0d6a0'); material('roof', '#567e7a');
material('roofLight', '#6d9690'); material('sand', '#e2cb93'); material('sandDark', '#bba779');
material('earth', '#8b7561'); material('earthDark', '#53665c'); material('grass', '#6b9d6b');
material('grassLight', '#91b784'); material('grassDark', '#528260'); material('rock', '#8c9a90');
material('rockLight', '#b2b7a1'); material('water', '#438e99', .27, .2); material('waterLight', '#7ac3c0', .4);
material('foam', '#d7e9ca'); material('cloud', '#edf0dc'); material('hose', '#547771'); material('black', '#344545');
material('toolSteel', '#a1b9ba', .42, .32); material('toolEdge', '#e0e9d9', .38, .25);
M.cloud.emissive.set('#c5d7d6'); M.cloud.emissiveIntensity = .22;
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.IcosahedronGeometry(1, 1),
  rock: new THREE.IcosahedronGeometry(1, 0),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 8),
  crystal: new THREE.OctahedronGeometry(1, 0),
};
const dummy = new THREE.Object3D();
class Batch {
  constructor() { this.parts = new Map(); }
  add(shape, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    this.geometry(geo[shape], mat, dummy.matrix); return this;
  }
  geometry(g, mat, matrix) {
    let copy = g.index ? g.toNonIndexed() : g.clone();
    // Keep one common attribute layout for compatible, predictable merging.
    copy.deleteAttribute('uv'); if (matrix) copy.applyMatrix4(matrix);
    const key = typeof mat === 'string' ? M[mat] : mat;
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(copy);
  }
  absorb(object) {
    object.updateMatrixWorld(true);
    object.traverseVisible(o => { if (o.isMesh) this.geometry(o.geometry, o.material, o.matrixWorld); });
  }
  finish(name) {
    const group = new THREE.Group(); group.name = name;
    for (const [mat, pieces] of this.parts) {
      const merged = mergeGeometries(pieces, false); pieces.forEach(p => p.dispose());
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}
function branch(b, mat, a, c, radius) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...c);
  dummy.position.copy(from).add(to).multiplyScalar(.5);
  dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  dummy.scale.set(radius, from.distanceTo(to), radius); dummy.updateMatrix();
  b.geometry(geo.cylinder, mat, dummy.matrix);
}
export function createTree(kind, options = {}) { return createStagedTree(kind, options); }
export function animateTree(group, options = {}) { animateStagedTree(group, options); }

export function createBuildPiece(kind, surface = 'wood') {return createCraftPiece(kind,surface);}

export function createTool(kind) {
  if(kind==='hose')return createWateringCan();
  const b = new Batch();
  if (kind === 'axe') {
    // Curved hardwood haft, socket and a broad forged wedge with a bright cutting edge.
    branch(b, 'wood', [-.025,-.40,0], [.015,-.08,0], .032);
    branch(b, 'woodLight', [.015,-.08,0], [0,.28,0], .030);
    b.add('ball','wood',-.025,-.41,0,.044,.055,.035);
    for(let i=0;i<4;i++)b.add('cylinder','plankDark',-.017,-.34+i*.034,0,.035,.012,.035);
    b.add('box','iron',0,.245,0,.095,.16,.10);
    const blade = new THREE.Shape();
    blade.moveTo(.025,.30); blade.lineTo(.16,.32); blade.lineTo(.29,.38);
    blade.quadraticCurveTo(.35,.23,.28,.075); blade.lineTo(.14,.17); blade.lineTo(.025,.18); blade.closePath();
    const head = new THREE.ExtrudeGeometry(blade,{depth:.055,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.008,bevelThickness:.007,curveSegments:5});
    head.translate(0,0,-.0275); b.geometry(head,'toolSteel'); head.dispose();
    const edge = new THREE.Shape();
    edge.moveTo(.255,.362);edge.lineTo(.29,.38);edge.quadraticCurveTo(.35,.23,.28,.075);edge.lineTo(.245,.1);edge.quadraticCurveTo(.304,.23,.255,.362);edge.closePath();
    const bevel = new THREE.ExtrudeGeometry(edge,{depth:.064,bevelEnabled:false,curveSegments:5});
    bevel.translate(0,0,-.032);b.geometry(bevel,'toolEdge');bevel.dispose();
    b.add('box','iron',-.074,.255,0,.072,.105,.079);
    b.add('cylinder','copper',0,.25,-.054,.012,.009,.012,Math.PI/2);
  } else if (['shovel', 'fill', 'remove', 'build'].includes(kind)) {
    b.add('cylinder', 'woodLight', 0, -.1, 0, .033, .65, .033);
    b.add('cylinder', 'plankDark', 0, -.35, 0, .04, .15, .04);
    if (kind === 'shovel' || kind === 'fill') {
      const outline=new THREE.Shape();
      outline.moveTo(-.035,.17);outline.lineTo(-.12,.20);outline.lineTo(-.135,.35);
      outline.quadraticCurveTo(-.095,.43,0,.48);outline.quadraticCurveTo(.095,.43,.135,.35);
      outline.lineTo(.12,.20);outline.lineTo(.035,.17);outline.closePath();
      const spade=new THREE.ExtrudeGeometry(outline,{depth:.037,bevelEnabled:true,bevelSize:.007,bevelThickness:.007,bevelSegments:1,curveSegments:4});
      spade.translate(0,0,-.0185);b.geometry(spade,'toolSteel');spade.dispose();
      b.add('box','toolEdge',0,.205,0,.25,.03,.063);
      b.add('cylinder','iron',0,.14,0,.038,.15,.038);
      for(const side of [-1,1]){
        branch(b,'toolEdge',[0,.22,side*.028],[0,.40,side*.028],.008);
        branch(b,'wood',[side*.021,-.34,0],[side*.071,-.48,0],.018);
      }
      b.add('cylinder','woodLight',0,-.48,0,.024,.15,.024,0,0,Math.PI/2);
      if (kind === 'fill') b.add('rock', 'earth', 0, .27, -.055, .12, .1, .075);
    } else {
      b.add('box', kind === 'build' ? 'wood' : 'iron', 0, .22, 0, .28, .15, .13);
      for (const x of [-.13, .13]) b.add('box', 'iron', x, .22, 0, .04, .17, .15);
      b.add('box','woodLight',0,.295,0,.21,.015,.11);
      for(const x of [-.095,.095])for(const side of [-1,1])b.add('cylinder','copper',x,.22,side*.074,.014,.012,.014,Math.PI/2);
      for(let i=0;i<3;i++)b.add('cylinder','wood',0,-.34+i*.037,0,.042,.012,.042);
    }
  } else {
    b.add('box', 'trim', 0, 0, 0, .26, .34, .09, 0, 0, -.08);
    // Both broad faces carry the same high-contrast seed-and-sprout picture.
    for (const side of [-1, 1]) {
      b.add('box', 'leafDark', 0, .005, side*.052, .20, .26, .015);
      b.add('ball', 'woodLight', 0, -.071, side*.07, .036, .024, .009, 0, 0, -.25);
      branch(b, 'leafLight', [0,-.056,side*.072], [0,.062,side*.072], .009);
      b.add('ball', 'leafLight', -.039, .037, side*.075, .053, .025, .008, 0, 0, -.55);
      b.add('ball', 'leafLight', .038, .065, side*.075, .052, .025, .008, 0, 0, .55);
    }
    b.add('box', 'trim', 0, .21, 0, .26, .07, .085, 0, 0, .05);
  }
  return b.finish(`tool-${kind}`);
}

function ringGeometry(inner, outer, yInner, yOuter, count = 64) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2, c = (i + 1) / count * Math.PI * 2;
    const point = (angle, edge, y) => {
      const radius = 27 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))) + edge + Math.max(0, edge) * .13 * Math.sin(angle * 7);
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    };
    const p = point(a, inner, yInner), q = point(c, inner, yInner), r = point(a, outer, yOuter), s = point(c, outer, yOuter);
    positions.push(...p, ...q, ...r, ...q, ...s, ...r);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g;
}
export function createWorld({occupiedCells = [], hiddenLandmarks = []} = {}) {
  const b = new Batch(), colliders = [];
  const saved = occupiedCells.map(({gx,gz}) => cellFootprint(gx,gz,.20));
  const resourceCells = WILD_RESOURCES.map(({gx,gz}) => cellFootprint(gx,gz,.10));
  const free = (x,z,rx,rz=rx) => ![...saved,...resourceCells].some(a => overlaps(a,{minX:x-rx,maxX:x+rx,minZ:z-rz,maxZ:z+rz}));
  const windmill = WORLD_OBSTACLES.find(o=>o.id==='windmill');
  const windmillPlace = PLACES.find(p=>p.id==='windmill');
  const showWindmill = !!windmill && !hiddenLandmarks.includes('windmill') && !saved.some(a=>overlaps(a,windmill));
  for (const [inner, outer, y1, y2, mat] of [[0, 2, -.02, -.15, 'grass'], [2, 2.4, -.15, -.75, 'earth'], [2.4, 4, -.75, -.83, 'sand'], [4, 4.5, -.83, -1.35, 'sandDark'], [4.5, 5.8, -1.35, -1.4, 'sand'], [5.8, 7, -1.4, -2.4, 'earthDark']]) {
    const g = ringGeometry(inner, outer, y1, y2);const pos=g.attributes.position,idx=g.index?.array;const keep=[];for(let j=0;j<(idx?.length??pos.count);j+=3){const ids=[0,1,2].map(k=>idx?idx[j+k]:j+k);if(ids.every(i=>pos.getZ(i)>=27))continue;for(const i of ids)keep.push(i);}g.setIndex(keep);b.geometry(g,mat);g.dispose();
  }

  // All reachable trees and flowers are authoritative, harvestable lead-owned resources.
  let seed = 127; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 230; i++) {
    const a = random() * Math.PI * 2, r = 19 + random() * 11;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 15 && Math.abs(z) < 15 || Math.abs(x) > 27 || Math.abs(z) > 27 || !free(x,z,.35)) continue;
    // Small leaf fans occur in broad broken patches, not at snapped cell edges.
    // Leave the central part of every cultivation face clear and recognizable.
    if(Math.hypot(x-Math.round(x/2)*2,z-Math.round(z/2)*2)<.92)continue;
    if(Math.sin(x*.38+z*.16)+Math.cos(z*.43)<.2)continue;
    const h = .13 + random() * .13;
    for(let j=0;j<5;j++){
      const angle=a+j*1.256,reach=.10+(j%2)*.045;
      b.add('ball',j%3?'grassDark':'grassLight',x+Math.cos(angle)*reach,h*.45,z+Math.sin(angle)*reach,.027,h*.59,.057,.32,angle,-.27);
    }
  }
  // Broken shoreline reed beds frame the grove and mineral garden from outside bounds.
  for(const [cx,cz] of [[-28.7,8],[28.6,-12],[-18,-29]]) {
    for(let i=0;i<18;i++) {
      const x=cx+(random()-.5)*2.4,z=cz+(random()-.5)*6;
      if(Math.abs(x)<27&&Math.abs(z)<27)continue;
      const h=.3+random()*.55;
      for(let j=0;j<3;j++)b.add('cone',j%2?'grassDark':'grassLight',x+j*.065,-.7+h*.5,z+j*.07,.065,h,.05,.12,i,.17);
    }
  }
  for (let i = 0; i < 38; i++) {
    const a = i * 2.399, r = 29.5 / Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a))) + random()*3;
    const x = Math.cos(a)*r,z=Math.sin(a)*r,s=.6+random()*1.15;if(z>27&&Math.abs(x)<28)continue;
    b.add('rock', i % 2 ? 'rock' : 'rockLight', x,-.65,z,s,s*.65,s*.8,random()*.4,a);
  }
  // Raised coastal headlands sit entirely beyond the editable 54m square.
  // Layered flat terraces create a strong silhouette without changing walk height.
  const headland = (x,z,sx,sz,height) => {
    b.add('cylinder','earthDark',x,-1,z,sx,3.4,sz,0,.17);
    b.add('cylinder','rock',x,.62,z,sx*.96,.28,sz*.96,0,.17);
    b.add('cylinder','grassDark',x,.83,z,sx*.96,.16,sz*.96,0,.17);
    b.add('cylinder','earth',x-1,1.15,z-.5,sx*.82,1.5,sz*.80,0,.17);
    b.add('cylinder','grass',x-1,1.94,z-.5,sx*.83,.14,sz*.81,0,.17);
    b.add('cylinder','rock',x-1.5,(height+1.9)/2,z-.9,sx*.64,height-1.9,sz*.62,0,.17);
    b.add('cylinder','grassDark',x-1.5,height+.05,z-.9,sx*.65,.16,sz*.63,0,.17);
    for(let i=0;i<9;i++){const a=i*2.399,dx=Math.cos(a),dz=Math.sin(a);
      b.add('rock',i%3?'rock':'rockLight',x+dx*sx*.83,.65+i%3*.33,z+dz*sz*.82,1.4+i%2,.9+i%3*.4,1.2,0,a,.18);
      if(i%2)b.add('ball','leafDark',x+dx*sx*.64,2.13,z+dz*sz*.6,1.1,.55,.8,0,a);
    }
  };
  headland(-25,-38,12,10,3.2);
  headland(34,-36,12,10,5.6);
  headland(-39,16,10,13,4.2);
  for(const [x,y,z,kind,scale] of [[-31,3.33,-39,'oak',1.25],[-28,3.33,-42,'birch',1.1],
    [31,5.73,-38,'pine',1.5],[35,5.73,-40,'pine',1.2],[28,5.73,-35,'pine',1.0],
    [-42,4.33,14,'pine',1.3],[-39,4.33,18,'oak',1.0]]) {
    const t=createTree(kind);t.position.set(x,y,z);t.scale.setScalar(scale);b.absorb(t);
  }
  // Far islands form a broken horizon, well behind the taller nearby headlands.
  for (const [x,z,s] of [[-67,-82,12],[12,-100,18],[79,-42,14],[-94,24,20],[72,79,14]]) {
    b.add('rock','earthDark',x,-3.2,z,s,6,s*.7);
    b.add('rock','grassDark',x,-.5,z,s*.88,4,s*.63);
    for(let i=0;i<3;i++) b.add('cone','pine',x+(i-1)*3,1.9+i%2,z,.9,3.5,.9);
  }
  // The working clearing uses the lead's continuous ground treatment.
  // Keep organic perimeter clumps above, without grid-aligned tufts between cells.
  for (let i=0;i<60;i++) {
    const a=random()*Math.PI*2,r=40+random()*70,x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(Math.abs(x)<36&&z>-36&&z<70)continue;
    b.add('box',i%4?'waterLight':'foam',x,-2.035,z,1+random()*4,.009,.08+random()*.1,0,.1);
  }
  // Broad cloud banks give the open working meadow a composed sky.
  for (const [x,y,z,s] of [[-52,27,-65,1],[24,32,-90,1.4],[75,23,-35,.85],[-65,22,48,1.1]]) {
    for(let i=0;i<4;i++) b.add('ball','cloud',x+(i-1.5)*4*s,y+(i%2)*1.3*s,z,5*s,1.5*s,2.5*s,0,i*.6);
  }
  // Broken grassy verges suggest routes; their roots never snap to a tile grid.
  for(const place of PLACES) {
    const startX=Math.sign(place.x)*15.05,startZ=place.id==='grove'?4:-15.05;
    for(let i=0;i<24;i++) {
      const t=i/23,x=startX+(place.x-startX)*t,z=startZ+(place.z-startZ)*t;
      for(const side of [-1,1]) {
        const gx=x+side*(.75+.14*Math.sin(i*2.4)),gz=z+Math.sin(t*5)*.35;
        if(Math.abs(gx)<15&&Math.abs(gz)<15||!free(gx,gz,.22)||Math.hypot(gx-Math.round(gx/2)*2,gz-Math.round(gz/2)*2)<.92||i%3===0)continue;
        for(let j=0;j<3;j++)b.add('ball',j?'grassDark':'grassLight',gx+Math.cos(j*2.4)*.065,.07,gz+Math.sin(j*2.4)*.065,.028,.10,.045,.28,i+j,-.22);
      }
    }
  }
  // Reachable windmill only occupies the shared authoritative footprint.
  if(showWindmill) {
    b.add('cylinder','rock',windmillPlace.x,.025,windmillPlace.z,1.75,.05,1.75);
    colliders.push({...windmill});
  }
  const group = b.finish('orchard-island');
  // Water and shoreline are receivers; avoid giant shadow casters.
  group.children.forEach(mesh => { if ([M.water,M.waterLight,M.foam,M.cloud].includes(mesh.material)) mesh.castShadow=false; });
  if(showWindmill)new GLTFLoader().load('/assets/orchard-windmill.glb', gltf => {
    gltf.scene.name='authored-windmill';
    // Fit horizontal overhang as well as the tower inside the agreed 4m footprint.
    gltf.scene.rotation.y=.3;
    const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const scale=Math.min(1,3.8/Math.max(size.x,size.z));gltf.scene.scale.setScalar(scale);
    gltf.scene.position.set(windmillPlace.x-center.x*scale,.05,windmillPlace.z-center.z*scale);
    gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});group.add(gltf.scene);
  }, undefined, () => { group.userData.landmarkLoadFailed = true; });
  return {group,colliders};
}

// Residents are presentation only: the lead owns identity, home, path and root transform.
const residentRigs = new WeakMap();
// A small chamfer catches light without softening the blocky character language.
geo.residentBlock = new RoundedBoxGeometry(1,1,1,1,.09);
let residentPalettes;
function residentPalette(variant) {
  if (!residentPalettes) {
    material('residentShirt', '#eee0bd'); material('residentApron', '#527c68');
    material('residentPants', '#526475'); material('residentBoot', '#665044');
    material('residentEye', '#fff8e2'); material('residentCheek', '#cd8978');
    residentPalettes = [
      ['#e7b790','#573c2c','#c77f50'], ['#b67c52','#352b2b','#d3a656'],
      ['#85563f','#45372e','#819cb0'], ['#f0c8a2','#a36841','#b77479'],
    ].map(([skin,hair,scarf],i) => {
      material(`residentSkin${i}`,skin); material(`residentHair${i}`,hair); material(`residentScarf${i}`,scarf);
      return {skin:`residentSkin${i}`,hair:`residentHair${i}`,scarf:`residentScarf${i}`};
    });
  }
  return residentPalettes[variant];
}
let outfitPalettes;
function outfitPalette(outfit) {
  if (!outfitPalettes) outfitPalettes = [
    ['#eee0bd','#527c68','#526475','#c77f50'],
    ['#ecdfbe','#668b9f','#59677c','#d4ab65'],
    ['#e9d5be','#b47768','#655f6c','#738e69'],
    ['#d9ded0','#95845c','#586e68','#b88692'],
  ].map((colors,i)=>Object.fromEntries(['shirt','apron','pants','scarf'].map((role,j)=>[role,material(`outfit-${i}-${role}`,colors[j])])));
  return outfitPalettes[outfit];
}
export function createResident(variant = 0, outfit = 0, diver = false) {
  const index=Number.isFinite(variant)?((Math.trunc(variant)%4)+4)%4:0;
  const palette=residentPalette(index),root=new THREE.Group(),body=new THREE.Group();
  root.name='orchard-resident';root.userData.residentVariant=index;
  body.name='resident-body';root.add(body);
  const block=(b,mat,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>b.add('residentBlock',mat,x,y,z,sx,sy,sz,rx,ry,rz);
  const torso=new Batch();
  block(torso,'residentShirt',0,.824,0,.348,.446,.242);
  block(torso,'residentPants',0,.577,0,.326,.125,.236);
  // The apron has a shaped bib, hem and side ties, with visible sewn construction.
  block(torso,'residentApron',0,.746,.129,.302,.32,.036);
  block(torso,'residentApron',0,.953,.129,.218,.158,.036);
  for(const side of [-1,1]){
    block(torso,'residentApron',side*.115,.948,.11,.037,.206,.038,0,0,side*-.15);
    block(torso,'residentApron',side*.168,.827,-.018,.018,.043,.24);
    torso.add('box','trim',side*.112,1.005,.156,.024,.028,.007);
    torso.add('box','residentShirt',side*.132,.742,.15,.008,.272,.005);
  }
  torso.add('box','residentShirt',0,.599,.15,.268,.009,.006);
  block(torso,'residentShirt',.037,.740,.151,.137,.104,.011);
  block(torso,'residentApron',.037,.747,.16,.119,.088,.015);
  torso.add('box','trim',.037,.786,.171,.119,.008,.006);
  // Small embroidered leaf: a memorable work-clothes detail, not text.
  torso.add('ball','residentShirt',.024,.750,.171,.016,.007,.003,0,0,-.5);
  torso.add('ball','residentShirt',.044,.765,.171,.016,.007,.003,0,0,.5);
  torso.add('box','residentShirt',.036,.746,.172,.005,.036,.004,0,0,-.15);
  block(torso,palette.skin,0,1.075,0,.145,.106,.14);
  block(torso,palette.scarf,0,1.048,.018,.229,.057,.206);
  block(torso,palette.scarf,.079,.995,.145,.063,.130,.039,0,0,-.15);
  block(torso,palette.scarf,.044,1.029,.153,.067,.056,.054,0,0,.35);
  body.add(torso.finish('resident-torso'));

  const head=new THREE.Group();head.name='resident-head';head.position.y=1.163;body.add(head);
  const face=new Batch();
  block(face,palette.skin,0,.101,0,.354,.342,.305);
  for(const side of [-1,1]){
    block(face,palette.skin,side*.182,.083,0,.055,.087,.079);
    block(face,'residentCheek',side*.197,.084,.026,.013,.042,.025);
  }
  // Hair caps, swept locks and back shapes differ with identity, not outfit.
  block(face,palette.hair,0,.263,-.022,.388,.126,.322);
  block(face,palette.hair,0,.12,-.150,.348,.274,.043);
  if(index===0){
    for(let i=0;i<3;i++)block(face,palette.hair,-.108+i*.077,.248+i*.016,.135,.13,.075,.076,0,.08,-.11);
    block(face,palette.hair,-.173,.169,-.018,.041,.185,.271);
    block(face,palette.hair,.173,.181,-.04,.041,.144,.221);
  }else if(index===1){
    for(let i=0;i<5;i++)block(face,palette.hair,-.147+i*.073,.298+Math.sin(i)*.015,.07,.094,.079,.199,0,0,(i-2)*.05);
    for(const side of [-1,1])block(face,palette.hair,side*.175,.192,-.04,.052,.155,.205);
  }else if(index===2){
    block(face,palette.hair,-.083,.232,.153,.209,.093,.062,0,0,-.16);
    block(face,palette.hair,.098,.248,.149,.153,.066,.070,0,0,.15);
    for(const side of [-1,1])block(face,palette.hair,side*.176,.127,-.035,.055,.24,.262);
    block(face,palette.hair,0,.212,-.217,.172,.16,.11,0,0,.13);
    block(face,palette.scarf,0,.207,-.238,.181,.025,.042);
  }else{
    block(face,palette.hair,.077,.248,.139,.231,.092,.088,0,0,.19);
    block(face,palette.hair,-.116,.249,.151,.103,.063,.058,0,0,-.12);
    for(const side of [-1,1])block(face,palette.hair,side*.175,.135,-.025,.063,.23,.259,0,0,side*-.055);
  }
  // Warm cheek planes, a projecting nose and upturned smile remain readable at distance.
  for(const side of [-1,1]){
    block(face,'residentCheek',side*.114,.049,.15,.046,.019,.01);
    block(face,palette.hair,side*.074,.166,.156,.062,.014,.015,0,0,side*-.08);
    face.add('box','barkDark',side*.032,.010,.155,.022,.009,.008,0,0,side*.40);
  }
  block(face,palette.skin,0,.071,.166,.039,.043,.044);
  block(face,'barkDark',0,.004,.155,.054,.009,.008);
  head.add(face.finish('resident-face'));
  const eyes=new THREE.Group();eyes.name='resident-eyes';eyes.position.y=.111;head.add(eyes);
  const eyeParts=new Batch();
  for(const side of [-1,1]){
    block(eyeParts,'residentEye',side*.074,0,.155,.057,.057,.014);
    block(eyeParts,'black',side*.074,-.003,.166,.029,.040,.009);
    eyeParts.add('box','residentEye',side*.074-.006,.008,.172,.009,.010,.004);
  }
  eyes.add(eyeParts.finish('resident-eyes-mesh'));

  const joint=(name,parent,x,y,z=0)=>{const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;};
  const arm=side=>{
    const upper=joint(side<0?'resident-left-arm':'resident-right-arm',body,side*.217,1.009);
    let b=new Batch();block(b,'residentShirt',0,-.091,0,.123,.216,.185);
    block(b,'residentShirt',0,-.177,0,.133,.048,.194);
    b.add('box','trim',0,-.193,.091,.113,.008,.006);upper.add(b.finish('sleeve'));
    const elbow=joint('resident-elbow',upper,0,-.207);
    b=new Batch();block(b,palette.skin,0,-.068,0,.104,.153,.124);elbow.add(b.finish('forearm'));
    const hand=joint('resident-hand',elbow,0,-.166,.008);b=new Batch();
    block(b,palette.skin,0,-.029,.013,.110,.09,.133);
    block(b,palette.skin,-side*.056,-.007,.039,.044,.059,.065,0,0,side*.21);
    // Two restrained finger separations remain on the palm face, not deep cuts.
    for(const x of [-.019,.017])b.add('box','residentCheek',x,-.051,.078,.004,.021,.003);
    hand.add(b.finish('hand-mesh'));return {upper,elbow,hand};
  };
  const leg=side=>{
    const hip=joint(side<0?'resident-left-leg':'resident-right-leg',body,side*.089,.555);
    let b=new Batch();block(b,'residentPants',0,-.111,0,.143,.237,.17);hip.add(b.finish('trouser-thigh'));
    const knee=joint('resident-knee',hip,0,-.235);b=new Batch();
    block(b,'residentPants',0,-.095,0,.133,.204,.157);
    block(b,'residentShirt',0,-.187,0,.138,.028,.166);knee.add(b.finish('trouser-calf'));
    const ankle=joint('resident-ankle',knee,0,-.219);b=new Batch();
    block(b,'residentBoot',0,-.034,.033,.158,.117,.231);
    block(b,'residentBoot',0,-.052,.099,.164,.082,.127);
    block(b,'barkDark',0,-.089,.045,.17,.025,.249);
    for(const y of [-.004,-.025])b.add('box','trim',0,y,.146,.068,.006,.004);
    ankle.add(b.finish('resident-boot'));return {hip,knee,ankle};
  };
  if(diver){
    if(!M.diverCream){material('diverCream','#e8dfb6',.42,.15);material('diverBrass','#b38b53',.36,.5);material('diverTeal','#448d89',.48,.15);}
    const helmet=new Batch();
    // Open front frame keeps the friendly eyes and smile clear; back/crown enclose the head.
    block(helmet,'diverCream',0,.315,-.012,.455,.16,.435);
    block(helmet,'diverCream',0,.293,.195,.450,.085,.078);
    block(helmet,'diverCream',0,.12,-.218,.441,.43,.055);
    for(const side of [-1,1]){
      block(helmet,'diverCream',side*.222,.12,-.017,.055,.43,.42);
      block(helmet,'diverBrass',side*.220,.10,.211,.045,.350,.036);
      helmet.add('cylinder','diverBrass',side*.258,.13,-.025,.051,.035,.051,0,0,Math.PI/2);
      helmet.add('cylinder','diverTeal',side*.279,.13,-.025,.028,.012,.028,0,0,Math.PI/2);
    }
    for(const y of [-.072,.281])block(helmet,'diverBrass',0,y,.211,.455,.038,.038);
    block(helmet,'diverTeal',0,-.087,-.013,.435,.065,.390);
    block(helmet,'diverBrass',0,-.116,.004,.335,.024,.310);
    block(helmet,'diverTeal',0,-.142,.012,.287,.040,.259);
    // A restrained visor reflection at the edge, without a screen over the face.
    block(helmet,'diamondLight',-.188,.169,.236,.009,.164,.004,0,0,-.07);
    helmet.add('ball','diamondLight',.145,.304,.216,.018,.013,.008);
    head.add(helmet.finish('diver-helmet'));
    const gear=new Batch();
    for(const side of [-1,1]){
      gear.add('cylinder','diverTeal',side*.082,.833,-.216,.071,.344,.071);
      gear.add('ball','diverCream',side*.082,1.003,-.216,.071,.04,.071);
      block(gear,'diverBrass',side*.082,.82,-.219,.149,.04,.15);
      block(gear,'diverTeal',side*.131,.88,.156,.028,.27,.026,0,0,side*-.1);
    }
    block(gear,'diverBrass',0,.745,.171,.052,.04,.02);
    gear.add('cylinder','diverCream',-.102,.940,.183,.039,.021,.039,Math.PI/2);
    gear.add('box','barkDark',-.102,.945,.196,.008,.032,.003,0,0,.45);
    body.add(gear.finish('diver-pack-and-straps'));
  }
  const leftArm=arm(-1),rightArm=arm(1),leftLeg=leg(-1),rightLeg=leg(1),clothes=[];
  const roles=new Map([[M.residentShirt,'shirt'],[M.residentApron,'apron'],[M.residentPants,'pants'],[M[palette.scarf],'scarf']]);
  root.traverse(o=>{if(o.isMesh&&roles.has(o.material))clothes.push([o,roles.get(o.material)]);});
  residentRigs.set(root,{body,head,eyes,leftArm,rightArm,leftLeg,rightLeg,clothes,lastTime:null,gaitPhase:0,weights:{walk:0,wave:0,sit:0,look:0,celebrate:0}});
  setResidentOutfit(root,outfit);animateResident(root);return root;
}
export function setResidentOutfit(group, outfit = 0) {
  const rig=residentRigs.get(group);if(!rig)return;
  const index=Number.isFinite(outfit)?((Math.trunc(outfit)%4)+4)%4:0,palette=outfitPalette(index);
  for(const [mesh,role] of rig.clothes)mesh.material=palette[role];
  group.userData.outfit=index;
}
export function animateResident(group,{time=0,walk=0,wave=0,sit=0,look=0,celebrate=0,moveSpeed=.6,diver=false}={}) {
  const r=residentRigs.get(group);if(!r)return;
  const t=Number.isFinite(time)?time:0,dt=r.lastTime===null?1:Math.max(0,Math.min(.1,t-r.lastTime));r.lastTime=t;
  const blend=1-Math.exp(-dt*10);
  const smooth=(key,value)=>r.weights[key]+=(THREE.MathUtils.clamp(Number.isFinite(value)?value:0,0,1)-r.weights[key])*blend;
  const s=smooth('sit',sit),w=smooth('walk',walk)*(1-s),g=smooth('wave',wave),l=smooth('look',look),j=smooth('celebrate',celebrate)*(1-s);
  r.gaitPhase+=dt*Math.PI*Math.max(0,Math.min(1.2,moveSpeed))/.22*w;
  const phase=r.gaitPhase,stride=Math.sin(phase);
  r.body.position.y=-.384*s+Math.abs(Math.sin(phase))*.008*w;
  r.body.rotation.z=0;r.body.rotation.x=0;
  r.head.rotation.set(Math.sin(t*1.15)*.021+.32*l,Math.sin(t*.68)*(.05+.16*l),-.028*g+Math.sin(t)*.012);
  const blink=t%4.8;r.eyes.scale.y=blink>4.58?Math.max(.08,Math.abs(blink-4.69)/.11):1;
  const poseLeg=(rig,offset)=>{
    const u=((phase+offset)/(2*Math.PI))%1,swing=Math.max(0,(u-.5)*2);
    const footZ=u<.5?.11-.44*u:-.11+.22*swing*swing*(3-2*swing),lift=Math.sin(swing*Math.PI);
    // Small heel-to-toe steps with two-bone knee bend; foot stays level on support.
    const z=footZ*w+.377*s,ankleY=.103+.053*lift*w+.001*s;
    const dy=.555+r.body.position.y-ankleY,dz=z;
    const distance=Math.min(.4539,Math.max(.08,Math.hypot(dy,dz))),a=.235,b=.219;
    const knee=Math.PI-Math.acos(THREE.MathUtils.clamp((a*a+b*b-distance*distance)/(2*a*b),-1,1));
    const hip=-Math.atan2(dz,dy)-Math.acos(THREE.MathUtils.clamp((a*a+distance*distance-b*b)/(2*a*distance),-1,1));
    rig.hip.rotation.x=hip;rig.knee.rotation.x=knee;rig.ankle.rotation.x=-hip-knee;
  };
  poseLeg(r.leftLeg,0);poseLeg(r.rightLeg,Math.PI);
  const armPose=(a,side)=>{
    const greet=side>0?g:0,joy=j*(1-greet);
    a.upper.rotation.set(side*stride*.25*w-.22*l-.22*s-1.65*greet-1.75*joy,0,side*(.025+.34*greet+.20*joy));
    a.elbow.rotation.x=-.09-.13*w-.78*s-.48*l-.64*greet-.48*joy;
    a.hand.rotation.set(Math.sin(t*7)*.13*greet,Math.sin(t*6)*.22*greet,side*Math.sin(t*5)*.11*greet);
  };
  armPose(r.leftArm,-1);armPose(r.rightArm,1);
  if(diver){
    r.body.position.y+=.035+Math.sin(t*1.7)*.018;
    r.leftArm.upper.rotation.x-=.24;r.rightArm.upper.rotation.x-=.24;
    r.leftArm.elbow.rotation.x-=.22;r.rightArm.elbow.rotation.x-=.22;
    r.leftLeg.knee.rotation.x+=.10;r.rightLeg.knee.rotation.x+=.10;
  }
}
