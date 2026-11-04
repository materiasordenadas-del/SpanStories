/**
 * Identidad de los NPC: quién es cada uno (rol, oficio, personalidad) y qué
 * actividades puede realizar. La decisión (Decision.js) consulta estos datos,
 * pero no los contiene: un mesero y un turista comparten la misma inteligencia
 * y se comportan distinto porque sus identidades son distintas.
 */

/**
 * Posibilidades de interacción que un punto del escenario declara de forma
 * explícita. No se deducen de nombres de objetos ni del léxico.
 */
export const AFORDANCIAS = Object.freeze({
  pasear:    { etiqueta: 'Paso / paseo',        plazas: 4, animacion: 'idle',  estancia: [1, 3] },
  mirar:     { etiqueta: 'Mirar (escaparate…)', plazas: 2, animacion: 'look',  estancia: [4, 10] },
  esperar:   { etiqueta: 'Esperar (parada…)',   plazas: 4, animacion: 'idle',  estancia: [6, 16] },
  sentarse:  { etiqueta: 'Sentarse (banco…)',   plazas: 2, animacion: 'sit',   estancia: [10, 25] },
  conversar: { etiqueta: 'Conversar',           plazas: 2, animacion: 'idle',  estancia: [8, 18] },
  atender:   { etiqueta: 'Atender (barra…)',    plazas: 1, animacion: 'idle',  estancia: [15, 40] },
  pedir:     { etiqueta: 'Pedir (mostrador…)',  plazas: 1, animacion: 'idle',  estancia: [6, 10] },
});
export const TIPOS_AFORDANCIA = Object.freeze(Object.keys(AFORDANCIAS));

/** Animaciones abstractas de la vida → clips reales del personaje (con alternativas). */
export const ANIMACIONES = Object.freeze({
  walk: [/^Walking$/i, /walk/i],
  idle: [/^(idle|restpose)$/i, /idle|breath/i],
  look: [/look/i],
  sit:  [/sit/i],
  talk: [/talk/i],
  wave: [/wave|greet/i],
});
export const ANIMACIONES_VIDA = Object.freeze(Object.keys(ANIMACIONES));

/**
 * Roles. `actividades` son pesos base por afordancia; `puesto` indica la
 * afordancia de trabajo a la que vuelve el rol; `radioPuesto` limita cuánto se
 * aleja de él; `velocidad` en m/s; `ritmo` multiplica la estancia en cada sitio.
 */
export const ROLES = Object.freeze({
  transeunte: { etiqueta: 'Transeúnte', velocidad: [1.2, 1.45], ritmo: [.6, 1],   actividades: { pasear: 3, mirar: .8, esperar: .5, sentarse: .4 } },
  turista:    { etiqueta: 'Turista',    velocidad: [.85, 1.1],  ritmo: [1, 1.5],  actividades: { mirar: 3, pasear: 2, sentarse: 1, pedir: .8, conversar: .5 } },
  cliente:    { etiqueta: 'Cliente',    velocidad: [1, 1.25],   ritmo: [.9, 1.3], actividades: { pedir: 3, sentarse: 2, conversar: 1.2, mirar: .5, pasear: .4 } },
  mesero:     { etiqueta: 'Mesero',     velocidad: [1.25, 1.5], ritmo: [.8, 1.1], actividades: { atender: 5, pasear: .6, conversar: .3 }, puesto: 'atender', radioPuesto: 10 },
  vendedor:   { etiqueta: 'Vendedor',   velocidad: [1, 1.3],    ritmo: [1, 1.4],  actividades: { atender: 6, mirar: .4 }, puesto: 'atender', radioPuesto: 6 },
  vecino:     { etiqueta: 'Vecino',     velocidad: [.95, 1.25], ritmo: [1, 1.6],  actividades: { conversar: 2, sentarse: 2, pasear: 1, esperar: .8, mirar: .5 } },
});
export const TIPOS_ROL = Object.freeze(Object.keys(ROLES));

/** Generador determinista (mulberry32): la misma semilla produce la misma grabación. */
export function crearAzar(semilla) {
  let a = (semilla >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const entre = (azar, [min, max]) => min + (max - min) * azar();

/** Combina rol + personalidad estable derivada de la semilla de cada NPC. */
export function crearIdentidad(miembro, azar) {
  const rol = ROLES[miembro.roleId];
  if (!rol) throw new Error('Rol de NPC desconocido: ' + miembro.roleId);
  const personalidad = { sociabilidad: .6 + azar() * .8, curiosidad: .6 + azar() * .8, calma: .7 + azar() * .6 };
  const pesos = {};
  for (const [tipo, peso] of Object.entries(rol.actividades)) {
    const factor = tipo === 'conversar' || tipo === 'pedir' ? personalidad.sociabilidad
      : tipo === 'mirar' || tipo === 'pasear' ? personalidad.curiosidad
      : tipo === 'sentarse' || tipo === 'esperar' ? personalidad.calma : 1;
    pesos[tipo] = peso * factor;
  }
  return {
    id: miembro.id, roleId: miembro.roleId, rol, personalidad, pesos,
    velocidad: entre(azar, rol.velocidad), ritmo: entre(azar, rol.ritmo),
    // Desfase propio del ciclo de animación: evita que todos se muevan a la vez.
    fase: azar() * 10,
  };
}
