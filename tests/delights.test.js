import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,build,remove,serialize,deserialize,dig,MATERIALS} from '../src/state.js';
import {DELIGHTS,placeDelight,removeDelight,validateDelight,propBoxes,propAnchor,connectedWheel,stepLift,liftRiders,propFloor} from '../src/delights.js';
import {TERRAIN,terrainHeight,inWorld} from '../src/terrain.js';
const toy=(kind,gx=0,gz=0,rotation=0,baseY=0,hostId=null)=>({kind,gx,gz,rotation,baseY,hostId});
const floor=(gx,gz,material='wood')=>({kind:'floor',gx,gz,material,rotation:0,baseY:0,level:0});
const rich=()=>{const s=freshState();for(const k of Object.keys(s.inventory))s.inventory[k]=100;return s;};
test('all five materials retain exact house costs; paid toys refund once and reject unaffordable/duplicate use',()=>{
 assert.deepEqual(MATERIALS,['wood','copper','iron','diamond','fiber']);const s=freshState();
 assert.equal(placeDelight(s,toy('lamp')).ok,false);assert.equal(s.delights.length,0);
 for(const kind of Object.keys(DELIGHTS)){const r=rich(),spec=DELIGHTS[kind],p=kind==='crabShelter'?toy(kind,3,20,0,-7.2):toy(kind);const before=r.inventory[spec.material];const out=placeDelight(r,p);assert.ok(out.ok,kind);assert.equal(r.inventory[spec.material],before-spec.cost);assert.equal(placeDelight(r,p).ok,false);assert.equal(removeDelight(r,out.prop.id).ok,true);assert.equal(r.inventory[spec.material],before);assert.equal(removeDelight(r,out.prop.id).ok,false);}
 const f=rich();assert.ok(build(f,floor(0,0,'fiber')).ok);assert.equal(f.inventory.fiber,98);
});
test('old version1 paid world preserved; validated optional props support raised hosts and reject accounting tampering',()=>{
 const s=rich();assert.ok(build(s,floor(0,0,'fiber')).ok);assert.ok(placeDelight(s,toy('hammock',0,0,0,.15,s.buildings[0].id)).ok);assert.equal(remove(s,s.buildings[0].id).ok,false);
 const d=deserialize(serialize(s));assert.deepEqual(d.inventory,s.inventory);assert.deepEqual(d.buildings,s.buildings);assert.deepEqual(d.delights,s.delights);
 for(const change of [p=>p.cost=0,p=>p.hostId=999,p=>p.liftY=1,p=>p.visited='yes']){const b=JSON.parse(serialize(s));change(b.delights[0]);assert.throws(()=>deserialize(JSON.stringify(b)));}
 const old=JSON.parse(serialize(s));delete old.delights;const migrated=deserialize(JSON.stringify(old));assert.deepEqual(migrated.delights,[]);assert.deepEqual(migrated.inventory,s.inventory);assert.deepEqual(migrated.buildings,s.buildings);
});
test('natural toys reserve paid construction/dig and shelter has a reachable flat real cavity',()=>{
 const s=rich();const p=placeDelight(s,toy('birdhouse')).prop;assert.equal(dig(s,0,0).ok,false);assert.equal(build(s,floor(0,0)).ok,false);
 assert.equal(validateDelight(s,toy('crabShelter',1,0)).ok,false);const hut=placeDelight(s,toy('crabShelter',3,20,0,-7.2));assert.ok(hut.ok);const b=propBoxes(hut.prop);const center=propAnchor(hut.prop,'inside');assert.equal(terrainHeight(center.x,center.z),-7.2);assert.ok(b.every(a=>!(center.x+.72>a.minX&&center.x-.72<a.maxX&&center.z+.72>a.minZ&&center.z-.72<a.maxZ&&center.y+.45>a.minY)));
 const approach=propAnchor(hut.prop,'entry');assert.equal(terrainHeight(approach.x,approach.z),-7.2);assert.ok(inWorld(approach.x,approach.z));assert.ok(removeDelight(s,p.id).ok);
});
test('water ports connect only directed same-height adjacent placements on either axis; isolated pieces valid',()=>{
 for(let rotation=0;rotation<4;rotation++){const s=rich(),g=placeDelight(s,toy('gutter',0,0,rotation)).prop,ends=[[1,0],[0,-1],[-1,0],[0,1]][rotation],w=placeDelight(s,toy('waterWheel',...ends,rotation)).prop;assert.equal(connectedWheel(g,s.delights).id,w.id);assert.equal(connectedWheel(g,[{...w,rotation:(rotation+1)%4}]),null);assert.equal(connectedWheel(g,[{...w,baseY:1}]),null);assert.equal(connectedWheel(g,[]),null);}
});
test('lift moves both slab faces and actual riders; headroom/nonrider stop, support and occupied removal are safe',()=>{
 const s=rich(),p=placeDelight(s,toy('lift')).prop,bodies=[{id:'player',x:0,z:0,feet:.15,height:1.65}];const slab=propBoxes(p).at(-1),high=propBoxes(p,{liftY:2.4}).at(-1);assert.equal(high.minY-slab.minY,2.4);assert.equal(high.maxY-slab.maxY,2.4);
 const step=stepLift(p,2.4,.1,bodies,[]);assert.equal(step.delta,.05500000000000001);assert.deepEqual(step.riders,['player']);assert.deepEqual(stepLift(p,2.4,.1,[{...bodies[0],x:.72}],[]).riders,['player']);p.liftY=step.delta;bodies[0].feet+=step.delta;assert.equal(liftRiders(p,bodies).length,1);assert.equal(propFloor([p],0,0,bodies[0].feet,0),bodies[0].feet);
 const ceiling={minX:-1,maxX:1,minZ:-1,maxZ:1,minY:bodies[0].feet+1.66,maxY:3};assert.ok(stepLift(p,2.4,.1,bodies,[ceiling]).blocked);assert.equal(removeDelight(s,p.id,{occupied:true}).ok,false);
 p.liftY=2.4;assert.ok(stepLift(p,0,.1,[{id:'under',x:0,z:0,feet:.85,height:1.65}],[]).blocked);
 p.liftY=0;assert.ok(removeDelight(s,p.id,{occupied:true}).ok);
});
test('mid-height lift and supported saved player reload exactly; deep offshore save uses shared floor/bounds',()=>{
 const s=rich(),p=placeDelight(s,toy('lift')).prop;p.liftY=1.27;s.player={x:0,z:0,y:1.42,yaw:0,pitch:0};const d=deserialize(serialize(s));assert.equal(d.delights[0].liftY,1.27);assert.equal(d.player.y,1.42);assert.equal(propFloor(d.delights,0,0,d.player.y,0),1.42);
 s.player={x:0,z:100,y:-12,yaw:0,pitch:0};assert.equal(terrainHeight(0,100),-14);assert.equal(deserialize(serialize(s)).player.y,-12);assert.ok(inWorld(20,106));assert.equal(terrainHeight(0,60),-7.2);assert.equal(TERRAIN.maxZ,112);
});

test('small hosted lamp and curtain fit a complete room while large hammock respects walls; IDs never recycle',()=>{
 const s=rich();assert.ok(build(s,floor(0,0)).ok);for(let rotation=0;rotation<4;rotation++)assert.ok(build(s,{...floor(0,0),kind:rotation===0?'door':'wall',rotation}).ok);assert.ok(build(s,{...floor(0,0),kind:'roof',level:1}).ok);
 const host=s.buildings.find(b=>b.kind==='floor').id;const lamp=placeDelight(s,toy('lamp',0,0,0,.15,host));assert.ok(lamp.ok);assert.ok(removeDelight(s,lamp.prop.id).ok);const screen=placeDelight(s,toy('curtain',0,0,0,.15,host));assert.ok(screen.ok);assert.ok(screen.prop.id>lamp.prop.id);assert.ok(removeDelight(s,screen.prop.id).ok);assert.equal(placeDelight(s,toy('hammock',0,0,0,.15,host)).ok,false);
 const restored=deserialize(serialize(s));const next=placeDelight(restored,toy('lamp',0,0,0,.15,host));assert.ok(next.prop.id>screen.prop.id);
});

test('continuous terrain retires old unreachable backdrop rocks and retains physical reef',async()=>{const {createOceanWorld}=await import('../src/ocean-visuals.js');const world=createOceanWorld({terrain:TERRAIN,heightAt:terrainHeight});assert.deepEqual(world.userData.backdropBounds,[]);assert.ok(world.userData.reefSolids.length>100);});
