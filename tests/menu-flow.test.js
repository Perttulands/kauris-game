import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function fixture({started=true,fallbackLook=true}={}){
 const listeners={},elements=new Map();
 const doc={activeElement:null,pointerLockElement:null,exitPointerLock(){this.pointerLockElement=null;},addEventListener(k,fn){listeners[k]=fn;}};
 function element(id){if(!elements.has(id))elements.set(id,{id,hidden:true,dataset:{},scrollTop:0,closest(){return null},focus(){doc.activeElement=this;},blur(){doc.activeElement=null;},querySelector(){return element('chosen');}});return elements.get(id);}
 const scope={worldSession:{current:{id:'test'}},worldsOpen:false,document:doc,$:element,audio:{pause(){},start(){}},clearReading(){},clearEffects(){},resetActions(){},renderCatalog(){},refreshPause(){},wake(){},save(){},saveStatus(){},toast(){},canvas:{},nearestFriend:null,openWardrobe(){},keys:new Set(),chooseTool(){},browse(){},rotateChoice(){},tools:[],swimmingAt:()=>true,pos:{x:0,z:0},feet:0,performance};
 vm.createContext(scope);
 const menus=main.slice(main.indexOf('function closeMenu('),main.indexOf('// Keep the actual focused'));
 const lock=main.slice(main.indexOf('function activateFallback('),main.indexOf("$('overlay').addEventListener"));
 const key=main.slice(main.indexOf("document.addEventListener('keydown'"),main.indexOf("document.addEventListener('keyup'"));
 vm.runInContext(`let started=${started},locked=${started},fallbackLook=${fallbackLook},runtimeReady=true,pendingStart=false,catalogOpen=false,outfitResident=null,menuMode='build',held=true,rightDrag=true,homeHeld=0,tool=0;`+menus+lock+key+`;this.read=()=>({started,locked,catalogOpen,menuMode,held,rightDrag});this.open=showCatalog;`,scope);
 return {scope,element,doc,key(code,extra={}){let prevented=false;listeners.keydown({code,repeat:false,target:doc.activeElement??element('game'),preventDefault(){prevented=true},...extra});return prevented;}};
}
test('actual caller J toggles journal directly back to play and does not focus a native selector',()=>{
 const f=fixture();f.key('KeyJ');assert.equal(f.scope.read().catalogOpen,true);assert.notEqual(f.doc.activeElement?.id,'bookLanguage');f.key('KeyJ');assert.equal(f.scope.read().locked,true);assert.equal(f.scope.read().catalogOpen,false);
});
test('actual caller Tab toggles build, J/Tab switch, and repeats never bounce',()=>{
 const f=fixture();f.key('Tab');assert.equal(f.scope.read().menuMode,'build');f.key('Tab',{repeat:true});assert.equal(f.scope.read().catalogOpen,true);f.key('KeyJ');assert.equal(f.scope.read().menuMode,'journal');f.key('Tab');assert.equal(f.scope.read().menuMode,'build');f.key('Tab');assert.equal(f.scope.read().locked,true);
});
test('Escape closes catalog to play; a pre-start catalog close returns to landing',()=>{
 const f=fixture();f.key('KeyJ');f.key('Escape');assert.equal(f.scope.read().locked,true);assert.equal(f.element('overlay').hidden,true);
 const landing=fixture({started:false});landing.scope.open(true,'journal');landing.key('Escape');assert.equal(landing.scope.read().started,false);assert.equal(landing.scope.read().locked,false);assert.equal(landing.element('overlay').hidden,false);
});
test('native editing, modified shortcuts and Shift-Tab keep keyboard ownership',()=>{
 const f=fixture();f.key('KeyJ');f.doc.activeElement={closest:s=>s.includes('select')?{}:null};
 assert.equal(f.key('KeyJ'),false);assert.equal(f.key('Tab'),false);assert.equal(f.scope.read().catalogOpen,true);
 f.doc.activeElement=null;assert.equal(f.key('Tab',{shiftKey:true}),false);assert.equal(f.key('KeyJ',{ctrlKey:true}),false);assert.equal(f.scope.read().menuMode,'journal');
});
test('Ctrl descent and held movement reach gameplay while modified menu shortcuts stay native',()=>{
 const f=fixture();
 for(const code of ['ControlLeft','ControlRight','KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','Space','KeyC']){
  assert.equal(f.key(code,{ctrlKey:true}),true);assert.equal(f.scope.keys.has(code),true,code);
 }
 f.key('KeyJ',{ctrlKey:true});assert.equal(f.scope.read().catalogOpen,false);
 const paused=fixture({started:false});paused.key('KeyW',{ctrlKey:true});assert.equal(paused.scope.keys.size,0);
});

test('Worlds keeps J/native input and Escape separate from play; Tab wraps inside dialog',()=>{
 const f=fixture({started:false});f.scope.worldsOpen=true;
 let closed=0;f.scope.closeWorlds=()=>{closed++;f.scope.worldsOpen=false;};
 const first=f.element('worldClose'),last=f.element('worldSave');
 f.element('worlds').querySelectorAll=()=>[first,last];
 f.doc.activeElement={closest:()=>({})};f.key('KeyJ');assert.equal(f.scope.read().catalogOpen,false);
 f.doc.activeElement=last;assert.equal(f.key('Tab'),true);assert.equal(f.doc.activeElement,first);
 assert.equal(f.key('Tab',{shiftKey:true}),true);assert.equal(f.doc.activeElement,last);
 f.key('Escape');assert.equal(closed,1);assert.equal(f.scope.read().locked,false);
});
