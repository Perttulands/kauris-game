import {waterGeometry} from './water-geometry.js';
import {createWaterJoin,animateWaterJoin,disposeWaterJoin} from './water-join-visuals.js';
import {createWaterFlow} from './water-flow.js';
import {describeWaterNetwork,waterPorts} from './water-connections.js';
import {pumpIntake,WATER_KINDS} from './water-spec.js';
import * as THREE from 'three';
import {createDelight,animateDelight,disposeDelight} from './delight-visuals.js';
import {DELIGHTS,propAnchor,propPoint,propBoxes,connectedWheel,nearestProp,stepLift} from './delights.js';
// Bounded visible mechanisms. Commands/costs remain in the pure domain module.
export function createDelightSystem({scene,getState,getPlayer,changed,event,continuous=()=>{},getBodies,moveRiders,obstacles,solidsAt=()=>[],geometryVersion=()=>0}){
 const models=new Map(),motion=new Map(),links=new Map(),shells=new Map();let time=0,topologyKey='',network={nodes:[],edges:[],drives:[],rejected:[],joins:[]},waterSolids=[];const flow=createWaterFlow();
 const lightPool=Array.from({length:2},()=>{const l=new THREE.PointLight('#c1eff0',0,5,2);scene.add(l);return l;});
 const driveGeometry=new THREE.CylinderGeometry(.045,.045,1,8),driveMaterial=new THREE.MeshStandardMaterial({color:'#8295a1',roughness:.55});
 const yAxis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
 function sync(){
  const props=getState().delights??[];
  for(const [id,g] of models)if(!props.some(p=>p.id===id)){continuous(`prop:${id}:wheel`,'wheel',{active:false});continuous(`prop:${id}:lift`,'liftMove',{active:false});scene.remove(g);disposeDelight(g);models.delete(id);motion.delete(id);for(const map of [links,shells]){const v=map.get(id);if(v)scene.remove(v);map.delete(id);}}
  for(const p of props){if(!models.has(p.id)){const g=createDelight(p.kind,{intake:p.kind==='pump'?pumpIntake(p).intake:undefined});g.position.set(p.gx*2,p.baseY,p.gz*2);g.rotation.y=p.rotation*Math.PI/2;g.traverse(o=>{if(o.isMesh)o.userData.propId=p.id;});g.userData.propId=p.id;scene.add(g);models.set(p.id,g);motion.set(p.id,{charge:0,flow:0,phase:0,swing:0,amplitude:0,target:p.liftY,blocked:false,visitorId:null,request:0,lastBell:-10,glow:0,pouringUntil:0});

   }
   if(p.kind==='crabShelter'&&p.visited&&!shells.has(p.id)){const g=createDelight('shell'),a=propAnchor(p,'shell');g.position.set(a.x,a.y,a.z);g.rotation.y=p.rotation*Math.PI/2;scene.add(g);shells.set(p.id,g);}
  }
  const key=geometryVersion()+'|'+props.map(p=>[p.id,p.kind,p.gx,p.gz,p.rotation,p.baseY,p.on].join(',')).join(';')+'|'+(getState().buildings??[]).map(b=>[b.id,b.kind,b.gx,b.gz,b.rotation,b.baseY,b.level].join(',')).join(';')+'|'+Object.values(getState().plots??{}).filter(p=>p.seed).map(p=>[p.gx,p.gz,p.seed,p.baseY].join(',')).join(';');
  if(key!==topologyKey){
   topologyKey=key;network=describeWaterNetwork(getState(),{solidsAt});
   const configured=flow.configure(network.nodes,network.edges);
   network.rejected.push(...configured.rejected);
   network.edges=network.edges.filter(e=>configured.edges.some(a=>a.from===e.from&&a.to===e.to&&a.port===e.port));
   // Reef movement queries accept hulls; empty planes preserve these exact AABBs.
   waterSolids=network.joins.flatMap(p=>p.boxes.map(b=>({...b,planes:[]})));
   const wanted=new Set();
   for(const p of props)for(const port of waterPorts(p).filter(a=>a.name.startsWith('outlet'))){
    const key=p.id+':'+port.name,edge=network.edges.find(e=>e.from===p.id&&e.port===port.name);
    const plan=network.joins.find(j=>j.key===key)??waterGeometry({key,kind:'spill',from:p.id,port:port.name,nx:port.nx,nz:port.nz,path:[port,{x:port.x+port.nx*.16,y:port.y-.35,z:port.z+port.nz*.16}]});
    const shape=JSON.stringify([plan.kind,plan.path]),old=links.get(key);wanted.add(key);
    if(old?.userData.shape!==shape){if(old)disposeWaterJoin(old);const g=createWaterJoin(plan);g.userData={shape,from:p.id,split:p.kind==='splitter',blocked:plan.kind!=='spill'&&!edge};g.traverse(o=>{if(o.isMesh)o.userData.propId=p.id;});scene.add(g);links.set(key,g);}
    else old.userData.blocked=plan.kind!=='spill'&&!edge;
   }
   for(const d of network.drives){
    const key='drive:'+d.to,shape=JSON.stringify(d);wanted.add(key);if(links.get(key)?.userData.shape===shape)continue;
    links.get(key)?.removeFromParent();
    const g=new THREE.Mesh(driveGeometry,driveMaterial);direction.set(d.b.x-d.a.x,d.b.y-d.a.y,d.b.z-d.a.z);g.position.set((d.a.x+d.b.x)/2,(d.a.y+d.b.y)/2,(d.a.z+d.b.z)/2);g.scale.y=direction.length();g.quaternion.setFromUnitVectors(yAxis,direction.normalize());g.userData={drive:d,shape};scene.add(g);links.set(key,g);
   }
   for(const [key,g] of links)if(!wanted.has(key)){if(g.userData.drive)g.removeFromParent();else disposeWaterJoin(g);links.delete(key);}

  }
 }
 function ring(p){const q=motion.get(p.id);if(!q||time-q.lastBell<.6)return false;q.lastBell=time;q.amplitude=1;event('bell',{...propAnchor(p,'bell'),propId:p.id,sourceId:'prop:'+p.id,material:DELIGHTS[p.kind].material});return true;}
 function use(id){const p=getState().delights.find(p=>p.id===id),q=motion.get(id);if(!p||!q)return false;
  if(p.kind==='bell')ring(p);
  else if(p.kind==='pump'){p.on=!p.on;changed();sync();}
  else if(p.kind==='lift'){if(network.drives.some(d=>d.to===id))return true;q.manual=true;q.target=q.target>1.2?0:2.4;q.blocked=false;event('liftStart',{...propAnchor(p,'use'),sourceId:'prop:'+p.id,material:'iron'});}
  else if(p.kind==='lamp'){p.on=!p.on;changed();event('lamp',{...propAnchor(p,'light'),sourceId:'prop:'+p.id,material:'diamond'});}
  else if(['hammock','curtain','windsock'].includes(p.kind)){q.amplitude=1;q.request=time+25;event('cloth',{...propAnchor(p,'use'),sourceId:'prop:'+p.id,material:'fiber'});}
  else if(['birdhouse','crabShelter'].includes(p.kind)){q.request=time+25;event('shelter',{...propAnchor(p,'use'),sourceId:'prop:'+p.id,material:DELIGHTS[p.kind].material});}
  return true;
 }
 function pour(id,dt){const p=getState().delights.find(p=>p.id===id),q=motion.get(id);if(p?.kind!=='gutter'||!q)return false;q.pouringUntil=time+.15;flow.pour(id,dt);q.charge=flow.get(id)?.stored??0;return true;}
 function anchor(id,name){const p=getState().delights.find(p=>p.id===id);if(!p)return null;const g=models.get(id)?.getObjectByName('anchor:'+name);if(g){g.updateWorldMatrix(true,false);const v=g.getWorldPosition(new THREE.Vector3());return {x:v.x,y:v.y,z:v.z};}return propAnchor(p,name);}
 function claim(id,actor){const q=motion.get(id);if(!q||q.visitorId&&q.visitorId!==actor)return false;q.visitorId=actor;return true;}
 function release(actor){for(const q of motion.values())if(q.visitorId===actor)q.visitorId=null;}
 function visited(id){const p=getState().delights.find(p=>p.id===id);if(p&&!p.visited){p.visited=true;changed();sync();}}
 function update(dt,now){time=now;sync();const props=getState().delights,player=getPlayer();
  for(const q of motion.values()){q.flow=0;q.glow=0;}
  flow.step(dt);
  for(const p of props){const q=motion.get(p.id),water=flow.get(p.id);if(water){q.flow=water.flow;q.charge=water.stored;q.spill=water.spill;q.waterReason=network.rejected.find(e=>e.from===p.id||e.to===p.id)?.reason??null;q.waterConnected=network.edges.some(e=>e.from===p.id||e.to===p.id);q.connectedTo=network.edges.find(e=>e.from===p.id)?.to??null;}}
  for(const g of links.values()){
   if(g.userData.drive){const d=g.userData.drive;g.rotateY(dt*(flow.get(d.from)?.flow??0)*4);continue;}
   const {from,split,blocked}=g.userData,rate=blocked?0:(flow.get(from)?.flow??0)/(split?2:1);animateWaterJoin(g,{time,flow:rate});
  }
  // Resolve cross-object responses before animating any object, regardless of placement order.
  for(const p of props)if(p.kind==='lamp'){const q=motion.get(p.id),curtain=nearestProp(p,props,'curtain',3);q.connectedTo=curtain?.id??null;q.glow=p.on?1:0;if(p.on&&curtain)motion.get(curtain.id).glow=1;}
  for(const p of props){const q=motion.get(p.id);q.amplitude*=Math.exp(-dt*1.1);q.swing=Math.sin(time*2.2+p.id)*q.amplitude;
   if(p.kind==='waterWheel'){q.phase+=dt*q.flow*.65;const bell=nearestProp(p,props,'bell',3);q.connectedTo=bell?.id??null;if(bell&&q.flow&&time-q.lastBell>=2){ring(bell);q.lastBell=time;}continuous(`prop:${p.id}:wheel`,'wheel',{active:q.flow>0,x:p.gx*2,y:p.baseY+.6,z:p.gz*2,material:'copper'});}
   if(p.kind==='bell')q.phase=(time-q.lastBell)*2.5;
   if(p.kind==='lift'){
    const drive=network.drives.find(d=>d.to===p.id),supply=drive?(flow.get(drive.from)?.flow??0):0;
    if(drive){
     q.manual=false;q.autoTarget??=p.liftY>=2.39?0:2.4;
     if(supply>0&&Math.abs(p.liftY-q.autoTarget)<.001){q.dwell=(q.dwell??0)+dt;if(q.dwell>=1){q.autoTarget=q.autoTarget>1?0:2.4;q.dwell=0;}}
     q.target=supply>0?q.autoTarget:p.liftY;
    }else if(q.driveId!==undefined&&q.driveId!==null){q.target=p.liftY;q.manual=false;}
    q.driveId=drive?.from??null;q.powered=!!drive&&supply>0;
    const step=stepLift(p,q.target,dt*(drive?supply:1),getBodies(),obstacles(p.id));q.blocked=step.blocked;q.riders=step.riders;
    continuous(`prop:${p.id}:lift`,'liftMove',{active:!!step.delta,x:p.gx*2,y:p.baseY+p.liftY,z:p.gz*2,material:'iron'});
    if(step.delta){p.liftY+=step.delta;moveRiders(step.riders,step.delta);changed();if(Math.abs(p.liftY-q.target)<.001)event('liftArrival',{sourceId:'prop:'+p.id,material:'iron',x:p.gx*2,y:p.baseY+p.liftY,z:p.gz*2});}
   }
   const model=models.get(p.id);animateDelight(model,{time,flow:q.flow,phase:q.phase,active:p.kind==='bell'?q.amplitude:p.kind==='gutter'?(time<q.pouringUntil?1:0):q.visitorId?1:0,swing:q.swing,lift:p.liftY,glow:q.glow,on:p.on,powered:q.powered});model.updateMatrixWorld(true);
  }
  const lamps=props.filter(p=>p.kind==='lamp'&&p.on).sort((a,b)=>Math.hypot(a.gx*2-player.x,a.gz*2-player.z)-Math.hypot(b.gx*2-player.x,b.gz*2-player.z));
  lightPool.forEach((l,i)=>{const p=lamps[i];l.intensity=p?.on ? .65 : 0;if(p){const a=propAnchor(p,'light');l.position.set(a.x,a.y,a.z);}});
 }
 return {models,motion,links,waterSolids:()=>waterSolids,sync,update,use,pour,anchor,claim,release,visited,ring,
  waterSnapshot:()=>({...flow.snapshot(),drives:network.drives,rejected:network.rejected,joins:network.joins.map(j=>({key:j.key,kind:j.kind,path:j.path,boxes:j.boxes.length})),links:links.size}),
  snapshot:()=>getState().delights.map(p=>{const q=motion.get(p.id);return {...p,flow:q?.flow??0,powered:q?.powered??false,driveId:q?.driveId??null,spill:q?.spill??0,charge:q?.charge??0,phase:q?.phase??0,swing:q?.swing??0,target:q?.target??p.liftY,blocked:q?.blocked??false,visitorId:q?.visitorId??null,connectedTo:q?.connectedTo??null,seat:p.kind==='hammock'?anchor(p.id,'seat'):null,platform:p.kind==='lift'?anchor(p.id,'platform'):null};})};
}
