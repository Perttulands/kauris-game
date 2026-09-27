import {LOCALES} from './locale-data.js';
export const LANGUAGE_KEY='kauris-language-v1';
export const LANGUAGES={fi:'Suomi',sv:'Svenska',en:'English'};
export function chooseLanguage(saved,languages=[]){
 if(Object.hasOwn(LANGUAGES,saved))return saved;
 for(const candidate of languages){const language=String(candidate).toLowerCase().split(/[-_]/)[0];if(Object.hasOwn(LANGUAGES,language))return language;}
 return 'en';
}
export function createI18n({storage,languages=[]}={}){
 let saved;try{saved=storage?.getItem(LANGUAGE_KEY);}catch{}
 let language=chooseLanguage(saved,languages);
 const t=(key,params={})=>{
  const template=LOCALES[language][key];if(template===undefined)throw Error(`Missing translation: ${key}`);
  return template.replace(/\{(\w+)\}/g,(_,name)=>{if(params[name]===undefined)throw Error(`Missing parameter ${name} for ${key}`);return String(params[name]);});
 };
 return {get language(){return language;},t,
  set(next){if(!Object.hasOwn(LANGUAGES,next))return false;language=next;try{if(!storage)return false;storage.setItem(LANGUAGE_KEY,next);return true;}catch{return false;}},
  message(result){const params={...result.params};if(params.material)params.material=t('material.'+params.material);if(params.piece)params.piece=t('piece.'+params.piece);if(params.noun?.startsWith('prop.'))params.noun=t(params.noun);return t(result.code,params);},
  upper:key=>t(key).toLocaleUpperCase(language)
 };
}
