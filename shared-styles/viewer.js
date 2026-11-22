// Visor del Estudio: renderer, cámara con lente en mm y verticales rectas, sol con sombra,
// controles de órbita y pase diferido (estilos SpanStories / color / líneas / trama / arcilla).
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Pipeline,MODES} from './pipeline.js';
import {disposeScene} from './resources.js';
import {foliageVolume} from './gmaterial.js';
import {GrassField} from './grass.js';
import {styleId} from './style-pool.js';

export class Viewer{
  constructor(container){
    this.container=container;
    this.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    this.renderer.info.autoReset=false;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;
    container.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(50,1,.5,9000);
    this.camera.position.set(220,180,260);
    this.lens=28;this.straightVerticals=false;
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.screenSpacePanning=true;
    this.controls.maxPolarAngle=Math.PI*.495;
    this.sunDir={value:new THREE.Vector3(-.5,.7,.4).normalize()};
    this.sun=new THREE.DirectionalLight(0xffffff,1);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(4096,4096);
    this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.06;this.sun.shadow.radius=2;
    this.scene.add(this.sun,this.sun.target);
    this.sun.shadow.camera.layers.enable(2); // capa solo-sombra (LOD de balcones)
    this.pipeline=new Pipeline(this.renderer);
    this.pipeline.onStyleReady=()=>{this.dirty=true;};
    this.grass=new GrassField(this.sunDir);this.scene.add(this.grass.mesh);
    this.grass.onChange=()=>{this.dirty=true;this.needsShadow=true;};
    this.sunAz=215;this.sunEl=46;
    this.dirty=true;this.needsShadow=true;
    this.onFrame=null;
    this.controls.addEventListener('change',()=>this.dirty=true);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    this.resize();
    this.setSun(this.sunAz,this.sunEl);
    this.clock=new THREE.Clock();
    this.stats={fps:0,calls:0,triangles:0,frameMs:0,cpuMs:0,gpuMs:null};
    let frames=0,last=performance.now();
    const loop=()=>{
      requestAnimationFrame(loop);
      const rawDt=this.clock.getDelta(),dt=Math.min(.05,rawDt);this.frameDelta=rawDt;
      if(this.comparingGrass)return;
      if(this.controls.enabled)this.controls.update();
      this.onWorldFrame?.();
      if(this.onFrame&&this.onFrame(dt))this.dirty=true;
      if(this.lod?.pending&&performance.now()-this.lod.lastT>230)this.dirty=true;
      if(this.grass.animated)this.dirty=true;
      if(this.pipeline.params.mode===MODES.ghibli)this.dirty=true;
      if(!this.dirty)return;
      this.lod?.update(this.camera.position);
      this.dirty=false;
      const cpuStart=performance.now();this.renderFrame();this.stats.cpuMs=performance.now()-cpuStart;
      this.stats.frameMs=rawDt*1000;
      frames++;const now=performance.now();if(now-last>1000){this.stats.fps=Math.round(frames*1000/(now-last));frames=0;last=now;}
    };
    loop();
  }
  get dpr(){return Math.min(window.devicePixelRatio||1,1.75);}
  resize(){
    const w=this.container.clientWidth||1,h=this.container.clientHeight||1;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w,h,false);
    this.renderer.domElement.style.width='100%';this.renderer.domElement.style.height='100%';
    this.camera.aspect=w/h;this.updateProjection();
    this.pipeline.setSize(w,h,this.dpr);this.pipeline.pixelScale=this.dpr;
    this.dirty=true;
  }
  setLens(mm){this.lens=mm;this.updateProjection();this.dirty=true;}
  updateProjection(){
    // Lente de 35 mm equivalente sobre sensor de 24 mm de alto.
    this.camera.fov=2*Math.atan(12/this.lens)*180/Math.PI;
    this.camera.updateProjectionMatrix();
    if(this.straightVerticals)this.applyShift();
  }
  // Verticales rectas: cámara nivelada + desplazamiento de lente (2 puntos de fuga).
  applyShift(){
    const cam=this.camera,dir=new THREE.Vector3();cam.getWorldDirection(dir);
    const pitch=Math.asin(THREE.MathUtils.clamp(dir.y,-.99,.99));
    if(Math.abs(pitch)<1e-3)return;
    const shift=Math.tan(pitch)/Math.tan(cam.fov*Math.PI/360);
    cam.projectionMatrix.elements[9]=shift;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  setSun(az,el){
    this.sunAz=az;this.sunEl=el;
    const a=az*Math.PI/180,e=el*Math.PI/180;
    this.sunDir.value.set(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)).normalize();
    this.updateSunCamera();this.needsShadow=true;this.dirty=true;
  }
  fitShadow(center,radius){
    this.grass.invalidate();
    this.shadowCenter=center.clone();this.shadowRadius=radius;this.updateSunCamera();this.needsShadow=true;this.dirty=true;
  }
  updateSunCamera(){
    const c=this.shadowCenter??new THREE.Vector3(),R=this.shadowRadius??400;
    this.sun.position.copy(c).addScaledVector(this.sunDir.value,R*2);
    this.sun.target.position.copy(c);this.sun.target.updateMatrixWorld();
    const cam=this.sun.shadow.camera;
    cam.left=-R;cam.right=R;cam.top=R;cam.bottom=-R;cam.near=1;cam.far=R*4;cam.updateProjectionMatrix();
  }
  renderFrame(target=null){
    // Misma geometría y altura en todos los estilos; color/luz los resuelve el pase existente.
    if(this.grass.config.enabled&&this.grass.needsBake&&this.content)this.grass.bake(this.renderer,this.scene,this.shadowCenter??new THREE.Vector3(),this.shadowRadius??400);
    this.grass.uniforms.uJamesOriginal.value=this.pipeline.params.mode===MODES.ghibli&&!this.grass.config.debugLOD&&!this.grass.config.debugChunks?1:0;
    this.pipeline.composite.uniforms.uGrassR.value=this.grass.update(this.camera,!!this.content,performance.now()/1000,this.frameDelta??1/60)?this.grass.radius:0;
    this.pipeline.composite.uniforms.uGrassColor.value.copy(this.grass.uniforms.uMainColor.value);
    this.pipeline.composite.uniforms.uGrassBlend.value=this.grass.config.enabled?this.grass.config.groundBlend:0;
    this.pipeline.composite.uniforms.uGrassTexture.value=this.grass.grassTexture;
    this.pipeline.composite.uniforms.uJamesGrass.value=this.grass.jamesGrassTexture;
    this.pipeline.composite.uniforms.uJamesCloud.value=this.grass.jamesCloudTexture;
    if(this.needsShadow){this.renderer.shadowMap.needsUpdate=true;this.needsShadow=false;}
    if(this.straightVerticals){this.camera.updateMatrixWorld();this.camera.updateProjectionMatrix();this.applyShift();}
    this.renderer.info.reset();
    this.pipeline.render(this.scene,this.camera,this.sunDir.value,target);
    const info=this.renderer.info.render;this.stats.calls=info.calls;this.stats.triangles=info.triangles;
  }
  // Mide el tiempo real de GPU por fotograma (renderiza n veces y sincroniza leyendo un píxel).
  bench(n=20){
    const px=new Uint8Array(4),gl=this.renderer.getContext();
    this.renderFrame();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
    const t0=performance.now();
    for(let i=0;i<n;i++)this.renderFrame();
    gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);
    const ms=(performance.now()-t0)/n;
    return {msPorFotograma:Math.round(ms*10)/10,fps:Math.round(1000/ms),llamadas:this.stats.calls,triangulos:this.stats.triangles};
  }
  setMode(mode){this.pipeline.params.mode=MODES[styleId(mode)];foliageVolume.value=[MODES.zelda,MODES.ghibli,MODES.dispatch].includes(this.pipeline.params.mode)?1:0;this.dirty=true;}
  async compareGrass(){
    if(this.comparingGrass)throw Error('Ya hay una medición activa');
    if(!this.content||!this.grass.mesh.visible||!this.grass.stats.instances)throw Error('Acércate a una superficie verde con césped visible para medir.');
    // El mismo G-buffer, cámara, tiempo y luces; solo se retira el césped en uno de los pares.
    const mesh=this.grass.mesh,visible=mesh.visible,uniform=this.pipeline.composite.uniforms.uGrassR,radius=uniform.value;
    const withGrass=[],without=[],pixel=new Uint8Array(4),gl=this.renderer.getContext();this.comparingGrass=true;
    const draw=on=>{mesh.visible=on;uniform.value=on?radius:0;this.renderer.info.reset();const t=performance.now();this.pipeline.render(this.scene,this.camera,this.sunDir.value);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return {ms:performance.now()-t,calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};};
    try{
      draw(false);draw(true); // calentar ambas variantes antes de medir
      for(let i=0;i<7;i++){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        if(i%2){withGrass.push(draw(true));without.push(draw(false));}else{without.push(draw(false));withGrass.push(draw(true));}
      }
      const middle=values=>{values.sort((a,b)=>a.ms-b.ms);const value=values[3];return {...value,fps:1000/value.ms};},a=middle(without),b=middle(withGrass);
      return {without:a,with:b,costMs:b.ms-a.ms,percent:(b.ms/a.ms-1)*100};
    }finally{mesh.visible=visible;uniform.value=radius;this.comparingGrass=false;this.dirty=true;}
  }
  // Captura a resolución dada (PNG), sin alterar la vista en pantalla.
  async capture(width){
    const w0=this.container.clientWidth,h0=this.container.clientHeight,aspect=w0/h0;
    const W=Math.round(width),H=Math.round(width/aspect);
    const target=new THREE.WebGLRenderTarget(W,H,{type:THREE.UnsignedByteType});
    const p=this.pipeline,oldScale=p.pixelScale;
    p.setSize(W,H,1);p.pixelScale=W/w0;
    this.renderFrame(target);
    const pixels=new Uint8Array(W*H*4);
    this.renderer.readRenderTargetPixels(target,0,0,W,H,pixels);
    target.dispose();
    p.size.set(0,0);p.setSize(w0,h0,this.dpr);p.pixelScale=oldScale;this.dirty=true;
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d'),img=ctx.createImageData(W,H);
    for(let y=0;y<H;y++)img.data.set(pixels.subarray((H-1-y)*W*4,(H-y)*W*4),y*W*4);
    ctx.putImageData(img,0,0);
    return new Promise(res=>canvas.toBlob(res,'image/png'));
  }
  // El entorno lejano se reutiliza: ya está colgado del grupo nuevo antes de liberar el anterior.
  setContent(group){
    if(this.content){this.scene.remove(this.content);dispose(this.content);}
    this.content=group;if(group)this.scene.add(group);
    this.grass.invalidate();
    this.needsShadow=true;this.dirty=true;
  }
}

function dispose(obj){disposeScene(obj);}
