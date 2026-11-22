export function setSharedViewport(rect) {
  const root=document.documentElement;
  const fixed=Array.isArray(rect)&&rect.length===4&&rect.every(Number.isFinite)&&rect[2]>0&&rect[3]>0;
  root.classList.toggle('shared-stage',fixed);
  if(fixed){
    const [left,top,width,height]=rect;
    for(const [key,value] of Object.entries({left,top,width,height,right:left+width,bottom:top+height})){
      root.style.setProperty('--stage-'+key,value+'px');
    }
  }
  return fixed;
}
