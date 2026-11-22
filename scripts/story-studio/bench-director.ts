// Coste de sampleSequence por fotograma en la escena de referencia grande (plan de cámaras, fase 0).
// Uso: node scripts/story-studio/bench-director.ts
// Escena: 20 actores, 10 momentos × 100 cues = 1000 cues (caminatas con camino de 8 puntos, cámara, diálogo).
// Se muestrea el último momento: el director recorre todos los anteriores, que es el peor caso de un fotograma.
import { sampleSequence } from '../../features/story-studio/director.ts';
import { validateProject, type Cue, type StudioProject } from '../../features/story-studio/model.ts';
import { buildMiniHistoria } from '../../features/story-studio/__tests__/fixtures/mini-historia.ts';

export function bigScene(): { project: StudioProject; source: ReturnType<typeof buildMiniHistoria>['source'] } {
  const { source } = buildMiniHistoria();
  const actors = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, characterId: i % 2 ? 'mia' : 'rachel', name: `Actor ${i}`, position: [i * 1.5, 0, 0] as const, rotation: 0, height: 1.65 }));
  let rnd = 7; const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const sequences = Array.from({ length: 10 }, (_, s) => {
    const cues: Cue[] = [];
    for (let c = 0; c < 100; c++) {
      const id = `s${s}c${c}`, at = r() * 9, kind = c % 10;
      if (kind === 0) cues.push({ id, kind: 'camera', at, duration: .5, label: 'Plano', shot: { position: [r() * 30, 2 + r() * 3, 10 + r() * 5], target: [r() * 30, 1, 0], fov: 30 + r() * 30, transition: r() * 2, easing: 'easeInOut' } });
      else if (kind === 1) cues.push({ id, kind: 'dialogue', at, duration: 1 + r(), sentenceId: source.sentences[c % source.sentences.length].id, speakerId: `a${c % 20}` });
      else cues.push({ id, kind: 'actor', at, duration: .5 + r() * 2, actorId: `a${c % 20}`, action: kind < 6 ? 'walk' : 'look', ...(kind < 6
        ? { path: Array.from({ length: 8 }, () => [r() * 30, 0, r() * 10] as const), destination: [r() * 30, 0, r() * 10] as const }
        : { lookAt: `a${(c + 3) % 20}` }) });
    }
    return { id: `seq${s}`, name: `Momento ${s}`, cues, gate: { kind: 'auto' as const } };
  });
  const project: StudioProject = { schema: 1, id: 'bench', name: 'Escena grande', storyId: source.storyId, storyVersionId: source.storyVersionId, revision: 0, navigation: { allowLook: true, travel: 'directed' },
    scenes: [{ id: 'bench-scene', name: 'Escena grande', zoneId: 'aeropuerto-entrada', entryIds: [], shot: { position: [0, 5, 20], target: [0, 1, 0], fov: 42, transition: 0 }, actors, sequences }] };
  validateProject(project, source);
  return { project, source };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('bench-director.ts')) {
  const { project } = bigScene(), last = 9, prefix = Array.from({ length: last }, (_, i) => i);
  // «directo»: llamada suelta, recalcula todos los momentos anteriores. «director»: con la caché de prefijos.
  for (const [label, cache] of [['directo', undefined], ['director', new Map()]] as const) {
    for (let i = 0; i < 30; i++) sampleSequence(project, last, (i % 90) / 10, prefix, cache);
    const times: number[] = [];
    for (let i = 0; i < 300; i++) { const t0 = performance.now(); sampleSequence(project, last, (i % 90) / 10, prefix, cache); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    const q = (p: number) => times[Math.floor(p * (times.length - 1))].toFixed(2);
    console.log(`sampleSequence ${label.padEnd(8)} · 20 actores · 1000 cues · último momento: mediana ${q(.5)} ms · p95 ${q(.95)} ms · máx ${q(1)} ms`);
  }
}
