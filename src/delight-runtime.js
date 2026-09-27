import * as THREE from 'three';
import {createDelight,animateDelight} from './delight-visuals.js';
import {DELIGHTS,propAnchor,propPoint,propBoxes,connectedWheel,nearestProp,stepLift} from './delights.js';
// Bounded visible mechanisms. Commands/costs remain in the pure domain module.
export function createDelightSystem({scene,getState,getPlayer,changed,event,getBodies,moveRiders,obstacles}){
 const models=new Map(),motion=new Map(),links=new Map(),shells=new Map();let time=0;
 const lightPool=Array.from({length:2},()=>{const l=new THREE.PointLight('#c1eff0',0,5,2);scene.add(l);return l;});
 const bridgeGeometry=new THREE.CylinderGeometry(.032,.042,1,7),bridgeMaterial=new THREE.MeshStandardMaterial({color:'#a6e7ec',emissive:'#478b96',emissiveIntensity:.25,transparent:true,opacity:.8});
 const yAxis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
 function sync(){
  const props=getState().delights??[];
  for(const [id,g] of models)if(!props.some(p=>p.id===id)){scene.remove(g);models.delete(id);motion.delete(id);for(const map of [links,shells]){const v=map.get(id);if(v)scene.remove(v);map.delete(id);}}
  for(const p of props){if(!models.has(p.id)){const g=createDelight(p.kind);g.position.set(p.gx*2,p.baseY,p.gz*2);g.rotation.y=p.rotation*Math.PI/2;g.traverse(o=>{if(o.isMesh)o.userData.propId=p.id;});g.userData.propId=p.id;scene.add(g);models.set(p.id,g);motion.set(p.id,{charge:0,flow:0,phase:0,swing:0,amplitude:0,target:p.liftY,blocked:false,visitorId:null,request:0,lastBell:-10,glow:0,pouringUntil:0});
    if(p.kind==='gutter'){const g=new THREE.Mesh(bridgeGeometry,bridgeMaterial);g.visible=false;scene.add(g);links.set(p.id,g);}
   }
   if(p.kind==='crabShelter'&&p.visited&&!shells.has(p.id)){const g=createDelight('shell'),a=propAnchor(p,'shell');g.position.set(a.x,a.y,a.z);g.rotation.y=p.rotation*Math.PI/2;scene.add(g);shells.set(p.id,g);}
  }
 }
 function ring(p){const q=motion.get(p.id);if(!q||time-q.lastBell<.6)return false;q.lastBell=time;q.amplitude=1;event('bell',{...propAnchor(p,'bell'),propId:p.id});return true;}
 function use(id){const p=getState().delights.find(p=>p.id===id),q=motion.get(id);if(!p||!q)return false;
  if(p.kind==='bell')ring(p);
  else if(p.kind==='lift'){q.target=q.target>1.2?0:2.4;q.blocked=false;event('liftStart',propAnchor(p,'use'));}
  else if(p.kind==='lamp'){p.on=!p.on;changed();event('crystal',propAnchor(p,'light'));}
  else if(['hammock','curtain','windsock'].includes(p.kind)){q.amplitude=1;q.request=time+25;event('cloth',propAnchor(p,'use'));}
  else if(['birdhouse','crabShelter'].includes(p.kind)){q.request=time+25;event('wood',propAnchor(p,'use'));}
  return true;
 }
 function pour(id,dt){const p=getState().delights.find(p=>p.id===id),q=motion.get(id);if(p?.kind!=='gutter'||!q)return false;q.pouringUntil=time+.15;q.charge=Math.min(6,q.charge+Math.max(0,Math.min(.1,dt))*3);return true;}
 function anchor(id,name){const p=getState().delights.find(p=>p.id===id);if(!p)return null;const g=models.get(id)?.getObjectByName('anchor:'+name);if(g){g.updateWorldMatrix(true,false);const v=g.getWorldPosition(new THREE.Vector3());return {x:v.x,y:v.y,z:v.z};}return propAnchor(p,name);}
 function claim(id,actor){const q=motion.get(id);if(!q||q.visitorId&&q.visitorId!==actor)return false;q.visitorId=actor;return true;}
 function release(actor){for(const q of motion.values())if(q.visitorId===actor)q.visitorId=null;}
 function visited(id){const p=getState().delights.find(p=>p.id===id);if(p&&!p.visited){p.visited=true;changed();sync();}}
 function update(dt,now){time=now;sync();const props=getState().delights,player=getPlayer();
  for(const q of motion.values()){q.flow=0;q.glow=0;}
  for(const p of props)if(p.kind==='gutter'){
   const q=motion.get(p.id),w=connectedWheel(p,props);q.charge=Math.max(0,q.charge-dt);q.flow=q.charge>0?1:0;q.connectedTo=w?.id??null;
   const bridge=links.get(p.id);bridge.visible=!!w&&q.flow>0;
   if(w){const a=propAnchor(p,'outlet'),b=propAnchor(w,'inlet');if(bridge.visible){direction.set(b.x-a.x,b.y-a.y,b.z-a.z);bridge.position.set((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);bridge.scale.y=direction.length();bridge.quaternion.setFromUnitVectors(yAxis,direction.normalize());}motion.get(w.id).flow=Math.max(motion.get(w.id).flow,q.flow);}
  }
  // Resolve cross-object responses before animating any object, regardless of placement order.
  for(const p of props)if(p.kind==='lamp'){const q=motion.get(p.id),curtain=nearestProp(p,props,'curtain',3);q.connectedTo=curtain?.id??null;q.glow=p.on?1:0;if(p.on&&curtain)motion.get(curtain.id).glow=1;}
  for(const p of props){const q=motion.get(p.id);q.amplitude*=Math.exp(-dt*1.1);q.swing=Math.sin(time*2.2+p.id)*q.amplitude;
   if(p.kind==='waterWheel'){q.phase+=dt*q.flow*.65;const bell=nearestProp(p,props,'bell',3);q.connectedTo=bell?.id??null;if(bell&&q.flow&&time-q.lastBell>=2){ring(bell);q.lastBell=time;}if(q.flow)event('wheel',{x:p.gx*2,y:p.baseY+.6,z:p.gz*2});}
   if(p.kind==='bell')q.phase=(time-q.lastBell)*2.5;
   if(p.kind==='lift'){
    const step=stepLift(p,q.target,dt,getBodies(),obstacles(p.id));q.blocked=step.blocked;q.riders=step.riders;
    if(step.delta){p.liftY+=step.delta;moveRiders(step.riders,step.delta);changed();event('liftMove',{x:p.gx*2,y:p.baseY+p.liftY,z:p.gz*2});if(Math.abs(p.liftY-q.target)<.001)event('liftArrival',{x:p.gx*2,y:p.baseY+p.liftY,z:p.gz*2});}
   }
   const model=models.get(p.id);animateDelight(model,{time,flow:q.flow,phase:q.phase,active:p.kind==='bell'?q.amplitude:p.kind==='gutter'?(time<q.pouringUntil?1:0):q.visitorId?1:0,swing:q.swing,lift:p.liftY,glow:q.glow});model.updateMatrixWorld(true);
  }
  const lamps=props.filter(p=>p.kind==='lamp'&&p.on).sort((a,b)=>Math.hypot(a.gx*2-player.x,a.gz*2-player.z)-Math.hypot(b.gx*2-player.x,b.gz*2-player.z));
  lightPool.forEach((l,i)=>{const p=lamps[i];l.intensity=p?.on ? .65 : 0;if(p){const a=propAnchor(p,'light');l.position.set(a.x,a.y,a.z);}});
 }
 return {models,motion,sync,update,use,pour,anchor,claim,release,visited,ring,
  snapshot:()=>getState().delights.map(p=>{const q=motion.get(p.id);return {...p,flow:q?.flow??0,charge:q?.charge??0,phase:q?.phase??0,swing:q?.swing??0,target:q?.target??p.liftY,blocked:q?.blocked??false,visitorId:q?.visitorId??null,connectedTo:q?.connectedTo??null,seat:p.kind==='hammock'?anchor(p.id,'seat'):null,platform:p.kind==='lift'?anchor(p.id,'platform'):null};})};
}
