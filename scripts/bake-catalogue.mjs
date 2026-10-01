#!/usr/bin/env node
// npm ci; Python 3 + Pillow with WebP support; Playwright Chromium installed.
// Run only under the project's coordinated browser lease:
// node scripts/bake-catalogue.mjs [--report-dir <directory>]
// Optional BROWSER_EXECUTABLE and GALLIUM_DRIVER select the local renderer.
// Builds an immutable temporary bundle. Never visits a running game or its saves.
import {build} from 'vite';
import {SEEDS,PIECES,MATERIALS} from '../src/state.js';
import {DELIGHT_KEYS} from '../src/delights.js';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm,symlink} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const reportArg=process.argv.indexOf('--report-dir');
const reportDir=reportArg<0?null:resolve(process.argv[reportArg+1]);
const temp=await mkdtemp(join(tmpdir(),'kauris-catalogue-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={begin:null,end:null,errors:[],recipe:'catalogue-v1-lossless-webp',width:160,height:160};
const inputs=new Map();
let previousPictures={};
try{previousPictures=JSON.parse(await readFile(join(root,'src/catalogue-manifest.json'),'utf8')).pictures;}catch(error){if(error.code!=='ENOENT')throw error;}
// Capture exact source bytes before the build; serve only this immutable copy.
// Full src coverage also includes transitive declaration imports used by factories.
for(const file of (await readdir(join(root,'src'))).filter(f=>f.endsWith('.js')&&!['previews.js','catalogue-manifest.js','main.js','readable-visuals.js'].includes(f)).sort()){
 inputs.set('src/'+file,await readFile(join(root,'src',file)));
}
for(const file of ['scripts/catalogue-render.js','scripts/bake-catalogue.mjs','package-lock.json'])inputs.set(file,await readFile(join(root,file)));
const sourceHash=sha(Buffer.concat([...inputs].sort(([a],[b])=>a.localeCompare(b)).flatMap(([path,bytes])=>[Buffer.from(path+'\0'),bytes])));
let browser,server;
try{
 const frozen=join(temp,'source');await mkdir(frozen);await symlink(join(root,'node_modules'),join(frozen,'node_modules'));
 await writeFile(join(frozen,'package.json'),'{"type":"module"}');
 for(const [path,bytes] of inputs){await mkdir(dirname(join(frozen,path)),{recursive:true});await writeFile(join(frozen,path),bytes);}
 await build({root:frozen,configFile:false,publicDir:false,logLevel:'warn',build:{outDir:join(temp,'site'),emptyOutDir:true,minify:true,lib:{entry:join(frozen,'scripts/catalogue-render.js'),formats:['es'],fileName:()=> 'catalogue.js'}}});
 await writeFile(join(temp,'site','index.html'),'<!doctype html><html><body></body></html>');
 const bundle=await readFile(join(temp,'site','catalogue.js'));report.bundleSha256=sha(bundle);report.sourceHash=sourceHash;
 const files=new Map([['/',{body:await readFile(join(temp,'site','index.html')),type:'text/html'}],['/catalogue.js',{body:bundle,type:'text/javascript'}]]);
 // Resolve a second Three module from the same immutable Vite bundle, avoiding
 // another package/version in the renderer used for the original recipe.
 const rendererEntry=join(temp,'renderer.js');
 await writeFile(rendererEntry,`import * as THREE from ${JSON.stringify(join(root,'node_modules/three/build/three.module.js'))};\nexport function makeRenderer(){const r=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});r.setSize(160,160);r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=.95;return r;}`);
 await build({root,configFile:false,publicDir:false,logLevel:'warn',build:{outDir:join(temp,'renderer'),emptyOutDir:true,minify:true,lib:{entry:rendererEntry,formats:['es'],fileName:()=> 'renderer.js'}}});
 const rendererBundle=await readFile(join(temp,'renderer','renderer.js'));report.rendererBundleSha256=sha(rendererBundle);files.set('/renderer.js',{body:rendererBundle,type:'text/javascript'});
 server=createServer((req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.type,'Cache-Control':'no-store'});res.end(file.body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 report.begin=new Date().toISOString();console.log('BEGIN catalogue browser '+report.begin+' bundle '+report.bundleSha256);
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox',...(process.env.GALLIUM_DRIVER?['--use-gl=angle','--use-angle=gl','--enable-gpu','--ignore-gpu-blocklist','--disable-software-rasterizer']:[])]});
 const page=await browser.newPage({viewport:{width:160,height:160}});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {makeRenderer}=await import('/renderer.js'),{renderCatalogue}=await import('/catalogue.js'),renderer=makeRenderer();
  try{const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),device=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);return {pictures:renderCatalogue(renderer),renderer:device};}
  finally{renderer.dispose();renderer.forceContextLoss();}
 });
 report.renderer=result.renderer;if(report.errors.length)throw Error(report.errors.join('\n'));
 await browser.close();browser=null;report.end=new Date().toISOString();console.log('END catalogue browser '+report.end);
 const pictures={},filesInfo=[],imageDir=join(temp,'pictures');await mkdir(imageDir);
 for(const [key,data] of Object.entries(result.pictures)){
  if(!/^[a-zA-Z0-9:]+$/.test(key)||!data.startsWith('data:image/png;base64,'))throw Error('Unexpected catalogue key or encoding');
  await writeFile(join(imageDir,key.replaceAll(':','-')+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 // Encoding does not change pixels: compare the decoded lossless RGB+alpha.
 const encoded=JSON.parse(execFileSync('python3',['-c',`from PIL import Image\nfrom pathlib import Path\nimport json,sys\np=Path(sys.argv[1]); result=[]\nfor f in sorted(p.glob('*.png')):\n im=Image.open(f).convert('RGBA'); out=f.with_suffix('.webp'); im.save(out,format='WEBP',lossless=True,method=6,exact=True)\n check=Image.open(out).convert('RGBA')\n # Fully transparent RGB is immaterial; visible channels and all alpha must match.\n ok=all(a[3]==b[3] and (not a[3] or a[:3]==b[:3]) for a,b in zip(im.getdata(),check.getdata()))\n if not ok: raise RuntimeError('Lossless pixel mismatch: '+f.name)\n alpha=im.getchannel('A'); bounds=alpha.getbbox()\n if im.size!=(160,160) or bounds is None: raise RuntimeError('Invalid image: '+f.name)\n result.append({'stem':f.stem,'bytes':out.stat().st_size,'alphaBounds':bounds,'edgeClipped':bounds[0]==0 or bounds[1]==0 or bounds[2]==160 or bounds[3]==160})\nprint(json.dumps(result))`,imageDir],{encoding:'utf8'}));
 const output=join(root,'public/assets/catalogue');await mkdir(output,{recursive:true});
 for(const [key] of Object.entries(result.pictures)){
  const stem=key.replaceAll(':','-'),bytes=await readFile(join(imageDir,stem+'.webp')),hash=sha(bytes),name=stem+'-'+hash.slice(0,12)+'.webp';
  pictures[key]='assets/catalogue/'+name;await writeFile(join(output,name),bytes);filesInfo.push({key,sha256:hash,...encoded.find(f=>f.stem===stem)});
 }
 report.count=filesInfo.length;report.bytes=filesInfo.reduce((sum,f)=>sum+f.bytes,0);report.files=filesInfo;
 // 32 resident/outfit portraits, 13 animals and 7 tools; catalogued gameplay kinds are authoritative.
 const expectedCount=52+Object.keys(SEEDS).length+Object.keys(PIECES).length*MATERIALS.length+DELIGHT_KEYS.length;
 report.expectedCount=expectedCount;
 if(report.count!==expectedCount)throw Error('Catalogue key count changed; review the manifest contract before accepting it');
 if(report.bytes>450*1024)throw Error('Lossless catalogue exceeds450KiB budget; retain evidence and review encoding before accepting');
 const manifest={version:1,width:160,height:160,sourceHash,pictures};
 await writeFile(join(root,'src/catalogue-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const current=new Set(Object.values(pictures));
 for(const old of Object.values(previousPictures))if(/^assets\/catalogue\/[a-zA-Z0-9-]+\.webp$/.test(old)&&!current.has(old))await rm(join(root,'public',old),{force:true});
 console.log(JSON.stringify({count:report.count,bytes:report.bytes,sourceHash,renderer:report.renderer,clipped:filesInfo.filter(f=>f.edgeClipped).map(f=>f.key)},null,2));
}catch(error){report.error=String(error);throw error;}
finally{
 if(browser){await browser.close();report.end=new Date().toISOString();console.log('END catalogue browser '+report.end);}
 if(server)await new Promise(resolve=>server.close(resolve));
 if(reportDir){await mkdir(reportDir,{recursive:true});await writeFile(join(reportDir,'bake-report.json'),JSON.stringify(report,null,2)+'\n');}
 await rm(temp,{recursive:true,force:true});
}
