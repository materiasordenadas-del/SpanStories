// Additional players share immutable geometry/materials/textures, while each
// keeps its own skeleton, morph weights, transform and AnimationMixer bindings.
export function cloneCityAvatar(source){
  const root=source.clone(true),copies=new Map(),skeletons=new Map();
  function pair(original,copy){copies.set(original,copy);for(let i=0;i<original.children.length;i++)pair(original.children[i],copy.children[i]);}
  pair(source,root);
  source.traverse(original=>{
    if(!original.isSkinnedMesh)return;
    const copy=copies.get(original);let skeleton=skeletons.get(original.skeleton);
    if(!skeleton){skeleton=original.skeleton.clone();skeleton.bones=original.skeleton.bones.map(bone=>{
      const cloned=copies.get(bone);if(!cloned)throw new Error('El esqueleto debe estar dentro de la raíz del personaje.');return cloned;
    });skeletons.set(original.skeleton,skeleton);}
    copy.bind(skeleton,original.bindMatrix);
  });
  let disposed=false;
  return {root,dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const skeleton of skeletons.values())skeleton.dispose();}};
}
