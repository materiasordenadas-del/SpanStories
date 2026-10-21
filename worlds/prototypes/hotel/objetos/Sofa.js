import * as T from '../engine/three.js';
import { caja,pieza,cilindro } from './Piezas.js';
import { volumenRedondeado } from './Formas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearSofa({ancho=2.4,color=C.green}={}) {
  const r=new T.Group();pieza(r,'base',volumenRedondeado(ancho,.25,.88),C.darkWood,[0,.22,0]);
  pieza(r,'respaldo',volumenRedondeado(ancho,.66,.23,.09),color,[0,.61,-.38]);
  for(const x of [-1,1]) pieza(r,'brazo-'+x,volumenRedondeado(.22,.48,.92,.08),color,[x*(ancho/2-.11),.47,0]);
  for(let i=0;i<3;i++)pieza(r,'cojín-'+i,volumenRedondeado((ancho-.4)/3-.02,.18,.7,.05),color,[(i-1)*(ancho-.4)/3,.45,.04]);
  for(const x of [-1,1]){const pillow=pieza(r,'almohadón-'+x,volumenRedondeado(.38,.32,.12,.06),C.peach,[x*(ancho/2-.37),.7,-.16]);pillow.rotation.z=x*.15;}
  for(const x of [-1,1]) for(const z of [-1,1]) caja(r,'pata-'+x+z,.07,.14,.07,C.gold,x*(ancho/2-.2),.07,z*.32);
  return r;
}
