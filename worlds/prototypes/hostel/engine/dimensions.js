// Dimensiones con nombre del proyecto (1 u = 1 m). Toda medida nueva va aquí.
// Ejes: x al este (derecha mirando la fachada desde la calle), y arriba, z al sur (+z = calle).
// `ceiling` lo usa Luz25D para decidir qué es interior (luz de techo) y qué exterior (sol):
// la casa tiene dos plantas: cubre hasta el techo de P1 (8,2) y deja la azotea (8,42) al sol.
export const DIMENSIONS = { ceiling: 8.3, doorHeight: 2.6, playerHeight: 1.7, playerRadius: 0.3, eye: 1.62 };

export const NOMBRE = { hostal: 'Hostal Santa Marta', ciudad: 'Santa Marta', direccion: 'Calle 19 # 3-45' };

export const COLORS = {
  fachada: '#efc35f', fachadaSombra: '#d9a548', cal: '#f5eddc', calGaleria: '#f1e2c2', zocalo: '#2f6f6c',
  moldura: '#fbf5e6', teja: '#b8633f', tejaOscura: '#8c4a35', madera: '#9a6a45', maderaOscura: '#5e4231',
  postigo: '#2f7a5f', postigoOscuro: '#245c49', hierro: '#3a3b3a', piedra: '#ddd2bc', piedraOscura: '#b9ab91',
  barro: '#c98a62', vidrio: '#a9cfd6', agua: '#59b9c9', aguaClara: '#8fd6df', azulejo: '#d9eef0',
  tela1: '#d8483b', tela2: '#f0b43c', tela3: '#2f8f83', tela4: '#3d5f9a', colchon: '#f2efe6', sabana: '#e9e4d6',
  cobija: '#3d6f8f', cortina: '#c75b3f', metal: '#b9bec0', negro: '#2b2f2e', tinta: '#2f3b36', crema: '#fff6e2',
  pizarra: '#24392f', laja: '#cfc3ad', asfalto: '#6c6d6b', acera: '#c9c0ae',
  // Compatibilidad con piezas copiadas (FachadaColonial, MuroConHuecos…).
  ivory: '#f5eddc', wood: '#9a6a45', darkWood: '#5e4231', coral: '#e8d6b4', blue: '#a9cfd6', teal: '#2f7a5f',
  green: '#245c49', gold: '#d9b46d', stone: '#ddd2bc', tile: '#b8633f', tileDark: '#8c4a35', iron: '#3a3b3a'
};

// Casa de patio central: 20 × 26 m, dos plantas y azotea. Muros por su EJE; el grosor se reparte a los lados.
// El patio queda entre las líneas de columnas; la galería, entre esas líneas y los muros de galería.
export const HOUSE = {
  width: 20, depth: 26, floorHeight: 4.2, slab: .2, roofY: 8.4, parapet: 1.1,
  wall: { ext: .4, gallery: .3, int: .2 },
  frontWallZ: -7, rearWallZ: -21, sideWallX: 5.5,      // muros de galería (ejes)
  patio: { x: 3.5, front: -9, rear: -19, drop: .15 },   // líneas de columnas; el patio está 15 cm más bajo
  zaguan: { half: 1.7, door: { width: 2.4, height: 3.4 } },
  // Particiones (ejes) de las crujías.
  west: [-13.2, -17.1],                 // Dorm 1 | Dorm 2 | Dorm 3   (PB) · Dorm 6 | Dorm 7 (P1: solo -13.2)
  east: [-12.9, -16.1],                 // Escalera | Privada 1 | Baños (PB) · Escalera | Privada 2 | Privada 3 (P1)
  rearPB: [-1],                         // Cocina | Comedor
  rearP1: [-1, 3],                      // Dorm 8 | Baños | Privada 4
  frontP1: [0]                          // Dorm 4 | Dorm 5
};

// Columnas del patio: piedra en PB, pies derechos de madera en P1. Vanos de 3 en los lados cortos
// (el eje zaguán → patio queda libre) y 3 en los largos.
export const COLONNADE = { shortBays: 3, longBays: 3, columnPB: .36, postP1: .2, beam: .22, zapata: .9,
  railing: { height: 1.0, baluster: .05, step: .14 } };

// Tejadillo de teja sobre la galería alta: cae del muro (alto) al patio (bajo) y vuela sobre él.
export const TEJADILLO = { high: 8.2, overhang: .5, slope: .32, thickness: .1, underside: '#c9a77a' };

// Muro de calle con portadas: ENTRADA a la derecha (+x) y SALIDA a la izquierda (−x) mirando la
// fachada desde la calle. Oculta la calle y permite simular la ciudad detrás.
export const FRONT = {
  wallZ: 6.2, thickness: .4, height: 3, cap: .18, span: 20, pilasterEvery: 4, pilaster: { width: .5, depth: .55 },
  gate: { x: 6, clear: 1.8, height: 2.6, pier: .6, pierDepth: .7, pierHeight: 3.75, sign: { width: 1.7, height: .42 } },
  path: 1.6
};
export const STREET = { sidewalk: 2, curb: .15, road: 7, farSidewalk: 2, neighborHeight: 7.6, neighborsEach: 2, neighborWidth: 12 };

// Piscina pequeña (tipo «plunge pool») en el centro del patio.
export const POOL = { width: 3.2, length: 5, depth: 1.3, coping: .28, waterBelow: .14, centerZ: -14 };

// Escalera en U dentro de la crujía este (frente). 24 contrahuellas por planta, 12 por tramo.
export const STAIR = { rise: HOUSE.floorHeight / 24, run: .28, perFlight: 12, width: 1.15, gap: .1,
  startZ: -8.45, xOuter: 9.6, landing: 1.27 };   // el tramo A va pegado a la cara del muro exterior

// Puertas de habitación: madera de tablero con montante enrejado; todas iguales salvo el rótulo.
export const DOOR = { width: 1.1, height: 2.6, transom: .6, frame: .12, plate: .22 };

// Dormitorio 1 (la única habitación que se recorre): 4 literas, 8 camas. Medidas de litera de hostal:
// cama 0,90 × 2,00; 76–91 cm entre colchones; casilleros bajo la cama de 40–45 cm.
export const BUNK = { bed: [.9, 2], post: .06, lowerDeck: .55, upperDeck: 1.55, top: 2.5, mattress: .15, rail: .28,
  locker: { height: .4, depth: .55 }, gap: .22, wallGap: .05 };

// Precios (COP) de la pizarra de recepción. Supuesto: rangos típicos de hostales del Caribe colombiano.
export const PRECIOS = [
  { id: 'dorm8', nombre: 'Cama · dormitorio mixto (8)', cop: 55000, unidad: 'noche' },
  { id: 'dorm6', nombre: 'Cama · dormitorio femenino (6)', cop: 60000, unidad: 'noche' },
  { id: 'privada', nombre: 'Habitación privada (2 personas)', cop: 160000, unidad: 'noche' },
  { id: 'desayuno', nombre: 'Desayuno', cop: 15000, unidad: 'persona' },
  { id: 'toalla', nombre: 'Alquiler de toalla', cop: 5000, unidad: 'estadía' },
  { id: 'candado', nombre: 'Candado para el casillero', cop: 12000, unidad: 'unidad' },
  { id: 'lavanderia', nombre: 'Lavandería', cop: 20000, unidad: 'carga' },
  { id: 'equipaje', nombre: 'Guardar equipaje', cop: 5000, unidad: 'día' },
  { id: 'wifi', nombre: 'Wifi', cop: 0, unidad: '' },
];
export const HORARIOS = { checkIn: '3:00 p. m.', checkOut: '11:00 a. m.', silencio: '10:00 p. m. – 7:00 a. m.', desayuno: '7:00 – 10:00 a. m.' };

export const WALK = { speed: 2.6, lookSpeed: .004, maxPitch: Math.PI / 2 - .12 };
