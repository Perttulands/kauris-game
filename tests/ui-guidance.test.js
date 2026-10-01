import test from 'node:test';
import assert from 'node:assert/strict';
import {Ray,Plane,Vector3} from 'three';
import {freshState,validateDig,dig,build,remove,validateRemove,serialize,deserialize} from '../src/state.js';
import {placeDelight,removeDelight,validateRemoveDelight} from '../src/delights.js';
import {farTargetHint} from '../src/interaction.js';
const piece=(kind,gx=0,gz=0)=>({kind,gx,gz,level:0,rotation:0,baseY:0,material:'wood'});
test('new camera ray reaches diggable ground; old saved camera is retained exactly',()=>{
 const s=freshState(),p=s.player,origin=new Vector3(p.x,1.7,p.z),ray=new Ray(origin,new Vector3(0,Math.sin(p.pitch),-Math.cos(p.pitch))),hit=ray.intersectPlane(new Plane(new Vector3(0,1,0),0),new Vector3());
 assert.ok(origin.distanceTo(hit)<6);assert.ok(dig(s,Math.round(hit.x/2),Math.round(hit.z/2)).ok);
 s.player={x:3,y:0,z:9,yaw:.73,pitch:-.18};assert.deepEqual(deserialize(serialize(s)).player,s.player);
});
test('shallow bare ground asks for look-down while fixed named targets retain approach advice',()=>{
 const target={ground:true,gx:0,gz:0,outOfReach:true,point:{y:0}};assert.equal(farTargetHint(target,{},1.7),'target.lookDown');
 for(const extra of [{ground:false},{buildId:1},{wildId:'tree'},{propId:2},{plot:'0,0'}])assert.equal(farTargetHint({...target,...extra},{},1.7),'target.closer');
 assert.equal(farTargetHint(target,{'0,0':{phase:'hole'}},1.7),'target.closer');assert.equal(farTargetHint({...target,outOfReach:false},{},1.7),null);
});
test('pure removal preview matches dependency rejection, then exact one-time refunds',()=>{
 const s=freshState();s.inventory.wood=36;const floor=build(s,piece('floor')).piece,door=build(s,piece('door')).piece,before=serialize(s);
 assert.equal(validateRemove(s,floor.id).code,'message.removeAbove');assert.equal(serialize(s),before);
 assert.deepEqual(remove(s,floor.id),validateRemove(s,floor.id));assert.equal(serialize(s),before);
 const check=validateRemove(s,door.id);assert.ok(check.ok);assert.deepEqual(remove(s,door.id),check);assert.ok(validateRemove(s,floor.id).ok);assert.ok(remove(s,floor.id).ok);assert.equal(s.inventory.wood,36);assert.equal(remove(s,floor.id).ok,false);assert.equal(s.inventory.wood,36);
});
test('hosted props and occupied raised lifts give the same preview and action rejection',()=>{
 const host=freshState();host.inventory.wood=2;host.inventory.diamond=20;const floor=build(host,piece('floor')).piece;
 const lamp=placeDelight(host,{kind:'lamp',gx:0,gz:0,rotation:0,baseY:.15,hostId:floor.id});assert.ok(lamp.ok);assert.equal(validateRemove(host,floor.id).code,'message.removeToy');assert.deepEqual(remove(host,floor.id),validateRemove(host,floor.id));assert.ok(removeDelight(host,lamp.prop.id).ok);assert.ok(validateRemove(host,floor.id).ok);
 const s=freshState();s.inventory.iron=20;const lift=placeDelight(s,{kind:'lift',gx:0,gz:0,rotation:0,baseY:0,hostId:null}).prop;assert.ok(lift);lift.liftY=1;
 const before=serialize(s),options={occupied:true},check=validateRemoveDelight(s,lift.id,options);assert.equal(check.code,'message.lowerLift');assert.deepEqual(removeDelight(s,lift.id,options),check);assert.equal(serialize(s),before);
 lift.liftY=0;assert.ok(validateRemoveDelight(s,lift.id,options).ok);assert.ok(removeDelight(s,lift.id,options).ok);
});

test('looking down is not promised when elevated ground or seabed remains beyond vertical reach',()=>{
 const target={ground:true,gx:0,gz:40,outOfReach:true,point:{y:0}};
 assert.equal(farTargetHint(target,{},8),'target.closer');
 const seabed={...target,point:{y:-7.2}};
 assert.equal(farTargetHint(seabed,{},-.5),'target.closer');
 assert.equal(farTargetHint(seabed,{},-3),'target.lookDown');
 const ray=new Ray(new Vector3(0,-.5,80),new Vector3(0,-1,0)),hit=ray.intersectPlane(new Plane(new Vector3(0,1,0),7.2),new Vector3());assert.ok(ray.origin.distanceTo(hit)>6,'even straight down cannot reach seabed');
});

test('dig preview and action agree on submerged soil and paid supports without preview mutation',()=>{
 const s=freshState(),before=serialize(s),sea=validateDig(s,1,30);
 assert.equal(sea.code,'message.dug');assert.equal(sea.ok,true);assert.equal(serialize(s),before);assert.deepEqual(dig(s,1,30),sea);assert.equal(s.plots['1,30'].phase,'hole');delete s.plots['1,30'];
 const legal=validateDig(s,0,3);assert.ok(legal.ok);assert.equal(serialize(s),before);assert.deepEqual(dig(s,0,3),legal);assert.equal(s.plots['0,3'].phase,'hole');assert.equal(validateDig(s,0,3).code,'message.holeReady');
 s.inventory.wood=2;const b=build(s,piece('floor')).piece;assert.ok(b);const paid=serialize(s),blocked=validateDig(s,0,0);assert.equal(blocked.code,'message.removeBuilding');assert.deepEqual(dig(s,0,0),blocked);assert.equal(serialize(s),paid);
});
