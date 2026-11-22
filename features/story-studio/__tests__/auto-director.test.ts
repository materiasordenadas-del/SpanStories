import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirection, DEFAULT_PACE, fingerprint, GENERATOR, isEdited, PACES, proposeDirection } from '../auto-director.ts';
import { actorCueFingerprint, autoStageDialogue, deleteCue } from '../editing.ts';
import { sampleSequence } from '../director.ts';
import { sequenceDuration, sequenceList, validateProject, type Actor, type Cue, type Sequence, type StudioProject, type StudioScene, type StudioSource } from '../model.ts';
import type { CameraRig, DirectorPace } from '../camera-model.ts';
import { buildMiniHistoria } from './fixtures/mini-historia.ts';

/* ───────────── Utilidades ───────────── */

type Switch = Extract<Cue, { kind: 'cameraSwitch' }>;
type Line = Extract<Cue, { kind: 'dialogue' }>;
const SENT = (n: number) => `sent-mini-camaras-prueba-${n}`;
const dl = (id: string, at: number, duration: number, sentence: number, speakerId: string | null): Line => ({ id, kind: 'dialogue', at, duration, sentenceId: SENT(sentence), speakerId });
let counter = 0;
/** ids deterministas y nunca repetidos en todo el archivo (como randomUUID). */
const uid = () => `t${counter++}`;

const A = 'act-a', B = 'act-b', C = 'act-c';
/** Escena controlada: A y B quietos sobre el eje X, plano de la escena desde +Z (lado positivo del eje A→B). */
function controlled(sequences: Sequence[], extra: Partial<StudioScene> = {}, more: Actor[] = []): { project: StudioProject; source: StudioSource } {
  const { project, source } = buildMiniHistoria();
  const scene = project.scenes[0];
  scene.actors = [
    { id: A, characterId: 'rachel', name: 'Rachel', position: [0, 0, 0], rotation: Math.PI / 2, height: 1.65 },
    { id: B, characterId: 'mia', name: 'Mia', position: [2, 0, 0], rotation: -Math.PI / 2, height: 1.6 },
    ...more,
  ];
  scene.shot = { position: [1, 2, 8], target: [1, 1, 0], fov: 40, transition: 0 };
  scene.sequences = sequences;
  Object.assign(scene, extra);
  validateProject(project, source);
  return { project, source };
}
const sceneOf = (p: StudioProject) => p.scenes[0];
const switchesOf = (q: Sequence) => q.cues.filter((c): c is Switch => c.kind === 'cameraSwitch').sort((x, y) => x.at - y.at);
const generatedOf = (q: Sequence) => switchesOf(q).filter(c => c.origin?.generator === GENERATOR);
const cameraBySlot = (scene: StudioScene, slot: string) => scene.cameras?.find(c => c.origin?.slot === slot);
const slotOfCamera = (scene: StudioScene, id: string) => scene.cameras?.find(c => c.id === id)?.origin?.slot ?? `manual:${id}`;
// Separación mínima entre cambios = minShot del ritmo (el tope por minuto se comprueba aparte, en ventanas de 60 s).
const spacingOf = (pace: DirectorPace) => PACES[pace].minShot;
const clear = (at: number, lock: number, spacing: number) => Math.abs(at - lock) >= spacing - .006;

function direct(project: StudioProject, source: StudioSource, batchId = 'lote') {
  const proposal = proposeDirection(project, sceneOf(project).id, source, batchId);
  return { proposal, ...applyDirection(project, proposal, uid) };
}

/** Proyecto válido y reproducible: sin NaN y nunca position == target en ningún momento. */
function assertPlayable(project: StudioProject, source: StudioSource, label = '') {
  validateProject(project, source);
  const list = sequenceList(project);
  for (let i = 0; i < list.length; i++) {
    const d = sequenceDuration(list[i].sequence);
    for (const t of [0, .1, d * .25, d * .5, d * .75, Math.max(0, d - .05), d]) {
      const { shot } = sampleSequence(project, i, t);
      const all = [...shot.position, ...shot.target, shot.fov];
      assert(all.every(Number.isFinite), `${label} NaN en ${list[i].sequence.id} @${t}`);
      assert(shot.position.some((v, k) => Math.abs(v - shot.target[k]) > 1e-6), `${label} position == target en ${list[i].sequence.id} @${t}`);
    }
  }
}

/** Lado respecto al eje que une a dos actores (signo del producto vectorial en el plano XZ). */
const sideOf = (a: readonly number[], b: readonly number[], p: readonly number[]) => (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]);

/** Copia comparable de una escena dirigida: sin ids de cambio ni lote (cambian en cada aplicación). */
function comparable(scene: StudioScene) {
  return {
    cameras: (scene.cameras ?? []).map(c => ({ ...c, origin: c.origin && { ...c.origin, batchId: '*' } })),
    sequences: scene.sequences.map(q => q.cues.map(c => c.kind === 'cameraSwitch' && c.origin ? { ...c, id: '*', origin: { ...c.origin, batchId: '*' } } : c)),
    autoDirection: scene.autoDirection,
  };
}

/* ───────────── Gramática: general → quien habla → quien responde → conjunto ───────────── */

test('A-B-A con tiempo suficiente: general / A / B / A / conjunto, con cortes J y cierre en mezcla', () => {
  const { project, source } = controlled([
    { id: 'q', name: 'Charla', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 24, cues: [dl('l1', 5, 4.5, 1, A), dl('l2', 10, 4.5, 2, B), dl('l3', 15, 4.5, 3, A)] },
  ]);
  const { proposal, project: p } = direct(project, source);
  assert.deepEqual(proposal.switches.map(s => s.cameraSlot), ['cam:general', `cam:close:0:${A}`, `cam:close:0:${B}`, `cam:close:0:${A}`, 'cam:two:0']);
  assert.deepEqual(proposal.switches.map(s => s.at), [0, 4.7, 9.7, 14.7, 19.5]);
  assert.equal(proposal.switches.at(-1)!.transition.kind, 'blend');
  assert(proposal.switches.slice(0, -1).every(s => s.transition.kind === 'cut'));
  // Solo se proponen cámaras usadas: general, dos primeros planos y conjunto.
  assert.deepEqual(proposal.cameras.map(c => c.slot).sort(), ['cam:close:0:act-a', 'cam:close:0:act-b', 'cam:general', 'cam:two:0']);
  const scene = sceneOf(p), seq = scene.sequences[0];
  assert.deepEqual(generatedOf(seq).map(s => slotOfCamera(scene, s.cameraId)), proposal.switches.map(s => s.cameraSlot));
  assert(scene.cameras!.every(c => c.origin?.generator === GENERATOR && c.origin.fingerprint === fingerprint(c)));
  assert(generatedOf(seq).every(c => !isEdited(c)));
  assertPlayable(p, source);
});

test('A-B-A en ritmo dinámico: la misma gramática cabe en menos tiempo', () => {
  const { project, source } = controlled([
    { id: 'q', name: 'Charla', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 12.1, cues: [dl('l1', 2.5, 2.4, 1, A), dl('l2', 5, 2.4, 2, B), dl('l3', 7.5, 2.4, 3, A)] },
  ], { autoDirection: { suppressed: [], pace: 'dinamico' } });
  const { proposal, project: p } = direct(project, source);
  assert.deepEqual(proposal.switches.map(s => s.cameraSlot), ['cam:general', `cam:close:0:${A}`, `cam:close:0:${B}`, `cam:close:0:${A}`, 'cam:two:0']);
  assertPlayable(p, source);
});

test('corte J: el cambio llega jlOffset antes que la voz (0,3 s por defecto)', () => {
  const sequences = (): Sequence[] => [{ id: 'q', name: 'Uno', gate: { kind: 'continue', prompt: 'Sigue' }, cues: [dl('l1', 6, 3, 1, A)] }];
  for (const [jlOffset, expected] of [[undefined, 5.7], [.5, 5.5], [0, 6], [-.2, 6.2]] as const) {
    const { project, source } = controlled(sequences(), jlOffset === undefined ? {} : { autoDirection: { suppressed: [], jlOffset } });
    const { proposal } = direct(project, source);
    assert.equal(proposal.switches.find(s => s.slot === 'dlg:l1:speaker')?.at, expected, `jl=${jlOffset}`);
  }
});

test('regla de 180°: primeros planos y conjunto del mismo lado del eje que el plano general', () => {
  // Varias disposiciones: eje en X, en diagonal, plano de escena a cada lado.
  const layouts: [readonly number[], readonly number[], readonly number[]][] = [
    [[0, 0, 0], [2, 0, 0], [1, 2, 8]], [[0, 0, 0], [2, 0, 0], [1, 2, -8]],
    [[3, 0, -1], [5, 0, 2], [10, 2, 0]], [[3, 0, -1], [5, 0, 2], [-4, 2, 3]], [[-2, 0, 4], [-2.5, 0, 1], [-9, 1.5, 2]],
  ];
  for (const [pa, pb, shot] of layouts) {
    const { project, source } = controlled([
      { id: 'q', name: 'Charla', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 24, cues: [dl('l1', 5, 4.5, 1, A), dl('l2', 10, 4.5, 2, B), dl('l3', 15, 4.5, 3, A)] },
    ]);
    const scene = sceneOf(project);
    scene.actors[0].position = pa as Actor['position']; scene.actors[1].position = pb as Actor['position'];
    scene.shot = { position: shot as Actor['position'], target: [(pa[0] + pb[0]) / 2, 1, (pa[2] + pb[2]) / 2], fov: 40, transition: 0 };
    const { project: p } = direct(project, source);
    const s = sceneOf(p), general = cameraBySlot(s, 'cam:general')!;
    const side = Math.sign(sideOf(pa, pb, general.base.position));
    assert.notEqual(side, 0);
    assert.equal(side, Math.sign(sideOf(pa, pb, shot)), 'el general mira desde el lado del plano de la escena');
    for (const slot of [`cam:close:0:${A}`, `cam:close:0:${B}`, 'cam:two:0']) {
      const cam = cameraBySlot(s, slot)!;
      assert.equal(Math.sign(sideOf(pa, pb, cam.base.position)), side, `${slot} cruza el eje en ${JSON.stringify([pa, pb, shot])}`);
      if (cam.body.kind === 'follow') {
        const actor = s.actors.find(x => x.id === (cam.body as { actorId: string }).actorId)!;
        const o = cam.body.offset, pos = [actor.position[0] + o[0], 0, actor.position[2] + o[2]];
        assert.equal(Math.sign(sideOf(pa, pb, pos)), side, `${slot}: el seguimiento cruza el eje`);
      }
    }
    assertPlayable(p, source);
  }
});

test('el eje se fija al empezar el intercambio: andar después no lo cambia', () => {
  const walk: Cue = { id: 'walk-b', kind: 'actor', at: 9.5, duration: 2, actorId: B, action: 'walk', destination: [1, 0, -3] };
  const make = (cues: Cue[]) => controlled([{ id: 'q', name: 'Charla', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 24, cues: [dl('l1', 5, 4.5, 1, A), dl('l2', 12, 4.5, 2, B), dl('l3', 17, 4.5, 3, A), ...cues] }]);
  const still = make([]), moving = make([walk]);
  const a = proposeDirection(still.project, 'mh-escena', still.source), b = proposeDirection(moving.project, 'mh-escena', moving.source);
  // Mismas cámaras (todas calculadas con las posiciones al empezar el intercambio, antes de la caminata).
  assert.deepEqual(b.cameras, a.cameras);
  assertPlayable(applyDirection(moving.project, b, uid).project, moving.source);
});

test('un tercer hablante abre un intercambio nuevo con sus propias cámaras numeradas', () => {
  const { project, source } = controlled([
    { id: 'q', name: 'Charla', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 40, cues: [dl('l1', 5, 4.5, 1, A), dl('l2', 10, 4.5, 2, B), dl('l3', 20, 4.5, 3, C), dl('l4', 26, 4.5, 4, A)] },
  ], {}, [{ id: C, characterId: 'rachel', name: 'Carla', position: [1, 0, -2], rotation: 0, height: 1.7 }]);
  const { proposal, project: p } = direct(project, source);
  const slots = proposal.switches.map(s => s.cameraSlot);
  assert(slots.includes(`cam:close:1:${C}`) && slots.includes(`cam:close:1:${A}`), slots.join(' '));
  assertPlayable(p, source);
});

/* ───────────── Ritmo ───────────── */

test('ritmo: tranquilo por defecto; separación mínima y tope de cortes por minuto en cada momento', () => {
  assert.equal(DEFAULT_PACE, 'tranquilo');
  for (const pace of [undefined, 'tranquilo', 'normal', 'dinamico'] as const) {
    // Diálogo denso: una frase cada 1,2 s durante dos minutos.
    const cues = Array.from({ length: 100 }, (_, i) => dl(`l${i}`, i * 1.2, 1.1, 1 + (i % 6), i % 2 ? B : A));
    const { project, source } = controlled([{ id: 'q', name: 'Denso', gate: { kind: 'continue', prompt: 'Sigue' }, cues }], pace ? { autoDirection: { suppressed: [], pace } } : {});
    const { project: p } = direct(project, source);
    const pc: (typeof PACES)[DirectorPace] = PACES[pace ?? DEFAULT_PACE];
    const at: number[] = generatedOf(sceneOf(p).sequences[0]).map(s => s.at);
    assert(at.length > 5, `${pace}: debería cortar`);
    for (let i = 1; i < at.length; i++) assert(at[i] - at[i - 1] >= pc.minShot - 1e-9, `${pace}: ${at[i - 1]} → ${at[i]}`);
    for (const start of at) assert(at.filter(t => t >= start && t < start + 60).length <= pc.maxCutsPerMinute, `${pace}: demasiados cortes por minuto desde ${start}`);
    if (pace === 'dinamico') assert(at.length > generatedOf(sceneOf(direct(controlled([{ id: 'q', name: 'Denso', gate: { kind: 'continue', prompt: 'Sigue' }, cues }]).project, source).project).sequences[0]).length, 'dinámico corta más que tranquilo');
    assertPlayable(p, source);
  }
});

test('ritmo: la separación mínima es la de PACES (2,5 / 2 / 1,5 s) si no se supera el tope por minuto', () => {
  for (const pace of ['tranquilo', 'normal', 'dinamico'] as const) {
    const gap = PACES[pace].minShot + .1;
    // Tres frases separadas por algo más del mínimo: 4 cortes en ~10 s, muy por debajo del tope por minuto.
    const { project, source } = controlled([{ id: 'q', name: 'Uno', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 30, cues: [dl('l1', 5, gap - .1, 1, A), dl('l2', 5 + gap, gap - .1, 2, B), dl('l3', 5 + gap * 2, gap - .1, 3, A)] }], { autoDirection: { suppressed: [], pace } });
    const { proposal } = direct(project, source);
    for (const id of ['l1', 'l2', 'l3']) assert(proposal.switches.some(s => s.slot === `dlg:${id}:speaker`), `${pace}: falta el plano de ${id}`);
  }
});

test('ritmo entre momentos encadenados por puerta automática: no hay cortes más juntos que el mínimo', () => {
  const { project, source } = controlled([
    { id: 'q1', name: 'Uno', gate: { kind: 'auto' }, duration: 5.2, cues: [dl('l1', 5, .2, 1, A)] },
    { id: 'q2', name: 'Dos', gate: { kind: 'continue', prompt: 'Sigue' }, cues: [dl('l2', .2, 3, 2, B)] },
  ]);
  const { project: p } = direct(project, source);
  const [q1, q2] = sceneOf(p).sequences, d1 = sequenceDuration(q1);
  const times = [...generatedOf(q1).map(s => s.at), ...generatedOf(q2).map(s => d1 + s.at)].sort((x, y) => x - y);
  for (let i = 1; i < times.length; i++) assert(times[i] - times[i - 1] >= PACES[DEFAULT_PACE].minShot - 1e-9, `cortes a ${times[i - 1]} y ${times[i]} (absoluto)`);
});

/* ───────────── Puertas de objeto ───────────── */

test('puerta de objeto con tiempo: el momento termina en plano general', () => {
  const { project, source } = controlled([
    { id: 'q1', name: 'Uno', gate: { kind: 'continue', prompt: 'Sigue' }, cues: [dl('l1', 1, 2, 1, A)] },
    { id: 'q2', name: 'Toca', gate: { kind: 'object', prompt: 'Toca el café', entryIds: ['cafe'] }, duration: 12, cues: [dl('l2', 1, 4, 2, B)] },
  ], { entryIds: ['cafe'] });
  const { project: p } = direct(project, source);
  const scene = sceneOf(p), last = generatedOf(scene.sequences[1]).at(-1)!;
  assert.equal(slotOfCamera(scene, last.cameraId), 'cam:general');
  assert.equal(last.origin!.slot, 'gate:q2');
  assertPlayable(p, source);
});

test('puerta de objeto en un momento corto: también termina en plano general', () => {
  const { project, source } = controlled([
    { id: 'q1', name: 'Uno', gate: { kind: 'continue', prompt: 'Sigue' }, cues: [dl('l1', 1, 2, 1, A)] },
    { id: 'q2', name: 'Toca', gate: { kind: 'object', prompt: 'Toca el café', entryIds: ['cafe'] }, cues: [dl('l2', 0, 2, 2, B)] },
  ], { entryIds: ['cafe'] });
  const { project: p } = direct(project, source);
  const scene = sceneOf(p), last = generatedOf(scene.sequences[1]).at(-1);
  assert.equal(last && slotOfCamera(scene, last.cameraId), 'cam:general');
});

/* ───────────── Plano detalle léxico ───────────── */

test('plano detalle: reutiliza la cámara existente que mira el objeto nombrado y vuelve a quien habla', () => {
  const detail: CameraRig = { id: 'cam-taza', name: 'Taza', base: { position: [1, 1.5, 2], target: [1, .9, 0], fov: 30, transition: 0 }, body: { kind: 'static' }, aim: { kind: 'point', point: [1, .9, 0], entryId: 'cafe' } };
  const { project, source } = controlled([
    // Frase 3: «Bien. ¿Tomamos un café?»
    { id: 'q', name: 'Café', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 14, cues: [dl('l1', 3, 5, 3, A)] },
  ], { entryIds: ['cafe'], cameras: [detail], autoDirection: { suppressed: [], pace: 'dinamico' } });
  const { proposal, project: p } = direct(project, source);
  assert(!proposal.cameras.some(c => c.slot.startsWith('existing:')), 'la cámara existente no se propone como nueva');
  const sw = generatedOf(sceneOf(p).sequences[0]);
  assert(sw.some(s => s.cameraId === 'cam-taza' && s.origin!.slot === 'dlg:l1:detail'));
  assert.deepEqual(sceneOf(p).cameras!.find(c => c.id === 'cam-taza'), detail);
  assert(sw.some(s => s.origin!.slot === 'dlg:l1:back'), 'falta la vuelta a quien habla');
});

/* ───────────── Protección del trabajo manual ───────────── */

function withManual() {
  const manualCam: CameraRig = { id: 'cam-mano', name: 'A mano', base: { position: [1, 3, 6], target: [1, 1, 0], fov: 45, transition: 0 }, body: { kind: 'static' }, aim: { kind: 'fixed' } };
  const manualSwitch: Switch = { id: 'sw-mano', kind: 'cameraSwitch', at: 10, duration: .5, cameraId: 'cam-mano', label: 'A mano', transition: { kind: 'cut' } };
  const legacy: Cue = { id: 'cam-antigua', kind: 'camera', at: 20, duration: .5, label: 'Antigua', shot: { position: [0, 2, 5], target: [1, 1, 0], fov: 40, transition: 0 } };
  return controlled([
    { id: 'q1', name: 'Uno', gate: { kind: 'auto' }, cues: [dl('l1', 1, 2.5, 1, A), dl('l2', 5, 2.5, 2, B), dl('l3', 9, 2.5, 3, A), dl('l4', 13, 2.5, 4, B), dl('l5', 18, 2.5, 5, A), dl('l6', 22, 2.5, 6, B), manualSwitch, legacy] },
    { id: 'q2', name: 'Dos', gate: { kind: 'continue', prompt: 'Sigue' }, duration: 20, cues: [dl('l7', 4, 3, 1, B), dl('l8', 9, 3, 2, A)] },
  ], { cameras: [manualCam] });
}

test('lo manual queda intacto y bloquea su intervalo; aplicar no muta la entrada', () => {
  const { project, source } = withManual(), before = structuredClone(project);
  const { project: p, summary } = direct(project, source);
  assert.deepEqual(project, before, 'applyDirection es puro');
  const scene = sceneOf(p), q1 = scene.sequences[0], spacing = spacingOf(DEFAULT_PACE);
  assert.deepEqual(scene.cameras!.find(c => c.id === 'cam-mano'), sceneOf(before).cameras![0]);
  assert.deepEqual(q1.cues.find(c => c.id === 'sw-mano'), sceneOf(before).sequences[0].cues.find(c => c.id === 'sw-mano'));
  assert.deepEqual(q1.cues.find(c => c.id === 'cam-antigua'), sceneOf(before).sequences[0].cues.find(c => c.id === 'cam-antigua'));
  for (const g of generatedOf(q1)) for (const l of [10, 20]) assert(clear(g.at, l, spacing), `${g.origin!.slot} a ${g.at} pisa el manual de ${l}`);
  assert(summary.created > 0);
  assertPlayable(p, source);
});

test('ciclo: proponer y aplicar → mover a mano un cambio generado → borrar otro → regenerar', () => {
  const { project, source } = withManual();
  const first = direct(project, source, 'lote-1').project;
  const q2 = sceneOf(first).sequences[1], gen = generatedOf(q2);
  assert(gen.length >= 2, gen.map(s => s.origin!.slot).join(' '));
  // Editar a mano: mover en el tiempo el cambio de la primera frase de q2.
  const edited = structuredClone(first), moved = generatedOf(sceneOf(edited).sequences[1]).find(s => s.origin!.slot === 'dlg:l7:speaker')!;
  moved.at = Math.round((moved.at + .4) * 100) / 100;
  assert(isEdited(moved));
  const movedCopy = structuredClone(moved);
  // Borrar otro generado: queda suprimido.
  const victim = generatedOf(sceneOf(edited).sequences[1]).find(s => s.origin!.slot === 'dlg:l8:speaker')!;
  const deleted = deleteCue(edited, 'q2', victim.id);
  assert.deepEqual(sceneOf(deleted).autoDirection?.suppressed, ['dlg:l8:speaker']);
  validateProject(deleted, source);
  const before = structuredClone(deleted);
  // Regenerar: un único resultado (un paso de deshacer) y la entrada sin tocar.
  const { project: again, summary } = direct(deleted, source, 'lote-2');
  assert.deepEqual(deleted, before);
  const q2b = sceneOf(again).sequences[1];
  assert.deepEqual(q2b.cues.find(c => c.id === movedCopy.id), movedCopy, 'el editado sigue igual');
  assert.equal(q2b.cues.filter(c => c.kind === 'cameraSwitch' && c.origin?.slot === 'dlg:l7:speaker').length, 1, 'el editado no se duplica');
  assert(!sceneOf(again).sequences.some(q => q.cues.some(c => c.kind === 'cameraSwitch' && c.origin?.slot === 'dlg:l8:speaker')), 'el borrado no reaparece');
  assert(sceneOf(again).cameras!.some(c => c.id === movedCopy.cameraId), 'la cámara del editado sigue existiendo');
  assert.equal(summary.suppressed, 1);
  assert(summary.keptEdited >= 1);
  // Lo editado cuenta como bloqueo: ningún generado nuevo demasiado cerca.
  const spacing = spacingOf(DEFAULT_PACE);
  for (const g of generatedOf(q2b)) if (g.id !== movedCopy.id) assert(clear(g.at, movedCopy.at, spacing), `${g.origin!.slot} a ${g.at}`);
  assertPlayable(again, source);
  // Y regenerar otra vez sin cambios es estable.
  const third = direct(again, source, 'lote-3').project;
  assert.deepEqual(comparable(sceneOf(third)), comparable(sceneOf(again)));
});

test('una cámara generada editada a mano se conserva con su id y sus cambios', () => {
  const { project, source } = withManual();
  const first = direct(project, source).project, edited = structuredClone(first);
  const cam = cameraBySlot(sceneOf(edited), `cam:close:0:${A}`)!;
  cam.base.fov = 50; cam.name = 'Rachel retocada';
  assert(isEdited(cam));
  const keep = structuredClone(cam);
  const { project: again, summary } = direct(edited, source);
  assert.deepEqual(sceneOf(again).cameras!.find(c => c.id === keep.id), keep);
  assert.equal(sceneOf(again).cameras!.filter(c => c.origin?.slot === keep.origin!.slot).length, 1);
  assert(summary.keptEdited >= 1);
  // Los cambios generados que la usaban siguen apuntando a ella.
  assert(sceneOf(again).sequences.some(q => q.cues.some(c => c.kind === 'cameraSwitch' && c.cameraId === keep.id)));
  assertPlayable(again, source);
});

test('regenerar dos veces seguidas sin cambios es estable (mismos cues, cámaras e ids de cámara)', () => {
  for (const make of [withManual, () => { const h = buildMiniHistoria(); return { project: h.project, source: h.source }; }]) {
    const { project, source } = make();
    const once = direct(project, source, 'a'), twice = direct(once.project, source, 'b');
    assert.deepEqual(comparable(sceneOf(twice.project)), comparable(sceneOf(once.project)));
    assert.deepEqual(sceneOf(twice.project).cameras?.map(c => c.id), sceneOf(once.project).cameras?.map(c => c.id));
    assert.deepEqual(twice.proposal.switches, once.proposal.switches);
    assert.equal(twice.summary.created, once.proposal.switches.length);
    assert.equal(twice.summary.removed, once.proposal.switches.length);
    assert.equal(twice.summary.replaced, once.proposal.cameras.length);
    assertPlayable(twice.project, source);
  }
});

test('la minihistoria completa: la dirección automática es válida y reproducible', () => {
  const h = buildMiniHistoria();
  const stripped = structuredClone(h.project);
  for (const q of sceneOf(stripped).sequences) q.cues = q.cues.filter(c => c.kind !== 'camera');
  for (const project of [h.project, stripped]) {
    const { project: p } = direct(project, h.source);
    assertPlayable(p, h.source);
  }
  assert.throws(() => proposeDirection(h.project, 'no-existe', h.source), /ya no existe/);
  const empty = structuredClone(h.project); sceneOf(empty).actors = []; for (const q of sceneOf(empty).sequences) q.cues = q.cues.filter(c => c.kind === 'dialogue' || c.kind === 'camera').map(c => c.kind === 'dialogue' ? { ...c, speakerId: null } : c);
  assert.throws(() => proposeDirection(empty, 'mh-escena', h.source), /Coloca primero/);
});

/* ───────────── autoStageDialogue ───────────── */

test('autoStageDialogue: sin editar da lo de siempre (salvo origin); lo editado se conserva; lo suprimido no vuelve', () => {
  const h = buildMiniHistoria(), source = h.source;
  // mh-2-dlg ya tiene la actuación antigua (sin origin): regenerar da exactamente lo mismo más el origin.
  const legacy = h.project.scenes[0].sequences[1].cues.filter(c => c.id.startsWith('auto:mh-2-dlg:'));
  const r0 = autoStageDialogue(h.project, 'mh-2-respuesta', 'mh-2-dlg');
  validateProject(r0.project, source);
  const fresh = r0.project.scenes[0].sequences[1].cues.filter(c => c.id.startsWith('auto:mh-2-dlg:'));
  assert.deepEqual(fresh.map(c => { const { origin, ...rest } = c as Extract<Cue, { kind: 'actor' }>; assert.equal(origin!.generator, 'auto-stage@1'); return rest; }).sort((a, b) => a.id.localeCompare(b.id)), [...legacy].sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(r0.created, 2);

  // Escena controlada: actuación nueva, con forma exacta.
  const { project } = controlled([{ id: 'q', name: 'Uno', gate: { kind: 'continue', prompt: 'Sigue' }, cues: [dl('l1', 1, 2, 1, A)] }]);
  const r1 = autoStageDialogue(project, 'q', 'l1');
  const strip = (cues: Cue[]) => cues.filter(c => c.kind === 'actor').map(c => { const { origin, ...rest } = c as Extract<Cue, { kind: 'actor' }>; return rest; });
  assert.deepEqual(strip(r1.project.scenes[0].sequences[0].cues), [
    { at: 1, duration: 2, kind: 'actor', actorId: A, id: 'auto:l1:talk', action: 'talk' },
    { at: 1, duration: 2, kind: 'actor', actorId: B, id: `auto:l1:listen:${B}`, action: 'listen', lookAt: A },
  ]);
  for (const c of r1.project.scenes[0].sequences[0].cues) if (c.kind === 'actor') assert.equal(c.origin!.fingerprint, actorCueFingerprint(c));
  // Repetir sin cambios: idéntico.
  const r2 = autoStageDialogue(r1.project, 'q', 'l1');
  assert.deepEqual(r2.project, r1.project);

  // Editar la escucha (la mira otra vez pero más tarde) → se conserva; borrar el habla → suprimido.
  const edited = structuredClone(r2.project), listen = edited.scenes[0].sequences[0].cues.find(c => c.id === `auto:l1:listen:${B}`) as Extract<Cue, { kind: 'actor' }>;
  listen.at = 1.4; listen.expression = 'sorpresa';
  const keep = structuredClone(listen);
  const removed = deleteCue(edited, 'q', 'auto:l1:talk');
  assert.deepEqual(sceneOf(removed).autoDirection?.suppressed, ['dlg:l1:talk']);
  const r3 = autoStageDialogue(removed, 'q', 'l1');
  validateProject(r3.project, source);
  const cues = r3.project.scenes[0].sequences[0].cues;
  assert.deepEqual(cues.find(c => c.id === keep.id), keep);
  assert(!cues.some(c => c.id === 'auto:l1:talk'), 'el suprimido no vuelve');
  assert.equal(r3.created, 0);
  assert.equal(new Set(cues.map(c => c.id)).size, cues.length, 'ids únicos');
  // Una actuación manual que se solapa sigue respetándose.
  const manual = structuredClone(project); manual.scenes[0].sequences[0].cues.push({ id: 'saluda', kind: 'actor', at: 1.5, duration: 1, actorId: B, action: 'wave' });
  assert.deepEqual(autoStageDialogue(manual, 'q', 'l1').skipped, ['Mia']);
});

/* ───────────── Propiedades ───────────── */

function randomScene(seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const { project, source } = buildMiniHistoria();
  const scene = sceneOf(project), n = 2 + Math.floor(rnd() * 2);
  const actors: Actor[] = [];
  while (actors.length < n) {
    const p: Actor['position'] = [Math.round((rnd() * 10 - 5) * 10) / 10, 0, Math.round((rnd() * 10 - 5) * 10) / 10];
    if (actors.every(a => Math.hypot(a.position[0] - p[0], a.position[2] - p[2]) > 1)) actors.push({ id: `r${actors.length}`, characterId: 'rachel', name: `Actor ${actors.length}`, position: p, rotation: rnd() * 6 - 3, height: 1.5 + rnd() * .3 });
  }
  scene.actors = actors; scene.entryIds = ['cafe'];
  scene.shot = { position: [Math.round(rnd() * 20 - 10), 2, Math.round(rnd() * 20 - 10) || 9], target: [0, 1, 0], fov: 40, transition: 0 };
  scene.autoDirection = { suppressed: [], pace: pick(['tranquilo', 'normal', 'dinamico'] as const), jlOffset: pick([.3, 0, .5, -.2]) };
  scene.cameras = rnd() < .5 ? [{ id: 'cam-mano', name: 'A mano', base: { position: [0, 3, 8], target: [0, 1, 0], fov: 45, transition: 0 }, body: { kind: 'static' }, aim: { kind: 'fixed' } }] : undefined;
  let k = 0;
  scene.sequences = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i): Sequence => {
    const cues: Cue[] = [];
    let t = rnd() * 3;
    const lines = 1 + Math.floor(rnd() * 5);
    for (let j = 0; j < lines; j++) {
      const d = Math.round((1 + rnd() * 5) * 100) / 100;
      cues.push(dl(`s${seed}-l${k++}`, Math.round(t * 100) / 100, d, 1 + Math.floor(rnd() * 6), rnd() < .12 ? null : pick(actors).id));
      t += d + rnd() * 2;
    }
    if (scene.cameras && rnd() < .5) cues.push({ id: `sw-mano-${i}`, kind: 'cameraSwitch', at: Math.round(rnd() * t * 100) / 100, duration: .5, cameraId: 'cam-mano', label: 'A mano', transition: { kind: 'cut' } });
    if (rnd() < .3) cues.push({ id: `cam-antigua-${i}`, kind: 'camera', at: Math.round(rnd() * t * 100) / 100, duration: .5, label: 'Antigua', shot: { position: [0, 2, 6], target: [0, 1, 0], fov: 40, transition: rnd() < .5 ? 0 : .8 } });
    const gate = pick([{ kind: 'auto' }, { kind: 'continue', prompt: 'Sigue' }, { kind: 'object', prompt: 'Toca', entryIds: ['cafe'] }] as const);
    return { id: `s${seed}-q${i}`, name: `Momento ${i}`, gate: structuredClone(gate) as Sequence['gate'], cues, ...(rnd() < .5 ? { duration: Math.round((t + rnd() * 6) * 100) / 100 } : {}) };
  });
  validateProject(project, source);
  return { project, source, rnd, pick };
}

/** Invariantes de un resultado del director respecto al proyecto del que salió. */
function assertInvariants(before: StudioProject, after: StudioProject, source: StudioSource, label: string) {
  assertPlayable(after, source, label);
  const b = sceneOf(before), a = sceneOf(after), spacing = spacingOf(a.autoDirection?.pace ?? DEFAULT_PACE);
  const suppressed = new Set(a.autoDirection?.suppressed ?? []);
  assert.deepEqual(a.autoDirection, b.autoDirection, `${label}: el director no toca autoDirection`);
  // Cámaras manuales y editadas: idénticas.
  for (const c of b.cameras ?? []) if (c.origin?.generator !== GENERATOR || isEdited(c)) assert.deepEqual(a.cameras?.find(x => x.id === c.id), c, `${label}: cámara ${c.id}`);
  b.sequences.forEach((qb, i) => {
    const qa = a.sequences[i];
    // Todo lo que no es un cambio generado sin editar se conserva igual y en el mismo orden.
    const kept = (q: Sequence) => q.cues.filter(c => !(c.kind === 'cameraSwitch' && c.origin?.generator === GENERATOR && !isEdited(c)));
    assert.deepEqual(kept(qa), kept(qb), `${label}: ${qb.id} conserva lo manual y lo editado`);
    const locked = qa.cues.filter(c => c.kind === 'camera' || (c.kind === 'cameraSwitch' && (c.origin?.generator !== GENERATOR || isEdited(c)))).map(c => c.at);
    const fresh = generatedOf(qa).filter(c => !isEdited(c));
    const duration = sequenceDuration(qb);
    for (const g of fresh) {
      assert(!suppressed.has(g.origin!.slot), `${label}: ${g.origin!.slot} estaba suprimido`);
      assert(g.at >= 0 && g.at <= duration + 1e-9, `${label}: ${g.origin!.slot} fuera del momento`);
      for (const l of locked) assert(clear(g.at, l, spacing), `${label}: ${g.origin!.slot} a ${g.at} pisa ${l}`);
    }
    for (let k = 1; k < fresh.length; k++) assert(fresh[k].at - fresh[k - 1].at >= spacing - .006, `${label}: ${qa.id} cortes a ${fresh[k - 1].at} y ${fresh[k].at}`);
    assert.equal(new Set(fresh.map(g => g.origin!.slot)).size, fresh.length, `${label}: huecos repetidos`);
  });
  // 180°: en cada intercambio de dos hablantes, primeros planos y conjunto del lado del plano general (actores quietos).
  const general = a.cameras?.find(c => c.origin?.slot === 'cam:general' && !isEdited(c));
  if (general) {
    const groups = new Map<string, CameraRig[]>();
    for (const c of a.cameras ?? []) { const m = c.origin && !isEdited(c) && /^cam:(?:close|two):(\d+)/.exec(c.origin.slot); if (m) groups.set(m[1], [...groups.get(m[1]) ?? [], c]); }
    for (const [n, cams] of groups) {
      const ids = [...new Set(cams.flatMap(c => c.origin!.slot.startsWith('cam:close:') ? [c.origin!.slot.split(':')[3]] : []))];
      const two = cams.find(c => c.origin!.slot.startsWith('cam:two:'));
      const speakers = two?.aim.kind === 'group' ? two.aim.actorIds : ids;
      if (speakers.length !== 2) continue;
      const pa = a.actors.find(x => x.id === speakers[0])!.position, pb = a.actors.find(x => x.id === speakers[1])!.position;
      const side = sideOf(pa, pb, general.base.position);
      if (Math.abs(side) < 1e-3) continue;
      for (const c of cams) assert.equal(Math.sign(sideOf(pa, pb, c.base.position)), Math.sign(side), `${label}: ${c.origin!.slot} (intercambio ${n}) cruza el eje`);
    }
  }
}

test('propiedad: con varias semillas, aplicar / editar / borrar / regenerar mantiene todas las garantías', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { project, source, rnd, pick } = randomScene(seed * 7919);
    const label = `semilla ${seed}`;
    const first = direct(project, source, 'p1');
    assertInvariants(project, first.project, source, `${label} (1)`);
    // Estabilidad sin cambios.
    const again = direct(first.project, source, 'p2');
    assert.deepEqual(comparable(sceneOf(again.project)), comparable(sceneOf(first.project)), `${label}: inestable`);
    assert.deepEqual(sceneOf(again.project).cameras?.map(c => c.id), sceneOf(first.project).cameras?.map(c => c.id), `${label}: ids de cámara`);
    // Ediciones aleatorias del usuario.
    let p = again.project;
    const edits: Cue[] = [];
    for (let step = 0; step < 4; step++) {
      const seqs = sceneOf(p).sequences, q = pick(seqs), gen = generatedOf(q).filter(c => !isEdited(c));
      const op = Math.floor(rnd() * 5);
      if (op === 0 && gen.length) { p = structuredClone(p); const target = pick(gen).id, c = generatedOf(sceneOf(p).sequences.find(x => x.id === q.id)!).find(x => x.id === target)!; c.at = Math.round(Math.max(0, Math.min(sequenceDuration(q) - .5, c.at + (rnd() - .5))) * 100) / 100; if (isEdited(c)) edits.push(structuredClone(c)); }
      else if (op === 1 && gen.length) p = deleteCue(p, q.id, pick(gen).id);
      else if (op === 2) { p = structuredClone(p); const cam = pick(sceneOf(p).cameras ?? []); if (cam?.origin) cam.base.fov = Math.min(100, cam.base.fov + 5); }
      else if (op === 3) { const line = pick(q.cues.filter(c => c.kind === 'dialogue')); if (line) { const r = autoStageDialogue(p, q.id, line.id); p = r.project; } }
      else if (op === 4) { const line = pick(q.cues.filter(c => c.kind === 'dialogue')); if (line) { p = autoStageDialogue(p, q.id, line.id).project; const auto = pick(sceneOf(p).sequences.find(x => x.id === q.id)!.cues.filter(c => c.id.startsWith(`auto:${line.id}:`))); if (auto) p = deleteCue(p, q.id, auto.id); } }
      validateProject(p, source);
    }
    const regen = direct(p, source, 'p3');
    assertInvariants(p, regen.project, source, `${label} (regenerado)`);
    for (const e of edits) {
      const now = sceneOf(p).sequences.flatMap(q => q.cues).find(c => c.id === e.id);
      if (now) assert.deepEqual(sceneOf(regen.project).sequences.flatMap(q => q.cues).find(c => c.id === e.id), now, `${label}: editado ${e.id}`);
    }
    // Actuación automática: ids únicos y suprimidos que no vuelven, en todo el proyecto.
    const allIds = sequenceList(regen.project).flatMap(x => x.sequence.cues.map(c => c.id));
    assert.equal(new Set(allIds).size, allIds.length, `${label}: ids duplicados`);
    const suppressed = new Set(sceneOf(regen.project).autoDirection?.suppressed ?? []);
    for (const c of sequenceList(regen.project).flatMap(x => x.sequence.cues)) if ((c.kind === 'actor' || c.kind === 'cameraSwitch') && c.origin && !isEditedAny(c)) assert(!suppressed.has(c.origin.slot), `${label}: ${c.origin.slot} suprimido y presente`);
    // Y una segunda regeneración sigue estable.
    const regen2 = direct(regen.project, source, 'p4');
    assert.deepEqual(comparable(sceneOf(regen2.project)), comparable(sceneOf(regen.project)), `${label}: inestable tras editar`);
  }
});

const isEditedAny = (c: Extract<Cue, { kind: 'actor' | 'cameraSwitch' }>) => c.kind === 'actor' ? !!c.origin && c.origin.fingerprint !== actorCueFingerprint(c) : isEdited(c);
