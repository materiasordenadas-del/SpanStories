import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Un muro, varias piezas físicas: no se coloca una pared detrás de una puerta.
export function crearMuroConHuecos({ancho,alto,fondo=.2,color=C.ivory,huecos=[]}) {
  const root=new T.Group(),start=-ancho/2,end=ancho/2;
  const openings=huecos.map(h=>({min:h.x-h.ancho/2,max:h.x+h.ancho/2,base:h.base||0,alto:h.alto}));
  const segment=(a,b,y,h,name)=>{if(b-a>1e-6&&h>1e-6)caja(root,name,b-a,h,fondo,color,(a+b)/2,y+h/2,0,false);};
  for(const [i,h] of openings.entries()) {
    if(h.min<start-1e-6||h.max>end+1e-6||h.min>=h.max||h.base<0||h.alto<=0||h.base+h.alto>alto)throw new Error('Hueco fuera del muro');
    for(const previous of openings.slice(0,i))if(h.min<previous.max&&h.max>previous.min&&h.base<previous.base+previous.alto&&h.base+h.alto>previous.base)throw new Error('Huecos superpuestos');
  }
  const columns=[...new Set([start,end,...openings.flatMap(h=>[h.min,h.max])])].sort((a,b)=>a-b);
  for(let i=0;i<columns.length-1;i++){
    const a=columns[i],b=columns[i+1],middle=(a+b)/2;
    const vertical=openings.filter(h=>h.min<middle&&h.max>middle).sort((u,v)=>u.base-v.base);
    let cursor=0;
    for(const [j,h] of vertical.entries()){segment(a,b,cursor,h.base-cursor,'paño-'+i+'-'+j);cursor=h.base+h.alto;}
    segment(a,b,cursor,alto-cursor,'paño-'+i+'-final');
  }
  root.userData.huecos=structuredClone(huecos);
  return root;
}
