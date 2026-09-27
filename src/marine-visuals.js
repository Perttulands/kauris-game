import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

// All values enclose the whole articulated animal, not just its torso. Root motion
// and terrain tilt belong to the caller. These local bounds also guard raycasts.
export const MARINE_PROFILES = Object.freeze({
  fish: Object.freeze({ radius: .42, minY: -.25, maxY: .25, stride: .32 }),
  crab: Object.freeze({ radius: .72, minY: 0, maxY: .45, stride: .24 }),
  turtle: Object.freeze({ radius: .9, minY: -.3, maxY: .3, stride: 1.2 }),
  octopus: Object.freeze({ radius: .8, minY: 0, maxY: .85, stride: .28 }),
  starfish: Object.freeze({ radius: .34, minY: 0, maxY: .14, stride: .1 }),
  anemone: Object.freeze({ radius: .36, minY: 0, maxY: .5, stride: 0 }),
});

const TAU = Math.PI * 2;
const SIDES = Object.freeze([-1, 1]);
const clamp = THREE.MathUtils.clamp;
const fract = v => v - Math.floor(v);
const smooth = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
const palette = new Map();
function rgb(hex) {
  if (!palette.has(hex)) palette.set(hex, new THREE.Color(hex));
  return palette.get(hex);
}
const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .64, metalness: 0, side: THREE.DoubleSide });
const templates = new Map();
const rigs = new WeakMap();
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

// A single vertex-painted, skinned surface includes the small seams, cups and
// scales. Each primitive has its own normals, but never its own draw call.
class Surface {
  constructor() { this.p = []; this.c = []; this.i = []; this.si = []; this.sw = []; }
  vertex(p, color, skin = 0) {
    const id = this.p.length / 3, c = typeof color === 'string' ? rgb(color) : color;
    this.p.push(...p); this.c.push(c.r, c.g, c.b);
    if (typeof skin === 'number') { this.si.push(skin, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    else { this.si.push(skin[0], skin[1], 0, 0); this.sw.push(1 - skin[2], skin[2], 0, 0); }
    return id;
  }
  patch(nu, nv, fn, color, skin = 0, reverse = false) {
    const start = this.p.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = fn(u, v);
      this.vertex(p, typeof color === 'function' ? color(u, v, p) : color, typeof skin === 'function' ? skin(u, v, p) : skin);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = start + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (reverse) this.i.push(a, c, b, b, c, d); else this.i.push(a, b, c, b, d, c);
    }
  }
  ellipsoid(center, scale, color, bone = 0, segments = 12, rings = 8) {
    this.patch(segments, rings, (u, v) => {
      const a = u * TAU, b = v * Math.PI;
      return [center[0] + Math.sin(b) * Math.cos(a) * scale[0], center[1] + Math.cos(b) * scale[1], center[2] + Math.sin(b) * Math.sin(a) * scale[2]];
    }, color, bone, true);
  }
  tube(points, radii, color, skin = 0, sides = 8, flatten = 1) {
    const n = points.length - 1;
    const frames = points.map((p, i) => {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n, i + 1)];
      const tangent = vec(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      const side = vec(0, 1, 0).cross(tangent);
      if (side.lengthSq() < .001) side.set(1, 0, 0); else side.normalize();
      return [side, tangent.clone().cross(side).normalize()];
    });
    this.patch(sides, n, (u, v) => {
      const k = Math.round(v * n), p = points[k], r = radii[k], a = u * TAU, [side, up] = frames[k];
      return [p[0] + r * (Math.cos(a) * side.x + Math.sin(a) * up.x * flatten), p[1] + r * (Math.cos(a) * side.y + Math.sin(a) * up.y * flatten), p[2] + r * (Math.cos(a) * side.z + Math.sin(a) * up.z * flatten)];
    }, color, typeof skin === 'function' ? (u, v, p) => skin(v, p) : skin, true);
  }
  // A closed, bevelled leaf/blade surface: fins and flippers have real thickness.
  blade(outline, center, thickness, color, bone = 0) {
    const edgeA=vec(...outline[1]).sub(vec(...outline[0])),edgeB=vec(...outline[2]).sub(vec(...outline[0]));
    const normal=edgeA.cross(edgeB).normalize();
    if(normal.y<0)normal.negate();
    const top = this.vertex(center.map((v,i)=>v+normal.getComponent(i)*thickness), color, bone);
    const bottom = this.vertex(center.map((v,i)=>v-normal.getComponent(i)*thickness), color, bone);
    const ids = outline.map(p => this.vertex(p, color, bone));
    for (let i = 0; i < ids.length; i++) {
      const j = (i + 1) % ids.length;
      this.i.push(top, ids[j], ids[i], bottom, ids[i], ids[j]);
    }
  }
  stud(center, scale, color, bone=0) {
    const c=this.vertex([center[0],center[1]+scale[1],center[2]],color,bone),ring=[];
    for(let j=0;j<4;j++)ring.push(this.vertex([center[0]+Math.cos(j*Math.PI/2)*scale[0],center[1],center[2]+Math.sin(j*Math.PI/2)*scale[2]],color,bone));
    for(let j=0;j<4;j++)this.i.push(c,ring[(j+1)%4],ring[j]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.i); g.computeVertexNormals(); return g;
  }
}

class Animal {
  constructor(kind, variant) {
    this.kind = kind; this.variant = variant; this.surface = new Surface();
    this.group = new THREE.Group(); this.group.name = `marine-${kind}-${variant}`;
    this.bones = []; this.worldPositions = [];
    this.bone('body', [0, 0, 0]);
  }
  bone(name, position, parent = 0) {
    const b = new THREE.Bone(); b.name = name;
    const id = this.bones.length;
    b.position.fromArray(position);
    if (id) { b.position.sub(this.worldPositions[parent]); this.bones[parent].add(b); }
    else this.group.add(b);
    this.bones.push(b); this.worldPositions.push(vec(...position)); return id;
  }
  finish() {
    const mesh = new THREE.SkinnedMesh(this.surface.geometry(), material);
    mesh.name = `${this.kind}-painted-skin`; mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh); this.group.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    const p = MARINE_PROFILES[this.kind];
    mesh.boundingBox = new THREE.Box3(vec(-p.radius, p.minY, -p.radius), vec(p.radius, p.maxY, p.radius));
    mesh.boundingSphere = new THREE.Sphere(vec(0, (p.minY + p.maxY) / 2, 0), Math.hypot(p.radius, (p.maxY - p.minY) / 2));
    this.group.userData.marineKind = this.kind;
    this.group.userData.marineVariant = this.variant;
    return this.group;
  }
}

function eye(s, center, size, bone, side = 1, pupilDirection = 'side') {
  s.ellipsoid(center, [size * .72, size, size], '#eadca5', bone, 10, 6);
  const p = [...center];
  if (pupilDirection === 'front') p[2] += size * .8; else p[0] += side * size * .59;
  s.ellipsoid(p, pupilDirection === 'front' ? [size * .56, size * .67, size * .3] : [size * .23, size * .65, size * .65], '#172e32', bone, 10, 6);
  const h = [...p]; h[1] += size * .28;
  if (pupilDirection === 'front') h[2] += size * .24; else h[0] += side * size * .18;
  s.ellipsoid(h, [size * .15, size * .17, size * .16], '#fff2d3', bone, 6, 4);
}

function fish(variant) {
  const a = new Animal('fish', variant), s = a.surface, deep = variant % 2 === 0;
  const tail = a.bone('tail', [0, 0, -.205]);
  const left = a.bone('fin-left', [-.065, -.035, .055]), right = a.bone('fin-right', [.065, -.035, .055]);
  const back = deep ? '#318d98' : '#477ab5', gold = deep ? '#f4b85d' : '#e5c469', cream = '#f4e0b3';
  const stations = deep ? [[.27,.015,.04],[.235,.054,.084],[.14,.082,.146],[.015,.094,.177],[-.12,.065,.131],[-.21,.019,.032],[-.245,.012,.018]] : [[.32,.014,.034],[.27,.038,.058],[.17,.066,.09],[.015,.072,.103],[-.15,.042,.065],[-.235,.015,.026]];
  s.patch(20, stations.length - 1, (u, v) => {
    const [z, rx, ry] = stations[Math.round(v * (stations.length - 1))], t = u * TAU;
    return [Math.cos(t) * rx, Math.sin(t) * ry, z];
  }, (u, v, p) => p[1] < -.025 ? cream : (deep ? ((v > .18 && v < .28) || (v > .47 && v < .58) || v > .75 ? '#193e50' : back) : (Math.abs(p[1] - .025) < .033 ? gold : back)), 0);
  // Pointed dorsal and anal sails belong to the disk silhouette; the cruiser has
  // a low swept dorsal and deeply forked tail instead of a recolored disk.
  const dorsal = deep ? [[0,.12,.14],[0,.234,-.015],[0,.22,-.11],[0,.055,-.225],[0,.045,-.12]] : [[0,.065,.12],[0,.15,.03],[0,.085,-.12],[0,.04,-.18]];
  s.blade(dorsal, [0, deep ? .145 : .09, -.05], .002, gold);
  const anal = deep ? [[0,-.10,.07],[0,-.213,-.08],[0,-.10,-.2],[0,-.04,-.22]] : [[0,-.07,-.035],[0,-.13,-.16],[0,-.025,-.22]];
  s.blade(anal, [0,-.09,-.1], .002, back);
  s.tube([[0,0,-.2],[0,0,-.26]], [.022,.016], back, tail);
  const fork = deep ? .12 : .115;
  s.blade([[0,.019,-.245],[0,fork,-.38],[0,.045,-.35],[0,0,-.31],[0,-.045,-.35],[0,-fork,-.38],[0,-.019,-.245]], [0,0,-.273], .003, gold, tail);
  for (const side of [-1, 1]) {
    const bone = side < 0 ? left : right;
    s.blade([[side*.05,-.018,.06],[side*.157,-.048,-.03],[side*.115,-.10,-.085],[side*.058,-.064,.025]], [side*.082,-.047,.015], .004, deep ? '#e9b568' : '#a8cad0', bone);
    eye(s, [side * (deep ? .057 : .041), .032, deep ? .205 : .267], .026, 0, side);
    s.tube([[side*.067,.066,.13],[side*.084,.018,.112],[side*.072,-.037,.11]], [.004,.005,.002], '#284a55', 0, 5);
    if (!deep) s.tube([[side*.046,.031,.24],[side*.076,.026,.06],[side*.046,.018,-.16]], [.004,.006,.002], '#fbdfa0', 0, 5);
  }
  s.ellipsoid([0,-.012,deep?.278:.327], [.015,.013,.005], '#b98d67', 0, 8, 5);
  return a.finish();
}

function crab(variant) {
  const a = new Animal('crab', variant), s = a.surface;
  const rust = variant % 2 ? '#b7663e' : '#c97549', light = '#e9b479', edge = '#7d493b';
  // Wide shield with a scalloped front rim and low ridged shoulder plates.
  s.patch(32, 10, (u,v) => {
    const t = u*TAU, r = Math.sin(v*Math.PI/2), tooth = 1 + .035*Math.sin(t*12)**2;
    return [Math.cos(t)*.273*r*tooth, .172 + .118*Math.cos(v*Math.PI/2), Math.sin(t)*.197*r];
  }, (u,v) => v > .87 ? light : Math.sin(u*TAU*3) > .7 && v < .8 ? '#d68d54' : rust);
  s.ellipsoid([0,.153,0], [.247,.044,.18], '#d59e6c', 0, 20, 6);
  for (const side of [-1,1]) {
    s.tube([[side*.025,.278,-.09],[side*.095,.286,-.035],[side*.17,.257,.01]], [.009,.013,.004], light, 0, 6);
    for(let j=0;j<5;j++) {
      const t = -.72+j*.34;
      s.blade([[side*(.258*Math.cos(t)),.182,.18*Math.sin(t)],[side*(.286*Math.cos(t)),.189,.19*Math.sin(t)+.016],[side*(.256*Math.cos(t)),.206,.18*Math.sin(t)+.026]], [side*.263*Math.cos(t),.196,.18*Math.sin(t)], .005, light);
    }
    for(let j=0;j<4;j++) {
      const z = -.135+j*.082, endZ = -.22+j*.133;
      const hip=[side*.215,.166,z], knee=[side*.365,.23,endZ], foot=[side*(.455+(j===1||j===2?.035:0)),.006,endZ+.035];
      const upper=a.bone(`leg-${side}-${j}-upper`,hip), lower=a.bone(`leg-${side}-${j}-lower`,knee);
      s.tube([hip,[side*.308,.225,(z+endZ)/2],knee],[.038,.034,.021],rust,upper,7,.68);
      s.ellipsoid(knee,[.026,.024,.028],edge,lower,8,5);
      s.tube([knee,[side*(Math.abs(foot[0])-.018),.05,foot[2]-.015],foot],[.023,.017,.005],light,lower,7,.62);
    }
    const shoulder=[side*.18,.167,.117], elbow=[side*.32,.165,.26], hand=[side*.31,.204,.355];
    const arm=a.bone(`claw-${side}`,shoulder), finger=a.bone(`finger-${side}`, [side*.28,.217,.395],arm);
    s.tube([shoulder,elbow,hand],[.044,.035,.055],rust,arm,9);
    s.ellipsoid(hand,[.078,.055,.089],rust,arm,12,7);
    s.tube([[side*.35,.209,.373],[side*.37,.209,.438],[side*.315,.209,.488]],[.037,.022,.004],light,arm,8,.72);
    s.tube([[side*.275,.217,.39],[side*.245,.217,.449],[side*.299,.214,.475]],[.033,.022,.004],light,finger,8,.75);
    const stalk=a.bone(`eye-${side}`,[side*.097,.206,.157]);
    s.tube([[side*.097,.206,.157],[side*.114,.263,.189]],[.014,.013],edge,stalk,7);
    eye(s,[side*.114,.274,.191],.029,stalk,side,'front');
  }
  s.ellipsoid([0,.161,.187],[.046,.018,.018],edge,0,10,5);
  s.tube([[-.024,.168,.204],[0,.158,.21],[.024,.168,.204]],[.004,.004,.004],light,0,5);
  // The pale folded abdominal plate gives the underside an intentional reading.
  s.blade([[-.087,.12,-.095],[.087,.12,-.095],[.055,.112,.10],[0,.109,.14],[-.055,.112,.10]],[0,.112,0],.009,'#efd19a');
  return a.finish();
}

function turtle(variant) {
  const a = new Animal('turtle',variant), s=a.surface;
  const head=a.bone('head',[0,-.01,.36]);
  // Carapace is a low longitudinal dome, with individually inset broad scutes.
  const shellY=(x,z)=>.005+.215*Math.sqrt(Math.max(0,1-(x/.35)**2-(z/.49)**2));
  s.patch(32,12,(u,v)=>{const t=u*TAU,r=Math.sin(v*Math.PI/2),x=.35*r*Math.cos(t),z=.49*r*Math.sin(t);return[x,shellY(x,z),z];},'#344f46');
  const plate=(x,z,rx,rz,col,segments=6)=>{
    const outline=[];
    for(let j=0;j<segments;j++){const t=j/segments*TAU,px=x+Math.cos(t)*rx,pz=z+Math.sin(t)*rz;outline.push([px,shellY(px,pz)+.004,pz]);}
    s.blade(outline,[x,shellY(x,z)+.006,z],.003,col);
    for(let j=0;j<segments;j++){const p=outline[j],q=outline[(j+1)%segments];s.tube([p,q],[.003,.003],'#afaa6b',0,4);}
  };
  for(let i=0;i<4;i++) plate(0,-.30+i*.20,.104,.117,i%2?'#80966c':'#97a674');
  for(const side of[-1,1])for(let i=0;i<4;i++)plate(side*(i===0||i===3?.163:.208),-.30+i*.20,.09,.112,i%2?'#62866a':'#7c956c');
  const rim=[]; for(let i=0;i<=48;i++){const t=i/48*TAU;rim.push([.35*Math.cos(t),.011,.49*Math.sin(t)]);}
  s.tube(rim,rim.map(()=>.015),'#c7bd86',0,6);
  for(let i=0;i<24;i++){
    const t=(i+.5)/24*TAU,x=.324*Math.cos(t),z=.458*Math.sin(t);
    plate(x,z,.025,.031,i%2?'#728665':'#a5a677',5);
  }
  s.ellipsoid([0,-.055,0],[.303,.091,.435],'#e1cf99',0,24,8);
  for(const side of[-1,1])for(let i=0;i<3;i++)s.tube([[0,-.144,-.25+i*.18],[side*.15,-.132,-.29+i*.18],[side*.25,-.10,-.30+i*.18]],[.003,.003,.002],'#b69d70',0,5);
  s.tube([[0,-.02,.325],[0,-.015,.44],[0,.006,.52]],[.10,.086,.082],'#799987',head,12,.78);
  // A flattened beaked face: broad forehead, short rounded snout, lower jaw.
  s.ellipsoid([0,.01,.547],[.102,.081,.118],'#86a38a',head,16,9);
  s.ellipsoid([0,-.023,.596],[.076,.033,.078],'#e2d0a0',head,12,6);
  s.tube([[-.062,-.027,.626],[0,-.035,.665],[.062,-.027,.626]],[.003,.004,.003],'#486459',head,5);
  for(const side of[-1,1]){
    eye(s,[side*.084,.035,.587],.025,head,side);
    s.ellipsoid([side*.031,.035,.651],[.008,.005,.004],'#344c45',head,6,4);
    for(let j=0;j<4;j++)s.ellipsoid([side*(.085-j*.007),.033+.028*Math.sin(j),.485+j*.037],[.017,.009,.015],'#b2bd92',head,7,4);
    for(const fore of[true,false]){
      const origin=[side*(fore?.25:.22),-.03,fore?.205:-.31],name=`flipper-${fore?'front':'rear'}-${side}`;
      const bone=a.bone(name,origin);
      const coords=fore?[[.25,-.025,.24],[.47,-.04,.15],[.77,-.054,-.15],[.81,-.057,-.245],[.72,-.061,-.235],[.49,-.08,-.13],[.30,-.079,.015]]:[[.19,-.05,-.27],[.34,-.066,-.35],[.44,-.075,-.49],[.38,-.072,-.52],[.23,-.06,-.43]];
      const outline=coords.map(p=>[side*p[0],p[1],p[2]]),c=fore?[side*.43,-.047,.027]:[side*.29,-.06,-.39];
      s.blade(outline,c,fore?.034:.022,'#759887',bone);
      const underside=outline.map(p=>[p[0],p[1]-.006,p[2]]);
      s.blade(underside,[c[0],c[1]-.023,c[2]],.005,'#d1c698',bone);
      const n=fore?6:3;
      for(let j=0;j<n;j++){
        const t=j/(n-1),x=fore?.33+.36*t:.27+.10*t,z=fore?.125-.30*t:-.35-.09*t;
        s.ellipsoid([side*x,-.035-.013*t,z],[fore?.033:.022,.005,fore?.032:.026],j%2?'#a9b793':'#c3c59b',bone,6,4);
      }
    }
  }
  s.tube([[0,-.039,-.40],[0,-.06,-.53],[0,-.049,-.56]],[.027,.015,.002],'#82a18a',0,8);
  return a.finish();
}

function octopus(variant) {
  const a=new Animal('octopus',variant),s=a.surface,skin='#c36f50',shade='#9c493b',light='#df9870';
  const mantle=a.bone('mantle',[0,.24,-.055]);
  // One continuous low pear: the upper hood leans behind the eye-bearing face.
  // Its lower skin blends into the root web instead of stacking a head and collar.
  s.patch(24,14,(u,v)=>{
    const t=u*TAU,b=v*Math.PI,r=Math.sin(b)*(1-.10*Math.cos(b)),y=.315+Math.cos(b)*.23;
    return[Math.cos(t)*.208*r,y,-.015-.15*smooth((y-.18)/.35)+Math.sin(t)*.198*r];
  },(u,v)=>Math.sin(u*TAU*3+v*9)>.68?'#d18a66':skin,(u,v)=>[0,mantle,smooth((.72-v)/.55)],false);
  for(const side of[-1,1]){
    s.ellipsoid([side*.15,.273,.135],[.055,.052,.044],skin,0,10,6);
    eye(s,[side*.158,.274,.162],.040,0,side,'front');
    s.tube([[side*.127,.307,.16],[side*.158,.319,.17],[side*.19,.307,.141]],[.011,.013,.006],light,0,7);
    s.tube([[side*.123,.196,.135],[side*.12,.185,.188]],[.025,.019],shade,0,9);
  }
  // Continuous broad web joins the arm roots. Individual limbs grow from its
  // margin and curl asymmetrically; two rows of cups share the skin draw call.
  s.patch(48,7,(u,v)=>{const t=u*TAU,r=v*(.255+.012*Math.cos(t*8));return[Math.sin(t)*r,.068+.115*(1-v)**1.4-.005*Math.cos(t*8)*v,Math.cos(t)*r];},(u,v)=>Math.cos(u*TAU*8)>.85&&v>.6?'#ce805b':skin,0,true);
  for(let j=0;j<8;j++){
    const angle=j/8*TAU, length=.45+.07*Math.sin(j*2.2), points=[];
    for(let k=0;k<=16;k++){
      const t=k/16,r=.18+length*t,curve=.25*Math.sin(t*Math.PI)*Math.sin(j*1.9)+.18*t*t*(j%2?1:-1);
      const yaw=angle+curve,radius=.071*(1-t)**1.1+.006;
      const y=.013+radius*.65+.08*smooth((t-.68)/.32)*(j%3===0?1:.30);
      points.push([Math.sin(yaw)*r,y,Math.cos(yaw)*r]);
    }
    const bones=[]; for(let k=0;k<5;k++)bones.push(a.bone(`arm-${j}-${k}`,points[k*4],k?bones[k-1]:0));
    const weights=t=>{const f=Math.min(3.999,t*4),i=Math.floor(f);return[bones[i],bones[i+1],f-i];};
    s.tube(points,points.map((p,k)=>.071*(1-k/16)**1.1+.006), (u,v)=>Math.sin(u*TAU)<-.12?'#edbb91':(Math.cos(u*TAU*3+v*15)>.75?light:skin),weights,10,.65);
    for(let k=1;k<12;k++){
      const t=k/13,index=Math.round(t*16),p=points[index],r=.071*(1-t)**1.1+.006;
      const tangent=vec(...points[Math.min(16,index+1)]).sub(vec(...points[Math.max(0,index-1)])).normalize();
      const side=vec(0,1,0).cross(tangent).normalize();
      for(const sign of[-1,1]){
        const cx=p[0]+side.x*r*.46*sign,cy=p[1]-r*.59,cz=p[2]+side.z*r*.46*sign,size=.016*(1-t)+.004;
        // Annular recessed cups, not individual meshes or opaque dots.
        s.patch(8,2,(u,v)=>{const ang=u*TAU,rr=size*(v===0?1.15:v===.5?1:.42),y=cy-(v===.5?.010:v===1?.004:0);return[cx+Math.cos(ang)*rr,y,cz+Math.sin(ang)*rr];},(u,v)=>v===1?'#b9795f':'#f0cba5',weights(t));
      }
    }
  }
  return a.finish();
}

function starfish(variant) {
  const a=new Animal('starfish',variant),s=a.surface,colors=['#dc9466','#b77791','#d7b76e'],color=colors[variant%3];
  // One continuous five-armed skin, subtly convex with a pale grooved underside.
  const radius=t=>.205+.102*Math.cos(t*5);
  const boneIds=[]; for(let j=0;j<5;j++)boneIds.push(a.bone(`tip-${j}`,[Math.cos(j/5*TAU)*.20,.035,Math.sin(j/5*TAU)*.20]));
  const weights=(u,v)=>{const j=Math.round(u*5)%5;return[0,boneIds[j],smooth((v-.65)/.35)*.7];};
  s.patch(50,8,(u,v)=>{const t=u*TAU,r=radius(t)*v;return[Math.cos(t)*r,.026+.057*(1-v*v)+.007*Math.cos(t*5)*v,Math.sin(t)*r];},(u,v)=>v>.89?'#edbf93':color,weights,true);
  s.patch(50,4,(u,v)=>{const t=u*TAU,r=radius(t)*v;return[Math.cos(t)*r,.025-.016*(1-v),Math.sin(t)*r];},'#ecd3b0',weights);
  for(let j=0;j<5;j++){
    const t=j/5*TAU;
    for(let k=1;k<8;k++){
      const r=.027+k*.033,y=.026+.057*(1-(r/.307)**2),skin=[0,boneIds[j],smooth((r/.307-.65)/.35)*.7];
      for(const offset of[-.15,0,.15])s.stud([Math.cos(t+offset)*r,y+.002,Math.sin(t+offset)*r],[.007,.005,.007],k%2?'#f2cfa0':'#b77e65',skin);
      for(const side of[-1,1])s.stud([Math.cos(t)*r-Math.sin(t)*.012*side,.012,Math.sin(t)*r+Math.cos(t)*.012*side],[.004,-.005,.005],'#c29f7c',skin);
    }
  }
  return a.finish();
}

function anemone(variant) {
  const a=new Animal('anemone',variant),s=a.surface,body='#bb8c78';
  // A short attached fleshy foot, with a visible ridged oral disc above it.
  const radii=[.172,.158,.123,.132],heights=[.008,.03,.061,.081];
  s.patch(16,3,(u,v)=>{const t=u*TAU,k=Math.round(v*3),r=radii[k]*(1+.04*Math.sin(t*5));return[Math.cos(t)*r,heights[k],Math.sin(t)*r];},body);
  s.patch(20,3,(u,v)=>{const t=u*TAU,r=.016+.121*v;return[Math.cos(t)*r,.09+.016*Math.sin(v*Math.PI)+.004*Math.cos(t*10)*v,Math.sin(t)*r];},(u,v)=>v>.5?'#d0a388':'#e2b89a',0,true);
  s.ellipsoid([0,.094,0],[.025,.004,.014],'#8b665f',0,8,3);
  // Fewer strands, with the old triangle budget spent on flowing C/S profiles.
  for(let j=0;j<20;j++){
    const angle=j/20*TAU,inner=j%2===0,r=inner?.073:.119,reach=inner?.079:.135;
    const height=(inner?.26:.205)+.037*Math.sin(j*2.17),base=[Math.cos(angle)*r,.093,Math.sin(angle)*r];
    const b=a.bone(`tentacle-${j}`,base),pts=[];
    for(let k=0;k<=6;k++){
      const t=k/6,yaw=angle+(j%3-1)*.30*t+.14*Math.sin(t*Math.PI),radial=r+reach*Math.sin(t*Math.PI*.88)+.019*Math.sin(t*TAU)*(j%2?1:-1);
      pts.push([Math.cos(yaw)*radial,.093+height*Math.sin(t*Math.PI*(j%3===0?.69:.59)),Math.sin(yaw)*radial]);
    }
    const rootColor=rgb(variant%2?'#b6ad81':'#cf9589'),tipColor=rgb(variant%2?'#e1dcb0':'#f3c5b4');
    s.tube(pts,[.019,.0185,.016,.014,.010,.006,.0008],(u,v)=>rootColor.clone().lerp(tipColor,smooth(v)),b,6);
  }
  return a.finish();
}

const factories={fish,crab,turtle,octopus,starfish,anemone};

export function createMarineAnimal(kind='fish',variant=0) {
  if(!factories[kind]) kind='fish';
  variant=Math.abs(Math.trunc(Number.isFinite(variant)?variant:0))%(kind==='starfish'?3:kind==='turtle'||kind==='octopus'?1:2);
  const key=`${kind}:${variant}`;
  if(!templates.has(key))templates.set(key,factories[kind](variant));
  // SkeletonUtils remaps every bone to this clone, including thumbnail actors.
  const group=cloneRig(templates.get(key)), bones=new Map();
  group.traverse(n=>{if(n.isBone)bones.set(n.name,n);});
  const rig={kind,variant,bones,body:bones.get('body'),walk:0,forage:0,alert:0,initialized:false};
  if(kind==='fish') {rig.tail=bones.get('tail');rig.left=bones.get('fin-left');rig.right=bones.get('fin-right');}
  if(kind==='crab') {
    rig.legs=[];
    for(const side of[-1,1])for(let j=0;j<4;j++) {
      const z=-.135+j*.082,endZ=-.22+j*.133;
      rig.legs.push({side,j,hip:vec(side*.215,.166,z),knee:vec(side*.365,.23,endZ),foot:vec(side*(.455+(j===1||j===2?.035:0)),.006,endZ+.035),upper:bones.get(`leg-${side}-${j}-upper`),lower:bones.get(`leg-${side}-${j}-lower`)});
    }
    rig.claws=SIDES.map(side=>({side,arm:bones.get(`claw-${side}`),finger:bones.get(`finger-${side}`),eye:bones.get(`eye-${side}`)}));
  }
  if(kind==='turtle'){rig.head=bones.get('head');rig.flippers=SIDES.map(side=>({side,front:bones.get(`flipper-front-${side}`),rear:bones.get(`flipper-rear-${side}`)}));}
  if(kind==='octopus') {
    rig.mantle=bones.get('mantle');
    rig.arms=[];
    for(let j=0;j<8;j++) {
      const joints=[];
      for(let k=0;k<5;k++){const bone=bones.get(`arm-${j}-${k}`);joints.push({bone,rest:bone.position.clone()});}
      rig.arms.push(joints);
    }
  }
  if(kind==='starfish')rig.tips=Array.from({length:5},(_,j)=>bones.get(`tip-${j}`));
  if(kind==='anemone')rig.tentacles=Array.from({length:20},(_,j)=>bones.get(`tentacle-${j}`));
  rigs.set(group,rig);
  return group;
}

const tempA=new THREE.Vector3(),tempB=new THREE.Vector3(),tempC=new THREE.Vector3();
const axisY=new THREE.Vector3(0,1,0);

export function animateMarineAnimal(group,{time=0,dt=0,speed=0,turn=0,activity='idle',phase=0}={}) {
  const r=rigs.get(group); if(!r)return;
  const p=fract(phase),angle=p*TAU,moving=r.kind==='crab'||r.kind==='octopus'?smooth(Math.abs(speed)/.035):clamp(Math.abs(speed)*4,0,1),ease=1-Math.exp(-Math.min(.1,Math.max(0,dt))*12);
  const forage=activity==='forage'?1:0,alert=activity==='alert'?1:0;
  if(!r.initialized){r.walk=moving;r.forage=forage;r.alert=alert;r.initialized=true;}
  else if(dt>0){r.walk+=(moving-r.walk)*ease;r.forage+=(forage-r.forage)*ease;r.alert+=(alert-r.alert)*ease;}
  turn=clamp(turn,-1,1);
  if(r.kind==='fish') {
    const sweep=Math.sin(angle),intensity=.12+.20*r.walk;
    r.tail.rotation.y=sweep*intensity-turn*.18;
    r.left.rotation.z=.12+Math.sin(time*4.8)*(.18-.08*r.walk);
    r.right.rotation.z=-.12-Math.sin(time*4.8+.5)*(.18-.08*r.walk);
    r.body.rotation.z=-turn*.13;
  } else if(r.kind==='crab') {
    // Stance covers 60% of the cycle, with constant backward foot travel. Root
    // phase advances by actual signed lateral distance / stride, not wall time.
    for(const leg of r.legs) {
      const q=fract(phase+(leg.j%2+(leg.side<0?1:0))*.5),stance=q<.6;
      const travel=stance?.5-q/.6:-.5+smooth((q-.6)/.4);
      const lift=stance?0:Math.sin((q-.6)/.4*Math.PI)*.052;
      const dx=travel*.144*r.walk,dy=lift*r.walk;
      const hx=leg.hip.x,hy=leg.hip.y,hz=leg.hip.z,fx=leg.foot.x+dx,fy=leg.foot.y+dy,fz=leg.foot.z;
      // Two-segment analytic IK in the hip/foot plane, knee bends outward/up.
      tempA.copy(leg.knee).sub(leg.hip);const l1=tempA.length();
      tempB.copy(leg.foot).sub(leg.knee);const l2=tempB.length();
      tempC.set(fx-hx,fy-hy,fz-hz);const distance=Math.min(l1+l2-.0001,tempC.length());tempC.normalize();
      const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
      tempA.copy(axisY).addScaledVector(tempC,-axisY.dot(tempC)).normalize();
      const kx=hx+tempC.x*along+tempA.x*height,ky=hy+tempC.y*along+tempA.y*height,kz=hz+tempC.z*along+tempA.z*height;
      tempA.copy(leg.knee).sub(leg.hip).normalize();tempB.set(kx-hx,ky-hy,kz-hz).normalize();leg.upper.quaternion.setFromUnitVectors(tempA,tempB);
      leg.lower.position.set(kx,ky,kz);tempA.copy(leg.foot).sub(leg.knee).normalize();tempB.set(fx-kx,fy-ky,fz-kz).normalize();leg.lower.quaternion.setFromUnitVectors(tempA,tempB);
    }
    for(const claw of r.claws){
      const {side,arm,finger,eye}=claw,work=r.forage*(side>0?1:.35);
      arm.rotation.x=work*(.12+.17*Math.sin(time*2.4))-r.alert*.30;
      arm.rotation.y=side*(work*.16+r.alert*.18);
      finger.rotation.y=side*(.10+work*(.22+.18*Math.sin(time*2.4+.7))+r.alert*.18);
      eye.rotation.x=.06*Math.sin(time*.9+side)-r.alert*.15;
    }
  } else if(r.kind==='turtle') {
    // Phase .0-.32 is power, .32-.60 recovery; .60-1 is a quiet glide.
    const stroke=p<.32?.24-.56*smooth(p/.32):p<.60?-.32+.56*smooth((p-.32)/.28):.24;
    for(const flippers of r.flippers){
      const {side,front:fore,rear}=flippers;
      fore.rotation.z=side*stroke*(.3+.7*r.walk);fore.rotation.y=side*(.035+Math.sin(angle)*.07*r.walk);
      rear.rotation.z=side*(.08+turn*side*.12);rear.rotation.y=turn*.15;
    }
    r.head.rotation.x=r.forage*.30+Math.sin(time*.8)*.025;
    r.head.rotation.y=turn*.10;
    r.body.rotation.z=-turn*.075;
  } else if(r.kind==='octopus') {
    r.mantle.scale.set(1+Math.sin(time*1.3)*.014,1-Math.sin(time*1.3)*.012,1+Math.sin(time*1.3)*.014);
    for(let j=0;j<8;j++) {
      const q=fract(phase+(j%4)*.25),stance=q<.7;
      // Broad support tips oppose +Z root travel through the stance; only the
      // recovering arms lift. Alternating quarters avoid a radial spinning rig.
      const travel=stance?.098-.28*q:-.098+.196*smooth((q-.7)/.3);
      const lift=stance?0:.045*Math.sin((q-.7)/.3*Math.PI);
      for(let k=0;k<5;k++){
        const link=r.arms[j][k],joint=link.bone,t=j/8*TAU,reach=r.forage*(j===0?1:j===1?.5:0);
        joint.position.copy(link.rest);
        if(k){joint.position.z+=travel*r.walk*.25;joint.position.y+=lift*r.walk*.25;}
        joint.rotation.y=.007*Math.sin(time*.75+j+k*.4)*(1-r.walk)+turn*.006*k;
        // Curl distal tips and the curious front pair, preserving broad supports.
        const curl=(k>2?.022*(1+Math.sin(time*.6+j))*(1-r.walk):0)+reach*(k>1?.12:.015);
        joint.rotation.x=Math.cos(t)*-curl;joint.rotation.z=Math.sin(t)*curl;
      }
    }
  } else if(r.kind==='starfish') {
    for(let j=0;j<5;j++){
      const t=j/5*TAU,lift=.024*(.5+.5*Math.sin(time*.27+j*1.7)),joint=r.tips[j];
      joint.rotation.z=Math.cos(t)*lift;joint.rotation.x=-Math.sin(t)*lift;
    }
  } else if(r.kind==='anemone') {
    for(let j=0;j<r.tentacles.length;j++){
      const joint=r.tentacles[j],t=j/r.tentacles.length*TAU,sway=Math.sin(time*.83+j*.53)*.075;
      joint.rotation.x=Math.cos(t)*sway;joint.rotation.z=-Math.sin(t)*sway;
    }
  }
}
