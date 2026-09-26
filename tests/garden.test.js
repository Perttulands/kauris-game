import test from 'node:test';import assert from 'node:assert/strict';
import {freshState,plant,dig,fill,serialize,deserialize,validateBuild} from '../src/state.js';
import {DISCOVERIES,discover,seedUnlocked,setOutfit,gardenAttractors} from '../src/garden.js';
import {reconcileResidents} from '../src/residents.js';
test('eight starters; locked seeds are authoritative, each discovery records once without money',()=>{
 const s=freshState();assert.equal(Object.keys(s.plots).length,8);dig(s,0,0);assert.equal(plant(s,0,0,'golden').ok,false);const before={...s.inventory};
 assert.equal(discover(s,'old-hollow').newSeed,true);assert.equal(discover(s,'old-hollow').ok,false);assert.equal(discover(s,'star-grotto').newSeed,false);assert.deepEqual(s.inventory,before);assert.equal(s.discoveries.length,2);assert.ok(plant(s,0,0,'golden').ok);assert.deepEqual(deserialize(serialize(s)),s);
});
test('variation survives reload and old plants receive stable variation',()=>{
 const s=freshState();dig(s,0,0);plant(s,0,0,'birch');fill(s,0,0);const v=s.plots['0,0'].variation;assert.equal(deserialize(serialize(s)).plots['0,0'].variation,v);
 delete s.plots['0,0'].variation;const a=deserialize(serialize(s)),b=deserialize(serialize(s));assert.equal(a.plots['0,0'].variation,b.plots['0,0'].variation);a.plots['0,0'].variation=20;assert.throws(()=>deserialize(serialize(a)));
});
test('round1 paid houses/player win over discoveries; suppression and gifts are idempotent',()=>{
 const s=freshState();delete s.contentRevision;delete s.discoveryHidden;delete s.discoveries;delete s.unlockedSeeds;
 s.buildings=[{id:1,kind:'floor',material:'wood',cost:2,gx:0,gz:-9,rotation:0,level:0}];s.nextId=2;s.inventory.wood-=2;s.player.x=23;s.player.z=0;const before=structuredClone(s),a=deserialize(serialize(s));
 assert.deepEqual(a.buildings,before.buildings.map(b=>({...b,baseY:0})));assert.deepEqual(a.inventory,before.inventory);assert.deepEqual(a.wildRemoved,before.wildRemoved);assert.deepEqual(a.player,before.player);assert.ok(a.discoveryHidden.includes('old-hollow'));assert.ok(a.discoveryHidden.includes('star-grotto'));assert.ok(seedUnlocked(a,'golden'));assert.deepEqual(deserialize(serialize(a)),a);
 const d=DISCOVERIES[0];assert.equal(dig(a,Math.round(d.x/2),Math.round(d.z/2)).ok,false);assert.equal(validateBuild(a,{gx:-5,gz:9,kind:'floor',material:'wood',level:0,rotation:0}).ok,false);
});
test('outfit persists per identity without changing other residents; malformed palette rejected',()=>{
 const s=freshState();const house=gx=>[{kind:'roof',gx,gz:0,level:1,rotation:0},...[0,1,2,3].map(rotation=>({kind:rotation===0?'door':'wall',gx,gz:0,level:0,rotation}))];
 const homes={buildings:[...house(0),...house(3)],residents:[]};reconcileResidents(homes);s.residents=homes.residents;assert.ok(setOutfit(s,1,3).ok);assert.equal(s.residents[1].outfit,0);assert.equal(deserialize(serialize(s)).residents[0].outfit,3);assert.equal(setOutfit(s,1,8).ok,false);s.residents[0].outfit=-1;assert.throws(()=>deserialize(serialize(s)));
});
test('garden attraction responds to flowering and mature cultivated plants only',()=>{
 const s=freshState();s.plots={};dig(s,0,0);plant(s,0,0,'flowers');fill(s,0,0);assert.equal(gardenAttractors(s).flowers.length,0);s.plots['0,0'].growth=.6;assert.equal(gardenAttractors(s).flowers.length,1);
 dig(s,1,0);plant(s,1,0,'oak');fill(s,1,0);s.plots['1,0'].growth=.7;assert.equal(gardenAttractors(s).leafy.length,1);assert.equal(gardenAttractors(s).trees.length,0);s.plots['1,0'].growth=1;assert.equal(gardenAttractors(s).trees.length,1);
});
test('denied storage and unavailable audio never prevent play or mute controls',async()=>{
 const {createAudio}=await import('../src/audio.js');const audio=createAudio({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});assert.doesNotThrow(()=>{audio.start();audio.play('dig');audio.pause();audio.toggle();});assert.equal(audio.muted,true);
});
