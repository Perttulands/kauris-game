import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWorldSession} from '../src/world-session.js';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('actual main async save clears dirty only for matching successful snapshot; failures retain current',async()=>{
 let finish,fail=false,calls=0;const statuses=[];
 const scope={dirty:true,worldError:e=>statuses.push(e.message),state:{inventory:{wood:1}},pos:{x:2,z:3},feet:4,yaw:.2,pitch:.1,serialize:JSON.stringify};
 vm.createContext(scope);
 vm.runInContext(main.slice(main.indexOf('function worldSnapshot()'),main.indexOf('\nfunction worldError')),scope);
 scope.worldSession=createWorldSession({initial:{id:'A',revision:1,raw:'old'},capture:()=>scope.worldSnapshot(),library:{async save(token,raw){
  calls++;await new Promise(r=>finish=r);if(fail)throw new Error('quota');return {...token,raw,revision:token.revision+1};
 }}});
 vm.runInContext(main.slice(main.indexOf('async function save('),main.indexOf('\nfunction sync(){')),scope);
 const first=scope.save();await new Promise(r=>setImmediate(r));scope.state.inventory.wood=2;finish();assert.equal(await first,false);assert.equal(scope.dirty,true);
 assert.equal(scope.state.player.x,2);
 const second=scope.save();await new Promise(r=>setImmediate(r));finish();assert.equal(await second,true);assert.equal(scope.dirty,false);
 scope.dirty=true;scope.state.inventory.wood=3;fail=true;const third=scope.save();await new Promise(r=>setImmediate(r));finish();assert.equal(await third,false);assert.equal(scope.dirty,true);
 assert.equal(JSON.parse(scope.worldSession.current.raw).inventory.wood,2);assert.deepEqual(statuses,['quota']);assert.equal(calls,3);
});

test('actual main save feedback stays visible in welcome/pause as well as HUD for every locale',async()=>{
 const {createI18n}=await import('../src/i18n.js');
 for(const language of ['fi','sv','en']){
  const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{textContent:'',dataset:{}});return elements.get(id);};
  const i18n=createI18n({languages:[language]});
  const scope={$,t:i18n.t,worldSession:{current:{name:'A <tree>'}}};vm.createContext(scope);
  vm.runInContext(main.slice(main.indexOf('function worldIdentity()'),main.indexOf('async function save(')),scope);
  for(const key of ['worlds.saving','worlds.conflict','worlds.unavailable','worlds.saved']){
   scope.saveStatus(key);
   assert.equal($('welcomeSaveStatus').textContent,i18n.t(key));assert.equal($('saveStatus').textContent,i18n.t(key));
   assert.equal($('welcomeSaveStatus').dataset.warning,String(['worlds.conflict','worlds.unavailable'].includes(key)));
   assert.equal($('welcomeWorld').textContent,i18n.t('worlds.active',{name:'A <tree>'}));
  }
 }
});
