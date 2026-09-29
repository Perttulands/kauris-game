import test from 'node:test';
import assert from 'node:assert/strict';
import {Raycaster,Vector3} from 'three';
import {cellAt,chunkAt,chunkBounds,sampleCell,surfaceAt,GRID} from '../src/surface-grid.js';
import {describeChunk,sampleWorld} from '../src/world-layout.js';
import {createWorldChunk} from '../src/world-visuals.js';
import {terrainHeight} from '../src/terrain.js';
import {verticalStep,swimmingAt} from '../src/movement.js';

test('negative and positive cell/chunk edges have one half-open owner',()=>{
 for(const edge of [-65,-33,-1,31,63]){
  const left=cellAt(edge-.0001,0),right=cellAt(edge,0);
  assert.equal(right.gx,left.gx+1);assert.equal(chunkAt(edge,0).cx,chunkAt(edge-.0001,0).cx+1);
  assert.equal(chunkBounds(chunkAt(edge,0).cx,0).minX,edge);
 }
});
test('chunk terrain rays agree with cell heights on both sides of every sampled seam; only wet cells render water',()=>{
 for(const [cx,cz] of [[0,0],[-1,0],[1,0],[0,1],[-2,2],[4,-2]]){
  const c=createWorldChunk(describeChunk(cx,cz),{detail:false});c.group.updateMatrixWorld(true);
  const b=chunkBounds(cx,cz),water=c.group.children.find(m=>m.userData.worldWater);
  const waterCells=new Set();if(water){const p=water.geometry.attributes.position;for(let i=0;i<p.count;i+=6){const x=(p.getX(i)+p.getX(i+2))/2,z=(p.getZ(i)+p.getZ(i+2))/2;waterCells.add(`${cellAt(x,z).gx},${cellAt(x,z).gz}`);assert.equal(p.getY(i),Math.fround(GRID.waterY));}}
  for(let z=b.minZ;z<b.maxZ;z+=.997)for(let x=b.minX+.017;x<b.maxX;x+=2){
   const cell=sampleWorld(x,z),hits=new Raycaster(new Vector3(x,20,z),new Vector3(0,-1,0)).intersectObjects(c.groundMeshes);
   assert.equal(hits.length,1);assert.ok(Math.abs(hits[0].point.y-cell.height)<1e-5);assert.equal(terrainHeight(x,z),cell.height);
   assert.equal(waterCells.has(`${cell.gx},${cell.gz}`),cell.height<GRID.waterY);
  }
  c.dispose();
 }
});
test('surface edits affect physical floor without replacing deterministic terrain or water',()=>{
 const s={plots:{'5,6':{gx:5,gz:6,phase:'hole'}}},base=sampleCell(5,6);
 assert.equal(surfaceAt(s,10,12).floor,base.height-.6);assert.deepEqual(sampleCell(5,6),base);
 assert.equal(surfaceAt({plots:{}},10,12).floor,base.height);
});
test('ordinary coast is step-traversable and water motion descends, rises and exits without floor disagreement',()=>{
 let feet=terrainHeight(0,9),vy=0,swam=false;
 for(let z=9;z<=62;z+=.1){const floor=terrainHeight(0,z);assert.ok(floor-feet<=.300001);({feet,vy}=verticalStep({x:0,z,feet,vy,dt:.025,floor}));swam ||= swimmingAt(0,z,feet);assert.ok(feet>=floor);}
 assert.ok(swam);
 for(let i=0;i<120;i++)({feet,vy}=verticalStep({x:0,z:62,feet,vy,dt:.025,dive:true,floor:terrainHeight(0,62)}));
 assert.equal(feet,terrainHeight(0,62));
 for(let i=0;i<120;i++)({feet,vy}=verticalStep({x:0,z:62,feet,vy,dt:.025,rise:true,floor:terrainHeight(0,62)}));
 assert.ok(Math.abs(feet-(GRID.waterY-1.45))<.001);
 for(let z=62;z>=9;z-=.1){const floor=terrainHeight(0,z);({feet,vy}=verticalStep({x:0,z,feet,vy,dt:.025,floor}));assert.ok(feet>=floor);}
 assert.equal(swimmingAt(0,9,feet),false);assert.equal(feet,terrainHeight(0,9));
});
