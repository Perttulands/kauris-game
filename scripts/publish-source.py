#!/usr/bin/env python3
"""Export committed game source into a separate, audited public Git history.

Example: python3 scripts/publish-source.py --output ../kauris-game-public --publish
Without --publish: prepare, audit, npm ci/test/build and commit locally only.
The source repository is never rewritten or assigned a public remote.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--output',type=Path,required=True,help='Dedicated source-only export checkout (not this repository)')
parser.add_argument('--revision',default='HEAD',help='Committed source revision; default HEAD')
parser.add_argument('--publish',action='store_true',help='Create/update the authorized public GitHub repository, without force push')
args=parser.parse_args()
source=Path(__file__).resolve().parents[1]
def run(*cmd,cwd=source,capture=True):
 return subprocess.check_output(cmd,cwd=cwd,text=True).strip() if capture else subprocess.run(cmd,cwd=cwd,check=True)
revision=run('git','rev-parse',args.revision+'^{commit}')
output=args.output.resolve()
if output==source or source in output.parents:raise SystemExit('Export must be a separate checkout outside source.')
allow={'README.md','package.json','package-lock.json','index.html','scripts/publish-source.py','scripts/package-static.mjs','HOSTING.md','hosting/Caddyfile','hosting/kauris-static.service'}
paths=run('git','ls-tree','-r','--name-only',revision).splitlines()
def allowed(p):
 return p in allow or (p.startswith('src/') and Path(p).suffix in ('.js','.css')) or (p.startswith('tests/') and p.endswith('.test.js')) or (p.startswith('public/assets/') and Path(p).suffix in ('.glb','.png','.jpg','.webp','.svg','.ogg','.wav','.mp3'))
paths=[p for p in paths if allowed(p)]
if not all(p in paths for p in ['src/main.js','package-lock.json','README.md']):raise SystemExit('Incomplete game source')
manifest_name='.source-export.json'
if output.exists() and any(output.iterdir()):
 if not (output/'.git').is_dir() or not (output/manifest_name).is_file():raise SystemExit('Refusing an unrecognized/nonempty export path')
 if run('git','status','--porcelain',cwd=output):raise SystemExit('Export has uncommitted work; preserve and resolve it first')
 prior=json.loads((output/manifest_name).read_text())
else:
 output.mkdir(parents=True,exist_ok=True);run('git','init','-b','main',cwd=output);prior={'files':[]}
# Read committed blobs, not dirty working files or symlink targets.
blobs={}
for p in paths:
 mode=run('git','ls-tree',revision,'--',p).split()[0]
 if mode not in ('100644','100755'):raise SystemExit('Unexpected source file mode: '+p)
 data=subprocess.check_output(['git','show',revision+':'+p],cwd=source)
 if len(data)>10*1024*1024:raise SystemExit('Oversized public file: '+p)
 blobs[p]=data
blobs['.gitignore']=b'node_modules/\ndist/\nartifacts/\n*.log\n.env\n.env.*\n'
# Content checks return paths only, never matching secret bytes.
patterns=[rb'(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk-[A-Za-z0-9]{30,})',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'/home/[A-Za-z0-9_.-]+/',rb'[A-Za-z0-9_.+-]+@(?:gmail|hotmail|outlook)\.com',rb'"kauris-meadow-v1"\s*:']
def audit(name,data):
 if any(re.search(p,data) for p in patterns):raise SystemExit('Public audit requires review: '+name)
for p,data in blobs.items():audit(p,data)
if sum(map(len,blobs.values()))>25*1024*1024:raise SystemExit('Export unexpectedly large')
# Remove only previous manifest-owned paths, leaving unrelated files untouched.
for p in prior['files']:
 if Path(p).is_absolute() or '..' in Path(p).parts:raise SystemExit('Invalid prior manifest path')
 if p not in blobs:
  victim=output/p
  if victim.is_file():victim.unlink()
for p,data in blobs.items():
 dest=output/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
manifest={'sourceCommit':revision,'files':sorted(blobs),'sha256':{p:hashlib.sha256(data).hexdigest() for p,data in sorted(blobs.items())}}
(output/manifest_name).write_text(json.dumps(manifest,indent=2)+'\n')
# All public reachable history must remain source-only. Audit it on every update.
if run('git','rev-list','--all',cwd=output):
 emails=run('git','log','--all','--format=%ae%n%ce',cwd=output).splitlines()
 if any(not e.endswith('@users.noreply.github.com') for e in emails):raise SystemExit('Public history contains an unexpected commit identity')
 objects=run('git','rev-list','--objects','--all',cwd=output).splitlines()
 for item in objects:
  sha,_,name=item.partition(' ')
  if not name:continue
  if run('git','cat-file','-t',sha,cwd=output)!='blob':continue
  if not allowed(name) and name not in (manifest_name,'.gitignore'):raise SystemExit('Unexpected public history path: '+name)
  audit(name,subprocess.check_output(['git','cat-file','blob',sha],cwd=output))
for command in [('npm','ci'),('npm','test'),('npm','run','build')]:run(*command,cwd=output,capture=False)
run('git','diff','--check',cwd=output,capture=False)
identity=json.loads(run('gh','api','user','--jq','{login:.login,id:.id}'))
if identity['login']!='Perttulands':raise SystemExit('Expected authorized GitHub account Perttulands')
run('git','config','user.name',identity['login'],cwd=output)
run('git','config','user.email',str(identity['id'])+'+'+identity['login']+'@users.noreply.github.com',cwd=output)
run('git','add','-A','--',*sorted(set(blobs)|set(prior['files'])),manifest_name,cwd=output)
if run('git','diff','--cached','--name-only',cwd=output):run('git','commit','-m','Update Kauris source '+revision[:8],cwd=output,capture=False)
repo='Perttulands/kauris-game';url='https://github.com/'+repo
if args.publish:
 result=subprocess.run(['gh','repo','view',repo,'--json','isPrivate'],cwd=output,text=True,capture_output=True)
 if result.returncode:
  # Only absence authorizes creation; other network/auth failures are not swallowed.
  if 'Could not resolve' not in result.stderr and '404' not in result.stderr:raise SystemExit('Cannot verify repository availability')
  run('gh','repo','create',repo,'--public','--description','A peaceful growing and building game I am developing with my son',cwd=output,capture=False)
 elif json.loads(result.stdout)['isPrivate']:raise SystemExit('Existing repo is private; refusing unintended visibility change')
 remotes=run('git','remote',cwd=output).splitlines()
 if remotes and remotes!=['origin']:raise SystemExit('Unexpected public checkout remotes')
 if not remotes:run('git','remote','add','origin',url+'.git',cwd=output)
 if run('git','remote','get-url','origin',cwd=output)!=url+'.git':raise SystemExit('Unexpected origin')
 run('git','-c','credential.helper=!gh auth git-credential','push','-u','origin','main',cwd=output,capture=False)
 if json.loads(run('gh','repo','view',repo,'--json','isPrivate'))['isPrivate']:raise SystemExit('Public visibility verification failed')
 remote=run('git','ls-remote','origin','refs/heads/main',cwd=output).split()[0]
 if remote!=run('git','rev-parse','HEAD',cwd=output):raise SystemExit('Remote commit mismatch')
 print(url)
print(json.dumps({'source':revision,'publicCommit':run('git','rev-parse','HEAD',cwd=output),'files':len(blobs),'bytes':sum(map(len,blobs.values())),'published':args.publish}))
