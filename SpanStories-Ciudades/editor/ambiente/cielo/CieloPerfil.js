// Perfil de cielo: datos guardables + conversión a las entradas de ambiente que entiende el compositor (pipeline.js) y Luz25D.
// Funciones puras: las tablas base se reciben por parámetro (así se prueban sin navegador).
import { cieloPorId, HORAS } from './Presets.js';

const HEX = /^#[\da-f]{6}$/i;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ID_AMBIENTE_ESCENA = 'escena-editor';

export const CIELO_DEFECTO = Object.freeze({
  preset: null,            // id de Presets.js; null = el cielo del estilo
  hora: 'mediodia',
  sol: { az: 0, el: null, intensidad: 1 },      // az: giro en grados respecto a la hora; el: altura absoluta (null = la de la hora)
  nubes: null,             // 0..1 (null = las de la hora)
  niebla: null,            // 0..1 → densidad de bruma (null = la del estilo)
  colores: { top: null, horizon: null, cloud: null },
  luna: 1,                 // intensidad de la luz de noche
  calidad: 'media',        // 'baja' | 'media' | 'alta' (las nubes volumétricas solo existen en 'alta' y no están portadas)
});

export function normalizarCielo(entrada = {}) {
  const c = { ...CIELO_DEFECTO, ...entrada, sol: { ...CIELO_DEFECTO.sol, ...entrada.sol }, colores: { ...CIELO_DEFECTO.colores, ...entrada.colores } };
  if (c.preset !== null && !cieloPorId(c.preset)) throw new Error('Cielo desconocido: ' + c.preset);
  if (!HORAS.some(([id]) => id === c.hora)) throw new Error('Hora inválida: ' + c.hora);
  if (!['baja', 'media', 'alta'].includes(c.calidad)) throw new Error('Calidad inválida.');
  for (const k of ['top', 'horizon', 'cloud']) if (c.colores[k] !== null && !HEX.test(c.colores[k])) throw new Error('Color inválido: ' + k);
  c.sol.az = clamp(+c.sol.az || 0, -180, 180); c.sol.intensidad = clamp(+c.sol.intensidad || 0, 0, 2); c.luna = clamp(+c.luna || 0, 0, 2);
  c.sol.el = c.sol.el === null ? null : clamp(+c.sol.el, -10, 90);
  c.nubes = c.nubes === null ? null : clamp(+c.nubes, 0, 1);
  c.niebla = c.niebla === null ? null : clamp(+c.niebla, 0, 1);
  return c;
}

const aGrados = r => r * 180 / Math.PI;
function dirDe(az, el) { const a = az * Math.PI / 180, e = el * Math.PI / 180; return [-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]; }

/**
 * Entradas de ambiente derivadas de la hora base y del perfil.
 * tablas.luz = AMBIENTES de Luz25D, tablas.pipe = AMBIENTS del compositor. Devuelve { luz, pipe } SIN modificar las tablas.
 */
export function construirAmbientes(perfilCrudo, tablas) {
  const p = normalizarCielo(perfilCrudo), bl = tablas.luz[p.hora], bp = tablas.pipe[p.hora];
  if (!bl || !bp) throw new Error('La hora «' + p.hora + '» no existe en las tablas de ambientes.');
  const luz = structuredClone(bl), pipe = { ...bp };
  const preset = p.preset ? cieloPorId(p.preset) : null, paleta = preset?.paletas?.[p.hora] ?? null;
  const top = p.colores.top ?? paleta?.[0] ?? bp.top, horizon = p.colores.horizon ?? paleta?.[1] ?? bp.horizon, cloud = p.colores.cloud ?? paleta?.[2] ?? bp.cloud;
  pipe.top = top; pipe.horizon = horizon; pipe.cloud = cloud;
  if (paleta) pipe.k = bp.k * (paleta[4] ?? 1) / (p.hora === 'mediodia' ? 1 : 1);
  luz.cielo = [top, luz.cielo?.[1] ?? horizon, horizon]; luz.nubes = cloud;
  if (luz.tintes) luz.tintes.nubes = cloud;
  // Sol: la dirección de la hora, girada y/o elevada.
  const d = bl.sol.dir, baseAz = aGrados(Math.atan2(-d[0], d[2])), baseEl = aGrados(Math.asin(clamp(d[1] / Math.hypot(...d), -1, 1)));
  const az = baseAz + p.sol.az, el = p.sol.el ?? baseEl;
  luz.sol = { ...luz.sol, dir: dirDe(az, el), intensidad: (luz.sol.intensidad ?? 1) * p.sol.intensidad * (p.hora === 'noche' ? p.luna : 1) };
  pipe.el = el; pipe.az = (bp.az ?? 0) + p.sol.az;
  if (p.nubes !== null) pipe.clouds = p.nubes;
  return { luz, pipe, perfil: p };
}

export const horaDe = perfil => normalizarCielo(perfil).hora;
