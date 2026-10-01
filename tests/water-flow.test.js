import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createWaterFlow} from '../src/water-flow.js';

const node=(id,kind,extra={})=>({id,kind,on:false,sourceValid:false,...extra});
const pump=id=>node(id,'pump',{on:true,sourceValid:true});
const edge=(from,to,port='outlet')=>({from,to,port});
const near=(a,b,message='')=>assert.ok(Math.abs(a-b)<1e-8,message+' '+a+' != '+b);
function conserved(flow){
  const s=flow.snapshot(),stored=s.nodes.reduce((n,x)=>n+x.stored,0);
  near(s.totals.source+s.totals.poured,stored+s.totals.consumed+s.totals.spilled,'conservation');
  for(const n of s.nodes){assert.ok(n.stored>=0&&n.stored<=(n.kind==='gutter'?6:.1)+1e-9);assert.ok(n.flow<=1+1e-9);}
}
function advance(flow,ticks){for(let i=0;i<ticks;i++){flow.step(.05);conserved(flow);}}

test('pump validity/on state and prior-buffer transport delay are causal',()=>{
  const f=createWaterFlow();f.configure([pump(30),node(20,'waterWheel'),node(10,'fountain')],[edge(30,20),edge(20,10)]);
  f.step(.05);near(f.get(30).stored,.05);near(f.get(20).stored,0);near(f.get(30).flow,0);
  f.step(.05);near(f.get(30).flow,1);near(f.get(20).stored,.05);near(f.get(20).flow,0);
  f.step(.05);near(f.get(20).flow,1);near(f.get(10).stored,.05);near(f.get(10).flow,0);
  f.step(.05);near(f.get(10).flow,1);near(f.snapshot().totals.consumed,.05);conserved(f);
  f.configure([node(30,'pump',{on:true,sourceValid:false}),node(20,'waterWheel'),node(10,'fountain')],[edge(30,20),edge(20,10)]);
  const source=f.snapshot().totals.source;advance(f,10);near(f.snapshot().totals.source,source);
  f.snapshot().nodes.forEach(n=>near(n.flow,0));
  f.configure([node(30,'pump',{on:false,sourceValid:true})],[]);advance(f,5);near(f.snapshot().totals.source,source);
});

test('20Hz frame accumulation freezes at dt0 and clamps long/nonfinite frames',()=>{
  const f=createWaterFlow();f.configure([pump(1)],[]);
  assert.equal(f.step(.02),0);assert.equal(f.step(.03),1);near(f.snapshot().totals.source,.05);
  f.step(.025);const before=f.snapshot();
  for(const dt of [0,-1,NaN,Infinity])assert.equal(f.step(dt),0);
  assert.deepEqual(f.snapshot(),before);
  assert.equal(f.step(10),2);near(f.snapshot().totals.source,.15);near(f.snapshot().accumulator,.025);conserved(f);
});

test('node/edge input order cannot alter one-step transport or conservation',()=>{
  const ns=[pump(90),node(2,'splitter'),node(20,'cornerChannel'),node(8,'waterWheel'),node(4,'fountain'),node(6,'fountain')];
  const es=[edge(90,2),edge(2,20,'outletA'),edge(2,8,'outletB'),edge(20,4),edge(8,6)];
  const a=createWaterFlow(),b=createWaterFlow();a.configure(ns,es);b.configure(ns.slice().reverse(),es.slice().reverse());
  for(let i=0;i<120;i++){a.step(.05);b.step(.05);assert.deepEqual(a.snapshot(),b.snapshot());conserved(a);}
});

test('splitter halves quantity including an unconnected physical outlet',()=>{
  const f=createWaterFlow();f.configure([pump(1),node(2,'splitter'),node(3,'fountain')],[edge(1,2),edge(2,3,'outletA')]);
  advance(f,40);near(f.get(2).flow,1);near(f.get(2).outflow,.5);near(f.get(2).spill,.5);near(f.get(3).flow,.5);
  conserved(f);
});

test('two splitter branches each get half and reconnect does not clone stored supply',()=>{
  const f=createWaterFlow(),ns=[pump(1),node(2,'splitter'),node(3,'waterWheel'),node(4,'fountain')];
  const es=[edge(1,2),edge(2,3,'outletA'),edge(2,4,'outletB')];
  f.configure(ns,es);advance(f,30);near(f.get(3).flow,.5);near(f.get(4).flow,.5);
  const before=f.snapshot();f.configure(ns,[edge(1,2),edge(2,3,'outletA')]);
  near(f.snapshot().totals.source,before.totals.source);near(f.get(4).stored,before.nodes.find(n=>n.id===4).stored);
  advance(f,8);near(f.get(4).flow,0);near(f.get(2).spill,.5);
  f.configure(ns,es);advance(f,5);near(f.get(4).flow,.5);conserved(f);
});

test('can pouring is finite, caps gutter reservoir, and accounts overflow as spill',()=>{
  const f=createWaterFlow();f.configure([node(1,'gutter')],[]);
  for(let i=0;i<25;i++)f.pour(1,.1);
  near(f.get(1).stored,6);near(f.snapshot().totals.poured,7.5);near(f.snapshot().totals.spilled,1.5);conserved(f);
  f.step(.05);assert.ok(f.get(1).spill>1);conserved(f);
  advance(f,125);near(f.get(1).stored,0);near(f.get(1).flow,0);near(f.snapshot().totals.spilled,7.5);
  const before=f.snapshot();assert.equal(f.pour(999,.1),0);assert.equal(f.pour(1,NaN),0);assert.deepEqual(f.snapshot(),before);
});

test('configure preserves matching storage and removal/cap reduction enters spill ledger',()=>{
  const f=createWaterFlow();f.configure([node(1,'gutter'),node(2,'fountain')],[edge(1,2)]);
  for(let i=0;i<10;i++)f.pour(1,.1);
  const stored=f.get(1).stored;f.step(.025);f.configure([node(1,'gutter'),node(2,'fountain')],[]);
  near(f.get(1).stored,stored);near(f.snapshot().accumulator,.025);
  f.configure([node(1,'cornerChannel')],[]);near(f.get(1).stored,.1);conserved(f);
  f.configure([],[]);near(f.snapshot().totals.spilled,3);conserved(f);
  assert.equal(f.get(1),null);
});

test('directed cycles are rejected deterministically and cannot sustain off-source flow',()=>{
  const f=createWaterFlow(),ns=[node(1,'gutter'),node(2,'cornerChannel'),node(3,'waterWheel')];
  const es=[edge(1,2),edge(2,3),edge(3,1)];
  f.configure(ns,es);assert.deepEqual(f.snapshot().rejected,[{...edge(3,1),reason:'cycle'}]);
  f.pour(1,.1);advance(f,40);f.snapshot().nodes.forEach(n=>{near(n.stored,0);near(n.flow,0);});
  near(f.snapshot().totals.spilled,.3);near(f.snapshot().totals.source,0);
  const r=createWaterFlow();r.configure(ns.slice().reverse(),es.slice().reverse());assert.deepEqual(r.snapshot().edges,f.snapshot().edges);
  r.configure([node(1,'gutter')],[edge(1,1)]);assert.equal(r.snapshot().rejected[0].reason,'cycle');
});

test('duplicate physical outlets and inlets have stable numeric-ID winners',()=>{
  const f=createWaterFlow(),ns=[node(1,'gutter'),node(2,'gutter'),node(3,'fountain'),node(4,'fountain')];
  f.configure(ns,[edge(2,3),edge(1,4),edge(1,3)]);
  assert.deepEqual(f.snapshot().edges,[edge(1,3)]);
  assert.deepEqual(f.snapshot().rejected,[{...edge(1,4),reason:'duplicate-outlet'},{...edge(2,3),reason:'duplicate-inlet'}]);
});

test('invalid outlets, absent nodes and pump inlet cannot invent a connection',()=>{
  const f=createWaterFlow();f.configure([pump(1),node(2,'fountain'),node(3,'splitter')],
    [edge(1,2,'outletB'),edge(2,3),edge(3,1,'outletA'),edge(3,9,'outletB'),edge(3,2,'outlet')]);
  assert.equal(f.snapshot().edges.length,0);
  assert.deepEqual(new Set(f.snapshot().rejected.map(e=>e.reason)),new Set(['invalid-outlet','no-inlet','missing-node']));
  advance(f,10);near(f.get(2).flow,0);conserved(f);
});

test('turns are ordinary prevalidated links; source removal drains downstream once',()=>{
  const f=createWaterFlow(),ns=[pump(1),node(2,'cornerChannel'),node(3,'gutter'),node(4,'waterWheel'),node(5,'fountain')];
  const es=[edge(1,2),edge(2,3),edge(3,4),edge(4,5)];
  f.configure(ns,es);advance(f,50);near(f.get(4).flow,1);
  const source=f.snapshot().totals.source;f.configure(ns.slice(1),es.slice(1));advance(f,40);
  near(f.snapshot().totals.source,source);f.snapshot().nodes.forEach(n=>near(n.stored,0));conserved(f);
});

test('no input or returned diagnostic record aliases internal state',()=>{
  const ns=[pump(1),node(2,'fountain')],es=[edge(1,2)];
  const f=createWaterFlow();const configured=f.configure(ns,es);
  ns[0].on=false;es[0].to=1;configured.nodes[0].stored=9;configured.edges[0].to=1;
  advance(f,8);near(f.get(2).flow,1);
  const state=f.get(1);state.stored=90;near(f.get(1).stored,.05);conserved(f);
});

test('invalid or over-capacity configure is atomic',()=>{
  const f=createWaterFlow();f.configure([node(1,'gutter')],[]);f.pour(1,.1);const before=f.snapshot();
  for(const ns of [[node(1,'gutter'),node(1,'gutter')],[node(NaN,'pump')],[node(2,'unknown')],Array.from({length:81},(_,i)=>node(i,'gutter'))]){
    assert.throws(()=>f.configure(ns,[]));assert.deepEqual(f.snapshot(),before);
  }
  assert.throws(()=>f.configure([node(1,'gutter')],Array.from({length:161},()=>edge(1,1))));
  assert.deepEqual(f.snapshot(),before);
});

test('80-node fixed-step work remains bounded; report environment timing without device claim',t=>{
  const f=createWaterFlow(),ns=Array.from({length:80},(_,i)=>i===0?pump(i):node(i,i===79?'fountain':i%3===0?'waterWheel':'cornerChannel'));
  f.configure(ns,ns.slice(1).map(n=>edge(n.id-1,n.id)));advance(f,100);
  const times=[];
  for(let i=0;i<1000;i++){const start=performance.now();f.step(.05);times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);conserved(f);
  assert.equal(f.snapshot().nodes.length,80);assert.equal(f.snapshot().edges.length,79);near(f.get(79).flow,1);
  t.diagnostic('80 nodes / 79 edges, 1000 fixed steps: p95 '+times[949].toFixed(4)+' ms; max '+times[999].toFixed(4)+' ms. Node '+process.version+', host measurement only.');
});
