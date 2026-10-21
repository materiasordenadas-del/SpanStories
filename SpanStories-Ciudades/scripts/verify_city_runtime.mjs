import * as T from '../engine/three.js';
import {CityStyle} from '../engine/CityStyle.js';
import {optimizeCityRoot} from '../engine/CityOptimization.js';
import {RegistroCiudad} from '../engine/CityRegistry.js';
import {EstadoEditorCiudad,capturarObjeto} from '../engine/CityEditor.js';
import {specializeLightingShader} from '../engine/CityShaderActivity.js';

// Isolated GPU/identity probe; never attaches fixtures to the user's city.
export async function verifyCityRuntime(engine){
  const bytes=await(await fetch('./tests/fixtures/editor-probe.glb')).arrayBuffer();
  const gltf=await engine.assets.loader.parseAsync(bytes,''),style=new CityStyle(),scene=new T.Scene(),root=new T.Group(),objects=new RegistroCiudad();scene.add(root);
  const sourceMaterials=new Set();gltf.scene.traverse(o=>{if(o.material)sourceMaterials.add(o.material);});
  await style.adaptAsync(gltf.scene,gltf);for(const material of sourceMaterials)material.dispose();
  for(let i=0;i<8;i++){const unit=gltf.scene.clone(true);unit.position.x=i*3;root.add(unit);objects.registrar(unit,{id:'qa-'+i,tipo:'fixture',etiqueta:'GPU fixture '+i});}
  const camera=new T.PerspectiveCamera(42,1,.1,100);camera.position.set(6,8,18);camera.lookAt(6,0,0);
  const optimized=await optimizeCityRoot(root,{multiDraw:engine.assets.multiDraw,renderer:engine.renderer,camera,scene});
  const renderer=engine.renderer,target=new T.WebGLRenderTarget(64,64),previousTarget=renderer.getRenderTarget(),previousInfo={...renderer.info.render};
  try{
    const state=new EstadoEditorCiudad({scene,objetos:objects,cityId:'qa',changed:node=>optimized.refresh(node)}),first=objects.obtener('qa-0'),neighbour=objects.obtener('qa-1'),before=capturarObjeto(first),originalNeighbour=neighbour.position.clone();
    state.apply('qa-0',{...before,position:[0,1,0]});state.undo();
    if(!first.position.equals(new T.Vector3(...before.position))||!neighbour.position.equals(originalNeighbour))throw Error('Edit/undo changed source or neighbour');
    scene.updateMatrixWorld(true);const hit=new T.Raycaster(new T.Vector3(0,10,0),new T.Vector3(0,-1,0)).intersectObjects(scene.children,true),picked=objects.elegirImpacto(hit);
    if(picked?.id!=='qa-0')throw Error('GPU picking lost stable ID');
    await renderer.compileAsync(scene,camera);renderer.setRenderTarget(target);renderer.info.reset();renderer.render(scene,camera);
    const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);
    const colored=pixels.some((value,i)=>i%4!==3&&value!==0),error=renderer.getContext().getError();
    if(!colored||error)throw Error('GPU render failed: '+error);
    return {verified:true,importedIds:objects.entries.size,instancedPieces:optimized.instanceCount,multiDrawPieces:optimized.multiCount,picking:picked.id,editUndoNeighbour:true,gpuPixels:true,gpuError:error,drawCalls:renderer.info.render.calls,sourceBytes:bytes.byteLength,admission:optimized.report};
  } finally {
    renderer.setRenderTarget(previousTarget);Object.assign(renderer.info.render,previousInfo);target.dispose();optimized.dispose();
    const geometries=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const geometry of geometries)geometry.dispose();style.dispose();
  }
}

export async function verifyLightingSpecialization(engine){
  const examples=new Map(),style=engine.assets.style;
  engine.scene.traverse(o=>{
    const m=o.material;if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||o.isBatchedMesh||o.morphTargetInfluences||!m?.isShaderMaterial||!style.lightingShaders.get(m))return;
    const key=m.userData.surfaceGraph?.kind||(m.defines.USE_ALBEDO!==undefined?'texture':'flat');if(!examples.has(key))examples.set(key,o);
  });
  const renderer=engine.renderer,target=new T.WebGLRenderTarget(64,64),previous=renderer.getRenderTarget(),info={...renderer.info.render},rows=[];
  try{
    for(const [kind,source] of [...examples].slice(0,6))for(const active of [false,true]){
      const originalShader=style.lightingShaders.get(source.material),reference=source.material.clone(),optimized=source.material.clone(),uniforms=T.UniformsUtils.clone(source.material.uniforms);
      for(const [key,u] of Object.entries(source.material.uniforms))if(u.value?.isTexture)uniforms[key].value=u.value;
      uniforms.uLampColor.value=new Float32Array(48);uniforms.uLampPos.value=new Float32Array(48);uniforms.uLampRadio.value=new Float32Array(16).fill(1);
      uniforms.uSalas.value=new Float32Array(32);for(let i=0;i<8;i++)uniforms.uSalas.value.set([1e9,1e9,-1e9,-1e9],i*4);
      const bounds=source.geometry.boundingBox.clone().applyMatrix4(source.matrixWorld),center=bounds.getCenter(new T.Vector3()),radius=Math.max(1,bounds.getSize(new T.Vector3()).length()/2);
      if(active){uniforms.uLampColor.value.set([.6,.2,.1],6);uniforms.uLampPos.value.set([center.x,center.y+5,center.z+1],6);uniforms.uLampRadio.value[2]=radius*3;uniforms.uSalas.value.set([-1e8,-1e8,1e8,1e8]);}
      reference.uniforms=optimized.uniforms=uniforms;reference.side=optimized.side=T.DoubleSide;reference.fragmentShader=originalShader;optimized.fragmentShader=specializeLightingShader(originalShader,{lamps:active?3:0,rooms:active?1:0});
      const scene=new T.Scene(),mesh=new T.Mesh(source.geometry,reference);mesh.matrixAutoUpdate=false;mesh.matrix.copy(source.matrixWorld);scene.add(mesh);
      const camera=new T.OrthographicCamera(-radius*1.2,radius*1.2,radius*1.2,-radius*1.2,.01,radius*20+100);camera.position.copy(center).add(new T.Vector3(radius*.8,radius*.7,radius*3));camera.lookAt(center);
      const render=async material=>{mesh.material=material;await renderer.compileAsync(scene,camera);renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=new Uint8Array(64*64*4);renderer.readRenderTargetPixels(target,0,0,64,64,pixels);return pixels;};
      try{
        const a=await render(reference),b=await render(optimized);let maxDifference=0,colored=0;
        for(let i=0;i<a.length;i++){maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[i]));if(i%4!==3&&a[i])colored++;}
        rows.push({kind,active,maxDifference,colored,verified:colored>0&&maxDifference<=1});
      }finally{reference.dispose();optimized.dispose();}
    }
    return {verified:rows.length>0&&rows.every(r=>r.verified),samples:rows.length,rows,gpuError:renderer.getContext().getError()};
  }finally{renderer.setRenderTarget(previous);Object.assign(renderer.info.render,info);target.dispose();}
}

