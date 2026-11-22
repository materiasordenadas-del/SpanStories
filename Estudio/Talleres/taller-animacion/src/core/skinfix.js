// Suavizado de pesos de piel en axilas y hombros, al cargar un personaje (no toca el archivo).
//
// Los auto-rig (Mixamo y compatibles) dejan en la axila saltos bruscos entre los pesos del tronco y los
// del brazo: al subir o bajar mucho el brazo la ropa se rasga en picos o se hunde. Aquí se hace un
// suavizado laplaciano de los pesos SOLO entre huesos de tronco, clavícula y brazo, SOLO en vértices
// cerca de la articulación del hombro y SOLO en vértices que ya dependen casi por completo de esos
// huesos (el pelo, la cara o una mochila con sus propios huesos no se tocan). Las costuras UV se
// sueldan por posición para que el suavizado cruce los cortes del GLB.
import * as T from 'three';

const TORSO=['spine','chest','upperChest','neck'],ARM=['shoulder','upperArm','lowerArm'];
const smoothed=new WeakSet();
/** Pesos originales (antes de suavizar) por geometría: las medidas del cuerpo del motor de actuaciones
 *  (volumen del tronco, grosor de brazos y piernas) se toman con ellos, como siempre. */
export const ORIGINAL_SKIN=new WeakMap();
/** Ejecuta fn con los pesos originales puestos en todas las mallas del personaje y los devuelve después. */
export function withOriginalSkin(root,fn){
  const swapped=[];root.traverse(o=>{const g=o.geometry,orig=g&&ORIGINAL_SKIN.get(g);if(!orig)return;swapped.push([g,g.attributes.skinIndex,g.attributes.skinWeight]);g.attributes.skinIndex=orig.si;g.attributes.skinWeight=orig.sw;});
  try{return fn();}finally{for(const [g,si,sw] of swapped){g.attributes.skinIndex=si;g.attributes.skinWeight=sw;}}
}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

/**
 * @param {T.Object3D} root personaje cargado
 * @param {import('./rig.js').Rig} rig su esqueleto mapeado (en reposo)
 * @returns {{meshes:number,vertices:number}} cuántas mallas y vértices cambiaron
 */
export function smoothArmpitWeights(root,rig,{iterations=24,strength=.55,radius=.9,own=.9}={}){
  const report={meshes:0,vertices:0};if(!rig?.humanoid||smoothed.has(root))return report;
  smoothed.add(root);
  rig.resetToRest();root.updateMatrixWorld(true);
  const joints=[];
  for(const S of ['L','R']){
    const sh=rig.bone('upperArm'+S),el=rig.bone('lowerArm'+S);if(!sh||!el)continue;
    const a=sh.getWorldPosition(new T.Vector3()),b=el.getWorldPosition(new T.Vector3());joints.push({c:a,R:radius*a.distanceTo(b)});
  }
  if(!joints.length)return report;
  const wanted=new Set([...TORSO,...['L','R'].flatMap(S=>ARM.map(n=>n+S))].map(c=>rig.bone(c)).filter(Boolean));
  const tol=Math.max(1e-6,rig.hipsHeight*2e-4),v=new T.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||!mesh.geometry.index||!mesh.geometry.attributes.skinWeight)return;
    const g=mesh.geometry,pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,n=pos.count,bones=mesh.skeleton.bones;
    const isB=bones.map(b=>wanted.has(b));if(!isB.some(Boolean))return;
    // Región: cerca de un hombro y casi todo el peso en tronco/brazo.
    const mask=new Float32Array(n);let any=false;
    for(let i=0;i<n;i++){
      let inB=0;for(let k=0;k<4;k++)if(isB[si.getComponent(i,k)])inB+=sw.getComponent(i,k);
      if(inB<own)continue;
      v.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);
      let m=0;for(const j of joints)m=Math.max(m,1-smooth(v.distanceTo(j.c)/j.R));
      if(m>1e-3){mask[i]=m;any=true;}
    }
    if(!any)return;
    // Soldar por posición (costuras UV) y adyacencia entre grupos.
    const group=new Int32Array(n).fill(-1),keyOf=new Map();let groups=0;
    for(let i=0;i<n;i++){
      v.fromBufferAttribute(pos,i);const key=Math.round(v.x/tol)+','+Math.round(v.y/tol)+','+Math.round(v.z/tol);
      let id=keyOf.get(key);if(id===undefined){id=groups++;keyOf.set(key,id);}group[i]=id;
    }
    const nb=Array.from({length:groups},()=>new Set()),idx=g.index.array;
    for(let t=0;t<idx.length;t+=3)for(let e=0;e<3;e++){const a=group[idx[t+e]],b=group[idx[t+(e+1)%3]];if(a!==b){nb[a].add(b);nb[b].add(a);}}
    // Pesos por grupo (solo huesos B) y máscara por grupo.
    const W=Array.from({length:groups},()=>new Map()),gm=new Float32Array(groups),members=Array.from({length:groups},()=>[]);
    for(let i=0;i<n;i++){
      const id=group[i];members[id].push(i);gm[id]=Math.max(gm[id],mask[i]);
      if(members[id].length>1)continue;
      for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(w>0&&isB[b])W[id].set(b,(W[id].get(b)||0)+w);}
    }
    const active=[];for(let id=0;id<groups;id++)if(gm[id]>0)active.push(id);
    for(let it=0;it<iterations;it++){
      const next=new Map();
      for(const id of active){
        const ns=[...nb[id]].filter(o=>W[o].size);if(!ns.length)continue;
        const avg=new Map();for(const o of ns)for(const [b,w] of W[o])avg.set(b,(avg.get(b)||0)+w/ns.length);
        const a=strength*gm[id],own0=W[id],out=new Map(),total=[...own0.values()].reduce((s,w)=>s+w,0);
        for(const b of new Set([...own0.keys(),...avg.keys()]))out.set(b,(1-a)*(own0.get(b)||0)+a*(avg.get(b)||0));
        // El total de peso en tronco/brazo se conserva (el resto del vértice no cambia).
        const sum=[...out.values()].reduce((s,w)=>s+w,0)||1;for(const [b,w] of out)out.set(b,w*total/sum);
        next.set(id,out);
      }
      for(const [id,out] of next)W[id]=out;
    }
    if(!ORIGINAL_SKIN.has(g))ORIGINAL_SKIN.set(g,{si:si.clone(),sw:sw.clone()});
    // Escribir: pesos ajenos intactos + los suavizados; 4 influencias, normalizadas.
    let changed=0;
    for(const id of active)for(const i of members[id]){
      const all=new Map();for(const [b,w] of W[id])if(w>1e-4)all.set(b,w);
      for(let k=0;k<4;k++){const b=si.getComponent(i,k),w=sw.getComponent(i,k);if(w>0&&!isB[b])all.set(b,(all.get(b)||0)+w);}
      const top=[...all].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((s,x)=>s+x[1],0)||1;
      for(let k=0;k<4;k++){si.setComponent(i,k,top[k]?top[k][0]:0);sw.setComponent(i,k,top[k]?top[k][1]/sum:0);}
      changed++;
    }
    si.needsUpdate=true;sw.needsUpdate=true;report.meshes++;report.vertices+=changed;
  });
  return report;
}
