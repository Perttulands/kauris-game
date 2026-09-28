import * as THREE from 'three';
import {createWorld,createTree,animateTree,createBuildPiece,createTool} from './visuals.js';
import {SAVE_KEY,SEEDS,PIECES,MATERIALS,cellKey,freshState,validateDig,dig,plant,fill,water,tick,harvest,validateBuild,build,validateRemove,remove,serialize,deserialize} from './state.js';
import {WILD_RESOURCES,PLACES,nearbyResources,resourceRecord} from './world-data.js';
import {liveWild,activeObstacles,harvestWild,worldBlocked} from './state.js';
import {advanceChop,wheelStep,farTargetHint} from './interaction.js';
import {createPictures} from './previews.js';
import {icon} from './icons.js';
import {findHomes,houseReadiness} from './residents.js';
import {createResidentSystem} from './resident-runtime.js';
import {activeDiscoveries,seedUnlocked,isFlower,setOutfit} from './garden.js';
import {createGardenSystem} from './garden-runtime.js';
import {createAudio} from './audio.js';
import {actionEcho,admitFailure} from './action-feedback.js';
import {sampleWorld,REGIONS} from './world-layout.js';
import {createResourceHorizon,fullResourceCandidates,nearCoverBounds} from './resource-horizon.js';
import {showPresentation,nearPresentation,actorViewDistance} from './presentation-distance.js';
import {createOuterLife} from './outer-life.js';
import {createWorldRuntime} from './world-runtime.js';
import {TERRAIN,terrainHeight,inWorld,buildBase} from './terrain.js';
import {wallLike,baseOf,rotationCount,placementTransform,adjacentCells,buildingBoxes as boxes,touches} from './building.js';
import {swimmingAt,verticalStep} from './movement.js';
import {reefBlocked,reefFloor,reefCeiling,reefSafeFeet} from './reef-collision.js';
import {createOceanWorld,createReefCover} from './ocean-visuals.js';
import {createMarineAnimal,animateMarineAnimal,MARINE_PROFILES} from './marine-visuals.js';
import {createWhaleSystem} from './whale.js';
import {createMarineLife} from './marine.js';
import {DELIGHTS,DELIGHT_KEYS,propBoxes,propFloor,propSupport,propAnchor,rotateXZ,placeDelight,validateRemoveDelight,removeDelight,validateDelight,boxesOverlap,liftRiders} from './delights.js';
import {createDelightSystem} from './delight-runtime.js';
import {createDelight} from './delight-visuals.js';
import {animateCraftPiece} from './craft-visuals.js';
import {createMeadowCover,animateMeadowCover} from './meadow-visuals.js';
import {createI18n,LANGUAGES} from './i18n.js';
import {nearestReading,createReadingFocus,assistedReading} from './reading.js';
import {flowerEnvelope,flowerTarget} from './flower-targeting.js';
import {plotSurfaces} from './plot-surfaces.js';
import './ui.css';
const $=id=>document.getElementById(id), canvas=$('game');
let localeStorage;try{localeStorage=localStorage;}catch{}
const i18n=createI18n({storage:localeStorage,languages:navigator.languages}),t=i18n.t;
let state=freshState(),loadWarning='',hasSavedWorld=false;
try{const raw=localStorage.getItem(SAVE_KEY);if(raw){state=deserialize(raw);hasSavedWorld=true;}}catch{loadWarning='ui.loadWarning';}
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
const scene=new THREE.Scene(),dayBackground=new THREE.Color('#b7d7d7');scene.background=dayBackground;scene.fog=new THREE.Fog('#b7d7d7',38,118);
// Surface light falls into cooler depth. One quiet background texture adds depth
// without particles, animated screen effects or another terrain/physics system.
const seaCanvas=document.createElement('canvas');seaCanvas.width=8;seaCanvas.height=256;
const seaContext=seaCanvas.getContext('2d'),seaGradient=seaContext.createLinearGradient(0,0,0,256);
seaGradient.addColorStop(0,'#a0d6ce');seaGradient.addColorStop(.46,'#5c9fa7');seaGradient.addColorStop(1,'#397382');seaContext.fillStyle=seaGradient;seaContext.fillRect(0,0,8,256);
const seaBackground=new THREE.CanvasTexture(seaCanvas);seaBackground.colorSpace=THREE.SRGBColorSpace;
const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.05,180);camera.rotation.order='YXZ';scene.add(camera);
const hemi=new THREE.HemisphereLight('#dceceb','#5f7466',1.5);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff3df',2.0);sun.position.set(-24,38,16);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:110});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
const pictures=createPictures(renderer);
const picture=(key,label)=>`<img class="modelPicture" src="${pictures[key]}" alt="${label}" draggable="false">`;
const world=createWorld({occupiedCells:[...Object.values(state.plots),...state.buildings,...activeDiscoveries(state).flatMap(d=>{const cells=[];for(let gx=Math.floor(d.bounds.minX/2);gx<=Math.ceil(d.bounds.maxX/2);gx++)for(let gz=Math.floor(d.bounds.minZ/2);gz<=Math.ceil(d.bounds.maxZ/2);gz++)cells.push({gx,gz});return cells;})],hiddenLandmarks:state.worldHidden});scene.add(world.group);
const ocean=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight});scene.add(ocean);const reefSolids=ocean.userData.reefSolids,oceanBounds=new THREE.Box3().setFromObject(ocean);
const worldRuntime=createWorldRuntime(state);scene.add(worldRuntime.group);const outerLife=createOuterLife({scene,state,solidsAt:(x,z)=>worldRuntime.solidsAt(x,z)});
const waterSurface=new THREE.Mesh(new THREE.PlaneGeometry(500,500).rotateX(-Math.PI/2),new THREE.MeshPhysicalMaterial({color:'#58bdbe',roughness:.23,metalness:.08,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}));waterSurface.position.set(0,TERRAIN.waterY,0);scene.add(waterSurface);
const seaLight=new THREE.HemisphereLight('#b5eee5','#27616a',.65);seaLight.position.set(0,0,52);scene.add(seaLight);
const marineLife=createMarineLife({profiles:MARINE_PROFILES,reefSolids,buildings:state.buildings});
const marine=marineLife.animals.map(actor=>{const model=createMarineAnimal(actor.kind,actor.variant);model.rotation.order='YXZ';scene.add(model);return {actor,model};});
function poseMarine(dt=0){for(const {actor:a,model} of marine){model.position.set(a.x,a.y,a.z);model.rotation.set(a.pitch,a.yaw,a.roll,'YXZ');animateMarineAnimal(model,{time:marineLife.time,dt,speed:a.speed,turn:a.turn,activity:a.activity,phase:a.phase});model.updateMatrixWorld(true);}}
poseMarine();
let cover=null,reefCover=null,coverKey='';
function syncCover(){
 const excludedCells=[...Object.values(state.plots),...state.buildings.flatMap(adjacentCells),...state.delights,...marine.filter(a=>a.actor.kind==='octopus').map(a=>({gx:Math.round(a.actor.homeX/2),gz:Math.round(a.actor.homeZ/2)})),...activeDiscoveries(state).flatMap(d=>{const a=[];for(let gx=Math.floor(d.bounds.minX/2);gx<=Math.ceil(d.bounds.maxX/2);gx++)for(let gz=Math.floor(d.bounds.minZ/2);gz<=Math.ceil(d.bounds.maxZ/2);gz++)a.push({gx,gz});return a;})];
 const legacyCells=excludedCells.filter(p=>Math.abs(p.gx)<=14&&p.gz>=-14&&p.gz<=56);
 const key=legacyCells.map(p=>`${p.gx},${p.gz}`).sort().join(';');if(key===coverKey&&cover)return;coverKey=key;
 if(cover){scene.remove(cover);const materials=new Set();cover.traverse(o=>{if(o.isMesh&&cover.userData.privateResources){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>m.dispose());}
 if(reefCover){scene.remove(reefCover);const materials=new Set();reefCover.traverse(o=>{if(o.isMesh&&reefCover.userData.privateResources){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>m.dispose());}
 cover=createMeadowCover({excludedCells:legacyCells});scene.add(cover);reefCover=createReefCover({terrain:TERRAIN,heightAt:terrainHeight,excludedCells:legacyCells});reefCover.userData.viewBounds=new THREE.Box3().setFromObject(reefCover);scene.add(reefCover);
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
const holeWallGeometry=new THREE.BoxGeometry(2,.6,.012);
const matrix=new THREE.Matrix4();let n=0;const groundCells=[];
for(let gx=-13;gx<=13;gx++)for(let gz=-13;gz<=13;gz++){
 groundCells.push({gx,gz});matrix.makeTranslation(gx*2,-.35,gz*2);ground.setMatrixAt(n,matrix);
 n++;
}
const resourceHorizon=createResourceHorizon(scene),outerGeometry=new Set();
const plantMeshes=new Map(),buildMeshes=new Map(),wildMeshes=new Map(),flowerEnvelopes=new Map();let interactive=[ground];
const tileOutline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.98,.04,1.98)),new THREE.LineBasicMaterial({color:'#f7e5a3'}));scene.add(tileOutline);
const plotMaterial=new THREE.MeshStandardMaterial({color:'#795a37',roughness:.96});
const plotGeometry=new THREE.BoxGeometry(1.82,.035,1.82);
const plotsGroup=new THREE.Group();scene.add(plotsGroup);
const tools=[{key:'shovel',name:'Dig',icon:'♧'},{key:'seed',name:'Seeds',icon:'✤'},{key:'fill',name:'Fill',icon:'▰'},{key:'hose',name:'Water',icon:'≈'},{key:'axe',name:'Harvest',icon:'⌁'},{key:'build',name:'Build',icon:'⌂'},{key:'remove',name:'Remove',icon:'↶'}];
let fallbackLook=false,rightDrag=false;
let tool=0,seedIndex=0,pieceIndex=0,materialIndex=0,rotation=0,level=0,toolMesh,preview,connectionGhost;
const seedKeys=Object.keys(SEEDS),pieceKeys=[...Object.keys(PIECES),...DELIGHT_KEYS];
const isToy=()=>Object.hasOwn(DELIGHTS,pieceKeys[pieceIndex]);
let yaw=state.player.yaw,pitch=state.player.pitch,feet=reefSafeFeet(reefSolids,state.player.x,state.player.z,state.player.y??0),vy=0,locked=false,held=false,catalogOpen=false,menuMode='build',started=false,dirty=false,lastSave=0,elapsed=0,target=null,swing=0,toastUntil=0;
const pos=new THREE.Vector3(state.player.x,0,state.player.z),keys=new Set();
const waterPositions=new Float32Array(28*3),waterGeometry=new THREE.BufferGeometry();waterGeometry.setAttribute('position',new THREE.BufferAttribute(waterPositions,3));
const dropCanvas=document.createElement('canvas');dropCanvas.width=dropCanvas.height=32;const dc=dropCanvas.getContext('2d'),dg=dc.createRadialGradient(16,16,1,16,16,15);dg.addColorStop(0,'#ffffff');dg.addColorStop(.45,'#ffffffdd');dg.addColorStop(1,'#ffffff00');dc.fillStyle=dg;dc.fillRect(0,0,32,32);
const stream=new THREE.Points(waterGeometry,new THREE.PointsMaterial({color:'#c5faff',size:.024,map:new THREE.CanvasTexture(dropCanvas),transparent:true,opacity:.85,depthWrite:false}));stream.frustumCulled=false;stream.visible=false;scene.add(stream);
const sparks=[],falling=[];const audio=createAudio();const whale=createWhaleSystem({scene,event:(kind,p)=>audio.play(kind,{...p,sourceId:'whale:0'})});let garden;let outfitResident=null;let nearestFriend=null;
let residents,delights,pourWeight=0,swimHudMode=null,nextBirdCall=15;
const chop={},wheel={};let chopProgress=0,totalImpacts=0,rewardUntil=0,lastCue="",timedEcho=null,selectionDetail="",lastFailure=null;const failureMemory={};
function resetActions(){audio.setContinuous('player:water','water',{active:false});held=false;advanceChop(chop,null,0);chopProgress=0;wheelStep(wheel,0,0,0,false);}
let lastReward=null,lastToast=null,saveStatusKey='ui.saved';
function failure(result){const key=target?(target.propId??target.buildId??target.wildId??cellKey(target.gx,target.gz)):'none';if(!admitFailure(failureMemory,result.code,key,elapsed))return;lastFailure={result,until:elapsed+2.5};renderSelectionDetail();}
function renderSelectionDetail(){const failed=locked&&lastFailure&&elapsed<lastFailure.until,text=failed?i18n.message(lastFailure.result):selectionDetail;if($('selectedDetail').textContent!==text)$('selectedDetail').textContent=text;$('selection').dataset.failure=String(!!failed);}
function toast(code,params={}){if(typeof code==='object'&&code.ok===false){failure(code);return;}lastToast=typeof code==='object'?code:{code,params};$('toast').textContent=i18n.message(lastToast);toastUntil=elapsed+2.5;$('toast').classList.add('show');}
function saveStatus(key){saveStatusKey=key;$('saveStatus').textContent=t(key);$('saveStatus').dataset.warning=String(['ui.saveUnavailable','ui.loadFailed'].includes(key));}
function save(){
 if(!dirty)return;
 state.player={x:pos.x,y:feet,z:pos.z,yaw,pitch};
 try{localStorage.setItem(SAVE_KEY,serialize(state));saveStatus(fallbackLook?'ui.savedFallback':'ui.saved');dirty=false;}catch{saveStatus('ui.saveUnavailable');}
}
function sync(){
 residents?.sync();garden?.sync();delights?.sync();marineLife.setBuildings(state.buildings);marineLife.setDelights(state.delights,delights);syncCover();worldRuntime.sync();
 syncWild();


 for(let i=0;i<groundCells.length;i++){const c=groundCells[i],p=state.plots[cellKey(c.gx,c.gz)];matrix.makeTranslation(c.gx*2,p?.phase==='hole'?-.95:-.35,c.gz*2);ground.setMatrixAt(i,matrix);}ground.instanceMatrix.needsUpdate=true;
 for(const [k,g] of plantMeshes)if(!state.plots[k]?.seed){scene.remove(g);plantMeshes.delete(k);}
 plotsGroup.clear();
 for(const [k,p] of Object.entries(state.plots)){
  plotsGroup.add(...plotSurfaces(p,state.plots,{wallGeometry:holeWallGeometry,wallMaterial:dirtMaterial,soilGeometry:plotGeometry,soilMaterial:plotMaterial}));
  if(p.seed&&!plantMeshes.has(k)){const tree=createTree(p.seed,{variation:p.variation??0});tree.userData.perchHeight=new THREE.Box3().setFromObject(tree).max.y-.15;tree.position.set(p.gx*2,p.phase==='hole'?-.5:0,p.gz*2);tree.userData.plot=k;tree.traverse(o=>{if(o.isMesh)o.userData.plot=k;});scene.add(tree);plantMeshes.set(k,tree);}
  const tree=plantMeshes.get(k);if(tree)tree.position.y=p.phase==='hole'?-.5:0;
 }
 for(const [id,g] of buildMeshes)if(!state.buildings.some(b=>b.id===id)){scene.remove(g);buildMeshes.delete(id);}
 for(const b of state.buildings)if(!buildMeshes.has(b.id)){const g=createBuildPiece(b.kind,b.material);g.position.set(b.gx*2,baseOf(b)+b.level*2.4,b.gz*2);g.rotation.y=b.rotation*Math.PI/2;g.traverse(o=>{if(o.isMesh)o.userData.buildId=b.id;});scene.add(g);buildMeshes.set(b.id,g);}
 refreshInteractive();updateHUD();
}
let worldVersion=-1,wildCell='',visibleWild=[],resourceView={x:pos.x,z:pos.z};
function refreshInteractive(){interactive=[ground,plotsGroup,...worldRuntime.roots(),...plantMeshes.values(),...wildMeshes.values(),...buildMeshes.values(),...delights.models.values()];}
function syncWild(){
 resourceView={x:pos.x,z:pos.z};
 visibleWild=fullResourceCandidates(state,pos.x,pos.z);
 for(const [id,g] of wildMeshes)if(!visibleWild.some(r=>r.id===id)){scene.remove(g);wildMeshes.delete(id);flowerEnvelopes.delete(id);}
 for(const r of visibleWild)if(!wildMeshes.has(r.id)){
  const g=createTree(r.kind,{variation:r.id.startsWith('w1:')?(r.variation??0)%2:(r.variation??0)});g.position.set(r.gx*2,r.baseY??0,r.gz*2);g.rotation.y=r.yaw;g.scale.setScalar(r.scale);g.userData.wildId=r.id;g.traverse(o=>{if(o.isMesh){o.userData.wildId=r.id;if(r.id.startsWith('w1:'))outerGeometry.add(o.geometry);}});wildMeshes.set(r.id,g);scene.add(g);if(isFlower(r.kind))flowerEnvelopes.set(r.id,flowerEnvelope(g,r.id));
 }
 resourceHorizon.update(state,pos.x,pos.z,new Set(visibleWild.map(r=>r.id)));refreshInteractive();
}
function physicalSolids(x,z){return [...reefSolids,...worldRuntime.solidsAt(x,z)];}
function selectedBuild(){
 if(!target)return null;
 let gx=target.gx,gz=target.gz;const kind=pieceKeys[pieceIndex];
 if(isToy()){const host=state.buildings.find(b=>b.id===target.buildId&&b.kind==='floor'),hostId=kind==='lift'?null:host?.id??null;return {kind,gx,gz,rotation,hostId,baseY:propSupport(state,kind,gx,gz,hostId)??target.baseY??0};}
 const placement=placementTransform({kind,gx,gz,rotation},target.point);
 return {...placement,kind,material:MATERIALS[materialIndex],level,baseY:target.baseY??buildBase(target.gx,target.gz)??terrainHeight(target.point.x,target.point.z)};
}
function rotateChoice(){rotation=(rotation+1)%rotationCount(pieceKeys[pieceIndex]);updateHUD();}

function intersectsPlayer(b){return boxes(b).some(a=>touches(a,pos.x,pos.z)&&a.maxY>feet+.3&&a.minY<feet+1.65);}
function canWalk(x,z){
 if(!inWorld(x,z)||terrainHeight(x,z)>feet+.31||reefBlocked(physicalSolids(x,z),x,z,feet))return false;
 for(const p of state.delights)for(const a of propBoxes(p))if(touches(a,x,z)&&a.maxY>feet+.31&&a.minY<feet+1.65)return false;
 for(const b of state.buildings)for(const a of boxes(b))if(touches(a,x,z)&&a.maxY>feet+.31&&a.minY<feet+1.65)return false;
 for(const p of Object.values(state.plots))if(p.growth>.3&&!isFlower(p.seed)&&Math.hypot(x-p.gx*2,z-p.gz*2)<.24+.2*p.growth)return false;
 for(const r of nearbyResources(state,x,z,2))if(!isFlower(r.kind)&&Math.hypot(x-r.gx*2,z-r.gz*2)<.6)return false;
 for(const a of [...world.colliders??[],...activeDiscoveries(state).flatMap(d=>d.solids)])if(touches(a,x,z)&&feet<a.height)return false;
 return true;
}
function residentCanStand(x,z,baseY=0){
 if(!inWorld(x,z)||Math.abs(terrainHeight(x,z)-baseY)>.25||reefBlocked(physicalSolids(x,z),x,z,baseY,{radius:.31,height:1.7,step:.3}))return false;
 for(const p of state.delights)for(const a of propBoxes(p))if(touches(a,x,z,.31)&&a.maxY>baseY+.3&&a.minY<baseY+1.7)return false;
 const floor=state.buildings.some(b=>b.kind==='floor'&&baseOf(b)===baseY&&b.level===0&&Math.abs(x-b.gx*2)<1&&Math.abs(z-b.gz*2)<1);
 if(!floor&&state.plots[cellKey(Math.round(x/2),Math.round(z/2))]?.phase==='hole')return false;
 for(const b of state.buildings)for(const a of boxes(b))if(touches(a,x,z,.31)&&a.maxY>baseY+.3&&a.minY<baseY+1.7)return false;
 for(const p of Object.values(state.plots))if(p.growth>.3&&!isFlower(p.seed)&&Math.hypot(x-p.gx*2,z-p.gz*2)<.31+.2*p.growth)return false;
 for(const r of nearbyResources(state,x,z,2))if(!isFlower(r.kind)&&Math.hypot(x-r.gx*2,z-r.gz*2)<.67)return false;
 for(const a of [...world.colliders??[],...activeDiscoveries(state).flatMap(d=>d.solids)])if(touches(a,x,z,.31))return false;
 return true;
}
function residentFloor(x,z,baseY=0){return state.buildings.some(b=>b.kind==='floor'&&baseOf(b)===baseY&&b.level===0&&Math.abs(x-b.gx*2)<1&&Math.abs(z-b.gz*2)<1)?baseY+.15:terrainHeight(x,z);}
function floorAt(x,z){let f=state.plots[cellKey(Math.round(x/2),Math.round(z/2))]?.phase==='hole'?-.6:terrainHeight(x,z);
 for(const b of state.buildings)if(b.kind==='floor'||b.kind==='roof')for(const a of boxes(b))if(touches(a,x,z,.1)&&a.maxY<=feet+.31)f=Math.max(f,a.maxY);return propFloor(state.delights,x,z,feet,reefFloor(physicalSolids(x,z),x,z,feet,f));}
function placeTool(){if(toolMesh)toolMesh.position.set(Math.min(.43,Math.tan(camera.fov*Math.PI/360)*.72*camera.aspect*(camera.aspect<1?.4:.76)),camera.aspect<1?-.31:-.42,-.72);}
function chooseTool(i){if(connectionGhost){scene.remove(connectionGhost);connectionGhost.traverse(o=>{if(o.isMesh)o.material.dispose();});connectionGhost=null;}resetActions();timedEcho=null;lastFailure=null;tool=i;swing=0;if(toolMesh)camera.remove(toolMesh);toolMesh=createTool(tools[i].key);toolMesh.scale.setScalar(i===3?.38:.55);placeTool();toolMesh.rotation.set(-.12,-.22,-.08);camera.add(toolMesh);if(preview){scene.remove(preview);preview.traverse(o=>{if(o.isMesh)o.material.dispose();});preview=null;}if(tool===5){preview=isToy()?createDelight(pieceKeys[pieceIndex]):createBuildPiece(pieceKeys[pieceIndex],MATERIALS[materialIndex]);preview.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshBasicMaterial({color:'#e1f4a9',transparent:true,opacity:.4,depthWrite:false});o.castShadow=false;}});scene.add(preview);if(pieceKeys[pieceIndex]==='gutter'){connectionGhost=createDelight('waterWheel');connectionGhost.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshBasicMaterial({color:'#81d6da',transparent:true,opacity:.19,depthWrite:false});o.castShadow=false;}});scene.add(connectionGhost);}}updateHUD();}
function cycle(delta){if(tool===5){pieceIndex=(pieceIndex+delta+pieceKeys.length)%pieceKeys.length;level=pieceKeys[pieceIndex]==='roof'?1:0;}else{do{seedIndex=(seedIndex+delta+seedKeys.length)%seedKeys.length;}while(!seedUnlocked(state,seedKeys[seedIndex]));if(tool!==1)tool=1;}chooseTool(tool);}
function browse(delta){if(tool===1||tool===5)cycle(delta);else chooseTool((tool+delta+tools.length)%tools.length);}
function updateHUD(){
 $('hud').classList.toggle('building',tool===5||tool===6);
 $('resources').innerHTML=Object.entries(state.inventory).map(([k,v])=>`<div class="resource" tabindex="0" data-word="material.${k}" data-icon="${k}" title="${t('material.'+k)}" aria-label="${t('ui.inventoryCount',{material:t('material.'+k),count:v})}">${icon(k)}<span>${t('material.'+k)}</span><b>${v}</b></div>`).join('');
 $('toolbar').innerHTML=tools.map((item,i)=>`<button class="${i===tool?'active':''}" data-tool="${i}" data-word="tool.${item.key}" ${item.key==='fill'?'data-icon="fill"':`data-picture="tool:${item.key}"`} aria-label="${t('action.'+item.key)}" aria-pressed="${i===tool}"><small>${i+1}</small><span class="toolPic">${['seed','fill','build','remove'].includes(item.key)?icon(item.key):picture('tool:'+item.key,t('tool.'+item.key))}</span>${t('action.'+item.key)}</button>`).join('');
 $('toolbar').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseTool(Number(b.dataset.tool)));
 const seed=seedKeys[seedIndex],part=pieceKeys[pieceIndex],material=isToy()?DELIGHTS[part].material:MATERIALS[materialIndex];
 $('selectedName').textContent=tool===1?t('ui.seedChoice',{noun:t('tree.'+seed)}):tool===5?(isToy()?t('prop.'+part):t('ui.pieceChoice',{piece:t('piece.'+part),material:t('material.'+material)})):t('tool.'+tools[tool].key);
 $('selectedPicture').innerHTML=tool===2?icon('fill'):picture(tool===1?'seed:'+seed:tool===5?(isToy()?'prop:'+part:`piece:${part}:${material}`):'tool:'+tools[tool].key,$('selectedName').textContent);
 selectionDetail=tool===1?t('ui.chooseSeed'):tool===5?t('ui.buildCost',{count:(DELIGHTS[part]??PIECES[part]).cost,material:t('material.'+material),level}):t(tool===4?'ui.holdChop':tool===3?'ui.holdWater':'ui.clickUse');renderSelectionDetail();
 $('buildActions').hidden=tool!==5;
 if(tool===5){$('buildActions').innerHTML=`<button id="changeMaterial" aria-label="${t('aria.changeMaterial')}">${icon(material)}</button><button id="rotatePiece" aria-label="${t('aria.rotate')}">${icon('rotate')}</button><button id="lowerPiece" aria-label="${t('aria.lower')}">−</button><button id="raisePiece" aria-label="${t('aria.raise')}">+</button>`;$('changeMaterial').hidden=isToy();$('lowerPiece').hidden=isToy();$('raisePiece').hidden=isToy();$('changeMaterial').onclick=()=>{materialIndex=(materialIndex+1)%MATERIALS.length;chooseTool(5);};$('rotatePiece').onclick=rotateChoice;$('lowerPiece').onclick=()=>{level=Math.max(0,level-1);updateHUD();};$('raisePiece').onclick=()=>{level=Math.min(3,level+1);updateHUD();};}
 updateJournal();
}
const steps=[['shovel',0],['seed',1],['fill',2],['hose',3],['grow',null],['axe',4],['build',5]];

function stageFor(p){return !p?0:p.phase==='hole'?(p.seed?2:1):p.seed?(p.growth>=1?5:p.water<.2?3:4):0;}
function contextStage(){if(target?.wildId)return 5;const p=target&&state.plots[cellKey(target.gx,target.gz)];if(p)return stageFor(p);if(state.stats.harvested>0)return 6;const active=Object.values(state.plots).find(p=>p.growth<1);return active?stageFor(active):0;}
function setupPictures(){
 for(const [id,name,key] of [['menuButton','build','Tab'],['journalButton','book','J'],['pauseBuild','build','Tab'],['pauseJournal','book','J'],['buildTab','build','Tab'],['journalTab','book','J']]){
  const label=t(name==='build'?'ui.buildMenu':'ui.journalMenu');$(id).innerHTML=icon(name)+`<span>${label}</span><kbd>${key}</kbd>`;$(id).setAttribute('aria-label',label);
 }
 refreshPause();
 $('welcomePictures').innerHTML=icon('seed')+icon('grow')+picture('seed:oak',t('tree.oak'))+icon('build')+picture('piece:roof:wood',t('aria.buildHouse'));
 $('loopGuide').innerHTML=steps.map(([name],i)=>`<button data-step="${i}" aria-label="${t('action.'+name)}" title="${t('action.'+name)}">${icon(name)}</button>`).join('');
 $('loopGuide').querySelectorAll('button').forEach(b=>b.onclick=()=>{const index=steps[Number(b.dataset.step)][1];if(index!==null)chooseTool(index);});
 $('catalogLoop').innerHTML=steps.map(([name],i)=>(i?'→':'')+`<span>${icon(name)}${t('action.'+name)}</span>`).join('');
 $('previousChoice').onclick=()=>browse(-1);$('nextChoice').onclick=()=>browse(1);
 $('showPieces').innerHTML=icon('build')+`<span>${t('ui.buildHeading')}</span>`;$('showObjects').innerHTML=picture('prop:birdhouse',t('ui.toysHeading'))+`<span>${t('ui.toysHeading')}</span>`;
 $('showPieces').onclick=()=>jumpBuildSection('piecesHeading');$('showObjects').onclick=()=>jumpBuildSection('objectsHeading');
}
function updateJournal(){
 let title='journal.start',detail='journal.loop',params={};
 if(state.stats.harvested>0){title='journal.build';detail='journal.stats';params={harvests:state.stats.harvested,pieces:state.buildings.length};}
 else if(state.stats.planted>0){
  const planted=Object.values(state.plots).filter(p=>p.seed),aimed=target&&state.plots[cellKey(target.gx,target.gz)];
  const stage=aimed?.growth>=1||planted.every(p=>p.growth>=1)?'ready':planted.some(p=>p.phase==='hole')?'cover':planted.some(p=>p.growth<1&&p.water<.2)?'water':'grow';
  title='journal.'+stage;detail=title+'Help';
 }
 const stage=contextStage();$('loopGuide').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('current',i===stage);b.classList.toggle('next',i===stage+1);});
 $('objective').textContent=t(title);$('journalText').textContent=t(detail,params);
}
function refreshPause(){$('overlay').dataset.mode=started?'pause':'landing';const key=started?'ui.resume':hasSavedWorld?'ui.continue':'ui.play';$('start').innerHTML=icon('play')+'<span>'+t(key)+'</span>';$('start').setAttribute('aria-label',t(key));$('pauseTitle').textContent=started||hasSavedWorld?t('ui.paused'):'';$('closeCatalog').innerHTML=icon('play')+'<span>'+t(key)+'</span>';$('closeCatalog').setAttribute('aria-label',t(key));}
function showCatalog(show=true,mode=menuMode){
 clearReading();if(show){audio.pause();clearEffects();}resetActions();$('wardrobe').hidden=true;outfitResident=null;catalogOpen=show;$('catalog').hidden=!show;held=false;keys.clear();
 if(show){refreshPause();menuMode=mode;locked=false;document.exitPointerLock?.();$('overlay').hidden=true;renderCatalog();$('catalogBody').scrollTop=0;(mode==='journal'?$('bookLanguage'):$('materialCards').querySelector('.chosen')).focus({preventScroll:true});}
 else requestLock();
}
// Keep the actual focused/hovered buttons, even when their localized contents change.
function reconcileCards(id,html){
 const root=$(id),template=document.createElement('template');template.innerHTML=html;
 for(const [index,next] of [...template.content.children].entries()){
  const current=root.children[index];if(!current){root.append(next);continue;}
  for(const name of current.getAttributeNames())if(!next.hasAttribute(name))current.removeAttribute(name);
  for(const attribute of next.attributes)if(current.getAttribute(attribute.name)!==attribute.value)current.setAttribute(attribute.name,attribute.value);
  if(current.innerHTML!==next.innerHTML)current.innerHTML=next.innerHTML;
 }
}
function buildAvailability(material,cost){
 const have=state.inventory[material]??0,missing=Math.max(0,cost-have);
 return {have,missing,ready:missing===0,text:missing?t('ui.missingCount',{count:missing,material:t('material.'+material)}):t('ui.readyToBuild')};
}
function cardCost(material,cost,availability){
 return `<small class="cardCost">${icon(material)} ${cost} <span class="ownedCount">${t('ui.haveCount',{count:availability.have})}</span></small><span class="cardStatus">${icon(availability.ready?'check':'lock')}${availability.text}</span>`;
}
function updateCatalogScroll(){
 const body=$('catalogBody');$('catalog').dataset.scrollable=String(body.scrollHeight>body.clientHeight+2&&body.scrollTop+body.clientHeight<body.scrollHeight-3);
}
function jumpBuildSection(id){
 const body=$('catalogBody'),heading=$(id);body.scrollTop+=heading.getBoundingClientRect().top-body.getBoundingClientRect().top;updateCatalogScroll();
}
function renderCatalog(){
 $('buildChoices').hidden=menuMode!=='build';$('journalChoices').hidden=menuMode!=='journal';
 $('buildTab').setAttribute('aria-pressed',String(menuMode==='build'));$('journalTab').setAttribute('aria-pressed',String(menuMode==='journal'));
 $('catalogInventory').innerHTML=`<strong>${t('ui.stockHeading')}</strong>`+MATERIALS.map(m=>`<span class="menuResource" data-word="material.${m}" data-icon="${m}" aria-label="${t('ui.inventoryCount',{material:t('material.'+m),count:state.inventory[m]??0})}">${icon(m)}<b>${state.inventory[m]??0}</b></span>`).join('');
 reconcileCards('seedCards',seedKeys.map((k,i)=>{const spec=SEEDS[k],unlocked=seedUnlocked(state,k),noun=t('tree.'+k);return `<button aria-disabled="${!unlocked}" class="card ${unlocked?'':'seedLocked'} ${i===seedIndex?'chosen':''}" data-seed="${i}" data-word="tree.${k}" data-picture="seed:${k}" aria-label="${t('ui.plantChoice',{noun})}${unlocked?'':'. '+t('ui.lockedSeed')}" aria-pressed="${i===seedIndex}">${picture('seed:'+k,t('ui.maturePicture',{noun}))}${unlocked?'':`<span class="chosenMark">${icon('lock')}</span>`}${i===seedIndex?`<span class="chosenMark">${icon('check')}</span>`:''}<b>${noun}</b><small>${icon(spec.resource)} +${spec.yield}</small><span class="cardStatus">${unlocked?'':icon('footsteps')+t('ui.lockedSeed')}</span></button>`;}).join(''));
 reconcileCards('pieceCards',Object.keys(PIECES).map((k,i)=>{const material=MATERIALS[materialIndex],a=buildAvailability(material,PIECES[k].cost);return `<button class="card ${i===pieceIndex?'chosen':''}" data-affordable="${a.ready}" aria-disabled="${!a.ready}" data-piece="${i}" data-word="piece.${k}" data-picture="piece:${k}:${material}" aria-label="${t('ui.buildChoice',{piece:t('piece.'+k)})}. ${a.text}">${picture(`piece:${k}:${material}`,t('piece.'+k))}<b>${t('piece.'+k)}</b>${cardCost(material,PIECES[k].cost,a)}</button>`;}).join(''));
 reconcileCards('toyCards',DELIGHT_KEYS.map(k=>{const d=DELIGHTS[k],a=buildAvailability(d.material,d.cost);return `<button class="card ${pieceKeys[pieceIndex]===k?'chosen':''}" data-affordable="${a.ready}" aria-disabled="${!a.ready}" data-toy="${k}" data-word="prop.${k}" data-picture="prop:${k}" aria-label="${t('prop.'+k)}. ${a.text}">${picture('prop:'+k,t('prop.'+k))}<b>${t('prop.'+k)}</b>${cardCost(d.material,d.cost,a)}</button>`;}).join(''));
 $('toyCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{const d=DELIGHTS[b.dataset.toy];if(!buildAvailability(d.material,d.cost).ready)return;pieceIndex=pieceKeys.indexOf(b.dataset.toy);level=0;chooseTool(5);showCatalog(false);});
 reconcileCards('materialCards',MATERIALS.map((m,i)=>`<button data-material="${i}" data-word="material.${m}" data-picture="piece:wall:${m}" class="${i===materialIndex?'chosen':''}" aria-label="${t('ui.materialChoice',{material:t('material.'+m)})}" aria-pressed="${i===materialIndex}">${picture('piece:wall:'+m,t('material.'+m))}${t('material.'+m)}</button>`).join(''));
 $('seedCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(!seedUnlocked(state,seedKeys[Number(b.dataset.seed)]))return;seedIndex=Number(b.dataset.seed);chooseTool(1);showCatalog(false);});
 $('pieceCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{const k=Object.keys(PIECES)[Number(b.dataset.piece)];if(!buildAvailability(MATERIALS[materialIndex],PIECES[k].cost).ready)return;pieceIndex=Number(b.dataset.piece);level=k==='roof'?1:0;chooseTool(5);showCatalog(false);});
 $('materialCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{materialIndex=Number(b.dataset.material);chooseTool(5);renderCatalog();menuReading=currentReading=semanticElement(b);renderReading();});
 requestAnimationFrame(updateCatalogScroll);
}
function setupLivingUI(){
 const mute=$('muteButton');const refresh=()=>{mute.innerHTML=icon(audio.muted?'mute':'sound');mute.setAttribute('aria-label',t(audio.muted?'aria.unmute':'aria.mute'));mute.setAttribute('aria-pressed',String(audio.muted));};refresh();mute.onclick=()=>{audio.toggle();refresh();};
 $('friendButton').innerHTML=icon('shirt')+'<kbd>F</kbd>';$('friendButton').onclick=()=>{if(nearestFriend)openWardrobe(nearestFriend.id);};
 $('closeWardrobe').innerHTML=icon('play');$('closeWardrobe').onclick=requestLock;
}
function openWardrobe(id){
 clearReading();
 const r=state.residents.find(r=>r.id===id);if(!r)return;
 resetActions();audio.pause();clearEffects();locked=false;catalogOpen=true;keys.clear();outfitResident=id;$('catalog').hidden=true;$('overlay').hidden=true;$('wardrobe').hidden=false;document.exitPointerLock?.();
 reconcileCards('outfitCards',[0,1,2,3].map(o=>`<button class="outfitCard ${o===(r.outfit??0)?'chosen':''}" data-outfit="${o}" data-word="noun.clothes" data-picture="${r.habitat==='ocean'?'diver':'resident'}:${r.variant}:${o}" aria-label="${t('ui.outfit',{number:o+1})}" aria-pressed="${o===(r.outfit??0)}">${picture(`${r.habitat==='ocean'?'diver':'resident'}:${r.variant}:${o}`,t('ui.outfit',{number:o+1}))}${icon(o===(r.outfit??0)?'check':'shirt')}</button>`).join(''));
 $('outfitCards').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(setOutfit(state,id,Number(b.dataset.outfit)).ok){dirty=true;residents.sync();save();openWardrobe(id);menuReading=currentReading=semanticElement(b);renderReading();}});
}
function updateFriendButton(){
 nearestFriend=(state.residents??[]).filter(r=>r.x!==null&&Math.hypot(r.x-pos.x,residentFloor(r.x,r.z,r.baseY??0)-feet,r.z-pos.z)<4.5).find(r=>{const point=new THREE.Vector3(r.x,residentFloor(r.x,r.z,r.baseY??0)+1,r.z),p=point.clone().project(camera);if(!(p.z>=-1&&p.z<=1&&Math.abs(p.x)<.9&&Math.abs(p.y)<.9))return false;const direction=point.clone().sub(camera.position),ray=new THREE.Raycaster(camera.position,direction.clone().normalize(),0,direction.length());return ray.intersectObjects([...buildMeshes.values()],true).length===0;});
 $('friendButton').hidden=!locked||!nearestFriend;
}
function activateFallback(){fallbackLook=true;locked=true;started=true;catalogOpen=false;$('overlay').hidden=true;$('catalog').hidden=true;keys.clear();held=false;saveStatus('ui.fallback');toast('ui.fallbackToast');}
function requestLock(){
 clearReading();document.activeElement?.blur();
 resetActions();audio.start();outfitResident=null;$('wardrobe').hidden=true;catalogOpen=false;$('catalog').hidden=true;
 if(fallbackLook||!canvas.requestPointerLock){activateFallback();return;}
 try{const pending=canvas.requestPointerLock();pending?.catch(()=>activateFallback());}catch{activateFallback();}
}
$('overlay').addEventListener('click',e=>{if(started&&$('overlay').dataset.mode==='pause'&&!e.target.closest('button,a,input,select,option,label,summary,details')){e.preventDefault();e.stopPropagation();requestLock();}});
canvas.addEventListener('click',()=>{if(!locked&&!catalogOpen&&outfitResident===null)requestLock();});
$('start').onclick=requestLock;for(const id of ['menuButton','pauseBuild','buildTab'])$(id).onclick=()=>showCatalog(true,'build');for(const id of ['journalButton','pauseJournal','journalTab'])$(id).onclick=()=>showCatalog(true,'journal');$('closeCatalog').onclick=()=>showCatalog(false);
$('reset').onclick=()=>{
 if(!confirm(t('ui.resetConfirm')))return;
 // Persist first: a denied write leaves the old world intact. Reload disposes all old runtime identities.
 try{localStorage.setItem(SAVE_KEY,serialize(freshState()));dirty=false;location.reload();}
 catch{saveStatus('ui.saveUnavailable');$('welcomeSave').textContent=t('ui.saveUnavailable');}
};
document.addEventListener('pointerlockchange',()=>{if(fallbackLook)return;resetActions();locked=document.pointerLockElement===canvas;held=false;keys.clear();if(locked){started=true;$('overlay').hidden=true;$('catalog').hidden=true;catalogOpen=false;}else if(!catalogOpen){clearReading();audio.pause();clearEffects();$('overlay').hidden=false;refreshPause();}save();});
document.addEventListener('pointerlockerror',activateFallback);
document.addEventListener('mousemove',e=>{if(locked&&(!fallbackLook||rightDrag)){yaw-=e.movementX*.0022;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*.0022));dirty=true;}});
document.addEventListener('keydown',e=>{
 if(!locked){if(e.code==='Escape'){e.preventDefault();catalogOpen=false;outfitResident=null;$('catalog').hidden=true;$('wardrobe').hidden=true;$('overlay').hidden=false;clearReading();refreshPause();$('start').focus();}return;}
 if(e.target.closest('select,input,textarea')||e.target.closest('button,a,summary')&&['Space','Enter'].includes(e.code))return;
 if(['Tab','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(e.code==='KeyF'&&locked&&nearestFriend){openWardrobe(nearestFriend.id);return;}
 if(e.code==='Escape'&&fallbackLook){audio.pause();clearEffects();resetActions();locked=false;held=false;rightDrag=false;clearReading();keys.clear();catalogOpen=false;$('catalog').hidden=true;$('overlay').hidden=false;refreshPause();save();return;}
 if(e.code==='Tab'||e.code==='KeyJ'){e.preventDefault();showCatalog(true,e.code==='Tab'?'build':'journal');return;}
 if(!locked)return;if(!e.repeat)audio.start();keys.add(e.code);if(e.repeat)return;
 if(/^Digit[1-7]$/.test(e.code)){chooseTool(Number(e.code.at(-1))-1);return;}
 if(e.code==='KeyE')browse(1);if(e.code==='KeyQ')browse(-1);
 if(e.code==='KeyR'&&tool===5){rotateChoice();}
 if(e.code==='KeyM'&&tool===5){materialIndex=(materialIndex+1)%MATERIALS.length;chooseTool(5);}
 if(['KeyZ','KeyX'].includes(e.code)&&tool===5){level=Math.max(0,Math.min(3,level+(e.code==='KeyX'?1:-1)));updateHUD();}
 if(e.code==='Space'&&!swimmingAt(pos.x,pos.z,feet)&&Math.abs(feet-floorAt(pos.x,pos.z))<.06)vy=6;
});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{audio.pause();keys.clear();resetActions();save();});
// Focus alone never restarts audio; an actual play gesture does.
canvas.addEventListener('mousedown',e=>{menuReading=null;document.activeElement?.blur();audio.start();if(e.button===2&&locked)rightDrag=true;if(e.button===0&&locked){if(target?.propId&&tool<5){act();held=true;}else{held=true;if(tool!==3&&tool!==4)act();}}});document.addEventListener('mouseup',()=>{resetActions();rightDrag=false;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
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
  if(data.wildId){const r=resourceRecord(data.wildId);if(r)target={gx:r.gx,gz:r.gz,wildId:r.id,point:hit.point,baseY:r.baseY??0};}
  else if(data.plot){const p=state.plots[data.plot];if(p)target={gx:p.gx,gz:p.gz,plot:data.plot,point:hit.point,baseY:0};}
  else if(data.propId){const p=state.delights.find(p=>p.id===data.propId);if(p)target={gx:p.gx,gz:p.gz,propId:p.id,point:hit.point,baseY:p.baseY};}
  else if(data.buildId){const b=state.buildings.find(b=>b.id===data.buildId);if(b){let gx=b.gx,gz=b.gz;
   if(wallLike(b)){const interiors=adjacentCells(b),floor=interiors.find(c=>state.buildings.some(f=>f.kind==='floor'&&f.gx===c.gx&&f.gz===c.gz&&baseOf(f)===baseOf(b)));if(floor){gx=floor.gx;gz=floor.gz;}}
   target={gx,gz,buildId:b.id,point:hit.point,baseY:baseOf(b)};}}
  else if(data.worldGround)target={ground:true,gx:Math.round(hit.point.x/2),gz:Math.round(hit.point.z/2),point:hit.point,baseY:buildBase(Math.round(hit.point.x/2),Math.round(hit.point.z/2))??terrainHeight(hit.point.x,hit.point.z)};
  else if(hit.instanceId!==undefined){target={...groundCells[hit.instanceId],ground:true,point:hit.point,baseY:0};}
 }
 if(tool===4&&!target?.wildId&&!target?.plot&&!target?.buildId&&!target?.propId){
  const flower=flowerTarget(raycaster.ray,flowerEnvelopes.values(),[...interactive,world.group,ocean,...garden.discoveries.values()]);
  if(flower){const r=resourceRecord(flower.id);target={gx:r.gx,gz:r.gz,wildId:r.id,point:flower.point,baseY:r.baseY??0};}
 }
 if(target){target.distance=camera.position.distanceTo(target.point);const plant=state.plots[cellKey(target.gx,target.gz)];target.outOfReach=target.distance>(target.propId&&tool<5?3:(target.wildId||plant?.growth>=1)?3.8:6);}
 tileOutline.visible=!!target&&locked&&!target.outOfReach;if(target)tileOutline.position.set(target.gx*2,(target.baseY??0)+.035,target.gz*2);
 if(preview){preview.visible=!!target&&locked&&!target.outOfReach;if(target){const b=selectedBuild();preview.position.set(b.gx*2,(isToy()?b.baseY:baseOf(b)+b.level*2.4),b.gz*2);preview.rotation.y=b.rotation*Math.PI/2;const valid=placementResult(b).ok;preview.traverse(o=>{if(o.isMesh)o.material.color.set(valid?'#d8f5a5':'#f49471');});}}
 if(connectionGhost){connectionGhost.visible=!!target&&locked&&!target.outOfReach;if(target){const b=selectedBuild(),[dx,dz]=rotateXZ(2,0,b.rotation);connectionGhost.position.set(b.gx*2+dx,b.baseY,b.gz*2+dz);connectionGhost.rotation.y=b.rotation*Math.PI/2;}}
}
function renderActionEcho(kind,progress,active,complete=false){
 timedEcho=actionEcho(timedEcho,{kind,progress,active,complete,visible:locked&&[3,4].includes(tool),now:elapsed});
 const html=timedEcho?`<span class="progressRing" style="--progress:${Math.round(timedEcho.progress*100)}">${icon(timedEcho.complete?'check':timedEcho.kind==='water'?'hose':'axe')}</span>`:'';
 if(html!==lastCue){$('targetCue').innerHTML=html;lastCue=html;}
 $('targetCue').hidden=!html;$('targetCue').className='';
 $('targetLabel').textContent=timedEcho?t(timedEcho.kind==='water'?'action.hose':'action.axe'):'';
}
function renderReward(){if(!lastReward)return;$('reward').innerHTML=lastReward.seed?icon('sparkle')+picture('seed:'+lastReward.seed,t('tree.'+lastReward.seed))+icon('check'):icon(lastReward.resource)+`<b>+${lastReward.amount}</b>`;$('reward').setAttribute('aria-label',lastReward.seed?t(lastReward.newSeed?'message.newSeed':'message.secret'):t('message.yield',{material:t('material.'+lastReward.resource),count:lastReward.amount}));}
function reward(result){lastReward={resource:result.resource,amount:result.amount};renderReward();rewardUntil=elapsed+2.5;$('reward').classList.add('show');}
function finishHarvest(){
 const r=target.wildId?resourceRecord(target.wildId):null,p=state.plots[cellKey(target.gx,target.gz)],kind=r?.kind??p?.seed;
 const g=r?wildMeshes.get(r.id):plantMeshes.get(cellKey(target.gx,target.gz));
 const result=r?harvestWild(state,r.id):harvest(state,target.gx,target.gz);
 if(result.ok){if(g&&!isFlower(kind)){const fall=g.clone();scene.add(fall);falling.push({g:fall,life:.6});}dirty=true;reward(result);burst(target.gx,target.gz,SEEDS[kind].color,target.baseY??0);toast(result);audio.play('harvest',{sourceId:r?.id??'plot:'+cellKey(target.gx,target.gz),material:SEEDS[kind].resource,x:target.gx*2,y:target.baseY??0,z:target.gz*2});pickup(result,target.gx*2,target.gz*2,target.baseY??0);sync();save();}else failure(result);
}
function addEffect(m,x,y,z,life,v,bounce=false,ring=false){
 if(sparks.length>=96){const old=sparks.shift();scene.remove(old.m);old.m.geometry.dispose();old.m.material.dispose();}
 m.position.set(x,y,z);scene.add(m);sparks.push({m,life,v,bounce,ring});
}
function clearEffects(){for(const s of sparks){scene.remove(s.m);s.m.geometry.dispose();s.m.material.dispose();}sparks.length=0;for(const f of falling)scene.remove(f.g);falling.length=0;stream.visible=false;}
function burst(gx,gz,c='#d9be78',baseY=0){
 for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.07,.055,.16),new THREE.MeshStandardMaterial({color:c,roughness:.8}));addEffect(m,gx*2,baseY+.45,gz*2,.8,new THREE.Vector3((Math.random()-.5)*3,Math.random()*2+1,(Math.random()-.5)*3));}
}
function splash(x,z){
 const m=new THREE.Mesh(new THREE.RingGeometry(.07,.10,16),new THREE.MeshBasicMaterial({color:'#c9f7ef',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;addEffect(m,x,.06,z,.6,new THREE.Vector3(),false,true);
 for(let i=0;i<3;i++){const drop=new THREE.Mesh(new THREE.BoxGeometry(.025,.07,.025),new THREE.MeshBasicMaterial({color:'#c9f7ef'}));addEffect(drop,x,.12,z,.35,new THREE.Vector3((Math.random()-.5)*1.3,1,(Math.random()-.5)*1.3));}
}
function pickup(result,x,z,baseY=0){
 const colors={wood:'#bc8955',copper:'#db9258',iron:'#b9cdd1',diamond:'#83dbe2',fiber:'#b9cd89'};
 for(let i=0;i<4;i++){const m=new THREE.Mesh(result.resource==='diamond'?new THREE.OctahedronGeometry(.17):new THREE.BoxGeometry(.22,.2,.25),new THREE.MeshStandardMaterial({color:colors[result.resource],metalness:['copper','iron'].includes(result.resource)?.3:0,roughness:.55}));addEffect(m,x,baseY+.8,z,1.6,new THREE.Vector3(Math.cos(i*1.7)*1.3,2.4+i*.2,Math.sin(i*1.7)*1.3),true);}
}
function liftBodies(){return [{id:'player',x:pos.x,z:pos.z,feet,height:1.65,radius:.24},...(residents?.bodies?.()??[])];}
function placementResult(b){
 if(!b)return {ok:false,code:'message.closer'};
 if(!isToy())return intersectsPlayer(b)?{ok:false,code:'message.stepAside'}:marineLife.overlapsBuilding(b)?{ok:false,code:'message.creatureRoom'}:validateBuild(state,b);
 const check=validateDelight(state,b);if(!check.ok)return check;
 const volumes=propBoxes(b,{envelope:true});
 if(liftBodies().some(body=>volumes.some(a=>touches(a,body.x,body.z,body.radius)&&a.maxY>body.feet+.02&&a.minY<body.feet+body.height)))return {ok:false,code:'message.stepAside'};
 if(volumes.some(a=>physicalSolids(b.gx*2,b.gz*2).some(r=>boxesOverlap(a,r,.001))))return {ok:false,code:'message.toyClearance'};
 if(marineLife.animals.some(a=>volumes.some(b=>touches(b,a.x,a.z,a.profile.radius)&&b.maxY>a.y+a.profile.minY&&b.minY<a.y+a.profile.maxY)))return {ok:false,code:'message.creatureRoom'};
 return check;
}
function toyHint(p){const q=delights.motion.get(p.id);if(p.kind==='gutter')return t(q?.connectedTo?'ui.toyPour':'ui.toyConnect');if(p.kind==='waterWheel'&&!q?.connectedTo)return t('ui.toyBell');if(p.kind==='lamp'&&!q?.connectedTo)return t('ui.toyLamp');return '';}
function updateToyButton(){const p=target?.propId&&state.delights.find(p=>p.id===target.propId),show=locked&&tool<5&&!!p&&!target.outOfReach;$('useButton').hidden=!show;$('hud').classList.toggle('usingToy',show);if(!show)return;tileOutline.visible=false;const pouring=p.kind==='gutter',key=p.kind+':'+i18n.language;if($('useButton').dataset.content===key)return;$('useButton').dataset.content=key;$('useButton').innerHTML=picture('prop:'+p.kind,t('prop.'+p.kind))+icon(pouring?'hose':'hand');$('useButton').setAttribute('aria-label',pouring?t('ui.toyPour'):t('ui.toyUse',{noun:t('prop.'+p.kind)}));}
$('useButton').onmousedown=e=>{e.preventDefault();e.stopPropagation();audio.start();const p=state.delights.find(p=>p.id===target?.propId);if(p?.kind==='gutter'&&!target.outOfReach){if(tool!==3)chooseTool(3);held=true;}};
$('useButton').onclick=e=>{e.stopPropagation();const p=state.delights.find(p=>p.id===target?.propId);if(!p||target.outOfReach)return;if(p.kind==='gutter'){if(tool!==3)chooseTool(3);}else delights.use(p.id);};
function removalOptions(p){return {occupied:p?.kind==='lift'&&liftRiders(p,liftBodies()).length>0};}
function removalResult(){const p=state.delights.find(p=>p.id===target?.propId);return p?validateRemoveDelight(state,p.id,removalOptions(p)):validateRemove(state,target?.buildId);}
function act(){
 // A click can land between input/state changes and the next render. Recompute
 // visible transforms and the real ray once per click, never trust last frame's pick.
 scene.updateMatrixWorld(true);camera.position.set(pos.x,feet+1.7,pos.z);camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld();pick();
 if(tool<5&&target?.propId&&!target.outOfReach){if(state.delights.find(p=>p.id===target.propId)?.kind==='gutter'){if(tool!==3)chooseTool(3);return;}delights.use(target.propId);dirty=true;save();return;}
 if(!target||target.outOfReach){failure({code:target?farTargetHint(target,state.plots,camera.position.y):'target.aim'});return;}
 if(target.wildId){failure({code:'message.axeWild'});return;}
 const {gx,gz}=target,removedProp=state.delights.find(p=>p.id===target.propId),removedMaterial=removedProp?DELIGHTS[removedProp.kind].material:state.buildings.find(b=>b.id===target.buildId)?.material;let result;
 if(tool===0)result=dig(state,gx,gz);if(tool===1)result=plant(state,gx,gz,seedKeys[seedIndex]);if(tool===2)result=fill(state,gx,gz);
 if(tool===5){const b=selectedBuild();const check=placementResult(b);result=check.ok?(isToy()?placeDelight(state,b):build(state,b)):check;}
 if(tool===6){const p=state.delights.find(p=>p.id===target.propId);result=p?removeDelight(state,p.id,removalOptions(p)):remove(state,target.buildId);}
 if(result){toast(result);if(result.ok){dirty=true;swing=.25;audio.play(['dig','plant','fill','water','harvest','build','remove'][tool],{sourceId:target.propId?'prop:'+target.propId:target.buildId?'piece:'+target.buildId:'cell:'+cellKey(gx,gz),material:tool===5?(isToy()?DELIGHTS[pieceKeys[pieceIndex]].material:MATERIALS[materialIndex]):tool===6?removedMaterial:undefined,x:gx*2,y:target.baseY??0,z:gz*2});burst(gx,gz,undefined,target.baseY??0);sync();save();}}
}
function layoutContextActions(){const host=$('actionReadRow'),button=$('useButton');if(button.parentElement!==host)host.prepend(button);}
layoutContextActions();
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);placeTool();layoutContextActions();updateCatalogScroll();}window.addEventListener('resize',resize);
delights=createDelightSystem({scene,getState:()=>state,getPlayer:()=>pos,changed:()=>{dirty=true;},continuous:(id,kind,options)=>audio.setContinuous(id,kind,options),event:(kind,point)=>{audio.play(kind,point);if(kind==='bell')marineLife.greet?.(point);},getBodies:liftBodies,moveRiders:(ids,delta)=>{if(ids.includes('player')){feet+=delta;vy=0;}residents?.carry?.(ids,delta);},obstacles:id=>[...state.buildings.flatMap(boxes),...state.delights.flatMap(p=>p.id===id?propBoxes(p).slice(0,-1):propBoxes(p)),...reefSolids]});
residents=createResidentSystem({scene,getState:()=>state,getPlayer:()=>pos,canStand:residentCanStand,floorHeight:residentFloor,getDelights:()=>delights,getWindows:()=>marineLife.windows,changed:()=>{dirty=true;},notice:r=>{audio.play('arrival',{sourceId:'resident:'+r.id,x:r.x,y:r.baseY??0,z:r.z});toast(r.habitat==='ocean'?'message.diver':'message.neighbour');}});
garden=createGardenSystem({scene,getState:()=>state,getPlayer:()=>pos,canStand:(x,z)=>residentCanStand(x,z)&&!state.buildings.some(b=>Math.abs(x-b.gx*2)<1.7&&Math.abs(z-b.gz*2)<1.7),getDelights:()=>delights,flyClear:(x,y,z,own)=>![...state.buildings.flatMap(boxes),...state.delights.filter(p=>p.id!==own).flatMap(p=>propBoxes(p))].some(a=>touches(a,x,z,.13)&&a.maxY>y&&a.minY<y+.3),treeHeight:key=>plantMeshes.get(key)?.userData.perchHeight??3.5,onDiscover:r=>{dirty=true;audio.play('discover',{sourceId:'discovery:'+r.id,x:pos.x,y:feet,z:pos.z});lastReward={seed:r.seed,newSeed:r.newSeed};renderReward();rewardUntil=elapsed+5;$('reward').classList.add('show');toast(r.newSeed?'message.newSeed':'message.secret');burst(Math.round(pos.x/2),Math.round(pos.z/2),'#eddb90');updateHUD();save();}});
let currentReading=null,menuReading=null,lastReadingHTML='',lastReadingAt=0;
const readingFocus=createReadingFocus(),readingRay=new THREE.Raycaster();readingRay.far=12;
function clearReading(){readingFocus.clear();menuReading=currentReading=null;renderReading();}
function renderReading(){
 const card=$('wordCard'),menu=catalogOpen||!locked;
 card.classList.toggle('menuWord',menu);
 card.hidden=!currentReading;if(!currentReading){lastReadingHTML='';return;}
 const {key,picture:pic,material,icon:iconName}=currentReading;
 const text=(material?t('ui.pieceChoice',{piece:t(key),material:t('material.'+material)}):t(key)).toLocaleUpperCase(i18n.language);
 const html=(pic&&pictures[pic]?picture(pic,text):icon(iconName??'seed'))+'|'+text;
 if(html!==lastReadingHTML){$('wordPicture').innerHTML=pic&&pictures[pic]?picture(pic,text):icon(iconName??'seed');$('wordText').textContent=text;lastReadingHTML=html;}
 card.setAttribute('aria-label',t('ui.readingLabel'));
 // Menu card participates in layout so focused rows never sit beneath a floating overlay.
 const slot=!$('catalog').hidden?$('bookWordSlot'):!$('wardrobe').hidden?$('outfitWordSlot'):null;
 if(slot&&card.parentElement!==slot)slot.append(card);else if(!slot&&card.parentElement!==$('readingStack'))$('readingStack').append(card);
}
function semanticElement(element){const el=element?.closest?.('[data-word]');return el?{id:'menu:'+el.dataset.word,key:el.dataset.word,picture:el.dataset.picture,icon:el.dataset.icon}:null;}
function setupReadingEvents(){
 let modality='focus',pointer=null,scrollFrame=0;
 const read=element=>{menuReading=semanticElement(element);if(menuReading||!locked){currentReading=menuReading;renderReading();}};
 document.addEventListener('pointermove',e=>{if(!(e.movementX||e.movementY))return;modality='pointer';pointer={x:e.clientX,y:e.clientY};read(e.target);});
 document.addEventListener('mouseleave',()=>{pointer=null;menuReading=currentReading=null;renderReading();});
 document.addEventListener('pointerdown',e=>{modality='pointer';pointer={x:e.clientX,y:e.clientY};},true);
 document.addEventListener('keydown',()=>{modality='focus';},true);
 document.addEventListener('focusin',e=>read(e.target));
 document.addEventListener('focusout',e=>{menuReading=semanticElement(e.relatedTarget);if(!locked){currentReading=menuReading;renderReading();}});
 $('catalogBody').addEventListener('wheel',e=>{modality='pointer';pointer={x:e.clientX,y:e.clientY};},{passive:true});
 $('catalogBody').addEventListener('scroll',()=>{
  updateCatalogScroll();if(scrollFrame)return;
  scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;
   // Scrolling changes what is under a stationary pointer; it must not resurrect the old card.
   if(!locked&&!$('catalog').hidden&&modality==='pointer'&&pointer)read(document.elementFromPoint(pointer.x,pointer.y));
  });
 },{passive:true});
}
function updateReading(now){
 if(!locked||menuReading){currentReading=menuReading;renderReading();return;}
 if(now-lastReadingAt<100)return;lastReadingAt=now;
 const roots=[];
 const add=(model,semantic)=>{if(!model||!model.visible)return;model.userData.reading=semantic;roots.push(model);};
 for(const [id,g] of wildMeshes){const r=resourceRecord(id);add(g,{id:'wild:'+id,key:'tree.'+r.kind,picture:'seed:'+r.kind});}
 for(const [id,g] of plantMeshes){const p=state.plots[id];if(p?.seed)add(g,{id:'plot:'+id,key:'tree.'+p.seed,picture:'seed:'+p.seed});}
 for(const [id,g] of buildMeshes){const b=state.buildings.find(x=>x.id===id);add(g,{id:'build:'+id,key:'piece.'+b.kind,material:b.material,picture:`piece:${b.kind}:${b.material}`});}
 for(const [id,g] of delights.models){const p=state.delights.find(p=>p.id===id);add(g,{id:'prop:'+id,key:'prop.'+p.kind,picture:'prop:'+p.kind});}
 for(const [id,g] of residents.models){const r=state.residents.find(x=>x.id===id);if(r?.x!==null)add(g,{id:'resident:'+id,key:r.habitat==='ocean'?'noun.diver':'noun.resident',picture:`${r.habitat==='ocean'?'diver':'resident'}:${r.variant}:${r.outfit??0}`});}
 for(const a of garden.readingObjects())add(a.model,{id:`animal:${a.kind}:${a.index}`,key:'animal.'+a.kind,picture:'animal:'+a.kind});
 for(const a of outerLife.readingObjects())add(a.model,{id:'outer:'+a.id,key:'animal.'+a.kind,picture:'animal:'+a.kind});
 for(const {actor:a,model} of marine)add(model,{id:'marine:'+a.id,focusKey:'marine:'+a.kind,key:'animal.'+a.kind,picture:'animal:'+a.kind+(a.kind==='fish'?':'+a.variant:'')});
 add(whale.model,{id:'marine:whale',key:'animal.whale',picture:'animal:whale'});
 add(ground,{id:'ground',key:'noun.grass',icon:'grass'});
 readingRay.setFromCamera(center,camera);
 const readingObjects=[...roots,...worldRuntime.roots(),world.group,ocean,...garden.discoveries.values(),plotsGroup];
 const describeHits=raw=>raw.filter(hit=>{
  for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;if(hit.object.userData.readThrough)return false;return true;
 }).map(hit=>{
  let semantic=null;for(let o=hit.object;o;o=o.parent)if(o.userData.reading){semantic=o.userData.reading;break;}
  if(hit.object.userData.worldGround){const q=sampleWorld(hit.point.x,hit.point.z),sand=q.surface==='sand'||q.surface==='seabed';semantic={id:sand?'sand':'ground',key:sand?'noun.sand':'noun.grass',icon:sand?'fill':'grass'};}
  if(hit.object===ground&&hit.instanceId!==undefined){const c=groundCells[hit.instanceId],p=state.plots[cellKey(c.gx,c.gz)];if(p)semantic={id:'soil:'+cellKey(c.gx,c.gz),key:p.phase==='hole'?'noun.hole':'noun.soil',icon:'fill'};}
  if(hit.object.parent===plotsGroup){const p=state.plots[hit.object.userData.plot];semantic={id:'soil:'+hit.object.userData.plot,key:p?.phase==='hole'?'noun.hole':'noun.soil',icon:'fill'};}
  const material=hit.object.material,opaque=!material?.transparent||material.opacity>.75;
  return {distance:hit.distance,semantic,opaque};
 });
 let direct=nearestReading(describeHits(readingRay.intersectObjects(readingObjects,true)));const candidates=[];
 // The gather envelope already requires a live, reachable mesh visibility witness.
 // Teach the same visible flower rather than the grass between its stems.
 if(tool===4&&target?.wildId&&flowerEnvelopes.has(target.wildId)&&!target.outOfReach&&(!direct||['noun.grass','noun.soil'].includes(direct.key))){
  const r=resourceRecord(target.wildId);direct={id:'wild:'+r.id,key:'tree.'+r.kind,picture:'seed:'+r.kind};
 }
 if(!direct||['noun.grass','noun.sand','noun.soil','noun.hole'].includes(direct.key)){
  const forward=camera.getWorldDirection(new THREE.Vector3()),point=new THREE.Vector3(),direction=new THREE.Vector3();
  for(const {actor:a,model} of marine){
   point.set(a.x,a.y+(a.profile.minY+a.profile.maxY)*.5,a.z);direction.copy(point).sub(camera.position);
   const distance=direction.length(),front=direction.dot(forward);if(front<=0||distance>12+a.profile.radius)continue;
   direction.normalize();const theta=Math.acos(THREE.MathUtils.clamp(direction.dot(forward),-1,1)),radius=Math.atan2(a.profile.radius,distance);
   if(theta>Math.min(Math.PI/30,radius+Math.PI/90))continue;
   readingRay.set(camera.position,direction);
   const hit=nearestReading(describeHits(readingRay.intersectObjects(readingObjects,true)));
   // An actual mesh must be first, not just a generous angular/bounds proxy.
   if(hit?.id!==model.userData.reading.id)continue;
   candidates.push({semantic:hit,distance,forward:front,angle:theta,angularRadius:radius,visible:true});
  }
 }
 currentReading=readingFocus.update(assistedReading(direct,candidates),now);renderReading();
}
function setupLocaleUI(){
 for(const select of document.querySelectorAll('.languageSelect')){
  select.innerHTML=Object.entries(LANGUAGES).map(([value,name])=>`<option value="${value}" lang="${value}">${name}</option>`).join('');
  select.onchange=()=>{const stored=i18n.set(select.value);localizeUI();document.querySelectorAll('.languageStatus').forEach(el=>el.textContent=stored?'':t('ui.languageUnavailable'));};
 }
 new ResizeObserver(()=>document.documentElement.style.setProperty('--selection-height',$('selection').offsetHeight+'px')).observe($('selection'));
 setupReadingEvents();localizeUI(false);
}
function localizeUI(refresh=true){
 const active=document.activeElement,focusId=active?.id,focusData=['seed','piece','material','outfit','toy'].find(k=>active?.dataset[k]!==undefined),focusValue=focusData&&active.dataset[focusData];
 const scroll=$('catalogBody').scrollTop,wardrobeScroll=$('wardrobe').scrollTop;
 document.documentElement.lang=i18n.language;document.title=t('ui.title');
 document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
 document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
 document.querySelectorAll('.languageSelect').forEach(el=>{el.value=i18n.language;el.setAttribute('aria-label',t('language.label'));});
 $('welcomeControls').textContent=['walk','look','jump','choose','hold','build','book'].map(k=>t('control.'+k)).join(' · ');
 $('controlFooter').textContent=['walk','look','jump','run','choose','build','book','pause'].map(k=>t('control.'+k)).join(' · ');
 if(loadWarning)$('welcomeSave').textContent=t(loadWarning);
 saveStatus(saveStatusKey);renderReward();if(lastToast)$('toast').textContent=i18n.message(lastToast);
 if(refresh){setupPictures();setupLivingUI();updateHUD();if(!$('catalog').hidden)renderCatalog();if(outfitResident!==null)openWardrobe(outfitResident);swimHudMode=null;pick();}
 const focus=focusId?$(focusId):focusData?document.querySelector(`[data-${focusData}="${focusValue}"]`):null;focus?.focus({preventScroll:true});
 $('catalogBody').scrollTop=scroll;$('wardrobe').scrollTop=wardrobeScroll;
 renderReading();
}

setupLocaleUI();setupPictures();setupLivingUI();sync();chooseTool(0);if(loadWarning){$('welcomeSave').textContent=t(loadWarning);saveStatus('ui.loadFailed');}
// Fill the initial fog horizon before the first Play frame; no hidden-world rendering.
worldRuntime.update(pos.x,pos.z);for(let i=0;i<100&&worldRuntime.snapshot().queued;i++)worldRuntime.update(pos.x,pos.z);refreshInteractive();
const timing=[],worldTiming=[];let previous=performance.now(),frames=0,livingTime=0,stepDistance=0;
function frame(now){
 requestAnimationFrame(frame);const realDt=(now-previous)/1000,dt=Math.min(realDt,.1);previous=now;
 // The opaque first-visit landing has its own static picture. Keep the clock current
 // without rendering or posing the hidden world; the first explicit Play resumes it.
 if(!started&&!$('overlay').hidden&&$('overlay').dataset.mode==='landing')return;
 const worldStart=performance.now();worldRuntime.update(pos.x,pos.z);const nearbyKey=`${Math.floor(pos.x/8)},${Math.floor(pos.z/8)}`;if(nearbyKey!==wildCell){wildCell=nearbyKey;syncWild();}if(worldVersion!==worldRuntime.version){worldVersion=worldRuntime.version;refreshInteractive();}worldTiming.push(performance.now()-worldStart);if(worldTiming.length>180)worldTiming.shift();
 if(cover)for(const mesh of cover.children){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();mesh.visible=nearCoverBounds(mesh.geometry.boundingBox,pos.x,pos.z);}
 elapsed+=dt;if(realDt<1){timing.push(realDt*1000);if(timing.length>180)timing.shift();}
 if(locked){
  if(fallbackLook){if(keys.has('ArrowLeft'))yaw+=dt*1.4;if(keys.has('ArrowRight'))yaw-=dt*1.4;if(keys.has('ArrowUp'))pitch+=dt*1.1;if(keys.has('ArrowDown'))pitch-=dt*1.1;pitch=Math.max(-1.45,Math.min(1.45,pitch));}
  livingTime+=dt;if(livingTime>=nextBirdCall){nextBirdCall=livingTime+15;const bird=garden?.readingObjects().find(a=>a.kind==='bird'&&Math.hypot(a.model.position.x-pos.x,a.model.position.z-pos.z)<24&&garden.snapshot().some(b=>b.kind==='bird'&&b.perch>.9&&Math.hypot(b.x-a.model.position.x,b.z-a.model.position.z)<.05));if(bird)audio.play('bird',{sourceId:'bird:'+bird.index,x:bird.model.position.x,y:bird.model.position.y,z:bird.model.position.z});}tick(state,dt);residents.update(dt,livingTime);delights.update(dt,livingTime);garden.update(dt,livingTime);for(const g of buildMeshes.values())animateCraftPiece(g,{time:livingTime,wind:.6});const speed=keys.has('ShiftLeft')?7:4.2;let dx=0,dz=0;
  if(keys.has('KeyW'))dz-=1;if(keys.has('KeyS'))dz+=1;if(keys.has('KeyA'))dx-=1;if(keys.has('KeyD'))dx+=1;
  const length=Math.hypot(dx,dz)||1;dx=dx/length*speed*dt;dz=dz/length*speed*dt;
  const wx=dx*Math.cos(yaw)+dz*Math.sin(yaw),wz=dz*Math.cos(yaw)-dx*Math.sin(yaw);
  const oldX=pos.x,oldZ=pos.z,segments=Math.max(1,Math.ceil(Math.hypot(wx,wz)/.15));for(let part=0;part<segments;part++){const supported=Math.abs(feet-floorAt(pos.x,pos.z))<.08;if(canWalk(pos.x+wx/segments,pos.z))pos.x+=wx/segments;if(canWalk(pos.x,pos.z+wz/segments))pos.z+=wz/segments;if(supported){const nextFloor=floorAt(pos.x,pos.z);if(nextFloor>feet&&nextFloor<=feet+.31)feet=nextFloor;}}stepDistance+=Math.hypot(pos.x-oldX,pos.z-oldZ);if(stepDistance>.95&&!swimmingAt(pos.x,pos.z,feet)&&Math.abs(feet-floorAt(pos.x,pos.z))<.1){stepDistance=0;const floor=state.buildings.find(b=>b.kind==='floor'&&Math.abs(b.gx*2-pos.x)<1&&Math.abs(b.gz*2-pos.z)<1);audio.play('step',{material:floor?.material,surface:floor?'wood':sampleWorld(pos.x,pos.z).surface,sourceId:'player:step',x:pos.x,y:feet,z:pos.z});}
  const beforeFeet=feet;
  const floor=floorAt(pos.x,pos.z),ceil=reefCeiling(physicalSolids(pos.x,pos.z),pos.x,pos.z,feet,Math.min(Infinity,...[...state.buildings.flatMap(boxes),...state.delights.flatMap(p=>propBoxes(p))].filter(a=>touches(a,pos.x,pos.z)&&a.minY>=feet+1.6).map(a=>a.minY)));
  const vertical=verticalStep({x:pos.x,z:pos.z,feet,vy,dt,forward:(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),pitch,rise:keys.has('Space'),dive:keys.has('KeyC')||keys.has('ControlLeft')||keys.has('ControlRight'),floor,ceil});feet=vertical.feet;vy=vertical.vy;
  if(dx||dz||feet!==beforeFeet||Object.values(state.plots).some(p=>p.growth<1&&p.water>0))dirty=true;
  outerLife.update(dt,pos);marineLife.update(dt,{x:pos.x,y:feet+1.65,z:pos.z});poseMarine(dt);whale.update(dt,pos);
  if(cover)animateMeadowCover(cover,{time:livingTime});

 }
 // Keep remote bugs/rigs out of draw and shadow passes without resetting visits,
 // poses or paid records. Large whales and houses retain their own presentation.
 for(const g of plantMeshes.values())showPresentation(g,nearPresentation(g,resourceView.x,resourceView.z,48));
 for(const a of garden.readingObjects())showPresentation(a.model,nearPresentation(a.model,pos.x,pos.z,actorViewDistance(a.kind)));
 for(const {actor,model} of marine)showPresentation(model,nearPresentation(model,pos.x,pos.z,actorViewDistance(actor.kind)));
 for(const a of outerLife.readingObjects())showPresentation(a.model,nearPresentation(a.model,pos.x,pos.z,actorViewDistance(a.kind)));
 for(const g of garden.discoveries.values())showPresentation(g,nearPresentation(g,pos.x,pos.z,64));
 for(const g of residents.models.values())showPresentation(g,nearPresentation(g,pos.x,pos.z,48));
 ocean.visible=nearCoverBounds(oceanBounds,pos.x,pos.z,48);if(reefCover)reefCover.visible=nearCoverBounds(reefCover.userData.viewBounds,pos.x,pos.z,48);
 // Spend the shadow map on the nearby world, including ocean houses, not the whole distant orchard.
 const shadowX=Math.round(pos.x/2)*2,shadowZ=Math.round(pos.z/2)*2,shadowY=terrainHeight(pos.x,pos.z);sun.target.position.set(shadowX,shadowY,shadowZ);sun.position.set(shadowX-24,shadowY+38,shadowZ+16);
 camera.position.set(pos.x,feet+1.7,pos.z);camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld();pick();updateReading(now);updateToyButton();
 // Watching a resident or paid home must not suggest cultivating its occupied floor.
 // This is presentation only: building/removal feedback and the action ray stay intact.
 const watchingMarine=locked&&!menuReading&&tool<5&&!target?.propId&&!target?.wildId&&!target?.plot&&(currentReading?.id?.startsWith('marine:')||currentReading?.id?.startsWith('resident:')||target?.buildId);
 $('hud').classList.toggle('watchingMarine',!!watchingMarine);if(watchingMarine)tileOutline.visible=false;
 const regionSample=sampleWorld(pos.x,pos.z),underwater=camera.position.y<TERRAIN.waterY;waterSurface.position.x=pos.x;waterSurface.position.z=pos.z;if(locked)audio.environment({x:pos.x,y:camera.position.y,z:pos.z,yaw,underwater,region:regionSample.region,surface:regionSample.surface==='rock'?'stone':regionSample.surface,shoreDistance:Math.abs(regionSample.shoreDistance)});$('hud').classList.toggle('inOcean',regionSample.height<TERRAIN.waterY);scene.background=underwater?seaBackground:dayBackground;scene.fog.color.set(underwater?'#5c9fa7':'#b7d7d7');scene.fog.near=underwater?8:38;scene.fog.far=underwater?48:118;waterSurface.material.opacity=underwater?.18:.48;
 const swimMode=!locked||regionSample.shoreDistance>8?'hidden':swimmingAt(pos.x,pos.z,feet)?'swim':'shore';if(swimMode!==swimHudMode){swimHudMode=swimMode;$('swimCue').hidden=swimMode==='hidden';$('swimCue').innerHTML=icon('swim')+(swimMode==='swim'?`<span>↑ <kbd>${t('control.space')}</kbd> &nbsp; ↓ <kbd>C</kbd></span>`:`<span>${icon('reef')} ↓</span>`);}
 stream.visible=false;
 if(locked&&held&&tool===3&&target&&!target.outOfReach&&!target.wildId){const pouring=target.propId&&delights.pour(target.propId,dt),result=pouring?{ok:true}:target.propId?{ok:false,code:'ui.toyReady'}:water(state,target.gx,target.gz,dt);if(result.ok){dirty=true;stream.visible=true;if(!pouring&&frames%6===0)splash(target.gx*2,target.gz*2);const origin=new THREE.Vector3(...(toolMesh.userData.spout??[0,.2,-.2])).applyMatrix4(toolMesh.matrixWorld),a=pouring?delights.anchor(target.propId,'pour'):null,end=a?new THREE.Vector3(a.x,a.y,a.z):new THREE.Vector3(target.gx*2,.12,target.gz*2);for(let i=0;i<28;i++){const t=((i/28)+elapsed*1.8)%1;const p=origin.clone().lerp(end,t);p.y+=Math.sin(t*Math.PI)*.35;waterPositions[i*3]=p.x;waterPositions[i*3+1]=p.y;waterPositions[i*3+2]=p.z;}waterGeometry.attributes.position.needsUpdate=true;}else if(frames%45===0)toast(result);}
 audio.setContinuous('player:water','water',{active:stream.visible,x:pos.x,y:feet+1,z:pos.z});
 const plant=target&&state.plots[cellKey(target.gx,target.gz)],wild=target?.wildId&&resourceRecord(target.wildId);
 const harvestable=wild||plant?.seed&&plant.growth>=1;
 const chopKey=locked&&held&&tool===4&&target&&!target.outOfReach&&harvestable?(wild?'wild:'+wild.id:'plot:'+cellKey(target.gx,target.gz)):null;
 const chopping=advanceChop(chop,chopKey,dt,isFlower(wild?.kind??plant?.seed)?.45:1.8);chopProgress=chopping.progress;
 if(chopping.impact){totalImpacts++;swing=.25;audio.play(isFlower(wild?.kind??plant?.seed)?'plant':'chop',{sourceId:chopKey,material:SEEDS[wild?.kind??plant?.seed]?.resource,x:target.gx*2,y:target.baseY??0,z:target.gz*2});burst(target.gx,target.gz,'#cdaa74',target.baseY??0);}
 if(locked&&held&&tool===4&&!chopKey)failure({code:!target?'target.aim':target.outOfReach?'target.closer':plant?.seed?'message.letGrow':'message.maturePlant'});
 if(locked&&held&&tool===3&&(!target||target.outOfReach||target.wildId))failure({code:!target?'target.aim':target.outOfReach?'target.closer':'message.plantFillFirst'});
 if(chopping.complete)finishHarvest();
 renderActionEcho(stream.visible?'water':'chop',stream.visible?(plant?.water??1):chopping.progress,stream.visible||!!chopKey,chopping.complete);renderSelectionDetail();
 for(const [id,g] of wildMeshes){g.rotation.z=chopKey==='wild:'+id?Math.sin(chop.elapsed*28)*.025:0;animateTree(g,{growth:1,time:elapsed});}
 for(const [k,g] of plantMeshes)g.rotation.z=chopKey==='plot:'+k?Math.sin(chop.elapsed*28)*.025:0;
 for(let i=falling.length-1;i>=0;i--){const f=falling[i];f.life-=dt;f.g.rotation.z+=dt*1.7;f.g.scale.multiplyScalar(Math.max(0,1-dt*1.6));f.g.position.y-=dt*.3;if(f.life<=0){scene.remove(f.g);falling.splice(i,1);}}
 for(const [k,g] of plantMeshes){const p=state.plots[k];g.scale.setScalar(p.phase==='hole'?.28:1);animateTree(g,{growth:p.growth,time:elapsed,variation:p.variation??0});const stage=p.growth>=1?3:p.growth>=.65?2:p.growth>=.25?1:0;if(g.userData.lastStage!==undefined&&stage>g.userData.lastStage&&locked){burst(p.gx,p.gz,SEEDS[p.seed].color);}g.userData.lastStage=stage;}
 if(toolMesh){pourWeight+=((stream.visible?1:0)-pourWeight)*(1-Math.exp(-dt*10));swing=Math.max(0,swing-dt);toolMesh.rotation.x=-.12-Math.sin(swing/.25*Math.PI)*(tool===4?1.2:.6);if(tool===3)toolMesh.rotation.x-=pourWeight*.46;toolMesh.rotation.z=tool===4?-Math.sin(swing/.25*Math.PI)*.65:0;placeTool();toolMesh.position.y+=(locked&&(keys.has('KeyW')||keys.has('KeyS'))?Math.sin(elapsed*9)*.018:0);toolMesh.visible=locked;}
 for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.life-=dt;if(s.ring){s.m.scale.addScalar(dt*1.5);s.m.material.opacity=Math.max(0,s.life);}else{s.v.y-=5*dt;s.m.position.addScaledVector(s.v,dt);s.m.rotation.x+=dt*3;if(s.bounce&&s.m.position.y<terrainHeight(s.m.position.x,s.m.position.z)+.16){s.m.position.y=terrainHeight(s.m.position.x,s.m.position.z)+.16;s.v.y=Math.abs(s.v.y)*.5;s.v.x*=.65;s.v.z*=.65;}if(s.bounce&&s.life<.3)s.m.scale.setScalar(Math.max(.01,s.life/.3));}if(s.life<=0){scene.remove(s.m);s.m.geometry.dispose();s.m.material.dispose();sparks.splice(i,1);}}
 if(frames%5===0){updateJournal();$('places').innerHTML=[...PLACES,...REGIONS.filter(r=>r.id!=='orchard').map(r=>({...r,icon:r.kind==='reef'||r.kind==='sound'||r.kind==='cove'?'reef':'wood'}))].sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z)).slice(0,4).map(p=>{const distance=Math.hypot(pos.x-p.x,pos.z-p.z),angle=Math.atan2(-(p.x-pos.x),-(p.z-pos.z))-yaw;return `<div class="place ${distance<5?'near':''}" title="${t(p.nameKey??'place.'+p.id)}" aria-label="${t('ui.distance',{place:t(p.nameKey??'place.'+p.id),count:Math.round(distance)})}">${icon(p.icon)}<span class="bearing" style="transform:rotate(${-angle}rad)">↑</span><b>${distance<5?'✓':Math.round(distance)+'m'}</b></div>`;}).join('');}
 if(frames%5===0){
  const h=target&&houseReadiness(state.buildings,target.gx,target.gz,target.baseY??0);$('houseCue').hidden=!h||tool!==5&&tool!==6;
  if(h){$('houseCue').innerHTML=h.complete?`${icon('build')}${icon('check')}`:`<span class="${h.doors.length?'ready':''}">${picture('piece:door:wood',t('piece.door'))}${h.doors.length?icon('check'):icon('lock')}</span><span class="${h.covered===h.total?'ready':''}">${picture('piece:wall:wood',t('aria.enclosedWalls'))}<b>${h.covered}/${h.total}</b></span><span class="${h.roofCount===h.cells.length?'ready':''}">${picture('piece:roof:wood',t('piece.roof'))}<b>${h.roofCount}/${h.cells.length}</b></span>${h.complete?icon('resident'):''}`;}
  $('residentCues').innerHTML=(state.residents??[]).map(r=>{if(r.x===null||r.status==='home'||Math.hypot(r.x-pos.x,residentFloor(r.x,r.z,r.baseY??0)-feet,r.z-pos.z)>9)return '';const worldPoint=new THREE.Vector3(r.x,residentFloor(r.x,r.z,r.baseY??0)+1.8,r.z),direction=worldPoint.clone().sub(camera.position);if(new THREE.Raycaster(camera.position,direction.clone().normalize(),0,direction.length()-.2).intersectObjects([...buildMeshes.values()],true).length)return '';const p=worldPoint.project(camera);if(p.z<-1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1)return '';return `<div class="residentCue ${r.status}" style="left:${(p.x*.5+.5)*100}%;top:${(-p.y*.5+.5)*100}%" aria-label="${t('status.'+(r.habitat==='ocean'?'diver':'resident')+'.'+r.status)}">${icon(r.status==='waiting'?'build':'footsteps')}</div>`;}).join('');
 }
 if(frames%5===0)updateFriendButton();
 if(elapsed>rewardUntil)$('reward').classList.remove('show');
 if(elapsed>toastUntil)$('toast').classList.remove('show');if(elapsed-lastSave>3){save();lastSave=elapsed;}
 renderer.render(scene,camera);frames++;
}
requestAnimationFrame(frame);
// Read-only observation surface for browser verification and independent criticism.
Object.defineProperty(window,'kauris',{value:Object.freeze({snapshot:()=>JSON.parse(JSON.stringify({state,player:{x:pos.x,z:pos.z,feet,yaw,pitch,supportId:state.delights.find(p=>p.kind==='lift'&&liftRiders(p,[{id:'player',x:pos.x,z:pos.z,feet}]).length)?.id??null,supportTop:floorAt(pos.x,pos.z)},swimming:swimmingAt(pos.x,pos.z,feet),locked,fallbackLook,tool:tools[tool].key,seed:seedKeys[seedIndex],piece:pieceKeys[pieceIndex],material:MATERIALS[materialIndex],level,rotation,target:target?{gx:target.gx,gz:target.gz,baseY:target.baseY,point:target.point,placement:tool===5?selectedBuild():null,validation:tool===5?placementResult(selectedBuild()).code:null,propId:target.propId,primaryAction:target.propId&&tool<5?state.delights.find(p=>p.id===target.propId)?.kind==='gutter'?'pour':'use':null,buildId:target.buildId,wildId:target.wildId,plot:target.plot,ground:target.ground,outOfReach:target.outOfReach}:null,chop:{key:chop.key,progress:chopProgress,impacts:totalImpacts},wild:visibleWild,world:{...worldRuntime.snapshot(),proxies:resourceHorizon.snapshot(),resourceGeometryBytes:[...outerGeometry].reduce((n,g)=>n+Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,0)+Object.values(g.morphAttributes).flat().reduce((sum,a)=>sum+a.array.byteLength,0)+(g.index?.array.byteLength??0),0),fauna:outerLife.snapshot(),sample:sampleWorld(pos.x,pos.z),resourceModels:visibleWild.filter(r=>r.id.startsWith('w1:')).length,bookkeepingMs:worldTiming.slice()},places:PLACES,homes:findHomes(state.buildings),residents:(state.residents??[]).map(r=>({...r,walking:residents.motion.get(r.id)?.walking??0,feet:residents.models.get(r.id)?.position.y,encounter:residents.motion.get(r.id)?.trip?.propId??null,sitting:residents.motion.get(r.id)?.sit??0,bundleVisible:residents.motion.get(r.id)?.bundle.visible??false})),garden:{animals:garden.snapshot(),discoveries:activeDiscoveries(state),audio:audio.snapshot()},language:i18n.language,reading:currentReading,marine:marineLife.snapshot(),marineTime:marineLife.time,activeTime:livingTime,whale:whale.snapshot(),delights:delights.snapshot(),performance:{renderedFrames:frames,averageFrameMs:timing.reduce((a,b)=>a+b,0)/Math.max(1,timing.length),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}}))}),writable:false});
