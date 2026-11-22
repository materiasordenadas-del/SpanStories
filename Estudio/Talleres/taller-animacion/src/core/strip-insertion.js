import { uid } from './animation.js';

export async function prepareStripInsertion(ids, resolveClip, rig, doc, at) {
  const clips=[];
  const originalBones=new Set(rig.bones.map(bone=>bone.name));
  for(const id of ids){
    const clip=await resolveClip(id);
    if(!clip||clip.failed||!Number.isFinite(clip.frames)||clip.frames<1||!Number.isFinite(clip.fps)||clip.fps<=0){
      throw Error('No se pudo cargar la animación.');
    }
    if((rig.kind==='quadruped')!==!!clip.native||
       (clip.native&&!Object.keys(clip.native).some(name=>originalBones.has(name)))){
      throw Error(`«${clip.name}» es incompatible con el rig seleccionado.`);
    }
    clips.push(clip);
  }
  let frame=Math.max(0,Math.round(at));
  const strips=clips.map((clip,i)=>{
    const len=Math.max(1,Math.round((clip.frames-1)*doc.fps/clip.fps)+1);
    const strip={id:uid('s'),clipId:clip.id,start:frame,len,blend:i||doc.strips.length?6:0,
      speed:1,loop:!!clip.loop,inPlace:clip.travel>0.05,mirror:false,reverse:false};
    frame+=len;
    return strip;
  });
  return {clips,strips,frame};
}
