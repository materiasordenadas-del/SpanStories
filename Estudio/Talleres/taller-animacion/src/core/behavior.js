import * as THREE from 'three';

/** Stable names survive GLB reloads; UUIDs only identify the current browser scene. */
export function portableAnimation(clip, root) {
  const bindings=new Map(),seen=new Map();
  root.traverse(node=>{
    const name=THREE.PropertyBinding.sanitizeNodeName(node.name||'');
    if(name){bindings.set(node.uuid,name);seen.set(name,(seen.get(name)||0)+1);}
  });
  const result=clip.clone();
  for(const track of result.tracks){
    const dot=track.name.indexOf('.'),id=track.name.slice(0,dot),name=bindings.get(id);
    if(!name||seen.get(name)!==1)throw Error('El modelo tiene nombres de animación vacíos o duplicados. Revisa el personaje antes de exportar.');
    track.name=name+track.name.slice(dot);
  }
  return THREE.AnimationClip.toJSON(result);
}
