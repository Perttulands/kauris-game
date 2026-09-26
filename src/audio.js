// Small local synthesis, never a prerequisite for play. Voices are bounded and short.
export function createAudio(storage){
 let context,muted=false,voices=0,lastWater=-1;const active=new Set();try{storage??=globalThis.localStorage;muted=storage.getItem('kauris-muted')==='1';}catch{}
 const profiles={dig:[110,.15,'noise'],fill:[160,.17,'noise'],plant:[580,.14,'sine'],chop:[130,.12,'noise'],build:[230,.14,'triangle'],remove:[300,.12,'triangle'],grow:[720,.25,'sine'],discover:[920,.38,'sine'],harvest:[650,.22,'triangle'],water:[1000,.13,'noise'],cloth:[480,.16,'sine']};
 function start(){try{context??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();context.resume().catch(()=>{});}catch{}}
 function play(kind){
  if(muted||!context||context.state!=='running'||voices>=8)return;
  const [pitch,duration,type]=profiles[kind]??profiles.plant,t=context.currentTime;if(kind==='water'&&t-lastWater<.22)return;if(kind==='water')lastWater=t;
  try{const gain=context.createGain(),filter=context.createBiquadFilter();let source;
   if(type==='noise'){const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(kind==='chop'?Math.exp(-i/data.length*4):1);source=context.createBufferSource();source.buffer=buffer;filter.type=kind==='water'?'highpass':'lowpass';filter.frequency.value=kind==='water'?1700:kind==='chop'?1500:650;}
   else{source=context.createOscillator();source.type=type;source.frequency.setValueAtTime(pitch*(.96+Math.random()*.08),t);source.frequency.exponentialRampToValueAtTime(pitch*(kind==='discover'?1.5:.8),t+duration);filter.frequency.value=4000;}
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(kind==='water'?.018:.055,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);source.connect(filter).connect(gain).connect(context.destination);voices++;active.add(source);source.onended=()=>{voices--;active.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};source.start(t);source.stop(t+duration+.01);
  }catch{}
 }
 function pause(){for(const source of active)try{source.stop();}catch{}if(context?.state==='running')context.suspend().catch(()=>{});}
 return {start,play,pause,get muted(){return muted;},toggle(){muted=!muted;try{storage.setItem('kauris-muted',muted?'1':'0');}catch{}if(muted)pause();else start();return muted;},snapshot:()=>({muted,state:context?.state??'not-started',voices})};
}
