// Dimensiones con nombre del paradero (1 u = 1 m). Toda medida nueva va aquí.
// Ejes: x a lo largo de la avenida (este +x), z hacia la calzada (+z), y arriba.
//
//  Planta de la esquina (ver PLAN.md):
//
//   conjunto residencial (cerramiento)  │ calle │  FARMACIA (esquina) │ casa
//  ─────────────────────────────────────┤  45   ├─────────────────────┴──────  z = ACERA.z0
//     [caseta]      S                   │ cebra │                               acera 5 m
//  ═══════════════════════════ bordillo ╪═══════╪═══════════════════════════  z = ACERA.z1
//   ← bus (12 m) se detiene aquí   ▐▐▐▐ cebra   │   carril bus  ← sentido del tráfico
//                                               │
//   El tráfico del carril junto a esta acera va hacia el oeste (-x, circulación por la
//   derecha).  Parada DESPUÉS del cruce (far-side): el bus deja libre la cebra al detenerse.
export const DIMENSIONS = { ceiling: 0, playerHeight: 1.7, playerRadius: 0.32 };

// Avenida: acera ancha de 5 m, calzada de doble sentido, acera de enfrente.
export const ACERA = { z0: -4.4, z1: 0.6, alto: 0.15, franjaTactil: 0.4 };
export const CALZADA = { fondo: 10.5, carrilBus: 3.5 };
export const ACERA_ENFRENTE = 4.0;
export const MUNDO = { x0: -46, x1: 30, fondo: 40 };          // hasta dónde llegan calles y aceras

// Calle transversal (la «Calle 45») que cruza la avenida en x = CRUCE.x.
export const CRUCE = { x: 0, calzada: 7, acera: 3 };
export const cruce = {
  x0: CRUCE.x - CRUCE.calzada / 2, x1: CRUCE.x + CRUCE.calzada / 2,            // bordes de su calzada
  lineaOeste: CRUCE.x - CRUCE.calzada / 2 - CRUCE.acera,                        // paramento del conjunto
  lineaEste: CRUCE.x + CRUCE.calzada / 2 + CRUCE.acera,                         // paramento de la farmacia
};
// Cebra que cruza la avenida al lado oeste del cruce (en línea con la acera de la transversal).
export const CEBRA = { x0: cruce.lineaOeste, x1: cruce.x0, franja: 0.5 };
// Cebra que cruza la transversal por la acera de la avenida (el peatón sigue recto).
export const CEBRA_T = { z0: ACERA.z0 + 1.2, z1: ACERA.z1 - 0.6, franja: 0.5 };
// Tramo de bordillo pintado (amarillo y negro) y rotulado «SOLO BUS»: donde se detiene el bus.
export const zonaParada = () => ({ x0: xFrenteBus - 1, x1: CEBRA.x0 - BUS.holguraCebra });

// Bus articulado no: bus urbano de 12 m.  La parada se mide desde la cebra.
export const BUS = { largo: 12, holguraCebra: 1.5, puertaDelantera: 1.0 };
export const xFrenteBus = CEBRA.x0 - BUS.holguraCebra - BUS.largo;             // la señal marca aquí el frente

// Caseta (marquesina) típica latinoamericana: pórtico metálico, techo curvo
// de policarbonato, fondo de vidrio, banca metálica y valla publicitaria lateral.
export const CASETA = {
  largo: 4.2, fondo: 1.5, alto: 2.5, perfil: 0.09,
  retiro: 0.6,           // del paramento (fondo de la acera) a la cara trasera: la caseta va al «fondo» de la acera
  voladizo: 0.35,        // el techo sobresale hacia la calle
  flecha: 0.18,          // curvatura del techo
  vidrioBajo: 0.12,      // hueco inferior del vidrio trasero (se limpia y ventila)
};
export const BANCA = { largo: 3.0, fondo: 0.42, alto: 0.46, respaldo: 0.4, separacion: 0.08 };
export const VALLA = { ancho: 1.3, alto: 1.9, grosor: 0.2, baja: 0.12 };   // mupi iluminado
export const SENAL = { alto: 3.0, placa: [0.6, 0.8], alBordillo: 0.45 };
export const CANECA = { radio: 0.22, alto: 0.8, separacion: 0.8 };
export const PASO_LIBRE = 1.5;   // franja de circulación mínima que no invade nada

// Cerramiento del conjunto residencial detrás del paradero (muro bajo + reja) y sus torres.
export const CONJUNTO = { muro: 0.6, reja: 1.6, porteria: -36, anchoPorteria: 4, torres: [-40, -27, -14], retiro: 8, torre: [9, 10], pisos: 6, piso: 2.6 };

// La farmacia (copia del proyecto Farmacia/) va en la esquina este: su culata da a la transversal.
// Desde su origen local, la cara exterior de la culata está en x = -3.48 y la fachada en z = 0.25.
export const FARMACIA = { culata: -3.48, fachada: 0.25 };
export const farmaciaEn = () => ({ x: cruce.lineaEste - FARMACIA.culata, y: ACERA.alto, z: ACERA.z0 - FARMACIA.fachada });

// Posiciones derivadas del paradero: nada de números sueltos en el constructor.
export function disposicion() {
  const cx = xFrenteBus + BUS.puertaDelantera + CASETA.largo / 2;   // la caseta arranca junto a la puerta delantera
  const zAtras = ACERA.z0 + CASETA.retiro;
  const zFrente = zAtras + CASETA.fondo;
  const xIzq = cx - CASETA.largo / 2, xDer = cx + CASETA.largo / 2;
  const zBordillo = ACERA.z1 - SENAL.alBordillo;
  return {
    cx, zAtras, zFrente, xIzq, xDer,
    techo: { z0: zAtras - 0.08, z1: zFrente + CASETA.voladizo, y: CASETA.alto },
    banca: { cx, z0: zAtras + BANCA.separacion, z1: zAtras + BANCA.separacion + BANCA.fondo },
    valla: { cx: xDer + CASETA.perfil / 2 + VALLA.grosor / 2 + 0.01, cz: zAtras + CASETA.fondo / 2 },
    senal: { x: xFrenteBus, z: zBordillo },
    caneca: { x: xDer + CANECA.separacion + VALLA.grosor, z: zBordillo },
  };
}
