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
test('held chop has multiple impacts, cancels cleanly, and cannot complete twice',()=>{
 const c={};let hits=0;
 for(let i=0;i<9;i++){const r=advanceChop(c,'a',.1);hits+=r.impact;assert.equal(r.complete,false);}assert.equal(hits,1);
 advanceChop(c,null,0);assert.equal(c.elapsed,0);advanceChop(c,'a',.1);advanceChop(c,'b',.1);assert.equal(c.elapsed,.1);
 let complete=0;for(let i=0;i<30;i++)complete+=advanceChop(c,'b',.1).complete;assert.equal(complete,1);
});
test('wild occupancy releases after exact one-time yield and survives reload',()=>{
 const s=freshState(),r=liveWild(s).find(x=>x.kind==='oak'),before=s.inventory.wood;
 assert.equal(dig(s,r.gx,r.gz).ok,false);
 const piece={gx:r.gx,gz:r.gz,kind:'floor',material:'wood',level:0,rotation:0};assert.equal(validateBuild(s,piece).ok,false);
 assert.equal(harvestWild(s,r.id).amount,18);assert.equal(harvestWild(s,r.id).ok,false);assert.equal(s.inventory.wood,before+18);
 const saved=deserialize(serialize(s));assert.ok(!liveWild(saved).some(x=>x.id===r.id));assert.equal(saved.inventory.wood,before+18);assert.ok(build(saved,piece).ok);
});
test('legacy migration preserves paid house and player; hides overlapping new world',()=>{
 const s=freshState(),r=WILD_RESOURCES[0];s.wildRemoved=WILD_RESOURCES.map(x=>x.id);s.worldHidden=['windmill'];
 const floor={gx:r.gx,gz:r.gz,kind:'floor',material:'wood',level:0,rotation:0};assert.ok(build(s,floor).ok);assert.ok(build(s,{...floor,kind:'door'}).ok);
 s.player={x:-18,z:-20,yaw:1,pitch:0};const expected=structuredClone(s);delete s.wildRemoved;delete s.worldHidden;
 const migrated=deserialize(serialize(s));assert.deepEqual(migrated.buildings,expected.buildings);assert.deepEqual(migrated.inventory,expected.inventory);assert.deepEqual(migrated.player,{...s.player,y:0});
 assert.ok(migrated.wildRemoved.includes(r.id));assert.ok(migrated.worldHidden.includes(WORLD_OBSTACLES[0].id));
 assert.deepEqual(deserialize(serialize(migrated)),migrated);
});
test('new save does not silently deplete a live tree merely by reloading nearby',()=>{
 const s=freshState(),r=liveWild(s)[0];s.player.x=r.gx*2+.9;s.player.z=r.gz*2;
 assert.deepEqual(deserialize(serialize(s)),s);
 const bad=JSON.parse(serialize(s));bad.wildRemoved='all';assert.throws(()=>deserialize(JSON.stringify(bad)));
});
