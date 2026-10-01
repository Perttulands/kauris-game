import test from 'node:test';
import assert from 'node:assert/strict';
import {residentOutingTargets} from '../src/resident-outing-targets.js';
const resident={door:{x:0,z:0,nx:0,nz:1},baseY:0,habitat:'land'};
test('outing suggestions use real plant clearance and safe dry shore positions',()=>{
 const state={plots:{a:{gx:2,gz:0,baseY:0,phase:'filled',seed:'kelp',growth:1}}};
 const surface=(x,z)=>({waterY:z>=2?-.2:null}),canStand=(x,z)=>z<2&&x>=0;
 const targets=residentOutingTargets(state,resident,{surface,canStand});
 assert.ok(targets.some(p=>p.kind==='plant'));assert.ok(targets.some(p=>p.kind==='shore'));assert.ok(targets.length<=8);
 for(const p of targets){assert.ok(canStand(p.x,p.z));assert.ok(Math.hypot(p.x,p.z+.95)<9);if(p.kind==='shore'){assert.equal(surface(p.x,p.z).waterY,null);assert.notEqual(surface(p.lookAt.x,p.lookAt.z).waterY,null);}}
 assert.ok(targets.filter(p=>p.kind==='plant').every(p=>Math.hypot(p.x-4,p.z)>=1.2-1e-8));
 assert.deepEqual(residentOutingTargets(state,resident,{surface,canStand:()=>false}),[]);
});
test('empty holes and tiny seedlings are not outing destinations; blocked water stays excluded',()=>{
 const state={plots:{a:{gx:1,gz:0,phase:'hole',seed:'oak',growth:0},b:{gx:2,gz:0,phase:'filled',seed:'oak',growth:.1}}};
 assert.deepEqual(residentOutingTargets(state,resident,{surface:()=>({waterY:null}),canStand:()=>true}),[]);
 const targets=residentOutingTargets({plots:{}},{...resident,habitat:'ocean'},{surface:(x,z)=>({waterY:z>=0?-.2:null}),canStand:(x,z)=>z>=0});
 assert.ok(targets.length);assert.ok(targets.every(p=>p.z>=0));
});
