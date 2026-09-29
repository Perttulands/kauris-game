import test from 'node:test';
import assert from 'node:assert/strict';
import {surfaceAt,sampleCell} from '../src/surface-grid.js';
test('ordinary coast return crosses x77 at z-30.118 without a jump or enlarged step allowance',()=>{
 let x=77.00016082494133,feet=surfaceAt({},x,-30.118740392091375).floor;
 for(let n=0;n<24;n++){const next=x-.1,floor=surfaceAt({},next,-30.118740392091375).floor;assert.ok(floor<=feet+.31,`blocked x${next}: feet${feet} floor${floor}`);x=next;feet=floor;}
 assert.ok(x<75);
});
test('coastal inland join has no hidden multi-step cliff around the initial island',()=>{
 for(let gz=-72;gz<20;gz++)for(let gx=-49;gx<49;gx++){
  const a=sampleCell(gx,gz);
  for(const [dx,dz] of [[1,0],[0,1]]){const b=sampleCell(gx+dx,gz+dz);
   if(a.shoreDistance<9||a.shoreDistance>22||b.shoreDistance<9||b.shoreDistance>22)continue;
   assert.ok(Math.abs(a.height-b.height)<=.300001,`coast seam ${gx},${gz} -> ${gx+dx},${gz+dz}: ${a.height}/${b.height}`);
  }
 }
});
