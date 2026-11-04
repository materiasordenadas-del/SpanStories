import * as THREE from 'three';
import {gFragment} from './gmaterial.js';
import {GRASS_PRESETS,grassConfig,seededGrass,chunkSeed,chunkDistance,grassLOD,grassKeep} from './grass-config.js';
import {jamesBladeGeometry} from './grass-geometry.js';
import {grassVertex,grassMaskVertex,grassMaskFragment} from './grass-shaders.js';
import {withOriginalJamesMaterial} from './grass-james-material.js';
const MASK_SIZE=2048;
const structural=['density','spacing','seed','chunkSize','clumping','clumpSize','irregularity','regionalVariation','mask','lod1Density'];

export class GrassField{
  constructor(sun,{textures}={}){
    this.config=grassConfig();this.sun=sun;this.mesh=new THREE.Group();this.mesh.name='cesped-james';
    const loader=typeof document!=='undefined'?new THREE.TextureLoader():null;
    this.grassTexture=textures?.grass??loader?.load('/grass-james/grass.jpg',()=>{if(this.jamesGrassTexture)this.jamesGrassTexture.needsUpdate=true;this.onChange?.();})??new THREE.Texture();
    this.cloudTexture=textures?.cloud??loader?.load('/grass-james/cloud.jpg',()=>{if(this.jamesCloudTexture)this.jamesCloudTexture.needsUpdate=true;this.onChange?.();})??new THREE.Texture();
    for(const tex of [this.grassTexture,this.cloudTexture]){tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.colorSpace=THREE.SRGBColorSpace;}
    // La ruta del ZIP lee bytes RGB sin conversión (Three r120). Se comparte la
    // imagen CPU, conservando la interpretación sRGB que usan los otros estilos.
    this.jamesGrassTexture=this.grassTexture.clone();this.jamesCloudTexture=this.cloudTexture.clone();
    for(const tex of [this.jamesGrassTexture,this.jamesCloudTexture]){tex.colorSpace=THREE.NoColorSpace;tex.needsUpdate=true;}
    this.uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.lights,{
      uAlphaTest:{value:0},uSurfOverride:{value:-1},uEmissive:{value:0},uBaseColor:{value:new THREE.Color(1,1,1)},
      uReference:{value:new THREE.Vector3()},uCharacter:{value:new THREE.Vector3(1e6,0,1e6)},
      uGeometry:{value:new THREE.Vector4()},uWind:{value:new THREE.Vector4()},uWindDir:{value:new THREE.Vector2()},uLOD:{value:new THREE.Vector4()},uAppearance:{value:new THREE.Vector4()},uShape:{value:new THREE.Vector4()},
      uRootColor:{value:new THREE.Color()},uMainColor:{value:new THREE.Color()},uTipColor:{value:new THREE.Color()},
      uTime:{value:0},uQuality:{value:1},uInteraction:{value:0},uDebugLOD:{value:0},uDebugChunks:{value:0},uChunkSize:{value:4},uLight:{value:1},uTranslucency:{value:.18},uAdaptive:{value:1},uDensityScale:{value:1},uJamesOriginal:{value:0},
    }]);
    this.uniforms.uSunDir=sun;this.uniforms.uGrassTexture={value:this.grassTexture};this.uniforms.uCloudTexture={value:this.cloudTexture};
    this.uniforms.textures={value:[this.jamesGrassTexture,this.jamesCloudTexture]};
    this.target=new THREE.WebGLRenderTarget(MASK_SIZE,MASK_SIZE,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,depthBuffer:true,generateMipmaps:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
    this.maskMaterial=new THREE.ShaderMaterial({vertexShader:grassMaskVertex,fragmentShader:grassMaskFragment,uniforms:{uHeightRange:{value:new THREE.Vector2()}},side:THREE.DoubleSide});
    this.maskCamera=new THREE.OrthographicCamera();this.maskRect=new THREE.Vector4();this.maskHeight=new THREE.Vector2();this.maskPixels=null;
    this.frustum=new THREE.Frustum();this.proj=new THREE.Matrix4();this.reference=new THREE.Vector3();
    this.chunks=new Map();this.pool=[];this.queue=[];this.queueHead=0;this.batches=[];this.groundAt=null;this.character=null;
    this.needsBake=true;this.planDirty=true;this.batchDirty=true;this.lastPlanX=Infinity;this.lastPlanZ=Infinity;this.lastCull=0;
    this.adaptiveScale=1;this.adaptiveTarget=1;this.averageMs=0;this.adaptiveSeconds=0;this.qualityCooldown=0;
    this.stats={instances:0,chunks:0,lod0:0,lod1:0,triangles:0,calls:0,uploads:0,generated:0,cpuMs:0,geometryBytes:0,textureBytes:0,queued:0};
    this.syncUniforms();this.createBatches();
  }
  syncUniforms(){
    const c=this.config,u=this.uniforms,a=c.windDirection*Math.PI/180;
    u.uGeometry.value.set(c.height,c.width,c.curvature,c.sizeVariation);u.uWind.value.set(c.wind?c.windStrength:0,c.windSpeed,c.windFrequency,c.windSpatial);
    u.uWindDir.value.set(Math.cos(a),Math.sin(a));u.uLOD.value.set(c.lod0,c.lod1,c.transition,c.lod1Density);
    u.uAppearance.value.set(c.gradient,c.rootShade,c.colorVariation,c.groundBlend);u.uShape.value.set(c.smallClumps,c.orientation*Math.PI/180,c.flexibility,c.windWavelength);
    u.uRootColor.value.set(c.root);u.uMainColor.value.set(c.main);u.uTipColor.value.set(c.tip);
    u.uQuality.value=c.windQuality;u.uInteraction.value=c.interaction?1:0;u.uDebugLOD.value=c.debugLOD?1:0;u.uDebugChunks.value=c.debugChunks?1:0;u.uChunkSize.value=c.chunkSize;u.uLight.value=c.lighting;u.uTranslucency.value=c.translucency;
  }
  createBatches(){
    for(const b of this.batches){this.mesh.remove(b.mesh);b.geometry.dispose();b.material.dispose();b.mesh.customDepthMaterial.dispose();}
    this.batches=[];
    for(let lod=0;lod<2;lod++){
      const geometry=jamesBladeGeometry(this.config.blades,lod),attribute=new THREE.InstancedBufferAttribute(new Float32Array(this.config.maxInstances*4),4).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aRoot',attribute);
      const uniforms={...this.uniforms,uLODLevel:{value:lod}};
      // James colorea ambas caras igual. Normal de masa compartida: el reverso de
      // una hoja no debe convertirse en una raya negra al invertir su normal.
      const fragment=withOriginalJamesMaterial(gFragment.replace('if(!gl_FrontFacing){vn=-vn;wn=-wn;}',''));
      const material=new THREE.ShaderMaterial({uniforms,vertexShader:grassVertex,fragmentShader:fragment,lights:true,glslVersion:THREE.GLSL3,side:THREE.DoubleSide});material.userData.estudio=true;
      const mesh=new THREE.Mesh(geometry,material);mesh.name='cesped-james-lod'+lod;mesh.frustumCulled=false;mesh.castShadow=this.config.shadows;mesh.receiveShadow=true;
      mesh.customDepthMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:grassVertex,fragmentShader:'#include <packing>\nvoid main(){gl_FragColor=packDepthToRGBA(gl_FragCoord.z);}',side:THREE.DoubleSide});
      this.mesh.add(mesh);this.batches.push({mesh,geometry,attribute,material,count:0,triangles:geometry.index.count/3});
    }
    this.batchDirty=true;
  }
  setConfig(patch){
    const old=this.config,next=grassConfig(patch,old);this.config=next;this.syncUniforms();
    if(next.blades!==old.blades||next.maxInstances!==old.maxInstances)this.createBatches();
    if(structural.some(k=>next[k]!==old[k]))this.resetChunks();
    if(['lod0','lod1','transition','maxTriangles','maxInstances','culling','reference'].some(k=>next[k]!==old[k])){this.planDirty=true;this.batchDirty=true;}
    if(['height','windStrength','curvature','shadows'].some(k=>next[k]!==old[k])){this.lastCull=0;for(const b of this.batches)b.mesh.castShadow=next.shadows;}
    if(!next.adaptive){this.adaptiveTarget=1;this.qualityCooldown=0;}
    this.onChange?.();return this.config;
  }
  preset(name){if(!GRASS_PRESETS[name])throw Error('Preset desconocido');return this.setConfig({...GRASS_PRESETS[name],preset:name});}
  serialize(){return JSON.stringify({type:'spanstories-grass',version:1,config:this.config},null,2);}
  load(text){const parsed=JSON.parse(text);if(parsed.type!=='spanstories-grass'||parsed.version!==1||!parsed.config||Array.isArray(parsed.config))throw Error('Configuración de césped incompatible');return this.setConfig(grassConfig(parsed.config));}
  invalidate(){this.needsBake=true;this.resetChunks();}
  resetChunks(){for(const chunk of this.chunks.values())this.pool.push(chunk);this.chunks.clear();this.queue.length=0;this.queueHead=0;this.planDirty=true;this.batchDirty=true;}
  bake(renderer,scene,center,radius){
    const cam=this.maskCamera,R=radius;scene.updateMatrixWorld(true);
    const bounds=new THREE.Box3();scene.traverse(o=>{if(o.isMesh&&o.geometry?.attributes.aSurf){if(o.isInstancedMesh){if(!o.boundingBox)o.computeBoundingBox();bounds.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));}else{if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}}});
    const low=Number.isFinite(bounds.min.y)?bounds.min.y-2:center.y-100,high=Number.isFinite(bounds.max.y)?bounds.max.y+2:center.y+100;
    this.maskHeight.set(low,Math.max(1,high-low));this.maskMaterial.uniforms.uHeightRange.value.copy(this.maskHeight);
    cam.left=-R;cam.right=R;cam.top=R;cam.bottom=-R;cam.near=.1;cam.far=high-low+20;
    cam.position.set(center.x,high+5,center.z);cam.up.set(0,0,-1);cam.lookAt(center.x,low,center.z);cam.updateProjectionMatrix();cam.updateMatrixWorld();
    const prevTarget=renderer.getRenderTarget(),prevOverride=scene.overrideMaterial,prevClear=renderer.getClearColor(new THREE.Color()),prevAlpha=renderer.getClearAlpha(),prevShadow=renderer.shadowMap.autoUpdate;
    const hidden=[];scene.traverse(o=>{if(o.isMesh&&o.visible&&(!o.geometry?.attributes.aSurf||o.userData.grassExcluded)){hidden.push(o);o.visible=false;}});
    const wasVisible=this.mesh.visible;this.mesh.visible=false;
    try{
      scene.overrideMaterial=this.maskMaterial;renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(this.target);renderer.setClearColor(0x000000,0);renderer.clear(true,true,false);renderer.render(scene,cam);
      this.maskPixels??=new Uint8Array(MASK_SIZE*MASK_SIZE*4);renderer.readRenderTargetPixels(this.target,0,0,MASK_SIZE,MASK_SIZE,this.maskPixels);
      this.maskRect.set(center.x-R,center.z-R,2*R,MASK_SIZE);this.needsBake=false;this.resetChunks();
    }finally{scene.overrideMaterial=prevOverride;renderer.shadowMap.autoUpdate=prevShadow;renderer.setRenderTarget(prevTarget);renderer.setClearColor(prevClear,prevAlpha);for(const o of hidden)o.visible=true;this.mesh.visible=wasVisible;}
  }
  surfaceAt(x,z){
    if(!this.config.mask)return this.groundAt?.(x,z)??0;if(!this.maskPixels)return NaN;
    // readPixels empieza abajo = +Z; arriba de esta cámara cenital es -Z.
    const r=this.maskRect,px=(x-r.x)/r.z*MASK_SIZE-.5,pz=(r.y+r.z-z)/r.z*MASK_SIZE-.5,ix=Math.floor(px),iz=Math.floor(pz);
    if(ix<0||iz<0||ix>=MASK_SIZE-1||iz>=MASK_SIZE-1)return NaN;
    const p=(iz*MASK_SIZE+ix)*4,d=this.maskPixels,step=MASK_SIZE*4;
    if(d[p]<250||d[p+4]<250||d[p+step]<250||d[p+step+4]<250)return NaN;
    const fx=px-ix,fz=pz-iz;
    const a=d[p+1]*256+d[p+2],b=d[p+5]*256+d[p+6],e=d[p+step+1]*256+d[p+step+2],f=d[p+step+5]*256+d[p+step+6];
    return ((a*(1-fx)+b*fx)*(1-fz)+(e*(1-fx)+f*fx)*fz)/65535*this.maskHeight.y+this.maskHeight.x;
  }
  generate(chunk,x,z){
    const c=this.config,S=c.chunkSize,n=Math.ceil(Math.sqrt(Math.min(c.density,1/(c.spacing*c.spacing)))*S),capacity=n*n*4;
    if(!chunk.data||chunk.data.length!==capacity)chunk.data=new Float32Array(capacity);
    const r=seededGrass(chunkSeed(x,z,c.seed));let count=0,minY=Infinity,maxY=-Infinity;
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const px=(x+(i+.5+(r()-.5)*c.irregularity)/n)*S,pz=(z+(j+.5+(r()-.5)*c.irregularity)/n)*S;
      const region=.5+.5*Math.sin(px/c.clumpSize+Math.sin(pz/c.clumpSize*.8)),wide=.5+.5*Math.sin(px*.033+pz*.057);
      const keep=(1-c.clumping*.6+c.clumping*.6*region)*(1-c.regionalVariation*.4+c.regionalVariation*.4*wide),choice=r(),seed=r();
      if(choice>keep)continue;const y=this.surfaceAt(px,pz);if(!Number.isFinite(y))continue;
      if(c.mask&&(!Number.isFinite(this.surfaceAt(px+.08,pz))||!Number.isFinite(this.surfaceAt(px-.08,pz))||!Number.isFinite(this.surfaceAt(px,pz+.08))||!Number.isFinite(this.surfaceAt(px,pz-.08))))continue;
      const offset=count++*4;chunk.data[offset]=px;chunk.data[offset+1]=y-.006;chunk.data[offset+2]=pz;chunk.data[offset+3]=seed;minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    chunk.x=x;chunk.z=z;chunk.count=count;chunk.lod=2;chunk.visible=false;chunk.minY=count?minY:0;chunk.maxY=count?maxY:0;chunk.sphere??=new THREE.Sphere();this.stats.generated++;return chunk;
  }
  plan(){
    const c=this.config,S=c.chunkSize,p=this.reference,reach=c.lod1+.6;
    for(const [key,chunk]of this.chunks)if(chunkDistance(chunk.x,chunk.z,S,p.x,p.z)>reach+S){this.chunks.delete(key);this.pool.push(chunk);this.batchDirty=true;}
    const candidates=[];
    for(let z=Math.floor((p.z-reach)/S);z<=Math.floor((p.z+reach)/S);z++)for(let x=Math.floor((p.x-reach)/S);x<=Math.floor((p.x+reach)/S);x++){
      const distance=chunkDistance(x,z,S,p.x,p.z);if(distance>reach)continue;const key=x+','+z;if(!this.chunks.has(key))candidates.push({x,z,key,distance});
    }
    candidates.sort((a,b)=>a.distance-b.distance);this.queue=candidates;this.queueHead=0;this.lastPlanX=p.x;this.lastPlanZ=p.z;this.planDirty=false;
  }
  processQueue(){
    const end=Math.min(this.queue.length,this.queueHead+this.config.chunksPerFrame);
    for(;this.queueHead<end;this.queueHead++){const entry=this.queue[this.queueHead];if(this.chunks.has(entry.key))continue;this.chunks.set(entry.key,this.generate(this.pool.pop()??{},entry.x,entry.z));this.batchDirty=true;}
    this.stats.queued=this.queue.length-this.queueHead;
  }
  cull(camera,now){
    if(now-this.lastCull<.08&&!this.batchDirty)return;
    const c=this.config,S=c.chunkSize;camera.updateMatrixWorld();this.proj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.proj);
    for(const chunk of this.chunks.values()){
      const distance=chunkDistance(chunk.x,chunk.z,S,this.reference.x,this.reference.z),lod=grassLOD(distance,c,chunk.lod),padding=c.height*(1+c.sizeVariation)+c.windStrength*2+c.curvature;
      chunk.sphere.center.set((chunk.x+.5)*S,(chunk.minY+chunk.maxY)*.5,(chunk.z+.5)*S);chunk.sphere.radius=Math.hypot(S*.7072,(chunk.maxY-chunk.minY)*.5)+padding;
      const visible=chunk.count>0&&distance<c.lod1&&(!c.culling||this.frustum.intersectsSphere(chunk.sphere));
      if(lod!==chunk.lod||visible!==chunk.visible)this.batchDirty=true;chunk.lod=lod;chunk.visible=visible;
    }
    this.lastCull=now;
  }
  compact(){
    const c=this.config;let total=0,triangles=0,nearChunks=0,farChunks=0;for(const b of this.batches)b.count=0;
    const visible=Array.from(this.chunks.values()).filter(chunk=>chunk.visible).sort((a,b)=>chunkDistance(a.x,a.z,c.chunkSize,this.reference.x,this.reference.z)-chunkDistance(b.x,b.z,c.chunkSize,this.reference.x,this.reference.z));
    let weightedNear=0;
    for(const chunk of visible)for(let i=0;i<chunk.count;i++){const k=i*4,d=Math.hypot(chunk.data[k]-this.reference.x,chunk.data[k+2]-this.reference.z);if(d<c.lod0)weightedNear+=grassKeep(d);}
    // Distribuye el presupuesto por todo el radio. Evita gastar todo en los primeros
    // sectores y dejar un círculo vacío cuando el usuario elige 30–50 metros.
    // La densidad es plena hasta 12 m (la demo web entera cabe en ese radio).
    const nearBudget=Math.min(c.maxInstances*.88,c.maxTriangles*.9/this.batches[0].triangles);
    const densityScale=Math.min(1,nearBudget/Math.max(1,weightedNear)*.94);this.uniforms.uDensityScale.value=densityScale;
    for(const chunk of visible){
      if(chunkDistance(chunk.x,chunk.z,c.chunkSize,this.reference.x,this.reference.z)<c.lod0)nearChunks++;else farChunks++;
      for(let i=0;i<chunk.count;i++){
        const k=i*4,x=chunk.data[k],z=chunk.data[k+2],distance=Math.hypot(x-this.reference.x,z-this.reference.z);
        if(distance>=c.lod1)continue;
        for(let lod=0;lod<2;lod++){
          if(lod===0&&distance>=c.lod0)continue;
          const seed=chunk.data[k+3];
          if(lod===0&&seed>grassKeep(distance)*densityScale)continue;
          if(lod===1&&(distance<c.lod0-c.transition||(seed*17.31)%1>=c.lod1Density))continue;
          const b=this.batches[lod];if(total>=c.maxInstances||triangles+b.triangles>c.maxTriangles)continue;
          const offset=b.count++*4;b.attribute.array[offset]=x;b.attribute.array[offset+1]=chunk.data[k+1];b.attribute.array[offset+2]=z;b.attribute.array[offset+3]=chunk.data[k+3];total++;triangles+=b.triangles;
        }
      }
    }
    for(const b of this.batches){b.geometry.instanceCount=b.count;b.attribute.clearUpdateRanges();if(b.count){b.attribute.addUpdateRange(0,b.count*4);b.attribute.needsUpdate=true;}}
    Object.assign(this.stats,{instances:total,triangles,chunks:visible.length,lod0:nearChunks,lod1:farChunks,calls:this.batches.filter(b=>b.count>0).length});this.stats.uploads++;
    this.stats.geometryBytes=this.batches.reduce((n,b)=>n+b.attribute.array.byteLength+b.geometry.attributes.position.array.byteLength+b.geometry.index.array.byteLength,0)+Array.from(this.chunks.values()).reduce((n,b)=>n+b.data.byteLength,0)+this.pool.reduce((n,b)=>n+(b.data?.byteLength??0),0);
    const texBytes=t=>(t.image?.width??0)*(t.image?.height??0)*4*4/3;
    this.stats.textureBytes=MASK_SIZE*MASK_SIZE*4+texBytes(this.grassTexture)+texBytes(this.cloudTexture)+texBytes(this.jamesGrassTexture)+texBytes(this.jamesCloudTexture);
    this.batchDirty=false;this.lastCompactX=this.reference.x;this.lastCompactZ=this.reference.z;
  }
  adapt(dt){
    const ms=dt*1000;this.averageMs=this.averageMs?this.averageMs*.97+ms*.03:ms;this.adaptiveSeconds+=dt;this.qualityCooldown=Math.max(0,this.qualityCooldown-dt);
    if(this.config.adaptive&&this.adaptiveSeconds>3&&!this.qualityCooldown&&this.stats.instances){
      const budget=1000/this.config.targetFPS;
      if(this.averageMs>budget*1.18){this.adaptiveTarget=Math.max(.25,this.adaptiveTarget-.12);this.qualityCooldown=4;}
      else if(this.averageMs<budget*.8){this.adaptiveTarget=Math.min(1,this.adaptiveTarget+.08);this.qualityCooldown=5;}
      this.adaptiveSeconds=0;
    }
    this.adaptiveScale+=(this.adaptiveTarget-this.adaptiveScale)*Math.min(1,dt*.5);this.uniforms.uAdaptive.value=this.adaptiveScale;
    this.uniforms.uQuality.value=this.adaptiveScale<.85?0:this.config.windQuality;
  }
  update(camera,active,time=0,dt=1/60){
    const started=performance.now(),c=this.config;this.reference.copy(c.reference==='character'&&this.character?this.character:camera.position);
    let on=active&&c.enabled&&!this.needsBake;if(on&&this.groundAt){const h=this.groundAt(camera.position.x,camera.position.z);if(Number.isFinite(h)&&camera.position.y-h>c.lod1+c.height)on=false;}
    this.mesh.visible=on;if(!on)return false;this.uniforms.uReference.value.copy(this.reference);this.uniforms.uTime.value=time;
    if(this.character)this.uniforms.uCharacter.value.copy(this.character);else this.uniforms.uCharacter.value.set(1e6,0,1e6);this.adapt(dt);
    if(this.planDirty||Math.hypot(this.reference.x-this.lastPlanX,this.reference.z-this.lastPlanZ)>=c.chunkSize*.5)this.plan();
    this.processQueue();this.cull(camera,time);if(Math.hypot(this.reference.x-(this.lastCompactX??Infinity),this.reference.z-(this.lastCompactZ??Infinity))>.2)this.batchDirty=true;
    if(this.batchDirty)this.compact();this.stats.cpuMs=performance.now()-started;return true;
  }
  get animated(){return this.mesh.visible&&(this.config.wind&&this.config.windStrength>0||this.stats.queued>0||this.config.adaptive);}
  get radius(){return this.config.lod1;}
  dispose(){for(const b of this.batches){b.geometry.dispose();b.material.dispose();b.mesh.customDepthMaterial.dispose();}this.target.dispose();this.maskMaterial.dispose();this.grassTexture.dispose();this.cloudTexture.dispose();this.jamesGrassTexture.dispose();this.jamesCloudTexture.dispose();this.chunks.clear();this.pool.length=0;this.maskPixels=null;}
}
