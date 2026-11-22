import * as T from '../engine/three.js';
import {groupOf} from '../objetos/DecorGeometry.js';
import {TREE_VARIETY} from '../routes.js';

// Review image from the real prototypes and the city's shared toon materials.
export function renderTreeVariety(renderer,prototypes){
  const entries=[...prototypes].filter(([key])=>key.startsWith('tree:')),w=280,h=360,labelHeight=42,canvas=document.createElement('canvas');
  canvas.width=w*entries.length;canvas.height=h+labelHeight;const context=canvas.getContext('2d');context.fillStyle='#e3eceb';context.fillRect(0,0,canvas.width,canvas.height);
  const target=new T.WebGLRenderTarget(w,h);target.texture.colorSpace=T.SRGBColorSpace;
  const old={target:renderer.getRenderTarget(),clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest()};
  const bytes=new Uint8Array(w*h*4),flipped=new Uint8ClampedArray(bytes.length),height=TREE_VARIETY.baseHeight;
  const floorGeometry=new T.PlaneGeometry(height*2,height*2).rotateX(-Math.PI/2),floorMaterial=new T.MeshBasicMaterial({color:'#d4dedb'});
  try{
    renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor('#e3eceb',1);
    entries.forEach(([key,levels],index)=>{
      const scene=new T.Scene(),root=groupOf(levels[0]);root.scale.setScalar(height);scene.add(root,new T.Mesh(floorGeometry,floorMaterial));
      const frame=height*1.3,camera=new T.OrthographicCamera(-frame*w/h/2,frame*w/h/2,frame/2,-frame/2,.1,height*10);
      camera.position.set(height*.65,height*.75,height*1.4);camera.lookAt(0,height*.48,0);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,bytes);
      for(let y=0;y<h;y++)flipped.set(bytes.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);context.putImageData(new ImageData(flipped,w,h),index*w,0);
      const id=key.slice(5),label=id==='anime'?'Anime fino':id==='gold'?'Anime dorado':TREE_VARIETY.profiles.find(p=>p.id===id).label;
      context.fillStyle='#18362f';context.font='bold 16px Arial';context.textAlign='center';context.fillText(label,index*w+w/2,h+26);
    });
  }finally{renderer.setRenderTarget(old.target);renderer.setClearColor(old.clear,old.alpha);renderer.setViewport(old.viewport);renderer.setScissor(old.scissor);renderer.setScissorTest(old.scissorTest);target.dispose();floorGeometry.dispose();floorMaterial.dispose();}
  return canvas.toDataURL('image/jpeg',.93);
}
