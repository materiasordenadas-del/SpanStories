import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildStudioRehearsal } from '../../demo.ts';
import { sampleSequence, type SampleCache } from '../../director.ts';
import { flowSuccessors } from '../../editing.ts';
import { sequenceDuration, sequenceList, type Cue, type StudioProject, type StudioSource } from '../../model.ts';
import { buildMiniHistoria, MINI_SHOTS } from './mini-historia.ts';

/**
 * Instantáneas de referencia del sistema de cámaras (fase 0).
 * Cada caso se muestrea cada 0,1 s de cada momento con las dos rutas que existen hoy:
 * - editor: la previsualización lineal (`previewPrefix`, todos los momentos anteriores en orden de lista);
 * - estudiante: cada recorrido posible por las puertas, sin repetir momentos.
 * Se guarda un hash SHA-256 del snapshot completo por muestra (igualdad exacta) y el snapshot entero al
 * principio y al final de cada momento, para poder ver qué cambió si una prueba falla.
 */
export type BaselineCase = { name: string; project: StudioProject; source: StudioSource };
export type BaselineTrack = { label: string; route: string[]; hashes: string[]; edges: Record<string, unknown> };
export type Baseline = Record<string, BaselineTrack[]>;

const fixture = (file: string) => {
  const h = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')) as { project: StudioProject; source: StudioSource };
  return { project: h.project, source: h.source };
};

/** Variante de la minihistoria con empates deliberados: el orden de lista es el contrario al orden de los ids. */
function miniEmpates(): BaselineCase {
  const { project, source } = buildMiniHistoria();
  const [respuesta, pregunta] = [project.scenes[0].sequences[1], project.scenes[0].sequences[2]];
  respuesta.cues.push({ id: 'mh-2-cam-a-empate', kind: 'camera', at: 2, duration: .5, label: 'Rachel (empate)', shot: structuredClone(MINI_SHOTS.rachel) } as Cue);
  pregunta.cues.push({ id: 'mh-3-a-empate-giro', kind: 'actor', at: 0, duration: .8, actorId: 'mh-rachel', action: 'turn', rotation: 2.5 } as Cue);
  return { name: 'mini-empates', project, source };
}

/** Variante con un corte que llega en mitad de una mezcla (la del primer plano de Rachel, 1,5 → 2,5 s). */
function miniCorteEnMezcla(): BaselineCase {
  const { project, source } = buildMiniHistoria();
  project.scenes[0].sequences[0].cues.push({ id: 'mh-1-cam-corte', kind: 'camera', at: 2, duration: .5, label: 'Conjunto (corte)', shot: structuredClone(MINI_SHOTS.conjunto) } as Cue);
  return { name: 'mini-corte-en-mezcla', project, source };
}

export function baselineCases(): BaselineCase[] {
  const mini = buildMiniHistoria();
  return [
    { name: 'mini-historia', project: mini.project, source: mini.source },
    miniEmpates(),
    miniCorteEnMezcla(),
    { name: 'historia-prueba-guardado', ...fixture('./historia-prueba-guardado.json') },
    { name: 'historia-sin-titulo', ...fixture('./historia-sin-titulo.json') },
    { name: 'demo-barcelona', ...buildStudioRehearsal('barcelona') },
    { name: 'demo-aeropuerto', ...buildStudioRehearsal('airport') },
  ];
}

/** Instantes de muestreo de un momento: cada 0,1 s y el final exacto. */
export function sampleTimes(duration: number): number[] {
  const times: number[] = [];
  for (let k = 0; k / 10 < duration - 1e-9; k++) times.push(k / 10);
  times.push(duration);
  return times;
}

/** Todos los recorridos del estudiante desde el primer momento hasta el final, sin repetir momentos. */
export function studentRoutes(project: StudioProject, limit = 32): number[][] {
  const list = sequenceList(project), next = flowSuccessors(project), index = new Map(list.map((x, i) => [x.sequence.id, i]));
  const routes: number[][] = [];
  const walk = (route: number[]) => {
    if (routes.length >= limit) return;
    const targets = [...new Set(next.get(list[route.at(-1)!].sequence.id) ?? [])].map(id => index.get(id)).filter((i): i is number => i !== undefined && !route.includes(i));
    if (!targets.length) { routes.push(route); return; }
    for (const target of targets) walk([...route, target]);
  };
  walk([0]);
  return routes;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

/**
 * Cómo se muestrea: sin caché (como una llamada suelta), o con la caché de prefijos que usa el director,
 * compartida por todo el caso y recorriendo las muestras en orden normal o inverso.
 */
export type SampleMode = 'directo' | 'cache' | 'cache-inverso';

/** Muestrea una ruta: en cada momento, la cámara y los actores dependen solo de los momentos anteriores de esa ruta. */
function track(project: StudioProject, label: string, route: number[], prefixFor: (step: number) => number[], mode: SampleMode, cache: SampleCache): BaselineTrack {
  const list = sequenceList(project), edges: Record<string, unknown> = {};
  const samples = route.flatMap((index, step) => sampleTimes(sequenceDuration(list[index].sequence)).map((time, k, times) => ({ index, step, time, edge: k === 0 || k === times.length - 1 })));
  const hashes = new Array<string>(samples.length);
  const order = samples.map((_, i) => i);
  if (mode === 'cache-inverso') order.reverse();
  for (const i of order) {
    const { index, step, time, edge } = samples[i];
    const snapshot = sampleSequence(project, index, time, prefixFor(step), mode === 'directo' ? undefined : cache);
    hashes[i] = hash(snapshot);
    if (edge) edges[`${list[index].sequence.id}@${time}`] = JSON.parse(JSON.stringify(snapshot));
  }
  // Mismo orden de claves sea cual sea el recorrido, para que la comparación sea estable.
  const sorted = Object.fromEntries(samples.filter(s => s.edge).map(s => `${list[s.index].sequence.id}@${s.time}`).map(k => [k, edges[k]]));
  return { label, route: route.map(i => list[i].sequence.id), hashes, edges: sorted };
}

export function collectBaseline(cases = baselineCases(), mode: SampleMode = 'directo'): Baseline {
  const result: Baseline = {};
  for (const { name, project } of cases) {
    const count = sequenceList(project).length, cache: SampleCache = new Map();
    // Editor: cada momento con su prefijo lineal (lo que hace seek()).
    const tracks = Array.from({ length: count }, (_, i) => track(project, `editor:${i}`, [i], () => Array.from({ length: i }, (_, j) => j), mode, cache));
    // Estudiante: la ruta visitada.
    for (const [n, route] of studentRoutes(project).entries()) tracks.push(track(project, `ruta:${n}`, route, step => route.slice(0, step), mode, cache));
    result[name] = tracks;
  }
  return result;
}
