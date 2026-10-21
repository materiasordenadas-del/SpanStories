import * as T from '../engine/three.js';
import {DECOR,TREE_VARIETY,URBAN_TREES} from '../routes.js';
import {flattened,normalize,bounds,triangles} from './DecorGeometry.js';
import {createUrbanTreePrototypes} from './UrbanTrees.js';

// Shared padded atlas: all distant models use one material and retain their silhouette.
export function treeBillboardAtlas(prototypes,renderer,style){
  const cell=DECOR.billboardPixels,pad=8,inner=cell-pad*2,columns=3,rows=Math.ceil(prototypes.size/columns),atlasWidth=columns*cell,atlasHeight=rows*cell;
  const atlas=new Uint8Array(atlasWidth*atlasHeight*4),data=new Uint8Array(cell*cell*4),sprites=[];
  const target=new T.WebGLRenderTarget(cell,cell,{format:T.RGBAFormat,type:T.UnsignedByteType});target.texture.colorSpace=T.SRGBColorSpace;
  const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha(),viewport=renderer.getViewport(new T.Vector4()),scissor=renderer.getScissor(new T.Vector4()),scissorTest=renderer.getScissorTest();
  try{
    renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.setClearColor(0,0);let index=0;
    for(const [key,levels]of prototypes){
      const b=bounds(levels[0]),width=2*Math.max(Math.abs(b.min.x),Math.abs(b.max.x),Math.abs(b.min.z),Math.abs(b.max.z)),height=b.max.y-b.min.y,scene=new T.Scene(),owned=[];
      for(const p of levels[0]){
        if(p.material.userData.urbanTree){
          // The distant card receives the current world light at runtime. Store
          // only its albedo/palette, rather than illuminating the tree twice.
          const m=p.material.clone();m.fragmentShader=m.fragmentShader.replace('vec3 color = albedo * mix(sombra * hemi, luzColor, lit);','vec3 color = albedo;');
          owned.push(m);scene.add(new T.Mesh(p.geometry,m));continue;
        }
        const m=new T.MeshBasicMaterial({color:p.material.uniforms.uColor.value,map:p.material.uniforms.uAlbedo?.value??null,alphaTest:p.material.uniforms.uCorte.value,side:T.DoubleSide});owned.push(m);scene.add(new T.Mesh(p.geometry,m));
      }
      const camera=new T.OrthographicCamera(-width/2-width*pad/inner,width/2+width*pad/inner,height+height*pad/inner,-height*pad/inner,.01,10);camera.position.set(0,0,3);camera.lookAt(0,0,0);
      renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,cell,cell,data);
      const col=index%columns,row=Math.floor(index/columns);for(let y=0;y<cell;y++)atlas.set(data.subarray(y*cell*4,(y+1)*cell*4),((row*cell+y)*atlasWidth+col*cell)*4);
      const geometry=new T.PlaneGeometry(width,height);geometry.translate(0,height/2,0);const uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++)uv.setXY(i,(col*cell+pad+uv.getX(i)*inner)/atlasWidth,(row*cell+pad+uv.getY(i)*inner)/atlasHeight);
      sprites.push({key,geometry});for(const m of owned)m.dispose();index++;
    }
  }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);target.dispose();}
  const texture=new T.DataTexture(atlas,atlasWidth,atlasHeight,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const source=new T.MeshStandardMaterial({color:'#ffffff',map:texture,alphaTest:.4,side:T.DoubleSide}),material=style.material(source,'decor-tree-atlas');source.dispose();
  material.uniforms.uSombraColor={value:new T.Color().setRGB(...URBAN_TREES.shadowTint)};
  style.extendMaterial(material,{fragment:s=>s.replace('gl_FragColor = vec4(color, a);','gl_FragColor = vec4(color, 1.0);')
    .replace(/#ifdef TRES_BANDAS[\s\S]*?#endif/,'float lit=smoothstep(umbral - '+URBAN_TREES.softness+',umbral + 0.65,nl);')
    .replace('vec3 luzColor = mix(uLuzColor, uInColor, dentro);','vec3 luzColor = mix(uLuzColor, uInColor, dentro)*'+URBAN_TREES.sunGain+';')});
  for(const {key,geometry}of sprites)prototypes.get(key)[2]=[{geometry,material,name:'silueta-'+key,billboard:true}];
}

export async function createTreePrototypes(context){
  const prototypes=await createUrbanTreePrototypes(context);
  treeBillboardAtlas(prototypes,context.renderer,context.style);
  return prototypes;
}
export function prototypeStats(prototypes){return Object.fromEntries([...prototypes].map(([key,levels])=>[key,levels.map(triangles)]));}
