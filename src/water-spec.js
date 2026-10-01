import {sampleCell,cellAt} from './surface-grid.js';
const box=(minX,maxX,minY,maxY,minZ,maxZ)=>({minX,maxX,minY,maxY,minZ,maxZ});
const freeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')freeze(v);return Object.freeze(o);};
export const NEW_WATER_TOYS=freeze({
 pump:{material:'copper',cost:8,size:[1.8,1.6,1.8],boxes:[box(-.65,.65,0,.18,-.65,.65),box(-.35,.35,.18,1.35,-.35,.35),box(.35,.9,1.22,1.42,-.1,.1),box(-.1,.1,1,1.2,-.6,-.30)],anchors:{outlet:[.9,1.32,0],use:[0,.8,.65]}},
 fountain:{material:'copper',cost:5,size:[1.8,1.8,1.8],boxes:[box(-.6,.6,0,.18,-.4,.4),box(-.08,.08,.18,.60,-.08,.08),box(-.45,.45,.60,.72,-.4,.4),box(-.9,-.33,.62,.82,-.1,.1)],anchors:{inlet:[-.9,.72,0],use:[0,.65,.55]}},
 cornerChannel:{material:'copper',cost:4,size:[1.8,1.25,1.8],boxes:[box(-.7,-.6,0,.65,-.05,.05),box(-.05,.05,0,.65,.6,.7),box(-.9,.2,.65,.85,-.2,.2),box(-.2,.2,.65,.85,0,.9)],anchors:{inlet:[-.9,.72,0],outlet:[0,.72,.9],pour:[0,1.05,0],use:[0,.9,.55]}},
 splitter:{material:'copper',cost:5,size:[1.8,1.25,1.8],boxes:[box(-.7,-.6,0,.65,-.05,.05),box(-.05,.05,0,.65,.6,.7),box(-.9,.9,.65,.85,-.2,.2),box(-.2,.2,.65,.85,0,.9)],anchors:{inlet:[-.9,.72,0],outletA:[.9,.72,0],outletB:[0,.72,.9],pour:[0,1.05,0],use:[0,.9,.55]}},
});
export const WATER_PORTS=freeze({
 gutter:{inlet:[-.9,.72,0],outlet:[.9,.72,0]},
 waterWheel:{inlet:[-.9,.72,0],outlet:[.9,.42,0],drive:[0,.65,.45]},
 lift:{drive:[0,.65,-1.35]},
 ...Object.fromEntries(Object.entries(NEW_WATER_TOYS).map(([k,v])=>[k,Object.fromEntries(Object.entries(v.anchors).filter(([name])=>name.startsWith('outlet')||name==='inlet'))])),
});
export const WATER_KINDS=Object.freeze(Object.keys(WATER_PORTS).filter(k=>k!=='lift'));
export const ADDON_BOXES=freeze({
 gutter:[box(-.98,-.82,.63,.81,-.1,.1),box(.82,.98,.63,.81,-.1,.1)],
 waterWheel:[box(-.98,-.82,.63,.81,-.1,.1),box(.52,.94,.395,.455,-.2,.2),box(-.08,.08,.57,.73,.22,.53)],
 lift:[box(-.92,.92,.59,.71,-1.43,-1.35),box(-.08,.08,.57,.73,-1.46,-1.29),box(-.98,-.86,.59,.71,-1.40,-.86),box(.86,.98,.59,.71,-1.40,-.86)],
});
export function rotateWater(x,z,rotation){for(let i=0;i<rotation;i++)[x,z]=[z,-x];return [x,z];}
export function waterPoint(p,point){const [x,z]=rotateWater(point[0],point[2],p.rotation);return {x:p.gx*2+x,y:p.baseY+point[1],z:p.gz*2+z};}
export function pipeBoxes(intake){
 if(!intake)return [];
 const points=[[0,1.1,-.6],intake.elbow,intake.mouth];
 return points.slice(1).map((b,i)=>{const a=points[i];return box(Math.min(a[0],b[0])-.1,Math.max(a[0],b[0])+.1,Math.min(a[1],b[1])-.1,Math.max(a[1],b[1])+.1,Math.min(a[2],b[2])-.1,Math.max(a[2],b[2])+.1);});
}
export function pumpIntake(p){
 const at=waterPoint(p,[0,0,-2]),{gx,gz}=cellAt(at.x,at.z),cell=sampleCell(gx,gz);
 const fail=code=>({ok:false,code,intake:null,boxes:[]});
 if(cell.waterY===null)return fail('message.pumpWater');
 const bottom=cell.height+.20,top=cell.waterY-.15;
 if(bottom>top)return fail('message.pumpDepth');
 const mouthY=Math.max(bottom,Math.min(top,p.baseY+.20)),localY=mouthY-p.baseY,outletY=p.baseY+1.32;
 if(localY< -2.9||localY>1||outletY<=mouthY||outletY-mouthY>4)return fail('message.pumpHeight');
 const intake={mouth:[0,localY,-2],elbow:[0,1.1,-2]};
 return {ok:true,code:'message.place',intake,boxes:pipeBoxes(intake),mouth:waterPoint(p,intake.mouth),cell};
}
