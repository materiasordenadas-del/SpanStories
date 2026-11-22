// Silueta de la geometría (halo) y velo de color sobre el objeto, con descarte alfa. Nunca altera los materiales compartidos.
import * as T from './three.js';
import { LEXICO } from '../routes.js';

export function cajaDe(raiz, caja = new T.Box3()) {
  caja.makeEmpty();
  const enlace = raiz.userData?.instanceBinding;
  if (typeof enlace?.bounds === 'function') return caja.copy(enlace.bounds());
  raiz.updateWorldMatrix(true, true);
  return caja.setFromObject(raiz);
}

export function materialMascara(source){
  if(source.isShaderMaterial){
    const fragmentShader=source.fragmentShader.replace(/void\s+main\s*\(\s*\)/,'void lexicalOriginalMain()')+'\nvoid main(){lexicalOriginalMain();gl_FragColor=vec4(1.0);}';
    const material=new T.ShaderMaterial({vertexShader:source.vertexShader,fragmentShader,uniforms:source.uniforms,defines:{...source.defines},side:source.side,glslVersion:source.glslVersion,vertexColors:source.vertexColors});
    material.transparent=false;material.depthWrite=true;material.depthTest=true;material.toneMapped=false;return material;
  }
  return new T.MeshBasicMaterial({color:0xffffff,map:source.map,alphaMap:source.alphaMap,alphaTest:source.alphaTest,side:source.side,depthTest:true,depthWrite:true,toneMapped:false});
}

export function crearResaltador({renderer,camera,config=LEXICO}={}){
  const maskScene=new T.Scene(),size=new T.Vector2(),caja=new T.Box3();
  const target=new T.WebGLRenderTarget(1,1,{depthBuffer:true});
  target.texture.minFilter=T.NearestFilter;target.texture.magFilter=T.NearestFilter;
  const overlay=new T.Scene(),ortho=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const material=new T.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{mask:{value:target.texture},pixel:{value:new T.Vector2(1,1)},color:{value:new T.Color(config.highlightColor)},width:{value:config.highlightPixels??2},tint:{value:new T.Color(config.highlightTint??config.highlightColor)},tintOpacity:{value:config.highlightTintOpacity??0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader:'uniform sampler2D mask;uniform vec2 pixel;uniform vec3 color;uniform float width;uniform vec3 tint;uniform float tintOpacity;varying vec2 vUv;void main(){float inside=texture2D(mask,vUv).a;if(inside>0.5){if(tintOpacity<=0.0)discard;gl_FragColor=vec4(tint,tintOpacity);return;}float edge=0.0;for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){if(x*x+y*y<=5)edge=max(edge,texture2D(mask,vUv+vec2(float(x),float(y))*pixel*width/2.0).a);}}if(edge<0.01)discard;gl_FragColor=vec4(color,edge);}'
  });
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),material);quad.frustumCulled=false;overlay.add(quad);
  let active=false,dirty=true;
  let selectedRoots=[],providers=[];
  const cameraWorld=new T.Matrix4(),projection=new T.Matrix4();
  const clear=()=>{for(const mesh of [...maskScene.children]){for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();maskScene.remove(mesh);}};
  return {
    caja,
    mostrar(roots){
      clear();caja.makeEmpty();selectedRoots=roots;providers=[];
      for(const root of roots){
        root.updateWorldMatrix(true,true);caja.union(cajaDe(root));
        if(root.userData.instanceBinding?.parts){
          const provider={root,meshes:[]};
          for(const part of root.userData.instanceBinding.parts()){
            const mesh=new T.Mesh(part.geometry,materialMascara(part.material));mesh.matrixAutoUpdate=false;mesh.matrix.copy(part.matrix);mesh.frustumCulled=false;maskScene.add(mesh);provider.meshes.push(mesh);
          }
          providers.push(provider);continue;
        }
        root.traverse(mesh=>{
          if(!mesh.isMesh||mesh.isInstancedMesh||mesh.isBatchedMesh||mesh.userData.cityOutline)return;
          for(let p=mesh;p;p=p.parent)if(!p.visible)return;
          const copy=new T.Mesh(mesh.geometry,Array.isArray(mesh.material)?mesh.material.map(materialMascara):materialMascara(mesh.material));
          copy.matrixAutoUpdate=false;copy.matrix.copy(mesh.matrixWorld);copy.frustumCulled=false;maskScene.add(copy);
        });
      }
      active=maskScene.children.length>0;dirty=true;return active;
    },
    ocultar(){active=false;},
    get visible(){return active;},
    renderizar(){
      if(!active||!renderer||!camera)return;
      if(!cameraWorld.equals(camera.matrixWorld)||!projection.equals(camera.projectionMatrix)){cameraWorld.copy(camera.matrixWorld);projection.copy(camera.projectionMatrix);dirty=true;}
      for(const provider of providers){
        const parts=provider.root.userData.instanceBinding.parts();
        if(parts.length!==provider.meshes.length||parts.some((part,i)=>part.geometry!==provider.meshes[i].geometry)){this.mostrar(selectedRoots);break;}
        for(let i=0;i<parts.length;i++)if(!provider.meshes[i].matrix.equals(parts[i].matrix)){provider.meshes[i].matrix.copy(parts[i].matrix);dirty=true;}
      }
      renderer.getDrawingBufferSize(size);
      if(target.width!==size.x||target.height!==size.y){target.setSize(size.x,size.y);material.uniforms.pixel.value.set(1/size.x,1/size.y);dirty=true;}
      const previous=renderer.getRenderTarget(),auto=renderer.autoClear;
      try{
        if(dirty){
          const color=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
          try{renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear();renderer.render(maskScene,camera);dirty=false;}
          finally{renderer.setClearColor(color,alpha);renderer.setRenderTarget(previous);}
        }
        renderer.autoClear=false;renderer.render(overlay,ortho);
      }finally{renderer.autoClear=auto;renderer.setRenderTarget(previous);}
    },
    destruir(){clear();quad.geometry.dispose();material.dispose();target.dispose();}
  };
}
