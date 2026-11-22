import { buildStorySource, HISTORIA_SCHEMA, type HistoriaFile } from '../../historia.ts';
import type { Cue, Shot, StudioProject, Vec3 } from '../../model.ts';

/**
 * Minihistoria de prueba para el sistema de cámaras: Rachel y Mia se encuentran en la entrada del aeropuerto.
 * Es deliberadamente sencilla, pero toca lo que las cámaras pueden romper: un momento automático que encadena
 * con el siguiente, una caminata con camino, actuación automática de un diálogo (`auto:`), giros con lookAt,
 * cortes y mezclas de cámara, una elección con dos ramas que se vuelven a juntar y la salida de un personaje.
 *
 * Es determinista (fechas e ids fijos): las instantáneas de referencia dependen de ella.
 * `node scripts/story-studio/crear-mini-historia.ts` la escribe en Estudio/Historias/mini-camaras-prueba/.
 */
export const MINI_HISTORIA_ID = 'mini-camaras-prueba';
const NOW = '2026-11-17T12:00:00.000Z';

const TEXTS = [
  'Hola, Mia.',
  '¡Hola, Rachel! ¿Qué tal?',
  'Bien. ¿Tomamos un café?',
  'Sí, un café con leche.',
  'Mejor un té, por favor.',
  '¡Vamos!',
] as const;

const shot = (position: Vec3, target: Vec3, fov: number, transition = 0, easing?: Shot['easing']): Shot =>
  ({ position, target, fov, transition, ...(easing ? { easing } : {}) });

/** Planos con nombre (hoy son cues `camera` anónimos; servirán de base para las cámaras con nombre). */
export const MINI_SHOTS = {
  general: shot([-17.8, 2.2, 8.5], [-17.8, 1.1, 2.8], 42),
  rachel: shot([-19, 1.55, 3.7], [-19, 1.5, 2], 35, 1, 'easeInOut'),
  mia: shot([-18.7, 1.5, 4.3], [-17.4, 1.45, 2.9], 35, 1.2, 'easeInOut'),
  conjunto: shot([-18.1, 1.6, 6.2], [-18.1, 1.2, 2.5], 40),
} as const;

const RACHEL = 'mh-rachel', MIA = 'mh-mia';
const camera = (id: string, at: number, label: string, s: Shot): Cue => ({ id, kind: 'camera', at, duration: Math.max(.05, s.transition || .5), label, shot: s });
const line = (id: string, at: number, duration: number, sentence: number, speakerId: string | null): Cue =>
  ({ id, kind: 'dialogue', at, duration, sentenceId: `sent-${MINI_HISTORIA_ID}-${sentence}`, speakerId });

/**
 * La misma minihistoria dirigida con cámaras con nombre (Switcher): seguimiento suavizado, órbita, travelling
 * por un camino, mezclas en arco y lineales, y un cue `camera` antiguo en «Café» para probar la mezcla de ambos.
 */
export const MINI_SWITCHER_ID = 'mini-camaras-switcher';
export function buildMiniSwitcher(): HistoriaFile {
  const h = buildMiniHistoria(), scene = h.project.scenes[0];
  h.id = MINI_SWITCHER_ID; h.name = h.project.name = 'Minihistoria de cámaras (Switcher)'; h.project.id = `historia-${MINI_SWITCHER_ID}`;
  scene.cameras = [
    { id: 'cam-general', name: 'General', base: structuredClone(MINI_SHOTS.general) as Shot, body: { kind: 'static' }, aim: { kind: 'fixed' } },
    { id: 'cam-sigue-mia', name: 'Sigue a Mia', base: structuredClone(MINI_SHOTS.mia) as Shot, body: { kind: 'follow', actorId: MIA, offset: [1.4, 1.7, 2.4], space: 'world', smoothing: .6 }, aim: { kind: 'actor', actorId: MIA, offset: [0, 1.45, 0], smoothing: .4 }, lens: { fov: 38 } },
    { id: 'cam-orbita', name: 'Órbita Rachel', base: structuredClone(MINI_SHOTS.rachel) as Shot, body: { kind: 'orbit', actorId: RACHEL, radius: 2.2, height: 1.55, fromAngle: .3, toAngle: 1.5 }, aim: { kind: 'actor', actorId: RACHEL, offset: [0, 1.5, 0], smoothing: 0 } },
    { id: 'cam-travelling', name: 'Travelling', base: structuredClone(MINI_SHOTS.conjunto) as Shot, body: { kind: 'path', points: [[-15.5, 1.7, 7], [-17.5, 1.75, 7.6], [-20, 1.7, 7]], easing: 'easeInOut' }, aim: { kind: 'group', actorIds: [RACHEL, MIA], smoothing: .3 } },
  ];
  const [saludo, respuesta, pregunta, cafe, te, despedida] = scene.sequences;
  const strip = (q: typeof saludo) => { q.cues = q.cues.filter(c => c.kind !== 'camera'); };
  [saludo, respuesta, pregunta, te, despedida].forEach(strip);
  const sw = (id: string, at: number, cameraId: string, label: string, transition: Extract<Cue, { kind: 'cameraSwitch' }>['transition']): Cue =>
    ({ id, kind: 'cameraSwitch', at, duration: transition.kind === 'blend' ? transition.duration : .5, cameraId, label, transition });
  saludo.cues.push(sw('sw-1-general', 0, 'cam-general', 'General', { kind: 'cut' }), sw('sw-1-mia', .8, 'cam-sigue-mia', 'Sigue a Mia', { kind: 'blend', duration: 1, easing: 'easeInOut', route: 'arc' }));
  respuesta.cues.push(sw('sw-2-orbita', 0, 'cam-orbita', 'Órbita Rachel', { kind: 'cut' }), { id: 'mv-2-orbita', kind: 'cameraMove', at: 0, duration: 2.5, cameraId: 'cam-orbita', from: 0, to: 1, easing: 'easeInOut' });
  pregunta.cues.push(sw('sw-3-travelling', 0, 'cam-travelling', 'Travelling', { kind: 'blend', duration: 1.2, easing: 'easeInOut', route: 'linear' }), { id: 'mv-3-travelling', kind: 'cameraMove', at: 0, duration: 3, cameraId: 'cam-travelling', from: 0, to: 1 });
  te.cues.push(sw('sw-5-mia', 0, 'cam-sigue-mia', 'Sigue a Mia', { kind: 'cut' }));
  despedida.cues.push(sw('sw-6-general', 0, 'cam-general', 'General', { kind: 'blend', duration: 1.5, easing: 'easeOut', route: 'arc' }));
  return h;
}

export function buildMiniHistoria(): HistoriaFile {
  const source = buildStorySource({ key: MINI_HISTORIA_ID, title: 'Minihistoria de cámaras (prueba)', texts: TEXTS, now: NOW });
  const project: StudioProject = {
    schema: 1, id: `historia-${MINI_HISTORIA_ID}`, name: 'Minihistoria de cámaras (prueba)',
    storyId: source.storyId, storyVersionId: source.storyVersionId, revision: 0,
    navigation: { allowLook: true, travel: 'directed' },
    scenes: [{
      id: 'mh-escena', name: 'Encuentro en el aeropuerto', zoneId: 'aeropuerto-entrada', entryIds: [],
      shot: structuredClone(MINI_SHOTS.general) as Shot,
      actors: [
        { id: RACHEL, characterId: 'rachel', name: 'Rachel', position: [-19, 0, 2], rotation: .6, height: 1.65 },
        { id: MIA, characterId: 'mia', name: 'Mia', position: [-15.5, 0, 4.5], rotation: -1.9, height: 1.6 },
      ],
      sequences: [
        { id: 'mh-1-saludo', name: 'Saludo', gate: { kind: 'auto' }, cues: [
          camera('mh-1-cam-general', 0, 'General', MINI_SHOTS.general),
          line('mh-1-dlg', .3, 2, 1, RACHEL),
          { id: 'mh-1-rachel-habla', kind: 'actor', at: .3, duration: 2, actorId: RACHEL, action: 'talk' },
          { id: 'mh-1-mia-llega', kind: 'actor', at: 0, duration: 3, actorId: MIA, action: 'walk', path: [[-16.4, 0, 3.4]], destination: [-17.4, 0, 2.9] },
          camera('mh-1-cam-rachel', 1.5, 'Rachel', MINI_SHOTS.rachel),
        ] },
        { id: 'mh-2-respuesta', name: 'Respuesta', gate: { kind: 'continue', prompt: 'Continúa cuando quieras.' }, cues: [
          camera('mh-2-cam-mia', 0, 'Mia', MINI_SHOTS.mia),
          line('mh-2-dlg', 0, 2.5, 2, MIA),
          // Igual que los crea autoStageDialogue: quien habla, habla; quien escucha, la mira.
          { id: 'auto:mh-2-dlg:talk', kind: 'actor', at: 0, duration: 2.5, actorId: MIA, action: 'talk' },
          { id: `auto:mh-2-dlg:listen:${RACHEL}`, kind: 'actor', at: 0, duration: 2.5, actorId: RACHEL, action: 'listen', lookAt: MIA },
          camera('mh-2-cam-conjunto', 2, 'Conjunto', MINI_SHOTS.conjunto),
        ] },
        { id: 'mh-3-pregunta', name: 'Pregunta',
          gate: { kind: 'choice', prompt: '¿Qué toma Mia?', options: [
            { id: 'cafe', label: 'Café', nextSequenceId: 'mh-4-cafe' },
            { id: 'te', label: 'Té', nextSequenceId: 'mh-5-te' },
          ] },
          cues: [
            camera('mh-3-cam-rachel', 0, 'Rachel', { ...MINI_SHOTS.rachel, transition: .8 }),
            { id: 'mh-3-rachel-gira', kind: 'actor', at: 0, duration: .8, actorId: RACHEL, action: 'turn', lookAt: MIA },
            line('mh-3-dlg', .5, 2.5, 3, RACHEL),
            { id: 'mh-3-rachel-habla', kind: 'actor', at: .8, duration: 2.2, actorId: RACHEL, action: 'talk' },
          ] },
        { id: 'mh-4-cafe', name: 'Café', gate: { kind: 'continue', prompt: 'Continúa cuando quieras.', nextSequenceId: 'mh-6-despedida' }, cues: [
          camera('mh-4-cam-mia', 0, 'Mia', { ...MINI_SHOTS.mia, transition: 0 }),
          line('mh-4-dlg', 0, 2.2, 4, MIA),
          { id: 'mh-4-mia-asiente', kind: 'actor', at: 0, duration: 1, actorId: MIA, action: 'nod' },
        ] },
        { id: 'mh-5-te', name: 'Té', gate: { kind: 'continue', prompt: 'Continúa cuando quieras.' }, cues: [
          camera('mh-5-cam-mia', 0, 'Mia', { ...MINI_SHOTS.mia, transition: 0 }),
          line('mh-5-dlg', 0, 2.4, 5, MIA),
          { id: 'mh-5-mia-niega', kind: 'actor', at: 0, duration: 1.2, actorId: MIA, action: 'talk' },
        ] },
        { id: 'mh-6-despedida', name: 'Despedida', gate: { kind: 'continue', prompt: 'Fin. Continúa para terminar.' }, cues: [
          camera('mh-6-cam-general', 0, 'General', { ...MINI_SHOTS.general, transition: 1.5, easing: 'easeOut' }),
          line('mh-6-dlg', 0, 1.5, 6, RACHEL),
          // Una caminata con solo destino no gira al personaje: `rotation` lo orienta hacia donde anda.
          { id: 'mh-6-rachel-sale', kind: 'actor', at: .8, duration: 3, actorId: RACHEL, action: 'walk', destination: [-21.5, 0, 5], rotation: -.69 },
          { id: 'mh-6-mia-sigue', kind: 'actor', at: 1.4, duration: 3, actorId: MIA, action: 'walk', destination: [-20.4, 0, 5.6], rotation: -.84 },
        ] },
      ],
    }],
  };
  return { schema: HISTORIA_SCHEMA, version: 1, id: MINI_HISTORIA_ID, name: project.name, createdAt: NOW, savedAt: NOW, revision: 0, source, project, ui: { sequenceId: 'mh-1-saludo' } };
}
