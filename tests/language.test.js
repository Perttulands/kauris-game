import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCALES} from '../src/locale-data.js';
import {chooseLanguage,createI18n,LANGUAGE_KEY} from '../src/i18n.js';
import {nearestReading,createReadingFocus} from '../src/reading.js';
import {freshState,dig,plant,fill,water,harvest,build,remove,validateBuild,serialize,deserialize,SEEDS} from '../src/state.js';

test('complete locale schemas retain placeholders and separate mineral species from materials',()=>{
 const keys=Object.keys(LOCALES.en).sort(),slots=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
 for(const [locale,dict] of Object.entries(LOCALES)){
  assert.deepEqual(Object.keys(dict).sort(),keys);
  for(const key of keys){assert.ok(dict[key].trim(),`${locale}:${key}`);assert.deepEqual(slots(dict[key]),slots(LOCALES.en[key]),key);assert.ok(!/[<>]/.test(dict[key]));}
  for(const kind of Object.keys(SEEDS))assert.ok(dict['tree.'+kind]);
  for(const material of ['diamond','copper','iron'])assert.notEqual(dict['tree.'+material],dict['material.'+material]);
 }
 assert.equal(LOCALES.fi['tree.pine'].toLocaleUpperCase('fi'),'MÄNTY');assert.equal(LOCALES.sv['tree.diamond'].toLocaleUpperCase('sv'),'DIAMANTTRÄD');
});
test('preference is independent of saves, regional browser fallback, immediate switching and storage failure',()=>{
 assert.equal(chooseLanguage('sv',['fi-FI']),'sv');assert.equal(chooseLanguage('bad',['de','fi-FI']),'fi');assert.equal(chooseLanguage(null,['sv-SE']),'sv');assert.equal(chooseLanguage(null,['fr']),'en');
 const save=serialize(freshState()),data=new Map([['kauris-meadow-v1',save]]),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const ui=createI18n({storage,languages:['en-US']});ui.set('fi');assert.equal(data.get(LANGUAGE_KEY),'fi');assert.equal(createI18n({storage}).language,'fi');assert.equal(data.get('kauris-meadow-v1'),save);assert.deepEqual(deserialize(save).inventory,freshState().inventory);
 assert.throws(()=>ui.t('missing'));assert.throws(()=>ui.t('ui.buildCost'));assert.equal(ui.set('xx'),false);assert.equal(ui.language,'fi');
 assert.equal(createI18n().set('fi'),false);
 const denied=createI18n({storage:{getItem(){throw Error();},setItem(){throw Error();}},languages:['sv']});assert.equal(denied.set('fi'),false);assert.equal(denied.language,'fi');assert.ok(denied.t('ui.play'));
});
test('domain results carry semantic codes and localized parameters without changing accounting',()=>{
 const state=freshState(),results=[dig(state,0,0),plant(state,0,0,'pine'),fill(state,0,0),water(state,0,0,.1),harvest(state,0,0),dig(state,99,0)];
 const b={gx:2,gz:2,kind:'floor',material:'wood',rotation:0,level:0};results.push(build(state,b),validateBuild(state,b),remove(state,state.buildings.at(-1).id));assert.equal(state.inventory.wood,36);
 for(const locale of ['fi','sv','en']){const ui=createI18n({languages:[locale]});for(const result of results){assert.ok(result.code);assert.ok(ui.message(result));assert.ok(!/undefined|\{\w+\}/.test(ui.message(result)));}}
});
test('reading selection is ranged, occluded, stable and clears obsolete targets without mutating the hit list',()=>{
 const pine={id:'tree1',key:'tree.pine'},deer={id:'deer1',key:'animal.deer'};
 assert.equal(nearestReading([{distance:5,semantic:pine},{distance:3,opaque:true}]),null);
 assert.equal(nearestReading([{distance:13,semantic:pine}]),null);
 assert.equal(nearestReading([{distance:1,opaque:false},{distance:5,semantic:pine}]),pine);
 const focus=createReadingFocus();assert.equal(focus.update(pine,0),null);assert.equal(focus.update(pine,121),pine);assert.equal(focus.update(deer,130),null);assert.equal(focus.update(null,150),null);assert.equal(focus.current,null);const hits=Object.freeze([Object.freeze({distance:5,semantic:pine}),Object.freeze({distance:2,semantic:deer})]);assert.equal(nearestReading(hits),deer);assert.equal(hits[0].semantic,pine);
});
