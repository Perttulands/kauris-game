// Native DOM controls; names are always assigned as text, never interpolated as HTML.
export function createWorldMenu({library,session,t,save,freshRaw,onClose,onChanged,onError}){
 const $=id=>document.getElementById(id);let selected=null,rows=[],busy=false,open=false;
 function controls(){
  for(const button of $('worldList').querySelectorAll('button'))button.disabled=busy;
  for(const id of ['worldNew','worldLoad','worldCopy','worldRename','worldSave','worldClose','worldName'])$(id).disabled=busy;
  for(const id of ['worldLoad','worldCopy','worldRename'])$(id).disabled=busy||!selected?.valid;
  $('worldSave').disabled=busy||!session.current;
 }
 async function refresh(){
  rows=await library.list();
  selected=rows.find(r=>r.id===selected?.id)??rows.find(r=>r.id===session.current?.id)??rows[0]??null;
  render();
 }
 function render(){
  const list=$('worldList');list.replaceChildren();
  for(const row of rows){
   const button=document.createElement('button');button.type='button';button.className='worldRow';
   button.dataset.worldId=row.id;button.setAttribute('aria-pressed',String(row.id===selected?.id));
   const name=document.createElement('strong');name.textContent=row.name;button.append(name);
   const detail=document.createElement('span');detail.textContent=!row.valid?t('worlds.invalid'):row.id===session.current?.id?t('worlds.current'):t('worlds.stored');button.append(detail);
   button.onclick=()=>{selected=row;$('worldName').value=row.name;render();buttonFor(row.id)?.focus();};
   list.append(button);
  }
  if(!rows.length){const p=document.createElement('p');p.textContent=t('worlds.empty');list.append(p);}
  $('worldActive').textContent=session.current?t('worlds.active',{name:session.current.name}):t('worlds.noActive');
  controls();
 }
 const buttonFor=id=>[...$('worldList').querySelectorAll('button')].find(b=>b.dataset.worldId===id);
 async function action(work){
  if(busy)return;busy=true;controls();$('worldStatus').textContent=t('worlds.saving');
  try{await work();onChanged();if(!session.leaving){await refresh();$('worldStatus').textContent=t('worlds.saved');}}
  catch(e){$('worldStatus').textContent=t(onError(e));}
  finally{busy=false;controls();}
 }
 $('worldNew').onclick=()=>action(()=>session.transition('new',{name:$('worldName').value,raw:freshRaw()}));
 $('worldLoad').onclick=()=>action(()=>session.transition('load',{id:selected.id}));
 $('worldCopy').onclick=()=>action(()=>session.transition('copy',{id:selected.id,revision:selected.revision,name:$('worldName').value}));
 $('worldRename').onclick=()=>action(()=>session.rename(selected,$('worldName').value));
 $('worldSave').onclick=()=>action(async()=>{if(!await save(true))throw new Error('save failed');});
 $('worldClose').onclick=()=>{if(!busy)onClose();};
 return {
  get busy(){return busy;},
  async show(){
   open=true;$('worlds').hidden=false;$('worldStatus').textContent='';$('worldName').value=session.current?.name??t('worlds.defaultName');
   try{await refresh();}catch(e){$('worldStatus').textContent=t(onError(e));}
   $('worldName').focus();
  },
  hide(){open=false;$('worlds').hidden=true;},
  localize(){if(open)render();}
 };
}
