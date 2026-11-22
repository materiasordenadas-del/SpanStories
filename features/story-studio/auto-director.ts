import { cameraVisitAt } from './director.ts';
import { headOffset } from './camera-eval.ts';
import { stableHash, type AutoOrigin, type CameraRig, type DirectorPace } from './camera-model.ts';
import { sequenceDuration, sequenceList, type Actor, type Cue, type StudioProject, type StudioScene, type StudioSource, type Vec3 } from './model.ts';

/**
 * Director automático de diálogos (plan, 4.5 y 4.7). Puro: propone cámaras y cambios de cámara y los aplica
 * sin pisar el trabajo hecho a mano.
 * - Huella (`fingerprint`) del contenido al generarlo: si ya no coincide, alguien lo editó y se conserva.
 * - Hueco (`slot`) estable: lo generado sin editar se reemplaza por hueco; los huecos que el usuario borró
 *   (`autoDirection.suppressed`) no se recrean.
 * - Lo manual y lo editado son intervalos bloqueados: la propuesta planifica alrededor.
 */
export const GENERATOR = 'auto-director@1' as const;
export const PACES: Record<DirectorPace, { minShot: number; maxCutsPerMinute: number }> = {
  tranquilo: { minShot: 2.5, maxCutsPerMinute: 14 },
  normal: { minShot: 2, maxCutsPerMinute: 20 },
  dinamico: { minShot: 1.5, maxCutsPerMinute: 28 },
};
export const DEFAULT_PACE: DirectorPace = 'tranquilo';

type Switch = Extract<Cue, { kind: 'cameraSwitch' }>;
const round = (n: number) => Math.round(n * 100) / 100;
const r3 = (v: readonly number[]): Vec3 => [round(v[0]), round(v[1]), round(v[2])];
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Huella del contenido semántico (sin id ni origen). */
export function fingerprint(value: CameraRig | Switch): string {
  if ('kind' in value && value.kind === 'cameraSwitch') return stableHash(JSON.stringify([value.at, value.duration, value.cameraId, value.transition, value.label]));
  const c = value as CameraRig;
  return stableHash(JSON.stringify([c.name, c.base, c.body, c.aim, c.lens ?? null, c.cutOnly ?? false]));
}
const isGenerated = (origin: AutoOrigin | undefined) => origin?.generator === GENERATOR;
export const isEdited = (value: CameraRig | Switch) => !!value.origin && value.origin.fingerprint !== fingerprint(value);

type ProposedCamera = Omit<CameraRig, 'id'> & { slot: string };
type ProposedSwitch = { sequenceId: string; slot: string; cameraSlot: string; at: number; duration: number; label: string; transition: Switch['transition'] };
export type DirectionProposal = { sceneId: string; batchId: string; cameras: ProposedCamera[]; switches: ProposedSwitch[] };

/** Posición de cada actor al empezar un diálogo (previsualización lineal del editor). */
function actorsAt(project: StudioProject, sequenceId: string, at: number): readonly Actor[] {
  const list = sequenceList(project), index = list.findIndex(x => x.sequence.id === sequenceId);
  const visit = cameraVisitAt(project, index, at);
  return visit.actorsAt(visit.now);
}

export function proposeDirection(project: StudioProject, sceneId: string, source: StudioSource, batchId = 'batch'): DirectionProposal {
  const scene = project.scenes.find(s => s.id === sceneId);
  if (!scene) throw new Error('La escena ya no existe.');
  if (!scene.actors.length) throw new Error('Coloca primero a los personajes: el director encuadra a quienes hablan.');
  const pace = PACES[scene.autoDirection?.pace ?? DEFAULT_PACE], jl = scene.autoDirection?.jlOffset ?? .3;
  // Separación mínima entre cambios: la del ritmo. El tope de cortes por minuto se cuenta aparte, en ventanas de 60 s.
  const spacing = pace.minShot, EPS = .006;
  const cameras = new Map<string, ProposedCamera>(), switches: ProposedSwitch[] = [];
  const startActors = actorsAt(project, scene.sequences[0].id, 0);

  // Plano general: todos los personajes, desde el lado del plano de la escena (continuidad con lo que ya se ve).
  const framing = (actors: readonly Actor[], side: number, axis: { a: Actor; b: Actor } | null, fov: number) => {
    const c = actors.reduce((s, a) => [s[0] + a.position[0] / actors.length, s[1] + a.position[1] / actors.length, s[2] + a.position[2] / actors.length], [0, 0, 0]);
    const span = Math.max(1.2, ...actors.map(a => Math.hypot(a.position[0] - c[0], a.position[2] - c[2]) * 2 + .8));
    // Cálculo de distancia con la relación de aspecto más estrecha prevista habitual (4:3): nadie fuera de cuadro.
    const hfov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 4 / 3), d = Math.max(3, span / 2 / Math.tan(hfov / 2) * 1.15);
    let dir: [number, number];
    if (axis) { const u = [axis.b.position[0] - axis.a.position[0], axis.b.position[2] - axis.a.position[2]], l = Math.hypot(u[0], u[1]) || 1; dir = [-u[1] / l * side, u[0] / l * side]; }
    else { const s = [scene.shot.position[0] - c[0], scene.shot.position[2] - c[2]], l = Math.hypot(s[0], s[1]) || 1; dir = [s[0] / l, s[1] / l]; }
    const h = Math.max(...actors.map(a => a.height));
    return { position: r3([c[0] + dir[0] * d, c[1] + h * .95 + d * .12, c[2] + dir[1] * d]), target: r3([c[0], c[1] + h * .55, c[2]]) };
  };
  const general = framing(startActors, 1, null, 40);
  cameras.set('cam:general', { slot: 'cam:general', name: 'General (propuesta)', base: { ...general, fov: 40, transition: 0 }, body: { kind: 'static' }, aim: { kind: 'fixed' }, origin: undefined });

  // Intercambios: tramos seguidos de diálogo entre la misma pareja. El eje de 180° se fija al empezar cada uno.
  type Line = { sequenceId: string; cue: Extract<Cue, { kind: 'dialogue' }> };
  const lines: Line[] = scene.sequences.flatMap(sequence => sequence.cues.filter((c): c is Line['cue'] => c.kind === 'dialogue').sort((a, b) => a.at - b.at).map(cue => ({ sequenceId: sequence.id, cue })));
  const exchanges: { speakers: Set<string>; lines: Line[] }[] = [];
  for (const line of lines) {
    const speaker = line.cue.speakerId, last = exchanges.at(-1);
    // Un intercambio admite como mucho dos hablantes; el narrador se une al que está en curso.
    if (last && (!speaker || last.speakers.has(speaker) || last.speakers.size < 2)) { if (speaker) last.speakers.add(speaker); last.lines.push(line); }
    else exchanges.push({ speakers: new Set(speaker ? [speaker] : []), lines: [line] });
  }
  exchanges.forEach((exchange, n) => {
    const first = exchange.lines[0], actors = actorsAt(project, first.sequenceId, first.cue.at);
    const speakers = [...exchange.speakers];
    const a = actors.find(x => x.id === speakers[0]), b = actors.find(x => x.id === speakers[1]);
    // Lado del eje de 180°: el del plano general, para que los primeros planos no crucen la línea respecto a él.
    const sideOf = (p: readonly number[]) => a && b ? Math.sign((b.position[0] - a.position[0]) * (p[2] - a.position[2]) - (b.position[2] - a.position[2]) * (p[0] - a.position[0])) : 0;
    const side = sideOf(general.position) || 1;
    for (const id of speakers) {
      const actor = actors.find(x => x.id === id), partner = actors.find(x => x.id !== id && speakers.includes(x.id));
      if (!actor) continue;
      // Primer plano con la cara visible: desde el lado del interlocutor, 30° hacia el lado del eje, a 1,6 m.
      const toward = partner ? Math.atan2(partner.position[0] - actor.position[0], partner.position[2] - actor.position[2]) : actor.rotation, d = 1.6, headY = actor.height * .9;
      const candidates = [toward + Math.PI / 6, toward - Math.PI / 6].map(angle => r3([Math.sin(angle) * d, headY, Math.cos(angle) * d]));
      const offset: Vec3 = candidates.find(o => sideOf([actor.position[0] + o[0], 0, actor.position[2] + o[2]]) === side) ?? candidates[0];
      const slot = `cam:close:${n}:${id}`;
      cameras.set(slot, { slot, name: `${scene.actors.find(x => x.id === id)?.name ?? 'Personaje'} · primer plano${exchanges.length > 1 ? ` ${n + 1}` : ''} (propuesta)`,
        base: { position: r3([actor.position[0] + offset[0], actor.position[1] + offset[1], actor.position[2] + offset[2]]), target: r3([actor.position[0], actor.position[1] + headY, actor.position[2]]), fov: 32, transition: 0 },
        body: { kind: 'follow', actorId: id, offset, space: 'world', smoothing: .6 }, aim: { kind: 'actor', actorId: id, offset: headOffset(actor.height), smoothing: .3 } });
    }
    if (speakers.length > 1) {
      const both = actors.filter(x => speakers.includes(x.id)), f = framing(both, side, a && b ? { a, b } : null, 36), slot = `cam:two:${n}`;
      cameras.set(slot, { slot, name: `Conjunto${exchanges.length > 1 ? ` ${n + 1}` : ''} (propuesta)`, base: { ...f, fov: 36, transition: 0 }, body: { kind: 'static' }, aim: { kind: 'group', actorIds: speakers.slice(0, 20), smoothing: .3 } });
    }
  });

  // Cambios de cámara por momento.
  const suppressed = new Set(scene.autoDirection?.suppressed ?? []);
  // Huecos ocupados por un cambio generado y luego editado: el editado manda y no se planifica otro.
  const held = new Set(scene.sequences.flatMap(q => q.cues.flatMap(c => c.kind === 'cameraSwitch' && isGenerated(c.origin) && isEdited(c) ? [c.origin!.slot] : [])));
  const exchangeOf = new Map(exchanges.flatMap((e, n) => e.lines.map(l => [l.cue.id, n] as const)));
  const detailCameras = (scene.cameras ?? []).filter(c => c.aim.kind === 'point' && c.aim.entryId);
  let firstDialogueSeen = false, carry: number[] = [], previous: { duration: number; gate: StudioScene['sequences'][number]['gate'] } | null = null;
  for (const [index, sequence] of scene.sequences.entries()) {
    const duration = sequenceDuration(sequence), mine: ProposedSwitch[] = [];
    // A través de una puerta automática el tiempo no se detiene: el ritmo sigue contando desde el momento anterior.
    const chained = !!previous && previous.gate.kind === 'auto' && (previous.gate.nextSequenceId ?? sequence.id) === sequence.id && index > 0;
    const before = chained ? carry.map(t => t - previous!.duration) : [];
    // Bloqueos: cambios manuales o editados de este momento (los generados sin editar se van a reemplazar).
    const locked = sequence.cues.filter((c): c is Switch | Extract<Cue, { kind: 'camera' }> => c.kind === 'camera' || (c.kind === 'cameraSwitch' && (!isGenerated(c.origin) || isEdited(c)))).map(c => c.at);
    const cuts = () => [...before, ...locked, ...mine.map(s => s.at)];
    const free = (at: number) => {
      const all = [...cuts(), at].sort((x, y) => x - y);
      if (cuts().some(t => Math.abs(t - at) < spacing - EPS)) return false;
      // Tope de cortes en cualquier ventana de 60 s que contenga el nuevo.
      return all.every(start => start > at || at - start > 60 || all.filter(t => t >= start && t <= start + 60).length <= pace.maxCutsPerMinute);
    };
    const place = (at: number) => round(Math.max(0, Math.min(duration - .05, at)));
    const push = (slot: string, cameraSlot: string, at: number, label: string, transition: Switch['transition']) =>
      mine.push({ sequenceId: sequence.id, slot, cameraSlot, at, duration: round(Math.max(.05, Math.min(.5, duration - at))), label, transition });
    const add = (slot: string, cameraSlot: string, at: number, label: string, transition: Switch['transition'] = { kind: 'cut' }) => {
      at = place(at);
      if (suppressed.has(slot) || held.has(slot) || !cameras.has(cameraSlot) || !free(at)) return false;
      if (mine.at(-1)?.cameraSlot === cameraSlot) return false; // ya se ve esa cámara
      push(slot, cameraSlot, at, label, transition);
      return true;
    };
    const dialogue = sequence.cues.filter((c): c is Extract<Cue, { kind: 'dialogue' }> => c.kind === 'dialogue').sort((x, y) => x.at - y.at);
    if (dialogue.length && !firstDialogueSeen) { add(`seq:${sequence.id}:establishing`, 'cam:general', 0, 'General'); firstDialogueSeen = true; }
    for (const line of dialogue) {
      const n = exchangeOf.get(line.id) ?? 0;
      const camera = line.speakerId ? `cam:close:${n}:${line.speakerId}` : cameras.has(`cam:two:${n}`) ? `cam:two:${n}` : 'cam:general';
      // Corte J: la imagen llega un poco antes que la voz.
      add(`dlg:${line.id}:speaker`, camera, line.at - jl, cameras.get(camera)?.name.replace(' (propuesta)', '') ?? 'Plano');
      // Plano detalle léxico: la frase nombra un objeto al que ya mira una cámara de la escena.
      const text = normalize(source.sentences.find(s => s.id === line.sentenceId)?.text ?? '');
      const detail = detailCameras.find(c => c.aim.kind === 'point' && c.aim.entryId && new RegExp(`\\b${normalize(c.aim.entryId).replace(/[^a-z0-9]/g, '.?')}`).test(text));
      if (detail && line.duration >= spacing * 2) {
        const slot = `dlg:${line.id}:detail`, cameraSlot = `existing:${detail.id}`, at = place(line.at + line.duration * .45);
        if (!cameras.has(cameraSlot)) cameras.set(cameraSlot, { slot: cameraSlot, name: detail.name, base: detail.base, body: detail.body, aim: detail.aim });
        if (add(slot, cameraSlot, at, detail.name)) add(`dlg:${line.id}:back`, camera, at + spacing, 'Vuelta');
      }
    }
    // Cierre: plano conjunto (o general si hay que tocar un objeto: el estudiante no puede tocar lo que no ve).
    const last = dialogue.at(-1);
    if (sequence.gate.kind === 'object') {
      const slot = `gate:${sequence.id}`, at = place(Math.max(last ? last.at + last.duration : 0, duration - spacing));
      if (!suppressed.has(slot) && !held.has(slot) && mine.filter(s => s.at <= at).at(-1)?.cameraSlot !== 'cam:general') {
        // Prioridad sobre los cortes generados demasiado cercanos (nunca sobre lo manual).
        for (let k = mine.length - 1; k >= 0; k--) if (mine[k].at > at - spacing + EPS) mine.splice(k, 1);
        if (mine.at(-1)?.cameraSlot !== 'cam:general' && free(at)) push(slot, 'cam:general', at, 'General', { kind: 'cut' });
      }
    } else if (last && duration - (last.at + last.duration) >= spacing) {
      const n = exchangeOf.get(last.id) ?? 0;
      add(`seq:${sequence.id}:closing`, cameras.has(`cam:two:${n}`) ? `cam:two:${n}` : 'cam:general', last.at + last.duration, 'Conjunto', { kind: 'blend', duration: Math.min(1, spacing * .5), easing: 'easeInOut', route: 'arc' });
    }
    switches.push(...mine.sort((x, y) => x.at - y.at));
    carry = cuts().filter(t => t > duration - 60);
    previous = { duration, gate: sequence.gate };
  }
  // Solo se proponen las cámaras que algún cambio usa (las existentes no se proponen como nuevas).
  const used = new Set(switches.map(s => s.cameraSlot));
  return { sceneId, batchId, cameras: [...cameras.values()].filter(c => used.has(c.slot) && !c.slot.startsWith('existing:')), switches };
}

export type DirectionSummary = { created: number; replaced: number; keptEdited: number; removed: number; suppressed: number };

/** Aplica una propuesta en UN paso de deshacer. Devuelve el proyecto y el resumen para la vista previa. */
export function applyDirection(project: StudioProject, proposal: DirectionProposal, uid: () => string = () => crypto.randomUUID()): { project: StudioProject; summary: DirectionSummary } {
  const copy = structuredClone(project), scene = copy.scenes.find(s => s.id === proposal.sceneId);
  if (!scene) throw new Error('La escena ya no existe.');
  const summary: DirectionSummary = { created: 0, replaced: 0, keptEdited: 0, removed: 0, suppressed: scene.autoDirection?.suppressed.length ?? 0 };
  scene.cameras ??= [];
  // Cámaras: el mismo hueco conserva la misma identidad, así los cues editados que la usan siguen siendo válidos.
  const bySlot = new Map(scene.cameras.filter(c => isGenerated(c.origin)).map(c => [c.origin!.slot, c]));
  const slotToId = new Map<string, string>();
  for (const c of scene.cameras) if (!isGenerated(c.origin)) slotToId.set(`existing:${c.id}`, c.id);
  for (const proposed of proposal.cameras) {
    const { slot, ...rest } = proposed, existing = bySlot.get(slot);
    if (existing && isEdited(existing)) { slotToId.set(slot, existing.id); summary.keptEdited++; continue; }
    const camera: CameraRig = { ...structuredClone(rest), id: existing?.id ?? `camera-${uid()}` };
    delete camera.origin;
    camera.origin = { generator: GENERATOR, batchId: proposal.batchId, slot, fingerprint: fingerprint(camera) };
    if (existing) { scene.cameras[scene.cameras.indexOf(existing)] = camera; summary.replaced++; }
    else { if (scene.cameras.length >= 64) continue; scene.cameras.push(camera); summary.created++; }
    slotToId.set(slot, camera.id);
  }
  // Cambios: fuera los generados sin editar; dentro los propuestos (salvo huecos ocupados por un editado).
  const keptSlots = new Set<string>();
  for (const sequence of scene.sequences) {
    sequence.cues = sequence.cues.filter(c => {
      if (c.kind !== 'cameraSwitch' || !isGenerated(c.origin)) return true;
      if (isEdited(c)) { keptSlots.add(c.origin!.slot); summary.keptEdited++; return true; }
      summary.removed++; return false;
    });
  }
  for (const s of proposal.switches) {
    const sequence = scene.sequences.find(q => q.id === s.sequenceId), cameraId = slotToId.get(s.cameraSlot);
    if (!sequence || !cameraId || keptSlots.has(s.slot)) continue;
    const cue: Switch = { id: `switch-${uid()}`, kind: 'cameraSwitch', at: s.at, duration: s.duration, cameraId, label: s.label, transition: structuredClone(s.transition) };
    cue.origin = { generator: GENERATOR, batchId: proposal.batchId, slot: s.slot, fingerprint: fingerprint(cue) };
    sequence.cues.push(cue);
    summary.created++;
  }
  // Cámaras generadas sin editar que ya nadie usa: se van.
  const used = new Set(scene.sequences.flatMap(q => q.cues.flatMap(c => c.kind === 'cameraSwitch' || c.kind === 'cameraMove' ? [c.cameraId] : [])));
  scene.cameras = scene.cameras.filter(c => !isGenerated(c.origin) || isEdited(c) || used.has(c.id));
  if (!scene.cameras.length) delete scene.cameras;
  return { project: copy, summary };
}

/** Texto de la vista previa: «se crearán 4 · se reemplazarán 3 · se conservan 2 editadas». */
export function describeDirection(s: DirectionSummary): string {
  const parts = [`se crearán ${s.created}`, `se reemplazarán ${s.replaced + s.removed}`, `se conservan ${s.keptEdited} ${s.keptEdited === 1 ? 'editada' : 'editadas'}`];
  if (s.suppressed) parts.push(`${s.suppressed} ${s.suppressed === 1 ? 'hueco borrado' : 'huecos borrados'} a propósito no se recrean`);
  return parts.join(' · ');
}
