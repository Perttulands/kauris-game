// Fixed content, queried locally. No save state, render objects or load-order RNG.
const freeze=Object.freeze;
export const WORLD_CONFIG=freeze({version:1,seed:731947,chunkSize:32,gridSize:2,protectedBounds:freeze({minX:-28,maxX:28,minZ:-28,maxZ:112})});
export const REGIONS=freeze([
 {id:'orchard',nameKey:'region.orchard',x:0,z:0,kind:'meadow',route:[]},
 {id:'reef',nameKey:'region.reef',x:0,z:60,kind:'reef',route:[]},
 {id:'birch-downs',nameKey:'region.birchDowns',x:-8,z:-66,kind:'downs',route:[[-18,-22],[-24,-36],[-21,-51],[-8,-66]]},
 {id:'reed-cove',nameKey:'region.reedCove',x:-69,z:18,kind:'cove',route:[[-24,8],[-40,3],[-53,-5],[-62,-8],[-66,5],[-69,18]]},
 {id:'amber-bay',nameKey:'region.amberBay',x:73,z:-20,kind:'bay',route:[[24,10],[38,8],[49,-3],[64,-22],[79,-8],[90,15]]},
 {id:'seagrass-sound',nameKey:'region.seagrassSound',x:-68,z:77,kind:'sound',route:[[-69,18],[-79,36],[-82,55],[-82,72],[-65,79],[-43,67],[-28,60]]},
].map(r=>freeze({...r,route:freeze(r.route.map(p=>freeze(p)))})));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
function hash(x,z,slot=0,channel=0){let h=WORLD_CONFIG.seed^Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(slot+1,1274126177)^Math.imul(channel+1,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function noise(x,z,scale,channel=0){const xx=x/scale,zz=z/scale,ix=Math.floor(xx),iz=Math.floor(zz),u=smooth(0,1,xx-ix),v=smooth(0,1,zz-iz);return lerp(lerp(hash(ix,iz,0,channel),hash(ix+1,iz,0,channel),u),lerp(hash(ix,iz+1,0,channel),hash(ix+1,iz+1,0,channel),u),v)*2-1;}
const protectedAt=(x,z)=>x>=-28&&x<=28&&z>=-28&&z<=112;
const coreDistance=(x,z)=>Math.hypot(Math.max(0,Math.abs(x)-28),Math.max(0,-28-z,z-112));
function legacyHeight(z){const t=clamp((z-27)/12),d=clamp((z-70)/16);return (t===0?0:-7.2*t*t*(3-2*t))+(-14+7.2)*d*d*(3-2*d);}
const ellipse=(x,z,cx,cz,rx,rz)=>(1-Math.hypot((x-cx)/rx,(z-cz)/rz))*Math.min(rx,rz);
function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
const inlandRoutes=[REGIONS[2].route,REGIONS[3].route.slice(0,4),REGIONS[4].route.slice(0,4),[[-62,-8],[-62,-34],[-48,-54],[-21,-51]],[[-8,-66],[22,-65],[48,-49],[64,-22]]];
function routeDistance(x,z){let distance=Infinity;for(const route of inlandRoutes)for(let i=1;i<route.length;i++)distance=Math.min(distance,segmentDistance(x,z,route[i-1],route[i]));return distance;}
function landField(x,z){
 // Large land masses and carved bays establish a recognizable first circuit.
 let land=Math.max(ellipse(x,z,-12,-65,54,31),ellipse(x,z,-58,-12,37,51),ellipse(x,z,67,-25,43,43),ellipse(x,z,-83,74,21,15),ellipse(x,z,-49,108,14,10),Math.min(28-Math.abs(x),28-Math.abs(z)));
 land=Math.min(land,-ellipse(x,z,-80,29,20,27),-ellipse(x,z,96,25,26,34));
 land=Math.max(land,10-routeDistance(x,z));
 const procedural=noise(x,z,180,3)*59+noise(x,z,72,8)*11+5;
 return lerp(land,procedural,smooth(135,235,Math.hypot(x,z-16)));
}
const authoredSites=freeze([
 {id:'w1:b:birch-downs',x:-8,z:-66},{id:'w1:b:reed-cove',x:-62,z:-8},
 {id:'w1:b:amber-bay',x:64,z:-22},{id:'w1:b:seagrass-sound',x:-82,z:72},
].map(freeze));
const siteCache=new Map();
function macroSite(cx,cz){
 const key=`${cx},${cz}`;if(siteCache.has(key))return siteCache.get(key);
 let site=null;
 for(let i=0;i<5;i++){
  const x=2*Math.round((cx*160+32+hash(cx,cz,i,21)*96)/2),z=2*Math.round((cz*160+32+hash(cx,cz,i,22)*96)/2);
  if(Math.hypot(x,z-16)<190||coreDistance(x,z)<28||landField(x,z)<15)continue;
  site=freeze({id:`w1:b:${cx}:${cz}`,x,z});break;
 }
 if(siteCache.size>=64)siteCache.delete(siteCache.keys().next().value);siteCache.set(key,site);return site;
}
function nearbySites(x,z){
 const list=authoredSites.filter(p=>Math.abs(x-p.x)<19&&Math.abs(z-p.z)<19);
 for(let cx=Math.floor((x-19)/160);cx<=Math.floor((x+19)/160);cx++)for(let cz=Math.floor((z-19)/160);cz<=Math.floor((z+19)/160);cz++){
  const s=macroSite(cx,cz);if(s&&Math.abs(x-s.x)<19&&Math.abs(z-s.z)<19)list.push(s);
 }
 return list;
}
function rawHeight(x,z){
 if(protectedAt(x,z))return legacyHeight(z);
 const shore=landField(x,z),deep=-10+noise(x,z,95,12)*3;
 const hill=(1+noise(x,z,62,16))*1.9+Math.max(0,noise(x,z,29,19))*.8;
 let height=shore<0?lerp(deep,-1.8,smooth(-19,0,shore)):lerp(-1.8,hill,smooth(0,13,shore));
 // A broad dirt/grass walking circuit, with shoulder contours rather than walls.
 height=lerp(height,0,1-smooth(4.5,11,routeDistance(x,z)));
 for(const s of nearbySites(x,z)){const d=Math.max(Math.abs(x-s.x),Math.abs(z-s.z));height=lerp(height,0,1-smooth(7.5,18,d));}
 return lerp(legacyHeight(clamp(z,-28,112)),height,smooth(0,16,coreDistance(x,z)));
}
// Odd grid lines are the edges of2m gardening cells. Even chunk/core boundaries
// are inserted, so no surface triangle straddles a hole or a protected seam.
const gridEdges={x:[-28,28],z:[-28,...Array.from({length:13},(_,i)=>27+i),70,86,112]};
function axisCell(v,axis){
 const c=Math.floor(v/32)*32,p=v-c;
 let a=p<1?c:c+1+2*Math.floor((p-1)/2),b=Math.min(c+32,a+(p<1?1:2));
 for(const edge of gridEdges[axis])if(edge>a&&edge<b){if(v<edge)b=edge;else a=edge;}
 return [a,b,(v-a)/(b-a)];
}
// Bounded numeric vertex memo: repeated body/ray queries and adjacent chunks
// share samples without retaining an ever-growing visited-world ledger.
const vertexCache=new Map();
function vertexHeight(x,z){
 const key=`${x},${z}`;if(vertexCache.has(key))return vertexCache.get(key);
 const h=rawHeight(x,z);if(vertexCache.size>=4096)vertexCache.delete(vertexCache.keys().next().value);vertexCache.set(key,h);return h;
}
function gridHeight(x,z){
 const [a,b,u]=axisCell(x,'x'),[c,d,v]=axisCell(z,'z');
 // Mesh vertices need a single evaluation; avoid sampling three unused corners.
 if(u===0&&v===0)return vertexHeight(a,c);
 if(u===0)return lerp(vertexHeight(a,c),vertexHeight(a,d),v);
 if(v===0)return lerp(vertexHeight(a,c),vertexHeight(b,c),u);
 if(u+v<=1){const ac=vertexHeight(a,c);return ac+(vertexHeight(b,c)-ac)*u+(vertexHeight(a,d)-ac)*v;}
 const bd=vertexHeight(b,d);return bd+(vertexHeight(a,d)-bd)*(1-u)+(vertexHeight(b,c)-bd)*(1-v);
}
function regionAt(x,z){
 if(protectedAt(x,z))return z<28?'orchard':'reef';
 let best=null,distance=Infinity;
 for(const r of REGIONS.slice(2)){const d=Math.hypot(x-r.x,z-r.z);if(d<distance){distance=d;best=r;}}
 return distance<63?best.id:landField(x,z)>0?'outer-meadow':'outer-sea';
}
export function sampleWorld(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>1e6||Math.abs(z)>1e6)throw new RangeError('World coordinate outside numeric domain');
 const height=protectedAt(x,z)?legacyHeight(z):gridHeight(x,z),region=regionAt(x,z);
 const shoreDistance=protectedAt(x,z)?(31.02-z):landField(x,z);
 const surface=height< -1.8?'seabed':height<-.12?'sand':region==='amber-bay'&&height>2.4?'rock':'grass';
 return {height,region,surface,shoreDistance};
}
export function buildSiteAt(gx,gz){
 if(!Number.isSafeInteger(gx)||!Number.isSafeInteger(gz)||Math.abs(gx)>499999||Math.abs(gz)>499999)return null;
 const x=gx*2,z=gz*2;if(protectedAt(x,z))return null;
 const site=nearbySites(x,z).find(s=>Math.abs(x-s.x)<=4&&Math.abs(z-s.z)<=4);
 return site?{id:site.id,baseY:0,habitat:'land'}:null;
}
function chunkValid(cx,cz){return Number.isSafeInteger(cx)&&Number.isSafeInteger(cz)&&Math.abs(cx)<=31249&&Math.abs(cz)<=31249;}
function reserved(x,z,margin=0){return coreDistance(x,z)<=2+margin||routeDistance(x,z)<4.8+margin||nearbySites(x,z).some(s=>Math.abs(x-s.x)<8+margin&&Math.abs(z-s.z)<8+margin);}
// Small authored harvest groups frame the first route circuit. These are live
// resources, never baked tree scenery; each retains its own coordinate ID.
const authoredResources=freeze([
 [-26,-80,'pine'],[-18,-84,'pine'],[-8,-84,'pine'],[-2,-48,'birch'],[6,-50,'birch'],
 [-78,-18,'willow'],[-52,10,'willow'],[-76,-14,'flowers'],
 [82,-28,'pine'],[46,-24,'copper'],[82,-36,'iron'],[78,-14,'flowers'],
 [-94,74,'willow'],[-94,70,'flowers'],
].map(freeze));
const habitats=freeze([
 {kind:'habitat-fish',x:-77,z:20},{kind:'habitat-crab',x:-70,z:10},
 {kind:'habitat-fish',x:89,z:4},{kind:'habitat-bird',x:78,z:-14},
 {kind:'habitat-fish',x:-67,z:89},{kind:'habitat-crab',x:-65,z:77},
].map(freeze));
function resourceCandidate(cx,cz,slot){
 if(!chunkValid(cx,cz)||!Number.isInteger(slot)||slot<0)return null;
 if(slot>=2){
  const authored=authoredResources[slot-2];if(!authored)return null;
  const [x,z,kind]=authored;if(Math.floor(x/32)!==cx||Math.floor(z/32)!==cz||reserved(x,z,1.3))return null;
  return {id:`w1:r:${cx}:${cz}:${slot}`,gx:x/2,gz:z/2,kind,baseY:sampleWorld(x,z).height,yaw:hash(cx,cz,slot,35)*Math.PI*2,scale:kind==='flowers'?1:.94+hash(cx,cz,slot,36)*.10,variation:Math.floor(hash(cx,cz,slot,37)*8)};
 }
 if(hash(cx,cz,slot,31)>.76)return null;
 const gx=Math.round((cx*32+(slot?23:8)+(hash(cx,cz,slot,32)-.5)*5)/2),gz=Math.round((cz*32+(slot?23:10)+(hash(cx,cz,slot,33)-.5)*5)/2),x=gx*2,z=gz*2;
 if(reserved(x,z,1.3))return null;
 const sample=sampleWorld(x,z);if(sample.height<-.05||sample.surface==='rock')return null;
 if(Math.abs(sampleWorld(x+1,z).height-sampleWorld(x-1,z).height)>.6||Math.abs(sampleWorld(x,z+1).height-sampleWorld(x,z-1).height)>.6)return null;
 const n=hash(cx,cz,slot,34),kind=n<.20?'flowers':sample.region==='birch-downs'?(n<.7?'birch':'pine'):sample.region==='reed-cove'?(n<.67?'willow':'oak'):sample.region==='amber-bay'?(n<.42?'copper':n<.56?'iron':n<.66?'diamond':'pine'):n<.46?'birch':n<.7?'oak':'pine';
 return {id:`w1:r:${cx}:${cz}:${slot}`,gx,gz,kind,baseY:sample.height,yaw:hash(cx,cz,slot,35)*Math.PI*2,scale:kind==='flowers'?1:.88+hash(cx,cz,slot,36)*.22,variation:Math.floor(hash(cx,cz,slot,37)*8)};
}
export function resourceById(id){
 if(typeof id!=='string')return null;const m=/^w1:r:(-?\d+):(-?\d+):(\d+)$/.exec(id);if(!m)return null;
 const cx=Number(m[1]),cz=Number(m[2]),slot=Number(m[3]);if(id!==`w1:r:${cx}:${cz}:${slot}`)return null;
 return resourceCandidate(cx,cz,slot);
}
function rockSolid(id,x,y,z,r,h,phase,material){
 const vertices=[],indices=[];
 for(let ring=0;ring<2;ring++)for(let i=0;i<6;i++){const a=i*Math.PI/3+phase,rr=r*(ring?.68:1)*(1+.10*Math.sin(i*2.7+phase));vertices.push(x+Math.cos(a)*rr,y+(ring?.72:-.10)*h,z+Math.sin(a)*rr*.76);}
 vertices.push(x,y+h,z,x,y-.13*h,z);
 for(let i=0;i<6;i++){const j=(i+1)%6;indices.push(i,j,i+6,j,j+6,i+6,i+6,j+6,12,13,j,i);}
 // Correct outward winding once for both visible geometry and convex authority.
 for(let i=0;i<indices.length;i+=3){const ai=indices[i]*3,bi=indices[i+1]*3,ci=indices[i+2]*3,ax=vertices[ai],ay=vertices[ai+1],az=vertices[ai+2],ux=vertices[bi]-ax,uy=vertices[bi+1]-ay,uz=vertices[bi+2]-az,vx=vertices[ci]-ax,vy=vertices[ci+1]-ay,vz=vertices[ci+2]-az;if((uy*vz-uz*vy)*(ax-x)+(uz*vx-ux*vz)*(ay-y-h*.3)+(ux*vy-uy*vx)*(az-z)<0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
 return {id,vertices,indices,material};
}
export function describeChunk(cx,cz){
 if(!chunkValid(cx,cz))throw new RangeError('Invalid world chunk');
 const bounds={minX:cx*32,maxX:(cx+1)*32,minZ:cz*32,maxZ:(cz+1)*32},resources=[],decorations=[],solids=[];
 for(let i=0;i<2+authoredResources.length;i++){const r=resourceCandidate(cx,cz,i);if(r)resources.push(r);}
 for(let i=0;i<3;i++){
  const x=bounds.minX+4+hash(cx,cz,i,41)*24,z=bounds.minZ+4+hash(cx,cz,i,42)*24,s=sampleWorld(x,z);
  if(reserved(x,z,2)||resources.some(r=>Math.hypot(x-r.gx*2,z-r.gz*2)<4)||hash(cx,cz,i,43)>.52)continue;
  if(s.height<-12)continue;
  const r=.6+hash(cx,cz,i,44)*1.05,h=.35+hash(cx,cz,i,45)*1.05;
  solids.push(rockSolid(`w1:s:${cx}:${cz}:${i}`,x,s.height,z,r,h,hash(cx,cz,i,46)*6.28,s.region==='amber-bay'?'warmStone':s.height<-1.8?'seaStone':'paleStone'));
 }
 for(let i=0;i<76;i++){
  const x=bounds.minX+1+hash(cx,cz,i,51)*30,z=bounds.minZ+1+hash(cx,cz,i,52)*30;if(protectedAt(x,z)||reserved(x,z,.1))continue;
  const s=sampleWorld(x,z),patch=noise(x,z,12,53);if(patch<-.15||hash(cx,cz,i,54)>.77||s.height<-10)continue;
  const kind=s.height<-1.8?(i%9===0?'shell':s.region==='amber-bay'&&i%3===0?'sea-fan':'kelp'):s.surface==='sand'?(i%4===0?'shell':'reed'):s.region==='reed-cove'?'reed':i%11===0?'blossom':i%4===0?'clover':'grass';
  decorations.push({id:`w1:d:${cx}:${cz}:${i}`,kind,x,y:s.height,z,yaw:hash(cx,cz,i,55)*6.28,scale:.7+hash(cx,cz,i,56)*.7,variant:i%3});
 }
 // A few authored-looking verge patches frame each usable plateau, outside
 // its 5x5 cells and doorway margin. Routes retain a broad clear mouth.
 const vergeSites=authoredSites.filter(p=>p.x>=bounds.minX-9&&p.x<=bounds.maxX+9&&p.z>=bounds.minZ-9&&p.z<=bounds.maxZ+9);
 for(let mx=Math.floor((bounds.minX-9)/160);mx<=Math.floor((bounds.maxX+9)/160);mx++)for(let mz=Math.floor((bounds.minZ-9)/160);mz<=Math.floor((bounds.maxZ+9)/160);mz++){
  const p=macroSite(mx,mz);if(p&&p.x>=bounds.minX-9&&p.x<=bounds.maxX+9&&p.z>=bounds.minZ-9&&p.z<=bounds.maxZ+9)vergeSites.push(p);
 }
 for(const site of vergeSites)for(let i=0;i<16;i++){
  if(hash(site.x,site.z,i,71)>.82)continue;
  const side=i%4,along=(Math.floor(i/4)-1.5)*3.4+(hash(site.x,site.z,i,72)-.5)*1.3,edge=6.9+hash(site.x,site.z,i,73)*.8;
  const x=site.x+(side%2?along:(side===0?-edge:edge)),z=site.z+(side%2?(side===1?-edge:edge):along);
  if(x<bounds.minX||x>=bounds.maxX||z<bounds.minZ||z>=bounds.maxZ||routeDistance(x,z)<2.8)continue;
  decorations.push({id:`w1:v:${site.id}:${i}`,kind:i%7===0?'blossom':i%3===0?'clover':'grass',x,y:sampleWorld(x,z).height,z,yaw:hash(site.x,site.z,i,74)*6.28,scale:1+hash(site.x,site.z,i,75)*.3,variant:i%3});
 }
 for(let i=0;i<habitats.length;i++){
  const h=habitats[i];if(Math.floor(h.x/32)!==cx||Math.floor(h.z/32)!==cz)continue;
  decorations.push({id:`w1:h:${i}`,kind:h.kind,x:h.x,y:sampleWorld(h.x,h.z).height,z:h.z,yaw:hash(cx,cz,i,61)*Math.PI*2,scale:1,variant:i%3});
 }
 return {id:`w1:${cx}:${cz}`,bounds,decorations,solids,resources};
}
