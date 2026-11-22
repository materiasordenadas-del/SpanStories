// Browser-side offscreen comparison. Uses a cloned camera and restores every
// temporary GPU/LOD/layer change without moving the user's camera or objects.
export async function verifyTreeRedesign({pose,width,height,sectors,samples=24}){
  const T=await import('/engine/three.js'),e=window.__escena;
  await Promise.all(sectors.map(id=>e.assets.load(e.manifest.sectors.find(s=>s.id===id),e.assets.records.get(id)?.manifestUrl||new URL('./Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia/zona.json',location.href).href)));
  const renderer=e.renderer,camera=e.camera.clone(),view=new T.Scene(),target=new T.WebGLRenderTarget(width,height);
  camera.position.fromArray(pose.camera);camera.quaternion.fromArray(pose.quaternion);camera.aspect=width/height;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  view.background=e.scene.background;view.children=sectors.map(id=>e.assets.records.get(id).root);
  const previous=renderer.getRenderTarget(),info={...renderer.info.render},resolution=e.luz.trazo.uResolucion.value.clone(),layers=[],times=[];
  try{
    e.luz.trazo.uResolucion.value.set(width,height);
    e.scene.updateMatrixWorld(true);
    for(const sector of e.decorations.sectors.values())sector.update(camera,height,true);
    renderer.setRenderTarget(target);renderer.render(view,camera);
    for(let i=0;i<samples;i++){renderer.info.reset();const start=performance.now();renderer.render(view,camera);times.push(performance.now()-start);}
    const render={...renderer.info.render};
    for(const id of sectors)for(const group of e.decorations.sectors.get(id)?.groups.values()||[]){
      const tree=group.slots?group.slots.some(slot=>slot.entry.placement.kind==='tree'):group.key?.startsWith('tree:');
      if(tree){layers.push([group.batch,group.batch.layers.mask]);group.batch.layers.disable(0);}
    }
    renderer.info.reset();renderer.render(view,camera);const urbanRender={...renderer.info.render},pixels=new Uint8Array(width*height*4);
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const materialSet=new Set(),atlasSet=new Set();
    for(const [key,levels]of e.decorations.prototypes)if(key.startsWith('tree:')){
      for(const level of levels.slice(0,2))for(const part of level)materialSet.add(part.material.uuid);
      for(const part of levels[2])atlasSet.add(part.material.uniforms.uAlbedo.value.uuid);
    }
    times.sort((a,b)=>a-b);
    return {camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),viewport:[width,height],sectors,render,urbanRender,treeDrawCalls:render.calls-urbanRender.calls,treeTriangles:render.triangles-urbanRender.triangles,
      cpuSubmissionMedianMs:times[Math.floor(times.length*.5)],cpuSubmissionP95Ms:times[Math.floor(times.length*.95)],samples,
      urbanPixelHash:hash,gpuError:renderer.getContext().getError(),treeMaterials:materialSet.size,farAtlases:atlasSet.size,prototypes:e.decorations.snapshot().prototypeTriangles,
      note:'Offscreen fixed-camera CPU submission and actual renderer counters; not delivered FPS or Internet latency.'};
  }finally{
    for(const [batch,mask]of layers)batch.layers.mask=mask;
    for(const sector of e.decorations.sectors.values())sector.update(e.camera,renderer.domElement.clientHeight,true);
    e.luz.trazo.uResolucion.value.copy(resolution);
    renderer.setRenderTarget(previous);Object.assign(renderer.info.render,info);target.dispose();view.children=[];
  }
}
