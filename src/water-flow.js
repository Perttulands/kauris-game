// Bounded, renderer-free water transport. Geometry and source validity belong
// to the caller; only topology safety and quantity conservation live here.
const DT=.05,MAX_NODES=80,MAX_EDGES=160,EPS=1e-10;
const KINDS=new Set(['pump','gutter','cornerChannel','splitter','waterWheel','fountain']);
const frameTime=dt=>Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
const validId=id=>Number.isSafeInteger(id)&&id>=0;
const capacity=kind=>kind==='gutter'?6:.1;
const portCount=kind=>kind==='fountain'?0:kind==='splitter'?2:1;
const portIndex=(kind,port)=>kind==='fountain'?-1:kind==='splitter'?(port==='outletA'?0:port==='outletB'?1:-1):port==='outlet'?0:-1;
const edgeOrder=(a,b)=>(a.from??Infinity)-(b.from??Infinity)||String(a.port).localeCompare(String(b.port))||(a.to??Infinity)-(b.to??Infinity);

export function createWaterFlow(){
  let nodes=[],byId=new Map(),edges=[],rejected=[],accumulator=0;
  let next=new Float64Array(0),released=new Float64Array(0),spills=new Float64Array(0);
  const totals={source:0,poured:0,consumed:0,spilled:0};

  function configure(inputNodes,inputEdges){
    if(!Array.isArray(inputNodes)||!Array.isArray(inputEdges))throw new TypeError('Water nodes and edges must be arrays');
    if(inputNodes.length>MAX_NODES||inputEdges.length>MAX_EDGES)throw new RangeError('Water topology exceeds 80 nodes / 160 candidate edges');
    // Validate before changing any stored quantity, including removal accounting.
    const ids=new Set();
    for(const n of inputNodes){
      if(!n||!validId(n.id)||!KINDS.has(n.kind)||ids.has(n.id))throw new TypeError('Unique numeric IDs and known water kinds required');
      ids.add(n.id);
    }
    const ordered=inputNodes.slice().sort((a,b)=>a.id-b.id),fresh=[],lookup=new Map();
    let removed=0;
    for(const old of nodes)if(!ids.has(old.id))removed+=old.stored;
    for(const value of ordered){
      const old=byId.get(value.id),cap=capacity(value.kind),stored=old?.stored??0;
      removed+=Math.max(0,stored-cap);
      const node={id:value.id,kind:value.kind,on:value.on===true,sourceValid:value.sourceValid===true,
        stored:Math.min(stored,cap),flow:0,outflow:0,spill:0,
        pendingSpill:old?.pendingSpill??0,capacity:cap,outputs:[-1,-1],index:fresh.length};
      fresh.push(node);lookup.set(node.id,node);
    }
    const candidates=inputEdges.map(e=>({
      from:validId(e?.from)?e.from:null,to:validId(e?.to)?e.to:null,
      port:typeof e?.port==='string'?e.port:null,
    })).sort(edgeOrder);
    const accepted=[],failures=[],inlets=new Set();
    function reaches(start,target){
      const stack=[start],seen=new Set();
      while(stack.length){
        const i=stack.pop();if(i===target)return true;if(seen.has(i))continue;seen.add(i);
        for(const j of fresh[i].outputs)if(j>=0)stack.push(j);
      }
      return false;
    }
    for(const e of candidates){
      const from=lookup.get(e.from),to=lookup.get(e.to);let reason=null,index=-1;
      if(e.from===null||e.to===null||e.port===null)reason='invalid-edge';
      else if(!from||!to)reason='missing-node';
      else if((index=portIndex(from.kind,e.port))<0)reason='invalid-outlet';
      else if(to.kind==='pump')reason='no-inlet';
      else if(from.outputs[index]>=0)reason='duplicate-outlet';
      else if(inlets.has(to.id))reason='duplicate-inlet';
      else if(reaches(to.index,from.index))reason='cycle';
      if(reason){failures.push({...e,reason});continue;}
      from.outputs[index]=to.index;inlets.add(to.id);accepted.push({...e});
    }
    totals.spilled+=removed;
    nodes=fresh;byId=lookup;edges=accepted;rejected=failures;
    next=new Float64Array(nodes.length);released=new Float64Array(nodes.length);spills=new Float64Array(nodes.length);
    return snapshot();
  }

  // Called for a currently held can. Water not retained is still counted as
  // poured and spilled; it cannot disappear from the conservation ledger.
  function pour(id,dt){
    const n=byId.get(id),duration=frameTime(dt);
    if(!n||n.kind!=='gutter'||!duration)return 0;
    const amount=3*duration,retained=Math.min(amount,Math.max(0,n.capacity-n.stored)),overflow=amount-retained;
    n.stored+=retained;n.pendingSpill+=overflow;
    totals.poured+=amount;totals.spilled+=overflow;
    return retained;
  }

  function tick(){
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i],amount=Math.min(n.stored,DT);
      released[i]=amount;next[i]=n.stored-amount;spills[i]=n.pendingSpill;
      n.pendingSpill=0;n.flow=amount/DT;n.outflow=0;
      if(n.kind==='pump'&&n.on&&n.sourceValid){next[i]+=DT;totals.source+=DT;}
    }
    // All releases read only previous stored water. Delivered water is not
    // available downstream until a later fixed step, regardless of ID order.
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i],count=portCount(n.kind),amount=released[i];
      if(!count){totals.consumed+=amount;continue;}
      const share=amount/count;
      for(let port=0;port<count;port++){
        const target=n.outputs[port];
        if(target>=0){next[target]+=share;n.outflow+=share/DT;}
        else {spills[i]+=share;totals.spilled+=share;}
      }
    }
    for(let i=0;i<nodes.length;i++){
      const n=nodes[i],overflow=Math.max(0,next[i]-n.capacity);
      n.stored=Math.max(0,Math.min(n.capacity,next[i]));
      spills[i]+=overflow;totals.spilled+=overflow;n.spill=spills[i]/DT;
    }
  }
  function step(dt){
    const duration=frameTime(dt);if(!duration)return 0;
    accumulator+=duration;let count=0;
    while(accumulator+EPS>=DT){
      accumulator=Math.max(0,accumulator-DT);tick();count++;
    }
    return count;
  }
  function get(id){
    const n=byId.get(id);return n?{stored:n.stored,flow:n.flow,outflow:n.outflow,spill:n.spill}:null;
  }
  function snapshot(){
    return {nodes:nodes.map(n=>({id:n.id,kind:n.kind,on:n.on,sourceValid:n.sourceValid,...get(n.id)})),
      edges:edges.map(e=>({...e})),rejected:rejected.map(e=>({...e})),totals:{...totals},accumulator};
  }
  return {configure,pour,step,get,snapshot};
}
