import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,deserialize,serialize,harvestWild,liveWild,dig,build,validateBuild} from '../src/state.js';
import {WILD_RESOURCES,WORLD_OBSTACLES} from '../src/world-data.js';
import {advanceChop,wheelStep} from '../src/interaction.js';
test('wheel accumulates small deltas, throttles big bursts, and leaves menus alone',()=>{
 const w={};for(let i=0;i<4;i++)assert.equal(wheelStep(w,8,0,i*20,true),0);
 assert.equal(wheelStep(w,8,0,80,true),1);assert.equal(wheelStep(w,400,0,100,true),0);
 assert.equal(wheelStep(w,-3,1,300,true),-1);assert.equal(wheelStep(w,300,0,500,false),0);
 assert.equal(wheelStep(w,8,0,600,true),0);assert.equal(wheelStep(w,-100,0,620,true),-1);
});
test('chop shares a strike cadence and cancellation cannot bypass it',()=>{
 const c={};let hits=0,complete=0;
 for(let i=0;i<30;i++){const r=advanceChop(c,'a',i*.1,1.8,{held:true});hits+=r.impact;complete+=r.complete;}
 assert.equal(hits,3);assert.equal(complete,1);
 advanceChop(c,null,3);assert.equal(c.elapsed,0);
 assert.equal(advanceChop(c,'b',3,1.8,{press:true}).impact,true);
 advanceChop(c,null,3.1);
 assert.equal(advanceChop(c,'c',3.1,1.8,{press:true}).impact,false);
 assert.equal(advanceChop(c,'c',3.6,1.8,{press:true}).impact,true);
});
test('wild occupancy releases after exact one-time yield and survives reload',()=>{
 const s=freshState(),r=liveWild(s).find(x=>x.kind==='oak'),before=s.inventory.wood;
 assert.equal(dig(s,r.gx,r.gz).ok,false);
 const piece={gx:r.gx,gz:r.gz,kind:'floor',material:'wood',level:0,rotation:0};assert.equal(validateBuild(s,piece).ok,false);
 assert.equal(harvestWild(s,r.id).amount,18);assert.equal(harvestWild(s,r.id).ok,false);assert.equal(s.inventory.wood,before+18);
 const saved=deserialize(serialize(s));assert.ok(!liveWild(saved).some(x=>x.id===r.id));assert.equal(saved.inventory.wood,before+18);assert.ok(build(saved,piece).ok);
});
test('reset saves preserve earned paid pieces and reject legacy migration',()=>{
 const s=freshState(),r=liveWild(s).find(r=>r.kind==='oak');
 assert.equal(harvestWild(s,r.id).amount,18);
 const floor={gx:r.gx,gz:r.gz,baseY:r.baseY,kind:'floor',material:'wood',level:0,rotation:0};
 assert.ok(build(s,floor).ok);assert.ok(build(s,{...floor,kind:'door'}).ok);
 const loaded=deserialize(serialize(s));assert.deepEqual(loaded.buildings,s.buildings);assert.deepEqual(loaded.inventory,s.inventory);
 assert.ok(loaded.wildRemoved.includes(r.id));assert.deepEqual(loaded.player,s.player);
 assert.throws(()=>deserialize(JSON.stringify({...s,version:1})),/Unsupported save/);
 const missing=structuredClone(s);delete missing.wildRemoved;assert.throws(()=>deserialize(JSON.stringify(missing)),/Invalid world record/);
});
test('new save does not silently deplete a live tree merely by reloading nearby',()=>{
 const s=freshState(),r=liveWild(s)[0];s.player.x=r.gx*2+.9;s.player.z=r.gz*2;
 assert.deepEqual(deserialize(serialize(s)),s);
 const bad=JSON.parse(serialize(s));bad.wildRemoved='all';assert.throws(()=>deserialize(JSON.stringify(bad)));
});
