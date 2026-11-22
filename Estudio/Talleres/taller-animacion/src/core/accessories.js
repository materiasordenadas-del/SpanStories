// Accesorios que el personaje lleva encima (mochila, capa rígida, carcaj, estuche…) y pelo que no los atraviesa.
//
// Detección general, sin nombres: un accesorio es una isla de malla (costuras soldadas) con muchos
// vértices, rígida (≥ 98 % del peso en UN hueso del tronco) y que sobresale por detrás del tronco.
// Cada accesorio se aproxima con una caja redondeada fijada a su hueso.
//
// El pelo largo de estos rigs va rígido a la cabeza: al inclinarla se mete dentro del accesorio. En el
// sombreador de las mallas con pelo (vértices de cabeza/cuello por debajo del cuello) cada vértice que
// entra en la caja (más un margen) sale por la cara más cercana, en cada fotograma y sin coste de CPU.
import * as T from 'three';

const TORSO=['hips','spine','chest','upperChest'],MAX=4,installed=new WeakMap();

/**
 * Accesorios rígidos del tronco que van a la espalda. Islas rígidas claramente detrás del tronco
 * (un tirante que pasa al pecho no cuenta), agrupadas por solape aunque estén en mallas distintas.
 * Devuelve [{bone, box:Matrix4 (local del hueso), half:Vector3, radius, count}].
 */
export function findAccessories(root,rig,{minVertices=150,minIsland=12,rigid=.98,behind=.06}={}){
  const parts=[];if(!rig?.humanoid)return [];
  rig.resetToRest();root.updateMatrixWorld(true);
  const torso=new Set(TORSO.map(c=>rig.bone(c)).filter(Boolean)),h=rig.hipsHeight,tol=h*2e-4,v=new T.Vector3();
  const fwd=rig.frame.fwd.clone().normalize(),up=rig.frame.up.clone().normalize(),left=new T.Vector3().crossVectors(up,fwd).normalize();
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.geometry.index||!mesh.geometry.attributes.skinWeight)return;
    const g=mesh.geometry,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,n=pos.count,bones=mesh.skeleton.bones;
    // Hueso rígido por vértice (o -1).
    const owner=new Int32Array(n).fill(-1);
    for(let i=0;i<n;i++){let j=0;for(let k=1;k<4;k++)if(sw.getComponent(i,k)>sw.getComponent(i,j))j=k;if(sw.getComponent(i,j)>=rigid&&torso.has(bones[si.getComponent(i,j)]))owner[i]=si.getComponent(i,j);}
    // Islas por adyacencia, soldando costuras por posición.
    const parent=new Int32Array(n).map((_,i)=>i),find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
    const seen=new Map();for(let i=0;i<n;i++){v.fromBufferAttribute(pos,i);const k=Math.round(v.x/tol)+','+Math.round(v.y/tol)+','+Math.round(v.z/tol),o=seen.get(k);if(o===undefined)seen.set(k,i);else join(i,o);}
    const idx=g.index.array;for(let t=0;t<idx.length;t+=3){join(idx[t],idx[t+1]);join(idx[t+1],idx[t+2]);}
    const islands=new Map();for(let i=0;i<n;i++){const r=find(i);(islands.get(r)||islands.set(r,[]).get(r)).push(i);}
    for(const list of islands.values()){
      if(list.length<minIsland)continue;
      const b0=owner[list[0]];if(b0<0||list.some(i=>owner[i]!==b0))continue;
      const bone=bones[b0],origin=bone.getWorldPosition(new T.Vector3());
      // Caja en los ejes del personaje (lado, arriba, delante), en pose de enlace, relativa al hueso.
      const lo=new T.Vector3(Infinity,Infinity,Infinity),hi=lo.clone().negate();
      for(const i of list){v.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld).sub(origin);lo.min(new T.Vector3(v.dot(left),v.dot(up),v.dot(fwd)));hi.max(new T.Vector3(v.dot(left),v.dot(up),v.dot(fwd)));}
      // Claramente a la espalda: su centro queda detrás del hueso.
      if((lo.z+hi.z)/2>-behind*h)continue;
      parts.push({bone,origin,lo,hi,count:list.length});
    }
  });
  // Agrupar piezas del mismo hueso que se tocan (bolsillo, fondo, panel trasero…).
  const gap=.02*h,touch=(a,b)=>a.bone===b.bone&&['x','y','z'].every(k=>a.lo[k]-gap<=b.hi[k]&&b.lo[k]-gap<=a.hi[k]);
  const groups=[];
  for(const p of parts){
    const hit=groups.filter(g=>touch(g,p));
    const merged=hit.reduce((g,o)=>({bone:g.bone,origin:g.origin,lo:g.lo.clone().min(o.lo),hi:g.hi.clone().max(o.hi),count:g.count+o.count}),{...p,lo:p.lo.clone(),hi:p.hi.clone()});
    for(const o of hit)groups.splice(groups.indexOf(o),1);groups.push(merged);
  }
  const volume=g=>(g.hi.x-g.lo.x)*(g.hi.y-g.lo.y)*(g.hi.z-g.lo.z);
  return groups.filter(g=>g.count>=minVertices).sort((a,b)=>volume(b)-volume(a)).slice(0,MAX).map(g=>{
    const half=g.hi.clone().sub(g.lo).multiplyScalar(.5),center=g.lo.clone().add(g.hi).multiplyScalar(.5);
    const centerW=g.origin.clone().addScaledVector(left,center.x).addScaledVector(up,center.y).addScaledVector(fwd,center.z);
    const boxW=new T.Matrix4().makeBasis(left,up,fwd).setPosition(centerW);
    return {bone:g.bone,box:g.bone.matrixWorld.clone().invert().multiply(boxW),half,radius:.3*Math.min(half.x,half.y,half.z),count:g.count,lo:g.lo,hi:g.hi};
  });
}

/** Mallas con pelo largo: vértices de la cabeza (o sus huesos faciales) y del cuello por debajo del cuello. */
function hairMeshes(root,rig,accessories){
  const head=rig.bone('head'),neck=rig.bone('neck'),yNeck=neck?.getWorldPosition(new T.Vector3()).dot(rig.frame.up)??Infinity,v=new T.Vector3(),out=[];
  if(!head)return out;
  const headish=new Set([neck].filter(Boolean));head.traverse(b=>{if(b.isBone)headish.add(b);});
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.geometry.attributes.skinWeight)return;
    const g=mesh.geometry,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,isH=mesh.skeleton.bones.map(b=>headish.has(b));if(!isH.some(Boolean))return;
    const w=new Float32Array(pos.count);let long=0;
    for(let i=0;i<pos.count;i++){for(let k=0;k<4;k++)if(isH[si.getComponent(i,k)])w[i]+=sw.getComponent(i,k);if(w[i]>=.5&&long<50){v.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);if(v.dot(rig.frame.up)<yNeck)long++;}}
    if(long>=50){g.setAttribute('accHead',new T.BufferAttribute(w,1));out.push({mesh});}
  });
  return out;
}

/**
 * Detecta accesorios y prepara el pelo para no atravesarlos. Devuelve {accessories, hair, dispose}.
 * `margin`: separación entre pelo y accesorio, en fracciones de la altura de cadera.
 */
export function installAccessoryCollisions(root,rig,{margin=.012}={}){
  if(installed.has(root))return installed.get(root);
  const accessories=findAccessories(root,rig),hair=accessories.length?hairMeshes(root,rig,accessories):[];
  const uniforms={accN:{value:accessories.length},accMat:{value:Array.from({length:MAX},()=>new T.Matrix4())},accInv:{value:Array.from({length:MAX},()=>new T.Matrix4())},accHalf:{value:Array.from({length:MAX},()=>new T.Vector3())},accRad:{value:new Array(MAX).fill(0)},accMargin:{value:margin*rig.hipsHeight}};
  accessories.forEach((a,i)=>{uniforms.accHalf.value[i].copy(a.half);uniforms.accRad.value[i]=a.radius;});
  const update=()=>{accessories.forEach((a,i)=>{uniforms.accMat.value[i].multiplyMatrices(a.bone.matrixWorld,a.box);uniforms.accInv.value[i].copy(uniforms.accMat.value[i]).invert();});};
  const restore=[];
  for(const {mesh} of hair){
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],patched=materials.map(m=>{
      const c=m.clone(),prev=m.onBeforeCompile;
      c.onBeforeCompile=(shader,renderer)=>{
        prev?.call(c,shader,renderer);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform int accN;uniform mat4 accMat[${MAX}];uniform mat4 accInv[${MAX}];uniform vec3 accHalf[${MAX}];uniform float accRad[${MAX}];uniform float accMargin;attribute float accHead;`)
          .replace('#include <skinning_vertex>',`#include <skinning_vertex>
#ifdef USE_SKINNING
{ float hw=accHead;
  if(hw>.2){
    vec4 wp=modelMatrix*vec4(transformed,1.);
    for(int i=0;i<${MAX};i++){
      if(i>=accN)break;
      vec3 q=(accInv[i]*wp).xyz,core=accHalf[i]-vec3(accRad[i]),d=abs(q)-core;
      float sd=length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.)-accRad[i];
      if(sd<accMargin){
        vec3 dp=max(d,0.);vec3 n=length(dp)>1e-6?sign(q)*dp/length(dp):(d.x>d.y&&d.x>d.z?vec3(sign(q.x),0.,0.):(d.y>d.z?vec3(0.,sign(q.y),0.):vec3(0.,0.,sign(q.z))));
        q+=n*(accMargin-sd)*smoothstep(.2,.6,hw);wp=accMat[i]*vec4(q,1.);
      }
    }
    transformed=(inverse(modelMatrix)*wp).xyz;
  }
}
#endif`);
      };
      c.customProgramCacheKey=()=>(m.customProgramCacheKey?.()||'')+'|acc'+MAX;
      return c;
    });
    restore.push([mesh,mesh.material]);mesh.material=Array.isArray(mesh.material)?patched:patched[0];
    const before=mesh.onBeforeRender;mesh.onBeforeRender=function(...args){update();return before?.apply(this,args);};
  }
  const result={accessories,hair:hair.map(x=>x.mesh),update,dispose(){for(const [mesh,material] of restore){mesh.material=material;mesh.geometry.deleteAttribute('accHead');}installed.delete(root);}};
  installed.set(root,result);return result;
}
