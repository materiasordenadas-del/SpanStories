// Active GPU representation; editable CPU source nodes are excluded after batching.
export function estimarMemoria(scene) {
  const buffers=new Set(),textures=new Set();let geometryBytes=0,textureBytes=0;
  scene.traverse(o=>{
    if(!(o.layers.mask&1))return;for(let p=o;p;p=p.parent)if(!p.visible)return;
    if(o.geometry) for(const attr of [...Object.values(o.geometry.attributes),o.geometry.index].filter(Boolean)) {const array=attr.isInterleavedBufferAttribute?attr.data.array:attr.array;if(array&&!buffers.has(array.buffer)){buffers.add(array.buffer);geometryBytes+=array.buffer.byteLength;}}
    if(o.instanceMatrix&&!buffers.has(o.instanceMatrix.array.buffer)){buffers.add(o.instanceMatrix.array.buffer);geometryBytes+=o.instanceMatrix.array.byteLength;}
    const candidates=[o._matricesTexture,o._indirectTexture,o._colorsTexture];
    for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)candidates.push(...Object.values(m),...Object.values(m.uniforms||{}).map(u=>u.value));
    for(const value of candidates)if(value?.isTexture&&!textures.has(value)){textures.add(value);const i=value.image;textureBytes+=(i?.data?.byteLength||((i?.width||i?.videoWidth||0)*(i?.height||i?.videoHeight||0)*4))*(value.generateMipmaps?4/3:1);}
  });
  return {geometryBytes,textureBytes,totalBytes:geometryBytes+textureBytes,method:'Representación activa: buffers únicos + texturas RGBA8/mipmaps y datos tipados; excluye originales CPU, driver, render targets y recursos inactivos retenidos por el renderer'};
}

export class CityMetrics {
  constructor(renderer) { this.renderer=renderer;this.frames=[];this.renderTimes=[];this.duration=0;this.started=performance.now();this.inputTime=null;this.inputLatencyMs=null;this.inputMeasuredAt=null; }
  sample(frameMs,renderMs) {
    if(!(frameMs>0&&Number.isFinite(frameMs)))return;
    this.frames.push(frameMs);this.renderTimes.push(renderMs);this.duration+=frameMs;
    // Keep five seconds, including the last stall even at very low FPS.
    while(this.frames.length>1&&this.duration-this.frames[0]>=5000){this.duration-=this.frames.shift();this.renderTimes.shift();}
  }
  input(timestamp,now=performance.now()) {if(Number.isFinite(timestamp)&&timestamp<=now&&now-timestamp<60000)this.inputTime=this.inputTime===null?timestamp:Math.min(this.inputTime,timestamp);}
  presented(now=performance.now()) {if(this.inputTime!==null){this.inputLatencyMs=Math.max(0,now-this.inputTime);this.inputMeasuredAt=now;this.inputTime=null;}}
  inputLatency(now=performance.now()) {return this.inputMeasuredAt!==null&&now-this.inputMeasuredAt<2000?this.inputLatencyMs:null;}
  reset() {this.frames=[];this.renderTimes=[];this.duration=0;this.inputTime=null;this.inputLatencyMs=null;this.inputMeasuredAt=null;}
  timing() {
    const sorted=[...this.frames].sort((a,b)=>a-b),quantile=p=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;
    const median=quantile(.5);let duration=0,count=0;
    for(let i=this.frames.length-1;i>=0&&duration<1000;i--){duration+=this.frames[i];count++;}
    const mean=count?duration/count:0;
    return {samples:sorted.length,fps:mean?1000/mean:0,frameMs:mean,medianMs:median,p95Ms:quantile(.95),p99Ms:quantile(.99),maxMs:quantile(1),minFps:quantile(1)?1000/quantile(1):0,windowMs:this.duration,inputLatencyMs:this.inputLatency(),
      stalls:this.frames.filter(n=>n>25).length,rateWindowMs:duration,
      renderSubmissionMs:this.renderTimes.length?this.renderTimes.reduce((a,b)=>a+b)/this.renderTimes.length:0};
  }
  snapshot(scene,extra={}) {
    const network=performance.getEntriesByType('resource').map(e=>({url:e.name,transferBytes:e.transferSize,encodedBytes:e.encodedBodySize,durationMs:e.duration}));
    return {at:new Date().toISOString(),userAgent:navigator.userAgent,viewport:[this.renderer.domElement.clientWidth,this.renderer.domElement.clientHeight],dpr:this.renderer.getPixelRatio(),...this.timing(),
      render:{...this.renderer.info.render},gpuResources:{...this.renderer.info.memory},estimatedMemory:estimarMemoria(scene),network,...extra};
  }
}
