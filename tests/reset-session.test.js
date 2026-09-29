import test from 'node:test';
import assert from 'node:assert/strict';
import {createWaterAudio,createMovementAudio,stepSurface} from '../src/audio-cues.js';
test('water audio measures wet squares, keeps bridge proximity and blends camera depth',()=>{
 let samples=0;
 const query=createWaterAudio((gx,gz)=>{samples++;return {gx,gz,waterY:gx===-2&&gz===0?-1.8:null};});
 assert.deepEqual(query(0,0,0),{waterDistance:3,submersion:0});
 const count=samples;assert.equal(query(.5,0,0).waterDistance,3.5);assert.equal(samples,count);
 assert.equal(query(-4,3,0).waterDistance,0,'bridge height does not move shoreline');
 assert.equal(query(-4,-1.6,0).submersion,0);
 assert.ok(Math.abs(query(-4,-1.8,0).submersion-.5)<1e-8);
 assert.ok(Math.abs(query(-4,-2,0).submersion-1)<1e-8);
 assert.equal(query(100,0,100).waterDistance,32);assert.ok(samples<=4*1225);
});
test('footfall accumulation excludes stationary, airborne and swim distance with no catch-up',()=>{
 const events=[],a=createMovementAudio((...args)=>events.push(args)),move=(o={})=>a.update({distance:0,grounded:true,swimming:false,input:true,options:{},...o});
 move({distance:2});move();assert.equal(events.length,0);
 move({distance:1,grounded:false});move({distance:.5});assert.equal(events.length,0);
 move({distance:1.9});assert.equal(events.length,1);assert.equal(events[0][0],'step');
 a.reset();move({distance:20});assert.equal(events.length,2);move();assert.equal(events.length,2);
 move({distance:5,swimming:true,input:false});assert.equal(events.length,2);
 move({distance:3,swimming:true});assert.equal(events.at(-1)[0],'swim');
 move({distance:.5});assert.equal(events.length,3,'swim distance cannot trigger a landing step');
});
test('foot material follows actual deck height and preserves metal/wood distinction',()=>{
 const buildings=[{kind:'floor',gx:0,gz:0,baseY:0,level:0,material:'wood'},{kind:'floor',gx:0,gz:0,baseY:0,level:1,material:'copper'}];
 assert.deepEqual(stepSurface(buildings,0,0,2.55),{material:'copper',surface:'rock'});
 assert.deepEqual(stepSurface(buildings,0,0,.15),{material:'wood',surface:'wood'});
 assert.deepEqual(stepSurface(buildings,0,0,0),{surface:'soil'});
});
