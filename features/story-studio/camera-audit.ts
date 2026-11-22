import { cameraVisitAt } from './director.ts';
import type { CameraAuditWarning, CameraRig } from './camera-model.ts';
import { sequenceDuration, sequenceList, type Actor, type StudioProject, type Vec3 } from './model.ts';

/**
 * Revisión de cámaras con el escenario (plan 4.3, 4.7, 5.6–5.7). La parte pura decide qué preguntar al motor y
 * traduce las respuestas; el motor solo mide (paredes, volúmenes, oclusión, encuadre). Solo en edición: el
 * estudiante nunca calcula nada de esto. El resultado se guarda en la escena con su clave de obsolescencia.
 */
/** El estudiante usa la app en horizontal (decisión 8.1): se comprueban 16:9 y 4:3. */
export const AUDIT_ASPECTS = [16 / 9, 4 / 3] as const;
type Query =
  | { id: string; kind: 'segment'; points: Vec3[] }
  | { id: string; kind: 'view'; shot: { position: Vec3; target: Vec3; fov: number }; subjects: Vec3[]; entryIds?: string[]; aspects: number[] };
type Meta = { sequenceId: string; cueId?: string; label: string; cameraId?: string; subjects: string[]; purpose: 'blend' | 'moving' | 'shot' | 'gate' };
export type AuditCheck = { query: Query; meta: Meta };
type Result = { id: string; wall?: boolean; inside?: boolean; occluded?: number[]; offscreen?: Record<string, number[]>; entries?: Record<string, Record<string, boolean> | null> };

const head = (a: Actor): Vec3 => [a.position[0], a.position[1] + a.height * .92, a.position[2]];
const round = (v: Vec3): Vec3 => [Math.round(v[0] * 1000) / 1000, Math.round(v[1] * 1000) / 1000, Math.round(v[2] * 1000) / 1000];
const subjectsOf = (rig: CameraRig | undefined) => !rig ? [] : [...('actorId' in rig.body ? [rig.body.actorId] : []), ...(rig.aim.kind === 'actor' ? [rig.aim.actorId] : rig.aim.kind === 'group' ? rig.aim.actorIds : [])];

export function buildCameraAudit(project: StudioProject, sceneId: string): AuditCheck[] {
  const list = sequenceList(project), scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) return [];
  const checks: AuditCheck[] = [], rigs = new Map((scene.cameras ?? []).map(c => [c.id, c]));
  const add = (query: Query, meta: Meta) => { if (checks.length < 400) checks.push({ query, meta }); };
  for (const sequence of scene.sequences) {
    const index = list.findIndex(x => x.sequence.id === sequence.id), duration = sequenceDuration(sequence);
    const visit = (t: number) => cameraVisitAt(project, index, Math.max(0, Math.min(duration, t)));
    const speakerAt = (t: number) => sequence.cues.find(c => c.kind === 'dialogue' && c.speakerId && c.at <= t && t < c.at + c.duration);
    const view = (id: string, t: number, wanted: string[], meta: Omit<Meta, 'subjects'>, entryIds?: string[]) => {
      const v = visit(t), { shot } = v.program(), actors = v.actorsAt(v.now);
      const speaker = speakerAt(t);
      const ids = [...new Set([...wanted, ...(speaker?.kind === 'dialogue' && speaker.speakerId ? [speaker.speakerId] : [])])].filter(a => actors.some(x => x.id === a));
      add({ id, kind: 'view', shot: { position: round(shot.position), target: round(shot.target), fov: shot.fov }, subjects: ids.map(a => round(head(actors.find(x => x.id === a)!))), ...(entryIds?.length ? { entryIds } : {}), aspects: [...AUDIT_ASPECTS] },
        { ...meta, subjects: ids.map(a => scene.actors.find(x => x.id === a)?.name ?? a) });
    };
    for (const cue of sequence.cues) {
      if (cue.kind !== 'camera' && cue.kind !== 'cameraSwitch') continue;
      const rig = cue.kind === 'cameraSwitch' ? rigs.get(cue.cameraId) : undefined;
      const blend = cue.kind === 'camera' ? cue.shot.transition : cue.transition.kind === 'blend' && !rig?.cutOnly ? cue.transition.duration : 0;
      const label = cue.kind === 'cameraSwitch' ? rig?.name ?? cue.label : cue.label;
      if (blend > 0) {
        const points: Vec3[] = [];
        for (let k = 0; k <= 40; k++) points.push(round(visit(cue.at + blend * k / 40).program().shot.position));
        add({ id: `blend:${cue.id}`, kind: 'segment', points }, { sequenceId: sequence.id, cueId: cue.id, label, purpose: 'blend', subjects: [] });
      }
      view(`shot:${cue.id}`, cue.at + blend, subjectsOf(rig), { sequenceId: sequence.id, cueId: cue.id, label, ...(rig ? { cameraId: rig.id } : {}), purpose: 'shot' });
    }
    // Tramos en el aire de las cámaras que se mueven: ¿entran en un edificio?
    const moving = new Map<string, Vec3[]>();
    for (let t = 0; t <= duration + 1e-9; t += .25) {
      const v = visit(t), p = v.program();
      const rig = p.camera.id ? rigs.get(p.camera.id) : undefined;
      if (rig && rig.body.kind !== 'static' && p.camera.blend >= 1) moving.set(rig.id, [...(moving.get(rig.id) ?? []), round(p.shot.position)].slice(0, 200));
    }
    for (const [cameraId, points] of moving) add({ id: `moving:${sequence.id}:${cameraId}`, kind: 'segment', points }, { sequenceId: sequence.id, label: rigs.get(cameraId)!.name, cameraId, purpose: 'moving', subjects: [] });
    // El estudiante no puede tocar lo que no ve: el último plano del momento debe mostrar los objetos de la puerta.
    if (sequence.gate.kind === 'object') view(`gate:${sequence.id}`, duration, [], { sequenceId: sequence.id, label: 'último plano del momento', purpose: 'gate' }, sequence.gate.entryIds);
  }
  return checks;
}

const aspectName = (key: string) => ({ '1.778': '16:9', '1.333': '4:3' } as Record<string, string>)[key] ?? key;

export function readCameraAudit(checks: readonly AuditCheck[], results: readonly unknown[]): CameraAuditWarning[] {
  const warnings: CameraAuditWarning[] = [], byId = new Map(checks.map(c => [c.query.id, c.meta]));
  const push = (w: CameraAuditWarning) => { if (warnings.length < 500) warnings.push({ ...w, message: w.message.slice(0, 300) }); };
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Result, meta = byId.get(r.id);
    if (!meta) continue;
    const where = { sequenceId: meta.sequenceId, ...(meta.cueId ? { cueId: meta.cueId } : {}), ...(meta.cameraId ? { cameraId: meta.cameraId } : {}) };
    if (meta.purpose === 'blend' && r.wall) push({ code: 'wall', message: `la transición hacia «${meta.label}» atraviesa una pared; usa corte o recorrido en arco.`, ...where });
    else if (meta.purpose === 'blend' && r.inside) push({ code: 'inside', message: `la transición hacia «${meta.label}» pasa por dentro de un volumen.`, ...where });
    if (meta.purpose === 'moving' && (r.inside || r.wall)) push({ code: 'inside', message: `la cámara «${meta.label}» entra en un edificio o una pared en algún tramo.`, ...where });
    if ((meta.purpose === 'shot' || meta.purpose === 'gate') && r.inside) push({ code: 'inside', message: `el plano «${meta.label}» empieza dentro de un volumen.`, ...where });
    for (const i of r.occluded ?? []) if (meta.subjects[i]) push({ code: 'occluded', message: `en «${meta.label}» algo tapa a ${meta.subjects[i]}.`, ...where });
    const out = new Map<number, string[]>();
    for (const [aspect, indices] of Object.entries(r.offscreen ?? {})) for (const i of indices) out.set(i, [...(out.get(i) ?? []), aspectName(aspect)]);
    for (const [i, aspects] of out) if (meta.subjects[i]) push({ code: 'offscreen', message: `en «${meta.label}» ${meta.subjects[i]} queda fuera de cuadro en ${aspects.join(', ')}.`, ...where });
    for (const [entryId, visible] of Object.entries(r.entries ?? {})) {
      if (!visible) continue; // null: el motor no encontró el objeto; no se inventa un aviso
      const hidden = Object.entries(visible).filter(([, seen]) => !seen).map(([a]) => aspectName(a));
      if (hidden.length === Object.keys(visible).length) push({ code: 'offscreen', message: `el estudiante tiene que tocar «${entryId}», pero no se ve en el último plano del momento.`, ...where });
      else if (hidden.length) push({ code: 'offscreen', message: `«${entryId}» no se ve en el último plano en ${hidden.join(', ')}.`, ...where });
    }
  }
  return warnings;
}
