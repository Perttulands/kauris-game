import * as THREE from 'three';
import {createWorld,createTree,animateTree,createBuildPiece,createTool} from './visuals.js';
import {SAVE_KEY,SEEDS,PIECES,MATERIALS,cellKey,freshState,dig,plant,fill,water,tick,harvest,validateBuild,build,remove,serialize,deserialize} from './state.js';
import {WILD_RESOURCES,PLACES} from './world-data.js';
import {liveWild,activeObstacles,harvestWild,worldBlocked} from './state.js';
import {advanceChop,wheelStep} from './interaction.js';
import {createPictures} from './previews.js';
import {icon} from './icons.js';
import {findHomes,houseReadiness} from './residents.js';
import {createResidentSystem} from './resident-runtime.js';
import {activeDiscoveries,seedUnlocked,isFlower,setOutfit} from './garden.js';
import {createGardenSystem} from './garden-runtime.js';
import {createAudio} from './audio.js';
import {TERRAIN,terrainHeight,inWorld,buildBase} from './terrain.js';
import {wallLike,baseOf,canonicalPiece,adjacentCells,buildingBoxes as boxes,touches} from './building.js';
import {swimmingAt,verticalStep} from './movement.js';
import {createOceanWorld,createMarineAnimal,animateMarineAnimal} from './ocean-visuals.js';
import {createMeadowCover,animateMeadowCover} from './meadow-visuals.js';
import './ui.css';
const $=id=>document.getElementById(id), canvas=$('game');
let state=freshState(),loadWarning='';
try{const raw=localStorage.getItem(SAVE_KEY);if(raw)state=deserialize(raw);}catch{loadWarning='Saved meadow could not be read. A fresh meadow is running; old save kept until you act.';}
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b7d7d7');scene.fog=new THREE.Fog('#b7d7d7',38,118);
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.05,180);camera.rotation.order='YXZ';scene.add(camera);
const hemi=new THREE.HemisphereLight('#dceceb','#5f7466',1.5);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff3df',2.0);sun.position.set(-24,38,16);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:1,far:110});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;scene.add(sun);
const pictures=createPictures(renderer);
const picture=(key,label)=>`<img class="modelPicture" src="${pictures[key]}" alt="${label}" draggable="false">`;
const world=createWorld({occupiedCells:[...Object.values(state.plots),...state.buildings,...activeDiscoveries(state).flatMap(d=>{const cells=[];for(let gx=Math.floor(d.bounds.minX/2);gx<=Math.ceil(d.bounds.maxX/2);gx++)for(let gz=Math.floor(d.bounds.minZ/2);gz<=Math.ceil(d.bounds.maxZ/2);gz++)cells.push({gx,gz});return cells;})],hiddenLandmarks:state.worldHidden});scene.add(world.group);
const ocean=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight});scene.add(ocean);
// A separate invisible ray surface shares the same sampled height as ocean scenery.
const seabedGeo=new THREE.PlaneGeometry(53.3,39,54,78).rotateX(-Math.PI/2).translate(0,0,46.5);
const seabedPos=seabedGeo.attributes.position;for(let i=0;i<seabedPos.count;i++)seabedPos.setY(i,terrainHeight(seabedPos.getX(i),seabedPos.getZ(i)));seabedGeo.computeVertexNormals();
const seabed=new THREE.Mesh(seabedGeo,new THREE.MeshBasicMaterial({visible:false}));seabed.userData.seabed=true;scene.add(seabed);
const waterSurface=new THREE.Mesh(new THREE.PlaneGeometry(500,500).rotateX(-Math.PI/2),new THREE.MeshPhysicalMaterial({color:'#58bdbe',roughness:.23,metalness:.08,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}));waterSurface.position.set(0,TERRAIN.waterY,0);scene.add(waterSurface);
const seaLight=new THREE.HemisphereLight('#b5eee5','#27616a',.65);seaLight.position.set(0,0,52);scene.add(seaLight);
const marine=[];for(let i=0;i<12;i++){const model=createMarineAnimal('fish',i%2);model.position.set((i%3-1)*6,-4.7,48+Math.floor(i/3)*3);scene.add(model);marine.push({model,index:i});}
let cover=null,coverKey='';
function syncCover(){
 const excludedCells=[...Object.values(state.plots),...state.buildings.flatMap(adjacentCells),...activeDiscoveries(state).flatMap(d=>{const a=[];for(let gx=Math.floor(d.bounds.minX/2);gx<=Math.ceil(d.bounds.maxX/2);gx++)for(let gz=Math.floor(d.bounds.minZ/2);gz<=Math.ceil(d.bounds.maxZ/2);gz++)a.push({gx,gz});return a;})];
 const key=excludedCells.map(p=>`${p.gx},${p.gz}`).sort().join(';');if(key===coverKey&&cover)return;coverKey=key;
 if(cover){scene.remove(cover);const materials=new Set();cover.traverse(o=>{if(o.isMesh&&cover.userData.privateResources){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>m.dispose());}
 cover=createMeadowCover({excludedCells});scene.add(cover);
}
// One continuous meadow map spans all cells; digging only lowers the existing tile.
// Broad turf variation and a few worn patches avoid repeating a texture per block.
const grassCanvas=document.createElement('canvas');grassCanvas.width=grassCanvas.height=512;
const grassContext=grassCanvas.getContext('2d'),grassPixels=grassContext.createImageData(512,512);
const wornPatches=[[-9,-7,3.8,2.2],[7,-12,4.2,2.4],[-19,12,2.8,4],[19,6,3,5]];
const meadowRoutes=[...PLACES,...activeDiscoveries(state),{x:0,z:27}].map(p=>({vx:p.x,vz:p.z-9,len:Math.hypot(p.x,p.z-9)}));
for(let y=0;y<512;y++)for(let x=0;x<512;x++){
 const wx=x/511*54-27,wz=(1-y/511)*54-27;
 // Large connected grass patches and quiet, winding earth routes stay continuous.
 const broad=Math.sin(wx*.23+Math.sin(wz*.16))*Math.cos(wz*.21),cool=(Math.sin(wx*.31-wz*.18)+Math.cos(wz*.27+wx*.09))*.5;
 let worn=0;for(const [px,pz,rx,rz] of wornPatches){const dx=(wx-px)/rx,dz=(wz-pz)/rz;worn=Math.max(worn,Math.exp(-(dx*dx+dz*dz)*1.7));}
 worn*=.44+.13*Math.sin(wx*1.3+wz*.8)*Math.cos(wz*1.1);
 let path=0,verge=0;for(let route=0;route<meadowRoutes.length;route++){
  const {vx,vz,len}=meadowRoutes[route],ax=0,az=9,t=Math.max(0,Math.min(1,((wx-ax)*vx+(wz-az)*vz)/(len*len)));
  const bend=Math.sin(t*Math.PI)*(route%2?1.6:-1.8),cx=ax+t*vx-vz/len*bend,cz=az+t*vz+vx/len*bend,distance=Math.hypot(wx-cx,wz-cz),width=.55+.16*Math.sin(t*7+route),irregular=.08*Math.sin(wx*2.1+wz*.8);
  path=Math.max(path,Math.exp(-Math.pow(Math.max(0,distance+irregular)/width,2)*1.25)*(.68+.1*t));
  verge=Math.max(verge,Math.exp(-Math.pow((distance-width*1.4)/.52,2))*.23);
 }
 const earth=Math.max(worn,path),i=(y*512+x)*4;
 const green=[96+broad*10+cool*4,147+broad*9+cool*6,91+broad*8+cool*9];
 grassPixels.data[i]=green[0]*(1-earth)+153*earth-verge*15;
 grassPixels.data[i+1]=green[1]*(1-earth)+135*earth-verge*8;
 grassPixels.data[i+2]=green[2]*(1-earth)+99*earth-verge*3;
 grassPixels.data[i+3]=255;
}
grassContext.putImageData(grassPixels,0,0);
const grassTexture=new THREE.CanvasTexture(grassCanvas);grassTexture.colorSpace=THREE.SRGBColorSpace;grassTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const tileGeometry=new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2).translate(0,.35,0),tileMaterial=new THREE.MeshStandardMaterial({color:0xffffff,map:grassTexture,roughness:1});
// Top faces share exact edges without coincident internal vertical faces.
// World-space UVs stay continuous across adjacent cells and unchanged when lowered.
tileMaterial.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 meadowUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nmeadowUv = ((instanceMatrix * vec4(position, 1.0)).xz + 27.0) / 54.0;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 meadowUv;').replace('#include <map_fragment>','diffuseColor *= texture2D(map, meadowUv);');
};
const ground=new THREE.InstancedMesh(tileGeometry,tileMaterial,27*27);ground.receiveShadow=true;ground.userData.ground=true;scene.add(ground);
const dirtMaterial=new THREE.MeshStandardMaterial({color:'#7c6040',roughness:1});
const earth=new THREE.Mesh(new THREE.BoxGeometry(54,1.5,54),dirtMaterial);earth.position.y=-1.45;earth.receiveShadow=true;scene.add(earth);
for(const [x,z,turn] of [[0,-27,0],[27,0,1],[-27,0,1]]){
 const skirt=new THREE.Mesh(new THREE.BoxGeometry(54,.7,.02),dirtMaterial);skirt.position.set(x,-.35,z);skirt.rotation.y=turn*Math.PI/2;skirt.receiveShadow=true;scene.add(skirt);
}
const holeWallGeometry=new THREE.BoxGeometry(2,.6,.012);
const matrix=new THREE.Matrix4();let n=0;const groundCells=[];
for(let gx=-13;gx<=13;gx++)for(let gz=-13;gz<=13;gz++){
 groundCells.push({gx,gz});matrix.makeTranslation(gx*2,-.35,gz*2);ground.setMatrixAt(n,matrix);
 n++;
}
const plantMeshes=new Map(),buildMeshes=new Map(),wildMeshes=new Map();let interactive=[ground];
const tileOutline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.98,.04,1.98)),new THREE.LineBasicMaterial({color:'#f7e5a3'}));scene.add(tileOutline);
const plotMaterial=new THREE.MeshStandardMaterial({color:'#795a37',roughness:.96});
const plotGeometry=new THREE.BoxGeometry(1.82,.035,1.82);
const plotsGroup=new THREE.Group();scene.add(plotsGroup);
const tools=[{key:'shovel',name:'Dig',icon:'♧'},{key:'seed',name:'Seeds',icon:'✤'},{key:'fill',name:'Fill',icon:'▰'},{key:'hose',name:'Water',icon:'≈'},{key:'axe',name:'Harvest',icon:'⌁'},{key:'build',name:'Build',icon:'⌂'},{key:'remove',name:'Remove',icon:'↶'}];
let fallbackLook=false,rightDrag=false;
let tool=0,seedIndex=0,pieceIndex=0,materialIndex=0,rotation=0,level=0,toolMesh,preview;
const seedKeys=Object.keys(SEEDS),pieceKeys=Object.keys(PIECES);
let yaw=state.player.yaw,pitch=state.player.pitch,feet=state.player.y??0,vy=0,locked=false,held=false,catalogOpen=false,started=false,dirty=false,lastSave=0,elapsed=0,target=null,swing=0,toastUntil=0;
const pos=new THREE.Vector3(state.player.x,0,state.player.z),keys=new Set();
const waterPositions=new Float32Array(28*3),waterGeometry=new THREE.BufferGeometry();waterGeometry.setAttribute('position',new THREE.BufferAttribute(waterPositions,3));
const stream=new THREE.Points(waterGeometry,new THREE.PointsMaterial({color:'#c5faff',size:.055,transparent:true,opacity:.95}));stream.frustumCulled=false;stream.visible=false;scene.add(stream);
const sparks=[],falling=[];const audio=createAudio();let garden;let outfitResident=null;let nearestFriend=null;
let residents;
const chop={},wheel={};let chopProgress=0,totalImpacts=0,rewardUntil=0,failureUntil=0,lastCue="";
function resetActions(){held=false;advanceChop(chop,null,0);chopProgress=0;wheelStep(wheel,0,0,0,false);}
function toast(text){$('toast').textContent=text;toastUntil=elapsed+3;$('toast').classList.add('show');}
function save(){
 if(!dirty)return;
 state.player={x:pos.x,y:feet,z:pos.z,yaw,pitch};
 try{localStorage.setItem(SAVE_KEY,serialize(state));$('saveStatus').textContent=fallbackLook?'Saved · Arrow keys / right-drag look':'Saved on this browser';dirty=false;}catch{$('saveStatus').textContent='Save unavailable — keep this tab open';}
}
function sync(){
 residents?.sync();garden?.sync();syncCover();
 const available=liveWild(state);
 for(const [id,g] of wildMeshes)if(!available.some(r=>r.id===id)){scene.remove(g);wildMeshes.delete(id);}
 for(const r of available)if(!wildMeshes.has(r.id)){
  const g=createTree(r.kind);g.position.set(r.gx*2,0,r.gz*2);g.rotation.y=r.yaw;g.scale.setScalar(r.scale);g.userData.wildId=r.id;g.traverse(o=>{if(o.isMesh)o.userData.wildId=r.id;});wildMeshes.set(r.id,g);scene.add(g);
 }

 for(let i=0;i<groundCells.length;i++){const c=groundCells[i],p=state.plots[cellKey(c.gx,c.gz)];matrix.makeTranslation(c.gx*2,p?.phase==='hole'?-.95:-.35,c.gz*2);ground.setMatrixAt(i,matrix);}ground.instanceMatrix.needsUpdate=true;
 for(const [k,g] of plantMeshes)if(!state.plots[k]?.seed){scene.remove(g);plantMeshes.delete(k);}
 plotsGroup.clear();
 for(const [k,p] of Object.entries(state.plots)){
  if(p.phase==='hole')for(const [dx,dz,turn] of [[0,1,0],[0,-1,0],[1,0,1],[-1,0,1]]){
   if(state.plots[cellKey(p.gx+dx,p.gz+dz)]?.phase==='hole')continue;
   const wall=new THREE.Mesh(holeWallGeometry,dirtMaterial);wall.position.set(p.gx*2+dx,-.3,p.gz*2+dz);wall.rotation.y=turn*Math.PI/2;wall.receiveShadow=true;plotsGroup.add(wall);
  }
  const soil=new THREE.Mesh(plotGeometry,plotMaterial);soil.position.set(p.gx*2,p.phase==='hole'?-.59:.012,p.gz*2);soil.receiveShadow=true;plotsGroup.add(soil);
  if(p.seed&&!plantMeshes.has(k)){const tree=createTree(p.seed,{variation:p.variation??0});tree.userData.perchHeight=new THREE.Box3().setFromObject(tree).max.y-.15;tree.position.set(p.gx*2,p.phase==='hole'?-.5:0,p.gz*2);tree.userData.plot=k;tree.traverse(o=>{if(o.isMesh)o.userData.plot=k;});scene.add(tree);plantMeshes.set(k,tree);}
  const tree=plantMeshes.get(k);if(tree)tree.position.y=p.phase==='hole'?-.5:0;
 }
 for(const [id,g] of buildMeshes)if(!state.buildings.some(b=>b.id===id)){scene.remove(g);buildMeshes.delete(id);}
 for(const b of state.buildings)if(!buildMeshes.has(b.id)){const g=createBuildPiece(b.kind,b.material);g.position.set(b.gx*2,baseOf(b)+b.level*2.4,b.gz*2);g.rotation.y=b.rotation*Math.PI/2;g.traverse(o=>{if(o.isMesh)o.userData.buildId=b.id;});scene.add(g);buildMeshes.set(b.id,g);}
 interactive=[ground,seabed,...plantMeshes.values(),...wildMeshes.values(),...buildMeshes.values()];updateHUD();
}
function selectedBuild(){
 if(!target)return null;
 let gx=target.gx,gz=target.gz;const kind=pieceKeys[pieceIndex],axis=rotation%2;
 if(wallLike({kind})){
  // Pick the near/far physical boundary from aim; rotate chooses just the wall axis.
  if(axis===0&&target.point.z>gz*2)gz++;
  if(axis===1&&target.point.x>gx*2)gx++;
 }
 return {gx,gz,kind,material:MATERIALS[materialIndex],rotation:wallLike({kind})?axis:rotation,level,baseY:target.baseY??buildBase(target.gx,target.gz)??terrainHeight(target.point.x,target.point.z)};
}
function rotateChoice(){rotation=(rotation+1)%(wallLike({kind:pieceKeys[pieceIndex]})?2:4);updateHUD();}
function intersectsPlayer(b){return boxes(b).some(a=>touches(a,pos.x,pos.z)&&a.maxY>feet+.3&&a.minY<feet+1.65);}
function canWalk(x,z){
 if(!inWorld(x,z))return false;
 for(const b of state.buildings)for(const a of boxes(b))if(touches(a,x,z)&&a.maxY>feet+.31&&a.minY<feet+1.65)return false;
 for(const p of Object.values(state.plots))if(p.growth>.3&&!isFlower(p.seed)&&Math.hypot(x-p.gx*2,z-p.gz*2)<.24+.2*p.growth)return false;
 for(const r of liveWild(state))if(!isFlower(r.kind)&&Math.hypot(x-r.gx*2,z-r.gz*2)<.6)return false;
 for(const a of [...world.colliders??[],...activeDiscoveries(state).flatMap(d=>d.solids)])if(touches(a,x,z)&&feet<a.height)return false;
 return true;
}
function residentCanStand(x,z,baseY=0){
 if(!inWorld(x,z)||Math.abs(terrainHeight(x,z)-baseY)>.25)return false;
 const floor=state.buildings.some(b=>b.kind==='floor'&&baseOf(b)===baseY&&b.level===0&&Math.abs(x-b.gx*2)<1&&Math.abs(z-b.gz*2)<1);
 if(!floor&&state.plots[cellKey(Math.round(x/2),Math.round(z/2))]?.phase==='hole')return false;
 for(const b of state.buildings)for(const a of boxes(b))if(touches(a,x,z,.31)&&a.maxY>baseY+.3&&a.minY<baseY+1.7)return false;
 for(const p of Object.values(state.plots))if(p.growth>.3&&!isFlower(p.seed)&&Math.hypot(x-p.gx*2,z-p.gz*2)<.31+.2*p.growth)return false;
 for(const r of liveWild(state))if(!isFlower(r.kind)&&Math.hypot(x-r.gx*2,z-r.gz*2)<.67)return false;
 for(const a of [...world.colliders??[],...activeDiscoveries(state).flatMap(d=>d.solids)])if(touches(a,x,z,.31))return false;
 return true;
}
function residentFloor(x,z,baseY=0){return state.buildings.some(b=>b.kind==='floor'&&baseOf(b)===baseY&&b.level===0&&Math.abs(x-b.gx*2)<1&&Math.abs(z-b.gz*2)<1)?baseY+.15:terrainHeight(x,z);}
function floorAt(x,z){let f=state.plots[cellKey(Math.round(x/2),Math.round(z/2))]?.phase==='hole'?-.6:terrainHeight(x,z);
 for(const b of state.buildings)if(b.kind==='floor'||b.kind==='roof')for(const a of boxes(b))if(touches(a,x,z,.1)&&a.maxY<=feet+.31)f=Math.max(f,a.maxY);return f;}
function placeTool(){if(toolMesh)toolMesh.position.set(Math.min(.43,Math.tan(camera.fov*Math.PI/360)*.72*camera.aspect*(camera.aspect<1?.4:.76)),camera.aspect<1?-.31:-.42,-.72);}
function chooseTool(i){resetActions();tool=i;swing=0;if(toolMesh)camera.remove(toolMesh);toolMesh=createTool(tools[i].key);toolMesh.scale.setScalar(i===3?.38:.55);placeTool();toolMesh.rotation.set(-.12,-.22,-.08);camera.add(toolMesh);if(preview){scene.remove(preview);preview.traverse(o=>{if(o.isMesh)o.material.dispose();});preview=null;}if(tool===5){preview=createBuildPiece(pieceKeys[pieceIndex],MATERIALS[materialIndex]);preview.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshBasicMaterial({color:'#e1f4a9',transparent:true,opacity:.4,depthWrite:false});o.castShadow=false;}});scene.add(preview);}updateHUD();}
function cycle(delta){if(tool===5){pieceIndex=(pieceIndex+delta+pieceKeys.length)%pieceKeys.length;level=pieceKeys[pieceIndex]==='roof'?1:0;}else{do{seedIndex=(seedIndex+delta+seedKeys.length)%seedKeys.length;}while(!seedUnlocked(state,seedKeys[seedIndex]));if(tool!==1)tool=1;}chooseTool(tool);}
function browse(delta){if(tool===1||tool===5)cycle(delta);else chooseTool((tool+delta+tools.length)%tools.length);}
function updateHUD(){
 $('resources').innerHTML=Object.entries(state.inventory).map(([k,v])=>`<div class="resource" title="${k}" aria-label="${v} ${k}">${icon(k)}<span>${k}</span><b>${v}</b></div>`).join('');
 $('toolbar').innerHTML=tools.map((t,i)=>`<button class="${i===tool?'active':''}" data-tool="${i}" aria-label="${t.name}" aria-pressed="${i===tool}"><small>${i+1}</small><span class="toolPic">${['seed','fill','build','remove'].includes(t.key)?icon(t.key):picture('tool:'+t.key,t.name)}</span>${t.name}</button>`).join('');
 $('toolbar').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseTool(Number(b.dataset.tool)));
 const spec=SEEDS[seedKeys[seedIndex]],part=PIECES[pieceKeys[pieceIndex]];
 $('selectedName').textContent=tool===1?`${spec.name} seed`:tool===5?`${part.name} · ${MATERIALS[materialIndex]}`:tools[tool].name;
 $('selectedPicture').innerHTML=picture(tool===1?'seed:'+seedKeys[seedIndex]:tool===5?`piece:${pieceKeys[pieceIndex]}:${MATERIALS[materialIndex]}`:'tool:'+tools[tool].key,$('selectedName').textContent);
 $('selectedDetail').textContent=tool===1?'Wheel / Q E · choose what grows':tool===5?`${part.cost} ${MATERIALS[materialIndex]} · level ${level}`:tool===4?'Hold to chop · flowers gather gently':tool===3?'Hold to give a drink':'Click to use · wheel changes tools';
 $('buildActions').hidden=tool!==5;
 if(tool===5){$('buildActions').innerHTML=`<button id="changeMaterial" aria-label="Change building material">${icon(MATERIALS[materialIndex])}</button><button id="rotatePiece" aria-label="Rotate building piece">${icon('rotate')}</button><button id="lowerPiece" aria-label="Lower building level">−</button><button id="raisePiece" aria-label="Raise building level">+</button>`;$('changeMaterial').onclick=()=>{materialIndex=(materialIndex+1)%MATERIALS.length;chooseTool(5);};$('rotatePiece').onclick=()=>{rotateChoice();};$('lowerPiece').onclick=()=>{level=Math.max(0,level-1);updateHUD();};$('raisePiece').onclick=()=>{level=Math.min(3,level+1);updateHUD();};}
 updateJournal();
}
const steps=[['shovel',0,'Dig'],['seed',1,'Sow'],['fill',2,'Cover'],['hose',3,'Water'],['grow',null,'Grow'],['axe',4,'Gather'],['build',5,'Build']];
function stageFor(p){return !p?0:p.phase==='hole'?(p.seed?2:1):p.seed?(p.growth>=1?5:p.water<.2?3:4):0;}
function contextStage(){if(target?.wildId)return 5;const p=target&&state.plots[cellKey(target.gx,target.gz)];if(p)return stageFor(p);if(state.stats.harvested>0)return 6;const active=Object.values(state.plots).find(p=>p.growth<1);return active?stageFor(active):0;}
function setupPictures(){
 $('menuButton').innerHTML=icon('book')+'<kbd>Tab</kbd>';$('closeCatalog').innerHTML=icon('back')+icon('play');$('start').innerHTML=icon('play')+'<span>Play</span>';
 $('welcomePictures').innerHTML=icon('seed')+icon('grow')+picture('seed:oak','Oak tree')+icon('build')+picture('piece:roof:wood','Build a house');
 $('loopGuide').innerHTML=steps.map(([name,tool,label],i)=>`<button data-step="${i}" aria-label="${label}" title="${label}">${icon(name)}</button>`).join('');
 $('loopGuide').querySelectorAll('button').forEach(b=>b.onclick=()=>{const t=steps[Number(b.dataset.step)][1];if(t!==null)chooseTool(t);});
 $('catalogLoop').innerHTML=steps.map(([name,,label],i)=>(i?'→':'')+`<span>${icon(name)}${label}</span>`).join('');
 $('previousChoice').onclick=()=>browse(-1);$('nextChoice').onclick=()=>browse(1);
}
function updateJournal(){
 let title='Make something from a seed.',detail='Dig → sow → fill → water → harvest → build';
 if(state.stats.harvested>0){title='Build a place of your own.';detail=`${state.stats.harvested} harvests · ${state.buildings.length} building pieces · Tab for field guide`;}
 else if(state.stats.planted>0){
  const planted=Object.values(state.plots).filter(p=>p.seed),aimed=target&&state.plots[cellKey(target.gx,target.gz)];
  if(aimed?.growth>=1||planted.every(p=>p.growth>=1)){title='Your harvest is ready.';detail='Choose the axe [5] and click a mature plant.';}
  else if(planted.some(p=>p.phase==='hole')){title='Tuck your seed into the soil.';detail='Choose fill [3], then hold the hose [4].';}
  else if(planted.some(p=>p.growth<1&&p.water<.2)){title='Give your seed a little water.';detail='Hold the watering can [4] on the soil until it is well watered.';}
  else{title='Watch your garden grow.';detail='Keep soil moist. Harvest [5] when fully grown.';}
 }
 const stage=contextStage();$('loopGuide').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('current',i===stage);b.classList.toggle('next',i===stage+1);});
 $('objective').textContent=title;$('journalText').textContent=detail;
}
function showCatalog(show=true){if(show){audio.pause();clearEffects();}resetActions();$('wardrobe').hidden=true;outfitResident=null;catalogOpen=show;$('catalog').hidden=!show;held=false;keys.clear();if(show){locked=false;document.exitPointerLock?.();$('overlay').hidden=true;renderCatalog();}else{requestLock();}}
function renderCatalog(){
 $('seedCards').innerHTML=seedKeys.map((k,i)=>{const s=SEEDS[k],unlocked=seedUnlocked(state,k);return `<button ${unlocked?'':'disabled'} class="card ${unlocked?'':'seedLocked'} ${i===seedIndex?'chosen':''}" data-seed="${i}" aria-label="Plant ${s.name}" aria-pressed="${i===seedIndex}">${picture('seed:'+k,s.name+' tree when grown')}${unlocked?'':`<span class="chosenMark">${icon('lock')}</span>`}${i===seedIndex?`<span class="chosenMark">${icon('check')}</span>`:''}<b>${s.name}</b><small>${icon(s.resource)} +${s.yield}</small></button>`;}).join('');
 $('pieceCards').innerHTML=pieceKeys.map((k,i)=>`<button class="card ${i===pieceIndex?'chosen':''}" data-piece="${i}" aria-label="Build ${PIECES[k].name}">${picture(`piece:${k}:${MATERIALS[materialIndex]}`,PIECES[k].name)}<b>${PIECES[k].name}</b><small>${icon(MATERIALS[materialIndex])} ${PIECES[k].cost}</small></button>`).join('');
 $('materialCards').innerHTML=MATERIALS.map((m,i)=>`<button data-material="${i}" class="${i===materialIndex?'chosen':''}" aria-label="Use ${m}" aria-pressed="${i===materialIndex}">${picture('piece:wall:'+m,m)}${m}</button>`).join('');
 $('seedCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{seedIndex=Number(b.dataset.seed);chooseTool(1);showCatalog(false);});
 $('pieceCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{pieceIndex=Number(b.dataset.piece);level=pieceKeys[pieceIndex]==='roof'?1:0;chooseTool(5);showCatalog(false);});
 $('materialCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{materialIndex=Number(b.dataset.material);chooseTool(5);renderCatalog();});
}
function setupLivingUI(){
 const mute=$('muteButton');const refresh=()=>{mute.innerHTML=icon(audio.muted?'mute':'sound');mute.setAttribute('aria-label',audio.muted?'Enable sounds':'Mute sounds');mute.setAttribute('aria-pressed',String(audio.muted));};refresh();mute.onclick=()=>{audio.toggle();refresh();};
 $('friendButton').innerHTML=icon('shirt')+'<kbd>F</kbd>';$('friendButton').onclick=()=>{if(nearestFriend)openWardrobe(nearestFriend.id);};
 $('closeWardrobe').innerHTML=icon('play');$('closeWardrobe').onclick=requestLock;
}
function openWardrobe(id){
 const r=state.residents.find(r=>r.id===id);if(!r)return;
 resetActions();audio.pause();clearEffects();locked=false;catalogOpen=true;keys.clear();outfitResident=id;$('catalog').hidden=true;$('overlay').hidden=true;$('wardrobe').hidden=false;document.exitPointerLock?.();
 $('outfitCards').innerHTML=[0,1,2,3].map(o=>`<button class="outfitCard ${o===(r.outfit??0)?'chosen':''}" data-outfit="${o}" aria-label="Clothing ${o+1}" aria-pressed="${o===(r.outfit??0)}">${picture(`${r.habitat==='ocean'?'diver':'resident'}:${r.variant}:${o}`,'Clothing choice '+(o+1))}${icon(o===(r.outfit??0)?'check':'shirt')}</button>`).join('');
 $('outfitCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{audio.start();if(setOutfit(state,id,Number(b.dataset.outfit)).ok){dirty=true;residents.sync();save();audio.play('cloth');openWardrobe(id);}});
}
function updateFriendButton(){
 nearestFriend=(state.residents??[]).filter(r=>r.x!==null&&Math.hypot(r.x-pos.x,residentFloor(r.x,r.z,r.baseY??0)-feet,r.z-pos.z)<4.5).find(r=>{const point=new THREE.Vector3(r.x,residentFloor(r.x,r.z,r.baseY??0)+1,r.z),p=point.clone().project(camera);if(!(p.z>=-1&&p.z<=1&&Math.abs(p.x)<.9&&Math.abs(p.y)<.9))return false;const direction=point.clone().sub(camera.position),ray=new THREE.Raycaster(camera.position,direction.clone().normalize(),0,direction.length());return ray.intersectObjects([...buildMeshes.values()],true).length===0;});
 $('friendButton').hidden=!locked||!nearestFriend;
}
function activateFallback(){fallbackLook=true;locked=true;started=true;catalogOpen=false;$('overlay').hidden=true;$('catalog').hidden=true;keys.clear();held=false;$('saveStatus').textContent='Arrow keys or right-drag to look · Esc pauses';toast('Mouse capture unavailable. Arrow keys or right-drag to look.');}
function requestLock(){
 resetActions();audio.start();outfitResident=null;$('wardrobe').hidden=true;catalogOpen=false;$('catalog').hidden=true;
 if(fallbackLook||!canvas.requestPointerLock){activateFallback();return;}
 try{const pending=canvas.requestPointerLock();pending?.catch(()=>activateFallback());}catch{activateFallback();}
}
$('overlay').addEventListener('click',e=>{if(!e.target.closest('button,a,input,summary,details')){e.preventDefault();e.stopPropagation();requestLock();}});
canvas.addEventListener('click',()=>{if(!locked&&!catalogOpen&&outfitResident===null)requestLock();});
$('start').onclick=requestLock;$('menuButton').onclick=()=>showCatalog();$('closeCatalog').onclick=()=>showCatalog(false);
$('reset').onclick=()=>{if(confirm('Erase this browser’s meadow and start again?')){state=freshState();seedIndex=0;clearEffects();garden.reset();pos.set(0,0,9);feet=0;yaw=0;pitch=-.18;dirty=true;save();sync();showCatalog(false);}};
document.addEventListener('pointerlockchange',()=>{if(fallbackLook)return;resetActions();locked=document.pointerLockElement===canvas;held=false;keys.clear();if(locked){started=true;$('overlay').hidden=true;$('catalog').hidden=true;catalogOpen=false;}else if(!catalogOpen){audio.pause();clearEffects();$('overlay').hidden=false;$('start').innerHTML=icon('play')+'<span>Play</span>';}save();});
document.addEventListener('pointerlockerror',activateFallback);
document.addEventListener('mousemove',e=>{if(locked&&(!fallbackLook||rightDrag)){yaw-=e.movementX*.0022;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*.0022));dirty=true;}});
document.addEventListener('keydown',e=>{
 if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(e.code==='Escape'&&outfitResident!==null){requestLock();return;}
 if(e.code==='KeyF'&&locked&&nearestFriend){openWardrobe(nearestFriend.id);return;}
 if(e.code==='Escape'&&fallbackLook){audio.pause();clearEffects();resetActions();locked=false;held=false;rightDrag=false;keys.clear();catalogOpen=false;$('catalog').hidden=true;$('overlay').hidden=false;$('start').innerHTML=icon('play')+'<span>Play</span>';save();return;}
 if(e.code==='Tab'){showCatalog(!catalogOpen);return;}
 if(!locked)return;keys.add(e.code);if(e.repeat)return;
 if(/^Digit[1-7]$/.test(e.code)){chooseTool(Number(e.code.at(-1))-1);return;}
 if(e.code==='KeyE')cycle(1);if(e.code==='KeyQ')cycle(-1);
 if(e.code==='KeyR'&&tool===5){rotateChoice();}
 if(e.code==='KeyM'&&tool===5){materialIndex=(materialIndex+1)%MATERIALS.length;chooseTool(5);}
 if(['KeyZ','KeyX'].includes(e.code)&&tool===5){level=Math.max(0,Math.min(3,level+(e.code==='KeyX'?1:-1)));updateHUD();}
 if(e.code==='Space'&&!swimmingAt(pos.x,pos.z,feet)&&Math.abs(feet-floorAt(pos.x,pos.z))<.06)vy=6;
});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{audio.pause();keys.clear();resetActions();save();});
window.addEventListener('focus',()=>{if(locked)audio.start();});
canvas.addEventListener('mousedown',e=>{audio.start();if(e.button===2&&locked)rightDrag=true;if(e.button===0&&locked){held=true;if(tool!==3&&tool!==4)act();}});document.addEventListener('mouseup',()=>{resetActions();rightDrag=false;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('wheel',e=>{
 const enabled=locked&&!catalogOpen&&!e.target.closest('#catalog');
 const delta=wheelStep(wheel,e.deltaY,e.deltaMode,performance.now(),enabled);
 if(!enabled)return;e.preventDefault();if(delta)browse(delta);
},{passive:false});
window.addEventListener('beforeunload',save);
const raycaster=new THREE.Raycaster(),center=new THREE.Vector2();raycaster.far=60;
function pick(){
 raycaster.setFromCamera(center,camera);const hits=raycaster.intersectObjects(interactive,true);target=null;
 if(hits.length){const hit=hits[0],data=hit.object.userData;
  if(data.wildId){const r=WILD_RESOURCES.find(r=>r.id===data.wildId);if(r)target={gx:r.gx,gz:r.gz,wildId:r.id,point:hit.point,baseY:0};}
  else if(data.plot){const p=state.plots[data.plot];if(p)target={gx:p.gx,gz:p.gz,plot:data.plot,point:hit.point,baseY:0};}
  else if(data.buildId){const b=state.buildings.find(b=>b.id===data.buildId);if(b){let gx=b.gx,gz=b.gz;
   if(wallLike(b)){const interiors=adjacentCells(b),floor=interiors.find(c=>state.buildings.some(f=>f.kind==='floor'&&f.gx===c.gx&&f.gz===c.gz&&baseOf(f)===baseOf(b)));if(floor){gx=floor.gx;gz=floor.gz;}}
   target={gx,gz,buildId:b.id,point:hit.point,baseY:baseOf(b)};}}
  else if(data.seabed)target={gx:Math.round(hit.point.x/2),gz:Math.round(hit.point.z/2),point:hit.point,baseY:buildBase(Math.round(hit.point.x/2),Math.round(hit.point.z/2))??terrainHeight(hit.point.x,hit.point.z)};
  else if(hit.instanceId!==undefined){target={...groundCells[hit.instanceId],point:hit.point,baseY:0};}
 }
 if(target){target.distance=camera.position.distanceTo(target.point);const plant=state.plots[cellKey(target.gx,target.gz)];target.outOfReach=target.distance>((target.wildId||plant?.growth>=1)?3.8:6);}
 tileOutline.visible=!!target&&locked&&!target.outOfReach;if(target)tileOutline.position.set(target.gx*2,(target.baseY??0)+.035,target.gz*2);
 if(preview){preview.visible=!!target&&locked&&!target.outOfReach;if(target){const b=selectedBuild();preview.position.set(b.gx*2,baseOf(b)+b.level*2.4,b.gz*2);preview.rotation.y=b.rotation*Math.PI/2;const valid=validateBuild(state,b).ok&&!intersectsPlayer(b);preview.traverse(o=>{if(o.isMesh)o.material.color.set(valid?'#d8f5a5':'#f49471');});}}
 let label='';if(target&&locked){const p=state.plots[cellKey(target.gx,target.gz)];
  if(target.outOfReach)label='Walk closer';
  else if(target.wildId){const r=WILD_RESOURCES.find(r=>r.id===target.wildId);label=tool===4?(isFlower(r.kind)?'Hold to gather flowers':'Hold to chop · three impacts'):'Wild '+SEEDS[r.kind].name+' · choose the axe';}
  else
  if(tool===5){const b=selectedBuild(),v=validateBuild(state,b);label=v.ok?(intersectsPlayer(b)?'Step aside to place this piece.':`Click · place ${PIECES[b.kind].name.toLowerCase()}\n${PIECES[b.kind].cost} ${b.material}`):v.message;}
  else if(tool===6)label=target.buildId?'Click · remove and refund':'Aim at a building piece';
  else if(p?.seed)label=`${SEEDS[p.seed].name} · ${p.phase==='hole'?'seed — fill the hole [3]':p.growth>=1?'mature — harvest [5]':`${Math.floor(p.growth*100)}% grown · ${Math.round(p.water*100)}% water`}\n${p.phase==='filled'&&p.growth<1?(p.water<.2?'Hold watering can [4] to keep growing':'Growing…'):''}`;
  else label=p?.phase==='hole'?'Open hole · sow a seed [2]':tool===0?'Click · dig a planting hole':tool===1?'Dig a hole first [1]':'';
 }$('targetLabel').textContent=label;updateTargetCue();
}
function updateTargetCue(){
 const p=target&&state.plots[cellKey(target.gx,target.gz)],r=target?.wildId&&WILD_RESOURCES.find(r=>r.id===target.wildId);
 let stage=r?5:stageFor(p),name=steps[stage][0],required=steps[stage][1],progress=stage===4?(p?.growth??0)*100:0,wrong=false,blocked=false;
 if(tool===5){name='build';required=5;blocked=target&&(!validateBuild(state,selectedBuild()).ok||intersectsPlayer(selectedBuild()));}
 else if(tool===6){name='remove';required=6;blocked=!target?.buildId;}
 else if(tool===0&&target&&!target.wildId)blocked=worldBlocked(state,target.gx,target.gz);
 if(stage===5){name=isFlower(r?.kind)||isFlower(p?.seed)?'hand':'axe';if(chopProgress)progress=chopProgress*100;}
 if(tool===3&&p?.seed&&p.phase==='filled'&&p.growth<1){name='hose';required=3;progress=p.water*100;}
 if(target?.outOfReach){name='footsteps';required=null;}
 wrong=required!==null&&required!==tool;
 const html=target&&locked?`${blocked||elapsed<failureUntil?icon('lock'):''}${wrong?`<span class="cueArrow">→</span>`:''}<span class="progressRing" style="--progress:${progress}">${icon(name)}</span>${!wrong&&!target.outOfReach&&[3,4].includes(tool)?icon('hand'):''}`:'';
 if(html!==lastCue){$('targetCue').innerHTML=html;lastCue=html;}
 $('targetCue').hidden=!html;$('targetCue').className=target?.outOfReach?'far':wrong||blocked?'wrong':'';
}
function reward(result){$('reward').innerHTML=icon(result.resource)+`<b>+${result.amount}</b>`;rewardUntil=elapsed+2.5;$('reward').classList.add('show');}
function finishHarvest(){
 const r=target.wildId?WILD_RESOURCES.find(r=>r.id===target.wildId):null,p=state.plots[cellKey(target.gx,target.gz)],kind=r?.kind??p?.seed;
 const g=r?wildMeshes.get(r.id):plantMeshes.get(cellKey(target.gx,target.gz));
 const result=r?harvestWild(state,r.id):harvest(state,target.gx,target.gz);
 if(result.ok){if(g&&!isFlower(kind)){const fall=g.clone();scene.add(fall);falling.push({g:fall,life:.6});}dirty=true;reward(result);burst(target.gx,target.gz,SEEDS[kind].color);toast(result.message);audio.play('harvest');pickup(result,target.gx*2,target.gz*2);sync();save();}
}
function addEffect(m,x,y,z,life,v,bounce=false,ring=false){
 if(sparks.length>=96){const old=sparks.shift();scene.remove(old.m);old.m.geometry.dispose();old.m.material.dispose();}
 m.position.set(x,y,z);scene.add(m);sparks.push({m,life,v,bounce,ring});
}
function clearEffects(){for(const s of sparks){scene.remove(s.m);s.m.geometry.dispose();s.m.material.dispose();}sparks.length=0;for(const f of falling)scene.remove(f.g);falling.length=0;stream.visible=false;}
function burst(gx,gz,c='#d9be78'){
 for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.07,.055,.16),new THREE.MeshStandardMaterial({color:c,roughness:.8}));addEffect(m,gx*2,.45,gz*2,.8,new THREE.Vector3((Math.random()-.5)*3,Math.random()*2+1,(Math.random()-.5)*3));}
}
function splash(x,z){
 const m=new THREE.Mesh(new THREE.RingGeometry(.07,.10,16),new THREE.MeshBasicMaterial({color:'#c9f7ef',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;addEffect(m,x,.06,z,.6,new THREE.Vector3(),false,true);
 for(let i=0;i<3;i++){const drop=new THREE.Mesh(new THREE.BoxGeometry(.025,.07,.025),new THREE.MeshBasicMaterial({color:'#c9f7ef'}));addEffect(drop,x,.12,z,.35,new THREE.Vector3((Math.random()-.5)*1.3,1,(Math.random()-.5)*1.3));}
}
function pickup(result,x,z){
 const colors={wood:'#bc8955',copper:'#db9258',iron:'#b9cdd1',diamond:'#83dbe2',fiber:'#b9cd89'};
 for(let i=0;i<4;i++){const m=new THREE.Mesh(result.resource==='diamond'?new THREE.OctahedronGeometry(.17):new THREE.BoxGeometry(.22,.2,.25),new THREE.MeshStandardMaterial({color:colors[result.resource],metalness:['copper','iron'].includes(result.resource)?.3:0,roughness:.55}));addEffect(m,x,.8,z,1.6,new THREE.Vector3(Math.cos(i*1.7)*1.3,2.4+i*.2,Math.sin(i*1.7)*1.3),true);}
}
function act(){
 if(!target||target.outOfReach){toast('Move closer and aim at the ground or a plant.');failureUntil=elapsed+.8;return;}
 if(target.wildId){toast('Use the axe to gather this wild plant.');failureUntil=elapsed+.8;return;}
 const {gx,gz}=target;let result;
 if(tool===0)result=dig(state,gx,gz);if(tool===1)result=plant(state,gx,gz,seedKeys[seedIndex]);if(tool===2)result=fill(state,gx,gz);
 if(tool===5){const b=selectedBuild();result=intersectsPlayer(b)?{ok:false,message:'Step aside to place this piece.'}:build(state,b);}
 if(tool===6)result=remove(state,target.buildId);
 if(result){if(!result.ok)failureUntil=elapsed+.8;toast(result.message);if(result.ok){dirty=true;swing=.25;audio.play(['dig','plant','fill','water','harvest','build','remove'][tool]);burst(gx,gz);sync();save();}}
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);placeTool();}window.addEventListener('resize',resize);
residents=createResidentSystem({scene,getState:()=>state,getPlayer:()=>pos,canStand:residentCanStand,floorHeight:residentFloor,changed:()=>{dirty=true;},notice:()=>{audio.play('discover');$('reward').innerHTML=icon('resident')+icon('build')+icon('check');rewardUntil=elapsed+4;$('reward').classList.add('show');toast(pos.z>30?'A friendly diver is moving in.':'A friendly neighbour is moving in.');}});
garden=createGardenSystem({scene,getState:()=>state,getPlayer:()=>pos,canStand:(x,z)=>residentCanStand(x,z)&&!state.buildings.some(b=>Math.abs(x-b.gx*2)<1.7&&Math.abs(z-b.gz*2)<1.7),treeHeight:key=>plantMeshes.get(key)?.userData.perchHeight??3.5,onDiscover:r=>{dirty=true;audio.play('discover');$('reward').innerHTML=icon('sparkle')+picture('seed:'+r.seed,SEEDS[r.seed].name)+icon('check');rewardUntil=elapsed+5;$('reward').classList.add('show');toast(r.newSeed?'A new seed for your picture book!':'Another secret found!');burst(Math.round(pos.x/2),Math.round(pos.z/2),'#eddb90');updateHUD();save();}});
setupPictures();setupLivingUI();sync();chooseTool(0);if(loadWarning){$('welcomeSave').textContent=loadWarning;$('saveStatus').textContent='Previous save could not be loaded';}
const timing=[];let previous=performance.now(),frames=0,livingTime=0;
function frame(now){
 requestAnimationFrame(frame);const realDt=(now-previous)/1000,dt=Math.min(realDt,.1);previous=now;elapsed+=dt;if(realDt<1){timing.push(realDt*1000);if(timing.length>180)timing.shift();}
 if(locked){
  if(fallbackLook){if(keys.has('ArrowLeft'))yaw+=dt*1.4;if(keys.has('ArrowRight'))yaw-=dt*1.4;if(keys.has('ArrowUp'))pitch+=dt*1.1;if(keys.has('ArrowDown'))pitch-=dt*1.1;pitch=Math.max(-1.45,Math.min(1.45,pitch));}
  livingTime+=dt;tick(state,dt);residents.update(dt,livingTime);garden.update(dt,livingTime);const speed=keys.has('ShiftLeft')?7:4.2;let dx=0,dz=0;
  if(keys.has('KeyW'))dz-=1;if(keys.has('KeyS'))dz+=1;if(keys.has('KeyA'))dx-=1;if(keys.has('KeyD'))dx+=1;
  const length=Math.hypot(dx,dz)||1;dx=dx/length*speed*dt;dz=dz/length*speed*dt;
  const wx=dx*Math.cos(yaw)+dz*Math.sin(yaw),wz=dz*Math.cos(yaw)-dx*Math.sin(yaw);
  if(canWalk(pos.x+wx,pos.z))pos.x+=wx;if(canWalk(pos.x,pos.z+wz))pos.z+=wz;
  const beforeFeet=feet;
  const floor=floorAt(pos.x,pos.z),ceil=Math.min(Infinity,...state.buildings.flatMap(boxes).filter(a=>touches(a,pos.x,pos.z)&&a.minY>=feet+1.6).map(a=>a.minY));
  const vertical=verticalStep({x:pos.x,z:pos.z,feet,vy,dt,forward:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),pitch,rise:keys.has('Space'),dive:keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight'),floor,ceil});feet=vertical.feet;vy=vertical.vy;
  if(dx||dz||feet!==beforeFeet||Object.values(state.plots).some(p=>p.growth<1&&p.water>0))dirty=true;
  for(const {model,index:i} of marine){const t=livingTime*(.23+(i%3)*.025)+i*.72,cx=(i%3-1)*6,cz=48+Math.floor(i/3)*3;model.position.set(cx+Math.sin(t)*3.6,-4.7+Math.sin(t*.8+i)*.65,cz+Math.cos(t)*2);model.rotation.y=Math.atan2(Math.cos(t)*3.6,-Math.sin(t)*2);animateMarineAnimal(model,{time:livingTime+i,swim:1});}
  if(cover)animateMeadowCover(cover,{time:livingTime});

 }
 camera.position.set(pos.x,feet+1.7,pos.z);camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld();pick();
 const underwater=camera.position.y<TERRAIN.waterY;scene.background.set(underwater?'#5ba9b4':'#b7d7d7');scene.fog.color.copy(scene.background);scene.fog.near=underwater?8:38;scene.fog.far=underwater?48:118;waterSurface.material.opacity=underwater?.18:.48;
 $('swimCue').hidden=!locked||pos.z<23;$('swimCue').innerHTML=icon('swim')+(swimmingAt(pos.x,pos.z,feet)?`<span>↑ <kbd>Space</kbd> &nbsp; ↓ <kbd>C</kbd></span>`:`<span>${icon('reef')} ↓</span>`);
 stream.visible=false;
 if(locked&&held&&tool===3&&target&&!target.outOfReach&&!target.wildId){const result=water(state,target.gx,target.gz,dt);if(result.ok){dirty=true;stream.visible=true;audio.play('water');if(frames%6===0)splash(target.gx*2,target.gz*2);const origin=new THREE.Vector3(...(toolMesh.userData.spout??[0,.2,-.2])).applyMatrix4(toolMesh.matrixWorld),end=new THREE.Vector3(target.gx*2,.12,target.gz*2);for(let i=0;i<28;i++){const t=((i/28)+elapsed*1.8)%1;const p=origin.clone().lerp(end,t);p.y+=Math.sin(t*Math.PI)*.35;waterPositions[i*3]=p.x;waterPositions[i*3+1]=p.y;waterPositions[i*3+2]=p.z;}waterGeometry.attributes.position.needsUpdate=true;}else if(frames%45===0)toast(result.message);}
 const plant=target&&state.plots[cellKey(target.gx,target.gz)],wild=target?.wildId&&WILD_RESOURCES.find(r=>r.id===target.wildId);
 const harvestable=wild||plant?.seed&&plant.growth>=1;
 const chopKey=locked&&held&&tool===4&&target&&!target.outOfReach&&harvestable?(wild?'wild:'+wild.id:'plot:'+cellKey(target.gx,target.gz)):null;
 const chopping=advanceChop(chop,chopKey,dt,isFlower(wild?.kind??plant?.seed)?.45:1.8);chopProgress=chopping.progress;
 if(chopping.impact){totalImpacts++;swing=.25;audio.play(isFlower(wild?.kind??plant?.seed)?'plant':'chop');burst(target.gx,target.gz,'#cdaa74');}
 if(chopping.complete)finishHarvest();
 for(const [id,g] of wildMeshes){g.rotation.z=chopKey==='wild:'+id?Math.sin(chop.elapsed*28)*.025:0;animateTree(g,{growth:1,time:elapsed});}
 for(const [k,g] of plantMeshes)g.rotation.z=chopKey==='plot:'+k?Math.sin(chop.elapsed*28)*.025:0;
 for(let i=falling.length-1;i>=0;i--){const f=falling[i];f.life-=dt;f.g.rotation.z+=dt*1.7;f.g.scale.multiplyScalar(Math.max(0,1-dt*1.6));f.g.position.y-=dt*.3;if(f.life<=0){scene.remove(f.g);falling.splice(i,1);}}
 for(const [k,g] of plantMeshes){const p=state.plots[k];g.scale.setScalar(p.phase==='hole'?.28:1);animateTree(g,{growth:p.growth,time:elapsed,variation:p.variation??0});const stage=p.growth>=1?3:p.growth>=.65?2:p.growth>=.25?1:0;if(g.userData.lastStage!==undefined&&stage>g.userData.lastStage&&locked){audio.play('grow');burst(p.gx,p.gz,SEEDS[p.seed].color);}g.userData.lastStage=stage;}
 if(toolMesh){swing=Math.max(0,swing-dt);toolMesh.rotation.x=-.12-Math.sin(swing/.25*Math.PI)*(tool===4?1.2:.6);if(tool===3&&stream.visible)toolMesh.rotation.x=-.58;toolMesh.rotation.z=tool===4?-Math.sin(swing/.25*Math.PI)*.65:0;placeTool();toolMesh.position.y+=(locked&&(keys.has('KeyW')||keys.has('KeyS'))?Math.sin(elapsed*9)*.018:0);toolMesh.visible=locked;}
 for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.life-=dt;if(s.ring){s.m.scale.addScalar(dt*1.5);s.m.material.opacity=Math.max(0,s.life);}else{s.v.y-=5*dt;s.m.position.addScaledVector(s.v,dt);s.m.rotation.x+=dt*3;if(s.bounce&&s.m.position.y<.16){s.m.position.y=.16;s.v.y=Math.abs(s.v.y)*.5;s.v.x*=.65;s.v.z*=.65;}if(s.bounce&&s.life<.3)s.m.scale.setScalar(Math.max(.01,s.life/.3));}if(s.life<=0){scene.remove(s.m);s.m.geometry.dispose();s.m.material.dispose();sparks.splice(i,1);}}
 if(frames%5===0){updateJournal();$('places').innerHTML=[...PLACES,{id:'reef',name:'Shell reef',x:TERRAIN.reef.x,z:TERRAIN.reef.z,icon:'reef'}].map(p=>{const distance=Math.hypot(pos.x-p.x,pos.z-p.z),angle=Math.atan2(-(p.x-pos.x),-(p.z-pos.z))-yaw;return `<div class="place ${distance<5?'near':''}" title="${p.name}" aria-label="${p.name}, ${Math.round(distance)} metres">${icon(p.icon)}<span class="bearing" style="transform:rotate(${-angle}rad)">↑</span><b>${distance<5?'✓':Math.round(distance)+'m'}</b></div>`;}).join('');}
 if(frames%5===0){
  const h=target&&houseReadiness(state.buildings,target.gx,target.gz,target.baseY??0);$('houseCue').hidden=!h||tool!==5&&tool!==6;
  if(h){$('houseCue').innerHTML=`<span class="${h.doors.length?'ready':''}">${picture('piece:door:wood','Door')}${h.doors.length?icon('check'):icon('lock')}</span><span class="${h.covered===h.total?'ready':''}">${picture('piece:wall:wood','Enclosed walls')}<b>${h.covered}/${h.total}</b></span><span class="${h.roofCount===h.cells.length?'ready':''}">${picture('piece:roof:wood','Roof')}<b>${h.roofCount}/${h.cells.length}</b></span>${h.complete?icon('resident'):''}`;}
  $('residentCues').innerHTML=(state.residents??[]).map(r=>{if(r.x===null)return '';const p=new THREE.Vector3(r.x,residentFloor(r.x,r.z,r.baseY??0)+1.95,r.z).project(camera);if(p.z<-1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1)return '';return `<div class="residentCue ${r.status}" style="left:${(p.x*.5+.5)*100}%;top:${(-p.y*.5+.5)*100}%" aria-label="Friendly resident ${r.status}">${icon('resident')}${icon(r.status==='waiting'?'build':r.status==='arriving'?'footsteps':'check')}</div>`;}).join('');
 }
 if(frames%5===0)updateFriendButton();
 if(elapsed>rewardUntil)$('reward').classList.remove('show');
 if(elapsed>toastUntil)$('toast').classList.remove('show');if(elapsed-lastSave>3){save();lastSave=elapsed;}
 renderer.render(scene,camera);frames++;
}
requestAnimationFrame(frame);
// Read-only observation surface for browser verification and independent criticism.
Object.defineProperty(window,'kauris',{value:Object.freeze({snapshot:()=>JSON.parse(JSON.stringify({state,player:{x:pos.x,z:pos.z,feet,yaw,pitch},swimming:swimmingAt(pos.x,pos.z,feet),locked,fallbackLook,tool:tools[tool].key,seed:seedKeys[seedIndex],piece:pieceKeys[pieceIndex],material:MATERIALS[materialIndex],level,rotation,target:target?{gx:target.gx,gz:target.gz,baseY:target.baseY,point:target.point,placement:tool===5?selectedBuild():null,buildId:target.buildId,wildId:target.wildId,outOfReach:target.outOfReach}:null,chop:{key:chop.key,progress:chopProgress,impacts:totalImpacts},wild:liveWild(state),places:PLACES,homes:findHomes(state.buildings),residents:(state.residents??[]).map(r=>({...r,walking:residents.motion.get(r.id)?.walking??0})),garden:{animals:garden.snapshot(),discoveries:activeDiscoveries(state),audio:audio.snapshot()},performance:{averageFrameMs:timing.reduce((a,b)=>a+b,0)/Math.max(1,timing.length),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}))}),writable:false});
