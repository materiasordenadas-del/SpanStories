import { CAMERA_EASINGS, cameraEase, type CameraEasing } from './motion-easing.ts';

/**
 * Luz dirigida de una escena: niveles de sol y de luna (0 = apagada, 1 = plena; el sol llega a 1,5 = mediodía).
 * La pista «Luz» de la línea de tiempo la cambia con transiciones: cada cue lleva la luz desde donde estaba
 * hasta la suya a lo largo de su duración (un anochecer, un amanecer, una nube que tapa la luna…).
 * Los escenarios que la entienden (la colina de Don Quijote) la aplican a cielo, bruma, hierba y personajes;
 * los demás la ignoran y siguen con su «Luz de la escena».
 */
export type SceneLight = { sol: number; luna: number };
export const LIGHT_LIMITS = { sol: [0, 1.5], luna: [0, 1.5] } as const;
/** Luz del escenario cuando la escena no fija ninguna: la madrugada con luna llena de la colina. */
export const DEFAULT_LIGHT: SceneLight = { sol: .25, luna: 1 };

/** Puntos de partida con nombre; el autor afina después los dos niveles. */
export const LIGHT_PRESETS = {
  nocheCerrada: { label: 'Noche cerrada', light: { sol: 0, luna: .05 } },
  nocheLuna: { label: 'Noche de luna', light: { sol: 0, luna: 1 } },
  antesDelAlba: { label: 'Antes del alba', light: { sol: .25, luna: 1 } },
  amanecer: { label: 'Amanecer', light: { sol: .45, luna: .3 } },
  dia: { label: 'Día', light: { sol: 1.2, luna: 0 } },
  atardecer: { label: 'Atardecer', light: { sol: .55, luna: .1 } },
  // Sol tocando el horizonte, cielo encendido y la luna asomando (cielo de la «Colina al amanecer», al revés).
  anochecer: { label: 'Anochecer', light: { sol: .38, luna: .35 } },
} as const satisfies Record<string, { label: string; light: SceneLight }>;
export type LightPreset = keyof typeof LIGHT_PRESETS;

export type LightCueFields = { kind: 'light'; light: SceneLight; easing?: CameraEasing; label: string };

const finite = (v: unknown, [min, max]: readonly [number, number]) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function lightProblem(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Luz inválida.';
  const l = v as Record<string, unknown>;
  return finite(l.sol, LIGHT_LIMITS.sol) && finite(l.luna, LIGHT_LIMITS.luna) ? null : 'Niveles de sol o luna fuera de rango.';
}
export function lightCueProblem(cue: Record<string, unknown>): string | null {
  return lightProblem(cue.light) ?? (cue.easing !== undefined && !CAMERA_EASINGS.includes(cue.easing as CameraEasing) ? 'Curva de la transición de luz inválida.' : null)
    ?? (typeof cue.label !== 'string' || !cue.label || cue.label.length > 180 ? 'La transición de luz necesita un nombre.' : null);
}

// Al terminar, exactamente la luz pedida (sin residuos de coma flotante que se arrastren al siguiente momento).
const mixLight = (a: SceneLight, b: SceneLight, t: number): SceneLight => t >= 1 ? { ...b } : ({ sol: a.sol + (b.sol - a.sol) * t, luna: a.luna + (b.luna - a.luna) * t });

/** Luz en `time` dentro de un momento, partiendo de `start`. Las transiciones encadenadas parten de donde iba la anterior. */
type Timed = { at: number; duration: number; kind: string };
export function sampleLight(cues: readonly Timed[], time: number, start: SceneLight): SceneLight {
  let light = { ...start };
  const list = cues.filter((c): c is Timed & LightCueFields => c.kind === 'light' && c.at <= time).sort((a, b) => a.at - b.at);
  for (let i = 0; i < list.length; i++) {
    const cue = list[i], next = list[i + 1];
    // Si otra transición empieza antes de que esta acabe, esta se corta donde iba.
    const until = Math.min(time, next ? next.at : Infinity);
    const t = cameraEase(Math.min(1, Math.max(0, (until - cue.at) / cue.duration)), cue.easing);
    light = mixLight(light, cue.light, t);
  }
  return light;
}

export const lightLabel = (l: SceneLight) => `Sol ${Math.round(l.sol * 100)} % · Luna ${Math.round(l.luna * 100)} %`;
