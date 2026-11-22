/**
 * Dónde se usa un componente facial (actuación 1–50, rostro cotidiano, preset de la biblioteca…) en las historias.
 * Las actuaciones de la historia son recursos horneados e inmutables (`cue.behavior`); su receta facial
 * (`recipe.facial`) dice de qué componentes salieron. Una corrección general del Taller facial no las cambia sola:
 * el Taller las lista y, si el autor quiere, crea versiones nuevas y cambia la referencia (`replaceBehaviorRefs`).
 */
import type { BehaviorReference } from './behavior.ts';
import type { StudioProject } from './model.ts';

export type BehaviorUse = { sceneId: string; sceneName: string; sequenceId: string; sequenceName: string; cueId: string; actorId: string; actorName: string; behavior: BehaviorReference };
export type FacialUse = BehaviorUse & { historiaId: string; historiaName: string; components: string[]; variant: boolean };

/** Todas las actuaciones horneadas de un proyecto, con su sitio en la historia. */
export function behaviorUses(project: StudioProject): BehaviorUse[] {
  const out: BehaviorUse[] = [];
  for (const scene of project.scenes) for (const sequence of scene.sequences) for (const cue of sequence.cues) {
    if (cue.kind !== 'actor' || !cue.behavior) continue;
    out.push({ sceneId: scene.id, sceneName: scene.name, sequenceId: sequence.id, sequenceName: sequence.name, cueId: cue.id, actorId: cue.actorId, actorName: scene.actors.find(a => a.id === cue.actorId)?.name ?? cue.actorId, behavior: cue.behavior });
  }
  return out;
}

type PresetLike = { id?: unknown; source?: { componente?: unknown } };
/**
 * Componentes de los que sale una receta facial. `variant`: alguno es una variante propia (preset `user.*`), editada
 * a mano para esa historia: se lista pero no se actualiza con la corrección general.
 */
export function facialComponents(recipeFacial: unknown): { components: string[]; variants: string[] } {
  const presets = (recipeFacial as { presets?: PresetLike[] } | null)?.presets;
  const components = new Set<string>(), variants = new Set<string>();
  for (const p of Array.isArray(presets) ? presets : []) {
    const id = typeof p?.id === 'string' ? p.id : null, from = typeof p?.source?.componente === 'string' ? p.source.componente : null;
    if (id && !id.startsWith('user.')) components.add(id);
    else if (from) variants.add(from);
  }
  return { components: [...components], variants: [...variants] };
}

/** Cambia las referencias (vieja → nueva) en un proyecto. Devuelve cuántas acciones cambiaron. */
export type BehaviorReplacement = { from: string; to: BehaviorReference; /** Solo estos cues; ausente = todos los que usan `from`. */ cueIds?: readonly string[] };
export function replaceBehaviorRefs(project: StudioProject, pairs: readonly BehaviorReplacement[]): number {
  let count = 0;
  for (const scene of project.scenes) for (const sequence of scene.sequences) for (const cue of sequence.cues) {
    if (cue.kind !== 'actor' || !cue.behavior) continue;
    const hit = pairs.find(p => p.from === cue.behavior!.id && p.to.characterId === cue.behavior!.characterId && (!p.cueIds || p.cueIds.includes(cue.id)));
    if (hit) { cue.behavior = hit.to; count++; }
  }
  return count;
}
