// Planta del restaurante en metros (1 unidad = 1 m). x crece al este, z al sur:
// la calle queda al sur (z > 0) y la cámara de llegada mira al norte (-z).
// De la cocina solo existen las puertas (en el muro norte del comedor): no se entra.
//
//   z = -10 ┌─ D ──┬──┬── barra ─ vinos ─ [PUERTAS COCINA] ─ vinos ┐
//           │ BAÑO │PA│                                           │
//   z = -7.5├─ C ──┤SI│        COMEDOR                            │
//           │ BAÑO │LL│  mesas de 4 · banco corrido al este      │
//   z = -5  ├──────┴──┤                                           │
//           │RECEPCIÓN│ (arco)                                    │
//   z = 0   └── puerta ─────────── ventanales con toldo ─────────┘  ← fachada
//        x=-10       x=-3                                       x=10

export const ALTO_TECHO = 3.6;
export const OJO = 1.62;
export const RADIO_JUGADOR = .24;
export const GROSOR_MURO = .2;

// Rectángulos [x0, z0, x1, z1] de cada sala (caras interiores de los muros en el eje).
export const SALAS = {
  recepcion: { nombre: 'Recepción', rect: [-10, -5, -3, 0] },
  comedor: { nombre: 'Comedor', rect: [-3, -10, 10, 0] },
  pasillo: { nombre: 'Pasillo de los baños', rect: [-5, -10, -3, -5] },
  damas: { nombre: 'Baño de damas', rect: [-10, -10, -5, -7.5] },
  caballeros: { nombre: 'Baño de caballeros', rect: [-10, -7.5, -5, -5] },
};
export const CALLE = { nombre: 'La calle · Entrada', rect: [-40, 0, 40, 16] };

// Huecos (centro sobre el muro, ancho, alto).  Las puertas se abren solas al acercarse.
export const HUECOS = {
  entrada: { x: -6.5, ancho: 1.7, alto: 2.45 },                // fachada, doble puerta de vidrio
  arco: { z: -2.5, ancho: 2.3, alto: 2.9 },                    // recepción ↔ comedor (x = -3)
  pasillo: { z: -6.2, ancho: 1.2, alto: 2.3 },                 // comedor ↔ pasillo (x = -3)
  damas: { z: -8.75, ancho: .9, alto: 2.15 },                  // pasillo ↔ baño (x = -5)
  caballeros: { z: -6.25, ancho: .9, alto: 2.15 },
  cocina: { x: 5.2, ancho: 1.5, alto: 2.2 },                   // puertas vaivén de la cocina (z = -10), cerradas
};
// Ventanales del comedor y de la recepción sobre la fachada (z = 0): [x0, x1].
export const VENTANAS = [[-9.4, -8.1], [-2.3, .9], [1.7, 4.9], [5.7, 8.9]];
export const VENTANA_Y = [.75, 2.75];

// Puntos de vista del recorrido: x, z, rumbo (0 = norte, +π/2 = este), cabeceo.
export const VISTAS = [
  { id: 'calle', nombre: 'La calle', x: -1.5, z: 12.6, yaw: -.08, pitch: .1 },
  { id: 'recepcion', nombre: 'Recepción', x: -6.2, z: -.7, yaw: -.35, pitch: -.04 },
  { id: 'comedor', nombre: 'Comedor', x: -2.1, z: -1.9, yaw: 1.0, pitch: -.1 },
  { id: 'barra', nombre: 'La barra', x: 3.8, z: -3.6, yaw: -.62, pitch: -.02 },
  { id: 'cocina', nombre: 'Puerta de la cocina', x: 5.2, z: -6.4, yaw: 0, pitch: .02 },
  { id: 'banos', nombre: 'Baños', x: -3.9, z: -5.6, yaw: -1.9, pitch: -.04 },
];
