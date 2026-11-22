import * as THREE from 'three';
import { portableAnimation } from './behavior.js';

export function selectMountedEditor(session, slot, frame, selection) {
  Object.assign(session.active,selection);
  slot.engine.frame=frame;
  session.active=slot;
}

/**
 * Meshes with shape keys of the edited rig paired with the same mesh (by name and order) of the original model, so the
 * face edited in the workshop is baked into the story animation too. A mesh whose name repeats in the model cannot be
 * addressed by name in a portable clip, so it is left out (portableAnimation would refuse the whole clip).
 */
export function pairMorphMeshes(root, source) {
  const sanitized = node => THREE.PropertyBinding.sanitizeNodeName(node.name || '');
  const counts = new Map(), original = new Map(), pairs = [], seen = new Map();
  source.traverse(node => {
    const name = sanitized(node);
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
    if (node.isMesh && node.morphTargetInfluences?.length) { const list = original.get(node.name) || []; list.push(node); original.set(node.name, list); }
  });
  root.traverse(node => {
    if (!node.isMesh || !node.morphTargetInfluences?.length) return;
    const k = seen.get(node.name) || 0; seen.set(node.name, k + 1);
    const target = original.get(node.name)?.[k];
    if (target && sanitized(target) && counts.get(sanitized(target)) === 1 && target.morphTargetInfluences.length === node.morphTargetInfluences.length) pairs.push({ edited: node, source: target, values: [] });
  });
  return pairs;
}

/** Sample an edited rig against the model's original hierarchy and placement in the story. */
export function mountedTracks(rig, source, stageMatrix, sceneMatrix, frames, fps) {
  const edited = new Map(rig.bones.map(bone => [bone.name, bone]));
  const nodes = [];
  const morphs = pairMorphMeshes(rig.root, source);
  source.traverse(node => {
    if (!node.isBone || !edited.has(node.name)) return;
    nodes.push({ node, bone:edited.get(node.name), q:[], p:[], s:[],
      rest:[node.quaternion.toArray(),node.position.toArray(),node.scale.toArray()] });
  });
  source.updateMatrixWorld(true);
  const transform=source.matrixWorld.clone().multiply(stageMatrix.clone().invert()).multiply(sceneMatrix);
  const local=new THREE.Matrix4();
  const times=Array.from({length:frames},(_,i)=>i/fps);
  const append=(out,values)=>out.push(...values.map(value=>Math.round(value*1e6)/1e6));
  return {
    sample() {
      rig.root.updateWorldMatrix(true,true);
      for(const {node,bone,q,p,s} of nodes){
        node.parent.updateWorldMatrix(true,false);
        local.copy(node.parent.matrixWorld).invert().multiply(transform).multiply(bone.matrixWorld)
          .decompose(node.position,node.quaternion,node.scale);
        node.updateMatrixWorld();
        const quat=node.quaternion.toArray();
        if(q.length&&quat.reduce((dot,value,i)=>dot+value*q[q.length-4+i],0)<0)quat.forEach((value,i)=>{quat[i]=-value;});
        append(q,quat);append(p,node.position.toArray());append(s,node.scale.toArray());
      }
      for(const morph of morphs)append(morph.values,Array.from(morph.edited.morphTargetInfluences));
    },
    finish(name) {
      const tracks=[];
      for(const {node,q,p,s,rest} of nodes){
        for(const [i,values,property,Track] of [
          [0,q,'quaternion',THREE.QuaternionKeyframeTrack],
          [1,p,'position',THREE.VectorKeyframeTrack],
          [2,s,'scale',THREE.VectorKeyframeTrack],
        ]){
          const initial=rest[i];
          if(values.some((value,j)=>Math.abs(value-initial[j%initial.length])>2e-6)) {
            tracks.push(new Track(`${node.uuid}.${property}`,times,values));
          }
        }
      }
      // Rostro: solo las mallas que en algún momento se mueven (un cuerpo sin expresión no añade pistas).
      for(const morph of morphs)if(morph.values.some(value=>Math.abs(value)>2e-6))tracks.push(new THREE.NumberKeyframeTrack(`${morph.source.uuid}.morphTargetInfluences`,times,morph.values));
      if(!tracks.length&&nodes.length)tracks.push(new THREE.QuaternionKeyframeTrack(`${nodes[0].node.uuid}.quaternion`,times,nodes[0].q));
      return portableAnimation(new THREE.AnimationClip(name,(frames-1)/fps,tracks),source);
    },
  };
}
