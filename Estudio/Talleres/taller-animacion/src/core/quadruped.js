// AutoRig Pro exports constrained deform bones as separate branches. Human names
// alone cannot identify their anatomy: keep all four limbs out of humanoid IK.
export function isARPHorse(root) {
  let rear = false, front = false;
  root.traverse(o => {
    const n = o.userData?.blenderBoneName || o.name;
    if (/^c_thigh_b[.]?l$/i.test(n)) rear = true;
    if (/^(c_thigh_b_dupli_001[.]?l|foot_dupli_001\.l)$/i.test(n)) front = true;
  });
  return rear && front;
}

const FACE_CHANNELS=new Set(`eyeBlinkLeft eyeLookDownLeft eyeLookInLeft eyeLookOutLeft eyeLookUpLeft eyeSquintLeft eyeWideLeft eyeBlinkRight eyeLookDownRight eyeLookInRight eyeLookOutRight eyeLookUpRight eyeSquintRight eyeWideRight jawForward jawLeft jawRight jawOpen mouthClose mouthFunnel mouthPucker mouthLeft mouthRight mouthSmileLeft mouthSmileRight mouthFrownLeft mouthFrownRight mouthDimpleLeft mouthDimpleRight mouthStretchLeft mouthStretchRight mouthRollLower mouthRollUpper mouthShrugLower mouthShrugUpper mouthPressLeft mouthPressRight mouthLowerDownLeft mouthLowerDownRight mouthUpperUpLeft mouthUpperUpRight browDownLeft browDownRight browInnerUp browOuterUpLeft browOuterUpRight cheekPuff cheekSquintLeft cheekSquintRight noseSneerLeft noseSneerRight tongueOut`.split(' ').map(n=>n.toLowerCase()));

// Old deliveries stored every FACEIT value as 1. Only clear the facial startup
// state; retain nonfacial corrective shapes and all animation tracks.
export function neutralizeHorseFace(root) {
  if(!isARPHorse(root))return 0;
  let count=0;
  root.traverse(o=>{
    if(!o.morphTargetDictionary||!o.morphTargetInfluences)return;
    for(const [name,i] of Object.entries(o.morphTargetDictionary))if(FACE_CHANNELS.has(name.toLowerCase())) {
      if(o.morphTargetInfluences[i]!==0)count++;
      o.morphTargetInfluences[i]=0;
    }
  });
  return count;
}
