import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from 'three';
import {freshState,serialize,deserialize,dig,plant,fill,validatePlant} from '../src/state.js';
import {placeDelight,validateDelight,propBoxes,naturalPropBase,stepLift,rotateXZ,boxesOverlap} from '../src/delights.js';
import {pumpIntake,WATER_PORTS,ADDON_BOXES} from '../src/water-spec.js';
import {describeWaterNetwork,waterPorts} from '../src/water-connections.js';
import {createDelightSystem} from '../src/delight-runtime.js';
const funded=()=>{const s=freshState();for(const k of Object.keys(s.inventory))s.inventory[k]=100;return s;};
const put=(s,kind,gx,gz,rotation=0)=>{
 const result=placeDelight(s,{kind,gx,gz,rotation,baseY:naturalPropBase(kind,gx,gz),hostId:null});
 assert.ok(result.ok,kind+' '+JSON.stringify(result));return result.prop;
};
function runtime(s,bodies=[]){
 const sys=createDelightSystem({scene:new Scene(),getState:()=>s,getPlayer:()=>({x:0,z:38}),changed:()=>{},event:()=>{},getBodies:()=>bodies,moveRiders:(ids,d)=>{for(const b of bodies)if(ids.includes(b.id))b.feet+=d;},obstacles:id=>s.delights.flatMap(p=>p.id===id?propBoxes(p).slice(0,-1):propBoxes(p))});sys.sync();return sys;
}
test('shore and deep seabed pumps use real columns and preserve complete paid records on reload',()=>{
 for(const [gx,gz,rotation] of [[0,16,2],[0,35,0]]){
  const s=funded(),p=put(s,'pump',gx,gz,rotation),intake=pumpIntake(p);
  assert.ok(intake.ok);assert.ok(intake.mouth.y>intake.cell.height&&intake.mouth.y<intake.cell.waterY);
  assert.ok(p.baseY+WATER_PORTS.pump.outlet[1]>intake.mouth.y);
  const before=serialize(s),restored=deserialize(before);assert.deepEqual(restored.delights,s.delights);assert.deepEqual(restored.inventory,s.inventory);
  const sys=runtime(s);for(let i=0;i<10;i++)sys.update(.1,i*.1);assert.ok(sys.motion.get(p.id).flow>0);
  sys.use(p.id);for(let i=0;i<10;i++)sys.update(.1,1+i*.1);assert.equal(sys.motion.get(p.id).flow,0);
 }
 const dry={kind:'pump',gx:0,gz:0,baseY:0,rotation:0};assert.equal(pumpIntake(dry).ok,false);
});
test('paid pump-splitter-corner branches conserve half flow and stop after source off',()=>{
 const s=funded(),pump=put(s,'pump',0,19),split=put(s,'splitter',1,19),wheel=put(s,'waterWheel',2,19),corner=put(s,'cornerChannel',1,20,3),fountain=put(s,'fountain',0,20,2);
 const net=describeWaterNetwork(s);assert.equal(net.edges.length,4);assert.equal(net.nodes.find(n=>n.id===pump.id).sourceValid,true);
 const sys=runtime(s);for(let i=0;i<30;i++)sys.update(.1,i*.1);
 assert.equal(sys.motion.get(wheel.id).flow,.5);assert.equal(sys.motion.get(fountain.id).flow,.5);
 const water=sys.waterSnapshot(),stored=water.nodes.reduce((a,n)=>a+n.stored,0),t=water.totals;
 assert.ok(Math.abs(t.source+t.poured-stored-t.consumed-t.spilled)<1e-8);
 sys.use(pump.id);for(let i=0;i<30;i++)sys.update(.1,3+i*.1);assert.ok(sys.waterSnapshot().nodes.every(n=>n.flow===0&&n.stored===0));
 assert.deepEqual(deserialize(serialize(s)).delights,s.delights);
});
test('downhill wheel outlet powers a lower fountain and adjacent lift, then safely returns to manual control',()=>{
 const s=funded(),gutter=put(s,'gutter',0,18,3),wheel=put(s,'waterWheel',0,19,3),fountain=put(s,'fountain',0,20,3),lift=put(s,'lift',-1,19,3);
 const graph=describeWaterNetwork(s);assert.equal(graph.edges.length,2);assert.equal(graph.drives.length,1);
 const body={id:'player',x:lift.gx*2,z:lift.gz*2,feet:lift.baseY+.15,height:1.65,radius:.24},sys=runtime(s,[body]);
 for(let i=0;i<70;i++){sys.pour(gutter.id,.1);sys.update(.1,i*.1);}
 assert.ok(lift.liftY>.2);assert.ok(sys.motion.get(fountain.id).flow>0);assert.ok(Math.abs(body.feet-(lift.baseY+.15+lift.liftY))<1e-8);
 s.delights=s.delights.filter(p=>p.id!==wheel.id);const height=lift.liftY;sys.update(.1,7.1);assert.equal(lift.liftY,height);
 sys.update(.1,7.2);assert.equal(lift.liftY,height);sys.use(lift.id);sys.update(.1,7.3);assert.notEqual(lift.liftY,height);
});
test('revised paired anchors fit all rotations; every original-clear sampled rider sweep remains clear',()=>{
 for(let rotation=0;rotation<4;rotation++){
  const [dx,dz]=rotateXZ(0,2,rotation),wheel={id:1,kind:'waterWheel',gx:0,gz:0,baseY:0,rotation},lift={id:2,kind:'lift',gx:dx/2,gz:dz/2,baseY:0,rotation,liftY:0};
  const a=waterPorts(wheel).find(p=>p.name==='drive'),b=waterPorts(lift).find(p=>p.name==='drive');assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)-.2)<1e-9);
  const all=propBoxes(lift),oldPosts=all.slice(0,4),mount=all.slice(4,-1);
  for(const radius of [.24,.31])for(let x=-.8;x<=.8001;x+=.2)for(let z=-.8;z<=.8001;z+=.2){
   const [rx,rz]=rotateXZ(x,z,rotation),rider={id:'r',x:lift.gx*2+rx,z:lift.gz*2+rz,feet:.15,height:1.7,radius};
   const old=stepLift(lift,2.4,.1,[rider],oldPosts);if(old.blocked)continue;
   assert.equal(stepLift(lift,2.4,.1,[rider],[...oldPosts,...mount]).blocked,false);
  }
 }
});

test('water models reuse shared geometry and dispose every private intake',async()=>{
 const {createDelight,disposeDelight}=await import('../src/delight-visuals.js');
 for(const kind of ['pump','fountain','cornerChannel','splitter','gutter','waterWheel','lift']){
  let shared;const privateSeen=new Set(),disposed=new Set();
  for(let i=0;i<20;i++){const model=createDelight(kind),current=new Set();model.traverse(o=>{if(!o.geometry)return;if(o.geometry.userData.privateResources){privateSeen.add(o.geometry);o.geometry.addEventListener('dispose',()=>disposed.add(o.geometry));}else current.add(o.geometry);});if(shared)assert.deepEqual(current,shared,kind+' shared geometry identity');else shared=current;disposeDelight(model);}
  assert.equal(disposed.size,privateSeen.size,kind+' private geometry disposal');if(kind==='pump')assert.equal(privateSeen.size,20);
 }
});

test('plant-first and pump-first reserve the same intake space without charging',()=>{
 const s=funded();assert.ok(dig(s,0,34).ok);assert.ok(plant(s,0,34,'kelp').ok);assert.ok(fill(s,0,34).ok);
 const p={kind:'pump',gx:0,gz:35,rotation:0,baseY:naturalPropBase('pump',0,35),hostId:null};
 const before=serialize(s);assert.equal(validateDelight(s,p).code,'message.pumpBlocked');assert.equal(placeDelight(s,p).code,'message.pumpBlocked');assert.equal(serialize(s),before);
 assert.equal(describeWaterNetwork({...s,delights:[{...p,id:99,on:true}]}).nodes[0].sourceValid,false);
 const reverse=funded();put(reverse,'pump',0,35);assert.ok(dig(reverse,0,34).ok);assert.equal(validatePlant(reverse,0,34,'kelp').ok,false);
});
