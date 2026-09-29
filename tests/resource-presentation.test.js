import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Box3,Vector3,Matrix4} from 'three';
import {freshState,harvestWild,serialize} from '../src/state.js';
import {WILD_RESOURCES,nearbyResources} from '../src/world-data.js';
import {fullResourceCandidates,createResourceHorizon,nearCoverBounds} from '../src/resource-horizon.js';

test('distant legacy resources keep domain identity while full models and far silhouettes are bounded',()=>{
 const state=freshState(),before=serialize(state);
 assert.deepEqual(fullResourceCandidates(state,0,9).filter(r=>!r.id.startsWith('w1:')).map(r=>r.id),WILD_RESOURCES.filter(r=>!state.wildRemoved.includes(r.id)).map(r=>r.id));
 const west=fullResourceCandidates(state,-62,-8);
 assert.ok(west.filter(r=>!r.id.startsWith('w1:')).every(r=>Math.hypot(r.gx*2+62,r.gz*2+8)<=48));
 assert.ok(west.length<WILD_RESOURCES.length);
 assert.equal(nearbyResources(state,-62,-8,32).filter(r=>!r.id.startsWith('w1:')).length,WILD_RESOURCES.filter(r=>!state.wildRemoved.includes(r.id)).length);
 const horizon=createResourceHorizon(new Scene()),full=new Set(west.map(r=>r.id));horizon.update(state,-62,-8,full);
 const first=horizon.snapshot();assert.ok(first.count<=48);assert.ok(first.ids.some(id=>!id.startsWith('w1:')));assert.ok(first.ids.every(id=>!full.has(id)));assert.equal(serialize(state),before);
 const removed=first.ids.find(id=>!id.startsWith('w1:')&&!id.startsWith('plot:'));assert.ok(harvestWild(state,removed).ok);horizon.update(state,-62,-8,full);assert.ok(!horizon.snapshot().ids.includes(removed));
});
test('legacy cover cells stay fully present from arrival but far half is omitted from western clearing',()=>{
 let west=0;for(let x=-26;x<26;x+=13)for(let z=-26;z<26;z+=13){const b=new Box3(new Vector3(x-.3,0,z-.3),new Vector3(x+13.3,.6,z+13.3));assert.ok(nearCoverBounds(b,0,9));if(nearCoverBounds(b,-62,-8))west++;}assert.ok(west>0&&west<16);
});

test('distant paid trees retain growth-sized silhouettes without changing the paid world',()=>{
 const state=freshState(),before=serialize(state),horizon=createResourceHorizon(new Scene());horizon.update(state,-62,-8,new Set());assert.ok(horizon.snapshot().ids.some(id=>id.startsWith('plot:')));assert.equal(serialize(state),before);
});

test('scaled planted silhouette stems rest on the ground',()=>{
 const state=freshState();state.plots={'0,0':{gx:0,gz:0,baseY:.6,phase:'filled',seed:'oak',growth:.25,water:1,variation:0}};
 const scene=new Scene(),horizon=createResourceHorizon(scene);horizon.update(state,60,0,new Set());
 const at=horizon.snapshot().ids.indexOf('plot:0,0');assert.ok(at>=0);
 const mesh=scene.getObjectByName('resource-horizon:oak'),matrix=new Matrix4();
 let found=false;for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);if(Math.abs(matrix.elements[12])+Math.abs(matrix.elements[14])<1e-8){found=true;assert.ok(Math.abs(matrix.elements[13]-.6)<1e-6);assert.ok(Math.abs(matrix.elements[0]-.25)<1e-6);}}
 assert.ok(found,'the planted oak uses its sampled root and growth scale');
});
