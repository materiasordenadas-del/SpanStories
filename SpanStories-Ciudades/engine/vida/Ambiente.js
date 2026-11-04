import { ANIMACIONES_VIDA, TIPOS_AFORDANCIA, TIPOS_ROL } from './Identidades.js';

/**
 * Formato de la vida ambiental de una escena (versión 1).
 *
 * Configuración (la edita el autor en el estudio):
 *   { version:1, seed, duration, radius, cast:[{id,roleId,characterId,height}],
 *     points:[{id,kind,position,rotation,slots,roles?}], recording? }
 *
 * Grabación (la produce el grabador una sola vez; el juego solo la reproduce):
 *   { version:1, zoneId, configKey, center, loop,
 *     tracks:[{npcId, keys:[t,x,y,z,yaw,…], clips:[[t,anim],…], phase}],
 *     lines:[{id,npcId,at,duration,text}], warnings:[] }
 *
 * Todas las pistas comparten el mismo bucle `loop`, y cada NPC termina donde
 * empezó: el ambiente puede repetirse sin saltos mientras el estudiante piensa,
 * y las conversaciones entre dos NPC siguen sincronizadas en cada vuelta.
 */
export const LIMITES_VIDA = Object.freeze({ npcs: 24, puntos: 60, duracion: [20, 600], radio: [8, 80], lineas: 400, claves: 6000 });

const id = v => typeof v === 'string' && v.length > 0 && v.length <= 180;
const finito = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const vector = v => Array.isArray(v) && v.length === 3 && v.every(n => finito(n, -100000, 100000));

/** Clave estable de la configuración: indica si la grabación quedó desactualizada. */
export function claveConfiguracion(a) {
  const texto = JSON.stringify({ seed: a.seed, duration: a.duration, radius: a.radius,
    cast: a.cast.map(c => [c.id, c.roleId, c.characterId, c.height]),
    points: a.points.map(p => [p.id, p.kind, p.position, p.rotation, p.slots, p.roles || []]) });
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'v1-' + (h >>> 0).toString(16);
}

export function validarConfiguracion(a) {
  if (!a || a.version !== 1 || !Number.isInteger(a.seed) || a.seed < 0 || a.seed > 0xffffffff) return false;
  if (!finito(a.duration, ...LIMITES_VIDA.duracion) || !finito(a.radius, ...LIMITES_VIDA.radio)) return false;
  if (!Array.isArray(a.cast) || a.cast.length > LIMITES_VIDA.npcs || !Array.isArray(a.points) || a.points.length > LIMITES_VIDA.puntos) return false;
  const ids = new Set();
  for (const c of a.cast) {
    if (!c || !id(c.id) || ids.has(c.id) || !TIPOS_ROL.includes(c.roleId) || !id(c.characterId) || !finito(c.height, .2, 5)) return false;
    ids.add(c.id);
  }
  for (const p of a.points) {
    if (!p || !id(p.id) || ids.has(p.id) || !TIPOS_AFORDANCIA.includes(p.kind) || !vector(p.position) || !finito(p.rotation, -1000, 1000) || !Number.isInteger(p.slots) || p.slots < 1 || p.slots > 8) return false;
    if (p.roles !== undefined && (!Array.isArray(p.roles) || !p.roles.every(r => TIPOS_ROL.includes(r)))) return false;
    ids.add(p.id);
  }
  return true;
}

export function validarGrabacion(r, { zoneId, cast }) {
  if (!r || r.version !== 1 || r.zoneId !== zoneId || !id(r.configKey) || !vector(r.center) || !finito(r.loop, 1, 1200)) return false;
  if (!Array.isArray(r.tracks) || r.tracks.length !== cast.length || !Array.isArray(r.lines) || r.lines.length > LIMITES_VIDA.lineas) return false;
  const npcs = new Set(cast.map(c => c.id));
  for (const t of r.tracks) {
    if (!t || !npcs.has(t.npcId) || !finito(t.phase, 0, 100) || !Array.isArray(t.keys) || t.keys.length < 10 || t.keys.length % 5 || t.keys.length > LIMITES_VIDA.claves * 5) return false;
    let anterior = -1;
    for (let i = 0; i < t.keys.length; i += 5) {
      if (!finito(t.keys[i], 0, r.loop) || t.keys[i] <= anterior) return false; anterior = t.keys[i];
      if (!vector([t.keys[i + 1], t.keys[i + 2], t.keys[i + 3]]) || !finito(t.keys[i + 4], -1000, 1000)) return false;
    }
    if (!Array.isArray(t.clips) || !t.clips.length || t.clips.length > LIMITES_VIDA.claves) return false;
    anterior = -1;
    for (const c of t.clips) { if (!Array.isArray(c) || !finito(c[0], 0, r.loop) || c[0] < anterior || !ANIMACIONES_VIDA.includes(c[1])) return false; anterior = c[0]; }
  }
  for (const l of r.lines) if (!l || !id(l.id) || !npcs.has(l.npcId) || !finito(l.at, 0, r.loop) || !finito(l.duration, .2, 30) || typeof l.text !== 'string' || !l.text.trim() || l.text.length > 240) return false;
  return true;
}

/** Ambiente listo para reproducir: configuración de reparto + grabación válida. */
export function validarAmbienteReproducible(a, zoneId) {
  return !!a && Array.isArray(a.cast) && a.cast.length <= LIMITES_VIDA.npcs &&
    a.cast.every(c => c && id(c.id) && id(c.characterId) && finito(c.height, .2, 5)) &&
    validarGrabacion(a.recording, { zoneId, cast: a.cast });
}

const giro = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export const MEZCLA_ANIMACION = .3;

/** Pose determinista de un NPC en el instante `tiempo` (en bucle). */
export function muestrearPista(pista, loop, tiempo, salida = {}) {
  const t = ((tiempo % loop) + loop) % loop, k = pista.keys, n = k.length / 5;
  let lo = 0, hi = n - 1;
  if (t <= k[0]) hi = 0;
  else if (t >= k[(n - 1) * 5]) lo = hi = n - 1;
  else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (k[m * 5] <= t) lo = m; else hi = m; }
  const a = lo * 5, b = hi * 5, f = hi === lo ? 0 : (t - k[a]) / (k[b] - k[a]);
  salida.x = k[a + 1] + (k[b + 1] - k[a + 1]) * f;
  salida.y = k[a + 2] + (k[b + 2] - k[a + 2]) * f;
  salida.z = k[a + 3] + (k[b + 3] - k[a + 3]) * f;
  salida.yaw = giro(k[a + 4], k[b + 4], f);
  const c = pista.clips; let i = 0;
  while (i + 1 < c.length && c[i + 1][0] <= t) i++;
  salida.anim = c[i][1]; salida.animTiempo = t - c[i][0] + pista.phase;
  const previa = c[i - 1] ?? (c.length > 1 ? c.at(-1) : null);
  const desde = t - c[i][0];
  salida.animPrevia = previa && desde < MEZCLA_ANIMACION && previa[1] !== c[i][1] ? previa[1] : null;
  salida.mezcla = salida.animPrevia ? desde / MEZCLA_ANIMACION : 1;
  salida.animPreviaTiempo = salida.animPrevia ? t - (previa[0] > t ? previa[0] - loop : previa[0]) + pista.phase : 0;
  return salida;
}

/** Frases activas en el instante `tiempo`. */
export function lineasActivas(lineas, loop, tiempo) {
  const t = ((tiempo % loop) + loop) % loop;
  return lineas.filter(l => t >= l.at && t < l.at + l.duration);
}
