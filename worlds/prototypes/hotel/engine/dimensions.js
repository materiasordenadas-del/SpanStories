// Dimensiones con nombre del proyecto (1 u = 1 m). Toda medida nueva va aquí.
// `ceiling` lo usa Luz25D para decidir qué es interior (luz de techo) y qué exterior (sol):
// cubre el atrio del lobby, de doble altura (2 × floorHeight).
export const DIMENSIONS = { ceiling: 8.6, doorHeight: 2.4, playerHeight: 1.7, playerRadius: 0.32,
  width: 28, lobbyDepth: 12, hospitalityDepth: 12, floorHeight: 4.2, wallHeight: 3.4,
  corridorWidth: 2.4, suiteWidth: 10, suiteDepth: 10, liftWidth: 2.4,
  receptionHeight: 1.05, receptionAccessibleHeight: 0.78, tableHeight: 0.76,
  stairRise: 0.175, stairRun: 0.28, stairWidth: 1.8, facadeHeight: 23 };
export const COLORS = { stone:'#e9dfca', ivory:'#faf1dd', wood:'#a66f4b', darkWood:'#644938',
  green:'#44745f', teal:'#326b72', gold:'#d9b46d', peach:'#dca885', blue:'#9dc5cf',
  ink:'#33453e', leaf:'#65905d', sand:'#d4b891', cloth:'#f3e9d6' };

// Núcleo vertical integrado en el lobby (coordenadas del lobby, 48 × 28 m).
// Muro este: cara interior en wallX. La galería de P1 corre pegada a ese muro: el ascensor de
// P1 está encima del de PB y abre a ella, y la escalera llega a su extremo sur (front). Al fondo
// de la galería (door203X, en el muro posterior) una puerta doble lleva al pasillo de habitaciones.
export const LOBBY_CORE = {
  wallX: 23.9, wallThickness: .2,
  gallery: { width: 3.2, front: -1, back: -13.9, beam: .55 },
  galleryColumnsZ: [-1.25, -5, -12.2],
  liftZ: -8.6, liftOpening: 2.3, liftHeight: 2.7,
  galleryArtZ: [-4.4, -12.4], door203X: 22.3,
  conciergeZ: 10, conciergeWidth: 4, conciergeHeight: 4.7
};

// Pasillo de habitaciones de P1, de doble crujía (referencia: 1,5 m mínimo, 1,8–2 m en 5★).
// Sale del fondo de la galería por el muro posterior del lobby y corre hacia el norte (−z).
// Coordenadas locales del área: x a lo ancho (centro 0), z a lo largo; la entrada está en
// z = +length/2. Según se entra (mirando a −z): impares a la IZQUIERDA (−x), pares a la DERECHA.
// Las puertas van en nichos y escalonadas (`stagger`): nunca quedan enfrentadas.
export const CORRIDOR = {
  width: 2, height: 2.9, soffit: 2.62, length: 30,
  module: 4.4, firstDoor: 4.2, stagger: 2.1, rooms: 6,
  door: { width: 1, height: 2.35, niche: .32, nicheWidth: 1.7, nicheHeight: 2.6 },
  entryWidth: 1.9, entryHeight: 2.7, window: { width: 1.6, height: 2.1, base: .45 }
};

// Relación de áreas. La suite 201 está detrás del muro izquierdo (oeste) del pasillo, en P1:
// se entra mirando al oeste y su fondo (balcón) queda al oeste, fuera del pasillo.
export const WALK = { speed: 2.8, lookSpeed: .004, maxPitch: Math.PI/2-.12, collisionHeight: .6 };
export const TRANSITIONS = { fadeMs:180, arrivalOffset:.8, triggerInset:.12,
  approach:1.8, doorWaitMs:650, angleLimit:Math.PI/3, pitchLimit:Math.PI/4,
  stairMs:2400, cameraMs:650, liftMs:1800, floorTolerance:.25 };
export const FRONT_OPENINGS = {
  lobby: [{x:0,ancho:4.2,alto:3.4},{x:6,ancho:2.4,alto:3.4}],
  conserjeria: [{x:7,ancho:3,alto:3.5}],
  restaurante: [{x:-10,ancho:4.2,alto:4.3},{x:10,ancho:4.2,alto:4.3}],
  buffet: [{x:-10,ancho:4.2,alto:4.3}],
  bar: [{x:-10,ancho:3,alto:4},{x:10,ancho:3,alto:4}]
};
export const HOTEL_LAYOUT = {
  roomDoorWidth: 1.2, suiteEntryX: -4, suiteFrontZ: 6,
  balcony: { width: 6, depth: 3, doorX: 3.6, doorWidth: 2.8, backZ: -6, railingHeight: 1.12 }
};
// Puertas del pasillo (coordenadas locales). Izquierda: 201, 203…; derecha: 202, 204…
export function puertasPasillo(){
  const K=CORRIDOR,out=[];
  for(let i=0;i<K.rooms;i++){const z=K.length/2-K.firstDoor-i*K.module;
    out.push({num:201+2*i,lado:-1,z},{num:202+2*i,lado:1,z:z-K.stagger});}
  return out;
}
// Pasillo local (x, z) → lobby (x, z) en P1: su entrada está en el muro posterior del lobby.
export const pasilloALobby = (x, z) => [LOBBY_CORE.door203X + x, -14 - LOBBY_CORE.wallThickness / 2 - (CORRIDOR.length / 2 - z)];
// Suite local (x, z) → lobby (x, z) en P1, a partir de la puerta 201 del muro izquierdo del pasillo.
export const suiteALobby = (x, z) => {
  const door=puertasPasillo().find(p=>p.num===201),[wallX,doorZ]=pasilloALobby(-CORRIDOR.width/2-CORRIDOR.door.niche,door.z);
  return [wallX - (HOTEL_LAYOUT.suiteFrontZ - z), doorZ - (x - HOTEL_LAYOUT.suiteEntryX)];
};

// Fachada: edificio Grand Hotel original (texturas autorizadas) adaptado en planta baja, que es
// lo que ve el estudiante desde la acera. El frente real de la curva y la altura libre bajo el
// vuelo se MIDEN sobre el modelo (rayos); aquí solo van las medidas de lo que se añade.
export const FACADE = {
  modelHeight: 36, modelZ: -10,
  entrance: { width: 20, pier: .8, pierDepth: .6, returnDepth: .8 },  // muro recto de entrada
  revolving: { radius: 1.5, height: 2.7 }, exit: { x: 6, width: 2.4 },  // ENTRADA al centro, SALIDA al este
  canopy: { width: 16, thickness: .3, gap: .12, overIsland: .9 },      // gap: holgura bajo el vuelo
  glazingStep: 4, glazingTo: 50, soffitInset: 1                        // paños en la curva y luces del vuelo
};

// Patio de llegada (motor court), medido desde el frente del muro de entrada hacia la calle (+z).
// Sentido único: los coches ENTRAN por el acceso derecho (+gateX), se incorporan a la U en +legX,
// pasan bajo la marquesina con el edificio a su derecha y SALEN por el acceso izquierdo (−gateX).
// La curva central de la U y su isla con fuente se conservan entre ambos conectores.
// Referencias: marquesina con carril de parada + carril de paso; fuente como foco visible desde
// 15–30 m; calzada a ras (sin bordillo) en adoquín, separada de la acera por banda y bolardos.
export const COURT = {
  arrivalWalk: 4.5,          // acera de llegada bajo la marquesina (muro de entrada → calzada)
  drive: 6.5, dropLane: 3,   // calzada de un sentido: carril de parada junto a la acera + carril de paso
  legX: 21, turnRadius: 8,   // eje de las curvas de la U; se conserva su forma y radio
  gateX: 21,                 // accesos alineados con los ramales: ancho útil completo, sin estrangulamiento diagonal
  island: 13,                // fondo de la isla (calzada → cerramiento de la calle)
  band: .35,                 // banda de granito a ras que marca el borde de la calzada
  islandCurb: { width: .3, height: .2 },
  fountain: { radius: 3.6, ring: 1.8 }, axisPath: 2.4,
  crossing: { width: 3.2, bar: .5 },
  sidewalk: 4.2, street: 9.2, curb: .15, farSidewalk: 4,
  perimeter: { thickness: .5, height: 2, pier: .62, pierHeight: 2.3, pierEvery: 6.5, extent: 64 },
  gate: { clear: 4.6, beam: 1.05, post: .9 }, pedestrianGate: 3.2, monolith: 1.5,
  access: { ramp: 1.8, barrierInset: 2, baseHeight: 1.05, postWidth: .4, surfaceY: .008 },
  sideWalk: 1.8              // camino peatonal junto a cada ramal y frente a la curva del edificio
};

// Pantallas: carcasa de 6 cm con marco de 3,5 cm. La cara trasera queda en z = 0 del objeto, de modo que
// montar una pantalla en un muro es poner su origen sobre la cara del muro (nada flota ni se entierra).
export const PANTALLAS = { depth: .06, bezel: .035 };

// Pantallas del lobby: encima de la recepción, kioscos de auto check-in y tótem de orientación.
export const LOBBY_TECH = {
  welcome: { width: 8, height: 1.5, base: 2.45, wallZ: -11.5 },   // sobre el fondo verde de recepción
  kiosks: { x: [-10.4, -9, -7.6], z: -8.2 }, directory: { x: 7, z: 7 }
};
// Tecnología integrada en las salas existentes (coordenadas locales de cada sala).
export const SALAS_TECH = {
  conserjeria: { board: { width: 3.6, height: 1.2, base: 1.6 }, table: { x: 4.5, z: -1.2, width: 2.4, depth: 1.3, stool: .35 } },
  restaurante: { menu: { z: -4.5, width: 1.6, height: .9, base: 1.5 },
    // Escenario de música en vivo contra el muro bajo del patio (x = 6), mirando al salón. Va dentro de la parte cubierta.
    stage: { frontX: 2.2, depth: 3.4, z: 5.5, width: 5.5, height: .3, backdrop: { height: 2.8, thickness: .12 }, screen: { width: 3.4, height: 1.3, base: 1.1 } } }
};

// Restaurante buffet «Jardín de Palma · Buffet» (zona `buffet`, copia alternativa del restaurante; el original sigue
// en `restaurante`). Coordenadas locales del salón (27 × 24 m, techo a 5,5 m), TODO bajo techo: no hay patio, la terraza
// es la zona `terraza`, a la que se sale por una puerta del muro este.
// Referencias: buffets de hoteles de lujo modernos (isla central con bordes redondeados y base de listones de madera,
// nichos iluminados con vajilla, dosel de luz translúcido encima, carvery contra la pared, isla de postres, pasillos
// de servicio ≥ 1,5 m entre estaciones y mesas).
export { BUFFET } from '../routes.js';
