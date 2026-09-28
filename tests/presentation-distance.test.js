import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {showPresentation,nearPresentation,actorViewDistance} from '../src/presentation-distance.js';
test('distance presentation preserves actor visit visibility, poses and interactive near range',()=>{
 const actor=new Group(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial());actor.add(mesh);actor.position.z=-3;actor.visible=true;actor.updateMatrixWorld(true);const ray=new Raycaster(new Vector3(),new Vector3(0,0,-1));
 assert.ok(nearPresentation(actor,0,0,actorViewDistance('bird')));assert.equal(ray.intersectObject(actor,true).length,2);
 showPresentation(actor,false);assert.equal(actor.visible,true);assert.equal(actor.position.z,-3);assert.equal(ray.intersectObject(actor,true).length,0);
 showPresentation(actor,true);assert.equal(actor.visible,true);assert.equal(ray.intersectObject(actor,true).length,2);
 for(const kind of ['butterfly','bee','grub','bird','deer','fish','crab','turtle','octopus','starfish','anemone'])assert.ok(actorViewDistance(kind)>12);
});
