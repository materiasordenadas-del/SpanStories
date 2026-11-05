// Árboles de Barcelona (GLB originales de SpanStories) instanciados con el material del Estudio.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createGMaterial,createLeafDepthMaterial} from './gmaterial.js';
import {speciesGeometry,DOUBLE_SIDED,VARIANTS,PROCEDURAL_SPECIES} from './tree-species.js';
import {SHADOW_LAYER} from './lod.js';

export const TREE_MODELS=[
  {id:'anime',file:'anime_nature_tree_01.glb',height:[7,10],weight:.35},
  {id:'anime2',file:'anime_tree_2.glb',height:[6,9],weight:.3},
  {id:'jabami',file:'jabami_anime_tree_v1.glb',height:[8,12],weight:.25},
  {id:'sakura',file:'sakura_tree_01.glb',height:[5,7.5],weight:.1},
];

let loaded=null;
export function loadTrees(base='/assets/barcelona-trees/'){
  if(loaded)return loaded;
  const loader=new GLTFLoader();
  loaded=Promise.all(TREE_MODELS.map(async m=>{
    const gltf=await loader.loadAsync(base+m.file);
    gltf.scene.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());
    const parts=[];
    gltf.scene.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
      // base en el suelo y centrado en XZ
      g.translate(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
      const src=Array.isArray(o.material)?o.material[0]:o.material;
      const leaf=src.transparent||src.alphaTest>0||/leav|leaf|hoja|sakura|follaje/i.test(src.name)||src.alphaMode==='BLEND';
      if(src.map)src.map.colorSpace=THREE.SRGBColorSpace;
      // color por vértice blanco (el material multiplica)
      const n=g.attributes.position.count;
      g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3).fill(1),3));
      g.setAttribute('aSurf',new THREE.Float32BufferAttribute(new Float32Array(n).fill(leaf?2:0),1));
      g.setAttribute('aId',new THREE.Float32BufferAttribute(new Float32Array(n).fill(0),1));
      const base=src.color?src.color.clone():new THREE.Color(1,1,1);
      g.userData.key='arbol:'+m.id+':'+parts.length;
      g.userData.libraryOwned=true;
      // Elipsoide de la copa (caja de las hojas) para el sombreado por volumen.
      g.computeBoundingBox();
      const crown=leaf?{center:g.boundingBox.getCenter(new THREE.Vector3()),radius:g.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5)}:null;
      parts.push({geometry:g,map:src.map??null,leaf,color:base,name:src.name,crown});
    });
    return {...m,parts,nativeHeight:size.y};
  }));
  return loaded;
}

// positions: [{x,y,z,model?,species?,scale?,rot?}] -> grupo de InstancedMesh.
// Sin especie: árboles GLB del visor (comportamiento anterior). «frondoso» y «sakura» también son GLB;
// el resto son especies procedurales por clima (tree-species.js), con LOD por distancia.
const GLB_FRONDOSO=['anime','anime2','jabami'];
export async function buildTrees(points,{sun,seedRandom=Math.random,leafTint=null,near=75}={}){
  const group=new THREE.Group();group.name='arboles';
  const glbPoints=points.filter(p=>!p.species||p.species==='frondoso'||p.species==='sakura');
  const procedural=points.filter(p=>p.species&&PROCEDURAL_SPECIES.includes(p.species));
  if(glbPoints.length)await addGLBTrees(group,glbPoints,{sun,seedRandom,leafTint});
  const lod=procedural.length?addProceduralTrees(group,procedural,{sun,seedRandom,near}):null;
  group.userData.treeLOD=lod;
  return group;
}

async function addGLBTrees(group,points,{sun,seedRandom,leafTint}){
  const models=await loadTrees();
  const byModel=new Map(models.map(m=>[m.id,[]]));
  const totalW=models.reduce((s,m)=>s+m.weight,0),frondoso=models.filter(m=>GLB_FRONDOSO.includes(m.id)),frondW=frondoso.reduce((s,m)=>s+m.weight,0);
  for(const p of points){
    let id=p.model;
    if(!id&&p.species==='sakura')id='sakura';
    else if(!id&&p.species==='frondoso'){let x=seedRandom()*frondW;for(const m of frondoso){x-=m.weight;if(x<=0){id=m.id;break;}}id??=frondoso[0].id;}
    else if(!id){let x=seedRandom()*totalW;for(const m of models){x-=m.weight;if(x<=0){id=m.id;break;}}id??=models[0].id;}
    byModel.get(id)?.push(p);
  }
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),pos=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  const leafColor=leafTint?new THREE.Color(...leafTint):null;
  for(const m of models){
    const list=byModel.get(m.id);if(!list.length)continue;
    for(const part of m.parts){
      // 24 identifica troncos/ramas en el pase visual, sin cambiar la geometría ni su albedo.
      const mat=createGMaterial({map:part.map,alphaTest:part.leaf?.45:0,doubleSided:part.leaf,foliage:part.leaf,crown:part.crown,sun,instanceTint:false,surf:part.leaf?2:24});
      mat.uniforms.uMeshId.value=.37+models.indexOf(m)*.11;
      // tono base del material GLB
      const im=new THREE.InstancedMesh(part.geometry,mat,list.length);
      list.forEach((p,i)=>{
        const h=p.height??(m.height[0]+(m.height[1]-m.height[0])*((p.k??seedRandom())));
        const k=h/m.nativeHeight*(p.scale??1);
        q.setFromAxisAngle(up,p.rot??seedRandom()*Math.PI*2);s.set(k,k,k);pos.set(p.x,p.y,p.z);
        mtx.compose(pos,q,s);im.setMatrixAt(i,mtx);
        const tint=part.color.clone().multiplyScalar(p.tint??1);
        if(part.leaf&&leafColor)tint.multiply(leafColor);
        im.setColorAt(i,tint);
      });
      im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;
      im.castShadow=true;im.receiveShadow=true;
      if(part.map&&part.leaf)im.customDepthMaterial=createLeafDepthMaterial(part.map,.45);
      im.name='arbol:'+m.id+':'+part.name;im.userData={kind:'tree',model:m.id};
      im.computeBoundingSphere();
      group.add(im);
    }
  }
}

// Especies procedurales: una malla por especie y variante (tronco y copa juntos), versión lejana y una
// capa solo-sombra fija con la geometría ligera (cambiar el LOD no obliga a rehacer el mapa de sombras).
function addProceduralTrees(group,points,{sun,seedRandom,near}){
  const buckets=new Map();
  for(const p of points){const v=p.variant??Math.floor(seedRandom()*VARIANTS)%VARIANTS,key=p.species+':'+v;(buckets.get(key)??buckets.set(key,[]).get(key)).push(p);}
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),pos=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),col=new THREE.Color();
  const lod=new TreeLOD(near);
  let index=0;
  for(const [key,list]of buckets){
    const [id,variant]=key.split(':'),hi=speciesGeometry(id,+variant,0),lo=speciesGeometry(id,+variant,1);
    const mat=createGMaterial({foliage:true,crown:hi.crown,doubleSided:DOUBLE_SIDED.has(id),sun,surf:-1});mat.uniforms.uMeshId.value=(.21+index++*.0617)%1;
    const n=list.length,M=new Float32Array(n*16),Cc=new Float32Array(n*3),P=new Float32Array(n*3);
    list.forEach((p,i)=>{
      const k=(p.scale??1)*(.86+.28*(p.k??seedRandom()));
      q.setFromAxisAngle(up,p.rot??seedRandom()*Math.PI*2);s.set(k,k*(.94+.12*seedRandom()),k);pos.set(p.x,p.y,p.z);
      mtx.compose(pos,q,s);mtx.toArray(M,i*16);
      const b=.9+.2*seedRandom();col.setRGB(b*(.97+.06*seedRandom()),b,b*(.97+.06*seedRandom()));col.toArray(Cc,i*3);
      P[i*3]=p.x;P[i*3+1]=p.y;P[i*3+2]=p.z;
    });
    const make=(geometry,name,kind)=>{const im=new THREE.InstancedMesh(geometry,mat,n);im.instanceMatrix.array.set(M);im.instanceColor=new THREE.InstancedBufferAttribute(Cc.slice(),3);
      im.name=name;im.userData={kind,species:id,variant:+variant};im.receiveShadow=true;im.castShadow=false;im.computeBoundingSphere();group.add(im);return im;};
    const nearMesh=make(hi.geometry,'arbol:'+key,'tree'),farMesh=make(lo.geometry,'arbol:'+key+':lejos','tree-far');farMesh.count=0;
    const shadow=make(lo.geometry,'arbol:'+key+':sombra','tree-shadow');shadow.layers.set(SHADOW_LAYER);shadow.castShadow=true;shadow.receiveShadow=false;
    lod.add(nearMesh,farMesh,M,Cc,P);
  }
  return lod;
}

// LOD de árboles: cerca la especie completa, lejos su versión ligera (mismas posiciones y tintes).
export class TreeLOD{
  constructor(near=75){this.near=near;this.entries=[];this.last=new THREE.Vector3(1e9,0,0);this.lastT=0;this.pending=false;}
  add(nearMesh,farMesh,M,C,P){this.entries.push({nearMesh,farMesh,M,C,P,n:P.length/3});}
  update(cam,force=false){
    const now=performance.now();
    if(!force&&cam.distanceToSquared(this.last)<9)return false;
    if(!force&&now-this.lastT<220){this.pending=true;return false;}
    this.pending=false;this.lastT=now;this.last.copy(cam);
    const r2=this.near*this.near;
    for(const e of this.entries){
      const nm=e.nearMesh.instanceMatrix.array,nc=e.nearMesh.instanceColor.array,fm=e.farMesh.instanceMatrix.array,fc=e.farMesh.instanceColor.array;let a=0,b=0;
      for(let i=0;i<e.n;i++){const dx=e.P[i*3]-cam.x,dy=e.P[i*3+1]-cam.y,dz=e.P[i*3+2]-cam.z,close=dx*dx+dy*dy+dz*dz<r2;
        const m=close?nm:fm,c=close?nc:fc,j=close?a++:b++;
        for(let k=0;k<16;k++)m[j*16+k]=e.M[i*16+k];for(let k=0;k<3;k++)c[j*3+k]=e.C[i*3+k];}
      e.nearMesh.count=a;e.farMesh.count=b;
      for(const im of [e.nearMesh,e.farMesh]){im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;}
    }
    return true;
  }
  // Exportación o captura sin LOD: todo en detalle.
  full(){const n=this.near;this.near=1e7;this.update(new THREE.Vector3(),true);this.near=n;}
}
