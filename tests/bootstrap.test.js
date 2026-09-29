import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createI18n,LANGUAGES,LANGUAGE_KEY} from '../src/i18n.js';

// Exercise the actual bootstrap lifecycle without loading Three or starting a browser.
// Runtime initialization replaces the provisional DOM handlers before calling done().
test('bootstrap completion preserves runtime locale handlers and queued Play',async()=>{
 const elements=new Map(),get=id=>{
  if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,
   setAttribute(){},click(){this.onclick?.();}});
  return elements.get(id);
 };
 const selectors=[get('welcomeLanguage'),get('bookLanguage')],label={dataset:{i18n:'ui.play'},textContent:''};
 const save='unchanged paid world',values=new Map([['kauris-meadow-v1',save]]);
 const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const document={documentElement:{lang:''},getElementById:get,querySelectorAll:s=>s==='.languageSelect'?selectors:s==='[data-i18n]'?[label]:[]};
 const window={};
 const source=readFileSync(new URL('../src/bootstrap.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{window,document,localStorage:storage,navigator:{languages:['en']},createI18n,LANGUAGES,icon:()=>'',requestAnimationFrame(){},queueMicrotask,console});
 selectors[0].value='fi';selectors[0].onchange();
 assert.equal(window.kaurisBoot.i18n.language,'fi');assert.equal(document.documentElement.lang,'fi');
 get('start').click(); // A click during preparation must reach the replacement runtime handler once.
 let starts=0,changes=0;get('start').onclick=()=>starts++;
 const handlers=selectors.map(select=>select.onchange=()=>{changes++;window.kaurisBoot.i18n.set(select.value);document.documentElement.lang=window.kaurisBoot.i18n.language;label.textContent=window.kaurisBoot.i18n.t('ui.play');});
 window.kaurisBoot.done();await Promise.resolve();
 assert.equal(starts,1);assert.equal(window.kaurisBoot.ready,true);assert.equal(get('bootStatus').hidden,true);
 for(const [index,select] of selectors.entries()){
  assert.equal(select.onchange,handlers[index],'bootstrap must not erase runtime locale ownership');
  for(const language of ['sv','fi','en']){
   select.value=language;select.onchange();
   assert.equal(window.kaurisBoot.i18n.language,language);assert.equal(document.documentElement.lang,language);
   assert.equal(label.textContent,window.kaurisBoot.i18n.t('ui.play'));
   assert.equal(createI18n({storage}).language,language);assert.equal(values.get(LANGUAGE_KEY),language);
   assert.equal(values.get('kauris-meadow-v1'),save);
  }
 }
 assert.equal(changes,6);
});
