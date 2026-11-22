import * as T from '../engine/three.js';
import {URBAN_TREES as C} from '../routes.js';

// Native-size layers preserve each source's alpha edges and independent mips.
// Copy on the GPU: a canvas round trip loses straight RGB at transparent edges.
// This preparation runs once; trees still share one material during gameplay.
export function createTreeTextureAtlas(parts,renderer){
  const materials=[...new Set(parts.map(p=>p.material))],size=C.atlasCell;
  const pixels=new Uint8Array(size*size*materials.length*4),cells=new Map();
  const target=new T.WebGLRenderTarget(size,size,{depthBuffer:false});target.texture.colorSpace=T.SRGBColorSpace;
  const camera=new T.OrthographicCamera(-1,1,1,-1,0,2),scene=new T.Scene();camera.position.z=1;
  const material=new T.ShaderMaterial({uniforms:{sourceMap:{value:null},repeatUV:{value:new T.Vector2()}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:'uniform sampler2D sourceMap; uniform vec2 repeatUV; varying vec2 vUv; void main(){gl_FragColor=texture2D(sourceMap,vUv*repeatUV);\n#include <colorspace_fragment>\n}',
    depthTest:false,depthWrite:false,blending:T.NoBlending});
  const geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));
  const previous=renderer.getRenderTarget();
  try{
    renderer.setRenderTarget(target);
    materials.forEach((m,i)=>{
      if(!m.map||m.normalMap)throw new Error('La biblioteca aprobada requiere sus albedos originales sin normales añadidas');
      const {width,height}=m.map.image;
      if(size%width||size%height)throw new Error('La textura original no cabe sin remuestreo en la capa compartida');
      material.uniforms.sourceMap.value=m.map;material.uniforms.repeatUV.value.set(size/width,size/height);
      renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,size,size,pixels.subarray(i*size*size*4,(i+1)*size*size*4));
      cells.set(m.uuid,[i,0,width/size,height/size]);
    });
  }finally{renderer.setRenderTarget(previous);target.dispose();geometry.dispose();material.dispose();}
  const map=new T.DataArrayTexture(pixels,size,size,materials.length);map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.minFilter=T.LinearMipmapLinearFilter;map.magFilter=T.LinearFilter;
  map.generateMipmaps=true;map.needsUpdate=true;
  return {map,normalMap:null,cells,width:size,height:size,depth:materials.length};
}
