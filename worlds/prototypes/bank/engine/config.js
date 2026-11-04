// Planta del Banco Horizonte en metros (1 unidad = 1 m).  x crece al este, z al sur:
// la calle queda al sur (z > 0) y la cámara de llegada mira al norte (-z).
// Plano dibujado en PLAN.md.  Todo lo que el estudiante no ve (bóveda, archivo,
// oficinas) no existe: detrás del muro del fondo de los cajeros no hay nada.

export const ALTO_TECHO = 3.8;
export const OJO = 1.62;
export const RADIO_JUGADOR = .24;
export const GROSOR_MURO = .2;

export const EDIFICIO = { x0: -9, x1: 9, z0: -15, z1: 0 };

// Rectángulos [x0, z0, x1, z1] de cada zona cubierta (la luz de techo manda dentro).
export const SALAS = {
  vestibulo: { nombre: 'Vestíbulo de cajeros automáticos', rect: [-9, -3.6, -3.4, 0] },
  sala: { nombre: 'Sala de atención', rect: [-9, -10.5, 9, -3.6] },
  ventanales: { nombre: 'Zona de ventanales', rect: [-3.4, -3.6, 9, 0] },
  cajeros: { nombre: 'Zona de cajeros (tras el vidrio)', rect: [-9, -15, 9, -10.5] },
};
export const CALLE = { nombre: 'La calle', rect: [-40, 0, 40, 18] };

// Puertas automáticas correderas: centro x, ancho libre, alto.
export const PUERTAS = {
  exterior: { x: -6.2, z: 0, ancho: 1.8, alto: 2.4 },       // fachada → vestíbulo
  interior: { x: -6.2, z: -3.6, ancho: 1.8, alto: 2.4 },    // vestíbulo → sala
};

// Línea de cajas: mostrador en z = -10.5 (cara del cliente).
export const MOSTRADOR = {
  z: -10.5,               // cara del cliente
  fondo: .62,             // profundidad del mueble (hacia el norte)
  x0: -7.2, ancho: 2.4, n: 5,
  alto: 1.05, altoAccesible: .86,
  vidrio: 2.35, cabecera: [2.42, 2.95],
  cerrada: 1,             // la caja 1 está cerrada
  preferente: 5,          // la caja 5 es preferente y accesible
};
export const centroCaja = i => MOSTRADOR.x0 + MOSTRADOR.ancho * (i - .5);    // i = 1..n

// Fila única: carriles este-oeste separados por cintas.  z de cada cinta.
export const FILA = {
  x0: -7.6, x1: -.5,
  cintas: [-5.6, -6.6, -7.6, -8.6],
  esperaZ: -9.15,          // línea «Espere aquí»
  esperaX: .15,
  boca: [-6.9, -5.6],      // inicio de la fila (entrada al primer carril, por el oeste)
};
// Fila preferencial: carril recto norte-sur al este de la fila única.
export const FILA_PREF = { x0: .35, x1: 1.35, z0: -5.6, z1: -8.6 };

export const KIOSCO = { x: -4.35, z: -4.45, ry: -1.14 };     // la pantalla mira a la puerta interior
export const INFORMACION = { x: -2.2, z: -4.55 };

export const ASESORES = [-9.2, -7.15, -5.1].map((z, i) => ({ z, modulo: i + 1 }));
export const SILLAS = { x0: 2.75, filas: [-6.25, -7.55], n: 5, paso: .62 };

// Ventanales de la fachada (z = 0): [x0, x1].
export const VENTANAS = [[-8.6, -7.35], [-5.05, -3.8], [-3.0, 0.4], [1.0, 4.4], [5.0, 8.6]];
export const VENTANA_Y = [.45, 3.05];

// Puntos de vista del recorrido: x, z, rumbo (0 = norte, +π/2 = este), cabeceo.
export const VISTAS = [
  { id: 'calle', nombre: '1 · La calle', x: -2.2, z: 9.5, yaw: -.16, pitch: .1 },
  { id: 'vestibulo', nombre: '2 · Cajeros automáticos', x: -7.35, z: -1.85, yaw: -Math.PI / 2, pitch: -.12 },
  { id: 'entrada', nombre: '3 · Al entrar', x: -6.1, z: -4.3, yaw: .25, pitch: .02 },
  { id: 'informacion', nombre: '4 · Información', x: -3.05, z: -3.55, yaw: .7, pitch: -.12 },
  { id: 'turno', nombre: '5 · Sacar turno', x: -5.45, z: -3.85, yaw: .95, pitch: -.22 },
  { id: 'formularios', nombre: '6 · Mesa de fichas', x: .9, z: -.95, yaw: 0, pitch: -.45 },
  { id: 'fila', nombre: '7 · En la fila', x: -3.2, z: -7.1, yaw: -.1, pitch: .02 },
  { id: 'espera', nombre: '8 · Espere aquí', x: .15, z: -8.75, yaw: -.2, pitch: -.02 },
  { id: 'ventanilla', nombre: '9 · En la ventanilla', x: centroCaja(3), z: -9.85, yaw: 0, pitch: -.12 },
  { id: 'clientes', nombre: '10 · Atención al cliente', x: 3.2, z: -4.3, yaw: 1.05, pitch: .02 },
];
