import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {advanceChop} from '../src/interaction.js';
import {freshState,harvestWild,harvest,liveWild,serialize,deserialize,SEEDS} from '../src/state.js';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function setup(plot=false,flower=false){
 const state=freshState(),r=liveWild(state).find(r=>flower?r.kind==='flowers':r.kind==='oak')??liveWild(state).find(r=>r.kind==='oak');
 const handlers={},target={gx:r.gx,gz:r.gz,baseY:r.baseY,...(plot?{}:{wildId:r.id})};
 if(plot)state.plots[r.gx+','+r.gz]={gx:r.gx,gz:r.gz,baseY:r.baseY,phase:'filled',seed:flower?'flowers':'oak',growth:1,water:1};
 const c={state,target,tool:4,locked:true,held:false,rightDrag:false,chop:{},chopProgress:0,totalImpacts:0,swing:0,now:0,yields:0,errors:[],SEEDS,
 performance:{now:()=>c.now*1000},cellKey:(x,z)=>x+','+z,resourceRecord:id=>liveWild(state).find(r=>r.id===id),
 isFlower:k=>k==='flowers',audio:{start(){},play(){},setContinuous(){}},movementAudio:{reset(){}},wheelStep(){},wheel:{},
 canvas:{addEventListener:(k,fn)=>handlers[k]=fn},document:{activeElement:null,addEventListener:(k,fn)=>handlers[k]=fn},
 advanceChop,burst(){},failure:r=>c.errors.push(r.code),menuReading:null,
 scene:{updateMatrixWorld(){}},camera:{position:{set(){}},rotation:{set(){}},updateMatrixWorld(){}},pos:{x:0,z:0},feet:0,pitch:0,yaw:0,pick(){},
 delights:{use(){c.used=true;}},dirty:false,save(){},chooseTool:i=>c.tool=i,
 finishHarvest(){const result=c.target.wildId?harvestWild(state,c.target.wildId):harvest(state,c.target.gx,c.target.gz);if(result.ok)c.yields++;},
 };
 vm.createContext(c);
 for(const [start,end] of [['function releaseActions()','function chooseTool('],['function updateChopping(','function finishHarvest('],['function act(){','function layoutContextActions(']]){
  let text=source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
  if(start==='function releaseActions()')text=text.split('\n').slice(0,2).join('\n');
  vm.runInContext(text,c);
 }
 vm.runInContext(source.split('\n').find(l=>l.startsWith("canvas.addEventListener('mousedown'")),c);
 return {c,down:()=>handlers.mousedown({button:0}),up:()=>handlers.mouseup({button:0}),frame:()=>c.updateChopping()};
}
test('real mouse press/release between frames harvests wild and grown resources once',()=>{
 for(const plot of [false,true]){
  const {c,down,up,frame}=setup(plot),before=c.state.inventory.wood;
  for(const time of [0,.6,1.2]){c.now=time;down();up();frame();}
  assert.equal(c.yields,1);assert.equal(c.totalImpacts,3);assert.equal(c.state.inventory.wood,before+18);
  c.now=2;down();up();frame();assert.equal(c.yields,1);
  assert.equal(deserialize(serialize(c.state)).inventory.wood,before+18);
 }
});
test('hold and mixed tap/hold share cadence; release idle never awards',()=>{
 for(const mixed of [false,true]){
  const {c,down,up,frame}=setup();down();
  if(mixed){up();c.now=.1;down();}
  for(let i=1;i<=20;i++){c.now=i*.1;frame();}
  assert.equal(c.yields,1);assert.equal(c.totalImpacts,3);
 }
 const {c,down,up,frame}=setup();down();up();c.now=30;frame();assert.equal(c.yields,0);assert.equal(c.totalImpacts,1);
});
test('actual reset, invalid targets and prop priority clear chop progress',()=>{
 for(const change of [c=>c.target=null,c=>c.target.outOfReach=true,c=>c.tool=3,c=>c.locked=false,c=>c.target={gx:0,gz:0},c=>c.target={gx:0,gz:0,propId:42}]){
  const {c,down,up,frame}=setup();down();up();change(c);frame();assert.equal(c.chop.key,null);assert.equal(c.yields,0);
 }
 const {c,down,up,frame}=setup();down();up();c.resetActions();assert.equal(c.chop.key,null);
 c.state.delights.push({id:42,kind:'bell'});c.target={gx:0,gz:0,propId:42};down();frame();assert.equal(c.used,true);assert.equal(c.yields,0);
});
test('one-pick flower and immature planted target use the real press path',()=>{
 const {c,down,up}=setup(true,true);down();up();assert.equal(c.yields,1);assert.equal(c.totalImpacts,1);
 const p=setup(true);p.c.state.plots[p.c.target.gx+','+p.c.target.gz].growth=.2;p.down();p.up();assert.equal(p.c.yields,0);assert.equal(p.c.chop.key,null);
});
