// Browser-only verification, run from the isolated original-model comparator.
// Uses the real production factory, shader and both production batching paths.
import * as T from '../engine/three.js';
import {CityBatchedMesh,RenderMaterials} from '../engine/CityRenderOptimization.js';
import {LEAF_PALETTES,BARK_VARIANTS} from '../prototipos/arbol-urbano/routes.js';
import {setLeafPalette,setBarkTint} from '../prototipos/arbol-urbano/TreeModelParts.js';

export async function probe(prototypes,{models=['anime','jabami','sakura','gold'],palettes=['natural','olive','light','dark']}={}){
  const preview=window.__treePrototype,renderer=preview.renderer,target=new T.WebGLRenderTarget(512,768),cache=new RenderMaterials();
  const previous=renderer.getRenderTarget(),clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha(),results=[];
  const camera=preview.camera.clone();camera.aspect=512/768;camera.updateProjectionMatrix();
  const output=document.createElement('canvas');output.width=1024;output.height=768;const ctx=output.getContext('2d');
  try{
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);
    for(const model of models){
      await preview.selectModel(model==='gold'?'anime2':model);
      const original=preview.tree;original.root.scale.setScalar(1);original.root.rotation.set(0,0,0);
      for(const m of Object.values(original.materials))m.uniforms.uTreeShadowEnabled.value=0;
      setBarkTint(original,BARK_VARIANTS.grey);
      const part=prototypes.get('tree:'+model)[0][0],scene=new T.Scene(),reference=new T.Scene();reference.add(original.root.clone());
      for(const [tone,palette]of palettes.entries()){
        setLeafPalette(original,palette,LEAF_PALETTES[palette]);
        const read=()=>{renderer.clear();renderer.render(scene,camera);const data=new Uint8Array(512*768*4);renderer.readRenderTargetPixels(target,0,0,512,768,data);return data;};
        renderer.clear();renderer.render(reference,camera);const expected=new Uint8Array(512*768*4);renderer.readRenderTargetPixels(target,0,0,512,768,expected);
        for(const kind of ['instanced','batched']){
          let mesh;
          if(kind==='instanced'){mesh=new T.InstancedMesh(part.geometry,part.material,1);mesh.setMatrixAt(0,new T.Matrix4().makeScale(7.6,7.6,7.6));}
          else{mesh=new CityBatchedMesh(1,part.geometry.attributes.position.count,part.geometry.index.count,part.material);const id=mesh.addInstance(mesh.addGeometry(part.geometry));mesh.setMatrixAt(id,new T.Matrix4().makeScale(7.6,7.6,7.6));}
          mesh.setColorAt(0,new T.Color(tone/3,1,1));mesh.material=cache.get(part.material,mesh.geometry,kind);scene.add(mesh);
          const actual=read();let pixels=0,error=0,maxError=0,silhouette=0,over2=0;
          for(let i=0;i<actual.length;i+=4){
            if(Boolean(actual[i+3])!==Boolean(expected[i+3]))silhouette++;
            if(!actual[i+3]&&!expected[i+3])continue;pixels++;let peak=0;
            for(let c=0;c<3;c++){const e=Math.abs(actual[i+c]-expected[i+c]);error+=e;maxError=Math.max(maxError,e);peak=Math.max(peak,e);}if(peak>2)over2++;
          }
          const result={model,palette,kind,pixels,silhouette,meanRgbError:error/(pixels*3),maxRgbError:maxError,pixelsOver2:over2,drawCalls:renderer.info.render.calls};
          if(result.meanRgbError>.005||silhouette>2||result.drawCalls!==1)throw new Error('Fidelidad del material fuera de tolerancia: '+JSON.stringify(result));
          results.push(result);
          if(model==='anime'&&tone===0&&kind==='batched')for(const [col,data]of [[0,expected],[1,actual]]){
            const rgba=new Uint8ClampedArray(data.length);
            for(let y=0;y<768;y++)for(let x=0;x<512;x++){
              const src=((767-y)*512+x)*4,dst=(y*512+x)*4;
              if(data[src+3])rgba.set([data[src],data[src+1],data[src+2],255],dst);else rgba.set([127,183,221,255],dst);
            }
            ctx.putImageData(new ImageData(rgba,512,768),col*512,0);
          }
          scene.remove(mesh);mesh.dispose();
        }
      }
    }
    ctx.fillStyle='#142936';ctx.font='18px sans-serif';ctx.fillText('Prototipo original',20,34);ctx.fillText('Material de Barcelona · BatchedMesh',532,34);
    return {conditions:'Same camera, world light, geometry, palette and bark. Self-shadow disabled to isolate material/texture fidelity. RGBA8 512x768.',results,image:output.toDataURL(),gpuError:renderer.getContext().getError()};
  }finally{renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);target.dispose();cache.dispose();}
}
