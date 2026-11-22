import type {StudioSnapshot} from '@/features/story-studio/model';
export function StudioSceneTransition({effect}:{effect:StudioSnapshot['sceneEntry']}){
  if(!effect||effect.progress>=1)return null;
  return <div aria-hidden="true" data-scene-transition={effect.kind} style={{position:'absolute',inset:0,background:'#071019',pointerEvents:'none',zIndex:2,opacity:effect.kind==='fade'?1-effect.progress:1,clipPath:effect.kind==='wipe'?`inset(0 0 0 ${effect.progress*100}%)`:undefined}}/>;
}
