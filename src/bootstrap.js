import {createI18n,LANGUAGES} from './i18n.js';
import {icon} from './icons.js';
import './ui.css';
let storage;try{storage=localStorage;}catch{}
const i18n=createI18n({storage,languages:navigator.languages}),$=id=>document.getElementById(id);
let pending=null,ready=false,failed=false;
function localize(){document.documentElement.lang=i18n.language;document.title=i18n.t('ui.title');document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=i18n.t(e.dataset.i18n));document.querySelectorAll('[data-i18n-aria]').forEach(e=>e.setAttribute('aria-label',i18n.t(e.dataset.i18nAria)));document.querySelectorAll('.languageSelect').forEach(e=>{e.innerHTML=Object.entries(LANGUAGES).map(([value,name])=>`<option value="${value}">${name}</option>`).join('');e.value=i18n.language;});let saved=false;try{saved=!!storage?.getItem('kauris-meadow-v1');}catch{}const actionKey=failed?'boot.retry':saved?'ui.continue':'ui.play';$('start').innerHTML=icon('play')+`<span>${i18n.t(actionKey)}</span>`;$('start').setAttribute('aria-label',i18n.t(actionKey));$('bootStatus').textContent=i18n.t(failed?'boot.failed':'boot.preparing');$('pauseBuild').textContent=i18n.t('ui.buildMenu');$('pauseJournal').textContent=i18n.t('ui.journalMenu');}
localize();document.querySelectorAll('.languageSelect').forEach(e=>e.onchange=()=>{i18n.set(e.value);localize();});
for(const id of ['start','pauseBuild','pauseJournal'])$(id).onclick=()=>{pending=id;$('bootStatus').textContent=i18n.t('boot.preparing');};
$('reset').disabled=true;$('graphicsMode').disabled=true;$('comfortMode').disabled=true;$('returnHome').disabled=true;$('setHome').disabled=true;
window.kaurisBoot={i18n,marks:[],importAt:0,done(){ready=true;$('bootStatus').hidden=true;for(const id of ['reset','graphicsMode','comfortMode','returnHome','setHome'])$(id).disabled=false;const action=pending;pending=null;if(action)queueMicrotask(()=>$(action).click());},get ready(){return ready;}};
// Let the useful landing and native language controls paint before loading Three
// and compiling the world. Module initialization yields again between large parts.
requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>{window.kaurisBoot.importAt=performance.now();return import('./main.js').catch(error=>{failed=true;pending=null;console.error('Game initialization failed',error);$('bootStatus').hidden=false;localize();$('start').onclick=()=>location.reload();for(const id of ['pauseBuild','pauseJournal'])$(id).disabled=true;});},0)));
