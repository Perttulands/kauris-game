import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {standingPlacement} from '../src/standing-placement.js';
import {buildingBoxes,touches,placementClearance} from '../src/building.js';
import {freshState,harvestWild,liveWild,build,validateBuild,serialize,deserialize} from '../src/state.js';
import {sampleCell} from '../src/surface-grid.js';
import {propBoxes,validateDelight,placeDelight,boxesOverlap} from '../src/delights.js';
const body={x:0,z:0,feet:0,height:1.65,radius:.24},slab={minX:-1,maxX:1,minZ:-1,maxZ:1,minY:-.05,maxY:.15};
test('support raises whole footprint; ceilings, side edges and non-supports refuse',()=>{
 const plan=options=>standingPlacement({body,volumes:[slab],supports:[slab],...options});
 assert.equal(plan({}).landingFeet,.15);
 assert.equal(plan({solids:[{...slab,minY:1.7,maxY:2}]}).ok,false);
 assert.equal(plan({body:{...body,x:.9}}).ok,false);
 assert.equal(plan({supports:[]}).ok,false);
 assert.equal(plan({bodies:[{...body,feet:1.7}]}).ok,false);
 assert.equal(plan({body:{...body,x:3}}).landingFeet,null);
 const roof={...slab,maxY:.8};assert.equal(plan({volumes:[roof],supports:[roof]}).landingFeet,.8);
 const raised={...slab,minY:.1,maxY:.3};assert.equal(plan({body:{...body,feet:.15},volumes:[raised],supports:[raised],solids:[slab]}).landingFeet,.3);
});
function fixture(){
 const state=freshState();harvestWild(state,liveWild(state).find(r=>r.kind==='oak').id);let b;
 for(let x=-10;x<=10&&!b;x++)for(let z=-10;z<=10&&!b;z++){const q={kind:'floor',gx:x,gz:z,baseY:sampleCell(x,z).height,level:0,rotation:0,material:'wood'};if(validateBuild(state,q).ok)b=q;}
 assert.ok(b);
 const c={state,feet:b.baseY,vy:-1,pos:{x:b.gx*2,z:b.gz*2},camera:{position:{x:b.gx*2,y:b.baseY+1.7,z:b.gz*2,set(x,y,z){this.x=x;this.y=y;this.z=z;}}},
 isToy:()=>false,standingPlacement,boxes:p=>buildingBoxes(p,{state}),placementClearance,touches,validateBuild,build,propBoxes,boxesOverlap,validateDelight,placeDelight,
 residents:{bodies:()=>[]},outerBodies:()=>[],marineLife:{animals:[],overlapsBuilding:()=>false},physicalSolids:()=>[],nearbyResources:()=>[],isFlower:()=>false,
 plantVolume:()=>null,world:{colliders:[]},activeDiscoveries:()=>[]};
 vm.createContext(c);const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('function placementStanding('),source.indexOf('function toyHint(')),c);
 return {c,b};
}
test('actual main preview/commit charges once and relocates only after paid success',()=>{
 const {c,b}=fixture(),before=c.state.inventory.wood;
 const preview=c.placementResult(b);assert.equal(preview.ok,true);assert.equal(preview.landingFeet,b.baseY+.15);
 assert.equal(c.commitPlacement(b).ok,true);assert.equal(c.feet,preview.landingFeet);assert.equal(c.vy,0);assert.equal(c.state.inventory.wood,before-2);
 const saved=deserialize(serialize(c.state));assert.ok(saved.buildings.some(p=>p.gx===b.gx&&p.gz===b.gz));
 const snapshot=JSON.stringify(c.state),feet=c.feet;
 assert.equal(c.commitPlacement(b).ok,false);assert.equal(JSON.stringify(c.state),snapshot);assert.equal(c.feet,feet);
});
test('actual main rejects headroom and insufficient funds without any mutation',()=>{
 for(const ceiling of [true,false]){
  const {c,b}=fixture();if(ceiling)c.physicalSolids=()=>[{minX:c.pos.x-1,maxX:c.pos.x+1,minZ:c.pos.z-1,maxZ:c.pos.z+1,minY:c.feet+1.7,maxY:c.feet+2}];else c.state.inventory.wood=0;
  const before=JSON.stringify(c.state),feet=c.feet;
  assert.equal(c.placementResult(b).ok,false);assert.equal(c.commitPlacement(b).ok,false);assert.equal(JSON.stringify(c.state),before);assert.equal(c.feet,feet);assert.equal(c.vy,-1);
 }
});
test('lift landing uses its real deck and keeps attached frame collision',()=>{
 const p={kind:'lift',gx:0,gz:0,baseY:0,rotation:0,liftY:0},volumes=propBoxes(p),deck=volumes.at(-1);
 const result=standingPlacement({body,volumes,supports:[deck]});assert.equal(result.ok,true);assert.equal(result.landingFeet,deck.maxY);
 const post=volumes.find(a=>a.maxY>1&&a.maxX-a.minX<.5);assert.ok(post);
 assert.equal(standingPlacement({body:{...body,x:(post.minX+post.maxX)/2,z:(post.minZ+post.maxZ)/2},volumes,supports:[deck]}).ok,false);
});

test('actual main preserves actor, reach and structural support vetoes',()=>{
 for(const mode of ['resident','range','support']){
  const {c,b}=fixture();
  if(mode==='resident')c.residents.bodies=()=>[{x:c.pos.x,z:c.pos.z,feet:c.feet,height:1.65,radius:.3}];
  if(mode==='range')c.camera.position.x+=20;
  if(mode==='support'){b.level=2;c.feet+=4.8;c.camera.position.y+=4.8;}
  const before=JSON.stringify(c.state),feet=c.feet;
  assert.equal(c.commitPlacement(b).ok,false,mode);assert.equal(JSON.stringify(c.state),before);assert.equal(c.feet,feet);
 }
});
