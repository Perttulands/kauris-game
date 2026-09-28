// A timed action can leave a short echo; merely looking never creates one.
export function actionEcho(previous,{kind=null,progress=0,active=false,visible=true,now=0,complete=false}){
 if(!visible)return null;
 if(active&&['water','chop'].includes(kind))return {kind,progress:Math.max(0,Math.min(1,progress)),complete,until:now+.6};
 return previous&&now<previous.until?previous:null;
}
// Repeated held-action failures must expire, rather than renewing every frame.
export function admitFailure(memory,code,target,now){
 const key=code+':'+target;
 if(now-(memory.at??-Infinity)<.4||memory.key===key&&now-memory.at<5)return false;
 memory.key=key;memory.at=now;return true;
}
