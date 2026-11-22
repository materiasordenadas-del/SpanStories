// Adapted from my-motion-studio-main/src/lib/animation.ts (MIT, rodolphe37, 2026).
// License and source inventory: docs/INTEGRACION_EDITORES.md.
export type CameraEasing='linear'|'easeIn'|'easeOut'|'easeInOut';
export const CAMERA_EASINGS:readonly CameraEasing[]=['linear','easeIn','easeOut','easeInOut'];
export function cameraEase(time:number,type:CameraEasing='linear'):number{
  const t=Math.min(1,Math.max(0,time));
  switch(type){
    case 'easeIn':return t*t;
    case 'easeOut':return 1-(1-t)*(1-t);
    case 'easeInOut':return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    default:return t;
  }
}
