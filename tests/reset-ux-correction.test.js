import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {LOCALES} from '../src/locale-data.js';import {createMarineLife} from '../src/marine.js';import {MARINE_PROFILES} from '../src/marine-visuals.js';
test('home feedback expires while paused and retained semantics render in the current language',()=>{
 const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),code=main.slice(main.indexOf('function renderHomeStatus(){'),main.indexOf('function refreshPause(){'));let language='en',next=0;const timers=new Map(),status={textContent:''};const scope={t:key=>LOCALES[language][key],$:()=>status,setTimeout:(fn,ms)=>{assert.equal(ms,4000);timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext("let homeStatusKey='',homeStatusTimer;"+code+';this.show=showHomeStatus;this.render=renderHomeStatus',scope);
 scope.show('home.arrived');for(language of ['en','fi','sv']){scope.render();assert.equal(status.textContent,LOCALES[language]['home.arrived']);}
 scope.show('home.chosen');assert.equal(timers.size,1,'old expiration cancelled');[...timers.values()][0]();assert.equal(status.textContent,'');language='fi';scope.render();assert.equal(status.textContent,'','expired feedback cannot revive on language change');
});
test('unfinished paid home protects its interior without reserving the exterior fish school',()=>{
 const floor={id:8,kind:'floor',gx:3,gz:23,baseY:-4.2,level:0,rotation:0,material:'wood'},north={...floor,id:11,kind:'wall'},built=[floor,{...floor,id:9,kind:'wall',gx:4,rotation:1},{...floor,id:10,kind:'wall',gz:24}];
 const life=createMarineLife({profiles:MARINE_PROFILES,buildings:built});for(const a of life.animals){a.x=1000;a.z=1000;}const fish=life.animals.find(a=>a.id==='fish:3');
 // Actual actor location from immutable candidate05 retained-save diagnosis.
 Object.assign(fish,{x:4.396,y:-2.828,z:43.590});assert.equal(life.overlapsBuilding(north),false,'exterior fish does not intersect the proposed wall or room');
 const before=[fish.x,fish.y,fish.z];life.setBuildings([...built,north]);assert.deepEqual([fish.x,fish.y,fish.z],before,'construction never relocates the animal');assert.ok(life.clearAt(fish,fish.x,fish.y,fish.z,false),'new boundary does not engulf exterior swimmer');
 Object.assign(fish,{x:6,y:-3,z:45});assert.equal(life.overlapsBuilding(north),true,'physical wall remains protected');assert.equal(life.clearAt(fish,fish.x,fish.y,fish.z,false),false,'installed physical wall blocks swimmer');
 fish.z=46;assert.equal(life.overlapsBuilding(north),true,'unfinished interior remains protected');assert.equal(life.clearAt(fish,fish.x,fish.y,fish.z,false),false);
 fish.y=3;assert.equal(life.overlapsBuilding(north),false,'vertically separate actor does not veto');
});

test('object-use target suppresses unrelated shovel and seed refusal while ground keeps guidance',()=>{
 const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf(' if(locked&&[0,1].includes(tool)){'),end=main.indexOf(' const p=target&&!target.outOfReach&&state.plots',start),code=main.slice(start,end);
 for(const tool of [0,1])for(const target of [{propId:1,gx:-5,gz:22,outOfReach:false},{gx:-5,gz:22,outOfReach:false},{gx:-5,gz:22,outOfReach:true}]){
  let calls=0;const nodes={targetLabel:{textContent:'stale ground refusal'},targetCue:{innerHTML:'stale cue',hidden:false}},check=()=>{calls++;return {ok:false,code:'message.removeToy'};};
  vm.runInNewContext(code,{locked:true,tool,target,state:{},seedKeys:['kelp'],seedIndex:0,validateDig:check,plantingResult:check,diggingActors:()=>[],t:key=>LOCALES.en[key],icon:key=>key,$:id=>nodes[id]});
  const ground=!target.propId&&!target.outOfReach;assert.equal(calls,ground?1:0);assert.equal(nodes.targetLabel.textContent,ground?LOCALES.en['message.removeToy']:'');assert.equal(nodes.targetCue.innerHTML,'');assert.equal(nodes.targetCue.hidden,true);
 }
});

test('far placement preview matches action reach before paid validity and connected success',()=>{
 const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),helper=main.slice(main.indexOf('function placementPreviewResult('),main.indexOf('function placementResult(')),detail=main.slice(main.indexOf('function renderSelectionDetail('),main.indexOf('function toast('));
 const ghost=main.slice(main.indexOf(' const valid=check.ok;'),main.indexOf(' for(const g of joinGhosts)g.visible='));
 for(const far of [false,true])for(const paidOk of [false,true]){
  let paidCalls=0,color;const nodes={selectedDetail:{textContent:''},selection:{dataset:{}}},candidate={kind:'pump',baseY:0,level:0},scope={target:{outOfReach:far},state:{plots:{}},camera:{position:{y:1.7}},farTargetHint:()=> 'target.closer',placementResult:()=>{paidCalls++;return {ok:paidOk,code:paidOk?'message.place':'message.needMaterial',params:{count:8,material:'copper'}};}};
  vm.runInNewContext(helper+';this.check=placementPreviewResult({});',scope);assert.equal(paidCalls,far?0:1);assert.equal(scope.check.ok,!far&&paidOk);if(far)assert.equal(scope.check.code,'target.closer');
  Object.assign(scope,{locked:true,lastFailure:null,elapsed:0,tool:5,placementQuery:{candidate,validation:scope.check,connection:'water.connected'},i18n:{message:r=>LOCALES.en[r.code]},t:key=>LOCALES.en[key],DELIGHTS:{pump:{cost:8,material:'copper'}},PIECES:{},pieceKeys:['pump'],pieceIndex:0,isToy:()=>true,MATERIALS:['copper'],materialIndex:0,selectionDetail:'',b:candidate,baseOf:b=>b.baseY,tileOutline:{position:{}},preview:{traverse:fn=>fn({isMesh:true,material:{color:{set:c=>color=c}}})},$:id=>nodes[id]});
  vm.runInNewContext(detail+';renderSelectionDetail();'+ghost.trim().replace(/}}$/,''),scope);
  assert.equal(color,scope.check.ok?'#d8f5a5':'#f49471');assert.equal(nodes.selectedDetail.textContent.includes(LOCALES.en['water.connected']),scope.check.ok);if(far)assert.equal(nodes.selectedDetail.textContent,LOCALES.en['target.closer']);
 }
 assert.ok(main.includes('const check=placementPreviewResult(b);placementQuery='));assert.ok(main.includes("if(!target||target.outOfReach){failure({code:target?farTargetHint("),'action reach gate unchanged');
});
