import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

export function crearBaranda({ancho=6,alto=1.12}={}) {
  const root=new T.Group();
  caja(root,'pasamanos',ancho,.09,.12,C.darkWood,0,alto-.045,0,false);
  caja(root,'travesaño-inferior',ancho,.06,.09,C.gold,0,.15,0,false);
  const count=Math.ceil(ancho/.16);
  for(let i=0;i<=count;i++)caja(root,'balaustre-'+i,.035,alto-.18,.045,C.gold,-ancho/2+i*ancho/count,(alto-.18)/2+.12,0,false);
  for(const x of [-1,1])caja(root,'poste-'+x,.1,alto,.1,C.green,x*(ancho/2-.05),alto/2,0,false);
  return root;
}

// Módulo exterior de fachada. Losa, ménsulas y protección son un único balcón.
export function crearBalconFachada({ancho=5.4,fondo=1.65}={}) {
  const root=new T.Group();
  caja(root,'losa',ancho,.22,fondo,C.stone,0,.11,fondo/2,false);
  caja(root,'fascia',ancho,.32,.12,C.ivory,0,.16,fondo-.06,false);
  const rail=crearBaranda({ancho});rail.position.set(0,.22,fondo-.12);root.add(rail);
  for(const side of [-1,1]) {
    const lateral=crearBaranda({ancho:fondo-.12});lateral.rotation.y=Math.PI/2;lateral.position.set(side*(ancho/2-.06),.22,fondo/2);root.add(lateral);
    caja(root,'ménsula-'+side,.24,.65,.9,C.stone,side*(ancho/2-.65),-.325,.45,false);
  }
  return root;
}
