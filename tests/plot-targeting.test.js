import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {plotSurfaces} from '../src/plot-surfaces.js';
import {freshState,dig,plant,fill} from '../src/state.js';

const materials={wallGeometry:new BoxGeometry(2,.6,.012),wallMaterial:new MeshBasicMaterial(),soilGeometry:new BoxGeometry(1.82,.035,1.82),soilMaterial:new MeshBasicMaterial()};
function surfaces(state){const meshes=Object.values(state.plots).flatMap(p=>plotSurfaces(p,state.plots,materials));meshes.forEach(m=>m.updateMatrixWorld(true));return meshes;}
function aim(pitch=-.5144,far=6){return new Raycaster(new Vector3(0,1.7,9),new Vector3(0,Math.sin(pitch),-Math.cos(pitch)),0,far);}

test('original audit camera acquires the dug inner wall and completes sow/cover without moving',()=>{
 const state=freshState();assert.ok(dig(state,0,3).ok);
 const ray=aim(),hit=ray.intersectObjects(surfaces(state))[0];
 assert.equal(hit?.object.userData.plot,'0,3');
 assert.ok(hit.point.y<0&&hit.point.y>-.6,'visible inner wall, not a proxy over the grass');
 assert.ok(plant(state,0,3,'oak').ok);assert.ok(fill(state,0,3).ok);
 assert.equal(ray.intersectObjects(surfaces(state))[0]?.object.userData.plot,'0,3');
 assert.equal(state.plots['0,3'].seed,'oak');
 assert.equal(state.plots['0,3'].phase,'filled');
});

test('plot triangles preserve reach, misses and foreground solid occlusion',()=>{
 const state=freshState();dig(state,0,3);const meshes=surfaces(state),ray=aim();
 assert.equal(aim(-.5144,2).intersectObjects(meshes).length,0,'no reach extension');
 const miss=new Raycaster(new Vector3(0,1.7,9),new Vector3(0,1,0),0,6);
 assert.equal(miss.intersectObjects(meshes).length,0,'no cell-wide screen magnet');
 for(const size of [[3,3,.2],[1.5,2,1]]){
  const blocker=new Mesh(new BoxGeometry(...size),new MeshBasicMaterial());
  blocker.position.set(0,.5,7.3);blocker.updateMatrixWorld(true);
  assert.equal(ray.intersectObjects([...meshes,blocker])[0].object,blocker,'near wall/rock remains first');
 }
});

test('adjacent dug plots retain their own surface identity without internal divider walls',()=>{
 const state=freshState();dig(state,0,3);dig(state,1,3);
 const a=plotSurfaces(state.plots['0,3'],state.plots,materials);
 assert.equal(a.length,4);assert.ok(a.every(m=>m.userData.plot==='0,3'));
 assert.ok(!a.some(m=>m.position.x===1&&m.position.y===-.3));
});
