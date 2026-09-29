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
