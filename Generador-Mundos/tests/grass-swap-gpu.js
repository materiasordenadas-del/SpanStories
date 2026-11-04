// Verificación manual GPU: recibe el shader anterior, sin mantener otra versión del visor.
export async function verifyGrassSwap(beforeShader,scenario='grass'){
  const THREE=await import('three');
  const {Pipeline}=await import('../src/estudio/render/pipeline.js');
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(8,8);
  const old=new Pipeline(renderer),current=new Pipeline(renderer);
  old.composite.fragmentShader=beforeShader;
  old.disposeGhibliClouds=current.disposeGhibliClouds=()=>{};
  const camera=new THREE.PerspectiveCamera(50,1,.5,9000);camera.position.set(0,2,0);camera.updateMatrixWorld();
  const sun=new THREE.Vector3(-.5,.7,.4).normalize();
  const texture=(rgba)=>{const data=new Float32Array(8*8*4);for(let i=0;i<data.length;i+=4)data.set(rgba,i);const t=new THREE.DataTexture(data,8,8,THREE.RGBAFormat,THREE.FloatType);t.needsUpdate=true;return t;};
  const albedo=texture([.2,.4,.1,8/31]),normal=texture([0,1,0,20]),light=texture([.25,.4,.8,0]),ao=texture([1,1,1,1]),grass=texture([.45,.65,.2,1]);
  const target=new THREE.WebGLRenderTarget(8,8),a=new Uint8Array(256),b=new Uint8Array(256);
  let comparisons=0,maxDifference=0,grassComparisons=0,treeComparisons=0;const failures=[];
  const draw=(p,mode,ambient,surf,depth,blend,pixels)=>{
    p.params.mode=mode;p.setAmbient(ambient);p.updateUniforms(camera,sun);
    const u=p.composite.uniforms;
    for(const [name,t]of Object.entries({tAlbedo:albedo,tNormal:normal,tLight:light,tAO:ao,uGrassTexture:grass,uJamesGrass:grass,uJamesCloud:grass,uGNubes:grass,uGNubesCompactas:grass,uGNubesAlargadas:grass}))u[name].value=t;
    u.uTime.value=42;u.uGrassBlend.value=blend;u.uGrassR.value=20;u.uTexel.value.set(1/8,1/8);
    p.quad.material=p.composite;renderer.setRenderTarget(target);renderer.render(p.quadScene,p.quadCam);renderer.readRenderTargetPixels(target,0,0,8,8,pixels);
  };
  try{
    for(const ambient of ['manana','mediodia','tarde','nublado','noche'])for(const surf of (scenario==='trees'?[0,2,3,8,10,23,24]:[0,2,3,8,10,23]))for(const mode of [0,6,7])for(const depth of [20,2500])for(const blend of [0,.5,1]){
      for(let i=0;i<albedo.image.data.length;i+=4){albedo.image.data[i+3]=surf/31;normal.image.data[i+3]=surf===0?0:depth;}
      albedo.needsUpdate=normal.needsUpdate=true;
      const isGrass=surf===8||surf===23,isTree=surf===2||surf===24;
      const donor=scenario==='trees'?(isTree&&mode===7?6:mode):(isGrass?(mode===6?7:mode===7?6:mode):mode);
      if(surf===24){for(let i=3;i<albedo.image.data.length;i+=4)albedo.image.data[i]=0;albedo.needsUpdate=true;}
      draw(old,donor,ambient,surf,depth,blend,a);
      if(surf===24){for(let i=3;i<albedo.image.data.length;i+=4)albedo.image.data[i]=24/31;albedo.needsUpdate=true;}
      draw(current,mode,ambient,surf,depth,blend,b);
      let diff=0;for(let i=0;i<a.length;i++)diff=Math.max(diff,Math.abs(a[i]-b[i]));
      comparisons++;if(isGrass)grassComparisons++;if(isTree)treeComparisons++;maxDifference=Math.max(maxDifference,diff);
      if(diff&&failures.length<8)failures.push({ambient,surf,mode,depth,blend,difference:diff});
    }
    return {comparisons,grassComparisons,treeComparisons,maxDifference,failures};
  }finally{old.dispose();current.dispose();target.dispose();for(const t of [albedo,normal,light,ao,grass])t.dispose();renderer.dispose();}
}
