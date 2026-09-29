import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Raycaster,Vector3} from 'three';
import {createTree,animateTree} from '../src/visuals.js';
test('small wild spruce retains its taper while opaque skirts clear the walking camera',()=>{
 for(const variation of [0,8,9]){
  const tree=createTree('pine',{variation});tree.position.set(24,-.3,16);tree.scale.setScalar(.88);tree.rotation.y=5.1;animateTree(tree,{growth:1,time:0,variation});tree.updateMatrixWorld(true);
  const crown=tree.getObjectByName('tree-crown'),bounds=new Box3().setFromObject(crown);
  assert.ok(bounds.min.y>1.8,`canopy bottom ${bounds.min.y} must clear eye1.4 plus headroom`);
  assert.ok(bounds.max.y>4.9);assert.ok(bounds.max.x-bounds.min.x>1.5,'recognizable broad-to-narrow evergreen crown remains');
  // The original route stopped at the trunk, with this eye slice fully green.
  for(const y of [1.3,1.4,1.7])assert.equal(new Raycaster(new Vector3(23.38,y,16),new Vector3(1,0,0),0,2).intersectObject(crown,true).length,0);
 }
});
