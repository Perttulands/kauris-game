import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrabShelterVisits} from '../src/crab-shelter-visits.js';

function fixture(){
 const claims=new Map(),rewards=[],attempts=[];
 const shelters=[{id:1,kind:'crabShelter',gx:1,gz:0,rotation:0}];
 let allowed=()=>true;
 const visits=createCrabShelterVisits({
  getShelters:()=>shelters.map(p=>({...p,visitorId:claims.get(p.id)})),
  anchor:(p,name)=>({x:p.gx*2,z:name==='inside'?0:1.7}),
  claim:(id,actor)=>{attempts.push(id);if(claims.has(id)&&claims.get(id)!==actor)return false;claims.set(id,actor);return true;},
  release:actor=>{for(const [id,owner] of claims)if(owner===actor)claims.delete(id);},
  visited:id=>rewards.push(id),canTravel:(...args)=>allowed(...args),groundY:()=>0,
  move:(a,to,dt)=>{const dx=to.x-a.x,dz=to.z-a.z,d=Math.hypot(dx,dz),step=Math.min(d,.65*dt);a.x+=dx/d*step;a.z+=dz/d*step;a.speed=step/dt;}
 });
 const actor=(id='crab:0')=>({id,kind:'crab',x:0,y:0,z:1.7,homeX:0,homeZ:1.7});
 return {visits,claims,rewards,attempts,shelters,actor,setAllowed:f=>allowed=f};
}
test('every crab can physically enter, dwell and leave; one existing claim authority',()=>{
 const f=fixture(),a=f.actor(),b=f.actor('outer:crab'),start={...a};let inside=0,maxStep=0;
 for(let i=0;i<700;i++){
  const before={...a};f.visits.update(a,.1,i*.1);f.visits.update(b,.1,i*.1);
  maxStep=Math.max(maxStep,Math.hypot(a.x-before.x,a.z-before.z));
  assert.ok(f.claims.size<=1);
  if(a.visitStage===1&&Math.hypot(a.x-2,a.z)<.045)inside++;
 }
 assert.ok(f.rewards.length>0);assert.ok(inside>=100);assert.ok(maxStep<=.065000001);
 assert.notEqual(a.id,b.id);assert.equal(start.id,a.id);
});
test('unreachable nearest shelter is not claimed and requested reachable alternative wins',()=>{
 const f=fixture(),a=f.actor();f.shelters.push({id:2,kind:'crabShelter',gx:3,gz:0,rotation:0,requestUntil:25});
 f.setAllowed((_a,_from,to)=>to.x!==2);
 assert.equal(f.visits.update(a,.1,0),true);
 assert.equal(a.shelterId,2);assert.deepEqual(f.attempts,[2]);
});
test('blocked claimed route releases in bounded time and tries another shelter',()=>{
 const f=fixture(),a=f.actor();f.visits.update(a,.1,0);assert.equal(f.claims.get(1),a.id);
 f.shelters.push({id:2,kind:'crabShelter',gx:3,gz:0,rotation:0});
 f.setAllowed((_a,_from,to)=>to.x!==2);
 for(let i=1;i<40;i++)f.visits.update(a,.1,i*.1);
 assert.equal(a.shelterId,2);assert.equal(f.claims.has(1),false);
});
test('removal and explicit actor retirement release the claim without relocation',()=>{
 const f=fixture(),a=f.actor();f.visits.update(a,.1,0);const before={x:a.x,z:a.z};
 f.shelters.length=0;f.visits.update(a,.1,.1);assert.equal(f.claims.size,0);assert.deepEqual({x:a.x,z:a.z},before);
 f.shelters.push({id:2,kind:'crabShelter',gx:1,gz:0,rotation:0});f.visits.update(a,.1,3);
 assert.equal(f.claims.size,1);f.visits.release(a.id);assert.equal(f.claims.size,0);
});
