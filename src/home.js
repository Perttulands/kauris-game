import {findHomes} from './residents.js';
import {baseOf,buildingBoxes,touches} from './building.js';
import {propBoxes} from './delights.js';
import {terrainHeight,inWorld,TERRAIN} from './terrain.js';
import {reefBlocked} from './reef-collision.js';
const arrival=(chosen=false)=>({version:1,kind:'arrival',anchor:'0,9',baseY:0,chosen});
const flower=k=>k==='flowers'||k==='starflower';
export function readHome(raw){
 if(raw?.version!==1||raw.baseY!==0)return null;
 if(raw.kind==='arrival')return arrival(raw.chosen===true);
 if(raw.kind!=='house'||typeof raw.anchor!=='string'||!/^(-?\d+),(-?\d+)$/.test(raw.anchor))return null;
 const [x,z]=raw.anchor.split(',').map(Number);return Number.isSafeInteger(x)&&Number.isSafeInteger(z)&&inWorld(x*2,z*2)?{version:1,kind:'house',anchor:`${x},${z}`,baseY:0}:null;
}
export function homeChoice(state,near=null){
 const homes=findHomes(state.buildings).filter(h=>h.baseY===0);
 const rank=h=>Math.min(...state.buildings.filter(b=>baseOf(b)===0&&h.cells.includes(`${b.gx},${b.gz}`)).map(b=>b.id));
 homes.sort((a,b)=>rank(a)-rank(b)||a.anchor.localeCompare(b.anchor,'en',{numeric:true}));
 if(near){const home=homes.filter(h=>h.doors.some(d=>Math.hypot(d.x-near.x,d.z-near.z)<=12)).sort((a,b)=>Math.min(...a.doors.map(d=>Math.hypot(d.x-near.x,d.z-near.z)))-Math.min(...b.doors.map(d=>Math.hypot(d.x-near.x,d.z-near.z))))[0];return home?{record:{version:1,kind:'house',anchor:home.anchor,baseY:0},home}:null;}
 const saved=readHome(state.home);const home=saved?.kind==='house'?homes.find(h=>h.cells.includes(saved.anchor)):saved?.chosen?null:homes[0];
 return {record:home?{version:1,kind:'house',anchor:home.anchor,baseY:0}:saved?.kind==='house'?arrival(true):saved??arrival(),home:home??null};
}
// At most64 positions per centre. No world scan or dependence on rendered chunks.
function offsets(x,z){const out=[{x,z}];for(let ring=1;out.length<64;ring++)for(let i=0;i<ring*8&&out.length<64;i++){const a=i/(ring*8)*Math.PI*2;out.push({x:x+Math.sin(a)*ring*.8,z:z+Math.cos(a)*ring*.8});}return out;}
export function safeHomeDestination(state,{heightAt=terrainHeight,solidsAt=()=>[],obstacles=[],resourcesAt=()=>[],actors=[]}={}){
 const choice=homeChoice(state),home=choice.home,candidates=[];
 if(home)for(const d of home.doors.slice(0,8))for(const distance of [1,1.6,2.2])candidates.push({x:d.x+d.nx*distance,z:d.z+d.nz*distance,yaw:Math.atan2(d.nx,d.nz)});
 const centre=home?.doors[0]??{x:0,z:9};candidates.push(...offsets(centre.x,centre.z),...offsets(0,9));
 const paid=state.buildings.flatMap(buildingBoxes),props=state.delights.flatMap(p=>propBoxes(p,{envelope:true}));
 function stand(x,z){
  if(!inWorld(x,z))return null;const y=heightAt(x,z);if(!Number.isFinite(y)||y<TERRAIN.waterY+.35)return null;
  const samples=[[0,0],[-.24,-.24],[-.24,.24],[.24,-.24],[.24,.24]];
  if(samples.some(([dx,dz])=>Math.abs(heightAt(x+dx,z+dz)-y)>.12||state.plots[`${Math.round((x+dx)/2)},${Math.round((z+dz)/2)}`]?.phase==='hole'))return null;
  let feet=y;for(const b of state.buildings)if(b.kind==='floor'&&b.level===0&&Math.abs(b.gx*2-x)<.76&&Math.abs(b.gz*2-z)<.76&&Math.abs(baseOf(b)-y)<.12)feet=Math.max(feet,baseOf(b)+.15);
  const hit=a=>touches(a,x,z,.24)&&a.maxY>feet+.02&&a.minY<feet+1.7;
  if(paid.some(hit)||props.some(hit)||obstacles.some(a=>hit({...a,minY:a.minY??-100,maxY:a.maxY??a.height??100})))return null;
  if(reefBlocked(solidsAt(x,z),x,z,feet,{radius:.24,height:1.7,step:.02}))return null;
  if(Object.values(state.plots).some(p=>p.growth>.3&&!flower(p.seed)&&Math.hypot(x-p.gx*2,z-p.gz*2)<.24+.2*p.growth))return null;
  if(resourcesAt(x,z).some(r=>!flower(r.kind)&&Math.hypot(x-r.gx*2,z-r.gz*2)<.65))return null;
  if(actors.some(a=>Math.hypot(x-a.x,z-a.z)<.24+(a.radius??.31)&&(a.y??a.feet??0)<feet+1.7&&(a.y??a.feet??0)+(a.height??1.7)>feet))return null;
  return feet;
 }
 for(const c of candidates){const feet=stand(c.x,c.z);if(feet===null)continue;
  for(const [dx,dz] of [[0,1],[1,0],[0,-1],[-1,0]]){let valid=true,previous=feet;for(let n=1;n<=5;n++){const next=stand(c.x+dx*n*.2,c.z+dz*n*.2);if(next===null||Math.abs(next-previous)>.25){valid=false;break;}previous=next;}if(valid)return {ok:true,x:c.x,z:c.z,feet,yaw:c.yaw??Math.atan2(-dx,-dz),home:choice.record};}
 }
 return {ok:false,code:'home.blocked'};
}
