// LOD por distancia de las piezas más repetidas (ventanas y balcones): cerca la pieza completa,
// lejos la versión ligera. Las sombras de los balcones salen de una capa solo-sombra fija
// (capa 2, solo la ve la cámara de la sombra), así cambiar el LOD no obliga a rehacer el mapa de sombras.
import * as THREE from 'three';
import {elementGeometry} from '../arq/elements.js';
import {PROXY} from '../arq/proxies.js';

export const SHADOW_LAYER=2;

function withTint2(base,n,data=null){
  const g=new THREE.BufferGeometry();
  for(const [name,attr]of Object.entries(base.attributes))g.setAttribute(name,attr.clone());
  if(base.index)g.setIndex(base.index.clone());
  g.setAttribute('aTint2',new THREE.InstancedBufferAttribute(data??new Float32Array(n*3),3));
  g.userData.key=base.userData.key;g.boundingBox=base.boundingBox;
  return g;
}

export class ElementLOD{
  constructor(group,{near=95}={}){
    this.near=near;this.entries=[];this.last=new THREE.Vector3(1e9,0,0);this.lastT=0;
    for(const im of [...group.children]){
      const type=PROXY[im.userData.type];if(!type||!im.isInstancedMesh)continue;
      const n=im.count;
      const all={m:im.instanceMatrix.array.slice(),c1:im.instanceColor.array.slice(),c2:im.geometry.attributes.aTint2.array.slice(),owners:im.userData.buildings?.slice()};
      const pbase=elementGeometry(type,im.userData.params);
      const proxy=new THREE.InstancedMesh(withTint2(pbase,n),im.material,n);
      proxy.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);
      proxy.name=im.name+':lejos';proxy.userData={kind:'element-proxy',type:im.userData.type,buildings:[]};
      proxy.receiveShadow=true;proxy.castShadow=false;proxy.count=0;
      proxy.boundingSphere=im.boundingSphere.clone();
      group.add(proxy);
      if(im.castShadow){
        const sh=new THREE.InstancedMesh(withTint2(pbase,n,all.c2.slice()),im.material,n);
        sh.instanceMatrix.array.set(all.m);sh.instanceColor=new THREE.InstancedBufferAttribute(all.c1.slice(),3);
        sh.layers.set(SHADOW_LAYER);sh.castShadow=true;sh.receiveShadow=false;sh.name=im.name+':sombra';
        sh.boundingSphere=im.boundingSphere.clone();
        group.add(sh);im.castShadow=false;
      }
      const pos=new Float32Array(n*3);for(let i=0;i<n;i++){pos[i*3]=all.m[i*16+12];pos[i*3+1]=all.m[i*16+13];pos[i*3+2]=all.m[i*16+14];}
      this.entries.push({im,proxy,all,pos,n});
    }
  }
  update(cam,force=false){
    const now=performance.now();
    if(!force&&cam.distanceToSquared(this.last)<9)return false;
    if(!force&&now-this.lastT<220){this.pending=true;return false;}
    this.pending=false;
    this.lastT=now;this.last.copy(cam);
    const r2=this.near*this.near,cx=cam.x,cy=cam.y,cz=cam.z;
    for(const e of this.entries){
      const {im,proxy,all,pos,n}=e;
      const nm=im.instanceMatrix.array,nc=im.instanceColor.array,nt=im.geometry.attributes.aTint2.array;
      const fm=proxy.instanceMatrix.array,fc=proxy.instanceColor.array,ft=proxy.geometry.attributes.aTint2.array;
      let a=0,b=0;
      for(let i=0;i<n;i++){
        const dx=pos[i*3]-cx,dy=pos[i*3+1]-cy,dz=pos[i*3+2]-cz;
        if(dx*dx+dy*dy+dz*dz<r2){
          if(all.owners)im.userData.buildings[a]=all.owners[i];
          for(let k=0;k<16;k++)nm[a*16+k]=all.m[i*16+k];
          for(let k=0;k<3;k++){nc[a*3+k]=all.c1[i*3+k];nt[a*3+k]=all.c2[i*3+k];}a++;
        }else{
          if(all.owners)proxy.userData.buildings[b]=all.owners[i];
          for(let k=0;k<16;k++)fm[b*16+k]=all.m[i*16+k];
          for(let k=0;k<3;k++){fc[b*3+k]=all.c1[i*3+k];ft[b*3+k]=all.c2[i*3+k];}b++;
        }
      }
      im.count=a;proxy.count=b;
      if(all.owners){im.userData.buildings.length=a;proxy.userData.buildings.length=b;}
      im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;im.geometry.attributes.aTint2.needsUpdate=true;
      proxy.instanceMatrix.needsUpdate=true;proxy.instanceColor.needsUpdate=true;proxy.geometry.attributes.aTint2.needsUpdate=true;
    }
    return true;
  }
  // Exportación o captura sin LOD: todo en detalle.
  full(){const big=new THREE.Vector3(0,0,0);const n=this.near;this.near=1e7;this.update(big,true);this.near=n;}
}
