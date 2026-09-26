import {activeDiscoveries,seedUnlocked,plantVariation,readGarden} from './garden.js';
import {reconcileResidents,readResidents} from './residents.js';
import {edgeKey,wallLike,baseOf,canonicalPiece,adjacentCells} from './building.js';
import {buildBase,inWorld,terrainHeight} from './terrain.js';
export {edgeKey} from './building.js';
import {WILD_RESOURCES,WORLD_OBSTACLES,wildFootprint,cellFootprint,overlaps} from './world-data.js';
export const SAVE_KEY = 'kauris-meadow-v1';
export const SEEDS = {
  oak: {name:'Oak', resource:'wood', yield:18, seconds:20, color:'#b6ce72'},
  birch: {name:'Birch', resource:'wood', yield:16, seconds:18, color:'#e6e9bf'},
  pine: {name:'Pine', resource:'wood', yield:20, seconds:24, color:'#55998a'},
  willow: {name:'Willow', resource:'wood', yield:22, seconds:26, color:'#91be70'},
  copper: {name:'Copper', resource:'copper', yield:14, seconds:22, color:'#e89961'},
  iron: {name:'Iron', resource:'iron', yield:12, seconds:24, color:'#b6cad4'},
  diamond: {name:'Diamond', resource:'diamond', yield:10, seconds:28, color:'#8fe5ec'},
  golden: {name:'Golden tree', resource:'wood', yield:24, seconds:24, color:'#e5c85d'},
  starflower: {name:'Star flowers', resource:'fiber', yield:12, seconds:18, color:'#c2b8ec'},
  flowers: {name:'Wildflowers', resource:'fiber', yield:8, seconds:15, color:'#e9a3c1'},
};
export const PIECES = {floor:{name:'Floor',cost:2},wall:{name:'Wall',cost:3},window:{name:'Window',cost:3},door:{name:'Doorway',cost:4},roof:{name:'Roof',cost:3}};
export const MATERIALS = ['wood','copper','iron','diamond'];
export const cellKey=(gx,gz)=>`${gx},${gz}`;
export const validCell=(gx,gz)=>Number.isInteger(gx)&&Number.isInteger(gz)&&Math.abs(gx)<=13&&Math.abs(gz)<=13;
const ok=(code,params={},extra={})=>({ok:true,code,params,...extra});
const no=(code,params={})=>({ok:false,code,params});
export function freshState(){
  const s={version:1,wildRemoved:[],worldHidden:[],residents:[],plots:{},buildings:[],inventory:{wood:36,copper:0,iron:0,diamond:0,fiber:0},nextId:1,player:{x:0,y:0,z:9,yaw:0,pitch:-0.18},stats:{planted:0,harvested:0,built:0}};
  // Harvestable starter orchard; the clearing remains open for the player's creation.
  const orchard=[[-7,-6],[-9,-8],[-5,-10],[-10,-3],[6,-8],[8,-5],[3,-11],[5,-3]];
  ['oak','birch','pine','willow','copper','iron','diamond','flowers'].forEach((seed,i)=>{const [gx,gz]=orchard[i];s.plots[cellKey(gx,gz)]={gx,gz,phase:'filled',seed,growth:1,water:1,variation:plantVariation(gx,gz,seed)};});
  return readGarden({},mergeWorld(s));
}
export const liveWild=s=>WILD_RESOURCES.filter(r=>!s.wildRemoved?.includes(r.id));
export const activeObstacles=s=>WORLD_OBSTACLES.filter(o=>!s.worldHidden?.includes(o.id));
export function worldBlocked(s,gx,gz){
 const cell=cellFootprint(gx,gz);
 return activeDiscoveries(s).some(d=>overlaps(cell,d.bounds))||liveWild(s).some(r=>overlaps(cell,wildFootprint(r)))||activeObstacles(s).some(o=>overlaps(cell,o));
}
export function mergeWorld(s){
 const occupied=[...Object.values(s.plots),...s.buildings.flatMap(b=>adjacentCells(b))].map(p=>cellFootprint(p.gx,p.gz,.35));
 const p=s.player;occupied.push({minX:p.x-1,maxX:p.x+1,minZ:p.z-1,maxZ:p.z+1});
 for(const r of WILD_RESOURCES)if(occupied.some(c=>overlaps(c,wildFootprint(r)))&&!s.wildRemoved.includes(r.id))s.wildRemoved.push(r.id);
 for(const o of WORLD_OBSTACLES)if(occupied.some(c=>overlaps(c,o))&&!s.worldHidden.includes(o.id))s.worldHidden.push(o.id);
 return s;
}
export function harvestWild(s,id){
 const r=liveWild(s).find(r=>r.id===id);if(!r)return no('message.alreadyGathered');
 const spec=SEEDS[r.kind];s.wildRemoved.push(id);s.inventory[spec.resource]+=spec.yield;s.stats.harvested++;
 return ok('message.yield',{count:spec.yield,material:spec.resource},{resource:spec.resource,amount:spec.yield});
}
export function dig(s,gx,gz){
 if(!validCell(gx,gz))return no('message.insideMeadow');
 if(worldBlocked(s,gx,gz))return no('message.clearWild');
 if(s.buildings.some(b=>!wallLike(b)&&b.gx===gx&&b.gz===gz&&baseOf(b)===0))return no('message.removeBuilding');
 const k=cellKey(gx,gz),p=s.plots[k];
 if(p?.growth>0)return no('message.matureAxe');
 if(p?.phase==='hole'&&!p.seed)return no('message.holeReady');
 s.plots[k]={gx,gz,phase:'hole',seed:null,growth:0,water:0};return ok('message.dug');
}
export function plant(s,gx,gz,seed){
 const p=s.plots[cellKey(gx,gz)];
 if(!Object.hasOwn(SEEDS,seed))return no('message.chooseSeed');
 if(!seedUnlocked(s,seed))return no('message.discoverSeed');
 if(!p||p.phase!=='hole')return no('message.shovelFirst');
 if(p.seed)return no('message.seedAlready');
 p.seed=seed;p.variation=plantVariation(gx,gz,seed,s.stats.planted);s.stats.planted++;return ok('message.sown');
}
export function fill(s,gx,gz){
 const k=cellKey(gx,gz),p=s.plots[k];
 if(!p||p.phase!=='hole')return no('message.openHole');
 if(!p.seed){delete s.plots[k];return ok('message.holeFilled');}
 p.phase='filled';return ok('message.covered');
}
export function water(s,gx,gz,dt){
 const p=s.plots[cellKey(gx,gz)];
 if(!p?.seed||p.phase!=='filled')return no('message.plantFillFirst');
 p.water=Math.min(1,p.water+Math.max(0,Math.min(dt,0.1))*.7);return ok('message.watering');
}
export function tick(s,dt){
 dt=Math.max(0,Math.min(dt,.1));
 for(const p of Object.values(s.plots))if(p.phase==='filled'&&p.seed&&p.growth<1&&p.water>0){
  p.growth=Math.min(1,p.growth+dt/SEEDS[p.seed].seconds);p.water=Math.max(0,p.water-dt*.025);
 }
}
export function harvest(s,gx,gz){
 const k=cellKey(gx,gz),p=s.plots[k];
 if(!p?.seed)return no('message.maturePlant');
 if(p.growth<1)return no('message.letGrow');
 const spec=SEEDS[p.seed];s.inventory[spec.resource]+=spec.yield;delete s.plots[k];s.stats.harvested++;
 return ok('message.harvested',{count:spec.yield,material:spec.resource},{resource:spec.resource,amount:spec.yield});
}
function supported(s,b){
 const same=s.buildings.filter(x=>baseOf(x)===baseOf(b));
 const boundary=x=>wallLike(x)&&adjacentCells(x).some(c=>c.gx===b.gx&&c.gz===b.gz);
 if(b.kind==='floor')return b.level===0||same.some(x=>boundary(x)&&x.level===b.level-1);
 if(wallLike(b))return same.some(x=>x.kind==='floor'&&x.level===b.level&&adjacentCells(b).some(c=>x.gx===c.gx&&x.gz===c.gz));
 return b.level>=1&&same.some(x=>boundary(x)&&x.level===b.level-1);
}
export function validateBuild(s,b,{legacy=false}={}){
 if(!Number.isFinite(baseOf(b))||!adjacentCells(b).some(c=>buildBase(c.gx,c.gz)===baseOf(b))||!Object.hasOwn(PIECES,b.kind)||!MATERIALS.includes(b.material)||!Number.isInteger(b.level)||b.level<0||b.level>3||!Number.isInteger(b.rotation)||b.rotation<0||b.rotation>3)return no('message.invalidPiece');
 if(!legacy&&baseOf(b)===0&&!adjacentCells(b).some(c=>validCell(c.gx,c.gz)&&!worldBlocked(s,c.gx,c.gz)))return no('message.clearWild');
 if(s.buildings.length>=400)return no('message.pieceLimit');
 if(!wallLike(b)&&s.plots[cellKey(b.gx,b.gz)])return no('message.clearGround');
 if(s.buildings.some(x=>wallLike(x)&&wallLike(b)?edgeKey(x)===edgeKey(b):x.gx===b.gx&&x.gz===b.gz&&baseOf(x)===baseOf(b)&&x.level===b.level&&(x.kind===b.kind||(['floor','roof'].includes(x.kind)&&['floor','roof'].includes(b.kind)))))return no('message.occupied');
 if(!supported(s,b))return no(b.kind==='roof'?'message.roofSupport':b.kind==='floor'?'message.floorSupport':'message.floorFirst');
 if(s.inventory[b.material]<PIECES[b.kind].cost)return no('message.needMaterial',{count:PIECES[b.kind].cost,material:b.material});
 return ok('message.place');
}
export function build(s,b){
 b=canonicalPiece(b);
 const result=validateBuild(s,b);if(!result.ok)return result;
 const cost=PIECES[b.kind].cost;s.inventory[b.material]-=cost;
 const piece={id:s.nextId++,gx:b.gx,gz:b.gz,kind:b.kind,material:b.material,level:b.level,rotation:b.rotation,baseY:baseOf(b),cost};s.buildings.push(piece);s.stats.built++;reconcileResidents(s);return ok('message.placed',{piece:b.kind,count:cost,material:b.material},{piece});
}
export function remove(s,id){
 const b=s.buildings.find(x=>x.id===id);if(!b)return no('message.aimPiece');
 const rest={...s,buildings:s.buildings.filter(x=>x.id!==id)};
 if(rest.buildings.some(x=>!supported(rest,x)))return no('message.removeAbove');
 s.buildings=rest.buildings;s.inventory[b.material]+=b.cost;reconcileResidents(s);return ok('message.refunded',{count:b.cost,material:b.material});
}
export function serialize(s){return JSON.stringify(s);}
export function deserialize(raw){
 const d=JSON.parse(raw);
 if(d?.version!==1||!d.plots||Array.isArray(d.plots)||!Array.isArray(d.buildings)||d.buildings.length>400)throw Error('Unsupported save');
 const s=freshState();s.plots={};s.buildings=[];
 for(const r of ['wood','copper','iron','diamond','fiber']){
  if(!Number.isSafeInteger(d.inventory?.[r])||d.inventory[r]<0||d.inventory[r]>1000000)throw Error('Invalid inventory');s.inventory[r]=d.inventory[r];
 }
 const plots=Object.entries(d.plots);if(plots.length>729)throw Error('Too many plots');
 for(const [key,p] of plots){
  if(!p||!validCell(p.gx,p.gz)||key!==cellKey(p.gx,p.gz)||!['hole','filled'].includes(p.phase)||!(p.seed===null||Object.hasOwn(SEEDS,p.seed))||!Number.isFinite(p.growth)||p.growth<0||p.growth>1||!Number.isFinite(p.water)||p.water<0||p.water>1||(p.phase==='hole'&&(p.growth!==0||p.water!==0))||(p.phase==='filled'&&!p.seed))throw Error('Invalid plot');
  if(p.variation!==undefined&&(!Number.isInteger(p.variation)||p.variation<0||p.variation>9))throw Error('Invalid plant variation');
  s.plots[key]={gx:p.gx,gz:p.gz,phase:p.phase,seed:p.seed,growth:p.growth,water:p.water};if(p.seed)s.plots[key].variation=p.variation??plantVariation(p.gx,p.gz,p.seed);
 }
 const ids=new Set();
 for(const rawPiece of [...d.buildings].sort((a,b)=>a.level-b.level||(a.kind==='floor'?-1:b.kind==='floor'?1:0))){
  const b=canonicalPiece(rawPiece);
  if(!Number.isSafeInteger(b.id)||b.id<1||ids.has(b.id)||b.cost!==PIECES[b.kind]?.cost)throw Error('Invalid building accounting');
  const funded={...s,inventory:Object.fromEntries(MATERIALS.map(m=>[m,1e6]))};
  if(!validateBuild(funded,b,{legacy:true}).ok)throw Error('Invalid building placement');
  ids.add(b.id);s.buildings.push({id:b.id,gx:b.gx,gz:b.gz,kind:b.kind,material:b.material,level:b.level,rotation:b.rotation,baseY:baseOf(b),cost:b.cost});
 }
 s.nextId=Math.max(0,...ids)+1;
 const p=d.player;
 if(p&&['x','z','yaw','pitch'].every(k=>Number.isFinite(p[k]))&&inWorld(p.x,p.z)){
  if(p.y!==undefined&&(!Number.isFinite(p.y)||p.y< -8||p.y>20))throw Error('Invalid player height');
  s.player={x:p.x,y:Math.max(terrainHeight(p.x,p.z),p.y??0),z:p.z,yaw:p.yaw,pitch:Math.max(-1.45,Math.min(1.45,p.pitch))};
 }
 for(const [field,known] of [['wildRemoved',WILD_RESOURCES],['worldHidden',WORLD_OBSTACLES]]){
  if(d[field]!==undefined&&(!Array.isArray(d[field])||d[field].length>5000||d[field].some(id=>typeof id!=='string')))throw Error('Invalid world record');
  s[field]=[...new Set((d[field]??[]).filter(id=>known.some(x=>x.id===id)))];
 }
 for(const k of Object.keys(s.stats))s.stats[k]=Number.isSafeInteger(d.stats?.[k])&&d.stats[k]>=0?d.stats[k]:0;
 s.residents=readResidents(d.residents);reconcileResidents(s);
 return readGarden(d,d.wildRemoved===undefined||d.worldHidden===undefined?mergeWorld(s):s);
}
