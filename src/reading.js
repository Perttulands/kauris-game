// Pure semantic selection: action rays and authoritative state never enter this module.
export function nearestReading(hits,maxDistance=12){
 for(const hit of [...hits].sort((a,b)=>a.distance-b.distance)){
  if(hit.distance>maxDistance)break;
  if(hit.semantic)return hit.semantic;
  if(hit.opaque)return null;
 }
 return null;
}
export function createReadingFocus(delay=120){
 let candidate=null,since=0,current=null;
 return {update(next,now){
  if(!next){candidate=current=null;return null;}
  if(candidate?.id!==next.id){candidate=next;since=now;current=null;}
  if(now-since>=delay)current=next;
  return current;
 },clear(){candidate=current=null;},get current(){return current;}};
}
