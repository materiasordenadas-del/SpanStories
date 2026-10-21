import { crearMuroConHuecos } from '../objetos/MuroConHuecos.js';
import { FRONT_OPENINGS, HOTEL_LAYOUT as H } from './dimensions.js';
import { place } from './layout.js';

export function crearMuroFrontal(id,{tam:[w,d],alto},color){
  if(id==='terraza'||id==='fachada')return null;
  const huecos=id==='habitacion'?[{x:H.suiteEntryX,ancho:H.roomDoorWidth,alto:2.5}]:FRONT_OPENINGS[id]||[];
  const wall=crearMuroConHuecos({ancho:w,alto,color,huecos});
  place(wall,{cx:0,cz:d/2,minY:0});
  return wall;
}
