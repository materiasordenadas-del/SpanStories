import {CITY} from '../routes.js';

// 1080p by default; eligible displays can use 1440p. Screen dimensions are CSS
// pixels, so include the display's pixel ratio for HiDPI desktop scaling.
// CSS layout stays independent; even 4K/8K panels never render beyond 1440p.
export function cityResolution(width,height,{deviceRatio=1,maxDpr=CITY.maxDpr,screenWidth=0,screenHeight=0,allowAdaptive=true}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return null;
  const ratio=Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1;
  const longSide=Math.max(screenWidth,screenHeight)*ratio,shortSide=Math.min(screenWidth,screenHeight)*ratio;
  const adaptive=allowAdaptive&&Number.isFinite(longSide)&&Number.isFinite(shortSide)&&longSide>=CITY.adaptiveWidth-1&&shortSide>=CITY.adaptiveHeight-1;
  const maxWidth=adaptive?CITY.adaptiveWidth:CITY.renderWidth,maxHeight=adaptive?CITY.adaptiveHeight:CITY.renderHeight;
  const pixelRatio=Math.min(ratio,adaptive?ratio:maxDpr,maxWidth/width,maxHeight/height);
  return {pixelRatio,width:Math.floor(width*pixelRatio),height:Math.floor(height*pixelRatio),target:adaptive?'1440p':'1080p'};
}

export function watchCityResolution(windowRoot,onChange){
  let query,disposed=false;
  function arm(){
    query?.removeEventListener('change',changed);
    query=windowRoot.matchMedia(`(resolution: ${windowRoot.devicePixelRatio}dppx)`);
    query.addEventListener('change',changed,{once:true});
  }
  function changed(){if(disposed)return;arm();onChange();}
  arm();windowRoot.addEventListener('resize',onChange);
  return ()=>{disposed=true;query.removeEventListener('change',changed);windowRoot.removeEventListener('resize',onChange);};
}
