import {solidInterval,reefBlocked,reefFloor,reefCeiling} from '../src/reef-collision.js';
import {Scene} from 'three';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDelightSystem} from '../src/delight-runtime.js';
import {createWaterFlow} from '../src/water-flow.js';
import {WATER_PORTS} from '../src/water-spec.js';
import {standingPlacement} from '../src/standing-placement.js';
import {buildingBoxes,touches,placementClearance} from '../src/building.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,build,serialize,deserialize,validateBuild,validatePlant,dig} from '../src/state.js';
import {placeDelight,validateDelight,naturalPropBase,boxesOverlap,propBoxes} from '../src/delights.js';
import {pumpIntake} from '../src/water-spec.js';
import {waterJoinPlans} from '../src/water-geometry.js';
import {describeWaterNetwork,waterReservations} from '../src/water-connections.js';
const funded=()=>{const s=freshState();for(const k in s.inventory)s.inventory[k]=1000;return s;};
const toy=(s,kind,gx,gz,host=null,rotation=0)=>{const p={kind,gx,gz,rotation,hostId:host?.id??null,baseY:host?host.baseY+host.level*2.4+.15:naturalPropBase(kind,gx,gz)},r=placeDelight(s,p);assert.ok(r.ok,JSON.stringify({p,r}));return r.prop;};
function tower(s,gx,gz,levels){
 const baseY=naturalPropBase('gutter',gx,gz)+.3,base={gx,gz,baseY,level:0,rotation:0,material:'wood',kind:'floor'};
 let floor;
 for(let level=0;level<=levels;level++){
  const r=build(s,{...base,level});assert.ok(r.ok,JSON.stringify(r));floor=r.piece;
  if(level<levels){const w=build(s,{...base,level,kind:'wall'});assert.ok(w.ok,JSON.stringify(w));}
 }
 return floor;
}
test('own-cell smallest wet step works in all directions, deep source and legacy shore remain real',()=>{
 for(const rotation of [0,1,2,3]){
  const s=funded(),p=toy(s,'pump',0,16,null,rotation),q=pumpIntake(p);
  assert.equal(q.ownCell,true);assert.ok(Math.abs(q.cell.waterY-q.cell.height-.3)<1e-8);
  assert.ok(q.mouth.y-.1>q.cell.height);assert.ok(q.mouth.y+.1<q.cell.waterY);
  assert.equal(describeWaterNetwork(s).nodes[0].sourceValid,true);
 }
 const s=funded();assert.equal(pumpIntake(toy(s,'pump',0,35)).ownCell,true);
 const shore=toy(funded(),'pump',0,15,null,2);assert.equal(pumpIntake(shore).ownCell,false);
 assert.equal(pumpIntake({kind:'pump',gx:0,gz:0,baseY:0,rotation:0}).ok,false);
});
test('paid supported receiver above four metres gets physical riser; steep downstream join clears deck edge',()=>{
 const s=funded(),high=tower(s,1,19,2),low=tower(s,2,19,1),pump=toy(s,'pump',0,19),channel=toy(s,'gutter',1,19,high),end=toy(s,'gutter',2,19,low);
 const net=describeWaterNetwork(s),rise=net.joins.find(j=>j.from===pump.id),fall=net.joins.find(j=>j.from===channel.id);
 assert.ok(rise);assert.equal(rise.kind,'pipe');assert.ok(rise.path.at(-1).y-pumpIntake(pump).mouth.y>4);
 assert.ok(fall);assert.equal(fall.kind,'trough');assert.ok(fall.path[0].y-fall.path.at(-1).y>.6);assert.ok(fall.path.length>2,'deck needs lipped chute');
 assert.equal(net.edges.length,2);assert.ok(waterReservations(s).length);
 assert.deepEqual(deserialize(serialize(s)).delights,s.delights);
 const before=serialize(s),bad={kind:'gutter',gx:3,gz:19,baseY:100,hostId:null,rotation:0};
 assert.equal(placeDelight(s,bad).ok,false);assert.equal(serialize(s),before);
 assert.equal(validateDelight(s,{...bad,baseY:NaN}).ok,false);
});
test('gravity never climbs and geometry rejects nonfinite paths',()=>{
 const a={x:.9,y:0,z:0,nx:1,nz:0,name:'outlet'},b={x:1.1,y:1,z:0};
 assert.deepEqual(waterJoinPlans({id:1,kind:'gutter'},{id:2},a,b),[]);
 assert.deepEqual(waterJoinPlans({id:1,kind:'pump'},{id:2},a,{...b,y:Infinity}),[]);
});
test('full-width obstruction blocks supply geometry and reverse paid placement',()=>{
 const s=funded(),high=tower(s,1,19,2),pump=toy(s,'pump',0,19),channel=toy(s,'gutter',1,19,high);
 const net=describeWaterNetwork(s),join=net.joins[0],middle=join.boxes[Math.floor(join.boxes.length/2)];
 const obstacle={...middle,minZ:middle.maxZ-.015,maxZ:middle.maxZ+.03};
 assert.equal(describeWaterNetwork(s,{solidsAt:()=>[obstacle]}).edges.length,0,'edge wall catches more than old thin stream');
 assert.ok(join.boxes.some(b=>boxesOverlap(b,obstacle,.001)));
 const wall={gx:1,gz:19,baseY:high.baseY,level:1,rotation:1,kind:'wall',material:'wood'};
 const before=serialize(s);assert.equal(validateBuild(s,wall).ok,false);assert.equal(build(s,wall).ok,false);assert.equal(serialize(s),before);
 const reverse=funded(),h=tower(reverse,1,19,2);assert.ok(build(reverse,wall).ok);toy(reverse,'pump',0,19);
 const p={kind:'gutter',gx:1,gz:19,baseY:h.baseY+h.level*2.4+.15,hostId:h.id,rotation:0},snapshot=serialize(reverse);
 assert.equal(placeDelight(reverse,p).ok,false);assert.equal(serialize(reverse),snapshot);
});

test('runtime consumes planned path, keeps dry shape on stop, and replaces only changed links',()=>{
 const s=funded(),high=tower(s,1,19,2),pump=toy(s,'pump',0,19),channel=toy(s,'gutter',1,19,high),scene=new Scene();
 const sys=createDelightSystem({scene,getState:()=>s,getPlayer:()=>({x:0,z:38}),changed(){},event(){},getBodies:()=>[],moveRiders(){},obstacles:()=>[]});
 for(let i=0;i<30;i++)sys.update(.1,i*.1);
 const key=pump.id+':outlet',group=sys.links.get(key);assert.ok(group.getObjectByName('flow').visible);assert.ok(sys.waterSolids().length);
 assert.ok(sys.motion.get(channel.id).flow>0);
 sys.use(pump.id);for(let i=0;i<30;i++)sys.update(.1,3+i*.1);
 assert.equal(sys.links.get(key),group);assert.equal(group.getObjectByName('flow').visible,false);assert.ok(group.getObjectByName('delivery-pipe').visible);
 assert.ok(sys.waterSnapshot().nodes.every(n=>n.flow===0&&n.stored===0));
 s.delights=s.delights.filter(p=>p.id!==channel.id);sys.sync();assert.notEqual(sys.links.get(key),group);assert.equal(group.parent,null);assert.equal(group.children.length,0);
 assert.equal(sys.waterSolids().length,0);
});
test('actual main preview/commit protects bodies in an added riser, then places when clear',()=>{
 const state=funded(),high=tower(state,1,19,2);toy(state,'pump',0,19);
 const candidate={kind:'gutter',gx:1,gz:19,baseY:high.baseY+4.8+.15,hostId:high.id,rotation:0};
 const c={state,feet:0,vy:0,pos:{x:.9,z:38},camera:{position:{x:.9,y:1.7,z:38,set(){}}},
 isToy:()=>true,standingPlacement,boxes:p=>buildingBoxes(p,{state}),placementClearance,touches,validateBuild,build,propBoxes,boxesOverlap,validateDelight,placeDelight,
 residents:{bodies:()=>[]},outerBodies:()=>[],marineLife:{animals:[],overlapsBuilding:()=>false},physicalSolids:()=>[],naturalSolids:()=>[],nearbyResources:()=>[],isFlower:()=>false,
 plantVolume:()=>null,world:{colliders:[]},activeDiscoveries:()=>[],WATER_PORTS,describeWaterNetwork,createWaterFlow,worldRuntime:{version:1},connectionPreviewKey:'',connectionPreview:null};
 vm.createContext(c);const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('function placementStanding('),source.indexOf('function toyHint(')),c);
 const before=serialize(state);assert.equal(c.placementResult(candidate).ok,false);assert.equal(c.commitPlacement(candidate).ok,false);assert.equal(serialize(state),before);
 c.pos.x=4;c.camera.position.x=4;
 assert.equal(c.placementResult(candidate).ok,true);assert.equal(c.commitPlacement(candidate).ok,true);
});

test('own-water pocket intake never depends on wet neighbouring tiles',()=>{
 for(const rotation of [0,1,2,3]){
  const samples=[],surface=(x,z)=>{const own=Math.abs(x)<1&&Math.abs(z)<1;samples.push(own);return {floor:0,height:0,waterY:own?.3:null};};
  const q=pumpIntake({kind:'pump',gx:0,gz:0,baseY:0,rotation},{surface});
  assert.equal(q.ok,true);assert.equal(q.ownCell,true);assert.deepEqual(samples,[true]);
  assert.ok(q.mouth.y-.1>0&&q.mouth.y+.1<.3);
 }
});

test('runtime invalidates planned joins when external world solids change',()=>{
 const s=funded(),high=tower(s,1,19,2),pump=toy(s,'pump',0,19);toy(s,'gutter',1,19,high);
 let version=0,obstacles=[];const join=describeWaterNetwork(s).joins[0],block=join.boxes[Math.floor(join.boxes.length/2)];
 const sys=createDelightSystem({scene:new Scene(),getState:()=>s,getPlayer:()=>({x:0,z:38}),changed(){},event(){},getBodies:()=>[],moveRiders(){},obstacles:()=>[],solidsAt:()=>obstacles,geometryVersion:()=>version});
 sys.update(.1,0);const old=sys.links.get(pump.id+':outlet');assert.ok(sys.waterSolids().length);
 obstacles=[block];version++;sys.update(.1,.1);assert.equal(sys.waterSolids().length,0);assert.equal(old.parent,null);assert.ok(sys.waterSnapshot().rejected.some(e=>e.reason==='blocked'));
 obstacles=[];version++;sys.update(.1,.2);assert.ok(sys.waterSolids().length);assert.equal(sys.waterSnapshot().rejected.length,0);
});

test('actual main refreshes picking after world-triggered join replacement',()=>{
 const state=funded(),high=tower(state,1,19,2),pump=toy(state,'pump',0,19);toy(state,'gutter',1,19,high);
 let obstacles=[];const runtime={version:0,update(){this.version++;},roots:()=>[]};
 const delights=createDelightSystem({scene:new Scene(),getState:()=>state,getPlayer:()=>({x:0,z:38}),changed(){},event(){},getBodies:()=>[],moveRiders(){},obstacles:()=>[],solidsAt:()=>obstacles,geometryVersion:()=>runtime.version});
 delights.update(.1,0);const key=pump.id+':outlet',old=delights.links.get(key),join=describeWaterNetwork(state).joins[0];
 obstacles=[join.boxes[Math.floor(join.boxes.length/2)]];
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),refresh=source.slice(source.indexOf('function refreshInteractive('),source.indexOf('function syncWild('));
 const start=source.indexOf(' const worldStart=performance.now();'),frame=source.slice(start,source.indexOf(' elapsed+=dt;',start));
 const c={performance:{now:()=>0},worldRuntime:runtime,pos:{x:0,z:38},wildCell:'0,4',syncWild(){},worldVersion:0,worldTiming:[],delights,interactive:[old],plotsGroup:{},plantMeshes:new Map(),wildMeshes:new Map(),buildMeshes:new Map()};
 vm.createContext(c);vm.runInContext(refresh+frame,c);
 const current=delights.links.get(key);assert.notEqual(current,old);assert.equal(old.parent,null);
 assert.ok(c.interactive.includes(current));assert.equal(c.interactive.includes(old),false);
 delights.update(.1,.1);assert.equal(delights.links.get(key),current);assert.ok(c.interactive.includes(current));
 obstacles=[];vm.runInContext('{'+frame+'}',c);assert.ok(c.interactive.includes(delights.links.get(key)));assert.equal(c.interactive.includes(current),false);
});

test('actual main physical water solids support reef movement queries without missing planes',()=>{
 const s=funded(),high=tower(s,1,19,2);toy(s,'pump',0,19);toy(s,'gutter',1,19,high);
 const sys=createDelightSystem({scene:new Scene(),getState:()=>s,getPlayer:()=>({x:0,z:38}),changed(){},event(){},getBodies:()=>[],moveRiders(){},obstacles:()=>[]});
 sys.sync();const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const c={reefSolids:[],worldRuntime:{solidsAt:()=>[]},delights:sys};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function naturalSolids('),source.indexOf('function selectedBuild(')),c);
 const solids=c.physicalSolids(.9,38);assert.ok(solids.length);
 for(const b of solids){
  const x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2;
  assert.deepEqual(solidInterval(b,x,z),{minY:b.minY,maxY:b.maxY});
  assert.equal(reefBlocked([b],x,z,b.minY,{step:0}),true);
  assert.equal(reefFloor([b],x,z,b.maxY,-100),b.maxY);
  assert.equal(reefCeiling([b],x,z,b.minY-2),b.minY);
 }
});
