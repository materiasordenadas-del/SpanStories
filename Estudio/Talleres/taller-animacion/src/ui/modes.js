// Dos modos de trabajo (arriba a la derecha):
//   Maniquí   → animación general: se edita sobre el maniquí y queda guardada para todos los personajes.
//   En escena → el personaje de la escena, en su escenario: la animación de esa escena concreta.
// Cada modo conserva su personaje y su documento; cambiar de uno a otro no recarga nada.
import { h, $, slug } from './dom.js';
import { prefs, setPrefs, db } from '../io/storage.js';
import { newDocument, newLayer, ikVersion } from '../core/animation.js';
import { bakeCanonical } from '../io/exporter.js';

const isMannequin = (meta) => /maniqu|mannequin|ual1_standard/i.test(`${meta?.name || ''} ${meta?.id || ''}`) || meta?.id === 'maniqui';
const embedded = new URLSearchParams(location.search).has('studioSession');

export function mountModes(app) {
  const box = $('#modeSwitch');
  const M = { slots: { maniqui: null, escena: null }, busy: false };
  app.mode = embedded ? 'escena' : app.mode || prefs('mode', isMannequin(app.charMeta) ? 'maniqui' : 'escena');
  const what = h('span', { class: 'what' });
  // Dos formas de guardar una corrección (antes «★ Guardar para todos», que creaba otra animación y duplicaba):
  //   Corrección general     → la animación de la biblioteca queda reemplazada por la corregida (mismo id, sin copias).
  //   Modificación en historia → solo esta actuación de esta historia (dentro del Estudio, «En escena»).
  const saveBtn = h('button', { class: 'btn sm', title: 'Corrección general: la animación de la biblioteca queda reemplazada por esta versión corregida, para todos los personajes y escenas. No se crea otra animación', onclick: () => M.correctGeneral() }, '✔ Corrección general');
  const storyBtn = h('button', { class: 'btn sm hidden', title: 'Modificación en historia: solo esta actuación de esta historia. Se reemplaza la de la historia (sin duplicados) y el Taller facial y el Estudio la ven al momento', onclick: () => M.saveInStory() }, '✎ Modificación en historia');
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo de trabajo' },
    h('button', { 'data-mode': 'maniqui', title: 'Maniquí: animación general. Lo que hagas aquí queda guardado para todos los personajes', onclick: () => M.set('maniqui') }, '🧍 Maniquí'),
    h('button', { 'data-mode': 'escena', title: 'En escena: el personaje en su escenario. Lo que hagas aquí es solo para esta escena', onclick: () => M.set('escena') }, '🎬 En escena'));
  // Dentro del Estudio: ver y editar sobre el escenario vivo de la historia, o volver al visor propio del Taller.
  const liveBtn = h('button', { class: 'btn sm hidden', title: 'Escenario de la historia bajo el visor: el mismo que ves en el Editor y en el Estudio. Púlsalo para alternar con el visor propio del Taller', onclick: () => app.sceneLive?.setWanted(!app.sceneLive.on) }, '🏙 Escenario');
  app.onSceneLive = () => paint();
  box.append(what, saveBtn, storyBtn, liveBtn, seg);

  const snapshot = () => ({ root: app.rig.root, rig: app.rig, meta: app.charMeta, doc: app.engine.doc, undo: app.undoStack, redo: app.redoStack });
  function paint() {
    for (const b of seg.children) {
      b.classList.toggle('on', b.dataset.mode === app.mode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === app.mode));
    }
    // Corrección general en los dos modos; Modificación en historia solo «En escena» dentro del Estudio.
    saveBtn.classList.remove('hidden');
    storyBtn.classList.toggle('hidden', !(embedded && app.mode === 'escena'));
    what.textContent = app.mode === 'maniqui' ? 'Animación general · para todos los personajes' : `${app.charMeta?.name || 'Personaje'} · solo esta escena`;
    document.body.dataset.mode = app.mode;
    app.onModeChange?.(app.mode);
    app.sceneLive?.sync();
    liveBtn.classList.toggle('hidden', !(embedded && app.mode === 'escena'));
    liveBtn.classList.toggle('on', !!app.sceneLive?.on);
    liveBtn.textContent = app.sceneLive?.on ? '🏙 Escenario' : '🏙 Escenario (apagado)';
  }

  /** Documento guardado de un modo (para la primera vez que se entra en él). */
  async function storedDoc(mode) {
    if (mode === 'maniqui') return (await db.get('projects', 'auto:general'))?.doc || null;
    if (embedded) return null; // dentro del Estudio el documento de la escena lo trae la actuación (behaviors.js)
    return (await db.get('projects', 'auto'))?.doc || null;
  }

  M.set = async (mode) => {
    if (mode === app.mode || M.busy) return;
    M.busy = true;
    try {
      if (app.animales?.activePair()) {
        await app.studioFlush?.();
        app.animales.releasePair();
      }
      app.playing = false;
      app.directorUI?.setTool?.(null);
      M.slots[app.mode] = snapshot();
      clearTimeout(app._save);
      app.autosave();
      let slot = M.slots[mode];
      app.mode = mode;
      if (slot) {
        app.swapCharacter(slot);
      } else {
        // primera vez: su personaje y su documento
        const wantChar = mode === 'maniqui'
          ? app.characters.find((c) => c.name === 'Maniquí (Quaternius)') || app.characters.find((c) => isMannequin(c))
          : app.characters.find((c) => c.id === prefs('lastChar', '')) || null;
        const doc = await storedDoc(mode);
        if (wantChar && wantChar.id !== app.charMeta.id) await app.wearCharacter(wantChar.id, true);
        else if (mode === 'escena' && isMannequin(app.charMeta)) app.toast('En escena: elige el personaje en Preparar › Personaje, o abre el Taller desde el Estudio para traer el de la escena.');
        app.engine.doc = { ...newDocument(), ...(doc || {}), ikv: ikVersion(doc || {}) };
        if (!doc) app.useClip('gen_reposo', false);
        app.undoStack = [];
        app.redoStack = [];
      }
      if (!embedded) setPrefs('mode', mode);
      app.setFrame(app.engine.range()[0]);
      app.changed();
      app.timeline.fit();
      app.viewport.reframe();
      paint();
      app.toast(mode === 'maniqui' ? 'Maniquí: animación general, para todos los personajes' : `En escena: ${app.charMeta.name}, solo para esta escena`);
    } catch (e) {
      console.error(e);
      app.toast(`No pude cambiar de modo: ${e.message}`, true);
    } finally {
      M.busy = false;
    }
  };

  /** Animación de la biblioteca que se está corrigiendo: la única tira del documento o, si no, la elegida en la biblioteca. */
  function corrected() {
    const strips = app.engine.doc.strips;
    const id = strips.length === 1 ? strips[0].clipId : strips.length ? null : app.libSel;
    return id ? app.library.get(id) || null : null;
  }
  /**
   * Corrección general: la animación queda REEMPLAZADA por la versión corregida (mismo id; la marca «corregida» hace
   * que la biblioteca de disco no la vuelva a pisar). No se crea otra animación. Borrarla en Tuyas devuelve el original.
   */
  M.correctGeneral = async () => {
    try {
      const orig = corrected();
      if (!orig) throw new Error('Corrección general: carga en la línea de tiempo una sola animación de la biblioteca (la que corriges) y vuelve a pulsar.');
      if (!confirm(`Corrección general de «${orig.name}».\n\nLa animación queda reemplazada por esta versión corregida para todos los personajes y todas las escenas que la elijan. No se crea otra animación.\n\n¿Reemplazar?`)) return null;
      await app.ensureClip?.(orig.id);
      const frame = app.engine.frame;
      const tags = [...new Set([...(orig.tags || []).filter((t) => t !== 'corregida'), 'corregida'])];
      const c = bakeCanonical(app.engine, { id: orig.id, name: orig.name, tags });
      app.setFrame(frame);
      Object.assign(c, { loop: !!orig.loop, pack: orig.pack, ruta: orig.ruta, gender: orig.gender, source: orig.source, author: orig.author });
      await app.saveMine(c);
      // El documento pasa a la animación corregida, sin las capas que ya van horneadas en ella.
      app.useClip(c.id);
      app.engine.doc.layers = [newLayer('base', 'Base')];
      app.changed();
      app.panels.refreshLibrary();
      app.directorUI?.render();
      app.toast(embedded && app.mode === 'escena'
        ? `«${orig.name}» corregida para todos. Esta historia también la recibe al volver al Estudio o pasar al Taller facial.`
        : `«${orig.name}» corregida para todos (sin duplicados).`);
      return c.id;
    } catch (e) {
      app.toast(e.message, true);
      return null;
    }
  };
  /** Modificación en historia: solo esta actuación de esta historia, sin cerrar el Taller ni recargar. */
  M.saveInStory = async () => {
    try {
      if (!app.behaviors) throw new Error('El Taller aún está cargando.');
      await app.behaviors.save(true, { auto: true });
      app.toast('Modificación en historia: guardada. El Taller facial y el Estudio ya la tienen.');
    } catch (e) {
      app.toast(e.message, true);
    }
  };

  /** Guarda la animación como animación NUEVA en Tuyas (formato canónico). Ya no está en los botones: lo usa la IA. */
  M.saveGeneral = async (name = null) => {
    const base = app.libSel ? app.library.get(app.libSel)?.name : 'Animación';
    const n = name || prompt('Nombre de la animación general (quedará en Biblioteca › Tuyas, para todos los personajes)', `${base} general`);
    if (!n) return null;
    const frame = app.engine.frame;
    const c = bakeCanonical(app.engine, { id: `mio:${slug(n)}:${Date.now().toString(36)}`, name: n, tags: ['tuyas', 'general'] });
    app.setFrame(frame);
    c.loop = false;
    c.pack = 'Tuyas';
    await app.saveMine(c);
    app.panels.refreshLibrary();
    app.directorUI?.render();
    app.toast(`«${n}» guardada para todos los personajes (Biblioteca › Tuyas)`);
    return c.id;
  };

  M.paint = paint;
  /** El Estudio abrió el Taller sin personaje de escena: se trabaja la animación general. */
  M.adopt = (mode) => {
    app.mode = mode;
    paint();
  };
  M.isMannequin = isMannequin;
  M.embedded = embedded;
  // El personaje elegido a mano en «En escena» se recuerda para la próxima vez.
  M.noteCharacter = (meta) => {
    paint();
  };
  paint();
  return M;
}
