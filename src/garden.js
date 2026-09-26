import {cellFootprint,overlaps} from './world-data.js';
export const SPECIAL_SEEDS=['golden','starflower'];
export const isFlower=kind=>kind==='flowers'||kind==='starflower';
export const DISCOVERIES=[
 {id:'secret-garden',kind:'garden',x:-10,z:19,unlock:'starflower',bounds:{minX:-13,maxX:-7,minZ:16,maxZ:22},solids:[]},
 {id:'old-hollow',kind:'hollow',x:0,z:-18,unlock:'golden',bounds:{minX:-2.4,maxX:2.4,minZ:-20.4,maxZ:-15.6},solids:[{minX:-2.2,maxX:-1.1,minZ:-19.5,maxZ:-16.5,height:3},{minX:1.1,maxX:2.2,minZ:-19.5,maxZ:-16.5,height:3}]},
 {id:'star-grotto',kind:'grotto',x:23,z:0,unlock:'golden',bounds:{minX:19.5,maxX:26.5,minZ:-3.5,maxZ:3.5},solids:[{minX:25.3,maxX:26.3,minZ:-3,maxZ:3,height:3},{minX:20,maxX:26.3,minZ:-3,maxZ:-2,height:3},{minX:20,maxX:26.3,minZ:2,maxZ:3,height:3}]},
];
export const activeDiscoveries=s=>DISCOVERIES.filter(d=>!s.discoveryHidden?.includes(d.id));
export const seedUnlocked=(s,kind)=>!SPECIAL_SEEDS.includes(kind)||s.unlockedSeeds?.includes(kind);
export function plantVariation(gx,gz,kind,serial=0){let h=2166136261;for(const c of `${gx},${gz}:${kind}:${serial}`)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%10;}
export function readGarden(raw,s){
 for(const [field,known] of [['discoveries',DISCOVERIES.map(d=>d.id)],['discoveryHidden',DISCOVERIES.map(d=>d.id)],['unlockedSeeds',SPECIAL_SEEDS]]){
  const value=raw[field]??[];if(!Array.isArray(value)||value.length>100||value.some(x=>typeof x!=='string'))throw Error('Invalid garden record');s[field]=[...new Set(value.filter(x=>known.includes(x)))];
 }
 if(raw.contentRevision!==undefined&&raw.contentRevision!==2)throw Error('Unsupported garden revision');
 s.contentRevision=2;
 if(raw.contentRevision!==2){
  const occupied=[...Object.values(s.plots),...s.buildings].map(p=>cellFootprint(p.gx,p.gz,.35));const p=s.player;occupied.push({minX:p.x-1.5,maxX:p.x+1.5,minZ:p.z-1.5,maxZ:p.z+1.5});
  for(const d of DISCOVERIES)if(occupied.some(b=>overlaps(b,d.bounds))&&!s.discoveryHidden.includes(d.id))s.discoveryHidden.push(d.id);
 }
 // Suppressed content gifts its seed; visiting another location remains meaningful.
 for(const d of DISCOVERIES)if((s.discoveryHidden.includes(d.id)||s.discoveries.includes(d.id))&&!s.unlockedSeeds.includes(d.unlock))s.unlockedSeeds.push(d.unlock);
 // Preserve plants that already exist even if a newer unlock field was absent.
 for(const p of Object.values(s.plots))if(SPECIAL_SEEDS.includes(p.seed)&&!s.unlockedSeeds.includes(p.seed))s.unlockedSeeds.push(p.seed);
 return s;
}
export function discover(s,id){
 const d=activeDiscoveries(s).find(d=>d.id===id);if(!d||s.discoveries.includes(id))return {ok:false};
 s.discoveries.push(id);const newSeed=!s.unlockedSeeds.includes(d.unlock);if(newSeed)s.unlockedSeeds.push(d.unlock);
 return {ok:true,id,seed:d.unlock,newSeed};
}
export function setOutfit(s,id,outfit){
 const r=s.residents.find(r=>r.id===id);if(!r||!Number.isInteger(outfit)||outfit<0||outfit>3)return {ok:false};r.outfit=outfit;return {ok:true};
}
export function gardenAttractors(s){
 const plots=Object.values(s.plots).filter(p=>p.phase==='filled'&&p.seed);
 return {flowers:plots.filter(p=>isFlower(p.seed)&&p.growth>=.55),trees:plots.filter(p=>!isFlower(p.seed)&&p.growth>=.95),leafy:plots.filter(p=>['oak','birch','willow','golden'].includes(p.seed)&&p.growth>=.65)};
}
