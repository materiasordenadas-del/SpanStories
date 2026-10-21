import * as T from '../engine/three.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearMostrador({ancho=5,fondo=1,alto=1.05,color=C.green,accesible=false}={}) {
  const r=new T.Group();caja(r,'cuerpo',ancho,alto-.1,fondo,color);
  caja(r,'cubierta',ancho+.12,.12,fondo+.12,C.ivory,0,alto-.06);
  for(let i=0;i<Math.floor(ancho/.15);i++) caja(r,'listón-'+i,.035,alto-.24,.035,C.gold,-ancho/2+.1+i*.15,(alto-.1)/2,fondo/2+.02,false);
  caja(r,'zócalo',ancho,.1,fondo+.02,C.darkWood,0,.05);
  if(accesible) {caja(r,'módulo-accesible',1,.68,fondo,C.green,ancho/2+.56,.34);caja(r,'cubierta-accesible',1.12,.1,fondo+.12,C.ivory,ancho/2+.56,.73);}
  return r;
}
