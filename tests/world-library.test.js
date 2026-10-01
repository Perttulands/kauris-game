import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldLibrary,WorldSaveError} from '../src/world-library.js';
import {createWorldSession} from '../src/world-session.js';
import {freshState,serialize,deserialize} from '../src/state.js';
function memory(){
 const rows=new Map();let tail=Promise.resolve(),failure=false,gate=null;
 return {rows,set fail(v){failure=v;},set gate(v){gate=v;},run(keys,write,fn){
  const task=tail.then(async()=>{
   if(gate){const wait=gate;gate=null;await wait;}
   const input=new Map([...rows].filter(([k])=>keys===null||keys.includes(k)).map(([k,v])=>[k,structuredClone(v)]));
   const outcome=fn(input);
   if(write&&failure)throw new Error('QuotaExceededError');
   for(const row of outcome.put??[])rows.set(row.key,structuredClone(row));
   return structuredClone(outcome.result);
  });tail=task.catch(()=>{});return task;
 }};
}
function fixture(store=memory()){
 let id=0;const library=createWorldLibrary({store,validate:deserialize,id:()=>String(++id),now:()=>42});
 const raw=serialize(freshState());
 return {store,library,raw,init:()=>library.initialize({legacyRaw:null,name:'World A',freshRaw:raw})};
}
test('legacy exact raw migrates once; edits/reinitialize never replace recovery',async()=>{
 const {store,library,raw}=fixture();const legacy=' '+raw+'\n';
 await library.initialize({legacyRaw:legacy,name:'Old world',freshRaw:raw});
 const a=await library.load();assert.equal(a.raw,legacy);
 const s=deserialize(a.raw);s.inventory.wood=73;await library.save(a,serialize(s));
 await library.initialize({legacyRaw:raw,name:'ignored',freshRaw:raw});
 assert.equal((await library.list()).length,1);assert.equal(store.rows.get('legacy-recovery').raw,legacy);
 assert.equal(deserialize((await library.load()).raw).inventory.wood,73);
});
test('malformed legacy preserved and explicit new is independent; missing explicit id never falls back',async()=>{
 const {store,library,raw}=fixture();const bad='{"paid":"unreadable"';
 const init=await library.initialize({legacyRaw:bad,name:'Old',freshRaw:raw});
 assert.equal(init.warning,'worlds.legacyInvalid');assert.equal(store.rows.get('legacy-recovery').raw,bad);
 await assert.rejects(library.load(),{code:'worlds.invalid'});
 const b=await library.create('B',raw);assert.equal((await library.load(b.id)).id,b.id);
 await assert.rejects(library.load('missing'),{code:'worlds.invalid'});
 assert.equal(store.rows.get('legacy-recovery').raw,bad);
});
test('denied migration commits nothing; unavailable legacy read never counts as absent',async()=>{
 const {store,library,raw}=fixture();store.fail=true;
 await assert.rejects(library.initialize({legacyRaw:raw,name:'Old',freshRaw:raw}));assert.equal(store.rows.size,0);
 store.fail=false;await assert.rejects(library.initialize({legacyUnavailable:true,name:'Old',freshRaw:raw}));
 assert.equal(store.rows.size,0);
 await library.initialize({legacyRaw:raw,name:'Old',freshRaw:raw});assert.equal((await library.list()).length,1);
});
test('A/B/copy isolation preserves complete raw snapshot and unique identity across edits/reload',async()=>{
 const {library,raw,init}=fixture();await init();
 const a=await library.load(),b=await library.create('B',raw);
 const altered=deserialize(b.raw);altered.inventory.diamond=321;altered.player.x=2;
 const savedB=await library.save(b,serialize(altered)),copy=await library.copy(a,'A test');
 assert.equal(new Set([a.id,b.id,copy.id]).size,3);assert.equal(copy.raw,a.raw);
 const changed=deserialize(copy.raw);changed.inventory.fiber=555;await library.save(copy,serialize(changed));
 assert.equal((await library.load(a.id)).raw,a.raw);assert.equal((await library.load(b.id)).raw,savedB.raw);
});
test('atomic expected revisions reject a concurrent same-world writer; separate worlds remain writable',async()=>{
 const {library,raw,init}=fixture();await init();const a=await library.load(),other=await library.load(a.id);
 const changed=deserialize(raw);changed.inventory.wood=55;
 const results=await Promise.allSettled([library.save(a,serialize(changed)),library.save(other,raw)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.code,'worlds.conflict');
 const b=await library.create('B',raw);await library.save(b,raw);
 assert.equal(deserialize((await library.load(a.id)).raw).inventory.wood,55);
});
test('quota failure leaves old world/revision/name and library unchanged',async()=>{
 const {store,library,raw,init}=fixture();await init();const a=await library.load(),before=JSON.stringify([...store.rows]);
 store.fail=true;
 for(const action of [()=>library.save(a,raw),()=>library.create('B',raw),()=>library.copy(a,'copy'),()=>library.rename(a,'renamed')])await assert.rejects(action());
 assert.equal(JSON.stringify([...store.rows]),before);
});
test('invalid existing record stays intact rather than becoming fresh',async()=>{
 const {store,library,init}=fixture();await init();const a=await library.load();store.rows.get('world:'+a.id).raw='bad';
 await assert.rejects(library.load(a.id),{code:'worlds.invalid'});
 assert.equal((await library.list())[0].valid,false);assert.equal(store.rows.get('world:'+a.id).raw,'bad');
});
test('session captures matching snapshot, retains edits made in flight and serializes next save',async()=>{
 const {store,library,raw,init}=fixture();await init();const a=await library.load();
 let current=deserialize(raw);current.inventory.wood=1;let release;
 store.gate=new Promise(r=>release=r);const statuses=[];
 const session=createWorldSession({library,initial:a,capture:()=>serialize(current),onStatus:s=>statuses.push(s)});
 const first=session.save();await new Promise(r=>setImmediate(r));current.inventory.wood=2;release();await first;
 assert.equal(statuses.at(-1),'worlds.unsaved');assert.equal(deserialize(session.current.raw).inventory.wood,1);
 await session.save();assert.equal(deserialize(session.current.raw).inventory.wood,2);assert.equal(statuses.at(-1),'worlds.saved');
});
test('failed save prevents switch/new/copy and navigation; successful switch neutralizes outgoing writes',async()=>{
 const {store,library,raw,init}=fixture();await init();const a=await library.load(),b=await library.create('B',raw);
 let state=deserialize(raw);state.inventory.wood=77;const navigated=[];
 const session=createWorldSession({library,initial:a,capture:()=>serialize(state),navigate:id=>navigated.push(id)});
 store.fail=true;
 for(const kind of ['load','copy','new'])await assert.rejects(session.transition(kind,{id:b.id,name:'next',raw}));
 assert.deepEqual(navigated,[]);assert.equal(session.current.id,a.id);assert.equal(session.current.revision,a.revision);
 store.fail=false;await session.transition('load',{id:b.id});state.inventory.wood=999;
 assert.equal(await session.save(),false);assert.deepEqual(navigated,[b.id]);
 assert.equal(deserialize((await library.load(a.id)).raw).inventory.wood,77);
 assert.equal((await library.load(b.id)).raw,raw);
});
test('copy active includes latest saved state; rename preserves gameplay and causes stale-token rejection',async()=>{
 const {library,raw,init}=fixture();await init();const a=await library.load();let state=deserialize(raw);state.inventory.iron=82;
 let next;const session=createWorldSession({library,initial:a,capture:()=>serialize(state),navigate:id=>next=id});
 await session.rename(a,'New name');assert.equal(session.current.name,'New name');
 await assert.rejects(library.save(a,raw),{code:'worlds.conflict'});
 await session.transition('copy',{id:a.id,name:'Test copy'});
 assert.equal(deserialize((await library.load(next)).raw).inventory.iron,82);
 assert.equal((await library.load(a.id)).name,'New name');
});

test('native quota codes map to a real localized failure instead of being treated as translation keys',async()=>{
 const {worldErrorKey}=await import('../src/world-library.js');
 assert.equal(worldErrorKey({name:'QuotaExceededError',code:22}),'worlds.unavailable');
 assert.equal(worldErrorKey(new WorldSaveError('worlds.conflict')),'worlds.conflict');
});
test('serialization and invalid destination failures never navigate or replace the current snapshot',async()=>{
 const {library,raw,init}=fixture();await init();const a=await library.load();let broken=true,moves=0;
 const session=createWorldSession({library,initial:a,capture:()=>{if(broken)throw new Error('serialization');return raw;},navigate:()=>moves++});
 await assert.rejects(session.transition('new',{name:'new',raw}),/serialization/);assert.equal((await library.list()).length,1);
 broken=false;await assert.rejects(session.transition('load',{id:'missing'}),{code:'worlds.invalid'});
 assert.equal(moves,0);assert.equal(session.leaving,false);assert.equal(session.current.raw,raw);
});

test('unchanged Save now detects stale revision and storage failure; transition does not claim success',async()=>{
 const {store,library,raw,init}=fixture();await init();const a=await library.load();let navigated=false;
 const session=createWorldSession({library,initial:a,capture:()=>raw,navigate:()=>navigated=true});
 const newer=deserialize(raw);newer.inventory.wood=38;await library.save(a,serialize(newer));
 await assert.rejects(session.save(),{code:'worlds.conflict'});
 for(const kind of ['new','load','copy'])await assert.rejects(session.transition(kind,{id:a.id,name:'copy',raw}),{code:'worlds.conflict'});
 assert.equal(navigated,false);assert.equal(deserialize((await library.load(a.id)).raw).inventory.wood,38);
 const current=await library.load(a.id),fresh=createWorldSession({library,initial:current,capture:()=>current.raw});
 store.fail=true;await assert.rejects(fresh.save(),/Quota/);assert.equal(fresh.current.revision,current.revision);
});
test('copy source revision is checked atomically against a writer racing after flush',async()=>{
 const {library,raw,init}=fixture();await init();const a=await library.load();let navigated=false;
 const racing={...library,async copy(token,name){
  const edited=deserialize(token.raw);edited.inventory.copper=222;await library.save(token,serialize(edited));
  return library.copy(token,name);
 }};
 const session=createWorldSession({library:racing,initial:a,capture:()=>raw,navigate:()=>navigated=true});
 await assert.rejects(session.transition('copy',{id:a.id,name:'copy'}),{code:'worlds.conflict'});
 assert.equal(navigated,false);assert.equal(session.leaving,false);assert.equal((await library.list()).length,1);
 assert.equal(deserialize((await library.load(a.id)).raw).inventory.copper,222);
});
