import type { Vec3 } from './model.ts';
/**
 * Vida ambiental de una escena: NPC con identidad propia que el autor configura
 * y graba una sola vez en el estudio. El visor (SpanStories-Ciudades/engine/vida)
 * produce la grabación; el estudiante solo la reproduce, así que la escena es
 * siempre idéntica. Este módulo es el contrato del lado de la aplicación.
 */
export const LIFE_ROLES = {
  transeunte: 'Transeúnte', turista: 'Turista', cliente: 'Cliente', mesero: 'Mesero', vendedor: 'Vendedor', vecino: 'Vecino',
} as const;
export const LIFE_AFFORDANCES = {
  pasear: 'Paso / paseo', mirar: 'Mirar (escaparate…)', esperar: 'Esperar (parada…)', sentarse: 'Sentarse (banco…)',
  conversar: 'Conversar', atender: 'Atender (barra…)', pedir: 'Pedir (mostrador…)',
} as const;
export const LIFE_ANIMATIONS = ['walk', 'idle', 'look', 'sit', 'talk', 'wave'] as const;
export const LIFE_LIMITS = { npcs: 24, points: 60, duration: [20, 600], radius: [8, 80], lines: 400, keys: 6000 } as const;

export type LifeRole = keyof typeof LIFE_ROLES;
export type LifeAffordance = keyof typeof LIFE_AFFORDANCES;
export type LifeAnimation = typeof LIFE_ANIMATIONS[number];
export type LifeCastMember = { id: string; roleId: LifeRole; characterId: string; height: number };
export type LifePoint = { id: string; kind: LifeAffordance; position: Vec3; rotation: number; slots: number; roles?: LifeRole[] };
export type LifeLine = { id: string; npcId: string; at: number; duration: number; text: string };
export type LifeTrack = { npcId: string; keys: number[]; clips: [number, LifeAnimation][]; phase: number };
export type LifeRecording = { version: 1; zoneId: string; configKey: string; center: Vec3; loop: number; tracks: LifeTrack[]; lines: LifeLine[]; warnings: string[] };
export type SceneLife = { version: 1; seed: number; duration: number; radius: number; cast: LifeCastMember[]; points: LifePoint[]; recording?: LifeRecording };

/** Igual que claveConfiguracion() del visor: indica si la grabación quedó desactualizada. */
export function lifeConfigKey(a: SceneLife) {
  const text = JSON.stringify({ seed: a.seed, duration: a.duration, radius: a.radius,
    cast: a.cast.map(c => [c.id, c.roleId, c.characterId, c.height]),
    points: a.points.map(p => [p.id, p.kind, p.position, p.rotation, p.slots, p.roles || []]) });
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'v1-' + (h >>> 0).toString(16);
}
export const lifeIsStale = (a: SceneLife) => !!a.recording && a.recording.configKey !== lifeConfigKey(a);
export const defaultLife = (seed: number): SceneLife => ({ version: 1, seed: seed >>> 0, duration: 90, radius: 25, cast: [], points: [] });

/** JSON externo (archivos, almacenamiento, mensajes): TypeScript no basta. */
export function validateLife(raw: unknown, zoneId: string): string | null {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 180;
  const num = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const vec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(n => num(n, -100000, 100000));
  if (!obj(raw) || raw.version !== 1 || !Number.isInteger(raw.seed) || (raw.seed as number) < 0 || (raw.seed as number) > 0xffffffff) return 'Vida ambiental inválida.';
  if (!num(raw.duration, ...LIFE_LIMITS.duration) || !num(raw.radius, ...LIFE_LIMITS.radius)) return 'Duración o radio de la vida ambiental fuera de rango.';
  if (!Array.isArray(raw.cast) || raw.cast.length > LIFE_LIMITS.npcs || !Array.isArray(raw.points) || raw.points.length > LIFE_LIMITS.points) return 'Demasiados NPC o puntos en la vida ambiental.';
  const ids = new Set<string>();
  for (const c of raw.cast) {
    if (!obj(c) || !id(c.id) || ids.has(c.id) || typeof c.roleId !== 'string' || !(c.roleId in LIFE_ROLES) || !id(c.characterId) || !num(c.height, .2, 5)) return 'NPC de la vida ambiental inválido.';
    ids.add(c.id);
  }
  for (const p of raw.points) {
    if (!obj(p) || !id(p.id) || ids.has(p.id) || typeof p.kind !== 'string' || !(p.kind in LIFE_AFFORDANCES) || !vec(p.position) || !num(p.rotation, -1000, 1000) || !Number.isInteger(p.slots) || (p.slots as number) < 1 || (p.slots as number) > 8) return 'Punto de la vida ambiental inválido.';
    if (p.roles !== undefined && (!Array.isArray(p.roles) || !p.roles.every(r => typeof r === 'string' && r in LIFE_ROLES))) return 'Roles del punto inválidos.';
    ids.add(p.id);
  }
  if (raw.recording === undefined) return null;
  const r = raw.recording;
  if (!obj(r) || r.version !== 1 || r.zoneId !== zoneId || !id(r.configKey) || !vec(r.center) || !num(r.loop, 1, 1200) || !Array.isArray(r.warnings) || !r.warnings.every(w => typeof w === 'string' && w.length <= 400)) return 'La grabación de la vida ambiental no pertenece a este escenario.';
  const cast = new Set((raw.cast as LifeCastMember[]).map(c => c.id)), loop = r.loop as number;
  if (!Array.isArray(r.tracks) || r.tracks.length !== cast.size || new Set(r.tracks.map(t => obj(t) ? t.npcId : null)).size !== cast.size) return 'Las pistas grabadas no coinciden con el reparto.';
  for (const t of r.tracks) {
    if (!obj(t) || typeof t.npcId !== 'string' || !cast.has(t.npcId) || !num(t.phase, 0, 100) || !Array.isArray(t.keys) || t.keys.length < 10 || t.keys.length % 5 || t.keys.length > LIFE_LIMITS.keys * 5) return 'Pista grabada inválida.';
    let previous = -1;
    for (let i = 0; i < t.keys.length; i += 5) {
      if (!num(t.keys[i], 0, loop) || (t.keys[i] as number) <= previous) return 'Tiempos de pista inválidos.';
      previous = t.keys[i] as number;
      if (!vec([t.keys[i + 1], t.keys[i + 2], t.keys[i + 3]]) || !num(t.keys[i + 4], -1000, 1000)) return 'Pose grabada inválida.';
    }
    if (!Array.isArray(t.clips) || !t.clips.length || t.clips.length > LIFE_LIMITS.keys) return 'Animaciones grabadas inválidas.';
    previous = -1;
    for (const c of t.clips) {
      if (!Array.isArray(c) || !num(c[0], 0, loop) || (c[0] as number) < previous || !LIFE_ANIMATIONS.includes(c[1])) return 'Animaciones grabadas inválidas.';
      previous = c[0] as number;
    }
  }
  if (!Array.isArray(r.lines) || r.lines.length > LIFE_LIMITS.lines) return 'Demasiadas frases en la vida ambiental.';
  const lines = new Set<string>();
  for (const l of r.lines) {
    if (!obj(l) || !id(l.id) || lines.has(l.id) || typeof l.npcId !== 'string' || !cast.has(l.npcId) || !num(l.at, 0, loop) || !num(l.duration, .2, 30) || typeof l.text !== 'string' || !l.text.trim() || l.text.length > 240) return 'Frase de la vida ambiental inválida.';
    lines.add(l.id);
  }
  return null;
}
