// Original deterministic synthesis. Actions retain their identity across materials.
export const PENTATONIC=Object.freeze([261.626,293.665,329.628,391.995,440]);
export const PROFILES=Object.freeze({
 step:{duration:.18,gain:.40,rate:.18,priority:100},
 dig:{duration:.43,gain:.66,rate:.12,priority:100},
 plant:{duration:.24,gain:.42,rate:.12,priority:100},
 fill:{duration:.38,gain:.56,rate:.12,priority:100},
 chop:{duration:.25,gain:.67,rate:.10,priority:100},
 harvest:{duration:.48,gain:.52,rate:.20,priority:100},
 build:{duration:.30,gain:.60,rate:.10,priority:100},
 remove:{duration:.36,gain:.52,rate:.10,priority:100},
 bell:{duration:1.15,gain:.34,rate:.60,priority:50},
 liftStart:{duration:.30,gain:.38,rate:.20,priority:70},
 liftArrival:{duration:.38,gain:.32,rate:.30,priority:70},
 lamp:{duration:.18,gain:.28,rate:.15,priority:70},
 cloth:{duration:.34,gain:.38,rate:.15,priority:70},
 shelter:{duration:.22,gain:.35,rate:.20,priority:70},
 discover:{duration:.65,gain:.30,rate:10,priority:20,category:'world',notification:true},
 arrival:{duration:.52,gain:.26,rate:10,priority:20,category:'world',notification:true},
 whale:{duration:3.8,gain:.50,rate:20,priority:30,category:'world',range:48},
 bird:{duration:.62,gain:.22,rate:10,priority:15,category:'world',critter:true,range:24},
 water:{duration:4,gain:.56,priority:110,category:'continuous',loop:true},
 wheel:{duration:2,gain:.32,priority:40,category:'continuous',loop:true},
 liftMove:{duration:2,gain:.30,priority:45,category:'continuous',loop:true},
 shore:{duration:6,gain:.36,priority:10,category:'continuous',loop:true},
 underwater:{duration:6,gain:.32,priority:10,category:'continuous',loop:true}
});
const materials=new Set(['wood','copper','iron','diamond','fiber']);
const surfaces=new Set(['grass','sand','rock','seabed','wood']);
export function profileKey(request,material,surface){
 if(!Object.hasOwn(PROFILES,request))return null;
 const m=materials.has(material)?material:'wood';
 const s=surfaces.has(surface)?surface:surface==='stone'?'rock':'grass';
 return `${request}:${PROFILES[request].loop?'wood':request==='step'?(materials.has(material)?m:s):m}`;
}
export const AUDIO_SAMPLES=Object.freeze(Object.keys(PROFILES));
const tau=2*Math.PI;
function hash(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function synthesize(context,key){
 const [kind,material='wood']=key.split(':'),p=PROFILES[kind];
 if(!p)throw Error('Unknown audio profile');
 const n=Math.round(context.sampleRate*p.duration),overlap=p.loop?Math.round(context.sampleRate*.16):0;
 const raw=new Float32Array(n+overlap);let seed=hash(key),low=0,slow=0;
 const hard=['rock','iron','copper','diamond'].includes(material),soft=['grass','sand','seabed','fiber'].includes(material);
 const tone=({wood:155,copper:245,iron:185,diamond:330,fiber:95,rock:225,sand:105,seabed:90,grass:115})[material]??155;
 for(let i=0;i<raw.length;i++){
  const t=i/context.sampleRate,u=t/p.duration;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
  low+=.12*(noise-low);slow+=.012*(noise-slow);const high=noise-low;
  let v=0;
  if(kind==='step')v=(low*(soft?.60:.36)+high*(hard?.06:.025)+Math.sin(tau*tone*.60*t)*.12)*Math.exp(-t*26);
  else if(kind==='dig')v=(high*.17+low*.45)*Math.sin(Math.PI*Math.min(1,u))**1.4+Math.sin(tau*78*t)*.12*Math.exp(-t*18);
  else if(kind==='chop')v=(high*.14*Math.exp(-t*40)+Math.sin(tau*tone*1.5*t)*.25+Math.sin(tau*tone*2.71*t)*.10)*Math.exp(-t*24);
  else if(kind==='fill')v=(low*.65+high*.08)*(Math.sin(Math.PI*u)**1.4)*(.75+.25*Math.sin(t*81));
  else if(kind==='plant')v=(low*.40+high*.045)*Math.sin(Math.PI*u)**2;
  else if(kind==='cloth')v=high*.105*Math.sin(Math.PI*u)**1.4*(.7+.3*Math.sin(t*33));
  else if(kind==='harvest')v=(low*.30+high*.09)*Math.sin(Math.PI*u)**1.3+Math.sin(tau*tone*t)*.10*Math.exp(-t*15);
  else if(['build','remove','shelter'].includes(kind))v=(low*.30+Math.sin(tau*tone*t)*.23+Math.sin(tau*tone*2.13*t)*.06)*Math.exp(-t*(kind==='remove'?14:21));
  else if(kind==='bell')v=(Math.sin(tau*392*t)*.27+Math.sin(tau*1043*t)*.055*Math.exp(-t*6))*Math.exp(-t*4.7);
  else if(kind==='lamp')v=(low*.14+Math.sin(tau*310*t)*.065)*Math.exp(-t*32);
  else if(kind==='liftStart'||kind==='liftArrival')v=(low*.24+Math.sin(tau*(kind==='liftStart'?112:145)*t)*.10)*Math.sin(Math.PI*u)*Math.exp(-t*7);
  else if(kind==='discover'||kind==='arrival')v=(Math.sin(tau*(kind==='discover'?392:261.626)*t)*.16+Math.sin(tau*523.252*t)*.06)*Math.sin(Math.PI*u)**2*Math.exp(-t*3);
  else if(kind==='bird'){const a=t-.035,b=t-.29;if(a>=0&&a<.16)v+=Math.sin(tau*(2200*a+2300*a*a))*.16*Math.sin(Math.PI*a/.16)**2;if(b>=0&&b<.13)v+=Math.sin(tau*(3000*b-3500*b*b))*.13*Math.sin(Math.PI*b/.13)**2;}
  else if(kind==='water')v=(low*.53+high*.055)*(1+.055*Math.sin(t*47))+.016*Math.sin(tau*(730*t+.12*Math.sin(t*19)));
  else if(kind==='wheel')v=slow*.30+low*.18+Math.sin(tau*93*t)*.045*(.65+.35*Math.cos(tau*2*t));
  else if(kind==='liftMove')v=slow*.25+low*.12+Math.sin(tau*108*t)*.035+Math.sin(tau*216*t)*.01;
  else if(kind==='shore')v=(low*.25+slow*.45)*(.8+.12*Math.sin(tau*t/6));
  else if(kind==='underwater')v=slow*.70+low*.06+Math.sin(tau*146*t)*.008;
  else if(kind==='whale'){const phase=tau*(190*t-7*t*t+1.2*Math.sin(t*1.7));v=(Math.sin(phase)*.16+Math.sin(phase*2)*.11+Math.sin(phase*3)*.045)*Math.sin(Math.PI*u)**1.6;}
  if(!p.loop)v*=Math.min(1,t/(kind==='chop'?.003:.009),(p.duration-t)/.025);
  raw[i]=v;
 }
 const buffer=context.createBuffer(1,n,context.sampleRate),out=buffer.getChannelData(0);let mean=0;
 // Equal-power overlap makes the seam interior stationary audio, not a fade to zero.
 // End approaches raw[overlap], the exact continuation at the beginning of the loop.
 for(let i=0;i<n;i++){
  let v=raw[i];
  if(overlap){v=raw[i+overlap];if(i>=n-overlap){const j=i-(n-overlap),a=j/overlap*Math.PI/2;v=v*Math.cos(a)+raw[j]*Math.sin(a);}}
  out[i]=v;mean+=v;
 }
 mean/=n;for(let i=0;i<n;i++)out[i]-=mean;
 return buffer;
}
