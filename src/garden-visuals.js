import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sculpted low-poly forms share materials and geometry; animation only poses groups.
const C={};
const colors={bark:'#76513b',barkLight:'#a57a50',barkDark:'#4c3a2e',leaf:'#5c8a48',leafLight:'#94b966',leafDark:'#365f48',birch:'#e9e5cb',pine:'#356e59',pineLight:'#5c9470',willow:'#82aa60',gold:'#e4ba52',goldLight:'#ffe092',copper:'#c77b4b',patina:'#68a996',iron:'#7b909a',ironLight:'#bed0d0',diamond:'#79d5d3',diamondLight:'#e1fff1',pink:'#e59eac',cream:'#fff0c9',purple:'#a49acf',stem:'#50744d',rock:'#83928a',rockLight:'#b6bba4',moss:'#658b57',wood:'#b88a5b',soil:'#8b7561',water:'#99dcdb',white:'#f4eee0',black:'#283e39',coral:'#ce835d',blue:'#618b9d',deer:'#b68a61',deerLight:'#e5c9a0'};
for(const [key,color] of Object.entries(colors))C[key]=new THREE.MeshStandardMaterial({color,roughness:['diamond','diamondLight'].includes(key)?.32:.85,metalness:['copper','iron','ironLight'].includes(key)?.25:0,flatShading:true});
C.diamondLight.emissive.set('#5db7b1');C.diamondLight.emissiveIntensity=.16;
const G={box:new THREE.BoxGeometry(1,1,1),ball:new THREE.IcosahedronGeometry(1,1),rock:new THREE.IcosahedronGeometry(1,0),cone:new THREE.ConeGeometry(1,1,7),cyl:new THREE.CylinderGeometry(.8,1,1,9),crystal:new THREE.OctahedronGeometry(1,0)};
// Thin folded leaves have a real central ridge, with a closed, fine edge.
function foldedLeaf(outline){
  const vertices=[],n=outline.length;
  for(let side=0;side<2;side++)for(let i=0;i<n;i++){
    const a=outline[i],b=outline[(i+1)%n],c=[0,.49,side?.055:.075];
    const tri=side?[c,[b[0],b[1],-.004],[a[0],a[1],-.004]]:[c,[a[0],a[1],0],[b[0],b[1],0]];
    vertices.push(...tri.flat());
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
G.leaf=foldedLeaf([[0,0],[-.23,.25],[-.32,.54],[-.20,.80],[0,1],[.20,.80],[.32,.54],[.23,.25]]);
G.oakLeaf=foldedLeaf([[0,0],[-.16,.20],[-.30,.28],[-.22,.42],[-.35,.52],[-.22,.65],[-.26,.79],[0,1],[.26,.79],[.22,.65],[.35,.52],[.22,.42],[.30,.28],[.16,.20]]);
G.goldLeaf=foldedLeaf([[0,0],[-.35,.30],[-.48,.63],[-.36,.89],[-.14,1],[0,.85],[.14,1],[.36,.89],[.48,.63],[.35,.30]]);
G.petal=foldedLeaf([[0,0],[-.36,.32],[-.43,.68],[-.28,.93],[0,1],[.28,.93],[.43,.68],[.36,.32]]);
function facetedMineral(rings,sides){
  const vertices=[],ring=rings.map(([y,r],j)=>Array.from({length:sides},(_,i)=>{const a=i*Math.PI*2/sides;return [Math.cos(a)*r*(1+.09*Math.sin(i*2.3)),y+(r?Math.sin(i*1.7+j)*.035:0),Math.sin(a)*r];}));
  for(let j=0;j<ring.length-1;j++)for(let i=0;i<sides;i++){const k=(i+1)%sides;vertices.push(...ring[j][i],...ring[j+1][i],...ring[j][k],...ring[j][k],...ring[j+1][i],...ring[j+1][k]);}
  for(const [j,sign]of [[0,-1],[ring.length-1,1]])for(let i=0;i<sides;i++){const tri=[[0,rings[j][0],0],ring[j][i],ring[j][(i+1)%sides]];vertices.push(...(sign<0?tri:tri.reverse()).flat());}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
G.ore=facetedMineral([[-.5,.58],[-.32,1],[.30,.91],[.5,.62]],7);
function leafCushion(){
  const rings=[[-.58,.36],[-.32,.84],[.04,1],[.39,.78],[.64,.31]],n=15,verts=[];
  const points=rings.map(([y,r],j)=>Array.from({length:n},(_,i)=>{const a=i*Math.PI*2/n,edge=1+.13*Math.sin(a*5+j*.9)+.055*Math.cos(a*3);return [Math.cos(a)*r*edge,y+.08*Math.cos(a*4+j),Math.sin(a)*r*edge];}));
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const k=(i+1)%n;verts.push(...points[j][i],...points[j+1][i],...points[j][k],...points[j][k],...points[j+1][i],...points[j+1][k]);}
  for(let i=0;i<n;i++){const k=(i+1)%n;verts.push(0,-.64,0,...points[0][i],...points[0][k],0,.69,0,...points[4][k],...points[4][i]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();return g;
}
G.cushion=leafCushion();

G.gem=facetedMineral([[-1,0],[-.40,.73],[.43,1],[1.06,0]],6);
for(const [key,color]of Object.entries({goldShade:'#b58c37',leafMid:'#75994e',barkCrease:'#62472f',birdDark:'#38586a',birdLight:'#94b7bd',deerShade:'#936a48',earPink:'#c28d76'}))C[key]=new THREE.MeshStandardMaterial({color,roughness:.87,flatShading:true});
const transform=new THREE.Object3D();
class Parts {
  constructor(){this.items=new Map();}
  geometry(geometry,mat,matrix){const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.deleteAttribute('uv');if(matrix)g.applyMatrix4(matrix);if(this.growth){const a=g.attributes.position,b=a.array.slice(),anchor=this.anchor??[0,0,0];for(let i=0;i<a.count;i++)for(let j=0;j<3;j++)b[i*3+j]=anchor[j]+(b[i*3+j]-anchor[j])*.16;g.morphAttributes.position=[new THREE.Float32BufferAttribute(b,3)];}const material=typeof mat==='string'?C[mat]:mat;if(!this.items.has(material))this.items.set(material,[]);this.items.get(material).push(g);}
  add(shape,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);transform.scale.set(sx,sy,sz);transform.updateMatrix();this.geometry(G[shape],mat,transform.matrix);return this;}
  beam(mat,a,b,r=.1){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b);transform.position.copy(from).add(to).multiplyScalar(.5);transform.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());transform.scale.set(r,from.distanceTo(to),r);transform.updateMatrix();this.geometry(G.cyl,mat,transform.matrix);}
  finish(name,painted=false){const group=new THREE.Group();group.name=name;
    if(painted){const pieces=[];for(const [mat,parts]of this.items)for(const g of parts){const colors=[];for(let i=0;i<g.attributes.position.count;i++)colors.push(mat.color.r,mat.color.g,mat.color.b);g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));pieces.push(g);}if(pieces.length){const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());if(!C.insectPaint)C.insectPaint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,flatShading:true});group.add(new THREE.Mesh(geometry,C.insectPaint));}}
    else for(const [mat,pieces]of this.items){const g=mergeGeometries(pieces,false);pieces.forEach(p=>p.dispose());const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;group.add(m);}return group;}
}
const clamp=v=>THREE.MathUtils.clamp(Number.isFinite(v)?v:0,0,1);
const ease=(x,a,b)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const trees=new Map(),treeRigs=new WeakMap();
function leaf(parts,mat,start,end,width=1,shape='leaf',roll=0){
  const from=new THREE.Vector3(...start),direction=new THREE.Vector3(...end).sub(from),length=direction.length();
  transform.position.copy(from);transform.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());transform.rotateY(roll);transform.scale.set(length*width,length,length);transform.updateMatrix();parts.geometry(G[shape],mat,transform.matrix);
}
function leafSpray(parts,mat,origin,angle,length=.52,shape='leaf'){
  const tip=[origin[0]+Math.cos(angle)*length*.65,origin[1]+length*.30,origin[2]+Math.sin(angle)*length*.65];
  parts.beam('stem',origin,tip,.012);
  for(let i=0;i<5;i++){
    const t=.25+i*.14,side=i%2?1:-1,a=angle+side*.92;
    const base=origin.map((v,j)=>v+(tip[j]-v)*t);
    leaf(parts,i%3?mat:(mat==='gold'?'goldLight':'leafLight'),base,[base[0]+Math.cos(a)*length*.64,base[1]+length*(.15+i*.025),base[2]+Math.sin(a)*length*.64],shape==='goldLeaf'?1.0:.85,shape,side*.22);
  }
  leaf(parts,mat,tip,[tip[0]+Math.cos(angle)*length*.45,tip[1]+length*.18,tip[2]+Math.sin(angle)*length*.45],.75,shape);
}
function blossom(parts,x,y,z,size,star=false,petal='cream'){
  if(star){for(let j=0;j<5;j++){const a=j*Math.PI*2/5;parts.add('crystal',j%2?'cream':'purple',x+Math.cos(a)*size*.43,y,z+Math.sin(a)*size*.43,size*.25,size*.11,size*.57,0,-a+Math.PI/2);}}
  else for(let j=0;j<5;j++){const a=j*Math.PI*2/5;parts.add('rock',petal,x+Math.cos(a)*size*.42,y,z+Math.sin(a)*size*.42,size*.39,size*.12,size*.39);}
  parts.add('rock','goldLight',x,y+size*.1,z,size*.21,size*.16,size*.21);
}
export function createStagedTree(kind,{variation=0}={}){
  const v=Number.isFinite(variation)?Math.abs(Math.trunc(variation))%10:0,key=`${kind}:${v}`;
  if(!trees.has(key)){
    const root=new THREE.Group();root.name=`tree-${kind}`;root.userData.variation=v;
    const body=new THREE.Group();body.name='tree-body';root.add(body);
    const trunk=new Parts(),branches=new Parts(),crown=new Parts(),bloom=new Parts(),sprout=new Parts();
    crown.growth=true;bloom.growth=true;
    const flower=kind==='flowers'||kind==='starflower',mineral=['copper','iron','diamond'].includes(kind),golden=kind==='golden';
    const tall=v===8?1.16:1,phase=v*.31,lean=v===9?.16:0;
    const bark=kind==='birch'?'birch':'bark',height=(kind==='pine'?5.55:kind==='birch'?5.05:mineral?4.60:golden?4.25:3.85)*tall;
    const attach=(x,y,z)=>{crown.anchor=[x,y,z];bloom.anchor=[x,y,z];};
    if(flower){
      for(let i=0;i<9;i++){
        const a=i*2.399+phase,r=.12+Math.sqrt(i/9)*.54,x=Math.cos(a)*r,z=Math.sin(a)*r,h=.33+(i%4)*.12;
        const bend=[x+.055*Math.sin(a),h*.57,z+.035],tip=[x+.05,h,z];
        trunk.beam('stem',[x,0,z],bend,.017);trunk.beam('stem',bend,tip,.013);
        attach(...bend);
        for(const side of [-1,1])leaf(crown,side<0?'leaf':'leafLight',bend,[bend[0]+Math.cos(a+side)*.23,bend[1]+.11,bend[2]+Math.sin(a+side)*.23],.75,'leaf');
        branches.add('rock','stem',...tip,.055,.055,.055);attach(...tip);
        for(let j=0;j<5;j++){
          const angle=j*Math.PI*2/5+a,star=kind==='starflower';
          leaf(bloom,star?(j%2?'cream':'purple'):['pink','cream','goldLight'][i%3],tip,[tip[0]+Math.cos(angle)*(star?.25:.22),tip[1]+.04,tip[2]+Math.sin(angle)*(star?.25:.22)],star?.72:1.10,star?'leaf':'petal');
        }
        bloom.add('ball','gold',tip[0],h+.046,tip[2],.047,.033,.047);
        for(let j=0;j<3;j++)bloom.add('rock','goldLight',tip[0]+Math.cos(j*2.1)*.024,h+.068,tip[2]+Math.sin(j*2.1)*.024,.012,.013,.012);
      }
    }else{
      const radius=kind==='birch'?.14:.235;
      const path=[[0,.03,0],[.075,height*.28,-.035],[-.025,height*.57,.035],[lean,height*.82,0],[lean*.7,height,0]];
      for(let j=0;j<4;j++)trunk.beam(bark,path[j],path[j+1],radius*(1-j*.21));
      for(let i=0;i<5;i++){const a=i*1.256+phase;trunk.beam(bark,[Math.cos(a)*.42,.035,Math.sin(a)*.42],[Math.cos(a)*.14,.30,Math.sin(a)*.14],.10);trunk.beam(bark,[Math.cos(a)*.14,.30,Math.sin(a)*.14],[.075,.72,0],.072);}
      if(kind==='birch')for(let i=0;i<12;i++){const a=i*2.4;trunk.add('box','barkCrease',Math.cos(a)*.117,.28+i*.34*tall,Math.sin(a)*.117,.055,.030,.022,0,-a+.9,.08);}
      else for(let i=0;i<5;i++){const a=i*1.256;trunk.beam('barkCrease',[Math.cos(a)*radius*.83,.28,Math.sin(a)*radius*.83],[.05+Math.cos(a)*radius*.50,height*.43,Math.sin(a)*radius*.50],.012);}
      const bough=(x,y,z,r=.07)=>{const root=[.025,y-.75*tall,0],elbow=[x*.42,y-.32*tall,z*.45];branches.beam(bark,root,elbow,r);branches.beam(bark,elbow,[x,y,z],r*.57);attach(x,y,z);};
      if(kind==='pine'){
        for(let row=0;row<6;row++)for(let j=0;j<5;j++){
          const a=j*1.256+row*.44+phase,r=1.12-row*.145,y=(1.8+row*.69)*tall,x=Math.cos(a)*r*.64,z=Math.sin(a)*r*.64;
          if(j===0){
            // Overlapping inner needle skirts restore the evergreen taper behind fine boughs.
            attach(lean*.4,y,0);
            crown.add('cone','pine',lean*.4,y+.30*tall,0,r*.88,(1.50-row*.055)*tall,r*.88,0,phase+row*.2);
          }
          bough(x,y,z,.061-row*.006);
          for(let k=0;k<4;k++){
            const aa=a+(k-1.5)*.30,end=[x+Math.cos(aa)*r*.45,y-.18,z+Math.sin(aa)*r*.45];
            leaf(crown,k%3?'pine':'pineLight',[x,y+.21,z],end,1.85,'oakLeaf',.18);
          }
          if(row<3&&j%2===0){bloom.beam('barkDark',[x,y,z],[x,y-.14,z],.016);bloom.add('rock','barkLight',x,y-.24,z,.065,.13,.065);}
        }
        attach(lean,5.7*tall,0);for(let j=0;j<5;j++){const a=j*1.256;leaf(crown,'pineLight',[lean,5.35*tall,0],[Math.cos(a)*.19,6.05*tall,Math.sin(a)*.19],1.05,'leaf');}
      }else if(kind==='willow'){
        for(let i=0;i<8;i++){
          const a=i*.785+phase,x=Math.cos(a)*.76,z=Math.sin(a)*.76,y=(3.6+(i%2)*.14)*tall;bough(x,y,z,.08);
          crown.add('cushion',i%2?'leaf':'willow',x*.88,y+.13,z*.88,.49,.52,.45,.08,a,.05);
          for(let strand=0;strand<2;strand++){
            let previous=[x,y+.04,z];
            for(let j=0;j<5;j++){
              const aa=a+(strand-.5)*.31,reach=.87+j*.075,tip=[Math.cos(aa)*reach,y-(j+1)*.30*tall,Math.sin(aa)*reach];
              crown.beam('stem',previous,tip,.012);
              leaf(crown,(j+strand)%3?'willow':'leafLight',tip,[tip[0]+Math.cos(aa+.7)*.11,tip[1]-.32,tip[2]+Math.sin(aa+.7)*.11],.49,'leaf');
              if(j%2===0)leaf(crown,'willow',tip,[tip[0]+Math.cos(aa-.6)*.19,tip[1]-.23,tip[2]+Math.sin(aa-.6)*.19],.42,'leaf');previous=tip;
            }
          }
        }
      }else if(mineral){
        for(let i=0;i<7;i++){
          const a=i*2.399+phase,y=(2.05+i*.39)*tall,r=.74-i*.035,x=Math.cos(a)*r,z=Math.sin(a)*r;bough(x,y,z,.095);
          crown.add('rock','barkDark',x,y-.01,z,.21,.22,.19,0,a);
          crown.add('rock',kind==='copper'?'patina':'iron',x,y+.07,z,.15,.19,.15,0,a);
          if(kind==='diamond'){
            for(let j=0;j<3;j++)bloom.add('gem',j===1?'diamondLight':'diamond',x+(j-1)*.16,y+.23+(j===1?.22:0),z+(j%2)*.07,.15+(j===1?.07:0),.46+(j===1?.21:0),.17,.12,a,(j-1)*.23);
          }else if(kind==='copper'){
            bloom.add('ore','copper',x,y+.19,z,.34,.49+(i%3)*.07,.31,.12+(i%2)*.11,a,(i%3-1)*.21);
            for(let j=0;j<3;j++)bloom.add('rock',j%2?'copper':'patina',x+Math.cos(a+j*2.1)*.23,y+.20+(j%2)*.18,z+Math.sin(a+j*2.1)*.23,.19,.17,.17,0,a+j);
          }else{
            // Fused ore lobes and broken diagonal veins, not repeated banded barrels.
            const tilt=(i%3-1)*.23;
            bloom.add('ore','iron',x,y+.16,z,.31+(i%2)*.05,.45+(i%3)*.065,.29,.13,a,tilt);
            bloom.add('ore','ironLight',x+.10*Math.cos(a),y+.38,z+.08*Math.sin(a),.22,.27,.19,.23,a+.48,-.26);
            bloom.add('ore','iron',x-.17*Math.cos(a),y+.12,z-.17*Math.sin(a),.20,.28,.18,-.14,a-.25,.36);
            for(let j=0;j<2;j++)bloom.beam('ironLight',[x-.17+j*.14,y+.08+j*.13,z+.26],[x-.055+j*.14,y+.19+j*.13,z+.25],.010);
          }
        }
      }else{
        const birch=kind==='birch',count=golden?9:birch?8:7;
        for(let i=0;i<count;i++){
          const a=i*2.399+phase,r=birch?.40:golden?.68:.70;
          const y=(birch?3.1+i*.28:golden?2.72+(i%3)*.56:3.02+(i%3)*.52)*tall;
          const x=Math.cos(a)*r+(i>3?lean:0),z=Math.sin(a)*r;bough(x,y,z,birch?.05:.085);
          if(!golden){
            crown.add('cushion',i%2?'leaf':'leafDark',x,y+.12,z,birch?.33:.49,birch?.48:.52,birch?.30:.44,.10*Math.sin(i),a,.10*Math.cos(i));
            for(let lobe=0;lobe<2;lobe++){
              const aa=a+(lobe?1:-1)*.9,xx=x+Math.cos(aa)*(birch?.16:.24),zz=z+Math.sin(aa)*(birch?.16:.24);
              crown.add('cushion',lobe?'leafMid':'leaf',xx,y+.20+(lobe?-.10:.10),zz,birch?.21:.29,birch?.27:.30,birch?.21:.28,.08,aa);
            }
          }
          else crown.add('cushion','goldShade',x,y+.12,z,.31,.32,.30,.08,a);
          for(let j=0;j<(golden?4:3);j++)leafSpray(crown,golden?'gold':birch?'leafLight':'leafMid',[x+Math.cos(a+j*2.1)*.16,y+.10+(j%2)*.15,z+Math.sin(a+j*2.1)*.16],a+j*2.1,golden?.43:birch?.37:.47,golden?'goldLeaf':birch?'leaf':'oakLeaf');
          if(golden){for(const side of [-1,1]){const xx=x+side*.20; bloom.beam('stem',[x,y,z],[xx,y-.24,z+.08],.016);bloom.add('ball','goldLight',xx,y-.32,z+.08,.072,.115,.078);bloom.add('rock','gold',xx,y-.39,z+.08,.051,.034,.051);}}
          else if(!birch)blossom(bloom,x,y+.37,z,.085,false,'cream');
        }
      }
    }
    sprout.beam('stem',[0,0,0],[0,.40,0],.025);leaf(sprout,'leafLight',[0,.23,0],[-.25,.34,.02],.8);leaf(sprout,'leaf',[0,.31,0],[.27,.44,-.01],.8);
    const stages=[trunk.finish('tree-trunk'),branches.finish('tree-branches'),crown.finish('tree-crown'),bloom.finish('tree-bloom')];
    stages.forEach(g=>body.add(g));root.add(sprout.finish('tree-sprout'));root.userData.isFlower=flower;root.userData.trunkHeight=new THREE.Box3().setFromObject(stages[0]).max.y;trees.set(key,root);
  }
  const root=trees.get(key).clone(),crown=root.getObjectByName('tree-crown'),bloom=root.getObjectByName('tree-bloom');
  treeRigs.set(root,{body:root.getObjectByName('tree-body'),trunk:root.getObjectByName('tree-trunk'),branches:root.getObjectByName('tree-branches'),crown,bloom,sprout:root.getObjectByName('tree-sprout'),trunkHeight:root.userData.trunkHeight,variation:v,crownMeshes:crown.children,bloomMeshes:bloom.children});
  animateStagedTree(root,{growth:1,time:0,variation:v});return root;
}
export function animateStagedTree(group,{growth=1,time=0,variation=0}={}){
  const r=treeRigs.get(group);if(!r)return;
  const g=clamp(growth),t=Number.isFinite(time)?time:0;
  r.body.visible=g>=.15;
  const size=.13+.87*ease(g,.12,.93);r.body.scale.set(size,size,size);
  // Keep the small living shoot at the growing trunk tip until the crown takes over.
  // Its size stays bounded; moving the child up prevents leaves being buried at the roots.
  const shootSize=(.45+ease(g,0,.27)*.6)*(1-.55*ease(g,.48,.54));
  r.sprout.visible=g<.54;r.sprout.scale.setScalar(shootSize);
  r.sprout.position.y=Math.max(0,r.trunkHeight*size-.40*shootSize)*ease(g,.15,.30);
  r.sprout.rotation.z=Math.sin(t*2.5+r.variation)*.09;
  r.trunk.visible=g>=.15;r.branches.visible=g>=.32;r.crown.visible=g>=.48;r.bloom.visible=g>=.80;
  for(const mesh of r.crownMeshes)mesh.morphTargetInfluences[0]=1-ease(g,.45,.78);
  for(const mesh of r.bloomMeshes)mesh.morphTargetInfluences[0]=1-ease(g,.8,1);
  r.body.rotation.z=Math.sin(t*1.6+r.variation)*(.008+.017*(1-g));
  // Crown morphs grow around branch anchors; no independently rotating detached canopy.
  group.userData.growthStage=g<.27?'sprout':g<.48?'branching':g<.80?'crown':g<.999?'bloom':'ready';
}

const discoveryRigs=new WeakMap();
export function createDiscovery(def){
  const root=new THREE.Group();root.name=`discovery-${def.id??def.kind}`;
  const p=new Parts();
  // Solids come from the lead's shared data; all solid geometry uses their local bounds.
  for(const solid of def.solids??[]){
    const wall=new Parts();
    const x=(solid.minX+solid.maxX)/2-def.x,z=(solid.minZ+solid.maxZ)/2-def.z,w=solid.maxX-solid.minX,d=solid.maxZ-solid.minZ,h=solid.height;
    if(def.kind==='hollow'){
      wall.add('cyl','bark',x,h*.5,z,w*.52,h,d*.50);
      for(let i=0;i<5;i++)wall.add('cyl',i%2?'bark':'barkLight',x+(i%2-.5)*w*.17,h*.48,z-d*.4+i*d*.2,w*.36,h*.96,d*.14,0,0,(i-2)*.012);
      for(let i=0;i<5;i++)wall.add('rock','moss',x,.10,z-d*.4+i*d*.2,w*.44,.14,d*.15);
      for(const side of [-1,1])wall.beam('barkDark',[x+side*w*.36,.03,z-d*.28],[x+side*w*.13,1.2,z-d*.25],.19);
    }else{
      // Overlapping stone courses provide the wall itself. A broad backing box
      // would hide these facets and restore the flat concrete-room silhouette.
      const alongX=w>d,length=Math.max(w,d),count=Math.ceil(length/.85),step=length/count;
      for(let row=0;row<4;row++)for(let i=0;i<count;i++){
        const t=(i+.5)/count-.5,stagger=(row%2?.17:-.09)*step;
        const along=t*length+stagger,depthOffset=Math.sin(i*2.1+row)*.045;
        const px=x+(alongX?along:depthOffset),pz=z+(alongX?depthOffset:along);
        const py=row===3?h-.45+(i%3-1)*.09:(row+.5)*h/4;
        wall.add('rock',(i+row*2)%5===0?'rockLight':'rock',px,py,pz,
          alongX?step*(.77+(i%2)*.07):w*.46,row===3?.44:.59,alongX?d*.46:step*(.77+(i%2)*.07));
        if(row===3&&i%3===1)wall.add('rock','moss',px,py+.31,pz,alongX?step*.46:w*.34,.09,alongX?d*.34:step*.46);
      }
      // Small crystal fans emerge from recessed stone on the inner wall face.
      for(let cluster=0;cluster<3;cluster++)for(let j=0;j<3;j++){
        const along=(cluster-1)*length*.28+(j-1)*.12;
        const px=x+(alongX?along:-w*.32),pz=z+(alongX?-Math.sign(z)*d*.32:along);
        const py=.48+cluster*.54+(j%2)*.15;
        wall.add('crystal',j===1?'diamondLight':'diamond',px,py,pz,alongX?.12:.15,.23+(j%2)*.15,alongX?.15:.12,0,0,(j-1)*.20);
      }
    }
    // Facet rotation must not grow a wall into the shared traversable opening.
    for(const [mat,geometries]of wall.items)for(const geometry of geometries){
      const a=geometry.attributes.position;
      for(let i=0;i<a.count;i++)a.setXYZ(i,THREE.MathUtils.clamp(a.getX(i),x-w/2,x+w/2),THREE.MathUtils.clamp(a.getY(i),0,h),THREE.MathUtils.clamp(a.getZ(i),z-d/2,z+d/2));
      geometry.computeVertexNormals();p.geometry(geometry,mat);geometry.dispose();
    }
  }
  if(def.kind==='garden'){
    // A sunken-looking woven garden edge stays low and nonblocking on the shared plane.
    for(let i=0;i<15;i++){
      const a=i*Math.PI*2/18+.25,x=Math.cos(a)*2.45,z=Math.sin(a)*2.45;
      p.add('rock',i%3?'rockLight':'moss',x,.055,z,.34,.065,.24,0,-a);
      if(i%2){p.add('ball','leafDark',x,.22,z,.42,.24,.31,0,a);p.add('ball','leafLight',x-.08,.34,z,.25,.15,.23);blossom(p,x,.44,z,.19,true);}
    }
    for(const x of [-1.5,1.5]){
      p.beam('barkLight',[x,0,-1.8],[x*.75,1.85,-1.9],.065);
      p.beam('barkLight',[x*.75,1.85,-1.9],[0,2.35,-1.9],.055);
      // A rooted climbing vine follows the actual leaf arc and rejoins the frame.
      // Its woody stem stays visible between leaves instead of leaving floating blobs.
      let previous=[x,.025,-1.8];
      for(let i=0;i<5;i++){
        const t=i/5,leaf=[x*(1-t*.6),.4+t*1.5,-1.9];
        p.beam('barkLight',previous,leaf,.037);
        p.add('ball','leaf',...leaf,.24,.15,.13,0,0,x>0?.4:-.4);
        if(i===1||i===3){
          const support=[x*(1-.25*leaf[1]/1.85),leaf[1],-1.8-.1*leaf[1]/1.85];
          p.beam('stem',leaf,support,.023);
          blossom(p,leaf[0]+Math.sign(x)*.065,leaf[1]+.08,-2.035,.17,false,x<0?'pink':'cream');
        }
        previous=leaf;
      }
      p.beam('barkLight',previous,[x*.56,1.977,-1.9],.032);
    }
    for(const [x,z]of [[-.8,.8],[.5,1.55],[1.05,.85]])p.add('rock','rockLight',x,.025,z,.35,.028,.28,0,x);
  }else if(def.kind==='hollow'){
    // One massive irregular trunk wraps the opening; no rectangular lintel.
    // The entire 2.2m-wide path stays clear below 2.60m, in both directions.
    const outline=[[-2.2,0],[-1.1,0],[-1.1,2.60],[-.93,2.91],[-.5,3.13],[0,3.27],[.6,3.13],[.96,2.88],[1.1,2.60],[1.1,0],[2.2,0],[2.15,1.1],[2.04,2.35],[1.85,3.8],[1.40,4.35],[.45,4.08],[-.20,4.38],[-1.55,4.17],[-2.03,2.60]];
    const shape=new THREE.Shape();shape.moveTo(...outline[0]);outline.slice(1).forEach(v=>shape.lineTo(...v));shape.closePath();
    const trunk=new THREE.ExtrudeGeometry(shape,{depth:2.72,bevelEnabled:false});trunk.translate(0,0,-1.36);p.geometry(trunk,'bark');trunk.dispose();
    for(const side of [-1,1])for(const front of [-1,1]){
      // Broad tapering bark folds and roots make the trunk read at a distance.
      for(let i=0;i<3;i++){
        const x=side*(1.30+i*.31),z=front*(1.34+(i%2)*.045);
        p.beam(i%2?'barkDark':'barkLight',[x,.16,z],[x*.90,2.32,z-.06*front],.085+i*.019);
        p.beam('bark',[side*(1.38+i*.22),.035,front*1.42],[x,.90,z],.16);
      }
      p.add('rock','moss',side*1.70,.13,front*1.05,.42,.17,.32,0,side);
    }
    // Strong living boughs and a crown replace the previous lone twig silhouette.
    p.beam('bark',[-1.08,3.6,.0],[-1.63,5.10,.38],.37);
    p.beam('barkLight',[-1.63,5.10,.38],[-.94,5.74,.55],.20);
    p.beam('bark',[.90,3.65,.18],[1.38,5.30,-.40],.32);
    p.beam('barkLight',[1.38,5.30,-.40],[.57,5.91,-.55],.17);
    p.beam('bark',[0,3.8,-.50],[-.20,5.68,-1.1],.26);
    for(const [x,y,z,s]of [[-1.35,5.55,.40,.85],[-.65,6.02,.56,.92],[.30,6.20,.22,.95],[1.25,5.78,-.45,.87],[-.20,5.8,-1.02,.94],[.85,5.45,.87,.79],[-1.12,5.02,-.70,.84]]){
      p.add('ball','leafDark',x,y,z,s,.65,s*.83,0,x);
      p.add('ball','leaf',x-.10,y+.20,z-.04,s*.90,.49,s*.79,0,z);
      p.add('ball','leafLight',x-.17,y+.43,z-.03,s*.60,.26,s*.58,0,x);
    }
    for(const [x,y,z]of [[-1.65,1.1,-1.45],[1.54,1.8,1.44],[-1.65,2.25,1.45]]){
      p.add('rock','cream',x,y,z,.23,.055,.15);p.add('rock','moss',x,y+.07,z-.06,.30,.06,.17);
    }
  }else{
    // A broken rear rock lip reads as shelter while the west entrance stays open.
    // All overhanging stone is above 2.6m, clear of the ground-level passage.
    for(let i=0;i<5;i++){
      const z=-1.8+i*.9;
      p.add('rock',i%3?'rock':'rockLight',2.05,3.20+(i===2?.18:0),z,.69,.48,.77,0,i*.08);
    }
    // Thin earth/stone patches nest the existing steps into the grotto floor.
    // They are decorative surfaces, under 2cm high, never a raised walk plane.
    for(const [x,z,sx,sz]of [[-.85,.0,2.20,1.47],[1.20,.20,1.48,1.57]])p.add('rock','soil',x,.002,z,sx,.012,sz,0,x*.13);
    for(const side of [-1,1])for(let i=0;i<7;i++)p.add('rock',i%3?'rock':'rockLight',-2.45+i*.71,.032,side*(1.55+.12*Math.sin(i*2.4)),.15+(i%3)*.07,.04,.13,0,i);
    for(let i=0;i<5;i++)p.add('rock','rockLight',-2.7+i*.72,.025,Math.sin(i*1.1)*.35,.43,.028,.34,0,i*.45);
  }
  if(def.kind==='hollow')for(const geometries of p.items.values())for(const geometry of geometries){
    const a=geometry.attributes.position;
    for(let i=0;i<a.count;i++)if(a.getY(i)<2.60){
      const wall=def.solids.find(s=>Math.sign((s.minX+s.maxX)/2-def.x)===Math.sign(a.getX(i)));
      if(wall)a.setXYZ(i,THREE.MathUtils.clamp(a.getX(i),wall.minX-def.x,wall.maxX-def.x),a.getY(i),THREE.MathUtils.clamp(a.getZ(i),wall.minZ-def.z,wall.maxZ-def.z));
    }
    geometry.computeVertexNormals();
  }
  root.add(p.finish('discovery-landmark'));
  const cache=new Parts();
  cache.add('rock',def.kind==='grotto'?'diamond':'gold',0,0,0,.24,.19,.20,0,.3);
  cache.add('box','cream',0,.10,0,.25,.04,.18);
  cache.beam('stem',[0,.1,0],[0,.39,0],.017);
  cache.add('ball','leafLight',-.11,.28,0,.15,.04,.07,0,0,-.4);
  cache.add('ball','leaf',.11,.37,0,.16,.045,.07,0,0,.4);
  const token=cache.finish('discovery-cache');token.position.y=.62;root.add(token);
  const glints=new Parts();
  for(let i=0;i<5;i++)glints.add('crystal',def.kind==='garden'?'cream':'diamondLight',Math.cos(i*1.256)*.6,.25+(i%3)*.35,Math.sin(i*1.256)*.6,.035,.09,.035);
  const sparks=glints.finish('discovery-glints');root.add(sparks);
  discoveryRigs.set(root,{token,sparks});return root;
}
export function animateDiscovery(group,{time=0,found=false}={}){
  const rig=discoveryRigs.get(group);if(!rig)return;const t=Number.isFinite(time)?time:0;
  rig.token.position.y=.62+Math.sin(t*1.6)*.065;rig.token.rotation.y=t*.45;
  rig.token.scale.setScalar(found?.62:1);rig.sparks.rotation.y=-t*.18;rig.sparks.visible=!found;
}

const animalRigs=new WeakMap(),animalTemplates=new Map();
function butterflyLobe(parts,side,outline){
  const center=outline.reduce((a,p)=>[a[0]+p[0]/outline.length,a[1]+p[1]/outline.length],[0,0]);
  const surface=(points,mat,height)=>{
    const vertices=[];for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],tri=[[side*center[0],height+.010,center[1]],[side*a[0],height,a[1]],[side*b[0],height,b[1]]];
      vertices.push(...tri.flat(),...tri.slice().reverse().map(p=>[p[0],p[1]-.002,p[2]]).flat());
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();parts.geometry(g,mat);g.dispose();
  };
  surface(outline,'barkDark',0);
  const inset=outline.map(p=>[center[0]+(p[0]-center[0])*.87,center[1]+(p[1]-center[1])*.87]);
  surface(inset,'coral',.003);
  surface(inset,'coral',-.005);
  // Paint the underside on its folded surface, retaining the dark rim without a black silhouette.
  const undersideY=(x,z)=>{
    for(let i=0;i<inset.length;i++){
      const a=inset[i],b=inset[(i+1)%inset.length],ax=a[0]-center[0],az=a[1]-center[1],bx=b[0]-center[0],bz=b[1]-center[1],dx=x-center[0],dz=z-center[1],det=ax*bz-az*bx;
      if(Math.abs(det)<1e-9)continue;
      const u=(dx*bz-dz*bx)/det,v=(ax*dz-az*dx)/det;
      if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return -.0078+.010*(1-u-v);
    }
    return -.0078;
  };
  for(const [dx,dz,size]of [[center[0],center[1],.018],[center[0]*1.3,center[1]*.8,.011]]){
    const vertices=[];
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,b=(i+1)*Math.PI/5,x1=dx+Math.cos(a)*size,z1=dz+Math.sin(a)*size*.8,x2=dx+Math.cos(b)*size,z2=dz+Math.sin(b)*size*.8;
      const tri=[[side*dx,undersideY(dx,dz),dz],[side*x1,undersideY(x1,z1),z1],[side*x2,undersideY(x2,z2),z2]];
      vertices.push(...tri.flat(),...tri.slice().reverse().flat());
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();parts.geometry(g,'cream');g.dispose();
  }
  for(let i=1;i<outline.length-1;i+=2){const q=outline[i];parts.beam('barkDark',[side*.015,.015,0],[side*q[0]*.86,.008,q[1]*.86],.0025);}
  for(const [dx,dz,size]of [[center[0],center[1],.018],[center[0]*1.3,center[1]*.8,.011]])parts.add('ball','cream',side*dx,.018,dz,size,.0025,size*.8);
}
// Paint markings into the body surface instead of attaching pebble-like spots.
const deerCoat=new THREE.IcosahedronGeometry(1,2),coatColors=[];
for(let i=0;i<deerCoat.attributes.position.count;i+=3){
  const a=deerCoat.attributes.position,center=new THREE.Vector3();for(let j=0;j<3;j++)center.add(new THREE.Vector3().fromBufferAttribute(a,i+j));center.divideScalar(3);
  const spots=[[-.60,.42],[-.34,.59],[-.05,.48],[.22,.57],[.48,.37],[-.48,.18],[-.18,.22],[.12,.19],[.40,.16]];
  const spotted=Math.abs(center.x)>.50&&spots.some(([z,y])=>Math.pow((center.z-z)/.092,2)+Math.pow((center.y-y)/.073,2)<1);
  const color=new THREE.Color(spotted?'#edd8af':center.y<-.35?'#d0af82':'#b78d61');for(let j=0;j<3;j++)coatColors.push(color.r,color.g,color.b);
}
deerCoat.setAttribute('color',new THREE.Float32BufferAttribute(coatColors,3));
C.deerCoat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.93,flatShading:true});
export function createAnimal(kind){
  if(!animalTemplates.has(kind)){
    const root=new THREE.Group();root.name=`animal-${kind}`;
    const body=new Parts();
    const joint=(parent,name,x,y,z,make)=>{const g=new THREE.Group();g.name=name;g.position.set(x,y,z);const p=new Parts();if(make){make(p);g.add(p.finish(`${name}-mesh`,kind==='bee'||kind==='grub'));}parent.add(g);return g;};
    if(kind==='bee'){
      body.add('ball','goldLight',0,.012,-.028,.050,.048,.083);
      body.add('ball','barkDark',0,.020,.044,.044,.046,.044);
      body.add('ball','black',0,.018,.086,.036,.037,.030);
      for(let i=0;i<3;i++)body.add('cyl','barkDark',0,.012,-.01-i*.028,.044-i*.006,.012,.044-i*.006,Math.PI/2);
      for(const side of [-1,1]){
        body.add('ball','white',side*.026,.032,.107,.013,.016,.008);
        body.add('ball','black',side*.029,.032,.112,.007,.010,.004);
        body.beam('barkDark',[side*.014,.047,.086],[side*.030,.079,.112],.003);
        body.add('ball','gold',side*.030,.079,.112,.005,.005,.005);
        for(let i=0;i<3;i++){const z=.028-i*.027;body.beam('barkDark',[side*.028,-.007,z],[side*.052,-.041,z-.006],.004);body.beam('barkDark',[side*.052,-.041,z-.006],[side*.048,-.05,z+.007],.003);}
        body.add('ball','gold',side*.049,-.033,-.032,.013,.018,.013);
        joint(root,side<0?'left-wing':'right-wing',side*.027,.045,.018,p=>{
          leaf(p,'white',[0,0,0],[side*.12,.014,-.031],.89,'petal');
          leaf(p,'cream',[0,-.004,-.01],[side*.085,.004,-.097],.79,'petal');
          p.beam('blue',[0,.004,0],[side*.094,.014,-.035],.0018);
        });
      }
    }else if(kind==='grub'){
      for(let i=0;i<6;i++)joint(root,`grub-segment-${i}`,0,.042,-i*.044,p=>{
        p.add('ball',i%2?'leafLight':'willow',0,0,0,.042-i*.003,.038-i*.002,.037);
        if(i<5)for(const side of [-1,1])p.add('ball','barkDark',side*(.029-i*.002),-.028,.005,.010,.012,.016);
        if(i===0){
          p.add('ball','cream',0,.010,.027,.037,.032,.018);
          for(const side of [-1,1]){p.add('ball','black',side*.019,.020,.041,.006,.009,.006);p.add('ball','white',side*.020,.023,.046,.002,.003,.002);p.beam('stem',[side*.022,.033,.012],[side*.025,.066,.027],.003);p.add('ball','goldLight',side*.025,.066,.027,.006,.007,.006);}
          p.beam('barkDark',[-.009,.001,.045],[.009,.001,.045],.002);
        }
      });
    }else if(kind==='butterfly'){
      body.add('ball','barkDark',0,.014,0,.024,.022,.072);
      body.add('ball','black',0,.016,.077,.031,.029,.031);
      body.add('ball','coral',0,.012,-.070,.015,.018,.055);
      for(let i=0;i<3;i++)body.add('cyl','cream',0,.012,-.042-i*.024,.015,.005,.015,Math.PI/2);
      for(const side of [-1,1]){
        body.beam('barkDark',[side*.012,.026,.087],[side*.027,.055,.121],.0035);
        body.beam('barkDark',[side*.027,.055,.121],[side*.044,.057,.133],.003);
        body.add('ball','goldLight',side*.044,.057,.133,.005,.005,.005);
        body.add('ball','black',side*.023,.022,.093,.008,.009,.007);body.add('ball','cream',side*.026,.025,.098,.0025,.0025,.002);
        joint(root,side<0?'left-wing':'right-wing',side*.017,.013,0,p=>{
          butterflyLobe(p,side,[[0,.012],[.067,.113],[.151,.184],[.198,.158],[.214,.089],[.186,.025],[.118,-.015],[.028,-.015]]);
          butterflyLobe(p,side,[[.014,-.004],[.109,-.013],[.168,-.063],[.148,-.128],[.091,-.147],[.042,-.104],[.010,-.050]]);
        });
      }
    }else if(kind==='bird'){
      body.add('ball','blue',0,.20,-.018,.146,.174,.221);
      body.add('ball','birdDark',0,.20,-.13,.125,.13,.13);
      body.add('ball','cream',0,.16,.093,.111,.124,.141);
      for(let i=-1;i<=1;i++)leaf(body,i===0?'birdDark':'blue',[i*.031,.185,-.17],[i*.078,.145,-.43+(i===0?-.03:0)],1.1,'leaf');
      joint(root,'animal-head',0,.326,.104,p=>{
        p.add('ball','blue',0,.018,0,.136,.122,.133);
        p.add('ball','birdLight',0,.089,.025,.105,.058,.085);
        for(let j=0;j<3;j++)leaf(p,j%2?'blue':'birdLight',[(j-1)*.025,.110,-.02],[(j-1)*.029,.119,-.088],.76,'leaf');
        p.add('ball','cream',0,-.021,.080,.094,.067,.078);
        for(const side of [-1,1]){
          p.add('ball','cream',side*.094,.012,.058,.049,.053,.047);
          p.add('ball','black',side*.112,.031,.078,.023,.028,.018,0,side*.5);
          p.add('ball','white',side*.122,.041,.085,.007,.008,.006);
        }
        p.add('cone','gold',0,-.012,.165,.044,.126,.032,Math.PI/2);
        p.add('cone','barkDark',0,-.032,.151,.033,.087,.014,Math.PI/2);
      });
      for(const side of [-1,1]){
        const wing=joint(root,side<0?'left-wing':'right-wing',side*.12,.247,-.012,p=>{
          leaf(p,'blue',[0,0,.045],[side*.235,-.008,-.072],1.60,'petal');
          leaf(p,'birdLight',[0,.011,.047],[side*.188,.002,-.034],1.0,'leaf');
          for(let j=0;j<3;j++)leaf(p,j%2?'blue':'birdLight',[side*.018,.014,.035-j*.026],[side*(.137+j*.014),.020,-.022-j*.035],.51,'leaf');
        });
        joint(wing,side<0?'left-wrist':'right-wrist',side*.165,-.009,-.064,p=>{
          for(let i=0;i<5;i++)leaf(p,i%3?'blue':'birdDark',[side*.012,0,.017-i*.025],[side*(.20-i*.017),-.015,-.044-i*.051],.77,'leaf');
          for(let i=0;i<3;i++)leaf(p,'cream',[side*.015,.009,-.035-i*.025],[side*.13,.007,-.077-i*.025],.37,'leaf');
        });
        joint(root,side<0?'left-foot':'right-foot',side*.050,.080,.018,p=>{
          p.beam('barkDark',[0,0,0],[0,-.073,.015],.009);
          for(const spread of [-1,0,1])p.beam('barkDark',[0,-.074,.015],[spread*.024,-.076,.080],.005);
          p.beam('barkDark',[0,-.073,.015],[0,-.070,-.028],.005);
        });
      }
    }else{
      transform.position.set(0,.75,-.018);transform.rotation.set(0,0,0);transform.scale.set(.247,.275,.49);transform.updateMatrix();
      // This private geometry carries baked coat colors; it is cached with the model.
      const coat=new THREE.Mesh(deerCoat,C.deerCoat);coat.position.copy(transform.position);coat.scale.copy(transform.scale);coat.castShadow=true;coat.receiveShadow=true;root.add(coat);
      body.add('ball','deer',0,.76,.27,.218,.265,.22);
      body.add('ball','deer',0,.75,-.30,.235,.275,.24);
      body.add('ball','deerLight',0,.62,.245,.15,.20,.145);
      const neck=joint(root,'animal-head',0,.89,.26,p=>{
        p.beam('deer',[0,-.07,0],[0,.24,.18],.131);
        p.beam('deerLight',[0,-.07,.07],[0,.19,.26],.077);
        p.add('ball','deer',0,.267,.217,.143,.16,.186);
        p.add('ball','deerLight',0,.204,.352,.112,.080,.137);
        p.add('ball','deerShade',0,.195,.436,.079,.053,.054);
        p.add('ball','black',0,.214,.464,.061,.035,.028);
        p.beam('barkDark',[-.047,.167,.425],[.047,.167,.425],.006);
        for(const side of [-1,1]){
          p.add('ball','deerLight',side*.119,.285,.285,.039,.053,.038,0,side*.5);
          p.add('ball','black',side*.137,.29,.302,.026,.038,.021,0,side*.55);
          p.add('ball','white',side*.145,.303,.31,.008,.011,.007);
          p.beam('deerShade',[side*.115,.34,.289],[side*.142,.33,.270],.012);
        }
      });
      for(const side of [-1,1])joint(neck,side<0?'left-ear':'right-ear',side*.104,.350,.166,p=>{
        p.add('ball','deer',0,.020,0,.040,.068,.036,0,0,-side*.2);
        leaf(p,'deer',[0,0,0],[side*.119,.25,-.024],.73,'leaf');
        leaf(p,'earPink',[side*.014,.025,.015],[side*.101,.217,.001],.47,'leaf');
      });
      joint(root,'animal-tail',0,.85,-.43,p=>{
        leaf(p,'deer',[0,0,0],[0,.14,-.185],1.2,'leaf');
        leaf(p,'deerLight',[0,.004,-.018],[0,.12,-.18],.69,'leaf');
      });
      for(const [name,x,z]of [['leg-fl',-.155,.29],['leg-fr',.155,.29],['leg-bl',-.167,-.31],['leg-br',.167,-.31]]){
        const leg=joint(root,name,x,.68,z,p=>{
          p.add('ball','deer',0,-.086,0,.077,.151,.082);
          p.beam('deer',[0,-.06,0],[0,-.32,0],.051);
          p.add('ball','deerShade',0,-.32,0,.048,.048,.048);
        });
        const knee=joint(leg,`${name}-knee`,0,-.32,0,p=>{
          p.beam('deer',[0,0,0],[0,-.29,0],.030);
          p.add('ball','deerLight',0,-.272,0,.031,.063,.034);
        });
        joint(knee,`${name}-hoof`,0,-.31,0,p=>{
          p.add('rock','barkDark',0,-.040,.015,.055,.047,.071);
          p.add('box','black',0,-.041,.071,.008,.036,.007);
        });
      }
    }
    root.add(body.finish('animal-body',kind==='bee'||kind==='grub'));animalTemplates.set(kind,root);
  }
  const root=animalTemplates.get(kind).clone();
  const get=name=>root.getObjectByName(name);
  animalRigs.set(root,{kind,segments:Array.from({length:6},(_,i)=>get(`grub-segment-${i}`)),body:get('animal-body'),head:get('animal-head'),left:get('left-wing'),right:get('right-wing'),wrists:[get('left-wrist'),get('right-wrist')],feet:[get('left-foot'),get('right-foot')],ears:[get('left-ear'),get('right-ear')],tail:get('animal-tail'),legs:['leg-fl','leg-fr','leg-bl','leg-br'].map(n=>({hip:get(n),knee:get(`${n}-knee`),hoof:get(`${n}-hoof`)}))});
  animateAnimal(root,{time:0,walk:0,perch:1});return root;
}
export function animateAnimal(group,{time=0,walk=0,perch=0,sniff=0}={}){
  const r=animalRigs.get(group);if(!r)return;const t=Number.isFinite(time)?time:0,w=clamp(walk),p=clamp(perch);
  if(r.kind==='bee'){
    const flap=.35+Math.sin(t*47)*.66;r.left.rotation.z=-flap;r.right.rotation.z=flap;
  }else if(r.kind==='grub'){
    r.segments.forEach((segment,i)=>{segment.position.x=Math.sin(t*4-i*.67)*.008*w;segment.position.y=.042+Math.max(0,Math.sin(t*4-i*.67))*.009*w;segment.rotation.y=Math.sin(t*4-i*.67)*.10*w;});
  }else if(r.kind==='butterfly'){
    const flap=.18+Math.sin(t*(14-5*p))*(1.02-.60*p);
    r.left.rotation.z=-flap;r.right.rotation.z=flap;
    r.body.rotation.x=Math.sin(t*2.1)*.06*(1-p);
  }else if(r.kind==='bird'){
    const flap=Math.sin(t*13)*.84*(1-p);
    r.left.rotation.set(0,-1.13*p,.39*p-flap);r.right.rotation.set(0,1.13*p,-.39*p+flap);
    r.wrists[0].rotation.set(0,-.44*p,-Math.sin(t*13-.5)*.24*(1-p));r.wrists[1].rotation.set(0,.44*p,Math.sin(t*13-.5)*.24*(1-p));
    r.feet.forEach(foot=>{foot.rotation.x=-.75*(1-p);});
    r.head.rotation.set(Math.sin(t*1.7)*.06*p,Math.sin(t*.85)*.22*p,Math.sin(t*1.1)*.04*p);
  }else{
    // Runtime walk/sniff targets can switch discretely; the presentation settles softly.
    const reset=r.lastTime===undefined||t<r.lastTime,dt=reset?0:Math.min(.10,Math.max(0,t-r.lastTime));
    const blend=1-Math.exp(-dt*8);
    r.walkWeight=reset?w:r.walkWeight+(w-r.walkWeight)*blend;
    r.sniffWeight=reset?clamp(sniff):r.sniffWeight+(clamp(sniff)-r.sniffWeight)*blend;r.lastTime=t;
    const moving=r.walkWeight,noseDown=r.sniffWeight*(1-moving);
    r.head.rotation.set((.73+.16*Math.sin(t*1.6))*noseDown,Math.sin(t*.72)*.12*(1-moving),Math.sin(t*.91)*.035);
    r.ears.forEach((ear,i)=>{ear.rotation.z=(i?1:-1)*(.07+Math.sin(t*1.6+i*1.8)*.055);});
    r.tail.rotation.y=Math.sin(t*2.2)*.20;
    // Two-bone legs track a slow grounded stance; only the swing foot lifts.
    // At the runtime's .5m/s, a .30m stance sweep lasts .6s, avoiding treadmill sliding.
    r.legs.forEach(({hip,knee,hoof},i)=>{
      const phase=((t+[0,.5,.75,.25][i])%1+1)%1,stance=phase<.6;
      const u=stance?phase/.6:(phase-.6)/.4;
      const z=(stance?.15-.30*u:-.15+.30*(u*u*(3-2*u)))*moving;
      const lift=stance?0:Math.sin(u*Math.PI)*.09*moving;
      const dy=.081+lift-.68,d=Math.min(.6299,Math.hypot(dy,z));
      const bend=Math.acos(THREE.MathUtils.clamp((d*d-.32*.32-.31*.31)/(2*.32*.31),-1,1))*(i<2?1:-1);
      const angle=Math.atan2(-z,-dy)-Math.atan2(.31*Math.sin(bend),.32+.31*Math.cos(bend));
      hip.rotation.x=angle;knee.rotation.x=bend;hoof.rotation.x=-angle-bend;
    });
  }
}
