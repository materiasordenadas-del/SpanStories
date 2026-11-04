// Planta del lobby derivada de LOBBY_CORE: huecos de muros, escalera y galería.
// La comparten HotelWorld y los tests para que la regla viva en un solo sitio.
import { DIMENSIONS as D,LOBBY_CORE as L,CORRIDOR as K } from './dimensions.js';

export const ALTO_LOBBY=2*D.floorHeight;
export const PELDAÑOS=Math.round(D.floorHeight/D.stairRise);
// La escalera sube hacia -z pegada al muro este; su último peldaño enrasa con la galería.
export const escalera={maxX:L.wallX,topZ:L.gallery.front,bottomZ:L.gallery.front+PELDAÑOS*D.stairRun};
export const galeria={minX:L.wallX-L.gallery.width,maxX:L.wallX,minZ:L.gallery.back,maxZ:L.gallery.front,y:D.floorHeight};

// Muro este (x local del muro = z del lobby): conserjería en PB y ascensor en PB y P1.
// Las habitaciones ya no dan a la galería: están en el pasillo de doble crujía.
export function huecosMuroEste(){
  const lift={x:L.liftZ,ancho:L.liftOpening,alto:L.liftHeight};
  return [{x:L.conciergeZ,ancho:L.conciergeWidth,alto:L.conciergeHeight},lift,{...lift,base:D.floorHeight}];
}
// Muro posterior: arcos a restaurante y bar en PB y, al final de la galería (P1), la puerta
// doble del pasillo de habitaciones.
export const entradaPasillo={x:L.door203X,ancho:K.entryWidth,alto:K.entryHeight,base:D.floorHeight};
export function huecosMuroPosterior(){
  return [{x:-17,ancho:5.3,alto:5.6},{x:17,ancho:5.3,alto:5.6},entradaPasillo];
}
