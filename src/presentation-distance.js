// Rendering distance never doubles as an actor's simulation/visibility state.
// In particular bird visits use model.visible to remember an active arrival.
const shown=new WeakMap();
export function showPresentation(root,visible){
 if(shown.get(root)===visible)return;
 shown.set(root,visible);root.traverse(o=>o.layers.set(visible?0:1));
}
const ranges=new WeakMap();
export function nearPresentation(root,x,z,radius){
 const distance=Math.hypot(root.position.x-x,root.position.z-z),previous=ranges.get(root);
 // Keep an already visible actor through a boundary wobble; never shrink reach.
 // Planted trees share an exact handoff distance with resourceHorizon.
 const visible=distance<=radius+(previous&&!root.userData.plot?4:0);ranges.set(root,visible);return visible;
}
const actorRanges={butterfly:18,bee:18,grub:18,bird:32,deer:40,fish:40,crab:36,turtle:48,octopus:40,starfish:28,anemone:28};
export const actorViewDistance=kind=>actorRanges[kind]??48;
