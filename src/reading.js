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
  if((candidate?.focusKey??candidate?.id)!==(next.focusKey??next.id)){candidate=next;since=now;current=null;}
  if(now-since>=delay)current=next;
  return current;
 },clear(){candidate=current=null;},get current(){return current;}};
}

// Angular assistance only ranks candidates already confirmed by a real visible
// mesh hit. It cannot turn a bounding sphere, a hidden body or stale ID into a noun.
export function assistedReading(direct,candidates,maxDistance=12){
 if(direct&&!['noun.grass','noun.sand','noun.soil','noun.hole'].includes(direct.key))return direct;
 let best=null,score=Infinity;
 for(const c of candidates){
  if(!c.visible||!c.semantic||!(c.distance>0&&c.distance<=maxDistance)||!(c.forward>0))continue;
  const tolerance=Math.min(Math.PI/30,c.angularRadius+Math.PI/90);
  if(!(c.angle>=0&&c.angle<=tolerance))continue;
  const next=c.angle/(tolerance||1)+c.distance*.005;
  if(next<score){best=c.semantic;score=next;}
 }
 return best??direct;
}
