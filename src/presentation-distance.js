// Rendering distance never doubles as an actor's simulation/visibility state.
// In particular bird visits use model.visible to remember an active arrival.
const shown=new WeakMap();
export function showPresentation(root,visible){
 if(shown.get(root)===visible)return;
 shown.set(root,visible);root.traverse(o=>o.layers.set(visible?0:1));
}
export function nearPresentation(root,x,z,radius){return Math.hypot(root.position.x-x,root.position.z-z)<=radius;}
const actorRanges={butterfly:18,bee:18,grub:18,bird:32,deer:40,fish:40,crab:36,turtle:48,octopus:40,starfish:28,anemone:28};
export const actorViewDistance=kind=>actorRanges[kind]??48;
