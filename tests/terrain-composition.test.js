import test from 'node:test';
import assert from 'node:assert/strict';
import {Raycaster,Vector3} from 'three';
import {sampleCell,surfaceAt,cellAt,chunkAt} from '../src/surface-grid.js';
import {terrainHeight,buildBase} from '../src/terrain.js';
import {createWorldChunk} from '../src/world-visuals.js';
import {describeChunk} from '../src/world-layout.js';
import {freshState,validateDig,dig,plant,fill,water,tick,harvest,build,serialize,deserialize} from '../src/state.js';
import {foundationDepth,foundationBoxes,supportedPieces} from '../src/building.js';
import {verticalStep} from '../src/movement.js';

test('inland rises share one deterministic dry-soil authority and one-step cardinal approaches',()=>{
 let elevated=0;
 for(let gz=-80;gz<=-25;gz++)for(let gx=-35;gx<=35;gx++){
  const a=sampleCell(gx,gz);assert.deepEqual(sampleCell(gx,gz),a);
  for(const [dx,dz] of [[1,0],[0,1]])assert.ok(Math.abs(a.height-sampleCell(gx+dx,gz+dz).height)<=.300001,`step ${gx},${gz}`);
  assert.equal(terrainHeight(gx*2,gz*2),a.height);assert.equal(buildBase(gx,gz),a.height);
  if(a.height>1.2&&gx>-24&&gx<27&&gz>-68){elevated++;assert.equal(a.substrate,'soil');assert.equal(a.waterY,null);}
 }
 assert.ok(elevated>80,'broad usable rises, not isolated spikes');
 for(const [gx,gz,h] of [[-11,-52,2.1],[14,-46,2.1],[1,-59,1.5],[1,-43,0],[0,-47,0]])assert.equal(sampleCell(gx,gz).height,h);
});

test('recorded arrival, garden and earned home surfaces remain unchanged',()=>{
 const dry=[[-7,-6],[-9,-8],[-5,-10],[-10,-3],[6,-8],[8,-5],[3,-11],[5,-3],[1,-43],[1,4],[1,5],[2,4],[0,5]];
 for(const [gx,gz] of dry){const s=sampleCell(gx,gz);assert.equal(s.height,0);assert.equal(s.substrate,'soil');assert.equal(s.waterY,null);}
 for(const [gx,gz,h] of [[17,26,-5.7],[3,23,-4.2],[4,23,-4.2],[3,24,-4.5]])assert.equal(sampleCell(gx,gz).height,h);
});

test('walk climbs and descends real terraces without changing physics',()=>{
 for(const x of [-22,28,2]){
  let feet=terrainHeight(x,-50),vy=0,peak=feet;
  const route=[];for(let z=-50;z>=-138;z-=.2)route.push(z);route.push(...route.slice().reverse());
  for(const z of route){const floor=terrainHeight(x,z);assert.ok(floor-feet<=.300001);({feet,vy}=verticalStep({x,z,feet,vy,dt:.025,floor}));assert.ok(feet>=floor);peak=Math.max(peak,feet);}
  assert.ok(peak>=1.5);assert.equal(feet,terrainHeight(x,-50));
 }
});

test('rise and transition allow earned planting, true holes and anchored foundations at sampled height',()=>{
 for(const [cx,cz] of [[-11,-52],[14,-46],[1,-55]]){
  const s=freshState();let cell;
  for(let dz=-2;dz<=2&&!cell;dz++)for(let dx=-2;dx<=2&&!cell;dx++)if(validateDig(s,cx+dx,cz+dz).ok&&sampleCell(cx+dx,cz+dz).height>=.3)cell=sampleCell(cx+dx,cz+dz);
  assert.ok(cell);const {gx,gz,height}=cell;assert.ok(dig(s,gx,gz).ok);assert.equal(s.plots[`${gx},${gz}`].baseY,height);assert.equal(surfaceAt(s,gx*2,gz*2).floor,height-.6);
  const at=chunkAt(gx*2,gz*2),chunk=createWorldChunk(describeChunk(at.cx,at.cz),{holes:[{gx,gz}],detail:false});chunk.group.updateMatrixWorld(true);
  assert.equal(new Raycaster(new Vector3(gx*2,10,gz*2),new Vector3(0,-1,0)).intersectObjects(chunk.groundMeshes).length,0);chunk.dispose();
  assert.ok(plant(s,gx,gz,'oak').ok);assert.ok(fill(s,gx,gz).ok);for(let i=0;i<20;i++)water(s,gx,gz,.1);for(let i=0;i<300;i++)tick(s,.1);assert.ok(harvest(s,gx,gz).ok);
  const b={kind:'floor',material:'wood',gx,gz,baseY:height+.6,level:0,rotation:0};assert.ok(build(s,b).ok);const paid=s.buildings.at(-1);assert.equal(foundationDepth(paid,s),.6);assert.ok(foundationBoxes(paid,s).every(box=>Math.abs(box.minY-height)<1e-6));assert.ok(supportedPieces(s.buildings,s).has(paid));assert.deepEqual(deserialize(serialize(s)).buildings,s.buildings);
  const surface=createWorldChunk(describeChunk(at.cx,at.cz),{detail:false});surface.group.updateMatrixWorld(true);const hit=new Raycaster(new Vector3(gx*2,10,gz*2),new Vector3(0,-1,0)).intersectObjects(surface.groundMeshes)[0];assert.ok(Math.abs(hit.point.y-height)<1e-5);surface.dispose();
 }
});

test('grove pocket is level usable soil with open interior and feathered edges',()=>{
 for(let gz=-46;gz<=-42;gz++)for(let gx=11;gx<=14;gx++){
  const c=sampleCell(gx,gz);assert.equal(c.height,2.1);assert.equal(c.substrate,'soil');assert.equal(c.waterY,null);
  const s=freshState();assert.ok(validateDig(s,gx,gz).ok);
 }
 assert.equal(sampleCell(-8,-54).height,1.8,'earned western floor preserved');
 const resources=[];
 for(let cx=-1;cx<=1;cx++)for(let cz=-4;cz<=-2;cz++)resources.push(...describeChunk(cx,cz).resources);
 assert.ok(!resources.some(r=>r.gx>=11&&r.gx<=14&&r.gz>=-46&&r.gz<=-42),'clearing resource-free');
 assert.ok(resources.filter(r=>r.gx>=9&&r.gx<=15&&r.gz>=-54&&r.gz<=-38).length>=10,'useful harvestable edges');
});
