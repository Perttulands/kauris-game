// Local world records commit together with revision checks in one IDB transaction.
export const WORLD_DB='kauris-worlds-v1';
const META='library',RECOVERY='legacy-recovery',worldKey=id=>'world:'+id;
export class WorldSaveError extends Error{
 constructor(code,cause){super(code,{cause});this.code=code;}
}
export function worldErrorKey(error){return ['worlds.badName','worlds.unavailable','worlds.invalid','worlds.conflict','worlds.legacyInvalid','worlds.noActive'].includes(error?.code)?error.code:'worlds.unavailable';}
const fail=code=>{throw new WorldSaveError(code);};
export function worldName(value){
 const name=String(value??'').trim();
 if(!name||name.length>60)fail('worlds.badName');
 return name;
}
export function indexedWorldStore(indexedDB=globalThis.indexedDB){
 let opening;
 function open(){
  if(!opening)opening=new Promise((resolve,reject)=>{
   if(!indexedDB){reject(new WorldSaveError('worlds.unavailable'));return;}
   let request,rejected=false;
   try{request=indexedDB.open(WORLD_DB,1);}catch(e){reject(e);return;}
   request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'key'});
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>{rejected=true;reject(new WorldSaveError('worlds.unavailable'));};
   request.onsuccess=()=>{
    const db=request.result;if(rejected){db.close();return;}
    db.onversionchange=()=>{db.close();opening=null;};
    resolve(db);
   };
  }).catch(e=>{opening=null;throw e;});
  return opening;
 }
 return {async run(keys,write,work){
  const db=await open();
  return new Promise((resolve,reject)=>{
   let tx,result,failure;
   try{tx=db.transaction('records',write?'readwrite':'readonly');}catch(e){reject(e);return;}
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(failure??tx.error??new WorldSaveError('worlds.unavailable'));
   tx.onerror=()=>{}; // Abort is the authoritative failure, never a request's success.
   const store=tx.objectStore('records'),rows=new Map();
   function apply(){
    try{
     const outcome=work(rows); // Synchronous: no transaction lifetime/await gap.
     result=outcome.result;
     for(const record of outcome.put??[])store.put(record);
    }catch(e){failure=e;tx.abort();}
   }
   if(keys===null){
    const request=store.getAll();request.onsuccess=()=>{for(const row of request.result)rows.set(row.key,row);apply();};
   }else if(!keys.length)apply();
   else{
    let remaining=keys.length;
    for(const key of keys){
     const request=store.get(key);
     request.onsuccess=()=>{if(request.result)rows.set(key,request.result);if(--remaining===0)apply();};
    }
   }
  });
 }};
}
export function createWorldLibrary({store=indexedWorldStore(),validate,id=()=>crypto.randomUUID(),now=()=>Date.now()}={}){
 const checkRaw=raw=>{if(typeof raw!=='string')fail('worlds.invalid');try{validate(raw);}catch(e){throw new WorldSaveError('worlds.invalid',e);}return raw;};
 const checkRecord=r=>{
  if(!r||r.key!==worldKey(r.id)||typeof r.id!=='string'||!r.id||typeof r.name!=='string'||!r.name.trim()||!Number.isSafeInteger(r.revision)||r.revision<1)fail('worlds.invalid');
  checkRaw(r.raw);return r;
 };
 const meta=rows=>{const m=rows.get(META);if(m?.version!==1)fail('worlds.invalid');return m;};
 const result=r=>({id:r.id,revision:r.revision,name:r.name,raw:r.raw});
 const make=(name,raw)=>{const next=id();return {key:worldKey(next),id:next,name:worldName(name),raw:checkRaw(raw),revision:1,createdAt:now(),updatedAt:now()};};
 function matching(rows,token){
  const r=checkRecord(rows.get(worldKey(token.id)));
  if(r.revision!==token.revision)fail('worlds.conflict');
  return r;
 }
 return {
  async initialize({legacyRaw,legacyUnavailable=false,name,freshRaw}){
   return store.run(null,true,rows=>{
    if(rows.has(META)){meta(rows);return {result:{warning:rows.get(RECOVERY)?.invalid?'worlds.legacyInvalid':''}};}
    if(rows.size||legacyUnavailable)fail('worlds.unavailable');
    const put=[],m={key:META,version:1,lastId:null};let warning='';
    if(legacyRaw!==null&&legacyRaw!==undefined){
     let invalid=false;try{checkRaw(legacyRaw);}catch{invalid=true;warning='worlds.legacyInvalid';}
     put.push({key:RECOVERY,raw:legacyRaw,invalid,createdAt:now()});
     if(!invalid){const r=make(name,legacyRaw);put.push(r);m.lastId=r.id;}
    }else{const r=make(name,freshRaw);put.push(r);m.lastId=r.id;}
    put.push(m);return {put,result:{warning}};
   });
  },
  async list(){
   return store.run(null,false,rows=>{
    meta(rows);
    return {result:[...rows.values()].filter(r=>r.key.startsWith('world:')).map(r=>{
     let valid=true;try{checkRecord(r);}catch{valid=false;}
     return {id:r.id,name:typeof r.name==='string'?r.name:'',revision:r.revision,updatedAt:r.updatedAt,valid};
    }).sort((a,b)=>a.name.localeCompare(b.name))};
   });
  },
  async load(id){
   // Last-used is only a startup default; writes always use the captured token.
   return store.run(null,true,rows=>{
    const m=meta(rows),r=checkRecord(rows.get(worldKey(id??m.lastId)));
    return {put:[{...m,lastId:r.id}],result:result(r)};
   });
  },
  async save(token,raw){
   checkRaw(raw);
   return store.run([worldKey(token.id)],true,rows=>{
    const old=matching(rows,token);
    if(raw===old.raw)return {result:result(old)}; // Verified in this readwrite transaction; no spurious revision.
    const r={...old,raw,revision:old.revision+1,updatedAt:now()};
    return {put:[r],result:result(r)};
   });
  },
  async create(name,raw){
   const r=make(name,raw);
   return store.run([META,r.key],true,rows=>{
    const m=meta(rows);if(rows.has(r.key))fail('worlds.unavailable');
    return {put:[r,{...m,lastId:r.id}],result:result(r)};
   });
  },
  async copy(source,name){
   const nextId=id(),key=worldKey(nextId);
   return store.run([META,worldKey(source.id),key],true,rows=>{
    const m=meta(rows),original=matching(rows,source);
    if(rows.has(key))fail('worlds.unavailable');
    const r={...original,key,id:nextId,name:worldName(name),revision:1,createdAt:now(),updatedAt:now()};
    return {put:[r,{...m,lastId:r.id}],result:result(r)};
   });
  },
  async rename(token,name){
   name=worldName(name);
   return store.run([worldKey(token.id)],true,rows=>{
    const old=matching(rows,token),r={...old,name,revision:old.revision+1,updatedAt:now()};
    return {put:[r],result:result(r)};
   });
  }
 };
}
