// Árboles de Barcelona (GLB originales de SpanStories) instanciados con el material del Estudio.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createGMaterial,createLeafDepthMaterial} from './gmaterial.js';

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

// Azar determinista por posición del árbol (no consume la secuencia de seedRandom).
function variation(x,z){let a=(Math.imul(Math.round(x*100),73856093)^Math.imul(Math.round(z*100),19349663))>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

// positions: [{x,y,z,model?,scale?,rot?}] -> grupo de InstancedMesh (una por parte de modelo).
export async function buildTrees(points,{sun,seedRandom=Math.random}={}){
  const models=await loadTrees();
  const group=new THREE.Group();group.name='arboles';
  const byModel=new Map(models.map(m=>[m.id,[]]));
  const totalW=models.reduce((s,m)=>s+m.weight,0);
  for(const p of points){
    let id=p.model;
    if(!id){let x=seedRandom()*totalW;for(const m of models){x-=m.weight;if(x<=0){id=m.id;break;}}id??=models[0].id;}
    byModel.get(id)?.push(p);
  }
  const mtx=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),pos=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),tilt=new THREE.Quaternion(),axis=new THREE.Vector3();
  for(const m of models){
    const list=byModel.get(m.id);if(!list.length)continue;
    // Una transformación por árbol (igual para tronco y copa): altura y giro como antes; además ancho de copa
    // propio, ligera inclinación y tono, con un azar por posición que no altera la secuencia anterior.
    const looks=list.map(p=>{
      const h=p.height??(m.height[0]+(m.height[1]-m.height[0])*((p.k??seedRandom())));
      const k=h/m.nativeHeight*(p.scale??1),yaw=p.rot??seedRandom()*Math.PI*2,v=variation(p.x,p.z);
      const lean=v()*.07,dir=v()*Math.PI*2;axis.set(Math.cos(dir),0,Math.sin(dir));
      const rot=new THREE.Quaternion().setFromAxisAngle(up,yaw).premultiply(tilt.setFromAxisAngle(axis,lean));
      return {rot,sx:k*(.86+.28*v()),sy:k,sz:k*(.86+.28*v()),shade:.93+.14*v(),warm:.97+.06*v()};
    });
    for(const part of m.parts){
      // 24 identifica troncos/ramas en el pase visual, sin cambiar la geometría ni su albedo.
      const mat=createGMaterial({map:part.map,alphaTest:part.leaf?.45:0,doubleSided:part.leaf,foliage:part.leaf,crown:part.crown,sun,instanceTint:false,surf:part.leaf?2:24});
      mat.uniforms.uMeshId.value=.37+models.indexOf(m)*.11;
      // tono base del material GLB
      const im=new THREE.InstancedMesh(part.geometry,mat,list.length);
      list.forEach((p,i)=>{
        const L=looks[i];q.copy(L.rot);s.set(L.sx,L.sy,L.sz);pos.set(p.x,p.y,p.z);
        mtx.compose(pos,q,s);im.setMatrixAt(i,mtx);
        const tint=part.color.clone().multiplyScalar(p.tint??1);
        if(part.leaf){tint.r*=L.shade*L.warm;tint.g*=L.shade;tint.b*=L.shade*(2-L.warm);}
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
  return group;
}
