import * as T from '../engine/three.js';
import { crearPisoHotel } from './Arquitectura.js';
import { aplicarPiso } from './AcabadosLujo.js';

export function crearPisoConHuecos({ancho,fondo,huecos=[]}={}){
  const root=new T.Group();root.userData.huecos=structuredClone(huecos);root.userData.reflexiones=[];
  const xs=[...new Set([-ancho/2,ancho/2,...huecos.flatMap(h=>[h.minX,h.maxX])])].sort((a,b)=>a-b);
  const zs=[...new Set([-fondo/2,fondo/2,...huecos.flatMap(h=>[h.minZ,h.maxZ])])].sort((a,b)=>a-b);
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
    const cx=(xs[i]+xs[i+1])/2,cz=(zs[j]+zs[j+1])/2;
    if(huecos.some(h=>cx>h.minX&&cx<h.maxX&&cz>h.minZ&&cz<h.maxZ))continue;
    const w=xs[i+1]-xs[i],d=zs[j+1]-zs[j],slab=crearPisoHotel({ancho:w,fondo:d});slab.position.set(cx,0,cz);root.add(slab);
    if(typeof document!=='undefined'){
      const reflection=aplicarPiso(slab,{ancho:w,fondo:d});if(reflection){reflection.userData.reflejoSuperficie=true;root.userData.reflexiones.push(reflection);}
    }
  }
  return root;
}
