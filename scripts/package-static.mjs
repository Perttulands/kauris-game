#!/usr/bin/env node
// Package only build output. No installation, service or network changes.
import {readdir,readFile,writeFile,mkdir,lstat,rename,rm} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=resolve(process.argv[2]||'dist'),output=resolve(process.argv[3]||'artifacts');
if(output===source||output.startsWith(source+'/'))throw Error('Output must be outside dist');
// Validate only the reviewed audio bank; other audio-directory files stay private.
const recordedAudio=new Set(['audio/manifest.json','audio/CREDITS.md',
 'audio/shore-loop.ogg','audio/water-loop.ogg','audio/bell-0.ogg']);
for(const [kind,count] of [['step-soft',6],['step-hard',6],['step-wood',3],
                          ['dig',3],['chop',3],['fill',3],['build',3],['swim',3]])
 for(let i=0;i<count;i++)recordedAudio.add('audio/'+kind+'-'+i+'.ogg');
function allowedBuildPath(path){
 return (recordedAudio.has(path)||/^(index\.html|assets\/[A-Za-z0-9_./-]+\.(js|css|glb|webp|png|jpg|svg|ogg|wav|mp3))$/.test(path))&&!path.split('/').some(x=>x.startsWith('.'));
}
async function walk(dir){const result=[];for(const name of (await readdir(dir)).sort()){const p=join(dir,name),s=await lstat(p);if(s.isSymbolicLink())throw Error('Symlink in dist: '+p);if(s.isDirectory())result.push(...await walk(p));else if(s.isFile())result.push(relative(source,p));else throw Error('Unexpected file type: '+p);}return result;}
const files=await walk(source),blobs=new Map();
for(const path of files){if(!allowedBuildPath(path))throw Error('Unexpected build file: '+path);blobs.set(path,await readFile(join(source,path)));}
if(!blobs.has('index.html'))throw Error('Missing index.html');
// Exact referenced Vite output paths, never a blanket /assets cache rule.
const html=blobs.get('index.html').toString(),immutable=[...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css))"/g)].map(m=>m[1]);
if(!immutable.some(p=>p.endsWith('.js'))||!immutable.some(p=>p.endsWith('.css')))throw Error('Missing hashed entry JS/CSS');
for(const p of immutable)if(!blobs.has(p.slice(1)))throw Error('Missing hashed entry: '+p);
const id=sha(Buffer.from('static-package-v2\0'+files.map(p=>p+'\0'+sha(blobs.get(p))).join('\n'))).slice(0,16),release=join(output,'kauris-'+id),temp=release+'.tmp-'+process.pid;
await mkdir(output,{recursive:true});await mkdir(join(temp,'site'),{recursive:true});
try{
 const records=[];
 for(const path of files){const bytes=blobs.get(path),dest=join(temp,'site',path);await mkdir(resolve(dest,'..'),{recursive:true});await writeFile(dest,bytes);const row={path,sha256:sha(bytes),raw:bytes.length,gzip:bytes.length,brotli:bytes.length,immutable:immutable.includes('/'+path)};
  for(const [name,suffix,compressed] of [['gzip','.gz',gzipSync(bytes,{level:9})],['brotli','.br',brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:9}})]]){if(compressed.length<bytes.length){await writeFile(dest+suffix,compressed);row[name]=compressed.length;row[name+'Sha256']=sha(compressed);}}records.push(row);
 }
 const manifest={format:2,id,files:records,totals:Object.fromEntries(['raw','gzip','brotli'].map(k=>[k,records.reduce((n,r)=>n+r[k],0)]))};
 await writeFile(join(temp,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const validators=records.map((f,i)=>'@content'+i+' path /'+f.path+(f.path==='index.html'?' /':'')+'\nheader @content'+i+' ETag '+JSON.stringify('W/"'+f.sha256+'"')+'\n').join('');
 await writeFile(join(temp,'cache.caddy'),'# Content validators survive reproducible archive timestamps.\n'+validators+'# Only exact generated entry files are immutable.\n@immutable path '+immutable.join(' ')+'\nheader @immutable Cache-Control "public, max-age=31536000, immutable"\n');
 execFileSync('tar',['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-cf',join(temp,'site.tar'),'-C',join(temp,'site'),'.']);
 const archive=gzipSync(await readFile(join(temp,'site.tar')),{level:9});await rm(join(temp,'site.tar'));await writeFile(join(temp,'site.tar.gz'),archive);await writeFile(join(temp,'site.tar.gz.sha256'),sha(archive)+'  site.tar.gz\n');
 try{await rename(temp,release);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;for(const name of ['manifest.json','cache.caddy','site.tar.gz'])if(!(await readFile(join(release,name))).equals(await readFile(join(temp,name))))throw Error('Existing release differs: '+release);await rm(temp,{recursive:true});}
 console.log(JSON.stringify({release,id,files:files.length,totals:manifest.totals,archiveBytes:archive.length,archiveSha256:sha(archive)},null,2));
}catch(error){await rm(temp,{recursive:true,force:true});throw error;}
