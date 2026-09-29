import manifest from './catalogue-manifest.json' with {type:'json'};

// Static, source-generated pictures: no model generation, WebGL readback or
// encoding during player startup. The original key -> URL consumer is retained.
const base=import.meta.env?.BASE_URL??'/';
const pictures=Object.freeze(Object.fromEntries(Object.entries(manifest.pictures).map(([key,path])=>[key,base+path])));
export function createPictures(){return pictures;}
export function getPicture(key){return pictures[key];}
