import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,lstat,mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {tmpdir} from 'node:os';

// Evaluate only the input-validation section: no CLI import, compression, archive,
// output directory, or package execution while the accepted candidate is frozen.
const script=await readFile(new URL('../scripts/package-static.mjs',import.meta.url),'utf8');
const start=script.indexOf('const recordedAudio='),end=script.indexOf('// Exact referenced Vite output');
assert.ok(start>=0&&end>start,'packager input-validation boundary exists');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const validate=new AsyncFunction('source','readdir','lstat','relative','join','readFile',
 script.slice(start,end)+'\nreturn {files,blobs,allowedBuildPath,recordedAudio};');
const expected=['manifest.json','CREDITS.md','shore-loop.ogg','water-loop.ogg','bell-0.ogg'];
for(const [kind,count] of [['step-soft',6],['step-hard',6],['step-wood',3],
 ['dig',3],['chop',3],['fill',3],['build',3],['swim',3]])
 for(let i=0;i<count;i++)expected.push(kind+'-'+i+'.ogg');
const expectedPaths=expected.map(name=>'audio/'+name).sort();
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'kauris-package-policy-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'index.html'),'<html>fixture</html>');
 return root;
}
const inspect=root=>validate(root,readdir,lstat,relative,join,readFile);

test('reviewed audio fixtures retain every input byte alongside existing static assets',async t=>{
 const root=await fixture(t);
 await mkdir(join(root,'audio'));
 await mkdir(join(root,'assets'));
 const bytes=new Map([['index.html',Buffer.from('<html>fixture</html>')],
  ['assets/entry-12345678.js',Buffer.from('fixture JS')],
  ['assets/entry-12345678.css',Buffer.from('fixture CSS')],
  ['assets/picture.webp',Buffer.from([0,255,1])]]);
 for(const path of expectedPaths)bytes.set(path,Buffer.from('distinct fixture bytes: '+path));
 for(const [path,data] of bytes)await writeFile(join(root,path),data);
 const result=await inspect(root);
 assert.equal(expectedPaths.length,35);
 assert.deepEqual([...result.recordedAudio].sort(),expectedPaths);
 assert.deepEqual(result.files,[...bytes.keys()].sort());
 for(const [path,data] of bytes)assert.deepEqual(result.blobs.get(path),data,path);
 const actual=(await readdir(new URL('../public/audio/',import.meta.url))).map(n=>'audio/'+n).sort();
 assert.deepEqual(actual,expectedPaths,'current bank matches reviewed exact set');
});

test('private files and audio path variants are rejected',async t=>{
 const root=await fixture(t),{allowedBuildPath}=await inspect(root);
 for(const path of ['audio/private.ogg','audio/notes.md','audio/manifest.json.bak',
  'audio/step-soft-6.ogg','audio/dig-3.ogg','audio/bell-1.ogg','audio/.secret.ogg',
  'audio/sub/dig-0.ogg','audio/../dig-0.ogg','audio/./dig-0.ogg',
  './audio/dig-0.ogg','/audio/dig-0.ogg','audio//dig-0.ogg',
  'audio/DIG-0.ogg','audio/dig-0.OGG','audio/dig-0.ogg\n',
  'audio\\dig-0.ogg','audio/prepare-audio.py','.beads/issues.jsonl',
  'evidence/checkpoint.json','AGENTS.md','assets/../private.ogg','assets/.hidden.ogg'])
  assert.equal(allowedBuildPath(path),false,path);
 await mkdir(join(root,'audio'));
 await writeFile(join(root,'audio/private.ogg'),'private fixture');
 await assert.rejects(inspect(root),/Unexpected build file: audio\/private.ogg/);
});

test('allowlisted audio symlinks and symlink directories are rejected before reading targets',async t=>{
 for(const directory of [false,true]){
  const root=await fixture(t);
  await mkdir(join(root,'outside'));
  await writeFile(join(root,'outside/dig-0.ogg'),'must never read');
  if(directory)await symlink(join(root,'outside'),join(root,'audio'));
  else{
   await mkdir(join(root,'audio'));
   await symlink(join(root,'outside/dig-0.ogg'),join(root,'audio/dig-0.ogg'));
  }
  let reads=0;
  await assert.rejects(validate(root,readdir,lstat,relative,join,async()=>{reads++;throw Error('unexpected read');}),/Symlink in dist:/);
  assert.equal(reads,0);
 }
});

test('missing landing document still fails validation',async t=>{
 const root=await fixture(t);
 await rm(join(root,'index.html'));
 await assert.rejects(inspect(root),/Missing index.html/);
});
