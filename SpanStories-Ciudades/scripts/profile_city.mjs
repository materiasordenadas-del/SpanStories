// Temporary diagnostics; every override and GPU query is released on stop.
// Counts and timings add overhead: use to locate work, not as an FPS benchmark.
export async function profileCityRender() {
  const e=window.__escena,gl=e.renderer.getContext(),extension=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const {CityBatchedMesh}=await import('../engine/CityRenderOptimization.js');
  const totals={},draws=new Map(),restores=[],pending=[],gpu=[],frames=[];
  let current,stopped=false,index=0;
  const add=(key,time=0)=>{const total=totals[key]||(totals[key]={calls:0,ms:0});total.calls++;total.ms+=time;};
  function wrap(object,key,fn) {
    const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];
    object[key]=fn(original);
    restores.push(()=>{if(descriptor)Object.defineProperty(object,key,descriptor);else delete object[key];});
  }
  wrap(e.scene,'updateMatrixWorld',original=>function(...args){const start=performance.now();try{return original.apply(this,args);}finally{add('world',performance.now()-start);}});
  wrap(CityBatchedMesh.prototype,'updateCityDrawList',original=>function(...args){const start=performance.now();try{return original.apply(this,args);}finally{add('batchLists',performance.now()-start);}});
  wrap(e.renderer,'renderBufferDirect',original=>function(camera,scene,geometry,material,object,group){
    const start=performance.now();try{return original.call(this,camera,scene,geometry,material,object,group);}finally{
      const ms=performance.now()-start;add('bufferDirect',ms);let data=draws.get(material);
      if(!data){data={name:material.userData.sourceName||material.name||material.type,kind:object.isBatchedMesh?'batch':object.isInstancedMesh?'instance':object.isSkinnedMesh?'skin':'mesh',calls:0,ms:0};draws.set(material,data);}data.calls++;data.ms+=ms;
    }
  });
  for(const key of ['uniform1f','uniform1i','uniform2fv','uniform3fv','uniform4fv','uniform1fv','uniformMatrix3fv','uniformMatrix4fv','bindVertexArray','useProgram','bindTexture','bufferSubData','texSubImage2D','texImage2D','drawElements','drawElementsInstanced']) {
    if(typeof gl[key]!=='function')continue;
    wrap(gl,key,original=>function(...args){const start=performance.now();try{return original.apply(this,args);}finally{add(key,performance.now()-start);}});
  }
  wrap(e.renderer,'render',original=>function(...args){
    if(stopped)return original.apply(this,args);
    if(extension){
      const disjoint=gl.getParameter(extension.GPU_DISJOINT_EXT);
      for(let i=pending.length-1;i>=0;i--){const query=pending[i];if(disjoint||gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
        if(!disjoint)gpu.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);gl.deleteQuery(query);pending.splice(i,1);
      }}
    }
    const query=extension&&index++%6===0&&pending.length<8?gl.createQuery():null;
    if(query)gl.beginQuery(extension.TIME_ELAPSED_EXT,query);
    const start=performance.now();
    try{return original.apply(this,args);}finally{
      frames.push(performance.now()-start);
      if(query){gl.endQuery(extension.TIME_ELAPSED_EXT);pending.push(query);}
    }
  });
  const summary=data=>{const sorted=[...data].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;return {samples:data.length,median:q(.5),p95:q(.95),max:q(1)};};
  return {stop(){if(stopped)return;stopped=true;for(const restore of restores.reverse())restore();for(const query of pending)gl.deleteQuery(query);
    return {frames:frames.length,cpuMs:summary(frames),gpuMs:summary(gpu),totals:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,{callsPerFrame:value.calls/frames.length,msPerFrame:value.ms/frames.length}])),draws:[...draws.values()].sort((a,b)=>b.ms-a.ms).slice(0,20).map(v=>({...v,callsPerFrame:v.calls/frames.length,msPerFrame:v.ms/frames.length})),snapshot:e.snapshot()};}};
}
