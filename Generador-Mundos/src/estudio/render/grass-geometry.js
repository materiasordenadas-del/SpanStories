import * as THREE from 'three';
import {seededGrass} from './grass-config.js';

// Adaptación directa de generateBlade() de James Smyth (MIT, 2020–2021).
// Mantiene sus 5 vértices y 3 triángulos: base, media anchura a mitad, punta curvada.
// position.xz es local de la hoja (unidades de anchura / desplazamiento de punta);
// aOffset separa las hojas de la mata en metros, como hojas sueltas de la web.
export function jamesBladeGeometry(blades=3,lod=0){
  const pos=[],idx=[],blade=[],offset=[],r=seededGrass(2021);
  for(let b=0;b<(lod?1:blades);b++){
    const yaw=r()*Math.PI*2,tipBend=r()*Math.PI*2;
    const x=lod?0:(r()-.5)*.12,z=lod?0:(r()-.5)*.12;
    const dx=Math.sin(yaw),dz=-Math.cos(yaw),tx=Math.sin(tipBend),tz=-Math.cos(tipBend),base=pos.length/3;
    const push=(w,t)=>{pos.push(t===1?tx:dx*w,t,t===1?tz:dz*w);blade.push(b);offset.push(x,z);};
    if(lod){push(.5,0);push(-.5,0);push(0,1);idx.push(base,base+1,base+2);}
    else {push(.5,0);push(-.5,0);push(-.25,.5);push(.25,.5);push(0,1);idx.push(base,base+1,base+2,base+2,base+4,base+3,base+3,base,base+2);}
  }
  const g=new THREE.InstancedBufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aBlade',new THREE.Float32BufferAttribute(blade,1));g.setAttribute('aOffset',new THREE.Float32BufferAttribute(offset,2));g.setIndex(idx);g.instanceCount=0;
  return g;
}
