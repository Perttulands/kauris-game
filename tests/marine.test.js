import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarineLife,MARINE_COUNTS} from '../src/marine.js';
import {MARINE_PROFILES,createMarineAnimal,animateMarineAnimal} from '../src/marine-visuals.js';
import {Vector3} from 'three';
import {createOceanWorld} from '../src/ocean-visuals.js';
import {TERRAIN,terrainHeight} from '../src/terrain.js';
import {createReadingFocus,assistedReading,nearestReading} from '../src/reading.js';
import {LOCALES} from '../src/locale-data.js';
import {freshState,serialize,deserialize} from '../src/state.js';

const reefSolids=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight}).userData.reefSolids;
const make=buildings=>createMarineLife({profiles:MARINE_PROFILES,reefSolids,buildings});

test('old pine saves retain IDs, growth, inventory and houses while names become Spruce/Kuusi/Gran',()=>{
 const old=freshState(),before=serialize(old),loaded=deserialize(before);
 const evergreen=Object.values(loaded.plots).find(p=>p.seed==='pine');
 assert.ok(evergreen);assert.equal(evergreen.growth,1);assert.equal(serialize(loaded),before);
 assert.deepEqual(['en','fi','sv'].map(l=>LOCALES[l]['tree.pine']),['Spruce','Kuusi','Gran']);
 for(const key of Object.keys(MARINE_COUNTS))for(const locale of ['en','fi','sv'])assert.ok(LOCALES[locale]['animal.'+key]);
});

test('finite deterministic inhabitants freeze exactly when paused, independently of paid state',()=>{
 const state=freshState(),before=serialize(state),a=make(state.buildings),b=make(state.buildings);
 const counts={};for(const x of a.animals)counts[x.kind]=(counts[x.kind]??0)+1;
 assert.deepEqual(counts,MARINE_COUNTS);
 for(let i=0;i<600;i++){a.update(1/60);b.update(1/60);}
 assert.deepEqual(a.snapshot(),b.snapshot());const paused=a.snapshot();
 for(let i=0;i<120;i++)a.update(0,{x:3,y:-4,z:40});
 assert.deepEqual(a.snapshot(),paused);assert.equal(serialize(state),before);
});

test('actual reef and occupied house clearance survive sustained routes with bounded motion',()=>{
 const buildings=[{id:1,kind:'floor',gx:0,gz:24,baseY:-7.2,level:0,rotation:0,material:'wood'},
  {id:2,kind:'door',gx:0,gz:24,baseY:-7.2,level:0,rotation:0,material:'wood'},
  {id:3,kind:'wall',gx:1,gz:24,baseY:-7.2,level:0,rotation:1,material:'wood'}];
 const before=JSON.stringify(buildings),s=make(buildings),states=new Map(),starts=s.snapshot(),excursions=new Map();
 for(let i=0;i<3600;i++){
  const previous=s.snapshot();s.update(1/30);
  for(let j=0;j<s.animals.length;j++){
   const a=s.animals[j],p=previous[j],start=starts[j];excursions.set(a.id,Math.max(excursions.get(a.id)??0,Math.hypot(a.x-start.x,a.y-start.y,a.z-start.z)));assert.ok(s.clearAt(a,a.x,a.y,a.z),`clear ${a.id} at ${i}`);
   assert.ok(Math.hypot(a.x-p.x,a.y-p.y,a.z-p.z)<.04,`continuous ${a.id}`);
   for(const value of [a.x,a.y,a.z,a.phase,a.yaw,a.speed])assert.ok(Number.isFinite(value));
   if(!states.has(a.kind))states.set(a.kind,new Set());states.get(a.kind).add(a.activity);
  }
 }
 assert.equal(JSON.stringify(buildings),before);
 for(const a of s.animals)if(['fish','turtle','octopus','crab'].includes(a.kind))assert.ok(excursions.get(a.id)>(a.kind==='turtle'?2:a.kind==='fish'?.75:.25),`${a.id} never left its spot`);
 for(const kind of ['crab','turtle','octopus','fish']){assert.ok(states.get(kind).has('move'));assert.ok(states.get(kind).has('forage'));}
});

test('sessile pockets use sampled support without reserved construction pads',()=>{
 const s=make(),permanent=s.animals.filter(a=>['starfish','anemone','octopus'].includes(a.kind));assert.equal(permanent.length,10);
 for(let i=0;i<900;i++){s.update(1/30);for(const a of permanent){assert.ok(s.clearAt(a,a.x,a.y,a.z));assert.ok(Math.abs(a.y-terrainHeight(a.x,a.z)-.008)<1e-9);}}
});

test('crab contact follows its sampled terrace and gait phase follows actual travel, stopping during caution',()=>{
 const s=make(),a=s.animals.find(a=>a.id==='crab:0'),start={x:a.x,phase:a.phase};
 for(let i=0;i<660;i++)s.update(1/60);
 assert.ok(Math.abs(a.x-start.x)>.3);assert.equal(a.z,a.homeZ);
 assert.ok(Math.abs(a.phase-start.phase-(a.x-start.x)*Math.cos(a.yaw)/a.profile.stride)<1e-9);
 assert.ok(Math.abs(a.y-terrainHeight(a.x,a.z)-.008)<1e-9);assert.equal(a.pitch,0);assert.equal(a.roll,0);
 const phase=a.phase;for(let i=0;i<180;i++)s.update(1/60,{x:a.x,y:a.y+.2,z:a.z});
 assert.equal(a.phase,phase);assert.equal(a.activity,'alert');assert.equal(a.speed,0);
});

test('generous animal reading requires visible front-facing in-range mesh and keeps school noun stable',()=>{
 const fish={id:'fish:1',focusKey:'marine:fish',key:'animal.fish'},other={...fish,id:'fish:2'},sand={id:'sand',key:'noun.sand'};
 const candidate={semantic:fish,visible:true,forward:4,distance:4,angle:.045,angularRadius:.05};
 assert.equal(assistedReading(sand,[candidate]),fish);
 for(const change of [{visible:false},{forward:-1},{distance:13},{angle:.2}])assert.equal(assistedReading(sand,[{...candidate,...change}]),sand);
 assert.equal(nearestReading([{distance:2,opaque:true},{distance:4,semantic:fish}]),null);
 const wall={id:'wall',key:'piece.wall'};assert.equal(assistedReading(wall,[candidate]),wall);
 const focus=createReadingFocus();assert.equal(focus.update(fish,0),null);assert.equal(focus.update(other,121),other);
 assert.equal(focus.update(null,122),null);assert.equal(focus.update(fish,130),null);
});

test('posed marine bodies fit declared collision envelopes and clones own their bones',()=>{
 const vertex=new Vector3();
 for(const kind of Object.keys(MARINE_COUNTS)){
  const a=createMarineAnimal(kind),b=createMarineAnimal(kind),meshes=[];a.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  const other=[];b.traverse(o=>{if(o.isBone)other.push(o);});const untouched=other.map(o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()]);
  for(const [phase,turn,activity] of [[.12,-1,'move'],[.42,0,'forage'],[.76,1,'alert']]){
   animateMarineAnimal(a,{time:phase*20,dt:.1,phase,speed:.3,turn,activity});a.updateMatrixWorld(true);
   for(const mesh of meshes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    mesh.getVertexPosition(i,vertex);const p=MARINE_PROFILES[kind];
    assert.ok(Math.hypot(vertex.x,vertex.z)<=p.radius+.0001,`${kind} limb radius`);
    assert.ok(vertex.y>=p.minY-.0001&&vertex.y<=p.maxY+.0001,`${kind} vertical envelope`);
   }
  }
  assert.deepEqual(other.map(o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()]),untouched);
  assert.deepEqual(a.position.toArray(),[0,0,0]);assert.deepEqual(a.quaternion.toArray(),[0,0,0,1]);
 }
});
