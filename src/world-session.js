// Every operation stays bound to this session's id. Selection never retargets autosave.
export function createWorldSession({library,initial,capture,navigate,onStatus=()=>{}}){
 let current=initial,tail=Promise.resolve(),leaving=false;
 const queue=work=>{
  const next=tail.then(()=>{if(leaving)return false;return work();});
  tail=next.catch(()=>{});return next;
 };
 async function flush(){
  if(!current)throw Object.assign(new Error('worlds.noActive'),{code:'worlds.noActive'});
  const raw=capture();
  onStatus('worlds.saving');current=await library.save(current,raw);
  onStatus(capture()===current.raw?'worlds.saved':'worlds.unsaved');return current;
 }
 return {
  get current(){return current;},
  get leaving(){return leaving;},
  save:()=>queue(flush),
  rename:(token,name)=>queue(async()=>{
   if(current)await flush();
   const updated=await library.rename(token.id===current?.id?current:token,name);
   if(updated.id===current?.id)current=updated;
   return updated;
  }),
  transition:(kind,{id,revision,name,raw}={})=>queue(async()=>{
   if(current)await flush();
   const next=kind==='load'?await library.load(id):kind==='copy'?await library.copy(id===current?.id?current:{id,revision},name):await library.create(name,raw);
   // All persistence completed. Outgoing blur/unload callbacks are now inert.
   leaving=true;
   try{navigate(next.id);}catch(e){leaving=false;throw e;}
   return next;
  })
 };
}
