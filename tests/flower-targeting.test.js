import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshBasicMaterial,Ray,Raycaster,Vector3} from 'three';
import {createStagedTree} from '../src/garden-visuals.js';
import {flowerEnvelope,flowerTarget} from '../src/flower-targeting.js';

test('visible flower stem gaps gather as one cluster, with bounded reach and solid occlusion',()=>{
 const model=createStagedTree('flowers'),flower=flowerEnvelope(model,'live-flower');
 const origin=new Vector3(0,1.7,2.4),ray=new Ray(),direct=new Raycaster();
 let gap=null;
 // Use real rendered petals/stems: find an interior aim where a thin mesh misses.
 for(let x=-.25;x<=.25&&!gap;x+=.05)for(let y=.2;y<=.55&&!gap;y+=.05){
  ray.set(origin,new Vector3(x,y,0).sub(origin).normalize());direct.ray.copy(ray);
  if(!direct.intersectObject(model,true).length&&flowerTarget(ray,[flower],[model]))gap=ray.clone();
 }
 assert.ok(gap,'Actual flower has a visible interior gap accepted by the cluster envelope');
 assert.equal(flowerTarget(gap,[flower],[model]).id,'live-flower');
 assert.equal(flowerTarget(gap,[],[model]),null,'Removed live identity cannot be gathered');
 model.visible=false;assert.equal(flowerTarget(gap,[flower],[model]),null);model.visible=true;
 assert.equal(flowerTarget(gap,[flower],[model],1),null,'Witness must be inside harvest reach');
 const wall=new Mesh(new BoxGeometry(3,3,.25),new MeshBasicMaterial());wall.position.set(0,1,1.1);wall.updateMatrixWorld(true);
 assert.equal(flowerTarget(gap,[flower],[wall,model]),null,'Foreground wall blocks envelope and real witnesses');
 const rock=new Mesh(new BoxGeometry(1.8,1.8,1),new MeshBasicMaterial());rock.position.set(0,.65,.8);rock.updateMatrixWorld(true);
 assert.equal(flowerTarget(gap,[flower],[model,rock]),null,'Foreground rock cannot be bypassed');
 const miss=new Ray(origin,new Vector3(1.5,.4,0).sub(origin).normalize());
 assert.equal(flowerTarget(miss,[flower],[model]),null,'Empty part of same 2m cell is not a target');
 const behind=new Ray(origin,new Vector3(0,0,1));assert.equal(flowerTarget(behind,[flower],[model]),null);
});
