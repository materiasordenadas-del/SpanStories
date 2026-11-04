import * as T from '../engine/three.js';
import { caja,cilindro } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearMesa({ancho=1.4,fondo=0.85,alto=0.76,redonda=false,color=C.wood}={}) {
  const r=new T.Group();
  if(redonda) cilindro(r,'tablero',ancho/2,.09,color,0,alto-.045);
  else caja(r,'tablero',ancho,.09,fondo,color,0,alto-.045);
  cilindro(r,'pedestal',.09,alto-.1,C.gold,0,(alto-.1)/2);
  cilindro(r,'base',.34,.06,C.darkWood,0,.03);return r;
}
