import {seaHabitats} from './sea-habitats.js';
import {GRID,cellAt,chunkAt,chunkBounds,sampleCell,landDistance} from './surface-grid.js';
const freeze=Object.freeze;
export const WORLD_CONFIG=freeze({version:2,seed:GRID.seed,chunkSize:GRID.chunkSize,gridSize:GRID.size});
export const REGIONS=freeze([
 {id:'orchard',nameKey:'region.orchard',x:0,z:0,kind:'meadow',route:[]},
 {id:'reef',nameKey:'region.reef',x:0,z:52,kind:'reef',purpose:'seabed-home-and-life',route:[[0,12],[0,28],[0,40],[0,52],[0,60]]},
 {id:'birch-downs',nameKey:'region.birchDowns',x:-8,z:-66,kind:'downs',purpose:'timber-and-garden',route:[[-18,-22],[-24,-36],[-21,-51],[-8,-66]]},
 {id:'reed-cove',nameKey:'region.reedCove',x:-58,z:-14,kind:'cove',purpose:'wood-and-soil',route:[[-30,8],[-40,3],[-50,-8],[-58,-14],[-66,0],[-72,8]]},
 {id:'amber-bay',nameKey:'region.amberBay',x:64,z:-24,kind:'bay',purpose:'metal-and-coast',route:[[18,10],[32,10],[40,-10],[58,-22],[64,-24],[74,-30],[84,-30]]},
 {id:'seagrass-sound',nameKey:'region.seagrassSound',x:-76,z:62,kind:'sound',purpose:'island-garden',route:[[-58,-14],[-72,8],[-78,30],[-78,48],[-76,62],[-68,72],[-58,82]]},
].map(r=>freeze({...r,route:freeze(r.route.map(p=>freeze(p)))})));

function hash(x,z,slot=0,channel=0){let h=WORLD_CONFIG.seed^Math.imul(x,374761393)^Math.imul(z,668265263)^Math.imul(slot+1,1274126177)^Math.imul(channel+1,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
const noise=(x,z,scale,channel)=>Math.sin(x/scale+channel)*Math.cos(z/scale-channel);
export function sampleWorld(x,z){const {gx,gz}=cellAt(x,z),s=sampleCell(gx,gz);return {...s,surface:s.waterY!==null?'seabed':s.substrate==='soil'?'grass':s.substrate};}
function chunkValid(cx,cz){return Number.isSafeInteger(cx)&&Number.isSafeInteger(cz)&&Math.abs(cx)<=31248&&Math.abs(cz)<=31248;}
// Leave generous traversable space; this affects scenery, never gameplay rights.
const reserved=(x,z,margin=0)=>Math.hypot(x,z-9)<16+margin;
const authoredResources=freeze([
 [-26,-80,'pine'],[-18,-84,'pine'],[-8,-84,'pine'],[-2,-48,'birch'],[6,-50,'birch'],
 [-78,-18,'willow'],[-52,10,'willow'],[-76,-14,'flowers'],
 [82,-28,'pine'],[46,-24,'copper'],[82,-36,'iron'],[78,-14,'flowers'],
 [-94,74,'willow'],[-94,70,'flowers'],
 // Append only: existing coordinate/slot IDs remain valid in harvested ledgers.
 // Each crescent frames an open centre; useful plants, not decorative lookalikes.
 [-22,-62,'birch'],[-20,-70,'birch'],[-14,-78,'pine'],[18,-78,'birch'],[6,-62,'birch'],[-16,-58,'flowers'],
 [-64,-22,'willow'],[-58,-26,'willow'],[-50,-22,'oak'],[-48,-12,'willow'],[-52,-4,'flowers'],[-64,-10,'flowers'],
 [54,-34,'copper'],[62,-36,'iron'],[70,-32,'diamond'],[72,-22,'copper'],[58,-14,'copper'],[66,-12,'flowers'],
 [-84,60,'willow'],[-82,68,'birch'],[-74,70,'flowers'],[-70,58,'willow'],[-76,54,'flowers'],
 // Small companion groups frame the open gardens and the northern bay approach.
 [-6,-80,'birch'],[30,-80,'birch'],[18,-84,'birch'],[-16,-72,'birch'],[-18,-66,'flowers'],
 [54,-50,'copper'],[66,-48,'flowers'],[70,-48,'birch'],[60,-56,'iron'],
 // Birch shelter continues past the first grove, framing an open northward lawn.
 [-12,-92,'pine'],[-18,-94,'pine'],[-10,-100,'birch'],[18,-90,'birch'],[20,-96,'birch'],
 [18,-80,'flowers'],[-10,-90,'flowers'],[26,-98,'flowers'],
 // Small shore companions break isolated silhouettes; the central approach stays open.
 [24,12,'birch'],[28,18,'birch'],[28,10,'flowers'],[-16,26,'willow'],[-20,24,'flowers'],
 // Two offset inland groups supply a middle layer around existing usable ground.
 [-12,-42,'birch'],[-14,-48,'birch'],[-12,-52,'flowers'],[16,-56,'pine'],[20,-60,'birch'],[18,-64,'flowers'],
 // A small timber destination beyond the open north lawn, with two clear approaches.
 [-4,-104,'pine'],[28,-108,'pine'],[30,-102,'birch'],[28,-100,'flowers'],
 [-16,-100,'pine'],[-20,-98,'birch'],[-18,-106,'pine'],
 [30,-88,'birch'],[26,-94,'birch'],[18,-102,'birch'],[20,-102,'flowers'],


].map(freeze));
const habitats=freeze([
 {kind:'habitat-fish',x:-78,z:20},{kind:'habitat-crab',x:-72,z:8},
 {kind:'habitat-fish',x:94,z:-22},{kind:'habitat-bird',x:66,z:-18},
 {kind:'habitat-fish',x:-66,z:86},{kind:'habitat-crab',x:-64,z:76},
 {kind:'habitat-bird',x:-14,z:-68},{kind:'habitat-bird',x:-58,z:-18},{kind:'habitat-bird',x:-78,z:62},
].map(freeze));
function resourceCandidate(cx,cz,slot){
 if(!chunkValid(cx,cz)||!Number.isInteger(slot)||slot<0)return null;
 if(slot>=2){
  const authored=authoredResources[slot-2];if(!authored)return null;
  const [x,z,kind]=authored;if(chunkAt(x,z).cx!==cx||chunkAt(x,z).cz!==cz||reserved(x,z,1.3))return null;
  return {id:`w1:r:${cx}:${cz}:${slot}`,gx:x/2,gz:z/2,kind,baseY:sampleWorld(x,z).height,yaw:hash(cx,cz,slot,35)*Math.PI*2,scale:kind==='flowers'?1:(x>=18&&x<=30&&z<=-76&&z>=-108)?1.45+hash(cx,cz,slot,36)*.38:slot>=48?(kind==='pine'?1.2:1)+hash(cx,cz,slot,36)*.32:.94+hash(cx,cz,slot,36)*.10,variation:Math.floor(hash(cx,cz,slot,37)*8)};
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
 const bounds=chunkBounds(cx,cz),resources=[],decorations=[],solids=[];
 for(let i=0;i<2+authoredResources.length;i++){const r=resourceCandidate(cx,cz,i);if(r&&sampleWorld(r.gx*2,r.gz*2).waterY===null&&!REGIONS.some(d=>d.purpose&&Math.hypot(r.gx*2-d.x,r.gz*2-d.z)<5))resources.push(r);}
 for(let i=0;i<3;i++){
  const x=bounds.minX+4+hash(cx,cz,i,41)*24,z=bounds.minZ+4+hash(cx,cz,i,42)*24,s=sampleWorld(x,z);
  if(reserved(x,z,2)||REGIONS.some(r=>r.purpose&&Math.hypot(x-r.x,z-r.z)<6)||resources.some(r=>Math.hypot(x-r.gx*2,z-r.gz*2)<4)||hash(cx,cz,i,43)>.52)continue;
  if(s.height<-12)continue;
  const r=.6+hash(cx,cz,i,44)*1.05,h=.35+hash(cx,cz,i,45)*1.05;
  solids.push(rockSolid(`w1:s:${cx}:${cz}:${i}`,x,s.height,z,r,h,hash(cx,cz,i,46)*6.28,s.region==='amber-bay'?'warmStone':s.height<-1.8?'seaStone':'paleStone'));
 }
 for(let i=0;i<76;i++){
  const x=bounds.minX+1+hash(cx,cz,i,51)*30,z=bounds.minZ+1+hash(cx,cz,i,52)*30;if(reserved(x,z,.1))continue;
  const s=sampleWorld(x,z),patch=noise(x,z,12,53);
  // The authored shell reef already owns this planting; do not add a second cover.
  if(s.waterY!==null&&Math.abs(x)<24&&z>30&&z<68)continue;if(patch<-.15||hash(cx,cz,i,54)>.77||s.height<-10||s.surface==='rock'||REGIONS.some(r=>r.purpose&&Math.hypot(x-r.x,z-r.z)<3))continue;
  const kind=s.height<-1.8?(i%9===0?'shell':s.region==='amber-bay'&&i%3===0?'sea-fan':'kelp'):s.surface==='sand'?(i%4===0?'shell':'reed'):s.region==='reed-cove'?'reed':i%11===0?'blossom':i%4===0?'clover':'grass';
  decorations.push({id:`w1:d:${cx}:${cz}:${i}`,kind,x,y:s.height,z,yaw:hash(cx,cz,i,55)*6.28,scale:.7+hash(cx,cz,i,56)*.7,variant:i%3});
 }
 // Authored botanical edges use the existing chunk batch, not another cover layer.
 // Each patch leaves the centre open and leads the eye toward resources or water.
 const verges=[[-18,-65,4,2,'blossom'],[1,-74,5,2,'clover'],[-12,-77,4,2,'blossom'],[-65,-17,2,7,'reed'],[-52,-23,5,2,'clover'],[-63,-6,3,2,'blossom'],[57,-43,5,2,'blossom'],[69,-38,3,4,'clover'],[75,-24,2,5,'reed'],[-82,59,2,5,'blossom'],[-75,70,5,2,'clover'],[-70,57,2,3,'reed'],[-14,-98,4,9,'blossom'],[29,-92,3,11,'blossom'],[-12,-46,3,5,'blossom'],[18,-60,3,4,'clover'],[26,16,3,4,'blossom'],[-17,25,3,3,'reed'],[24,-99,8,3,'clover']];
 for(let p=0;p<verges.length;p++){const [x0,z0,rx,rz,kind]=verges[p];for(let i=0;i<(p>=12?28:14);i++){
  const a=hash(p,0,i,70)*Math.PI*2,r=Math.sqrt(hash(p,0,i,71)),x=x0+Math.cos(a)*r*rx,z=z0+Math.sin(a)*r*rz;
  if(chunkAt(x,z).cx!==cx||chunkAt(x,z).cz!==cz)continue;const sample=sampleWorld(x,z);
  if(sample.waterY!==null||sample.substrate==='rock'||REGIONS.some(d=>d.purpose&&Math.hypot(x-d.x,z-d.z)<4))continue;
  decorations.push({id:`w1:v:${p}:${i}`,kind,x,y:sample.height,z,yaw:a,scale:1.4+hash(p,0,i,72)*.55,variant:i%3});
 }}
 for(let i=0;i<habitats.length;i++){
  const h=habitats[i];if(chunkAt(h.x,h.z).cx!==cx||chunkAt(h.x,h.z).cz!==cz)continue;
  decorations.push({id:`w1:h:${i}`,kind:h.kind,x:h.x,y:sampleWorld(h.x,h.z).height,z:h.z,yaw:hash(cx,cz,i,61)*Math.PI*2,scale:1,variant:i%3});
 }
 decorations.push(...seaHabitats(cx,cz));
 return {id:`w1:${cx}:${cz}`,bounds,decorations,solids,resources};
}
