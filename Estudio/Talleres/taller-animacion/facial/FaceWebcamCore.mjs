import {ARKIT,validatePreset} from './FacialCore.mjs';

export const WEBCAM_MODES=Object.freeze({normal:1,exaggerated:1.75,veryExaggerated:2.5});

// MediaPipe uses anatomical left/right, just like ARKit. Only the preview is mirrored.
export function faceWeights(categories=[],baseline={},previous={},amount=1,smoothing=.4,blink={left:.5,right:.5},mode='normal'){
  const normal=!Object.hasOwn(WEBCAM_MODES,mode)||mode==='normal',gain=WEBCAM_MODES[mode]??1;
  const scores=Object.fromEntries(categories.map(c=>[c.categoryName,c.score]));
  return Object.fromEntries(ARKIT.map(name=>{
    const raw=Number.isFinite(scores[name])?scores[name]:0;
    const rest=!normal&&name.startsWith('eye')?0:Math.min(.85,Math.max(0,baseline[name]||0));
    const isBlink=name==='eyeBlinkLeft'||name==='eyeBlinkRight';
    const threshold=isBlink?(normal?Math.max(.15,Math.min(1,blink[name==='eyeBlinkLeft'?'left':'right']??.5)):.5):1;
    // Webcam blink scores often stop below 1 even with a fully closed eyelid.
    // Calibrate each side separately and keep blinks quicker than cheeks/mouth.
    const target=Math.min(1,Math.max(0,(raw-rest)/(1-rest)/threshold*(isBlink&&normal?1:amount)*gain));
    const smooth=isBlink?Math.min(.12,smoothing):smoothing;
    return [name,previous[name]===undefined?target:previous[name]*smooth+target*(1-smooth)];
  }));
}

export function webcamPreset(samples,name='Captura webcam'){
  if(samples.length<2)throw Error('Graba al menos dos fotogramas con el rostro visible.');
  const start=samples[0].time,duration=(samples.at(-1).time-start)/1000;
  if(duration<.05)throw Error('La captura es demasiado corta.');
  const channels=Object.fromEntries(ARKIT.map(n=>[n,samples.map(s=>[(s.time-start)/1000,s.weights[n]||0])]));
  return validatePreset({schema:'spanstories.facial-animation',version:1,rig:'ARKit-52',timeUnit:'seconds',
    id:'webcam.'+Date.now(),name,category:'Webcam',duration,loop:false,interpolation:'linear',
    source:{kind:'original',license:'Captura propia del usuario · MediaPipe Face Landmarker'},tags:['webcam','mediapipe'],channels});
}
