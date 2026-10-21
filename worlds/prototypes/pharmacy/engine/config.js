// Planta de la farmacia de barrio en metros (1 unidad = 1 m).  x crece al este,
// z al sur: la calle queda al sur (z > 0) y la cámara de llegada mira al norte (-z).
// Referencias y decisiones en PLAN.md.
//
//  z = -9.4 ┌──────── anaquel de medicamentos (piso a techo) ────────┐
//           │  zona del dependiente · mesa · banco · puerta bodega   │
//  z = -7.5 ├════════════ MOSTRADOR con vitrina ═══════════╗ media  │
//  z = -6.9 │ silla          fila ante el mostrador         ║ puerta │
//   consul- ▌                                                        │
//   torio   ▌      ┌─ góndola A ─┐       ┌─ góndola B ─┐   anaquel   │
//  z = -5.2 │anaquel│ galletas  │ vitam. │ libre   │ prim.│ cuidado  │
//           │BOTANAS│ y dulces  │        │ venta   │ aux. │ personal │
//  z = -2.6 │       └─ cabecera ┘        └─ cabecera┘     │ y bebé   │
//           │                                        REFRIGERADOR    │
//           │ báscula          vestíbulo                bebidas      │
//  z = 0    └─ [ PUERTA ] ──────── aparador de vidrio ────────────────┘ ← fachada
//        x=-3.2   -2.5  -1.0                                     x=3.2

export const ALTO_TECHO = 3.0;         // plafón reticular
export const ALTO_FACHADA = 4.1;       // pretil sobre el letrero
export const OJO = 1.62;
export const RADIO_JUGADOR = .24;
export const GROSOR_MURO = .2;

export const LOCAL = { x0: -3.2, x1: 3.2, z0: -9.4, z1: 0 };
// Rectángulos [x0, z0, x1, z1] con luz de techo (interior).
// El rectángulo sobresale 10 cm de las caras interiores de los muros: si coincidiera
// con ellas, cada píxel de la pared dudaría entre luz de techo y luz de calle.
export const SALAS = { tienda: { nombre: 'Farmacia', rect: [LOCAL.x0 - .1, LOCAL.z0 - .1, LOCAL.x1 + .1, LOCAL.z1 + .05] } };
export const CALLE = { nombre: 'La calle', rect: [-30, 0, 30, 16] };

// Fachada (z = 0): puerta doble de vidrio y aparador.
export const PUERTA = { x0: -2.5, x1: -1.0, alto: 2.3 };
export const APARADOR = { x0: -.6, x1: 2.85, y0: .55, y1: 2.3 };
export const LETRERO = { y0: 2.55, y1: 3.45 };
export const ACERA = { z1: 2.6, alto: .15 };

// Mobiliario principal (medidas de catálogo: mostrador 1,0 m de alto y 0,6 de
// fondo; góndola de farmacia 1,40 m; anaquel de pared 2,10 m; detrás del
// mostrador, anaquel de piso a techo).
export const MOSTRADOR = { x0: LOCAL.x0, x1: 2.3, z0: -7.5, z1: -6.9, alto: 1.0 };
export const MEDIA_PUERTA = { x0: 2.3, x1: 3.12 };
export const ANAQUEL_FONDO = { z0: -9.4, z1: -9.0, alto: 2.75 };
export const GONDOLAS = [
  { id: 'A', x0: -1.5, x1: -.9, z0: -5.2, z1: -2.6, alto: 1.4,
    oeste: 'galletas', este: 'vitaminas', cabecera: 'suero' },
  { id: 'B', x0: .9, x1: 1.5, z0: -5.2, z1: -2.6, alto: 1.4,
    oeste: 'libreVenta', este: 'auxilios', cabecera: 'panuelos' },
];
export const ANAQUEL_OESTE = { z0: -4.9, z1: -1.5, fondo: .42, alto: 2.1 };   // botanas
export const ANAQUEL_ESTE = { z0: -6.6, z1: -3.6, fondo: .42, alto: 2.1 };    // cuidado personal y bebé
export const REFRI = { z0: -3.3, z1: -1.7, fondo: .72, alto: 2.02 };          // contra el muro este
export const CONSULTORIO = { z: -5.85, ancho: .9, alto: 2.1 };                // puerta en el muro oeste
export const BODEGA = { z: -8.4, ancho: .85, alto: 2.1 };                     // puerta en el muro este, tras el mostrador

// Puntos de vista: x, z, rumbo y cabeceo.  yaw 0 mira al norte (-z) y crece
// girando a la izquierda: +π/2 mira al oeste, -π/2 al este, π a la calle.
export const VISTAS = [
  { id: 'calle', nombre: 'La calle', x: .2, z: 7.6, yaw: 0, pitch: .06 },
  { id: 'entrada', nombre: 'Entrando', x: -1.75, z: .9, yaw: -.05, pitch: -.04 },
  { id: 'vestibulo', nombre: 'Vestíbulo', x: .45, z: -1.0, yaw: .18, pitch: -.1 },
  { id: 'botanas', nombre: 'Botanas', x: -1.55, z: -.85, yaw: .62, pitch: -.14 },
  { id: 'refri', nombre: 'Bebidas', x: 1.4, z: -1.2, yaw: -1.1, pitch: -.08 },
  { id: 'pasillo', nombre: 'Pasillo central', x: 0, z: -2.0, yaw: 0, pitch: -.06 },
  { id: 'mostrador', nombre: 'El mostrador', x: -.3, z: -5.6, yaw: .05, pitch: -.12 },
  { id: 'dependiente', nombre: 'Tras el mostrador', x: .6, z: -8.3, yaw: Math.PI, pitch: -.1 },
];
