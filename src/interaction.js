// Pure input timing. Browser transitions explicitly reset both accumulators.
export function wheelStep(w,delta,mode,now,enabled){
 if(!enabled){w.sum=0;w.last=-Infinity;w.event=-Infinity;return 0;}
 if(!Number.isFinite(delta)||delta===0)return 0;
 if(now-(w.event??-Infinity)>180)w.sum=0;
 w.event=now;
 if(now-(w.last??-Infinity)<170)return 0;
 const pixels=delta*(mode===1?16:mode===2?500:1);
 if(w.sum&&Math.sign(w.sum)!==Math.sign(pixels))w.sum=0;
 w.sum=(w.sum??0)+pixels;
 if(Math.abs(w.sum)<40)return 0;
 const step=Math.sign(w.sum);w.sum=0;w.last=now;return step;
}
// One strike clock for presses and held repeats. Release retains progress;
// null target cancels progress, but never removes the shared strike cooldown.
export function advanceChop(c,key,now,seconds=1.8,{held=false,press=false}={}){
 if(!key){c.key=null;c.elapsed=0;c.impacts=0;c.done=false;return {progress:0,impact:false,complete:false};}
 if(c.key!==key){c.key=key;c.elapsed=0;c.impacts=0;c.done=false;}
 const count=seconds<1?1:3,cadence=seconds/count;
 let impact=false,complete=false;
 if(!c.done&&(press||held)&&now+1e-8>=(c.nextAt??-Infinity)){
  c.nextAt=now+cadence;c.impacts++;c.elapsed=c.impacts*cadence;
  impact=true;complete=c.impacts>=count;c.done=complete;
 }
 return {progress:Math.min(1,c.impacts/count),impact,complete};
}

// Bare ground has no fixed destination: walking preserves a shallow ray's distance.
export function farTargetHint(target,plots,eyeY){
 if(!target?.outOfReach)return null;
 return Math.abs(eyeY-target.point?.y)<=6&&target.ground&&!target.wildId&&!target.buildId&&!target.propId&&!target.plot&&!plots[`${target.gx},${target.gz}`]?'target.lookDown':'target.closer';
}
