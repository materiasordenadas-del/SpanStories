// Primero: dentro del Estudio pide ya el personaje de la escena (ver src/io/studio-boot.js).
import { studioEmbedded, studioHold, studioInitWithin, studioModelURL } from './io/studio-boot.js';
import * as THREE from 'three';
import { Rig } from './core/rig.js';
import { horseChains, horseChainLabel } from './core/horse-editor.js';
import { prepareCharacterBody } from './core/bodyprofile.js';
import { Engine, newDocument, newLayer, uid, setKey, ikVersion } from './core/animation.js';
import { prepareStripInsertion } from './core/strip-insertion.js';
import { proceduralClips, handPoses, handPoseFrom } from './core/procedural.js';
import { clipFromAnimation, clipFromJSON, clipToJSON, newPose, sampleClip, clipFromPose, copyPose, withStats, cierraBucle } from './core/clip.js';
import { IK_CHAINS, CANON_BY_ID } from './core/humanoid.js';
import { limitEdit } from './core/limits.js';
import { loadModel, loadModelURL, hasSkin, normalizeCharacter, extOf, usaLectorEjes } from './io/loaders.js';
import { db, prefs, setPrefs, download, pickFiles } from './io/storage.js';
import { MotionPathView } from './ui/motionpath.js';
import { mountHerramientas } from './ui/herramientas.js';
import { addMarker } from './core/edit/retime.js';
import { PivotView } from './ui/pivotview.js';
import { installEditLayer, pinOf } from './ui/editlayer.js';
import { iniciarRespaldoNavegador } from './io/respaldo-navegador.js';
await iniciarRespaldoNavegador();
import { docToHash, hashToDoc } from './io/url.js';
import { bakeAnimationClip, exportGLB, bakeCanonical, clipFile } from './io/exporter.js';
import { Viewport } from './ui/viewport.js';
import { Timeline } from './ui/timeline.js';
import { buildPanels } from './ui/panels.js';
import { buildTexto } from './ui/texto.js';
import { Stage } from './ui/stage.js';
import { installIA } from './ia.js';
import { $, $$, h, slug, prettyName } from './ui/dom.js';
import { mountBehaviors, preloadFacialModules } from './ui/behaviors.js';
import { mountDirector } from './ui/director.js';
import { mountAim } from './ui/aim.js';
import { mountPlanner } from './ui/planner.js';
import { mountTopMenu } from './ui/topmenu.js';
import { mountModes } from './ui/modes.js';
import { mountSceneLive } from './ui/scenelive.js';
import { mountAnimales } from './ui/animales.js';

const TAGS = [
  ['locomoción', /walk|run|jog|sprint|crouch|jump|roll|slide|swim|climb|stairs|sneak|falling|caminar|correr|saltar|locomo/i],
  ['combate', /sword|punch|melee|shield|kick|block|pistol|attack|combo|dash|zombie_scratch|jab|cross|hook|katana/i],
  ['gestos', /dance|talk|yes|no_|wave|celebrat|card|bored|saludar|asentir|negar|señalar|aplaudir|encoger|pensar|gest/i],
  ['reacciones', /hit|death|impact|kicked|punched|knockback|corpse|break/i],
  ['interacción', /farm|pickup|push|sit|door|button|interact|fixing|consume|chest|driving|throw|torch|lantern|rail|phone|harvest|water|chop|spell|carry|juggl|dribble|save|defend/i],
  ['poses', /pose|tpose|a_tpose/i],
];

function tagsFor(name, extra = []) {
  const t = new Set(extra);
  for (const [tag, re] of TAGS) if (re.test(name)) t.add(tag);
  return [...t];
}

// Versión del índice de la biblioteca (fichas ligeras). Subirla rehace el índice desde la caché de pistas, sin descargar.
const LIB_INDEX_V = 1;

/** Ficha ligera de un clip guardado en la caché: lo que necesitan la biblioteca y sus filtros, sin pistas. */
function libClipMeta(j, kimodo = false) {
  const fps = j.fps || 30;
  const frames = j.frames;
  const n = frames - 1;
  const travel = j.hips && j.hips.length >= frames * 3 ? Math.hypot(j.hips[n * 3] - j.hips[0], j.hips[n * 3 + 2] - j.hips[2]) : 0;
  // Kimodo: acciones sueltas, aunque digan «walk»; el bucle sale de las pistas.
  const loop = kimodo ? (() => { const c = clipFromJSON(j); return cierraBucle(c.tracks, c.frames); })() : !!j.loop;
  return { id: j.id, name: j.name, tags: j.tags || [], fps, frames, loop, source: j.source, author: j.author, duration: n / fps, travel };
}


// Perfiles por personaje (perfiles-personaje.json del Taller facial, servido por el ecosistema): se buscan por id o por nombre.
let profilesCache = null;
async function characterProfile(meta) {
  try { profilesCache ??= await fetch('/ecosystem/profiles').then((r) => (r.ok ? r.json() : {})); } catch { profilesCache = {}; }
  const name = (meta?.name || '').toLowerCase();
  return profilesCache[meta?.id] || Object.values(profilesCache).find((p) => (p.nombre || '').toLowerCase() === name) || null;
}

class App {
  constructor() {
    this.library = new Map();
    this.characters = []; // {id, name, kind:'url'|'idb', url?, data?}
    this.selection = null;
    this.tool = 'ik'; // Arrastrar: lo más directo para empezar
    this.limits = prefs('limits', true); // límites naturales de las articulaciones al editar
    this.locks = prefs('locks', { footL: true, footR: true, handL: false, handR: false }); // candados: se quedan en su sitio al mover el cuerpo
    this.space = 'local';
    this.snap = 0;
    this.mirrorX = false;
    this.autoKey = true;
    this.playing = false;
    this.playDir = 1;
    this.loopPlay = true;
    this.speed = 1;
    this.onlySelected = false;
    this.undoStack = [];
    this.redoStack = [];
    this.selStrip = null;
    this.bundle = new Set(prefs('bundle', []));
    this.sets = prefs('sets', [{ id: 'set1', name: 'set1', desc: '', clips: [] }]);
    this.activeSet = prefs('activeSet', 'set1');
    this.projectName = 'Sin título';
    this.projectId = null;
    this.charMeta = { id: null, name: 'Cargando personaje' };
    this.thumbs = new Map();
    this.thumbQueue = [];
  }

  async init() {
    this.viewport = new Viewport($('#viewport'), this);
    this.pathView = new MotionPathView(this); // trayectoria editable (Herramientas)
    this.pivotView = new PivotView(this); // pivote temporal relativo (Herramientas)
    this.stage = new Stage(this);
    installIA(this);
    for (const c of proceduralClips()) this.library.set(c.id, c);
    this.handPoses = handPoses();
    const mine = await db.all('clips');
    for (const j of mine) {
      try {
        const c = j.tracks && j.tracks.hips instanceof Float32Array ? withStats(j) : clipFromJSON(j);
        c.mine = true;
        this.library.set(c.id, c);
      } catch (e) {
        console.warn('clip propio dañado', e);
      }
    }
    this.bodyPoses = (await db.all('poses')).filter((p) => p.kind === 'body');
    this.savedHands = (await db.all('poses')).filter((p) => p.kind === 'hand');
    for (const c of await db.all('characters')) this.characters.push({ id: c.id, name: c.name, kind: 'idb' });

    // Cada modo recuerda su personaje: «Maniquí» (animación general) no pisa el de «En escena».
    const standalone = !new URLSearchParams(location.search).has('studioSession');
    this.mode = standalone ? prefs('mode', null) : 'escena';
    let last = this.mode === 'maniqui' ? prefs('generalChar', 'maniqui') : prefs('lastChar', 'maniqui'); // leer antes de ponerse el maniquí
    // Biblioteca › Animales abierta al recargar: el jinete de esa sesión es el personaje inicial (nunca se carga antes el maniquí).
    const sesionAnimal = studioEmbedded ? null : prefs('animalSesion', null);
    const animalesAlRecargar = !!(sesionAnimal?.activo && sesionAnimal.conJinete && sesionAnimal.jinete);
    if (animalesAlRecargar) last = sesionAnimal.jinete;
    // Descubrir los maniquíes antes de escanear todos los clips. También resuelve
    // rutas recordadas que cambiaron al organizar la biblioteca.
    // Dentro del Estudio: el personaje de la escena se descarga ya, en paralelo con la biblioteca,
    // y es el personaje inicial (antes se cargaba el último usado y luego se cambiaba: ~15 s de espera).
    preloadFacialModules().catch(() => {}); // comportamientos: se cargan mientras baja el personaje
    let studioModel = null;
    let studioCharacter = null;
    if (studioEmbedded) {
      const early = await studioInitWithin(2500);
      const ctx = early?.context;
      if (ctx && !ctx.sinPersonaje && typeof ctx.modelUrl === 'string' && typeof ctx.characterId === 'string') {
        studioCharacter = { id: ctx.characterId, name: ctx.characterName || ctx.characterId, kind: 'studio' };
        studioModel = loadModelURL(studioModelURL(ctx.modelUrl), 'personaje.glb');
        studioModel.catch(() => {});
      }
    }
    let mannequins = [];
    try {
      const files = (await (await fetch('/api/biblioteca')).json()).archivos;
      mannequins = files.filter(a => /(?:^|\/)(UAL1_Standard|Mannequin_F)\.glb$/i.test(a.ruta)).map(a => ({
        id: `url:${a.url}`, name: /Mannequin_F\.glb$/i.test(a.ruta) ? 'Maniquí femenino (Quaternius)' : 'Maniquí (Quaternius)',
        kind: 'url', url: a.url, file: a.ruta, credit: 'RIG POR QUATERNIUS · CC0',
      }));
      for (const c of mannequins) if (!this.characters.some(x => x.id === c.id)) this.characters.push(c);
      const male = mannequins.find(c => c.name === 'Maniquí (Quaternius)');
      const female = mannequins.find(c => c.name === 'Maniquí femenino (Quaternius)');
      if (last === 'maniqui' || /UAL1_Standard\.glb$/i.test(last)) last = male?.id || female?.id || last;
      else if (/Mannequin_F\.glb$/i.test(last)) last = female?.id || last;
    } catch (error) { console.warn('No pude descubrir los maniquíes al iniciar', error); }
    // Conservar personajes importados y migrar selecciones antiguas al Quaternius.
    const quat = prefs('quatInfo', null);
    if (last === 'maniqui' && quat) last = quat.id;
    const info0 = last.startsWith('url:') ? mannequins.find(c => c.id === last) || prefs(`charInfo:${last}`, null) || (quat && quat.id === last ? quat : null) : null;
    if (info0 && !this.characters.find((c) => c.id === info0.id)) this.characters.push(info0);
    let initialModel = null;
    let initialCharacter = null;
    const selected = info0 || this.characters.find(c => c.id === last);
    const candidates = [selected, ...mannequins.filter(c => c.name === 'Maniquí (Quaternius)'), ...mannequins].filter(Boolean);
    const attempted = new Set();
    if (studioModel) {
      try {
        initialModel = await studioModel;
        initialCharacter = studioCharacter;
        this.studioBootCharacter = studioCharacter.id; // behaviors.js no lo vuelve a cargar
      } catch (error) { console.warn('No pude cargar el personaje de la escena al iniciar', error); }
    }
    for (const candidate of initialModel ? [] : candidates) {
      if (attempted.has(candidate.id)) continue;
      attempted.add(candidate.id);
      try {
        if (candidate.kind === 'url') initialModel = await loadModelURL(candidate.url, candidate.file);
        else {
          const rec = await db.get('characters', candidate.id);
          initialModel = await loadModel(rec.data, rec.file);
        }
        initialCharacter = candidate;
        break;
      } catch (error) { console.warn('No pude cargar el personaje inicial', candidate.name, error); }
    }
    if (!initialModel) throw new Error('No se pudo cargar ningún personaje. Comprueba las rutas de los maniquíes Quaternius en biblioteca/rutas.json.');
    const root = initialModel.root;
    this.engine = new Engine(null, this.library);
    this.engine.limitsOn = () => this.limits !== false; // límites naturales también en el IK (muñeca)
    // Una tira con un clip de la biblioteca aún sin pistas: se leen y se vuelve a pintar.
    this.engine.onMissingClip = (id) => {
      this.ensureClip(id).then((c) => {
        if (!c?.tracks) return;
        this.fixStrips();
        this.evaluate();
        this.timeline?.draw();
      });
    };
    this.timeline = new Timeline($('#tcanvas'), this);
    this.panels = buildPanels(this);
    this.texto = buildTexto(this);
    this.directorUI = mountDirector(this); // Motion Director: destinos, caminos y secuencia
    this.aimUI = mountAim(this); // Look At y Reach Target sobre los objetivos del plan
    this.plannerUI = mountPlanner(this); // Motion Planning: el mismo plan como nodos con condiciones
    this.toolsUI = mountHerramientas(this); // Herramientas (add-on de Blender, reimplementado): panel del menú superior
    installEditLayer(this); // Editar capa de movimiento: pose de reposo, puño, puntillas, pines T/R, títere, mantener en la tira
    this.topmenu = mountTopMenu(this); // herramientas de animación como menús desplegables
    await this.setCharacterRoot(root, { id: initialCharacter.id, name: initialCharacter.name, credit: initialCharacter.credit }, false, initialCharacter.kind !== 'studio');
    if (sesionAnimal?.activo) this.viewport.charHolder.visible = false; // oculto hasta que el jinete esté sentado (animales.restaurar)
    if (initialCharacter.kind === 'url') {
      setPrefs(`charInfo:${initialCharacter.id}`, initialCharacter);
      if (initialCharacter.name === 'Maniquí (Quaternius)') setPrefs('quatInfo', initialCharacter);
    }

    this.modes = mountModes(this); // Maniquí (animación general) / En escena
    this.sceneLive = mountSceneLive(this); // «En escena» sobre el escenario vivo del Estudio
    this.animales = mountAnimales(this); // Biblioteca › Animales (caballo): clips nativos sobre su propio esqueleto
    // Estado inicial: enlace (#...) > autoguardado del modo > Reposo
    if (location.hash.length > 2) this.loadHash(location.hash);
    else {
      const auto = new URLSearchParams(location.search).has('studioSession') ? null : (this.mode === 'maniqui' && (await db.get('projects', 'auto:general'))) || (await db.get('projects', 'auto'));
      if (auto && auto.doc) this.loadDoc(auto.doc, false);
      else this.useClip('gen_reposo', false);
    }
    try { await this.animales?.restoreDocument(); }
    catch (e) { console.warn('Animación del caballo', e); this.toast(e.message, true); }
    this.bindKeys();
    this.bindDrop();
    this.loop();
    // Dentro del Estudio la biblioteca se lee cuando el personaje ya está en escena: leerla antes bloqueaba la apertura.
    if (studioEmbedded) {
      let scanned = false;
      this.afterStudioLoaded = () => { if (!scanned) { scanned = true; setTimeout(() => this.scanLibrary(), 400); } };
      setTimeout(() => this.afterStudioLoaded(), 15000);
    } else this.scanLibrary();
    // Recargar con Biblioteca › Animales abierta: vuelve tal cual (caballo, jinete, selección, instante) sin mostrar antes el maniquí.
    // No se espera aquí: necesita la biblioteca (clips del jinete), que se lee en segundo plano; el personaje sigue oculto hasta entonces.
    if (!studioEmbedded && this.animales) this.animales.restaurar().catch((e) => { console.warn('Animales: restaurar sesión', e); this.viewport.charHolder.visible = true; });
    else this.viewport.charHolder.visible = true;
    try { await mountBehaviors(this); } catch(error) { console.warn('Biblioteca de comportamientos',error);this.toast('No se pudo abrir Comportamientos. El Taller sigue disponible.',true); }
    // Descargas de Mixamo (u otras) que el servidor guarda en biblioteca/: aparecen solas.
    if (import.meta.hot) {
      let t = 0;
      import.meta.hot.on('taller:biblioteca', () => {
        clearTimeout(t);
        t = setTimeout(() => this.scanLibrary(), 3000);
      });
    }
  }

  // ---------- Personaje ----------
  async setCharacterRoot(root, meta, keepDoc = true, recordar = true, reframe = true) {
    this.stage?.clearPropsForRig();
    normalizeCharacter(root);
    const savedMap = prefs(`map:${meta.id}`, null);
    let rig = new Rig(root, savedMap ? { mapping: savedMap } : {});
    if (!rig.humanoid && savedMap) rig = new Rig(root);
    if (!rig.humanoid && rig.kind !== 'quadruped') this.toast(`«${meta.name}»: no reconozco un esqueleto humanoide. Revisa el mapeo en Preparar › Personaje.`, true);
    // Axilas y hombros: pesos suavizados en memoria (el archivo no cambia).
    // Axilas, mochila u otros accesorios y límites de articulaciones: general, con los ajustes del perfil del personaje.
    else if (rig.humanoid) prepareCharacterBody(root, rig, (await characterProfile(meta))?.cuerpo);
    this.rig = rig;
    this.charMeta = meta;
    this.engine.rig = rig;
    this.viewport.setCharacter(root, { reframe });
    this.select(null);
    this.thumbs.clear();
    if (recordar) setPrefs(this.mode === 'maniqui' ? 'generalChar' : 'lastChar', meta.id);
    $('#vcredit').textContent = `${meta.name.toUpperCase()}${meta.credit ? ' · ' + meta.credit : ''}`;
    // El plan del Motion Director va en metros: con otro cuerpo cambian el paso y los tiempos.
    if (this.engine.doc.director?.steps?.length) this.directorUI?.compile();
    this.evaluate();
    this.panels.refreshAll();
    this.directorUI?.sync();
    this.modes?.noteCharacter(meta);
    this.sceneLive?.sync();
  }

  /** Vuelve a poner un personaje que ya estaba preparado (cambio de modo): sin recargar ni volver a medir. */
  swapCharacter({ root, rig, meta, doc, undo = [], redo = [] }, { reframe = true } = {}) {
    this.rig = rig;
    this.charMeta = meta;
    this.engine.rig = rig;
    this.engine.doc = doc;
    this.undoStack = undo;
    this.redoStack = redo;
    this.viewport.setCharacter(root, { reframe });
    this.select(null);
    this.thumbs.clear();
    $('#vcredit').textContent = `${meta.name.toUpperCase()}${meta.credit ? ' · ' + meta.credit : ''}`;
    this.evaluate();
    this.panels.refreshAll();
    this.directorUI?.sync();
  }

  async wearCharacter(id, quiet = false) {
    const c = this.characters.find((x) => x.id === id);
    if (!c) throw new Error('personaje no encontrado');
    let model;
    if (c.kind === 'url') {
      model = await loadModelURL(c.url, c.file);
      const info = { id: c.id, name: c.name, kind: 'url', url: c.url, file: c.file, credit: c.credit };
      setPrefs(`charInfo:${c.id}`, info);
      if (c.name === 'Maniquí (Quaternius)') setPrefs('quatInfo', info);
    }
    else {
      const rec = await db.get('characters', id);
      model = await loadModel(rec.data, rec.file);
    }
    await this.setCharacterRoot(model.root, { id: c.id, name: c.name, credit: c.credit }, true);
    if (!quiet) this.toast(`Personaje: ${c.name}`);
  }

  // ---------- Biblioteca de archivos ----------
  // Una sola lectura a la vez; si llegan archivos durante una lectura, se repite al acabar.
  async scanLibrary() {
    if (this._scanning) return (this._rescan = true);
    this._scanning = true;
    try {
      do {
        this._rescan = false;
        await this._scanLibrary();
      } while (this._rescan);
    } finally {
      this._scanning = false;
    }
  }

  async _scanLibrary() {
    let list;
    try {
      list = (await (await fetch('/api/biblioteca')).json()).archivos;
    } catch {
      return;
    }
    const info = this.panels.libProgress;
    // Índice: una ficha ligera por clip (nombre, duración, bucle, avance…), en un solo registro.
    // Las pistas completas siguen en «cache» y solo se leen al usar el clip (ensureClip).
    let indice = await db.get('indice', 'biblioteca');
    const primeraVez = !indice || indice.v !== LIB_INDEX_V;
    if (primeraVez) {
      indice = { id: 'biblioteca', v: LIB_INDEX_V, files: {} };
      // Purga de cachés de versiones antiguas: solo al crear el índice (antes se leían todas las pistas en cada arranque).
      for (const k of await db.keys('cache')) if (!/^v7j?\|/.test(String(k))) await db.del('cache', k);
    }
    const files = indice.files;
    // Rider clips are re-read with the corrected FBX loader (own cache key).
    const keyOf = (a) => `v7${usaLectorEjes(a.ruta) ? 'j' : ''}|${a.url}|${a.bytes}|${a.mtime}`;
    // 1) Lo ya conocido: fichas al instante, sin abrir ningún archivo.
    const pendientes = [];
    for (const a of list) {
      const entry = files[keyOf(a)];
      if (entry) this._registerLibFile(a, entry);
      else pendientes.push(a);
    }
    // Fichas de archivos que ya no están en la lista (borrados o cambiados).
    const vivos = new Set(list.map(keyOf));
    let sucio = primeraVez;
    for (const k of Object.keys(files)) if (!vivos.has(k)) { delete files[k]; sucio = true; }
    this.panels.refreshLibrary();
    // 2) Solo lo nuevo o cambiado: de la caché de pistas si ya existe; si no, se descarga y se convierte.
    let done = 0;
    let lastShown = Date.now();
    let lastSaved = Date.now();
    for (const a of pendientes) {
      const key = keyOf(a);
      const pack = this.packName(a.ruta);
      const author = this.libAuthor(a.ruta, pack);
      info(`Leyendo ${a.ruta.split('/').pop()}…`, done / pendientes.length);
      try {
        let cached = await db.get('cache', key);
        if (!cached) {
          const model = await loadModelURL(a.url, a.ruta);
          const clips = [];
          const r = new Rig(model.root);
          for (const anim of model.animations) {
            if (!anim.tracks.length) continue;
            const single = model.animations.filter((x) => x.tracks.length).length === 1;
            const fileBase = a.ruta.split('/').pop().replace(/\.[^.]+$/, '').replace(/_ue5$/i, '');
            const name = prettyName(single ? fileBase.replace(/^\d+_/, '') : anim.name);
            const id = `lib:${slug(pack)}:${slug(single ? fileBase : anim.name)}`;
            try {
              const c = clipFromAnimation(model.root, anim, { id, name, tags: tagsFor(anim.name + ' ' + name, [pack]), source: 'biblioteca', author, rig: r, loopPorNombre: !pack.startsWith('Kimodo') });
              clips.push(clipToJSON(c));
            } catch (e) {
              console.warn(a.ruta, anim.name, e.message);
            }
            await new Promise((res) => setTimeout(res, 0));
          }
          cached = { id: key, clips, hasChar: hasSkin(model.root) && r.humanoid, ruta: a.ruta, url: a.url };
          await db.put('cache', cached);
        }
        const entry = { key, hasChar: !!cached.hasChar, clips: cached.clips.map((j) => libClipMeta(j, pack.startsWith('Kimodo'))) };
        files[key] = entry;
        sucio = true;
        this._registerLibFile(a, entry);
      } catch (e) {
        console.warn('biblioteca', a.ruta, e);
      }
      done++;
      if (sucio && Date.now() - lastSaved > 5000) {
        lastSaved = Date.now();
        await db.put('indice', indice);
        sucio = false;
      }
      // Mostrar lo ya leído mientras sigue la lectura (la primera vez son minutos).
      if (Date.now() - lastShown > 2500) {
        lastShown = Date.now();
        const editing = document.activeElement?.closest?.('#spAnim') && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
        if (!editing) this.panels.refreshLibrary();
      }
    }
    if (sucio) await db.put('indice', indice);
    info(`${[...this.library.values()].filter((c) => c.source === 'biblioteca').length} clips de ${list.length} archivos`, 1);
    this.panels.refreshLibrary();
    this.panels.refreshCharacters();
    // El personaje de la última sesión, si es de la biblioteca, ya está disponible.
    if (this._wantChar && this.characters.find((c) => c.id === this._wantChar)) {
      const id = this._wantChar;
      this._wantChar = null;
      await this.wearCharacter(id, true);
    }
    // Si el enlace pedía un clip que acaba de llegar, aplicarlo.
    if (this.engine.doc.strips.some((s) => s.len < 0 || !this.library.has(s.clipId))) this.fixStrips();
    this.evaluate();
  }

  libAuthor(ruta, pack) {
    return /^jinete \(horse animset pro\)/i.test(ruta) ? 'Malbers' : /quaternius|universal animation library/i.test(ruta) ? 'Quaternius' : /humane/i.test(ruta) ? 'Humane' : /mocap_pack|rokoko/i.test(ruta) ? 'Mocap Pack (Rokoko)' : pack === 'Mixamo' ? 'Mixamo' : '';
  }

  /** Pone en la biblioteca las fichas de un archivo (sin pistas) y, si trae personaje, lo ofrece. */
  _registerLibFile(a, entry) {
    const pack = this.packName(a.ruta);
    const author = this.libAuthor(a.ruta, pack);
    const esPersonaje = a.raiz === 'local' && /^personajes\//i.test(a.ruta);
    // Un personaje con varias animaciones las aporta al repertorio (las de Mixamo, a «Mixamo»).
    const aporta = esPersonaje && entry.clips.length >= 2;
    if (!esPersonaje || aporta) {
      entry.clips.forEach((m, i) => {
        const prev = this.library.get(m.id);
        // Corrección general (Maniquí › «✔ Corrección general»): la versión corregida reemplaza a la del archivo.
        // Solo se le copia dónde está, para que siga en su categoría. Borrarla en Tuyas devuelve el original.
        if (prev?.mine && prev.tags?.includes('corregida')) {
          prev.ruta = a.ruta;
          prev.pack ||= aporta ? (/mixamo/i.test(a.ruta) ? 'Mixamo' : 'Tuyas') : pack;
          return;
        }
        // Un clip ya cargado del mismo archivo conserva sus pistas.
        const c = prev && prev.fileKey === entry.key ? prev : { ...m, tags: [...(m.tags || [])], tracks: null, hips: null, lazy: true, fileKey: entry.key, fileIndex: i };
        c.pack = aporta ? (/mixamo/i.test(a.ruta) ? 'Mixamo' : 'Tuyas') : pack;
        // Fuera de la caché: reorganizar carpetas no recodifica las animaciones.
        if (a.perfil) c.gender = a.perfil;
        // Carpeta de origen: la usan las categorías (Categoría › Subcategoría) y el buscador.
        c.ruta = a.ruta;
        if (aporta) {
          c.author = /mixamo/i.test(a.ruta) ? 'Mixamo' : c.author;
          c.tags = [...(m.tags || []).filter((t) => t !== pack), c.pack];
        }
        this.library.set(c.id, c);
      });
    }
    if (entry.hasChar && (esPersonaje || entry.clips.length === 0 || /mannequin|ual1/i.test(a.ruta))) {
      const nm = /mannequin_f/i.test(a.ruta) ? 'Maniquí femenino (Quaternius)' : /ual1|universal animation library\[/i.test(a.ruta) ? 'Maniquí (Quaternius)' : prettyName(a.ruta.split('/').pop().replace(/\.[^.]+$/, ''));
      const id = `url:${a.url}`;
      if (!this.characters.find((x) => x.id === id)) this.characters.push({ id, name: nm, kind: 'url', url: a.url, file: a.ruta, credit: author ? `RIG POR ${author.toUpperCase()} · CC0` : '' });
    }
  }

  /** Pistas de un clip de la biblioteca: se leen de la caché local solo cuando hacen falta. */
  ensureClip(id) {
    const c = this.library.get(id);
    if (!c || !c.lazy) return Promise.resolve(c || null);
    if (c.failed) return Promise.resolve(null);
    if (c._loading) return c._loading;
    c._loading = (async () => {
      const cached = await db.get('cache', c.fileKey);
      const j = cached?.clips?.[c.fileIndex];
      if (!j) throw new Error(`Sin datos de «${c.name}»`);
      const full = clipFromJSON(j);
      c.tracks = full.tracks;
      c.hips = full.hips;
      c.fps = full.fps;
      c.frames = full.frames;
      c.duration = full.duration;
      c.travel = full.travel;
      c.lazy = false;
      return c;
    })()
      .catch((e) => {
        console.warn('biblioteca', id, e);
        c.failed = true;
        return null;
      })
      .finally(() => { delete c._loading; });
    return c._loading;
  }

  /** Varios clips a la vez (ids sueltos, sin repetir). */
  ensureClips(ids) {
    return Promise.all([...new Set([...ids].filter(Boolean))].map((id) => this.ensureClip(id)));
  }

  /** Clips que usa el documento abierto: tiras y pasos del Motion Director. */
  docClipIds(doc = this.engine.doc) {
    return [...(doc.strips || []).map((s) => s.clipId), ...(doc.director?.steps || []).flatMap((s) => [s.clip, s.sitIn, s.sitOut]), doc.director?.walk, doc.director?.idle];
  }

  packName(ruta) {
    const top = ruta.split('/')[0];
    if (/^mixamo$/i.test(top) || /mixamo/i.test(top)) return 'Mixamo';
    if (/^personajes$/i.test(top)) return 'Personajes';
    if (/^kimodo\/guardadas\//i.test(ruta)) return 'Kimodo guardadas';
    if (/universal animation library 2/i.test(ruta)) return 'UAL 2';
    if (/universal animation library/i.test(ruta)) return 'UAL 1';
    if (/humane/i.test(ruta)) return 'Humane';
    if (/mocap_pack_05|soccer/i.test(ruta)) return 'Fútbol (mocap)';
    if (/mocap_pack_01/i.test(ruta)) return 'Vida diaria 1 (mocap)';
    if (/mocap_pack_02/i.test(ruta)) return 'Limpieza (mocap)';
    if (/mocap_pack_03/i.test(ruta)) return 'Conversación (mocap)';
    if (/mocap_pack_04/i.test(ruta)) return 'Público y reacciones (mocap)';
    if (/mocap_pack_06/i.test(ruta)) return 'Ejercicio (mocap)';
    if (/mocap_pack_07/i.test(ruta)) return 'Vida diaria 2 (mocap)';
    if (/mocap_pack_08/i.test(ruta)) return 'Halloween (mocap)';
    if (/^505 survival/i.test(ruta)) return 'Supervivencia (505)';
    if (/^church people/i.test(ruta)) return 'Iglesia (Church People)';
    if (/^conversations michael 8/i.test(ruta)) return 'Conversación (Michael 8)';
    if (/^anime genesis 8/i.test(ruta)) return 'Anime (Genesis 8)';
    if (/^iclone - /i.test(top)) return top; // packs convertidos de iClone: «iClone - …» tal cual
    if (/100 idle animation pack/i.test(ruta)) return 'Esperas (100 Idle)';
    if (/^jinete \(horse animset pro\)/i.test(ruta)) return 'Jinete (a caballo)';
    return prettyName(top);
  }

  // ---------- Documento ----------
  pushUndo() {
    this.undoStack.push(JSON.stringify(this.engine.doc));
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo() {
    if (!this.undoStack.length) return this.toast('Nada que deshacer');
    this.redoStack.push(JSON.stringify(this.engine.doc));
    this.engine.doc = JSON.parse(this.undoStack.pop());
    this.changed(false);
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.engine.doc));
    this.engine.doc = JSON.parse(this.redoStack.pop());
    this.changed(false);
  }

  changed(refreshPanels = true) {
    this.sceneLive?.beginEdit();
    this.pathView?.invalidate();
    this.evaluate();
    this.timeline.draw();
    if (refreshPanels) this.panels.refreshDoc();
    if (this.topmenu?.isOpen('herramientas')) this.toolsUI?.render();
    this.directorUI?.sync();
    clearTimeout(this._save);
    this._save = setTimeout(() => this.autosave(), 600);
  }

  autosave() {
    if (this.animalPreview) return; // Mounted rider playback is a temporary preview.
    const studio = new URLSearchParams(location.search).has('studioSession');
    // Maniquí: la animación general tiene su propio autoguardado, también dentro del Estudio.
    if (this.mode === 'maniqui') {
      db.put('projects', { id: 'auto:general', name: 'Animación general', date: Date.now(), doc: this.engine.doc, charId: this.charMeta.id });
      if (studio) return;
    } else if (studio) {
      // Dentro del Estudio se guarda un borrador por actuación (src/ui/behaviors.js), no el autoguardado general.
      this.studioDraftSave?.();
      return;
    } else db.put('projects', { id: 'auto', name: 'Recuperado', date: Date.now(), doc: this.engine.doc, charId: this.charMeta.id });
    try {
      history.replaceState(null, '', `#${docToHash(this.engine.doc, this.rig)}`);
    } catch {
      /* enlace demasiado largo */
    }
  }

  loadDoc(doc, undoable = true) {
    if (undoable) this.pushUndo();
    const base = newDocument();
    this.engine.doc = { ...base, ...doc, adjust: { ...base.adjust, ...(doc.adjust || {}) }, ik: { ...base.ik, ...(doc.ik || {}) }, ikv: ikVersion(doc) };
    this.fixStrips();
    // Un plan del Motion Director sin compilar (venía en un enlace): se compila al abrir.
    const dd = this.engine.doc.director;
    if ((dd?.steps?.length && !this.engine.doc.root) || (dd?.aims?.length && !this.engine.doc.aim)) this.directorUI?.compile();
    this.setFrame(this.engine.range()[0]);
    this.changed();
    this.timeline.fit();
  }

  loadHash(hash) {
    try {
      this.loadDoc(hashToDoc(hash, this.rig), false);
    } catch (e) {
      console.warn(e);
      this.toast('No pude leer el enlace', true);
    }
  }

  fixStrips() {
    for (const s of this.engine.doc.strips) {
      const c = this.library.get(s.clipId);
      if (c && s.len < 0) s.len = c.frames;
    }
  }

  useClip(id, undoable = true) {
    const c = this.library.get(id);
    if (!c) return;
    if (undoable) this.pushUndo();
    const d = this.engine.doc;
    d.strips = [{ id: uid('s'), clipId: id, start: 0, len: c.frames, blend: 0, speed: 1, loop: c.loop, inPlace: c.travel > 0.05, mirror: false, reverse: false }];
    d.rangeMode = 'auto';
    this.selStrip = d.strips[0].id;
    this.libSel = id;
    this.setFrame(0);
    this.changed();
    this.timeline.fit();
    if (this.panels) this.panels.showClipInfo(c);
    if (c.native) this.animales?.restoreDocument().catch(e => this.toast(e.message, true));
  }

  addStrip(id, at = null) {
    const c = this.library.get(id);
    if (!c) return null;
    this.pushUndo();
    const d = this.engine.doc;
    const start = at ?? this.engine.stripsEnd();
    const s = { id: uid('s'), clipId: id, start, len: c.frames, blend: d.strips.length ? 6 : 0, speed: 1, loop: c.loop, inPlace: c.travel > 0.05, mirror: false, reverse: false };
    d.strips.push(s);
    this.selStrip = s.id;
    this.changed();
    return start + c.frames;
  }

  async insertLibraryStrips(ids, at, resolveClip = (id) => this.ensureClip(id)) {
    const { doc, rig } = this.engine;
    const { clips, strips, frame } = await prepareStripInsertion(ids, resolveClip, rig, doc, at);
    if (this.engine.doc !== doc || this.engine.rig !== rig) throw new Error('El personaje o el documento cambió durante la carga.');
    if (!strips.length) return frame;
    this.pushUndo();
    for (const clip of clips) this.library.set(clip.id, clip);
    doc.strips.push(...strips);
    this.selStrip = strips.at(-1).id;
    this.changed();
    return frame;
  }

  selectStrip(id) {
    this.selStrip = id;
    this.timeline.draw();
    this.panels.refreshStrip();
    if (!id) return;
    // Con las herramientas en el menú superior el panel «Tira» vive en un desplegable: abrirlo, si no nadie lo ve.
    if (this.topmenu && this.topmenu.dock === 'top') {
      if (!this.topmenu.isOpen('tira')) this.topmenu.openMenu('tira');
    } else this.panels.openAnimSub('tira');
  }

  /** Corta la tira en el fotograma f: dos tiras que siguen el mismo clip sin salto. */
  splitStrip(id, f) {
    const d = this.engine.doc;
    const s = d.strips.find((x) => x.id === id);
    f = Math.round(f);
    if (!s || f <= s.start + 1 || f >= s.start + s.len - 1) return this.toast('Pon el cabezal dentro de la tira para cortarla', true);
    this.pushUndo();
    const cut = f - s.start;
    const n = { ...s, id: uid('s'), start: f, len: s.len - cut, blend: 0, offset: (s.offset || 0) + cut };
    delete n.warp;
    s.len = cut;
    d.strips.splice(d.strips.indexOf(s) + 1, 0, n);
    this.selStrip = n.id;
    this.changed();
    this.panels.refreshStrip();
  }

  setActiveLayer(id) {
    this.engine.doc.activeLayer = id;
    this.changed();
  }

  renameLayer(id) {
    const l = this.engine.layer(id);
    const n = prompt('Nombre de la capa', l.name);
    if (n) {
      this.pushUndo();
      l.name = n;
      this.changed();
    }
  }

  // ---------- Tiempo ----------
  setFrame(f) {
    this.sceneLive?.beginEdit();
    this.engine.frame = f;
    this.evaluate();
    this.timeline.draw();
  }

  evaluate() {
    if (!this.rig) return;
    this.animales?.invalidatePair();
    this.engine.evaluate(this.engine.frame);
    $('#vframe').textContent = `[${Math.round(this.engine.frame)}]`;
    if (this.panels) this.panels.refreshTransform();
    if (!this.playing) this.viewport.updateOnion();
  }

  togglePlay(dir = 1) {
    this.playOnce = false;
    if (this.playing && this.playDir === dir) this.playing = false;
    else {
      this.sceneLive?.beginEdit();
      this.playing = true;
      this.playDir = dir;
    }
    this.viewport.updateOnion();
    this.panels.refreshTransport();
  }

  playbackRange() {
    const range = this.engine.range();
    return this.animales?.playbackRange(range) ?? range;
  }

  loop() {
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.flushGizmo(); // arrastre del gizmo: claves y pose de este fotograma, antes de enviarla y pintarla
      if (this.playing && !this.dragging) {
        const [a, b] = this.playbackRange();
        let f = this.engine.frame + dt * this.engine.fps * this.speed * this.playDir;
        if (f > b) {
          // playOnce: el Motion Director reproduce el plan una vez y deja al personaje donde llegó
          if (this.loopPlay && !this.playOnce) f = a + ((f - a) % Math.max(1, b - a));
          else {
            f = b;
            this.playing = false;
            this.playOnce = false;
            this.panels.refreshTransport();
          }
        }
        if (f < a) {
          // Hacia atrás sin bucle: se para al llegar al inicio (antes seguía «reproduciendo» quieto en el fotograma inicial).
          if (this.loopPlay) f = b - ((a - f) % Math.max(1, b - a));
          else { f = a; this.playing = false; this.panels.refreshTransport(); }
        }
        this.engine.frame = f;
        if (this.puppet?.record) this.puppetTick(f); // Títere directo grabando: clave de este fotograma
        this.engine.evaluate(f);
        $('#vframe').textContent = `[${Math.round(f)}]`;
        this.timeline.draw();
      }
      this.aimUI?.tick();
      this.plannerUI?.tick();
      this.animales?.tick(dt);
      this.sceneLive?.tick();
      this.pathView?.tick();
      this.pivotView?.tick();
      // Precargado y oculto dentro del Estudio: no se dibuja (el Estudio sigue a pleno rendimiento).
      if (!studioHold.held) {
        this.viewport.render();
        this.pumpThumbs();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Selección y gizmo ----------
  /** Huesos elegidos: el activo + los extra (Mayús+clic, caja B, hijos, ambos lados). */
  selectedBones() {
    const s = this.selection;
    const out = new Set(this.multi || []);
    if (s && s.kind === 'bone') out.add(s.bone);
    return [...out];
  }

  select(sel, add = false) {
    if (add && sel && sel.kind === 'bone') {
      this.multi ||= new Set();
      if (this.selection && this.selection.kind === 'bone') this.multi.add(this.selection.bone);
      if (this.multi.has(sel.bone) && this.selection?.bone !== sel.bone) this.multi.delete(sel.bone);
    } else this.multi = new Set();
    this._select(add ? sel : this.ikRedirect(sel));
  }

  selectMany(bones) {
    if (!bones.length) return this.select(null);
    this.multi = new Set(bones.slice(0, -1));
    this._select({ kind: 'bone', bone: bones[bones.length - 1] });
  }

  selectChildren() {
    const all = new Set(this.selectedBones());
    for (const b of [...all]) b.traverse((o) => this.rig.index.has(o) && all.add(o));
    this.selectMany([...all]);
  }

  selectBothSides() {
    const all = new Set(this.selectedBones());
    for (const b of [...all]) {
      const c = this.rig.canonOf.get(b);
      if (c && /[LR]$/.test(c) && c !== 'upperChest') {
        const o = this.rig.bone(c.slice(0, -1) + (c.endsWith('L') ? 'R' : 'L'));
        if (o) all.add(o);
      }
    }
    this.selectMany([...all]);
  }

  // ---------- Copiar / pegar transformaciones ----------
  /** overTime: copia cada fotograma del rango (o de las claves elegidas). */
  copyTransforms({ overTime = false, from = null, to = null } = {}) {
    const bones = this.selectedBones().length ? this.selectedBones() : Object.values(this.rig.mapping).map((n) => this.rig.byName.get(n));
    const f0 = Math.round(this.engine.frame);
    const frames = overTime ? this.rangeFrames(from, to) : [f0];
    const data = [];
    for (const f of frames) {
      this.engine.evaluate(f);
      const per = {};
      for (const b of bones) {
        per[b.name] = { q: b.quaternion.toArray(), p: b.position.toArray(), wq: b.getWorldQuaternion(new THREE.Quaternion()).toArray(), wp: b.getWorldPosition(new THREE.Vector3()).toArray() };
      }
      data.push({ f, per });
    }
    this.engine.evaluate(this.engine.frame);
    this.clipboard = { frames: data, base: frames[0], active: this.selection?.bone?.name || null };
    this.toast(`Copiado: ${bones.length} hueso(s) × ${frames.length} fotograma(s)`);
  }

  rangeFrames(from, to) {
    if (from != null && to != null) return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const sel = this.timeline.selKeys;
    if (sel && sel.size) {
      const fs = [...new Set([...sel].map((k) => +k.split('|')[2]))].sort((a, b) => a - b);
      return fs;
    }
    const [a, b] = this.engine.range();
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }

  /** mode: 'local' (tal cual) | 'global' (misma orientación en el mundo) | 'mirror' (al otro lado). channels: {loc, rot} */
  pasteTransforms({ mode = 'local', channels = { loc: true, rot: true }, atOriginalFrames = false } = {}) {
    const cb = this.clipboard;
    if (!cb) return this.toast('Copia algo primero', true);
    this.pushUndo();
    const rig = this.rig;
    const f0 = Math.round(this.engine.frame);
    for (const fr of cb.frames) {
      const f = atOriginalFrames ? fr.f : f0 + (fr.f - cb.base);
      // Todo pasa por keyPoseSmart: brazos y piernas en IK reciben claves IK (sin realimentar la FK con la pose resuelta).
      const entries = [];
      for (const [name, v] of Object.entries(fr.per)) {
        let bone = rig.byName.get(name);
        if (!bone) continue;
        const e = { bone };
        if (mode === 'mirror') {
          const c = rig.canonOf.get(bone);
          if (!c) continue;
          const c2 = /[LR]$/.test(c) && c !== 'upperChest' ? c.slice(0, -1) + (c.endsWith('L') ? 'R' : 'L') : c;
          const dst = rig.bone(c2);
          if (!dst) continue;
          const W = new THREE.Quaternion().fromArray(v.wq).multiply(rig.TwInv[c]);
          const cq = rig.worldToCanonQ(W);
          cq.set(cq.x, -cq.y, -cq.z, cq.w);
          e.bone = bone = dst;
          if (channels.rot) e.wq = rig.canonToWorldQ(cq).multiply(rig.Tw[c2]);
        } else if (mode === 'global') {
          if (channels.rot) e.wq = new THREE.Quaternion().fromArray(v.wq);
        } else if (channels.rot) e.q = new THREE.Quaternion().fromArray(v.q);
        const isHips = rig.canonOf.get(bone) === 'hips';
        if (channels.loc && isHips) e.p = new THREE.Vector3().fromArray(v.p);
        if (e.q || e.wq || e.p) entries.push(e);
      }
      this.engine.keyPoseSmart(f, entries);
    }
    this.changed();
    this.toast('Pegado');
  }

  _select(sel) {
    this.selection = sel;
    this.attachGizmo();
    if (this.panels) {
      this.panels.refreshTransform();
      this.panels.highlightOutliner();
      this.panels.refreshPicker?.();
      this.panels.refreshMotion?.();
      if (this.onlySelected) this.timeline.draw();
    }
    if (this.topmenu?.isOpen('herramientas')) this.toolsUI?.render();
  }

  setTool(t) {
    this.tool = t;
    const s = this.ikRedirect(this.selection);
    if (s !== this.selection) this._select(s);
    else this.attachGizmo();
    this.panels.refreshTools();
  }

  /**
   * Herramienta «Arrastrar (IK)»: una mano o un pie se mueven por IK (el brazo o la pierna los siguen)
   * y un codo o una rodilla mueven su polo. Enciende el IK de la cadena si hacía falta.
   * La herramienta Mover sigue trasladando el hueso tal cual.
   */
  ikRedirect(sel) {
    if (!sel || sel.kind !== 'bone' || !this.rig) return sel;
    if (sel.drag) sel = { kind: 'bone', bone: sel.bone };
    if (this.tool !== 'ik') return sel;
    const canon = this.rig.canonOf.get(sel.bone);
    if (this.rig.kind === 'quadruped') {
      for (const [chain, bones] of Object.entries(horseChains(this.rig))) {
        const i = bones.indexOf(sel.bone);
        if (i < 1) continue;
        // Both the knee and hock are independent pivots. Only the existing
        // menudillo effector redirects to IK; never treat the hock as a knee.
        if (i < bones.length - 1 && !(i === 1 && this.engine.ikState[chain]?.pin > .5)) return { kind: 'bone', bone: sel.bone, drag: 'aim' };
        if (!this.engine.doc.ik[chain]) {
          if (this.engine.layer().lock) return sel;
          this.pushUndo();
          this.engine.switchIK(chain, true, Math.round(this.engine.frame));
          this.engine.evaluate(this.engine.frame);
          this.panels?.refreshRig?.();
          this.panels?.refreshOutliner?.();
          this.toast(`${horseChainLabel(chain)}: IK encendido.`);
        }
        return { kind: i === bones.length - 1 ? 'ik' : 'pole', chain };
      }
      if (sel.bone.parent && Object.values(horseChains(this.rig)).some(bones => bones.at(-1) === sel.bone.parent)) return { kind: 'bone', bone: sel.bone, drag: 'aim' };
      if (['chest', 'neck', 'head'].includes(canon)) return { kind: 'bone', bone: sel.bone, drag: 'reach' };
      return sel;
    }
    for (const [chain, def] of Object.entries(IK_CHAINS)) {
      const i = def.bones.indexOf(canon);
      if (i < 1) continue;
      // Rodilla o codo: se lleva el miembro entero (el tobillo o la muñeca van detrás).
      // Solo si la mano o el pie están anclados en el mundo se mueve hacia dónde dobla (polo).
      const st0 = this.engine.ikState[chain];
      if (i === 1 && !(st0 && st0.pin > 0.5)) return { kind: 'bone', bone: sel.bone, drag: 'aim' };
      if (!this.engine.doc.ik[chain]) {
        if (this.engine.layer().lock) return sel;
        this.pushUndo();
        this.engine.switchIK(chain, true, Math.round(this.engine.frame));
        this.engine.evaluate(this.engine.frame);
        this.panels?.refreshRig?.();
        this.panels?.refreshOutliner?.();
        this.toast(`${def.label}: IK encendido. Arrastra y el resto de la cadena sigue.`);
      }
      return { kind: i === 2 ? 'ik' : 'pole', chain };
    }
    // Cabeza, cuello y pecho: al arrastrarlos se dobla la columna que tienen debajo.
    if (['chest', 'upperChest', 'neck', 'head'].includes(canon)) return { kind: 'bone', bone: sel.bone, drag: 'reach' };
    return sel;
  }

  /** Huesos que giran al arrastrar un hueso con «Arrastrar»: el de arriba (rodilla, codo) o la columna (cabeza, pecho). */
  dragChain(s) {
    const rig = this.rig;
    if (s.drag === 'aim') return [s.bone.parent].filter((b) => b && rig.index.has(b));
    const chain = [];
    for (const c of ['spine', 'chest', 'upperChest', 'neck']) {
      const b = rig.bone(c);
      if (!b || b === s.bone) continue;
      let p = s.bone.parent;
      while (p && p !== b) p = p.parent;
      if (p) chain.push(b);
    }
    return chain;
  }

  /** Manos y pies con candado que dependen del hueso que se va a mover: recuerdan dónde están para quedarse ahí. */
  lockStart(s) {
    const rig = this.rig;
    const locks = this.locks;
    if (!locks) return [];
    let moved = s.kind === 'root' ? rig.bone('hips') : s.kind === 'bone' ? s.bone : null;
    if (s.kind === 'bone' && s.drag) moved = this.dragChain(s)[0];
    if (!moved || this.tool === 'scale') return [];
    const out = [];
    for (const [chain, def] of Object.entries(IK_CHAINS)) {
      if (!locks[chain]) continue;
      const st = this.engine.ikState[chain];
      let p = rig.bone(def.bones[0]);
      if (!st || !p) continue;
      p = p.parent;
      while (p && p !== moved) p = p.parent;
      if (p) out.push({ chain, pos: st.target.clone(), quat: st.targetQ.clone() });
    }
    return out;
  }

  /** Tras mover el cuerpo: las manos y los pies con candado vuelven a su sitio por IK (con clave en este fotograma). */
  applyLocks(f) {
    for (const l of this._locks || []) {
      // pin T (posición), R (giro) o TR (los dos), como los candados de Edit Motion Layer
      const pin = pinOf(this.locks?.[l.chain]) || 'TR';
      if (!this.engine.doc.ik[l.chain]) this.engine.switchIK(l.chain, true, f);
      this.engine.keyIK(l.chain, { pos: pin.includes('T') ? l.pos : undefined, quat: pin.includes('R') ? l.quat : undefined }, f);
    }
  }

  /** IK ⇄ FK de una cadena sin saltos (empareja la pose en el fotograma actual). Lo usan todos los conmutadores. */
  setIK(chain, on, { undo = true, quiet = false } = {}) {
    if (!!this.engine.doc.ik[chain] === !!on) return false;
    if (undo) this.pushUndo();
    this.engine.switchIK(chain, on, Math.round(this.engine.frame));
    this.changed();
    this.panels?.refreshOutliner?.();
    this.panels?.refreshRig?.();
    this.panels?.refreshPicker?.();
    if (!quiet) this.toast(`${IK_CHAINS[chain].label}: ${on ? 'IK (el efector manda)' : 'FK (cada hueso por su cuenta)'}, sin saltos`);
    return true;
  }

  toggleLock(chain) {
    this.cycleLock(chain); // libre → TR → T → R → libre (editlayer.js)
  }

  /** Arrastre de rodilla, codo, cabeza o pecho: gira la cadena de arriba para que el hueso siga al gizmo. */
  dragBoneTo(s, target, f) {
    const A = this._aim;
    const rig = this.rig;
    if (!A || !A.chain.length) return;
    A.chain.forEach((b, i) => b.quaternion.copy(A.start[i]));
    A.chain[0].updateMatrixWorld(true);
    const o = new THREE.Vector3();
    const e = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const many = A.chain.length > 1;
    for (let it = 0; it < (many ? 8 : 1); it++) {
      for (let i = A.chain.length - 1; i >= 0; i--) {
        const b = A.chain[i];
        b.getWorldPosition(o);
        s.bone.getWorldPosition(e);
        const v0 = e.sub(o);
        const v1 = target.clone().sub(o);
        if (v0.lengthSq() < 1e-10 || v1.lengthSq() < 1e-10) continue;
        q.setFromUnitVectors(v0.normalize(), v1.normalize());
        if (many) q.slerp(new THREE.Quaternion(), 0.45);
        const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
        let local = pw.clone().invert().multiply(q.multiply(pw.multiply(b.quaternion)));
        if (this.limits) local = limitEdit(rig, b, A.start[i], local);
        b.quaternion.copy(local);
        b.updateMatrixWorld(true);
      }
    }
    const res = A.chain.map((b) => b.quaternion.clone());
    if (rig.kind === 'quadruped') this.engine.keyPoseSmart(f, A.chain.map((bone, i) => ({ bone, q: res[i] })));
    else A.chain.forEach((b, i) => this.engine.keyBone(b, res[i], null, f));
    if (A.keepQ) {
      // la cabeza conserva hacia dónde miraba
      this.engine.evaluate(f, { ik: false });
      const local = s.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(A.keepQ);
      this.engine.keyBone(s.bone, this.limits ? limitEdit(rig, s.bone, A.keepLocal, local) : local, null, f);
    }
  }

  /** Curva de transición para las claves elegidas o, si no hay, para el tramo en que está el cabezal (de lo seleccionado). */
  applyCurve({ interp = null, bezier = null } = {}) {
    const tl = this.timeline;
    const l = this.engine.layer();
    const f = Math.round(this.engine.frame);
    const keys = [];
    if (tl.selKeys.size) tl.eachSelected((k) => keys.push(k));
    else {
      const filter = this.trackFilter();
      for (const [id, ks] of Object.entries(l.tracks)) {
        if (filter && !filter(id)) continue;
        const k = [...ks].reverse().find((x) => x.f <= f) || ks[0];
        if (k && ks.length > 1) keys.push(k);
      }
    }
    if (!keys.length) return this.toast('Aún no hay claves que curvar: mueve algo en dos momentos distintos', true);
    this.pushUndo();
    for (const k of keys) {
      delete k.bc;
      if (bezier) {
        k.i = 'bezier';
        k.b = bezier.slice();
      } else {
        k.i = interp || 'smooth';
        delete k.b;
      }
    }
    this.changed();
    this.toast(`Curva aplicada a ${keys.length} clave(s)`);
  }

  /** Quita las claves de lo elegido en la capa activa: vuelve a la animación original. */
  resetSelected() {
    const l = this.engine.layer();
    this.pushUndo();
    const filter = this.selection ? this.trackFilter() : () => true;
    const s = this.selection;
    const extra = s && s.kind === 'bone' && s.drag ? new Set(this.dragChain(s).map((b) => b.name)) : null;
    let n = 0;
    for (const id of Object.keys(l.tracks)) if (filter(id) || (extra && /^[rts]:/.test(id) && extra.has(id.slice(2)))) {
      delete l.tracks[id];
      n++;
    }
    this.changed();
    this.toast(n ? 'Restablecido: vuelve a la animación original' : 'No había cambios aquí');
  }

  /** Ancla la mano o el pie elegido donde está: en este fotograma (queda fijo) o en un tramo. */
  pinSelected(f0 = Math.round(this.engine.frame), f1 = f0) {
    const s = this.selection;
    if (!s || !s.chain) return this.toast('Elige la caja IK de una mano o de un pie', true);
    this.pushUndo();
    const ok = this.engine.pinIK(s.chain, f0, f1);
    this.changed();
    this.panels.refreshRig?.();
    this.toast(ok ? (f0 === f1 ? `${IK_CHAINS[s.chain].label} anclada en el mundo` : `${IK_CHAINS[s.chain].label} anclada del ${f0} al ${f1}`) : 'La capa está bloqueada', !ok);
  }

  unpinSelected() {
    const s = this.selection;
    if (!s || !s.chain) return;
    this.pushUndo();
    const n = this.engine.unpinIK(s.chain);
    this.changed();
    this.toast(n ? 'Ancla quitada: vuelve a seguir la animación' : 'No tenía anclas en esta capa');
  }

  /** Quita el deslizamiento de los pies anclándolos mientras están apoyados. */
  lockFeet() {
    this.pushUndo();
    const n = this.engine.lockFeet();
    this.changed();
    this.panels.refreshRig?.();
    this.toast(n ? `Pies fijados en ${n} apoyo(s)` : 'No encontré apoyos: en esta animación los pies no llegan a quedarse quietos en el suelo', !n);
    return n;
  }

  /** Jinete montado: tras sentarlo, el gizmo de un objetivo IK, polo o punto arrastrado vuelve a ponerse sobre su control. */
  syncMountedProxy() {
    const s = this.selection;
    if (this.dragging || !this._proxy || !s || !this.displayXform) return;
    if (s.kind === 'ik') this.ikDisplayPos(s.chain, this._proxy.position);
    else if (s.kind === 'pole' && this.engine.ikState[s.chain]) this._proxy.position.copy(this.engine.ikState[s.chain].pole).applyMatrix4(this.displayXform);
    else if (s.kind === 'bone' && s.drag) s.bone.getWorldPosition(this._proxy.position);
    else return;
    this._proxy.updateMatrixWorld(true);
  }

  /** Jinete montado: el control IK se ve donde está de verdad el pie o la mano (la física de la silla lo ha colocado). */
  ikDisplayPos(chain, out) {
    const b = this.rig.kind !== 'quadruped' && this.rig.bone(chain);
    if (b) return b.getWorldPosition(out);
    const st = this.engine.ikState[chain];
    if (st) out.copy(st.target).applyMatrix4(this.displayXform);
    return out;
  }

  attachGizmo() {
    const vp = this.viewport;
    const s = this.selection;
    // pivote temporal activo (Herramientas): manda su propio gizmo; el de la selección se aparta
    if (this.pivotView?.active) return vp.attachGizmo(null);
    if (!s) return vp.attachGizmo(null);
    if (s.kind === 'bone' && s.drag) {
      if (!this._proxy) {
        this._proxy = new THREE.Object3D();
        vp.scene.add(this._proxy);
      }
      s.bone.getWorldPosition(this._proxy.position);
      this._proxy.quaternion.identity();
      vp.attachGizmo(this._proxy, 'translate', 'world');
    } else if (s.kind === 'bone') {
      // Arrastrar (IK) sobre un hueso sin cadena: la cadera se traslada (el cuerpo entero), los demás giran.
      const mode = this.tool === 'scale' ? 'scale' : this.tool === 'move' || (this.tool === 'ik' && this.rig.canonOf.get(s.bone) === 'hips') ? 'translate' : 'rotate';
      // la cadera se traslada con los ejes del mundo (como iClone): los locales del hueso cambian de un esqueleto a otro
      const hipsMove = this.tool === 'ik' && mode === 'translate' && this.rig.canonOf.get(s.bone) === 'hips';
      vp.attachGizmo(s.bone, mode, hipsMove ? 'world' : this.space);
    } else if (s.kind === 'root') {
      // Raíz: Mover/Arrastrar = trasladar; Rotar = girar solo en Y (cambia la dirección del personaje).
      const hb = this.rig.bone('hips');
      if (this.tool === 'rotate') vp.attachGizmo(hb, 'rotate', 'world', { yOnly: true });
      else vp.attachGizmo(hb, 'translate', 'world');
    } else if (s.kind === 'prop' || s.kind === 'piece') {
      const obj = s.kind === 'prop' ? s.prop.obj : s.piece.obj;
      vp.attachGizmo(obj, this.tool === 'move' ? 'translate' : this.tool === 'scale' ? 'scale' : 'rotate', this.space);
    } else {
      if (!this._proxy) {
        this._proxy = new THREE.Object3D();
        vp.scene.add(this._proxy);
      }
      const st = this.engine.ikState[s.chain];
      if (st) {
        this._proxy.position.copy(s.kind === 'ik' ? st.target : st.pole);
        this._proxy.quaternion.copy(s.kind === 'ik' ? st.targetQ : new THREE.Quaternion());
        // jinete montado: el gizmo va donde se ve el control (espacio de la silla)
        if (this.displayXform) {
          if (s.kind === 'ik') this.ikDisplayPos(s.chain, this._proxy.position);
          else this._proxy.position.applyMatrix4(this.displayXform);
          this._proxy.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(this.displayXform));
        }
      }
      vp.attachGizmo(this._proxy, s.kind === 'pole' || this.tool === 'move' || this.tool === 'ik' ? 'translate' : 'rotate', this.space);
    }
    const snap = this.snap ? THREE.MathUtils.degToRad(this.snap) : null;
    vp.gizmo.setRotationSnap(snap);
  }

  onGizmoDrag(start) {
    this.dragging = start;
    if (start) {
      this.sceneLive?.beginEdit();
      this.pushUndo();
      this.playing = false;
      const s = this.selection;
      // estado inicial de todos los elegidos (para girar varios a la vez, cada uno sobre sí mismo)
      this._aim = null;
      if (s && s.kind === 'bone' && s.drag) {
        const chain = this.dragChain(s);
        const head = this.rig.canonOf.get(s.bone) === 'head';
        const keepQ = head ? s.bone.getWorldQuaternion(new THREE.Quaternion()) : null;
        // punto de partida medido sin IK: lo que se guarda es FK (sin realimentar la pose ya resuelta)
        const f0 = Math.round(this.engine.frame);
        this.engine.evaluate(f0, { ik: false });
        this._aim = { chain, start: chain.map((b) => b.quaternion.clone()), keepQ, keepLocal: s.bone.quaternion.clone() };
        this.engine.evaluate(f0);
      }
      this._locks = s ? this.lockStart(s) : [];
      if (this.holdStrip) this.holdSnapshot();
      // Muñeca en FK: al girar la mano, la pronación la reparte con el antebrazo (como el radio y el cúbito)
      this._wrist = null;
      const cw = s?.kind === 'bone' && this.rig.canonOf.get(s.bone);
      if (cw === 'handL' || cw === 'handR') {
        const la = this.rig.bone(`lowerArm${cw.slice(-1)}`);
        if (la && s.bone.parent) {
          const laW = la.getWorldQuaternion(new THREE.Quaternion());
          this._wrist = { la, laStart: la.quaternion.clone(), parentW0: s.bone.parent.getWorldQuaternion(new THREE.Quaternion()), relFK0: laW.invert().multiply(s.bone.getWorldQuaternion(new THREE.Quaternion())), handStart: s.bone.quaternion.clone() };
        }
      }
      this._dragStart = s && s.kind === 'bone' ? { active: s.bone.quaternion.clone(), activeS: s.bone.scale.clone(), others: (this.multi ? [...this.multi] : []).filter((b) => b !== s.bone).map((b) => ({ b, q: b.quaternion.clone(), p: b.position.clone(), sc: b.scale.clone() })) } : null;
    } else {
      // el último movimiento antes de soltar todavía no se había aplicado
      this.dragging = true;
      this.flushGizmo();
      this.dragging = false;
      if (this.holdStrip) this.holdToStrip();
      this.changed();
      this.attachGizmo();
    }
  }

  /** El gizmo se movió: se aplica en el próximo fotograma (flushGizmo), antes de mandar la pose y de pintar. */
  queueGizmoChange() {
    this._gizmoDirty = true;
  }

  flushGizmo() {
    if (!this._gizmoDirty) return;
    this._gizmoDirty = false;
    this.onGizmoChange();
  }

  onGizmoChange() {
    const s = this.selection;
    if (!s || !this.dragging) return;
    if (s.kind === 'prop' || s.kind === 'piece') return; // objetos y piezas: sin claves, se colocan
    const f = Math.round(this.engine.frame);
    const eng = this.engine;
    if (eng.layer().lock) {
      this.toast('La capa está bloqueada', true);
      return;
    }
    // Sin claves automáticas (● apagado) el gesto solo posa: no se guarda hasta pulsar K («Poner clave»),
    // y se descarta al cambiar de fotograma. Antes la condición nunca se cumplía y siempre se clavaba.
    if (!this.autoKey) {
      if (!this._autoKeyHint) { this._autoKeyHint = true; this.toast('Claves automáticas apagadas: pulsa K para guardar esta pose'); }
      this.panels.refreshTransform();
      return;
    }
    if (s.kind === 'bone' && s.drag) {
      // jinete montado: el punto arrastrado está en la silla; el motor resuelve sin montar
      const to = this._proxy.position.clone();
      if (this.displayXform) to.applyMatrix4(this.displayXform.clone().invert());
      this.dragBoneTo(s, to, f);
      this.applyLocks(f);
    } else if (s.kind === 'bone' || s.kind === 'root') {
      const b = s.kind === 'root' ? this.rig.bone('hips') : s.bone;
      const mode = this.viewport.gizmo.mode;
      let q = b.quaternion.clone();
      // límites naturales: el hueso no pasa de donde llega una articulación real
      if (this.limits && mode === 'rotate' && this._dragStart && s.kind === 'bone') q = limitEdit(this.rig, b, this._dragStart.active, q);
      const p = mode === 'translate' ? b.position.clone() : null;
      const sc = mode === 'scale' ? b.scale.clone() : null;
      this.animales?.riderEditPose(b, mode === 'rotate' ? q : null, p);
      const ds = this._dragStart;
      const delta = ds && mode === 'rotate' ? ds.active.clone().invert().multiply(q) : null;
      const sdelta = ds && sc ? new THREE.Vector3(sc.x / ds.activeS.x, sc.y / ds.activeS.y, sc.z / ds.activeS.z) : null;
      const tw = s.kind === 'bone' && mode !== 'scale' ? eng.tempAt('world', b.name, f) : null;
      if (tw) {
        // control temporal en espacio mundo: la edición cambia su clave de este fotograma (las vecinas se quedan)
        eng.keyTempWorld(tw, f, b.getWorldQuaternion(new THREE.Quaternion()), mode === 'translate' ? b.getWorldPosition(new THREE.Vector3()) : null);
      } else if (mode === 'rotate' && s.kind === 'bone' && (eng.chainOfBone(b) || ds?.others.some((o) => eng.chainOfBone(o.b)))) {
        // Hueso de un miembro en IK (como iClone): el giro mueve el efector y la cadena sigue en IK, sin realimentar la FK.
        const entries = [{ bone: b, q }];
        if (ds) for (const o of ds.others) entries.push({ bone: o.b, q: o.q.clone().multiply(delta) });
        eng.keyPoseSmart(f, entries);
      } else if (mode === 'rotate' && this._wrist && s.kind === 'bone' && b === s.bone && this.limits && !ds?.others.length) {
        // mano en FK: giro natural de muñeca + antebrazo, siempre desde el estado al empezar el arrastre (no acumula)
        const w = this._wrist;
        const want = w.parentW0.clone().multiply(b.quaternion);
        eng.evaluate(f, { ik: false });
        w.la.quaternion.copy(w.laStart);
        w.la.updateMatrixWorld(true);
        eng.naturalWrist(w.la, b, want, w.relFK0, w.handStart, w.laStart);
        const laQ = w.la.quaternion.clone();
        const hQ = b.quaternion.clone();
        eng.keyBone(w.la, laQ, null, f);
        eng.keyBone(b, hQ, null, f);
      } else {
        eng.keyBone(b, mode === 'rotate' ? q : null, p, f, sc);
        if (ds) {
          for (const o of ds.others) {
            if (delta) eng.keyBone(o.b, o.q.clone().multiply(delta), null, f);
            if (sdelta) eng.keyBone(o.b, null, null, f, o.sc.clone().multiply(sdelta));
          }
        }
      }
      if (this.mirrorX && s.kind === 'bone') {
        this.mirrorKey(b, f);
        if (ds) for (const o of ds.others) this.mirrorKey(o.b, f);
      }
      this.applyLocks(f);
    } else if (s.kind === 'ik' || s.kind === 'pole') {
      // jinete montado: el gizmo está en el espacio de la silla; el motor guarda en el suyo
      const inv = this.displayXform ? this.displayXform.clone().invert() : null;
      const pos = this._proxy.position.clone();
      const quat = this._proxy.quaternion.clone();
      if (inv) {
        pos.applyMatrix4(inv);
        quat.premultiply(new THREE.Quaternion().setFromRotationMatrix(inv));
      }
      if (s.kind === 'pole') eng.keyIK(s.chain, { pole: pos }, f);
      else if (this.viewport.gizmo.mode === 'translate') eng.keyIK(s.chain, { pos }, f);
      else eng.keyIK(s.chain, { quat }, f);
    }
    eng.evaluate(eng.frame);
    this.pathView?.invalidate();
    this.timeline.draw();
    this.panels.refreshTransform();
  }

  mirrorKey(bone, f) {
    const c = this.rig.canonOf.get(bone);
    if (!c || !(c.endsWith('L') || c.endsWith('R')) || c === 'upperChest') return;
    const other = this.rig.bone(c.slice(0, -1) + (c.endsWith('L') ? 'R' : 'L'));
    if (!other) return;
    this.engine.evaluate(f);
    const W = bone.getWorldQuaternion(new THREE.Quaternion()).multiply(this.rig.TwInv[c]);
    const cq = this.rig.worldToCanonQ(W);
    cq.set(cq.x, -cq.y, -cq.z, cq.w);
    const c2 = c.slice(0, -1) + (c.endsWith('L') ? 'R' : 'L');
    const Wd = this.rig.canonToWorldQ(cq).multiply(this.rig.Tw[c2]);
    // giro de mundo → local medido sin IK (o claves IK si el otro lado está en IK): sin realimentación
    this.engine.keyPoseSmart(f, [{ bone: other, wq: Wd }]);
  }

  /** Filtro de pistas de lo seleccionado (para "solo seleccionado" y para claves). */
  trackFilter() {
    const s = this.selection;
    if (!s) return null;
    if (s.kind === 'bone') {
      const names = new Set(this.selectedBones().map((b) => b.name));
      return (id) => /^[rts]:/.test(id) && names.has(id.slice(2));
    }
    if (s.kind === 'root') {
      const n = this.rig.mapping.hips;
      return (id) => id === `t:${n}` || id === `r:${n}`;
    }
    return (id) => id.startsWith(`ik:${s.chain}:`);
  }

  keySelected() {
    const s = this.selection;
    const f = Math.round(this.engine.frame);
    this.pushUndo();
    if (!s) {
      const ids = Object.keys(this.engine.layer().tracks);
      if (!ids.length) return this.toast('Selecciona un hueso o control para poner clave');
      this.engine.keyCurrent(ids, f);
    } else if (s.kind === 'bone' || s.kind === 'root') {
      const eng = this.engine;
      const bones = s.kind === 'root' ? [this.rig.bone('hips')] : this.selectedBones();
      // Lo que vale la capa se mide sin IK (antes se guardaba la pose ya resuelta y el IK resolvía encima).
      eng.evaluate(f, { ik: false });
      const fk = bones.map((b) => [b, b.quaternion.clone(), s.kind === 'root' || this.rig.canonOf.get(b) === 'hips' ? b.position.clone() : null]);
      eng.evaluate(f);
      const inIK = bones.filter((b) => eng.chainOfBone(b)).map((b) => ({ bone: b, q: b.quaternion.clone() }));
      for (const [b, q, p] of fk) if (!eng.chainOfBone(b)) eng.keyBone(b, q, p, f);
      if (inIK.length) eng.keyPoseSmart(f, inIK);
    } else {
      const st = this.engine.ikState[s.chain];
      if (st) this.engine.keyIK(s.chain, s.kind === 'pole' ? { pole: st.pole.clone() } : { pos: st.target.clone(), quat: st.targetQ.clone() }, f);
    }
    this.changed();
    this.toast(`Clave en el fotograma ${f}`);
  }

  /** Clave de toda la pose: cada hueso del cuerpo queda fijado en este fotograma tal como se ve (sin IK encima). */
  keyPose() {
    const f = Math.round(this.engine.frame);
    if (this.engine.layer().lock) return this.toast('La capa está bloqueada', true);
    this.pushUndo();
    this.engine.evaluate(f, { ik: false });
    const snap = Object.values(this.rig.mapping).map((n) => this.rig.byName.get(n)).filter(Boolean).map((b) => [b, b.quaternion.clone(), this.rig.canonOf.get(b) === 'hips' ? b.position.clone() : null]);
    for (const [b, q, p] of snap) this.engine.keyBone(b, q, p, f);
    this.changed();
    this.toast(`Pose completa con clave en el fotograma ${f}`);
  }

  deleteKeyHere() {
    this.pushUndo();
    const n = this.engine.deleteKeys(this.engine.frame, this.selection ? this.trackFilter() : null);
    this.changed();
    this.toast(n ? `${n} clave(s) borradas` : 'No hay claves aquí');
  }

  jumpKey(dir) {
    const frames = this.engine.keyFrames(null, this.onlySelected ? this.trackFilter() : null);
    const f = this.engine.frame;
    const t = dir > 0 ? frames.find((x) => x > f + 0.01) : [...frames].reverse().find((x) => x < f - 0.01);
    if (t !== undefined) this.setFrame(t);
  }

  // ---------- Poses ----------
  /** Pone una pose canónica como claves (solo huesos seleccionados si only). */
  applyPose(pose, { bones = null, weight = 1 } = {}) {
    const f = Math.round(this.engine.frame);
    const rig = this.rig;
    this.pushUndo();
    this.engine.evaluate(f);
    const before = rig.bones.map((b) => b.quaternion.clone());
    const cur = rig.captureCanonical();
    const target = copyPose(cur);
    for (const c in pose.q) target.q[c] = cur.q[c] ? cur.q[c].clone().slerp(pose.q[c], weight) : pose.q[c].clone();
    if (pose.hips && !bones) target.hips.lerp(pose.hips, weight);
    rig.applyCanonical(target);
    const locals = new Map(rig.bones.map((b) => [b, b.quaternion.clone()]));
    const hipsP = rig.bone('hips')?.position.clone();
    rig.bones.forEach((b, i) => b.quaternion.copy(before[i]));
    for (const [c, name] of Object.entries(rig.mapping)) {
      if (!pose.q[c]) continue;
      const b = rig.byName.get(name);
      if (bones && !bones.has(b)) continue;
      this.engine.keyBone(b, locals.get(b), c === 'hips' && !bones && pose.hips ? hipsP : null, f);
    }
    this.changed();
  }

  applyHandPose(hp, side = 'both', weight = 1, mirror = false) {
    const cur = (this.engine.evaluate(this.engine.frame), this.rig.captureCanonical());
    const pose = { q: {}, hips: null };
    const sides = side === 'both' ? ['L', 'R'] : [side];
    for (const s of sides) {
      const src = mirror ? (s === 'L' ? 'R' : 'L') : s;
      const hand = cur.q[`hand${s}`];
      if (!hand) continue;
      for (const [id, q] of Object.entries(hp.q)) {
        if (!id.endsWith(src)) continue;
        const dst = id.slice(0, -1) + s;
        const local = mirror ? new THREE.Quaternion(q.x, -q.y, -q.z, q.w) : q.clone ? q.clone() : new THREE.Quaternion().fromArray(q);
        pose.q[dst] = hand.clone().multiply(local);
      }
    }
    const sel = this.selection && this.selection.kind === 'bone' && this.poseOnlySelected ? new Set([this.selection.bone]) : null;
    this.applyPose(pose, { bones: sel, weight });
  }

  /**
   * Dedos por deslizadores (como los controles de dedo del Control Rig): cerrar cada dedo (0–90°),
   * pulgar y abrir (spread, −10…20°). Guarda clave en el fotograma actual. side = 'L' | 'R' | 'both'.
   */
  setFingers(side = 'both', vals = {}) {
    this.fingerState ||= {};
    const sides = side === 'both' ? ['L', 'R'] : [side];
    for (const s of sides) {
      const st = (this.fingerState[s] ||= { thumb: 0, index: 0, middle: 0, ring: 0, little: 0, spread: 0 });
      if (vals.all !== undefined) {
        for (const f of ['index', 'middle', 'ring', 'little']) st[f] = +vals.all;
        st.thumb = Math.round(+vals.all * 0.65); // el pulgar cierra menos (como en las poses de mano)
      }
      for (const k of Object.keys(st)) if (vals[k] !== undefined) st[k] = +vals[k];
      const hp = handPoseFrom('dedos', 'Dedos', { index: st.index, middle: st.middle, ring: st.ring, little: st.little }, st.thumb, st.spread);
      const only = this.poseOnlySelected;
      this.poseOnlySelected = false;
      try {
        this.applyHandPose(hp, s, 1);
      } finally {
        this.poseOnlySelected = only;
      }
    }
    return Object.fromEntries(sides.map((s) => [s, { ...this.fingerState[s] }]));
  }

  async saveBodyPose() {
    const name = prompt('Nombre de la pose', `Pose ${this.bodyPoses.length + 1}`);
    if (!name) return;
    this.engine.evaluate(this.engine.frame);
    const p = this.rig.captureCanonical();
    const rec = { id: uid('pose'), kind: 'body', name, q: Object.fromEntries(Object.entries(p.q).map(([k, v]) => [k, v.toArray()])), hips: p.hips.toArray() };
    await db.put('poses', rec);
    this.bodyPoses.push(rec);
    this.panels.refreshPoses();
  }

  async saveHandPose(side = 'R') {
    const name = prompt('Nombre de la pose de mano', `Mano ${this.savedHands.length + 1}`);
    if (!name) return;
    this.engine.evaluate(this.engine.frame);
    const p = this.rig.captureCanonical();
    const hand = p.q[`hand${side}`];
    if (!hand) return;
    const inv = hand.clone().invert();
    const q = {};
    for (const [id, v] of Object.entries(p.q)) {
      if (!/^(thumb|index|middle|ring|little)\d[LR]$/.test(id) || !id.endsWith(side)) continue;
      const local = inv.clone().multiply(v);
      q[id] = local.toArray();
      // también la otra mano, reflejada
      const o = id.slice(0, -1) + (side === 'L' ? 'R' : 'L');
      q[o] = [local.x, -local.y, -local.z, local.w];
    }
    const rec = { id: uid('mano'), kind: 'hand', name, q };
    await db.put('poses', rec);
    this.savedHands.push(rec);
    this.panels.refreshPoses();
  }

  // ---------- Importar ----------
  async importFiles(files, mode = null) {
    for (const file of files) {
      const ext = extOf(file.name);
      try {
        if (ext === 'json') {
          const j = JSON.parse(await file.text());
          if (j.formato?.startsWith('taller-animacion/clip')) {
            const c = clipFromJSON({ ...j, id: j.id?.startsWith('mio:') ? j.id : `mio:${slug(j.name)}:${Date.now().toString(36)}` });
            await this.saveMine(c);
            this.toast(`Clip añadido a Tuyas: ${c.name}`);
          } else if (j.formato?.startsWith('taller-animacion/proyecto')) {
            await this.openProject(j);
          } else this.toast('JSON no reconocido', true);
          continue;
        }
        const buf = await file.arrayBuffer();
        const model = await loadModel(buf, file.name);
        const skinned = hasSkin(model.root);
        let as = mode;
        if (!as) as = skinned ? await this.askImport(file.name, model.animations.length) : 'anim';
        if (as === 'cancel') continue;
        let wearId = null;
        if (as === 'char' || as === 'both') {
          // primero en disco (biblioteca/personajes); si no hay servidor, en el navegador
          const r = await fetch(`/api/subir?carpeta=personajes&nombre=${encodeURIComponent(file.name)}`, { method: 'POST', body: buf }).catch(() => null);
          if (r && r.ok) {
            await this.scanLibrary();
            const ch = this.characters.find((c) => c.kind === 'url' && decodeURIComponent(c.url).endsWith(`/personajes/${file.name}`));
            wearId = ch?.id || null;
          }
          if (!wearId) {
            const id = `idb:${slug(file.name)}:${Date.now().toString(36)}`;
            await db.put('characters', { id, name: prettyName(file.name.replace(/\.[^.]+$/, '')), file: file.name, data: buf });
            this.characters.push({ id, name: prettyName(file.name.replace(/\.[^.]+$/, '')), kind: 'idb' });
            wearId = id;
          }
        }
        if (as === 'anim' || as === 'both') {
          // animaciones: convertir con una copia limpia del modelo
          const m2 = as === 'both' ? await loadModel(buf, file.name) : model;
          normalizeCharacter(m2.root);
          // Mixamo: el archivo va a biblioteca/mixamo y aparece en la librería «Mixamo»
          if (new Rig(m2.root).convention === 'mixamo' && m2.animations.some((x) => x.tracks.length)) {
            const r = await fetch(`/api/subir?carpeta=mixamo&nombre=${encodeURIComponent(file.name)}`, { method: 'POST', body: buf }).catch(() => null);
            if (r && r.ok) {
              await this.scanLibrary();
              this.panels.selectPack?.('Mixamo');
              this.toast(`«${file.name}» añadida a la librería Mixamo`);
              continue;
            }
          }
          let n = 0;
          for (const anim of m2.animations) {
            if (!anim.tracks.length) continue;
            const base = m2.animations.length === 1 ? file.name.replace(/\.[^.]+$/, '') : anim.name;
            const name = prettyName(base.replace(/mixamo\.com/i, file.name.replace(/\.[^.]+$/, '')));
            const c = clipFromAnimation(m2.root, anim, { id: `mio:${slug(name)}:${Date.now().toString(36)}${n}`, name, tags: tagsFor(name, ['tuyas']), source: 'importado', author: 'Tú' });
            await this.saveMine(c);
            n++;
          }
          if (!n && as === 'anim') this.toast(`«${file.name}» no trae animaciones`, true);
          else if (n) this.toast(`${n} animación(es) añadidas a Tuyas`);
        }
        if (wearId) await this.wearCharacter(wearId);
        this.panels.refreshCharacters();
        this.panels.refreshLibrary();
      } catch (e) {
        console.error(e);
        this.toast(`Error con ${file.name}: ${e.message}`, true);
      }
    }
  }

  askImport(name, nAnims) {
    return new Promise((res) => {
      this.modal(
        h('div', {},
          h('h2', {}, `Importar «${name}»`),
          h('p', { class: 'muted' }, `Trae malla con esqueleto${nAnims ? ` y ${nAnims} animación(es)` : ''}. ¿Qué quieres hacer?`),
          h('div', { class: 'row' },
            h('button', { class: 'btn acc', onclick: () => (this.closeModal(), res('char')) }, 'Ponérmelo (personaje)'),
            nAnims ? h('button', { class: 'btn', onclick: () => (this.closeModal(), res('anim')) }, 'Solo sus animaciones') : null,
            nAnims ? h('button', { class: 'btn', onclick: () => (this.closeModal(), res('both')) }, 'Las dos cosas') : null,
            h('button', { class: 'btn', onclick: () => (this.closeModal(), res('cancel')) }, 'Cancelar'),
          ),
          h('p', { class: 'small muted' }, 'Se lee y se guarda en este navegador. No se sube nada.'),
        ),
      );
    });
  }

  async saveMine(c) {
    c.mine = true;
    this.library.set(c.id, c);
    await db.put('clips', { ...clipToJSON(c) });
  }

  async deleteMine(id) {
    this.library.delete(id);
    await db.del('clips', id);
    this.panels.refreshLibrary();
  }

  async makeMyCopy() {
    const name = prompt('Nombre de tu copia', `${this.libSel ? this.library.get(this.libSel)?.name : 'Animación'} (mía)`);
    if (!name) return;
    const c = bakeCanonical(this.engine, { id: `mio:${slug(name)}:${Date.now().toString(36)}`, name, tags: ['tuyas'] });
    c.loop = this.engine.doc.strips.length === 1 && this.library.get(this.engine.doc.strips[0].clipId)?.loop;
    await this.saveMine(c);
    this.useClip(c.id);
    this.engine.doc.layers = [newLayer('base', 'Base')];
    this.changed();
    this.toast(`Guardada en Tuyas: ${name}`);
  }

  // ---------- Proyectos ----------
  projectJSON() {
    return { formato: 'taller-animacion/proyecto@1', name: this.projectName, date: Date.now(), charId: this.charMeta.id, doc: this.engine.doc, mapping: this.rig.convention === 'manual' ? this.rig.mapping : null };
  }

  async saveProject(asNew = false) {
    if (!this.projectId || asNew) {
      const n = prompt('Nombre del proyecto', this.projectName);
      if (!n) return;
      this.projectName = n;
      this.projectId = uid('p');
    }
    await db.put('projects', { id: this.projectId, ...this.projectJSON() });
    this.toast(`Proyecto guardado: ${this.projectName}`);
    this.panels.refreshProjects();
  }

  async openProject(p) {
    this.projectName = p.name || 'Proyecto';
    this.projectId = p.id && p.id !== 'auto' ? p.id : null;
    if (p.charId && p.charId !== this.charMeta.id && this.characters.find((c) => c.id === p.charId)) await this.wearCharacter(p.charId, true);
    this.loadDoc(p.doc);
    this.toast(`Abierto: ${this.projectName}`);
  }

  newProject() {
    this.projectName = 'Sin título';
    this.projectId = null;
    this.loadDoc(newDocument());
  }

  async copyLink() {
    const url = `${location.origin}${location.pathname}#${docToHash(this.engine.doc, this.rig)}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast('Enlace copiado (lleva tiras, capas y claves; los archivos no viajan)');
    } catch {
      prompt('Copia el enlace:', url);
    }
  }

  // ---------- Descargas ----------
  async downloadCurrent(withMesh = true) {
    const name = slug(this.libSel ? this.library.get(this.libSel)?.name || 'animacion' : this.projectName) || 'animacion';
    const clip = bakeAnimationClip(this.engine, name);
    const glb = await exportGLB(this.engine, [clip], { withMesh });
    download(glb, `${name}${withMesh ? '' : '_esqueleto'}.glb`, 'model/gltf-binary');
  }

  async downloadRest() {
    const glb = await exportGLB(this.engine, [], { withMesh: true });
    download(glb, `${slug(this.charMeta.name)}_reposo.glb`, 'model/gltf-binary');
  }

  async downloadSet(withMesh = false) {
    const set = this.sets.find((s) => s.id === this.activeSet) || this.sets[0];
    const ids = set.clips.filter((x) => this.library.has(x.id));
    if (!ids.length) return this.toast('El conjunto está vacío: marca animaciones en la biblioteca', true);
    await this.ensureClips(ids.map((x) => x.id));
    const saved = JSON.stringify(this.engine.doc);
    const clips = [];
    for (const { id, name } of ids) {
      const c = this.library.get(id);
      const d = newDocument();
      d.strips = [{ id: 's', clipId: id, start: 0, len: c.frames, blend: 0, speed: 1, loop: false, inPlace: !!set.inPlace, mirror: false, reverse: false }];
      this.engine.doc = d;
      clips.push(bakeAnimationClip(this.engine, name || slug(c.name), [0, c.frames - 1]));
    }
    this.engine.doc = JSON.parse(saved);
    const glb = await exportGLB(this.engine, clips, { withMesh });
    download(glb, `${set.name || 'conjunto'}.glb`, 'model/gltf-binary');
    this.toast(`${clips.length} animaciones en ${set.name}.glb`);
  }

  downloadClipJSON() {
    const name = prompt('Nombre del clip', this.libSel ? this.library.get(this.libSel)?.name : 'Clip');
    if (!name) return;
    const c = bakeCanonical(this.engine, { id: `mio:${slug(name)}`, name });
    download(clipFile(c), `${slug(name)}.clip.json`, 'application/json');
  }

  downloadProject() {
    download(JSON.stringify(this.projectJSON()), `${slug(this.projectName) || 'proyecto'}.taller.json`, 'application/json');
  }

  /** Clips horneados: 'actual' (lo que se ve), 'conjunto' (marcados) o 'ambos'. */
  /** Antes de hornear: pistas de los clips del documento y, si se pide, del conjunto marcado. */
  async prepareBake(which = 'actual') {
    const set = this.sets.find((s) => s.id === this.activeSet) || this.sets[0];
    await this.ensureClips([...this.docClipIds(), ...(which === 'conjunto' || which === 'ambos' ? set.clips.map((x) => x.id) : [])]);
  }

  bakeClips(which = 'actual') {
    const out = [];
    if (which === 'actual' || which === 'ambos') {
      const name = slug(this.libSel ? this.library.get(this.libSel)?.name || 'animacion' : this.projectName) || 'animacion';
      out.push(bakeAnimationClip(this.engine, name));
    }
    if (which === 'conjunto' || which === 'ambos') {
      const set = this.sets.find((s) => s.id === this.activeSet) || this.sets[0];
      const saved = JSON.stringify(this.engine.doc);
      for (const { id, name } of set.clips.filter((x) => this.library.has(x.id))) {
        const c = this.library.get(id);
        const d = newDocument();
        d.strips = [{ id: 's', clipId: id, start: 0, len: c.frames, blend: 0, speed: 1, loop: false, inPlace: !!set.inPlace, mirror: false, reverse: false }];
        this.engine.doc = d;
        out.push(bakeAnimationClip(this.engine, name || slug(c.name), [0, c.frames - 1]));
      }
      this.engine.doc = JSON.parse(saved);
      this.engine.evaluate(this.engine.frame);
    }
    return out;
  }

  /** Paquete three.js: GLB + taller-three.js + reproductor.html + LEEME.md. destino: 'zip' | 'disco'. */
  async exportThree({ which = 'ambos', destino = 'zip', nombre = null, withMesh = true } = {}) {
    const { threeModule, playerHTML, readme, makeZip } = await import('./io/threepack.js');
    await this.prepareBake(which);
    const clips = this.bakeClips(which);
    if (!clips.length) throw new Error('No hay animaciones que exportar');
    const base = slug(nombre || this.charMeta.name) || 'personaje';
    const glbName = `${base}.glb`;
    const glb = await exportGLB(this.engine, clips, { withMesh });
    const names = clips.map((c) => c.name);
    const files = [
      { name: glbName, data: new Uint8Array(glb) },
      { name: 'taller-three.js', data: threeModule() },
      { name: 'reproductor.html', data: playerHTML(glbName, names) },
      { name: 'LEEME.md', data: readme(glbName, names, this.charMeta.name) },
    ];
    if (destino === 'disco') {
      const rutas = [];
      for (const f of files) rutas.push(await this.saveToDisk(f.data, f.name, base));
      this.toast(`Paquete three.js en exportaciones/${base}`);
      return { carpeta: rutas[0].replace(/[\\/][^\\/]+$/, ''), archivos: rutas, animaciones: names };
    }
    download(makeZip(files), `${base}_three.zip`, 'application/zip');
    return { zip: `${base}_three.zip`, animaciones: names };
  }

  async exportFBX({ which = 'actual', destino = 'descarga', nombre = null } = {}) {
    await this.prepareBake(which);
    const clips = this.bakeClips(which);
    const glb = await exportGLB(this.engine, clips, { withMesh: true });
    this.toast('Blender está convirtiendo a FBX…');
    const r = await fetch('/api/fbx', { method: 'POST', body: glb });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'falló la conversión');
    const data = new Uint8Array(await r.arrayBuffer());
    const fn = `${slug(nombre || this.charMeta.name) || 'personaje'}.fbx`;
    if (destino === 'disco') return { ruta: await this.saveToDisk(data, fn) };
    download(data, fn);
    return { descargado: fn };
  }

  async saveToDisk(data, nombre, carpeta = '', tipo = 'export') {
    const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const r = await fetch(`/api/guardar?tipo=${tipo}&carpeta=${encodeURIComponent(carpeta)}&nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body });
    if (!r.ok) throw new Error('No se pudo guardar en disco');
    return (await r.json()).ruta;
  }

  // ---------- Miniaturas ----------
  requestThumb(clipId, canvas) {
    const c = this.library.get(clipId);
    const charId = this.charMeta.id;
    const key = `${charId}|${clipId}|${c?.fileKey || ''}`;
    const draw = (img) => {
      const g = canvas.getContext('2d');
      if (img instanceof ImageData) g.putImageData(img, 0, 0);
      else g.drawImage(img, 0, 0);
    };
    const img = this.thumbs.get(key);
    if (img) return draw(img);
    // Se guardan las de la biblioteca y las tuyas (su id no cambia); las generadas por código se rehacen.
    const persist = !!(c?.fileKey || c?.mine);
    (async () => {
      if (persist) {
        try {
          const rec = await db.get('miniaturas', key);
          if (rec?.blob) {
            const bmp = await createImageBitmap(rec.blob);
            if (this.charMeta.id !== charId) return;
            this.thumbs.set(key, bmp);
            if (canvas.isConnected) draw(bmp);
            return;
          }
        } catch { /* se vuelve a dibujar */ }
      }
      const ready = await this.ensureClip(clipId);
      if (!ready?.tracks || !canvas.isConnected || this.charMeta.id !== charId) return;
      // El panel se rehace mientras se lee la biblioteca: no acumular miniaturas de tarjetas ya retiradas.
      if (this.thumbQueue.length > 400) this.thumbQueue = this.thumbQueue.filter((j) => j.canvas.isConnected);
      this.thumbQueue.push({ key, clipId, canvas, persist, charId });
    })();
  }

  pumpThumbs() {
    if (!this.thumbQueue.length || this.playing || this.dragging || this.sceneLive?.busy()) return;
    const t0 = performance.now();
    // Las miniaturas posan el rig real: se guarda la pose actual y se devuelve en este mismo fotograma,
    // para que ni el visor ni el actor del Estudio («En escena») vean la pose de la miniatura.
    const saved = [];
    this.rig?.root.traverse((o) => { if (o.isBone || o === this.rig.root) saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    let rendered = false;
    while (this.thumbQueue.length && performance.now() - t0 < 12) {
      const job = this.thumbQueue.shift();
      if (!job.canvas.isConnected || job.charId !== this.charMeta.id) continue;
      const img = this.renderThumb(job.clipId);
      rendered = true;
      if (img) {
        this.thumbs.set(job.key, img);
        job.canvas.getContext('2d').putImageData(img, 0, 0);
        if (job.persist) this.saveThumb(job.key, img);
      }
    }
    if (rendered) {
      for (const [o, p, q, sc] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); }
      this.rig.root.updateMatrixWorld(true);
    }
  }

  /** Miniatura comprimida (WebP, unos pocos KB) en la base local: la próxima vez sale sin dibujarla. */
  async saveThumb(key, img) {
    try {
      const oc = new OffscreenCanvas(img.width, img.height);
      oc.getContext('2d').putImageData(img, 0, 0);
      const blob = await oc.convertToBlob({ type: 'image/webp', quality: 0.85 });
      await db.put('miniaturas', { id: key, blob });
    } catch { /* sin miniatura guardada */ }
  }

  renderThumb(clipId) {
    const c = this.library.get(clipId);
    if (!c?.tracks || !this.rig) return null;
    const S = 96;
    if (!this._thumbRT) {
      this._thumbRT = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
      this._thumbCam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
      this._thumbBuf = new Uint8Array(S * S * 4);
    }
    const pose = sampleClip(c, c.duration * 0.42, newPose(), { loop: c.loop, inPlace: { x: true, z: true } });
    this.rig.applyCanonical(pose);
    this.rig.root.updateMatrixWorld(true);
    const H = this.rig.hipsHeight;
    const hp = this.rig.restWorldPos.hips || new THREE.Vector3(0, H, 0);
    const cam = this._thumbCam;
    const fwd = this.rig.frame.fwd.clone();
    const left = this.rig.frame.left.clone();
    cam.position.copy(hp).addScaledVector(fwd, H * 3.6).addScaledVector(left, H * 1.6).addScaledVector(this.rig.frame.up, H * 0.15);
    cam.lookAt(hp.clone().addScaledVector(this.rig.frame.up, -H * 0.05));
    const vp = this.viewport;
    const vis = [vp.handles.visible, vp.grid.visible, vp.gizmo.getHelper().visible, vp.ghosts.visible];
    vp.handles.visible = vp.grid.visible = vp.ghosts.visible = false;
    vp.gizmo.getHelper().visible = false;
    if (vp.skelHelper) vp.skelHelper.visible = false;
    const bg = vp.scene.background;
    vp.scene.background = new THREE.Color(0x2a2e36);
    const r = vp.renderer;
    r.setRenderTarget(this._thumbRT);
    r.render(vp.scene, cam);
    r.readRenderTargetPixels(this._thumbRT, 0, 0, S, S, this._thumbBuf);
    r.setRenderTarget(null);
    vp.scene.background = bg;
    [vp.handles.visible, vp.grid.visible, vp.gizmo.getHelper().visible, vp.ghosts.visible] = vis;
    if (vp.skelHelper) vp.skelHelper.visible = true;
    const img = new ImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(this._thumbBuf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    return img;
  }

  // ---------- UI general ----------
  toast(msg, err = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', err);
    t.classList.add('show');
    clearTimeout(this._toast);
    this._toast = setTimeout(() => t.classList.remove('show'), err ? 4200 : 2400);
  }

  modal(content) {
    const box = $('#modalBox');
    box.innerHTML = '';
    box.append(content);
    $('#modal').classList.remove('hidden');
  }
  closeModal() {
    $('#modal').classList.add('hidden');
  }

  toggleQuad() {
    this.viewport.quad = !this.viewport.quad;
    this.panels.refreshTools();
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === 'z' && !e.shiftKey) return e.preventDefault(), this.undo();
      if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) return e.preventDefault(), this.redo();
      if (ctrl && k === 's') return e.preventDefault(), this.saveProject(e.shiftKey);
      if (ctrl && k === 'o') return e.preventDefault(), pickFiles('.json').then((f) => this.importFiles(f));
      if (ctrl && k === 'c') return e.preventDefault(), this.timeline.selKeys.size ? ((this._lastCopy = 'keys'), this.timeline.copySelected()) : ((this._lastCopy = 'pose'), this.copyTransforms());
      if (ctrl && k === 'v') return e.preventDefault(), this.timeline.keyClip && this._lastCopy === 'keys' ? this.timeline.pasteKeys() : this.pasteTransforms({ mode: e.shiftKey ? 'mirror' : 'local' });
      if (ctrl && e.altKey && k === 'q') return e.preventDefault(), this.toggleQuad();
      if (k === 'b') return this.viewport.startBoxSelect();
      // Herramientas: M = marcador del retimer en el fotograma actual; Mayús+P = mostrar/ocultar la trayectoria
      if (k === 'm' && !ctrl && !e.altKey) {
        this.pushUndo();
        const mk = addMarker(this.engine.doc, Math.round(this.engine.frame));
        this.changed();
        this.toolsUI?.render();
        return this.toast(mk ? `Marcador ${mk.name} en f${mk.f}: arrástralo en la regla para estirar o encoger el tiempo` : 'Ya hay un marcador aquí');
      }
      if (k === 'p' && e.shiftKey && !ctrl) return this.pathView?.toggle();
      if (k === 'delete' && this.timeline.selKeys.size) return this.timeline.deleteSelected();
      if (k === ' ') {
        e.preventDefault();
        return this.togglePlay(e.shiftKey && ctrl ? -1 : 1);
      }
      if (k === 'w' || k === 'g') return this.setTool('move');
      if (k === 'a' || k === 't') return this.setTool('ik');
      if (k === 'e' || k === 'r') return this.setTool('rotate');
      if (k === 's') return this.setTool('scale');
      if (k === 'k' || k === 'i') return this.keySelected();
      if (k === 'delete' || k === 'x') return this.deleteKeyHere();
      if (k === 'arrowright') return this.setFrame(Math.round(this.engine.frame) + 1);
      if (k === 'arrowleft') return this.setFrame(Math.round(this.engine.frame) - 1);
      if (k === 'arrowup') return e.preventDefault(), this.jumpKey(-1);
      if (k === 'arrowdown') return e.preventDefault(), this.jumpKey(1);
      if (k === '+' || k === '=' || k === 'add') return this.viewport.setGizmoScale(this.viewport.gizmoScale + 0.15), this.panels.refreshTools?.();
      if (k === '-' || k === '_' || k === 'subtract') return this.viewport.setGizmoScale(this.viewport.gizmoScale - 0.15), this.panels.refreshTools?.();
      if (k === 'home' || k === 'f') return this.viewport.reframe();
      if (k === 'escape') return this.select(null);
    });
  }

  bindDrop() {
    const dz = $('#dropzone');
    let n = 0;
    window.addEventListener('dragenter', (e) => {
      if (e.dataTransfer.types.includes('Files')) {
        n++;
        dz.classList.add('show');
      }
    });
    window.addEventListener('dragleave', () => {
      if (--n <= 0) dz.classList.remove('show');
    });
    window.addEventListener('dragover', (e) => e.dataTransfer.types.includes('Files') && e.preventDefault());
    window.addEventListener('drop', (e) => {
      n = 0;
      dz.classList.remove('show');
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      this.importFiles([...e.dataTransfer.files]);
    });
  }
}

const app = new App();
window.taller = app; // para depurar desde la consola
app.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;bottom:0;left:0;color:#f88;background:#000;padding:8px;z-index:999">${e.stack}</pre>`);
});
