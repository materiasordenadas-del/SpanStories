// Biblioteca › Animales: animales con su propio esqueleto (no humanoide), con sus animaciones nativas.
// Hoy: Caballo (Horse Animset Pro). Los clips se reproducen sobre el modelo del animal con un AnimationMixer;
// no pasan por el espacio canónico humanoide (que solo entiende personas).
// Datos: biblioteca/animales/<especie>/{clips,modelo}/ (los sirve herramientas/plugin.mjs en /api/animales y /animales/).
import * as THREE from 'three';
// Copia corregida: conserva las bisagras con curva solo en Z (carpo, rodilla, corvejón).
import { FBXLoader } from '../io/FBXLoaderEjes.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel, loadModelURL } from '../io/loaders.js';
import { db, prefs, setPrefs } from '../io/storage.js';
import { Engine, newDocument, uid } from '../core/animation.js';
import { Rig } from '../core/rig.js';
import { isARPHorse } from '../core/quadruped.js';
import { HorseMotion } from '../core/horse-motion.js';
import { skinHorseTack } from '../core/horse-tack.js';
import { RiderPhysics, medirSilla, medirCuerpo } from '../core/rider-physics.js';
import { FisicaCaballo, Cuerda } from '../core/horse-secondary.js';
import { Desmonte } from '../core/rider-dismount.js';
import { clipFromAnimation, makeClip, newPose, sampleClip, copyPose, clipToJSON } from '../core/clip.js';
import { bakeCanonical } from '../io/exporter.js';
import { mountedTracks, selectMountedEditor } from '../core/mounted-animation.js';
import { h, $, prettyName, slug } from './dom.js';

// ---------- Nombres y categorías ----------
const PALABRAS = {
  mount: 'montar', dismount: 'desmontar', above: 'desde arriba', amble: 'ambladura', attack: 'ataque', back: 'atrás', death: 'muerte', drink: 'beber', eat: 'comer', enterwater: 'entrar al agua',
  fall: 'caída', fromedge: 'desde el borde', high: 'alta', low: 'baja', land: 'aterrizar', fly: 'vuelo', flap: 'aleteo', glide: 'planeo',
  closed: 'alas cerradas', stand: 'parado', gethit: 'golpe recibido', hit: 'golpe', idle: 'reposo', headshake: 'sacudir la cabeza', look: 'mirar',
  step: 'paso', hop: 'brinco', incline: 'cuesta', decline: 'bajada', jump: 'salto', neigh: 'relincho', recover: 'recuperarse', sleep: 'dormir',
  swim: 'nadar', turn: 'giro', strafe: 'lateral', walk: 'paso', trot: 'trote', pace: 'trote lateral', up: 'subir', down: 'bajar', start: 'arranque',
  end: 'parada', opp: 'lado contrario', ip: 'en el sitio', forward: 'adelante', left: 'izquierda', right: 'derecha', front: 'delante',
  legs: 'patas', leg: 'pata', canter: 'medio galope', gallop: 'galope', sprint: 'carrera', forwardleft: 'adelante izq.', forwardright: 'adelante der.',
  '135': '135°', '180': '180°', '90': '90°',
};

/** «H_Get Hit_Back_Left» → «Golpe recibido · atrás · izquierda». */
export function nombreClip(archivo) {
  let t = archivo.replace(/\.[^.]+$/, '').replace(/^H_/i, '').replace(/^Horse_/i, '');
  t = t.replace(/Get Hit/gi, 'GetHit').replace(/Enter ?Water/gi, 'EnterWater').replace(/From_Edge/gi, 'FromEdge').replace(/HeadShake/gi, 'HeadShake');
  const partes = t.split(/[_\s]+/).filter(Boolean).map((p) => PALABRAS[p.toLowerCase()] || p);
  const s = partes.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// [categoría, subcategoría, expresión sobre el nombre del archivo]; gana la primera que coincide.
const REGLAS = [
  ['Natación', 'Nadar', /swim/i],
  ['Vuelo', 'Volar', /fly/i],
  ['Saltos', 'Saltar obstáculos', /jump/i],
  ['Reacciones', 'Muerte', /death/i],
  ['Reacciones', 'Caídas y recuperarse', /fall|recover/i],
  ['Reacciones', 'Golpes recibidos', /get ?hit/i],
  ['Reacciones', 'Ataques', /attack/i],
  ['Reposo y gestos', 'Comer y beber', /eat|drink/i],
  ['Reposo y gestos', 'Dormir', /sleep/i],
  ['Reposo y gestos', 'Relinchar', /^h_neigh/i],
  ['Reposo y gestos', 'Reposo', /idle/i],
  ['Giros', 'Girar sobre el sitio y en marcha', /turn|_135|_180/i],
  ['Marcha', 'Laterales', /strafe/i],
  ['Marcha', 'Paso', /walk|amble/i],
  ['Marcha', 'Trote', /trot/i],
  ['Marcha', 'Medio galope', /canter/i],
  ['Marcha', 'Galope y carrera', /gallop|sprint/i],
];
export const ORDEN = ['Favoritos', 'Marcha', 'Giros', 'Saltos', 'Reposo y gestos', 'Reacciones', 'Natación', 'Vuelo', 'Montar y desmontar', 'Otras'];

export function categoriaClip(archivo) {
  for (const [cat, sub, re] of REGLAS) if (re.test(archivo)) return { cat, sub };
  return { cat: 'Otras', sub: 'Sin clasificar' };
}

// ---------- Módulo ----------
export function mountAnimales(app) {
  const box = $('#spAnimales');
  if (!box) return null;
  const A = { especies: [], especie: null, sel: null, cat: null, busqueda: '', abiertas: new Set(['Marcha']), visible: false, fav: null, modelo: prefs('animalHorseModel',null) || (isARPHorse(app.rig.root) ? 'seleccionado' : 'predeterminado'), circulo: false };
  const fbx = new FBXLoader();
  const textureLoader = new THREE.TextureLoader();
  const holder = new THREE.Group();
  holder.name = 'animales';
  holder.visible = false;
  app.viewport.scene.add(holder);

  let actor = null; // { root, mixer, rootBone, base, especie }
  let action = null;
  let clipActual = null;
  const cache = new Map(); // url → AnimationClip original
  const clipRoots = new WeakMap();
  let referencia = null;
  let caballosEstudio = [];
  let catalogo = []; // personajes del Estudio, con su altura real (alturaM) cuando se conoce
  let selectedHorse=null;
  let camPath=new THREE.Vector3();
  let pair = null;
  let preparingPair = false;
  let preparingAnchor = null;
  const spare = new THREE.Group();
  app.viewport.scene.add(spare);
  const riderRig = () => pair?.rider.rig ?? app.rig;
  const riderEngine = () => pair?.rider.engine ?? app.engine;
  const riderHolder = () => pair?.rider.root ?? app.viewport.charHolder;
  const castOf = (context) => context ? [{ id:context.actorId, name:context.characterName, ...context }, ...(context.others || [])] : [];
  const studioCast = () => app.mode === 'escena' ? castOf(app.studioLink?.context()) : [];
  // Cualquier caballo de la escena (Rocinante u otro del catálogo) y como jinete cualquier otro actor que no sea caballo
  // (Don Quijote, un maniquí…). Con varios, manda el actor desde el que se abrió el Taller.
  const esCaballo = (a) => !!a && (caballosEstudio.some(c => c.id === a.characterId) || /rocinante|caballo|horse/i.test(`${a.characterId} ${a.name || ''}`));
  // La historia guarda quién monta a quién (Actor.montura, features/story-studio/mount.ts): ese vínculo manda.
  // Solo una historia sin ningún vínculo cae en la deducción por el nombre, para las escenas anteriores a él.
  const pairIn = (cast) => {
    const own = cast[0];
    if (cast.some(a => a?.montura?.caballoId)) {
      const byId = id => cast.find(a => a?.id === id);
      const rider = own?.montura ? own : cast.find(a => a?.montura?.caballoId === own?.id) || cast.find(a => a?.montura?.caballoId && byId(a.montura.caballoId));
      return { horse: rider ? byId(rider.montura.caballoId) : undefined, rider };
    }
    return { horse: esCaballo(own) ? own : cast.find(esCaballo), rider: esCaballo(own) ? cast.find(a => !esCaballo(a)) : own };
  };
  const horseIn = (cast) => pairIn(cast).horse;
  const riderIn = (cast) => pairIn(cast).rider;
  const studioHorse = () => horseIn(studioCast());
  const studioRider = () => riderIn(studioCast());
  let sitio = true; // sin avance de la raíz (se queda en el sitio)
  let bucle = true;
  let velocidad = 1;
  let pausa = true; // hasta elegir una animación no hay nada que pausar: el botón muestra ▶
  let estado = 'sin datos';
  let editor = false;
  let editing = null;
  let conJinete = app.rig.humanoid;
  let enlace = null; // { id }: clip del jinete que sigue al reloj del clip del caballo
  let soloJinete = null; // id del clip del jinete que lleva el motor del Taller (montar y desmontar): el caballo espera en reposo
  const PACK_JINETE = 'Jinete (a caballo)';
  const RIDER_FOLDER = 'Jinete (Horse Animset Pro)';
  const ui = {};

  // ---------- Revelado del jinete y sesión ----------
  // «pendiente»: el personaje del jinete permanece oculto hasta que está colocado sobre el caballo (sentar/bajar y los clips
  // solo del jinete llaman a revelar()). Así tras recargar o cambiar de clip nunca se ve el maniquí ni al jinete dentro del caballo.
  let pendiente = !!prefs('animalSesion', null)?.activo;
  let temporizador = 0, trabajando = 0, restaurando = false;
  function revelar() {
    pendiente = false;
    clearTimeout(temporizador);
    app.viewport.charHolder.visible = !!pair || editor || !A.visible || !!app.sceneLive?.on || (conJinete && !!app.rig.humanoid && sentado());
  }
  // El jinete solo se ve si está colocado sobre el caballo: escena, clip solo del jinete o clip del caballo ya calibrado en la silla.
  const sentado = () => !!(escena || soloJinete || enlace?.cal);
  // Los paneles flotantes (Editar movimiento, Rig…) no tapan el visor mientras Animales está abierto; al salir se devuelven.
  let flotantes = [];
  function apartarFlotantes() {
    const T = app.topmenu; if (!T?.openIds) return;
    for (const id of T.openIds()) { if (!flotantes.includes(id)) flotantes.push(id); T.close(id); }
  }
  function devolverFlotantes() {
    const T = app.topmenu; const ids = flotantes; flotantes = [];
    for (const id of ids) T.openMenu?.(id);
  }
  function ocultar() {
    pendiente = true;
    app.viewport.charHolder.visible = false;
    clearTimeout(temporizador);
    // Seguro: si nada lo coloca, a los 4 s se muestra (mientras haya una carga en curso se espera a que termine).
    temporizador = setTimeout(function vigilar() { if (trabajando > 0) { temporizador = setTimeout(vigilar, 4000); return; } revelar(); }, 4000);
  }
  A.revelar = revelar;
  let sesion = prefs('animalSesion', null) || {};
  /** Guarda dónde estaba el usuario (pestaña, caballo, jinete, selección, instante) para recargar tal cual. */
  function guardarSesion(cambios = {}) {
    if (app.studioLink?.context()) return;
    if (restaurando) return;
    sesion = {
      activo: A.visible, especie: A.especie, modelo: A.modelo, jinete: app.rig.humanoid ? app.charMeta.id : (sesion.jinete ?? null),
      conJinete: !!conJinete, sel: A.sel, favorito: A.fav || (A.sel?.startsWith('fav:') ? A.sel.slice(4) : null), tiempo: Math.round(app.engine.frame * 100) / 100, reproduciendo: !!app.playing,
      base: !!escena?.editable, ...cambios,
    };
    setPrefs('animalSesion', sesion);
  }
  const refrescarBarra = () => app.panels?.refreshTransport?.();

  // ---------- Emparejar caballo ↔ jinete ----------
  // «H_Get Hit_Back_Left» ↔ «Rider Get Hit Back Left»: mismas palabras sin prefijo, sin «IP/Opp», números ni separadores.
  const palabras = (s) => String(s).replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^(rider|h)[\s_]+/, '').split(/[^a-z0-9]+/).filter(Boolean);
  const claveExacta = (s) => palabras(s).filter((t) => t !== 'ip').join(''); // «Death02_Opp» ↔ «Death02 Opp»
  const palabrasClave = (s) => palabras(s).filter((t) => !/^(ip|opp|\d+)$/.test(t)).map((t) => t.replace(/\d+/g, '').replace(/^amble$/, 'walk')).filter(Boolean);
  const jinetes = () => [...app.library.values()].filter((c) => c.pack === PACK_JINETE);
  function parejaJinete(archivo) {
    const exactas = new Map(), suaves = new Map();
    for (const c of jinetes()) { exactas.set(claveExacta(c.name), c); const k = palabrasClave(c.name).join(''); if (!suaves.has(k)) suaves.set(k, c); }
    if (exactas.has(claveExacta(archivo))) return exactas.get(claveExacta(archivo));
    const p = palabrasClave(archivo);
    for (let n = p.length; n >= 1; n--) { const c = suaves.get(p.slice(0, n).join('')); if (c) return c; } // «Turn_Left_Strafe» → «Turn_Left»
    return suaves.get('idle') || null; // sin pareja: el jinete va sentado en reposo
  }
  const etiqueta = (sel) => {
    if (!sel) return 'Elige una animación';
    if (sel.startsWith('fav:')) return FAVORITOS.find((f) => f.id === sel.slice(4))?.nombre || sel;
    if (sel.startsWith('j:')) return nombreClip(`${(app.library.get(sel.slice(2))?.name || sel).replace(/^Rider\s+/i, '').replace(/\s+/g, '_')}`);
    return nombreClip(sel);
  };

  const url = (esp, sub, f) => `/animales/${encodeURIComponent(esp.id)}/${sub}/${encodeURIComponent(f)}`;

  async function leerFbx(u) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`No se pudo leer ${u}`);
    return fbx.parse(await r.arrayBuffer(), '');
  }

  async function cargarEspecies() {
    try {
      const r = await fetch('/api/animales');
      A.especies = (await r.json()).especies || [];
      const catalog=await (await fetch('/ecosystem/characters')).json();
      catalogo=catalog.items||[];
      caballosEstudio=catalogo.filter(c=>!c.id.startsWith('lib:')&&/rocinante|caballo|horse/i.test(c.name));
      estado = A.especies.length ? 'listo' : 'No hay animales en biblioteca/animales/';
    } catch (e) {
      estado = `No se pudo leer la lista de animales: ${e.message}`;
    }
    if (!A.especie || !A.especies.some((x) => x.id === A.especie)) A.especie = A.especies[0]?.id || null;
  }

  // ---------- Modelo ----------
  async function cargarActor(esp) {
    const identidad = A.modelo === 'seleccionado' ? (isARPHorse(app.rig.root)?app.charMeta.id:selectedHorse?.id) : A.modelo;
    if (actor?.especie === esp.id && actor.identidad === identidad) return actor;
    quitarActor();
    estado = `Cargando ${esp.nombre}…`;
    pintarEstado();
    if (A.modelo !== 'predeterminado') {
      let root;
      if (A.modelo === 'seleccionado') {
        if(isARPHorse(app.rig.root)) {
          app.rig.resetToRest();root=clone(app.rig.root);
          selectedHorse={root:clone(root),id:app.charMeta.id,name:app.charMeta.name};
        } else if(selectedHorse)root=clone(selectedHorse.root);
        else throw Error('Elige un caballo en el selector.');
      } else if (A.modelo.startsWith('estudio:')) {
        const c=caballosEstudio.find(c=>'estudio:'+c.id===A.modelo);
        if(!c)throw Error('No se encuentra ese caballo en el Estudio.');
        root=(await loadModelURL(c.url,'caballo.glb')).root;
      } else {
        const c = app.characters.find(c=>c.id===A.modelo);
        if (!c) throw Error('El caballo elegido ya no está disponible.');
        if (c.kind === 'url') root = (await loadModelURL(c.url,c.file)).root;
        else { const data=await db.get('characters',c.id);root=(await loadModel(data.data,data.file)).root; }
      }
      if (!isARPHorse(root)) throw Error('Ese modelo no tiene un perfil de caballo AutoRig Pro compatible.');
      root.traverse(o=>{if(o.isMesh){o.frustumCulled=false;o.castShadow=true;}});
      skinHorseTack(root); // breast collar follows the chest instead of crossing it
      const pivote = new THREE.Group();
      pivote.add(root);holder.add(pivote);
      // Real size (registry alturaM): the GLB keeps its units; only the preview scales it.
      const real=alturaReal({id:identidad,name:A.modelo==='seleccionado'?(app.charMeta?.name||selectedHorse?.name):caballosEstudio.find(c=>'estudio:'+c.id===A.modelo)?.name});
      if(real){root.updateMatrixWorld(true);const h=alturaMalla(root);if(h>.05)pivote.scale.setScalar(real/h);}
      actor = {root:pivote,modelo:root,mixer:new THREE.AnimationMixer(pivote),especie:esp.id,identidad,esp,nativo:true,totalTime:0};
      encuadrar();estado='listo';return actor;
    }
    const file = esp.modelo || esp.modelos?.[0];
    const root = await leerFbx(url(esp, 'modelo', file));
    // Textura: el FBX de Unity no lleva las texturas; se asignan las del paquete.
    let map = null, normalMap = null;
    if (esp.textura) {
      map = await textureLoader.loadAsync(url(esp, 'modelo', esp.textura));
      map.colorSpace = THREE.SRGBColorSpace;
      map.flipY = true;
      map.anisotropy = 4;
    }
    if (esp.normal) {
      normalMap = await textureLoader.loadAsync(url(esp, 'modelo', esp.normal));
      normalMap.anisotropy = 4;
    }
    let rootBone = null;
    root.traverse((o) => {
      if (o.isBone && !rootBone) rootBone = o;
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = true;
      // El FBX trae también silla, riendas, armadura y copias de baja calidad (LOD): solo se muestra lo que dice la ficha.
      if (esp.ocultar && new RegExp(esp.ocultar, 'i').test(o.name)) { o.visible = false; return; }
      const cuerpo = !esp.cuerpo || new RegExp(esp.cuerpo, 'i').test(o.name);
      const nueva = (m0) => {
        if (/eye|lens|ojo/i.test(`${m0.name} ${o.name}`)) return m0;
        if (!cuerpo) return new THREE.MeshStandardMaterial({ color: esp.pelo || '#2b1d14', roughness: 0.9, metalness: 0, side: THREE.DoubleSide, name: m0.name });
        return new THREE.MeshStandardMaterial({ color: 0xffffff, map, normalMap, roughness: 0.78, metalness: 0, name: m0.name });
      };
      o.material = Array.isArray(o.material) ? o.material.map(nueva) : nueva(o.material);
    });
    // Escala: los FBX de Unity vienen en cm o m. Se mide solo lo visible (sin silla, riendas ni copias LOD).
    // El nodo «Root» envuelve el modelo: los clips de Unity mueven y giran «Root» (giros, arranques) y con él se aplican.
    const pivote = new THREE.Group();
    pivote.name = 'Root';
    pivote.add(root);
    root.updateMatrixWorld(true);
    const medir = () => { const b = new THREE.Box3(); root.traverse((o) => { if (o.isMesh && o.visible) b.union(new THREE.Box3().setFromObject(o)); }); return b; };
    let box3 = medir();
    const alto = box3.max.y - box3.min.y;
    if (alto > 20) pivote.scale.setScalar(0.01);
    else if (alto < 0.2) pivote.scale.setScalar(1.9 / Math.max(alto, 1e-3));
    root.position.y -= box3.min.y; // pies en el suelo (en las unidades del propio modelo)
    holder.add(pivote);
    actor = { root: pivote, modelo: root, mixer: new THREE.AnimationMixer(pivote), rootBone, especie: esp.id, identidad, esp };
    encuadrar();
    estado = 'listo';
    return actor;
  }

  function quitarActor() {
    if (!actor) return;
    riendas(false);
    actor.root.position.set(0,0,0);actor.root.quaternion.identity();
    actor.motion?.dispose();
    actor.mixer.stopAllAction();
    holder.remove(actor.root);
    actor = null;
    action = null;
    clipActual = null;
  }

  function encuadrar() {
    if (app.sceneLive?.on) return;
    const vp = app.viewport;
    camPath.set(0,0,0);
    const c = new THREE.Vector3(0, 0.8, 0);
    vp.orbit.target.copy(c);
    const d = new THREE.Vector3(2.7,.9,3.1);
    vp.camera.position.copy(c).add(d);
    vp.camera.lookAt(c);
    vp.orbit.update();
  }

  // ---------- Reproducción ----------
  async function clipDe(esp, archivo) {
    const u = url(esp, 'clips', archivo);
    if (!cache.has(u)) {
      const m = await leerFbx(u);
      const c = (m.animations || []).find((a) => a.tracks.length) || null;
      if (!c) throw new Error(`«${archivo}» no trae animación`);
      cache.set(u, c);
      clipRoots.set(c,m);
    }
    return cache.get(u);
  }

  /** Copia del clip lista para el modelo: sin el avance horizontal de la raíz cuando «En el sitio» está activo. */
  function prepararClip(original) {
    if (actor?.nativo) return new THREE.AnimationClip(original.name,original.duration,[]);
    const c = original.clone();
    c.name = original.name;
    // El nodo «Root» de los clips de Unity trae la orientación de eje del exportador (p. ej. −90° X, −90° Z) en todos sus fotogramas;
    // el modelo ya está bien orientado, así que solo cuenta lo que Root cambia respecto al primer fotograma (giros, arranques).
    const qi = new THREE.Quaternion(), q0 = new THREE.Quaternion();
    for (const t of c.tracks) {
      const nodo = t.name.split('.')[0];
      if (nodo !== 'Root') continue;
      const v = t.values;
      if (t.name.endsWith('.quaternion')) {
        q0.set(v[0], v[1], v[2], v[3]).invert();
        for (let i = 0; i < v.length; i += 4) { qi.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(q0); v[i] = qi.x; v[i + 1] = qi.y; v[i + 2] = qi.z; v[i + 3] = qi.w; }
      } else if (t.name.endsWith('.position')) {
        const x0 = v[0], y0 = v[1], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] -= x0; v[i + 1] -= y0; v[i + 2] -= z0; }
      }
    }
    if (sitio && actor?.rootBone) {
      const rb = actor.rootBone.name;
      // Pistas de posición del hueso raíz y de sus padres inmediatos (el FBX de Unity suele mover «Root»/«Horse»).
      for (const t of c.tracks) {
        if (!t.name.endsWith('.position')) continue;
        const nodo = t.name.slice(0, -'.position'.length);
        const esRaiz = nodo === rb || nodo === actor.root.name || /^(root|horse|horse_a|reference|hips)$/i.test(nodo.split('|').pop());
        if (!esRaiz) continue;
        const v = t.values;
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
    return c;
  }

  /** Pone el clip del caballo en su mezclador (el reloj maestro). */
  async function iniciarCaballo(archivo) {
    const esp = A.especies.find((x) => x.id === A.especie);
    if (!esp) throw new Error('Sin animal');
    const a = await cargarActor(esp);
    estado = `Leyendo ${archivo}…`;
    pintarEstado();
    const original = await clipDe(esp, archivo);
    clipActual = original;
    if (a.nativo) {
      referencia ||= leerFbx(url(esp,'modelo',esp.modelo||esp.modelos[0]));
      a.root.position.set(0,0,0);a.root.quaternion.identity();
      a.motion?.dispose();
      const cyclic=/amble|walk|trot|canter|gallop|sprint|idle/i.test(archivo)&&!/start|end|turn|jump|135|180|90/i.test(archivo);
      const ground=!/swim|fly|jump|fall|death/i.test(archivo);
      a.motion=new HorseMotion(a.modelo,clipRoots.get(original),await referencia,original,{cyclic,ground});
      a.totalTime=0;
      a.motion.evaluate(0,{circle:A.circulo?3:0});
    }
    a.mixer.stopAllAction();
    action = a.mixer.clipAction(prepararClip(original));
    action.setLoop(bucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.timeScale = velocidad;
    action.reset().play();
    pausa = false;
  }

  // El jinete es el maniquí del Taller. Antes de montarlo se recuerda el modo y el documento (la animación general del maniquí
  // se guarda sola); al salir de Animales o quitar «Con jinete» se devuelven tal cual estaban.
  const embebido = new URLSearchParams(location.search).has('studioSession'); // dentro del Estudio el jinete es el actor de la escena
  let previo = null; // { modo, doc }
  let offsetMonta = null; // montar y desmontar: el clip termina sentado, así que se coloca para que su último fotograma caiga en el asiento
  async function prepararJinete() {
    if (!app.rig.humanoid) { conJinete=false; return; }
    if (previo) return;
    previo = { modo: app.mode, doc: null };
    // The selected person is the rider. Do not replace it with the mannequin.
    previo.doc = JSON.stringify(app.engine.doc);
    app.animalPreview=true;
  }
  async function soltarJinete() {
    if (pair) releasePair();
    enlace = null;
    escena = null;
    quitarObstaculo();
    soloJinete = null;
    app.playing = false;
    app.engine.mount = null;
    app.displayXform = null;
    app.viewport.charHolder.position.set(0,0,0);
    app.viewport.charHolder.quaternion.identity();
    app.viewport.charHolder.scale.set(1,1,1);
    riendas(false);
    if (!previo) return;
    const p = previo;
    previo = null;
    app.animalPreview=false;
    if (p.doc) { app.engine.doc = JSON.parse(p.doc); app.changed(false); }
    if (!embebido && p.modo !== app.mode) await app.modes.set(p.modo);
    app.evaluate();
  }

  /** El maniquí del Taller toma el clip humanoide del jinete (se pone en su escena, como al pulsar su tarjeta en Animaciones). */
  async function ponerJinete(id) {
    await prepararJinete();
    offsetMonta = null;
    app.engine.mount = actor?.esp?.montura || [0, 0, 0];
    await app.ensureClip(id);
    if (!app.library.get(id) || app.library.get(id).failed) throw new Error('No se pudo leer el clip del jinete');
    app.playing = false;
    app.useClip(id, false);
  }

  async function reproducir(archivo) {
    if (pair) {
      app.toast('Arrastra la animación a Base para añadirla a la actuación actual.');
      return;
    }
    if (app.sceneLive?.on && !studioRider()) {
      if(app.rig.kind==='quadruped') return editar(archivo).catch(error=>app.toast(error.message,true));
      app.toast('Añade un caballo y su jinete como actores de esta escena.',true);
      return;
    }
    if (app.sceneLive?.on && studioHorse() && studioRider()) {
      return A.favorito(favoritoDeClip(archivo),{frame:0,who:app.rig.kind==='quadruped'?'caballo':'jinete'});
    }
    trabajando++;
    if (conJinete && app.rig.humanoid) ocultar();
    try {
      escena = null; quitarObstaculo(); A.fav = null;
      soloJinete = null;
      enlace = null;
      await iniciarCaballo(archivo);
      A.sel = archivo;
      if (actor.nativo && !conJinete) {
        await editar(archivo);
        return;
      }
      if (conJinete && app.rig.humanoid) {
        const par = parejaJinete(archivo);
        if (par) {
          await ponerJinete(par.id); enlace = { id: par.id, exacta: palabrasClave(par.name).join('') === palabrasClave(archivo).join('') };
          // El reloj es el fotograma del motor: la línea de tiempo de abajo reproduce, pausa y recorre al caballo y a su jinete.
          app.engine.frame = 0; app.playDir = 1; app.playing = true;
        }
      }
      estado = 'listo';
      pintarSeleccion();
      guardarSesion();
    } catch (e) {
      estado = `Error: ${e.message}`;
      console.warn('[animales]', e);
      revelar();
    } finally {
      trabajando--;
      if (!enlace) revelar();
    }
    pintarEstado();
  }

  async function nativeClip(esp, archivo, rig, character) {
    const original = await clipDe(esp, archivo);
    referencia ||= leerFbx(url(esp, 'modelo', esp.modelo || esp.modelos[0]));
    const root = clone(rig.root);
    const isolated = new Rig(root);
    isolated.resetToRest();
    root.updateMatrixWorld(true);
    const cyclic = /amble|walk|trot|canter|gallop|sprint|idle/i.test(archivo) && !/start|end|turn|jump|135|180|90/i.test(archivo);
    const motion = new HorseMotion(root, clone(clipRoots.get(original)), clone(await referencia), original,
      { cyclic, ground: !/swim|fly|jump|fall|death/i.test(archivo) });
    const fps = app.engine.fps;
    const frames = Math.max(2, Math.round(original.duration * fps) + 1);
    const native = Object.fromEntries(isolated.bones.map(b => [b.name, { q: [], p: [], s: [] }]));
    try {
      for (let i = 0; i < frames; i++) {
        motion.evaluate(i * original.duration / (frames - 1));
        for (const bone of isolated.bones) {
          const track = native[bone.name];
          track.q.push(...bone.quaternion.toArray());
          track.p.push(...bone.position.toArray());
          track.s.push(...bone.scale.toArray());
        }
      }
    } finally {
      motion.dispose();
    }
    const clip = makeClip({ id: `animal:${character.id}:${archivo}`, name: `${character.name} · ${nombreClip(archivo)}`,
      fps, frames, loop: cyclic, source: 'propio', tracks: {}, tags: ['tuyas', 'animales'] });
    return Object.assign(clip, { native, character, animal: { especie: esp.id, modelo: A.modelo, archivo, editorVersion: 3 } });
  }

  /** «Escena con jinete» soltada en la tira Base: el caballo y su jinete la ejecutan juntos (una tira cada uno,
   * con el mismo reloj). En la historia rehace la pareja con esa escena; fuera de ella, la escena pasa a Base. */
  async function ponerEscenaEnBase(id) {
    const favorite = FAVORITOS.find((f) => f.id === id);
    if (!favorite) throw Error(`No existe la escena «${id}».`);
    if (app.studioLink?.context() && app.mode === 'escena') {
      if (!studioHorse() || !studioRider()) throw Error('Añade un caballo y su jinete como actores de esta escena.');
      const who = pair ? (pair.active === pair.horse ? 'caballo' : 'jinete') : 'jinete';
      if (pair) releasePair();
      const result = await preparePair(favorite, { who, frame:0 });
      app.playing = false;
      return result;
    }
    return A.favorito(id, { base:true, frame:0, pausa:true });
  }
  A.ponerEscenaEnBase = ponerEscenaEnBase;

  A.insertClip = async (payload, frame) => {
    const { file, species } = JSON.parse(payload);
    const esp = A.especies.find(item => item.id === species);
    if (!esp || typeof file !== 'string') throw Error('No se encontró la animación.');
    if (file.startsWith('j:')) return app.insertLibraryStrips([file.slice(2)], frame);
    if (file.startsWith('fav:')) return ponerEscenaEnBase(file.slice(4));
    if (app.rig.kind !== 'quadruped') throw Error('Selecciona el rig del caballo para insertar esta animación.');
    const { rig, charMeta } = app;
    return app.insertLibraryStrips([file], frame, async () => {
      const clip = await nativeClip(esp, file, rig, charMeta);
      if (app.rig === rig) await app.saveMine(clip);
      return clip;
    });
  };

  /** Put the animal itself in the editor; the Base strip becomes its only clock. */
  async function editar(archivo = A.sel, { keepDoc = false } = {}) {
    if (editing) return editing;
    editing = (async () => {
      await especiesReady;
      if (!archivo || archivo.startsWith('j:')) throw Error('Elige una animación del caballo.');
      if (app.studioLink?.context()?.characterId === app.charMeta.id && app.rig.kind === 'quadruped') {
        const esp = A.especies.find(item => item.id === A.especie);
        if (!esp) throw Error('No se encontró la biblioteca de animaciones del caballo.');
        const clip = await nativeClip(esp, archivo, app.rig, app.charMeta);
        await app.saveMine(clip);
        A.sel = archivo;
        if (!keepDoc) app.useClip(clip.id);
        app.viewport.opts.controls = true;
        app.viewport.handles.visible = true;
        return { clip:clip.id, personaje:app.charMeta.name, fotogramas:clip.frames, controles:app.viewport.handleList.length };
      }
      if (!actor || !clipActual || A.sel !== archivo) {
        await iniciarCaballo(archivo);
        A.sel = archivo;
      }
      if (!actor.nativo) throw Error('El editor de cuatro patas requiere un caballo AutoRig Pro.');
      app.playing = false;
      pausa = true;
      if (action) action.paused = true;
      await soltarJinete();
      conJinete = false;
      actor.motion.reset();
      const root = clone(actor.modelo);
      const catalog = caballosEstudio.find(c => 'estudio:' + c.id === A.modelo);
      const known = app.characters.find(c => c.id === actor.identidad);
      const character = catalog ? { id:'animal:' + catalog.id, name:catalog.name, kind:'url', url:catalog.url, file:'caballo.glb' }
        : known ? { ...known } : { ...app.charMeta };
      if (!app.characters.some(c => c.id === character.id)) app.characters.push(character);
      setPrefs(`charInfo:${character.id}`, character);
      editor = true;
      await app.setCharacterRoot(root, character);
      app.rig.resetToRest(); root.updateMatrixWorld(true);
      // Build against the editor hierarchy, keeping the contact correction intact.
      const cyclic = /amble|walk|trot|canter|gallop|sprint|idle/i.test(archivo) && !/start|end|turn|jump|135|180|90/i.test(archivo);
      const motion = new HorseMotion(root, clone(clipRoots.get(clipActual)), clone(await referencia), clipActual,
        { cyclic, ground:!/swim|fly|jump|fall|death/i.test(archivo) });
      const fps = app.engine.fps, frames = Math.max(2, Math.round(clipActual.duration * fps) + 1);
      const native = Object.fromEntries(app.rig.bones.map(b => [b.name, { q:[], p:[], s:[] }]));
      for (let i = 0; i < frames; i++) {
        motion.evaluate(i * clipActual.duration / (frames - 1));
        for (const b of app.rig.bones) {
          const t = native[b.name]; t.q.push(...b.quaternion.toArray()); t.p.push(...b.position.toArray()); t.s.push(...b.scale.toArray());
        }
      }
      motion.dispose();
      const clip = makeClip({ id:`animal:${character.id}:${archivo}`, name:`${character.name} · ${nombreClip(archivo)}`, fps, frames, loop:cyclic, source:'propio', tracks:{}, tags:['tuyas', 'animales'] });
      Object.assign(clip, { native, character, animal:{ especie:A.especie, modelo:A.modelo, archivo, editorVersion:3 } });
      await app.saveMine(clip);
      if (keepDoc) {
        for (const s of app.engine.doc.strips) if (/rocinante_/i.test(s.clipId)) s.clipId = clip.id;
        app.selStrip = app.engine.doc.strips[0]?.id;
        app.libSel = clip.id;
        app.changed();
      } else app.useClip(clip.id);
      app.viewport.opts.controls = true;
      app.viewport.handles.visible = true;
      app.viewport.charHolder.visible = true;
      holder.visible = false;
      $('#timelineWrap').classList.remove('hidden'); app.panels.layout?.(); app.topmenu?.paintSides();
      app.timeline.fit();
      app.viewport.reframe();
      app.playing = false;
      estado = 'listo';
      refresh(); visibilidad();
      return { clip:clip.id, personaje:character.name, fotogramas:frames, controles:app.viewport.handleList.length };
    })();
    try { return await editing; }
    finally { editing = null; }
  }

  /** Clip solo del jinete (montar, desmontar): lo reproduce el motor del Taller; el caballo espera en reposo. */
  async function reproducirJinete(id) {
    if (pair) {
      app.toast('Arrastra la animación a Base para añadirla a la actuación actual.');
      return;
    }
    trabajando++;
    ocultar();
    try {
      enlace = null; escena = null; quitarObstaculo(); A.fav = null;
      app.viewport.charHolder.scale.set(1,1,1);
      const esp = A.especies.find((x) => x.id === A.especie);
      const reposo = esp?.clips.find((f) => /^H_Idle_01\./i.test(f)) || esp?.clips[0];
      if (reposo) await iniciarCaballo(reposo);
      await ponerJinete(id);
      // La cadera de estos clips se mide respecto a su primer fotograma (de pie junto al caballo) y avanza hacia el asiento:
      // se desplaza para que el último fotograma caiga en el asiento y no se quita su avance («en el sitio»).
      const c = app.library.get(id);
      if (c?.hips && c.frames > 1 && app.rig) {
        const n = (c.frames - 1) * 3;
        const d = new THREE.Vector3(c.hips[n], c.hips[n + 1], c.hips[n + 2]).applyQuaternion(app.rig.Fq).multiplyScalar(app.rig.hipsHeight);
        const m = esp?.montura || [0, 0, 0];
        offsetMonta = [m[0] - d.x, m[1] - d.y, m[2] - d.z];
        app.engine.mount = offsetMonta;
      }
      const s = app.engine.doc.strips[0];
      if (s) s.inPlace = false;
      soloJinete = id;
      A.sel = `j:${id}`;
      app.engine.frame = 0;
      app.playDir = 1;
      app.playing = true;
      pausa = false;
      estado = 'listo';
      app.evaluate();
      revelar(); // clip solo del jinete: no pasa por sentar(); ya está en su sitio
      pintarSeleccion();
      guardarSesion();
    } catch (e) {
      estado = `Error: ${e.message}`;
      console.warn('[animales]', e);
      revelar();
    } finally { trabajando--; }
    pintarEstado();
  }

  function reaplicar() {
    if (!A.sel || !actor || !clipActual) return;
    const t = action?.time || 0;
    actor.mixer.stopAllAction();
    action = actor.mixer.clipAction(prepararClip(clipActual));
    action.setLoop(bucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.timeScale = velocidad;
    action.reset().play();
    action.time = t;
    action.paused = pausa;
  }

  // ---------- Panel ----------
  function pintarEstado() {
    if (ui.estado) ui.estado.textContent = estado === 'listo' ? '' : estado;
  }
  function pintarSeleccion() {
    for (const el of box.querySelectorAll('.animal-clip')) el.classList.toggle('on', el.dataset.f === A.sel);
    if (ui.titulo) ui.titulo.textContent = etiqueta(A.sel);
    if (ui.dur) ui.dur.textContent = clipActual ? `${clipActual.duration.toFixed(2)} s` : '';
    refrescarBarra();
  }

  function refresh() {
    box.innerHTML = '';
    if (!A.especies.length) {
      box.append(h('div', { class: 'muted small', style: { padding: '8px' } }, estado));
      return;
    }
    const esp = A.especies.find((x) => x.id === A.especie) || A.especies[0];
    const lista = esp.clips.map((f) => ({ f, ...categoriaClip(f), nombre: nombreClip(f) }));
    // Subir y bajar del caballo: clips solo del jinete (humanoides, de la librería «Jinete (a caballo)»).
    FAVORITOS.forEach((f, i) => lista.push({ f: `fav:${f.id}`, cat: 'Favoritos', sub: f.sub || 'Escenas con jinete', nombre: f.nombre, orden: i }));
    for (const c of jinetes()) if (/mount/i.test(c.name)) lista.push({ f: `j:${c.id}`, cat: 'Montar y desmontar', sub: 'Subir y bajar del caballo', nombre: etiqueta(`j:${c.id}`) });

    const especieSel = h('div', { class: 'animal-especies' }, A.especies.map((x) => h('button', {
      class: `library-choice ${x.id === esp.id ? 'on' : ''}`, onclick: () => { A.especie = x.id; A.cat = null; guardarSesion(); refresh(); if (A.visible) cargarActor(x).then(pintarEstado); },
    }, h('span', {}, x.nombre), h('span', { class: 'library-count' }, x.clips.length))));

    const arbol = new Map();
    for (const c of lista) {
      if (!arbol.has(c.cat)) arbol.set(c.cat, new Map());
      arbol.get(c.cat).set(c.sub, (arbol.get(c.cat).get(c.sub) || 0) + 1);
    }
    const cats = [...arbol.keys()].sort((a, b) => (ORDEN.indexOf(a) + 99) % 99 - (ORDEN.indexOf(b) + 99) % 99);
    const on = (cat, sub) => (cat ? A.cat?.cat === cat && (A.cat?.sub || null) === (sub || null) : !A.cat);
    const pick = (cat, sub) => { A.cat = cat ? { cat, sub } : null; if (cat) A.abiertas.add(cat); refresh(); };
    const arbolEl = h('div', { class: 'library-categories library-tree' },
      h('button', { class: `library-choice ${on(null) ? 'on' : ''}`, onclick: () => pick(null) }, h('span', {}, 'Todas las categorías'), h('span', { class: 'library-count' }, lista.length)),
      cats.map((cat) => {
        const subs = [...arbol.get(cat).entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
        const total = subs.reduce((s, [, n]) => s + n, 0);
        const abierta = A.abiertas.has(cat) || A.cat?.cat === cat;
        return h('div', { class: 'library-cat' },
          h('div', { class: 'library-cat-row' },
            h('button', { class: 'library-cat-toggle', 'aria-expanded': String(abierta), onclick: () => { abierta ? A.abiertas.delete(cat) : A.abiertas.add(cat); refresh(); } }, abierta ? '▾' : '▸'),
            h('button', { class: `library-choice ${on(cat, null) ? 'on' : ''}`, onclick: () => pick(cat, null) }, h('span', {}, cat), h('span', { class: 'library-count' }, total))),
          abierta ? h('div', { class: 'library-subs' }, subs.map(([sub, n]) => h('button', { class: `library-choice sub ${on(cat, sub) ? 'on' : ''}`, onclick: () => pick(cat, sub) }, h('span', {}, sub), h('span', { class: 'library-count' }, n)))) : null);
      }),
    );

    const buscar = h('input', { class: 'search', type: 'search', placeholder: 'Buscar animación…', value: A.busqueda, 'aria-label': 'Buscar animaciones de animales' });
    buscar.oninput = () => {
      A.busqueda = buscar.value;
      clearTimeout(A._t);
       A._t = setTimeout(() => { const focused = document.activeElement === buscar; refresh(); if (focused) $('#spAnimales .search')?.focus(); }, 200);
    };
    const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const palabras = norm(A.busqueda).trim().split(/\s+/).filter(Boolean);
    const vistos = lista.filter((c) => (!A.cat || (c.cat === A.cat.cat && (!A.cat.sub || c.sub === A.cat.sub))) && palabras.every((p) => norm(`${c.nombre} ${c.f} ${c.cat} ${c.sub}`).includes(p)))
      .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

    // La reproducción (▶, fotograma, Bucle, velocidad) es la de la línea de tiempo de abajo; «En el sitio», «Correr en círculo» y «Con jinete» están en su barra (A.barra).
    ui.estado = h('div', { class: 'muted small' });

    const tarjetas = h('div', { class: 'animal-clips' }, vistos.map((c) => h('button', {
      class: `animal-clip ${c.f === A.sel ? 'on' : ''}`, 'data-f': c.f, title: c.f,
      draggable: 'true',
      ondragstart: (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/x-spanstories-animal', JSON.stringify({ file: c.f, species: esp.id }));
      },
      onclick: () => (c.f.startsWith('fav:') ? A.favorito(c.f.slice(4)) : c.f.startsWith('j:') ? reproducirJinete(c.f.slice(2)) : reproducir(c.f)),
    }, h('span', { class: 'cn' }, c.nombre), h('span', { class: 'muted small' }, A.cat ? '' : `${c.cat} › ${c.sub}`))));
    if (!vistos.length) tarjetas.append(h('div', { class: 'muted small', style: { padding: '8px' } }, 'Ninguna animación coincide.'));

    const modeloSel=h('select',{'aria-label':'Modelo del caballo'},
      h('option',{value:'predeterminado'},'Caballo del paquete'),
      caballosEstudio.map(c=>h('option',{value:'estudio:'+c.id},c.name+' (Estudio)')),
      ...(isARPHorse(app.rig.root)||selectedHorse?[h('option',{value:'seleccionado'},(isARPHorse(app.rig.root)?app.charMeta.name:selectedHorse.name)+' (seleccionado)')]:[]),
      app.characters.filter(c=>/rocinante|caballo|horse/i.test(c.name)&&c.id!==app.charMeta.id).map(c=>h('option',{value:c.id},c.name)));
    modeloSel.value=A.modelo;
    modeloSel.disabled=!!pair;
    modeloSel.onchange=()=>A.elegirModelo(modeloSel.value);
    const jineteSel=h('select',{'aria-label':'Personaje del jinete'},
      h('option',{value:''},app.rig.humanoid?app.charMeta.name:'Elige un personaje humano'),
      app.characters.filter(c=>c.id!==app.charMeta.id&&!/rocinante|caballo|horse/i.test(c.name)).map(c=>h('option',{value:c.id},c.name)));
    jineteSel.value='';
    jineteSel.disabled=!!pair;
    jineteSel.onchange=async()=>{
      if(!jineteSel.value)return;
      // Desde el editor de Rocinante: el jinete elegido se monta y queda en Base listo para editar (mismo camino que «Editar movimiento»).
      if(editor){ jineteEditor=jineteSel.value; await A.pedirRig('jinete'); guardarSesion(); refresh(); visibilidad(); return; }
      trabajando++;ocultar();
      try {
        await soltarJinete();await app.wearCharacter(jineteSel.value);conJinete=app.rig.humanoid;
        await reponerSeleccion();
      } catch (e) { estado = `Error: ${e.message}`; revelar(); }
      finally { trabajando--; }
      if (!A.sel || !conJinete) revelar();
      guardarSesion();refresh();visibilidad();
    };
    box.append(
      h('div', { class: 'animal-aviso muted small' }, `${esp.nombre}: ${esp.clips.length} animaciones${esp.origen ? ' · ' + esp.origen : ''}. Elige el caballo; los modelos AutoRig Pro compatibles reciben la adaptación del FBX. «Con jinete» usa el personaje humano seleccionado.`),
      especieSel, h('label',{},'Caballo ',modeloSel), h('label',{},'Jinete ',jineteSel), selectorEdicion(), editor ? h('div', {class:'muted small'}, 'Secuencia en Base · usa los controles de reproducción de abajo y los puntos del rig para editar.') : h('div', { class: 'animal-aviso muted small' }, 'La reproducción está en la línea de tiempo de abajo: ▶/❚❚, fotograma, ⟳ Bucle y velocidad. «En el sitio», «Correr en círculo» y «Con jinete» están en su barra.'), ui.estado, buscar, arbolEl, tarjetas);
    pintarEstado();
  }

  // ---------- Mostrar / ocultar según la pestaña activa ----------
  const enPestana = () => !$('[data-pane=biblioteca]')?.classList.contains('hidden') && !$('#spAnimales').classList.contains('hidden');
  /** Con el animal a la vista, el maniquí solo se ve si va de jinete (y se coloca sobre el caballo); fuera, todo como estaba. */
  function visibilidad() {
    if (pair) {
      app.viewport.charHolder.visible = app.viewport.handles.visible = app.viewport.ghosts.visible = true;
      holder.visible = !app.sceneLive?.on;
      spare.visible = !app.sceneLive?.on;
      return;
    }
    if (editor && app.rig.kind !== 'quadruped') editor = false;
    if (editor) {
      app.displayXform = null;
      holder.visible = false;
      app.viewport.charHolder.visible = true;
      app.viewport.handles.visible = true;
      app.viewport.ghosts.visible = true;
      app.engine.mount = null;
      app.evaluate();
      return;
    }
    const v = A.visible;
    const ch = app.viewport.charHolder;
    const monta = v && conJinete && app.rig.humanoid;
    if (!monta) app.displayXform = null;
    // Escena llevada a la capa Base: el jinete se edita con su rig (puntos, círculos, IK/FK) sin salir de Animales.
    const enBase = v && !!escena?.editable;
    holder.visible = v && !app.sceneLive?.on;
    ch.visible = !!app.sceneLive?.on || ((!v || monta) && !pendiente && (!v || sentado()));
    app.viewport.handles.visible = !!app.sceneLive?.on || !v || enBase;
    app.viewport.ghosts.visible = !v || enBase;
    // La cadera se desplaza en el motor (no en charHolder: el esqueleto se coloca en coordenadas de mundo). No se guarda en el documento.
    // En Base, la escena coloca la cadera sobre la silla (sentar) a partir de la pose del motor: sin desplazamiento extra.
    app.engine.mount = monta && !enlace?.cal && !enBase ? (offsetMonta || actor?.esp?.montura || [0, 0, 0]) : null;
    app.evaluate();
  }

  function sync() {
    const v = enPestana();
    if (v === A.visible) return A.syncP;
    A.visible = v;
    return (A.syncP = sincronizar(v));
  }
  async function sincronizar(v) {
    if (!v) revelar();
    visibilidad();
    if (pair) {
      if (!v) devolverFlotantes();
      refrescarBarra();
      return;
    }
    if (!v) { guardarSesion({ activo: false }); refrescarBarra(); devolverFlotantes(); await soltarJinete(); }
    if (v) {
      apartarFlotantes();
      if (!A.especies.length) { await cargarEspecies(); refresh(); }
      const horse = studioHorse();
      if (horse) A.modelo = 'estudio:' + horse.characterId;
      if (conJinete && !app.studioLink?.context()) await prepararJinete().catch((e) => console.warn('[animales] maniquí', e));
      const esp = A.especies.find((x) => x.id === A.especie);
      if (esp) { await cargarActor(esp).catch((e) => { estado = `Error: ${e.message}`; }); visibilidad(); pintarEstado(); }
      guardarSesion(); refrescarBarra();
      // En la historia, con un caballo y su jinete en la escena: el jinete aparece montado por defecto (reposo),
      // salvo que la actuación de la historia ya sea una escena montada (la recupera behaviors.js con restoreMounted).
      if (horse && studioRider() && app.sceneLive?.on && !pair && !preparingPair) {
        const favorite = FAVORITOS.find((f) => f.id === (A.fav || 'reposo')) || FAVORITOS.find((f) => f.id === 'reposo');
        await preparePair(favorite, { who:app.rig.kind === 'quadruped' ? 'caballo' : 'jinete' }).catch((e) => app.toast(e.message, true));
      }
    }
  }

  A.refresh = refresh;
  A.abrir = sync;
  function actualizarMovimiento() {
    if(!actor?.motion)return;
    if(conJinete)asiento(); // measured at rest, before this frame's pose
    actor.root.position.set(0,0,0);actor.root.quaternion.identity();
    const r=actor.motion.evaluate(actor.totalTime||0,{circle:A.circulo?3:0});
    actor.root.position.fromArray(r.path.position);actor.root.quaternion.fromArray(r.path.quaternion);
    if(A.circulo) {
      const delta=actor.root.position.clone().sub(camPath);
      app.viewport.camera.position.add(delta);app.viewport.orbit.target.add(delta);app.viewport.orbit.update();
      camPath.copy(actor.root.position);
    }
    // As in Horse Animset Pro, the rider clip is relative to a mount point fixed
    // to the bone that carries the saddle: the rider follows its bounce, pitch
    // and roll rigidly. The Rider_* clip itself plays untouched. The Taller poses
    // skeletons in world space (charHolder only scales them), so the seat
    // transform is applied to the evaluated pelvis.
    if(conJinete&&app.rig.humanoid&&enlace) {
      const ch=app.viewport.charHolder, seat=actor.asiento;
      actor.root.updateMatrixWorld(true);
      ch.position.set(0,0,0);ch.quaternion.identity();
      if(!seat){ch.scale.set(1,1,1);app.evaluate();return;}
      if(enlace.cal===undefined)enlace.cal=calibrarJinete(seat);
      const {escala,sit,mean}=enlace.cal;
      ch.scale.setScalar(escala);ch.updateMatrixWorld(true);
      app.engine.mount=null;app.evaluate();
      sentar(enlace.cal,seat);
    }
  }

  /** Puts the evaluated rider pose (unscaled clip pelvis in world space) on the
   * saddle: seat translation in full, damped pitch/roll and bounce. */
  function sentar(cal,seat,opts={}) {
    const {escala,sit,mean}=cal;
    const rig=riderRig(), ch=riderHolder();
    const hb=rig.bone('hips');
    hb.updateWorldMatrix(true,false);
    const H0=hb.matrixWorld.clone(); // pelvis tal como la deja el motor (sin montar)
    const local=hb.getWorldPosition(new THREE.Vector3()).sub(mean).multiplyScalar(escala).add(seat.rest);
    local.y+=sit*escala;
    const D=seat.bone.matrixWorld.clone().multiply(seat.restInv);
    const dq=new THREE.Quaternion();D.decompose(new THREE.Vector3(),dq,new THREE.Vector3());
    // A rider balances: the seat follows the saddle, but the pelvis takes only
    // part of the horse's pitch/roll and the torso stays almost upright
    // (Rocinante's back pitches ~30° per gallop stride; carrying it whole
    // swung Don Quijote's head 50 cm back and forth).
    const kPelvis=opts.pelvis??.35,kTorso=opts.torso??.1;
    const path=new THREE.Quaternion();actor.root.getWorldQuaternion(path);
    const body=path.clone().invert().multiply(dq); // horse motion without the path heading
    const qh=path.clone().multiply(new THREE.Quaternion().slerp(body,kPelvis));
    const qt=path.clone().multiply(new THREE.Quaternion().slerp(body,kTorso));
    const spineW=rig.bone('spine')?.getWorldQuaternion(new THREE.Quaternion());
    // Galloping riders stand in the stirrups and absorb part of the saddle's
    // bounce with their legs: the pelvis takes 55% of it, lifted so that at
    // the saddle's highest point it just touches and never goes through.
    const kVertical=opts.vertical??.55,cyc=kVertical<1?seatCycle(seat):null;
    const pw=local.applyMatrix4(D),pr=actor.root.worldToLocal(pw.clone());
    const sy=actor.root.worldToLocal(seat.rest.clone().applyMatrix4(D)).y;
    if(cyc)pr.y+=(kVertical-1)*(sy-cyc.mean)+(1-kVertical)*(cyc.max-cyc.mean);
    hb.parent.updateWorldMatrix(true,false);
    hb.position.copy(hb.parent.worldToLocal(actor.root.localToWorld(pr)));
    hb.quaternion.copy(hb.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qh.clone().multiply(hb.getWorldQuaternion(new THREE.Quaternion()))));
    hb.updateMatrixWorld(true);
    // Los objetivos IK y polos del motor viven en su espacio sin montar: los controles del visor se dibujan y se
    // arrastran a través de esta transformación (motor → silla), si no aparecen bajo el suelo.
    const mountedXform=hb.matrixWorld.clone().multiply(H0.invert());
    if (rig===app.rig) app.displayXform=mountedXform;
    const sb=rig.bone('spine');
    if(sb&&spineW) {
      sb.parent.updateWorldMatrix(true,false);
      sb.quaternion.copy(sb.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qt.clone().multiply(spineW)));
      sb.updateMatrixWorld(true);
    }
    // Real contact with Rocinante: buttocks on the seat, feet in the stirrups,
    // quiet hands on the reins with closed fists (src/core/rider-physics.js).
    if(seat.silla&&opts.fisica!==false) {
      if(!fisica||fisica.rig!==rig)fisica=new RiderPhysics(rig,ch);
      fisica.aplicar(seat,qh.clone().multiply(rig.Fq),path,{...(opts.fisica||{}),libres:piesDelUsuario(riderEngine(),mountedXform)});
    } else if(fisica)fisica.puños=[null,null];
    riendas(opts.riendas??true);
    if (rig===app.rig) app.syncMountedProxy?.();
    revelar();
  }
  let fisica=null;
  /** Pies que el usuario anima con claves IK (en alguna capa): su objetivo en el espacio de la silla, para que la
   * física no los vuelva a meter en el estribo. Sin claves, el pie sigue en el estribo aunque el IK esté encendido. */
  function piesDelUsuario(eng = app.engine, X = app.displayXform) {
    const out={};
    if(!X)return out;
    for(const S of ['L','R']) {
      const chain='foot'+S,st=eng.ikState?.[chain];
      if(!eng.doc.ik?.[chain]||!st)continue;
      const conClaves=eng.doc.layers.some(l=>!l.mute&&Object.entries(l.tracks).some(([id,k])=>id.startsWith(`ik:${chain}:`)&&k.length));
      if(conClaves)out[S]=st.target.clone().applyMatrix4(X);
    }
    return out;
  }

  /** Real height (m) of a character from the Estudio registry: by id, file or name. */
  function alturaReal(meta) {
    if(!meta)return null;
    const id=String(meta.id||'').replace(/^(estudio|eco|animal):/,''),file=String(meta.url||'').split('/').pop().replace(/\.glb$/i,'').toLowerCase();
    const name=String(meta.name||'').toLowerCase();
    const c=catalogo.find(c=>c.id===id)||catalogo.find(c=>!c.id.startsWith('lib:')&&(c.id===file||c.name.toLowerCase()===name));
    return c?.alturaM>0?c.alturaM:null;
  }
  /** Height of the posed skinned/static meshes (sampled vertices), in the parent's units. */
  function alturaMalla(root) {
    let lo=Infinity,hi=-Infinity;const v=new THREE.Vector3();
    root.traverse(o=>{
      if(!o.isMesh||o.visible===false)return;
      const p=o.geometry.attributes.position,step=Math.max(1,Math.floor(p.count/4000));
      if(o.isSkinnedMesh)o.skeleton.update();
      for(let i=0;i<p.count;i+=step){(o.isSkinnedMesh?o.getVertexPosition(i,v):v.fromBufferAttribute(p,i)).applyMatrix4(o.matrixWorld);lo=Math.min(lo,v.y);hi=Math.max(hi,v.y);}
    });
    return hi>lo?hi-lo:0;
  }

  /** Mount point on the saddle, measured on the horse at rest: the lowest point
   * of the seat between pommel and cantle, rigid to the saddle's parent bone. */
  function asiento() {
    if(!actor?.motion)return null;
    if(actor.asiento!==undefined)return actor.asiento;
    let saddle=null;actor.modelo.traverse(o=>{if(!saddle&&o.isMesh&&/silla|saddle/i.test(o.name))saddle=o;});
    let bone=saddle?.parent;
    if(saddle?.userData.anchorBone)actor.modelo.traverse(o=>{if(o.isBone&&o.name===saddle.userData.anchorBone)bone=o;});
    if(!saddle||!bone?.isBone){actor.asiento=null;return null;}
    const pos=actor.root.position.clone(),quat=actor.root.quaternion.clone();
    actor.root.position.set(0,0,0);actor.root.quaternion.identity();
    actor.motion.reset();actor.root.updateMatrixWorld(true);
    if(saddle.isSkinnedMesh)saddle.skeleton.update();
    const p=saddle.geometry.attributes.position,v=new THREE.Vector3(),pts=[];
    for(let i=0;i<p.count;i++)pts.push((saddle.isSkinnedMesh?saddle.getVertexPosition(i,v):v.fromBufferAttribute(p,i)).applyMatrix4(saddle.matrixWorld).clone());
    const box=new THREE.Box3().setFromPoints(pts),c=box.getCenter(new THREE.Vector3()),half=(box.max.x-box.min.x)*.12;
    let front=null,back=null;
    for(const q of pts){
      if(Math.abs(q.x-c.x)>half)continue;
      if(q.z>=c.z){if(!front||q.y>front.y)front=q;}else if(!back||q.y>back.y)back=q;
    }
    const z=front&&back?(front.z+back.z)/2:c.z;
    const ray=new THREE.Raycaster(new THREE.Vector3(c.x,box.max.y+1,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(saddle,false)[0];
    const rest=hit?hit.point:new THREE.Vector3(c.x,(box.min.y+box.max.y)/2,z);
    actor.asiento={bone,rest,restInv:bone.matrixWorld.clone().invert(),silla:medirSilla(saddle,rest),cuerpo:medirCuerpo(actor.modelo)};
    actor.root.position.copy(pos);actor.root.quaternion.copy(quat);actor.root.updateMatrixWorld(true);
    return actor.asiento;
  }

  // ---------- Riendas ----------
  // Two leather reins from the bit rings (mouth corners, rigid to the horse's
  // head bone) to the rider's hands, with the natural sag of a loose rein and
  // the slack hanging between the hands. Rebuilt every frame; not saved.
  const cuero = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: .75, metalness: 0 });
  let riendasObj = null;
  const cuerdas = [new Cuerda(16), new Cuerda(16), new Cuerda(14)];
  let dtFis = 0; // seconds of physics for this frame (set by A.tick; 0 when only re-posing)
  /** Secondary physics of this horse (tail, mane, neck collider): src/core/horse-secondary.js. */
  function fisicaCaballo() {
    if (!actor?.modelo || !actor.nativo) return null;
    if (actor.fisica === undefined) {
      try { actor.fisica = new FisicaCaballo(actor.modelo); } catch (e) { console.warn('[animales] física del caballo', e); actor.fisica = null; }
    }
    return actor.fisica;
  }
  /** Tail and mane follow the horse with inertia and air; the wind that the real travel does not produce
   * (gallop «en el sitio») comes from the clip's own speed. */
  const fisAnt = { pos: null, t: null };
  function pasoCaballo(dt) {
    const F = fisicaCaballo();
    if (!F) return;
    const pos = actor.root.getWorldPosition(new THREE.Vector3()), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const rep = actor.motion?.lastReport, viento = new THREE.Vector3();
    if (dt > 0 && fisAnt.pos && rep) {
      const ritmo = fisAnt.t === null ? 0 : (rep.time - fisAnt.t) / dt;
      const real = pos.clone().sub(fisAnt.pos).dot(fwd) / dt;
      const nominal = (actor.motion.speed || 0) * (ritmo > 0 && ritmo < 3 ? ritmo : 0);
      if (nominal > real) viento.addScaledVector(fwd, -(nominal - Math.max(0, real)));
    }
    fisAnt.pos = pos; fisAnt.t = rep?.time ?? null;
    F.paso(dt, { viento });
  }
  function anillasBocado() {
    if (actor.bocado !== undefined) return actor.bocado;
    let head = null; actor.modelo.traverse((o) => { if (!head && o.isBone && o.name === 'head') head = o; });
    if (!head) return (actor.bocado = null);
    // Rocinante's gold bit rings, located from the texture colour of the head
    // vertices (head-bone space, model units): ~5 cm rings, centre and the
    // lowest point of the bar, where the rein passes through.
    const rings = [1, -1].map((x) => ({ centre: new THREE.Vector3(.067 * x, -.157, .232), bar: new THREE.Vector3(.065 * x, -.181, .232), side: x }));
    return (actor.bocado = { head, rings });
  }
  function palma(lado) {
    const hand = riderRig().bone('hand' + lado);
    if (!hand) return null;
    const p = hand.getWorldPosition(new THREE.Vector3());
    const finger = hand.children.find((c) => c.isBone && /middle|mid/i.test(c.name)) || hand.children.find((c) => c.isBone);
    return finger ? p.lerp(finger.getWorldPosition(new THREE.Vector3()), .7) : p;
  }
  const tubo = (points, radius) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 6, false);
  function riendas(on) {
    if (!on || !actor?.motion || !conJinete) { if (riendasObj) riendasObj.visible = false; cuerdas.forEach((c) => (c.listo = false)); return; }
    const b = anillasBocado();
    // With rider physics the rein runs through each closed fist: in under the
    // little finger, out over the thumb; the bight hangs between the hands.
    const puños = fisica?.puños?.[0] && fisica.puños[1] ? fisica.puños : null;
    const manos = puños ? puños.map((p) => p.entrada) : [palma('L'), palma('R')];
    if (!b || !manos[0] || !manos[1]) { if (riendasObj) riendasObj.visible = false; return; }
    if (!riendasObj) { riendasObj = new THREE.Group(); riendasObj.name = 'riendas'; app.viewport.scene.add(riendasObj); }
    riendasObj.visible = true;
    // The rein goes through the ring under its bar and folds back over it.
    const F = fisicaCaballo(), col = F?.colisionador || null;
    col?.preparar();
    const anillas = b.rings.map((r) => b.head.localToWorld(r.bar.clone()));
    const lazos = b.rings.map((r) => [
      b.head.localToWorld(r.bar.clone().add(new THREE.Vector3(.014 * r.side, .006, .012))),
      b.head.localToWorld(r.bar.clone().add(new THREE.Vector3(.004 * r.side, -.008, .004))),
      b.head.localToWorld(r.bar.clone().add(new THREE.Vector3(-.006 * r.side, .002, -.006)))]);
    // Rein length set once: the reach at the first frame plus what it takes to go round the neck.
    actor.largoRienda ??= Math.max(anillas[0].distanceTo(manos[0]), anillas[1].distanceTo(manos[1])) * 1.07;
    const r = .005 * (actor.root.scale.x || 1);
    const tops = puños ? puños.map((p) => p.salida) : manos;
    actor.largoLazo ??= tops[0].distanceTo(tops[1]) + .34;
    // Physics: each rein is a rope (particles, gravity, air) pinned at the bit and at the fist that wraps round
    // the neck instead of going through it; the bight between the hands hangs and swings the same way.
    const izq = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize());
    const aire = F?.aire || null, opt = { colision: col, radio: r * 1.6, aire };
    const lejos = (c, a, z) => !c.listo || c.x[0].distanceTo(a) > .5 || c.x[c.n - 1].distanceTo(z) > .5;
    [0, 1].forEach((i) => {
      const c = cuerdas[i], a = anillas[i], z = manos[i];
      if (lejos(c, a, z)) { // start bowed outwards and down, outside the neck
        const m = a.clone().lerp(z, .5).addScaledVector(izq, .16 * b.rings[i].side); m.y -= .08;
        c.iniciar([a, m, z]);
      }
      c.paso(dtFis, a, z, actor.largoRienda, opt);
    });
    if (lejos(cuerdas[2], tops[0], tops[1])) {
      const m = tops[0].clone().lerp(tops[1], .5); m.y -= .25;
      cuerdas[2].iniciar([tops[0], m, tops[1]]);
    }
    cuerdas[2].paso(dtFis, tops[0], tops[1], actor.largoLazo, opt);
    const dentro = (i) => puños ? [puños[i].centro, puños[i].salida] : [];
    const rienda = (i) => tubo([...lazos[i], ...cuerdas[i].x.slice(1, -1), manos[i], ...dentro(i)], r);
    const geos = [rienda(0), rienda(1), tubo(cuerdas[2].x, r)];
    while (riendasObj.children.length < geos.length) { const m = new THREE.Mesh(new THREE.BufferGeometry(), cuero); m.castShadow = true; m.frustumCulled = false; riendasObj.add(m); }
    riendasObj.children.forEach((m, i) => { m.geometry.dispose(); m.geometry = geos[i]; });
  }

  /** Height of the seat point over one cycle of this horse clip (horse frame). */
  function seatCycle(seat) {
    const m=actor.motion;
    if(m.seatCycle)return m.seatCycle;
    const time=m.time,circle=m.radius,ys=[];
    for(let i=0;i<24;i++){
      m.evaluate(i*m.duration/24,{circle:0});actor.modelo.updateMatrixWorld(true);
      const local=actor.root.matrixWorld.clone().invert().multiply(seat.bone.matrixWorld).multiply(seat.restInv);
      ys.push(seat.rest.clone().applyMatrix4(local).y);
    }
    m.evaluate(time,{circle});actor.root.updateMatrixWorld(true);
    m.seatCycle={mean:ys.reduce((a,b)=>a+b,0)/ys.length,max:Math.max(...ys),min:Math.min(...ys)};
    return m.seatCycle;
  }

  /** Constant offset that puts the rider clip's average pelvis on the seat.
   * The pelvis height above the saddle is this rider's own: hips bone to the
   * lowest vertex that the hips bone mainly drives (the buttocks). */
  function calibrarJinete(seat) {
    const ch=app.viewport.charHolder,frame=app.engine.frame,c=app.library.get(enlace.id);
    const pos=ch.position.clone(),quat=ch.quaternion.clone(),scl=ch.scale.clone();
    ch.position.set(0,0,0);ch.quaternion.identity();ch.scale.set(1,1,1);ch.updateMatrixWorld(true);
    app.engine.mount=null;
    // Rider at its real height (registry alturaM), measured standing at rest.
    app.rig.resetToRest();app.rig.root.updateMatrixWorld(true);
    const real=alturaReal(app.charMeta),h=alturaMalla(ch),escala=real&&h>.05?real/h:1;
    const hipsBone=app.rig.bone('hips'),mean=new THREE.Vector3(),n=Math.max(1,Math.min(24,(c?.frames||1)));
    let sit=null;
    for(let k=0;k<n;k++) {
      app.engine.frame=n>1?k*((c.frames-1)/(n-1)):0;app.evaluate();
      const h=hipsBone.getWorldPosition(new THREE.Vector3());mean.add(h);
      if(k===0) {
        let low=Infinity;const vv=new THREE.Vector3();
        ch.traverse(o=>{
          if(!o.isSkinnedMesh||!o.visible)return;
          const ix=o.geometry.attributes.skinIndex,w=o.geometry.attributes.skinWeight,hi=o.skeleton.bones.indexOf(hipsBone);
          if(hi<0||!ix||!w)return;
          o.skeleton.update();
          for(let i=0;i<ix.count;i++){
            let wh=0;for(let j=0;j<4;j++)if(ix.getComponent(i,j)===hi)wh+=w.getComponent(i,j);
            if(wh<.5)continue;
            low=Math.min(low,o.getVertexPosition(i,vv).applyMatrix4(o.matrixWorld).y);
          }
        });
        if(Number.isFinite(low))sit=h.y-low;
      }
    }
    mean.divideScalar(n);
    if(!(sit>0&&sit<.4))sit=.1*app.rig.hipsHeight;
    app.engine.frame=frame;ch.position.copy(pos);ch.quaternion.copy(quat);ch.scale.copy(scl);ch.updateMatrixWorld(true);
    return {escala,sit,mean};
  }
  A.elegirModelo = async (id) => {
    editor = false;
    A.modelo=id;setPrefs('animalHorseModel',id);quitarActor();
    const esp=A.especies.find(e=>e.id===A.especie);
    escena=null;
    if(conJinete&&app.rig.humanoid)ocultar();
    trabajando++;
    try {
      if(esp)await cargarActor(esp);
      await reponerSeleccion();
    } finally { trabajando--; }
    if(!enlace&&!escena)revelar();
    guardarSesion();
    refresh();visibilidad();return A.estado();
  };
  /** Vuelve a poner la selección actual (favorito, clip solo del jinete o clip del caballo) tras cambiar de caballo o de jinete. */
  async function reponerSeleccion() {
    // «fav:<id>» en sel también es un favorito (la escena completa de la IA dejaba favorito: null).
    const fav = A.fav || (A.sel?.startsWith('fav:') ? A.sel.slice(4) : null);
    // Si la escena estaba en Base, se conserva el documento (con las claves del usuario) y sigue en Base.
    if (fav && FAVORITOS.some((f) => f.id === fav)) await A.favorito(fav, sesion.base ? { base: true, conservar: true } : {});
    else if (A.sel?.startsWith('fav:')) return;
    else if (A.sel?.startsWith('j:')) await reproducirJinete(A.sel.slice(2));
    else if (A.sel) await reproducir(A.sel);
  }
  A.configurar = async (a={}) => {
    if(a.modelo)await A.elegirModelo(a.modelo);
    if(a.circulo!==undefined){A.circulo=!!a.circulo;encuadrar();}
    if(a.jinete!==undefined){conJinete=!!a.jinete&&app.rig.humanoid;if(!conJinete){await soltarJinete();revelar();}}
    if(a.editar) { conJinete=false; await editar(a.clip || A.sel || 'H_Walk.FBX'); }
    else if(a.favorito)await A.favorito(a.favorito,{pausa:a.pausa});
    else if(a.clip)await reproducir(a.clip);
    if(editor) {
      if(a.tiempo!==undefined)app.setFrame(a.tiempo*app.engine.fps);
      if(a.pausa!==undefined)app.playing=!a.pausa;
      return A.estado();
    }
    // El reloj es el fotograma del motor (línea de tiempo de abajo): tiempo en segundos, pausa y velocidad se aplican ahí.
    if(a.tiempo!==undefined&&actor) {
      if(escena)app.setFrame(a.tiempo*app.engine.fps);
      else if(soloJinete){const c=app.library.get(soloJinete);if(c&&!c.lazy)app.setFrame(Math.min(a.tiempo*app.engine.fps,c.frames-1));}
      else if(enlace&&clipActual){const c=app.library.get(enlace.id);if(c&&!c.lazy)app.setFrame(THREE.MathUtils.clamp(a.tiempo/clipActual.duration,0,1)*(c.frames-1));actor.totalTime=a.tiempo;}
      else if(action){actor.totalTime=a.tiempo;action.time=a.tiempo%clipActual.duration;actor.mixer.update(0);}
    }
    if(a.pausa!==undefined){pausa=!!a.pausa;if(escena||enlace||soloJinete)app.playing=!a.pausa;else if(action)action.paused=pausa;refrescarBarra();}
    if(a.velocidad!==undefined){velocidad=a.velocidad;app.speed=a.velocidad;refrescarBarra();}
    guardarSesion();
    refresh();visibilidad();actualizarMovimiento();return A.estado();
  };
  // ---------- Escena montada: galope de un punto a otro, salto y desmonte ----------
  // Only existing clips: each step pairs a horse clip with its Rider_* clip.
  // Horse poses and rider poses crossfade; the horse travels along +Z with the
  // no-slip speed of cyclic gaits, or with the source root motion of one-shot
  // clips (jump, stop). Not saved in the document.
  const ESCENA = [
    { h: 'H_Gallop.FBX', r: 'Rider Gallop', dur: 3.6 },
    { h: 'H_Jump_Gallop.FBX', r: 'Rider Jump Gallop', una: true, raiz: true, salto: true },
    { h: 'H_Gallop.FBX', r: 'Rider Gallop', dur: 1.2 },
    { h: 'H_Canter.FBX', r: 'Rider Canter', dur: 2.0 },
    { h: 'H_Trot.FBX', r: 'Rider Trot', dur: 1.6 },
    { h: 'H_Walk.FBX', r: 'Rider Walk', dur: 2.1 },
    { h: 'H_Walk_End_L.fbx', r: 'Rider Walk', una: true, raiz: true },
    { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 1.0 },
    { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 3.0, desmonte: true },
    { h: 'H_Idle_01.FBX', r: null, dur: 1.4, depie: true },
  ];
  const FUNDIDO = 0.3;
  let escena = null;
  // Favoritos: escenas montadas que se reproducen por la línea de tiempo de abajo. «pasos» da copias nuevas (prepararEscena las modifica);
  // «ciclos» = ciclos enteros de la marcha del caballo, para que el bucle de «Galope» empalme sin salto.
  const GALOPE = { h: 'H_Gallop.FBX', r: 'Rider Gallop' };
  const FAVORITOS = [
    { id: 'galope', nombre: 'Galope', bucle: true, pasos: () => [{ ...GALOPE, ciclos: 4 }] },
    { id: 'salto', nombre: 'Salto', bucle: false, pasos: () => [
      { ...GALOPE, ciclos: 3 },
      { h: 'H_Jump_Gallop.FBX', r: 'Rider Jump Gallop', una: true, raiz: true, salto: true },
      { ...GALOPE, ciclos: 2 }] },
    { id: 'medio_galope', nombre: 'Medio galope', bucle: true, pasos: () => [{ h: 'H_Canter.FBX', r: 'Rider Canter', ciclos: 4 }] },
    { id: 'trote', nombre: 'Trote', bucle: true, pasos: () => [{ h: 'H_Trot.FBX', r: 'Rider Trot', ciclos: 4 }] },
    { id: 'paso', nombre: 'Paso', bucle: true, pasos: () => [{ h: 'H_Walk.FBX', r: 'Rider Walk', ciclos: 3 }] },
    { id: 'parada', nombre: 'Parada', bucle: false, pasos: () => [
      { h: 'H_Walk.FBX', r: 'Rider Walk', ciclos: 2 },
      { h: 'H_Walk_End_L.fbx', r: 'Rider Walk', una: true, raiz: true },
      { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 1.5 }] },
    { id: 'reposo', nombre: 'Reposo', bucle: true, pasos: () => [{ h: 'H_Idle_01.FBX', r: 'Rider Idle 01', ciclos: 2 }] },
    { id: 'desmonte', nombre: 'Desmonte', bucle: false, pasos: () => [
      { h: 'H_Walk.FBX', r: 'Rider Walk', ciclos: 2 },
      { h: 'H_Walk_End_L.fbx', r: 'Rider Walk', una: true, raiz: true },
      { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 1.0 },
      { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 3.0, desmonte: true },
      { h: 'H_Idle_01.FBX', r: null, dur: 1.4, depie: true }] },
    { id: 'completa', nombre: 'Galope, salto y desmonte', bucle: false, pasos: () => ESCENA.map((p) => ({ ...p })) },
    // Pack: las ocho una detrás de otra, cada una en su propia tira de la capa Base (sin fundir los clips del jinete).
    // Al pulsarlo va directo a Base, con el rig del jinete listo para editar.
    { id: 'pack', nombre: 'Pack: galope, salto, medio galope, trote, paso, parada, reposo y desmonte', sub: 'Pack (en la capa Base)', bucle: false, base: true, pasos: () => [
      { ...GALOPE, ciclos: 3, etiqueta: 'Galope' },
      { h: 'H_Jump_Gallop.FBX', r: 'Rider Jump Gallop', una: true, raiz: true, salto: true, etiqueta: 'Salto' },
      { h: 'H_Canter.FBX', r: 'Rider Canter', dur: 2.0, etiqueta: 'Medio galope' },
      { h: 'H_Trot.FBX', r: 'Rider Trot', dur: 1.6, etiqueta: 'Trote' },
      { h: 'H_Walk.FBX', r: 'Rider Walk', dur: 2.1, etiqueta: 'Paso' },
      { h: 'H_Walk_End_L.fbx', r: 'Rider Walk', una: true, raiz: true, etiqueta: 'Parada' },
      { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 1.5, etiqueta: 'Reposo' },
      { h: 'H_Idle_01.FBX', r: 'Rider Idle 01', dur: 3.0, desmonte: true, etiqueta: 'Desmonte' },
      { h: 'H_Idle_01.FBX', r: null, dur: 1.4, depie: true, etiqueta: 'Desmonte' }] },
  ];
  /** Favorito que corresponde a un clip del caballo (para editar al jinete en Base desde un clip suelto). */
  const favoritoDeClip = (f = '') => /jump/i.test(f) ? 'salto' : /walk_end|_end/i.test(f) ? 'parada' : /gallop|sprint/i.test(f) ? 'galope'
    : /canter/i.test(f) ? 'medio_galope' : /trot/i.test(f) ? 'trote' : /walk|amble/i.test(f) ? 'paso' : 'reposo';
  const nombrePaso = (p) => p.depie ? 'De pie' : p.desmonte ? 'Desmonte' : p.salto ? 'Salto' : /walk_end/i.test(p.h) ? 'Parada' : /gallop|sprint/i.test(p.h) ? 'Galope'
    : /canter/i.test(p.h) ? 'Medio galope' : /trot/i.test(p.h) ? 'Trote' : /walk|amble/i.test(p.h) ? 'Paso' : /idle/i.test(p.h) ? 'Reposo' : nombreClip(p.h);

  /** Documento temporal de la escena: una tira por paso (con su nombre en español) para que la línea de tiempo la recorra.
   * No se guarda (animalPreview); soltarJinete devuelve el documento anterior. La última tira lleva un fotograma más: el rango
   * [0, fin-1] dura exactamente el total de la escena, así el bucle del motor cae justo en el empalme. */
  function lineaEscena(E, { conservar = false } = {}) {
    const d = newDocument();
    if(preparingPair)d.fps=app.engine.fps;
    const fps=d.fps;
    let anterior = null;
    E.pasos.forEach((p, i) => {
      const id = p.c?.id ?? anterior;
      if (!id) return;
      anterior = id;
      const start = Math.round(p.t0 * fps), fin = i === E.pasos.length - 1 ? Math.round(E.total * fps) + 1 : Math.round((p.t0 + p.dur) * fps);
      const label = p.etiqueta || nombrePaso(p);
      // Pack: una tira por animación (Desmonte = bajar + quedar de pie, mismo clip): juntas en Base pero sin mezclarse (blend 0).
      const ultima = d.strips[d.strips.length - 1];
      if (p.etiqueta && ultima && ultima.label === label && ultima.clipId === id) { ultima.len = Math.max(1, fin - ultima.start); return; }
      d.strips.push({ id: uid('s'), clipId: id, start, len: Math.max(1, fin - start), blend: 0, speed: 1, loop: !!p.c?.loop && !p.una, inPlace: false, mirror: false, reverse: false, label });
    });
    // Recargar una escena que ya estaba en Base: el documento (con las claves del usuario) se queda como está;
    // solo se reponen los nombres de las tiras (el enlace de la URL no los guarda).
    const actual = app.engine.doc.strips;
    if (conservar && actual.length) {
      if (actual.length === d.strips.length) actual.forEach((s, i) => { if (!s.label && s.clipId === d.strips[i].clipId) s.label = d.strips[i].label; });
      app.timeline.fit();
      return;
    }
    d.rangeMode = 'auto';
    app.engine.doc = d;
    app.selStrip = d.strips[0]?.id;
    app.engine.frame = 0;
    app.changed(false);
    app.timeline.fit();
  }

  A.favorito = async (id, op = {}) => {
    const f = FAVORITOS.find((x) => x.id === id);
    if (!f) throw Error(`No existe el favorito «${id}».`);
    if (app.studioLink?.context() && app.mode === 'escena') return preparePair(f, op).catch(error => {
      app.toast(error.message, true);
      return null;
    });
    if (!app.rig.humanoid) { app.toast('Elige un personaje humano como jinete para reproducir este favorito.', true); return null; }
    trabajando++;
    ocultar();
    try {
      conJinete = true;
      estado = `Preparando «${f.nombre}»…`; pintarEstado();
      await especiesReady;
      escena = null; enlace = null; soloJinete = null;
      const base = op.base ?? !!f.base;
      await prepararEscena(f.pasos(), { conservar: base && !!op.conservar });
      A.sel = `fav:${f.id}`; A.fav = f.id;
      if (base) pasarABase();
      app.viewport.orbit.target.set(0, 1.1, 0); app.viewport.camera.position.set(5.5, 1.9, 1.5); app.viewport.orbit.update(); camPath.set(0, 0, 0);
      app.loopPlay = !!f.bucle; app.playDir = 1;
      app.engine.frame = op.frame ?? 0;
      app.playing = !op.pausa;
      tickEscena(0);
      revelar(); // la escena ya está colocada sobre la silla
      estado = 'listo';
      pintarSeleccion(); guardarSesion(); refresh();
      return { favorito: f.id, total: escena.total, fotogramas: app.engine.range()[1] };
    } catch (e) {
      estado = `Error: ${e.message}`;
      console.warn('[animales]', e);
      app.toast(e.message, true);
      revelar();
      return null;
    } finally { trabajando--; pintarEstado(); }
  };

  // ---------- Barra de la línea de tiempo ----------
  function alternarJinete(v) {
    if (v && !app.rig.humanoid) { app.toast('Elige un personaje humano para el jinete; Rocinante ocupa el lugar del caballo.'); refrescarBarra(); return; }
    conJinete = v;
    if (v) ocultar(); else soltarJinete();
    visibilidad();
    if (v && A.fav) A.favorito(A.fav);
    else if (v && A.sel?.startsWith('j:')) reproducirJinete(A.sel.slice(2));
    else if (v && A.sel) reproducir(A.sel);
    else revelar();
    guardarSesion(); refrescarBarra();
  }
  /** «Editar: Jinete | Caballo»: a quién pertenecen los puntos y círculos del rig (el jinete montado en Base o Rocinante en su editor). */
  function selectorEdicion() {
    const quien = pair ? (pair.active===pair.horse?'caballo':'jinete') : editor ? 'caballo' : escena?.editable ? 'jinete' : null;
    const nombreJinete = pair?.rider.meta.name || studioRider()?.name || (app.rig.humanoid ? app.charMeta.name : (app.characters.find((c) => c.id === (jineteEditor || sesion.jinete))?.name || 'Jinete'));
    const modelo = String(A.modelo || '');
    const nombreCaballo = editor ? app.charMeta.name
      : (caballosEstudio.find((c) => 'estudio:' + c.id === modelo)?.name || app.characters.find((c) => c.id === modelo)?.name || 'Caballo');
    const b = (id, txt, title) => h('button', { class: `btn sm ${quien === id ? 'on' : ''}`, title, 'aria-pressed': String(quien === id), onclick: async () => {
      if (quien === id) return;
      await A.pedirRig(id);
      refresh(); refrescarBarra();
    } }, txt);
    return h('div', { class: 'grp', role: 'group', 'aria-label': 'Personaje que se edita', style: { display: 'flex', gap: '4px', alignItems: 'center' } },
      h('span', { class: 'small muted' }, 'Editar:'),
      b('jinete', `🧍 ${nombreJinete}`, 'Los círculos y puntos del rig mueven al jinete montado (la escena pasa a la capa Base)'),
      b('caballo', `🐴 ${nombreCaballo}`, 'Los círculos y puntos del rig mueven al caballo en su editor de cuatro patas'));
  }
  A.selectorEdicion = selectorEdicion;
  /** Grupo para la barra de transporte de la línea de tiempo (solo con Animales abierto): lo demás (▶, fotograma, Bucle, velocidad) es de la barra. */
  A.barra = () => {
    if (pair) return selectorEdicion();
    if (!A.visible) return null;
    if (editor) return h('div', { class: 'grp', style: { gap: '10px', padding: '0 4px', borderLeft: '1px solid var(--line)' } }, selectorEdicion());
    const chk = (texto, titulo, valor, fn) => { const i = h('input', { type: 'checkbox' }); i.checked = valor; i.onchange = () => fn(i.checked); return h('label', { class: 'small', title: titulo, style: { display: 'flex', gap: '4px', alignItems: 'center' } }, i, texto); };
    return h('div', { class: 'grp', style: { gap: '10px', padding: '0 4px', borderLeft: '1px solid var(--line)' } },
      h('span', { class: 'small', title: 'Animal y selección actuales' }, `🐴 ${etiqueta(A.sel)}`),
      chk('En el sitio', 'Quita el avance horizontal de la raíz para que el caballo no se aleje', sitio, (v) => { sitio = v; reaplicar(); }),
      chk('Correr en círculo', 'Recorrer un círculo de 3 metros de radio con el caballo AutoRig Pro elegido', A.circulo, (v) => { A.circulo = v; encuadrar(); actualizarMovimiento(); }),
      chk('Con jinete', 'El personaje humano seleccionado monta el caballo', conJinete, alternarJinete),
      selectorEdicion());
  };

  const clipJinete = (nombre) => [...app.library.values()].find((c) => c.pack === PACK_JINETE && c.name === nombre);
  let riderFiles;
  async function loadRiderClip(name, id) {
    const known=await app.ensureClip(id || clipJinete(name)?.id);
    if(known)return known;
    riderFiles||=fetch('/api/biblioteca').then(async response=>{
      if(!response.ok)throw Error('No se pudo leer la biblioteca del jinete.');
      return (await response.json()).archivos.filter(item=>item.ruta.startsWith(RIDER_FOLDER+'/'));
    }).catch(error=>{riderFiles=null;throw error;});
    const file=await riderFiles.then(list=>list.find(item=>{
      const stem=item.ruta.split('/').at(-1).replace(/\.[^.]+$/,'');
      return id ? id===`lib:${slug(PACK_JINETE)}:${slug(stem)}` : name===prettyName(stem);
    }));
    if(!file)throw Error(`Falta el clip del jinete «${name || id}» en la biblioteca.`);
    const model=await loadModelURL(file.url,file.ruta),animation=model.animations.find(item=>item.tracks.length);
    if(!animation)throw Error('El archivo del jinete no contiene animación.');
    const stem=file.ruta.split('/').at(-1).replace(/\.[^.]+$/,'');
    const clip=clipFromAnimation(model.root,animation,{id:`lib:${slug(PACK_JINETE)}:${slug(stem)}`,
      name:prettyName(stem),source:'biblioteca',rig:new Rig(model.root),author:'Malbers'});
    Object.assign(clip,{pack:PACK_JINETE,ruta:file.ruta});
    app.library.set(clip.id,clip);
    return clip;
  }

  async function prepararEscena(pasos = ESCENA, { conservar = false } = {}) {
    const esp = A.especies.find((x) => x.id === A.especie);
    if (!esp) throw Error('Sin animal');
    if (!conJinete || !app.rig.humanoid) throw Error('Activa «Con jinete» con un personaje humano.');
    await prepararJinete();
    soloJinete = null;
    await cargarActor(esp);
    referencia ||= leerFbx(url(esp, 'modelo', esp.modelo || esp.modelos[0]));
    const ref = await referencia;
    actor.motion?.dispose();
    actor.root.position.set(0, 0, 0); actor.root.quaternion.identity(); actor.root.updateMatrixWorld(true);
    const motions = new Map();
    let ultima = null;
    for (const p of pasos) {
      if (!motions.has(p.h)) {
        const c = await clipDe(esp, p.h);
        ultima?.reset(); // each HorseMotion snapshots the model's current pose as rest
        const cyclic = !p.una && /amble|walk|trot|canter|gallop|sprint|idle/i.test(p.h);
        motions.set(p.h, (ultima = new HorseMotion(actor.modelo, clipRoots.get(c), ref, c, { cyclic, ground: true })));
      }
      p.m = motions.get(p.h);
      p.dur ??= p.ciclos ? p.ciclos * p.m.duration : (p.hasta ?? p.m.duration) - (p.desde ?? 0);
      if (p.r) {
        p.c = await loadRiderClip(p.r);
      }
    }
    // Shared measurements: seat at rest, then each motion's seat cycle.
    actor.motion = pasos[0].m;
    actor.asiento = undefined; const seat = asiento();
    if (!seat) throw Error('El caballo no tiene silla para el jinete.');
    for (const m of motions.values()) { actor.motion = m; seatCycle(seat); }
    actor.motion = pasos[0].m;
    const cal = new Map();
    for (const p of pasos) if (p.c && !cal.has(p.c.id)) cal.set(p.c.id, calibrarClip(seat, p.c, p.desde));
    alinearFases(pasos);
    let t = 0;
    for (const p of pasos) { p.t0 = t; t += p.dur; }
    soltarRiendas();
    const huesos = []; actor.modelo.traverse((o) => { if (o.isBone) huesos.push(o); });
    escena = { pasos, cal, seat, huesos, total: t, tiempo: 0, distancia: 0, ultimo: 0, pausa: false, bajada: null };
    ponerObstaculo(escena);
    lineaEscena(escena, { conservar });
    app.playing = false;
    enlace = null;
    pausa = true; if (action) action.paused = true;
    return escena;
  }

  function slotOf(info, root, engine = app.engine, undo = app.undoStack, redo = app.redoStack) {
    return { id:info.id, info, root, rig:engine.rig, meta:{ id:info.characterId, name:info.name },
      engine, undo, redo, strip:app.selStrip, lib:app.libSel };
  }

  function activateSlot(slot) {
    const previous = pair.active;
    const frame = app.engine.frame;
    app.playing = false;
    app.displayXform = null;
    app.engine = slot.engine;
    selectMountedEditor(pair,slot,frame,{strip:app.selStrip,lib:app.libSel});
    if (previous !== slot) for (const [object,material] of app.viewport.original) object.material=material;
    app.swapCharacter({ ...slot, doc:slot.engine.doc }, { reframe:false });
    if (previous !== slot) spare.add(previous.root);
    app.selStrip = slot.strip;
    app.libSel = slot.lib;
    app.engine.frame = frame;
    app.sceneLive?.selectPairRig();
    tickEscena(0, { follow:false });
    app.timeline.draw();
    visibilidad();
    app.panels.refreshDoc();
  }

  function releasePair() {
    const session = pair;
    pair = null;
    for (const slot of session?.slots || []) if (slot.engine) slot.engine.onEvaluated = null;
    for(const [object,material] of session.original.materials)object.material=material;
    app.engine = session.original.engine;
    app.swapCharacter({ ...session.original, doc:app.engine.doc }, { reframe:false });
    app.selStrip = session.original.strip;
    app.libSel = session.original.lib;
    spare.clear();
    holder.add(session.horse.root);
    app.sceneLive?.unbindPair();
    app.displayXform = null;
  }

  A.sceneAnchor = () => pair?.anchor?.rig || preparingAnchor;
  A.playbackRange = (range) => pair ? [range[0], Math.max(...pair.slots.map(slot => slot.engine.range()[1]))] : range;
  A.activePair = () => pair;
  A.invalidatePair = () => { if(pair)pair.needsPose = true; };
  A.riderEditPose = (bone, q, p) => {
    const rider = pair?.rider;
    const offset = rider?.rig===app.rig && rider.displayOffsets?.get(bone);
    if (!offset) return;
    if (q) q.premultiply(offset.displayQ.clone().invert()).premultiply(offset.sourceQ);
    if (p) p.add(offset.sourceP.clone().sub(offset.displayP));
  };
  A.releasePair = releasePair;
  A.mountedSignature = () => pair ? JSON.stringify(pair.slots.map(slot=>slot.engine.doc)) : null;
  /** Lo editado en la pareja (un documento por actor): el borrador del Taller para no perderlo si no se llega a guardar. */
  A.pairDraft = () => pair ? { favorite:pair.favorite, docs:Object.fromEntries(pair.slots.map(slot=>[slot.id,structuredClone(slot.engine.doc)])) } : null;

  A.bakeMounted = () => {
    const session=pair;
    if(!session?.sceneMatrix||session.slots.some(slot=>!slot.stageMatrix))throw Error('Activa Escenario para guardar la posición de ambos actores.');
    const fps=app.engine.fps, frames=Math.max(2,Math.round(A.playbackRange(app.engine.range())[1])+1);
    if(frames/fps>600)throw Error('La actuación supera la duración máxima de diez minutos.');
    const samplers=session.slots.map(slot=>mountedTracks(slot.rig,clone(slot.source),slot.stageMatrix,session.sceneMatrix,frames,fps));
    const frame=app.engine.frame,playing=app.playing;
    app.playing=false;
    const facial=slot=>slot.engine.doc.facialProject||{schema:'spanstories.facial-project',version:1,presets:[],instances:[],favorites:[]};
    try {
      escena.bajada=null;
      for(let i=0;i<frames;i++){
        app.engine.frame=i;
        tickEscena(0,{follow:false,effects:false});
        samplers.forEach(sampler=>sampler.sample());
      }
      return session.slots.map((slot,i)=>{
        const name=`${session.name} · ${slot.meta.name}`.slice(0,160);
        const animation=samplers[i].finish(name);
        const body=clipToJSON(bakeCanonical(slot.engine,{id:'behavior:'+uid(),name}));
        return {slot,name,animation,body,facial:facial(slot),
          mounted:{favorite:session.favorite,doc:structuredClone(slot.engine.doc)}};
      });
    } finally {
      app.engine.frame=frame;
      escena.bajada=null;
      tickEscena(0,{follow:false});
      app.playing=playing;
    }
  };

  async function preparePair(favorite, options = {}) {
    const context = app.studioLink?.context();
    const cast = castOf(context), horseInfo = horseIn(cast), riderInfo = riderIn(cast);
    if (!horseInfo || !riderInfo || ![horseInfo.id,riderInfo.id].includes(context?.actorId)) {
      throw Error(cast.some(a=>a?.montura)?'Este actor no forma pareja: en el Estudio, elige en el jinete «Va montado en» esta montura.':'Añade un caballo y su jinete como actores de esta escena desde Personajes del Estudio.');
    }
    if (preparingPair) return;
    if (pair) {
      app.toast('La actuación montada está abierta. Arrastra clips a Base para editarla.');
      return;
    }
    preparingPair = true;
    const original = slotOf({id:context.actorId,characterId:app.charMeta.id,name:app.charMeta.name}, app.rig.root);
    original.materials=new Map(app.viewport.original);
    preparingAnchor = original.rig;
    const frame = options.frame ?? app.engine.frame;
    try {
      await especiesReady;
      const esp = A.especies.find(item=>item.id===A.especie);
      if (!esp) throw Error('No se encontró la biblioteca de animaciones del caballo.');
      A.modelo = 'estudio:' + horseInfo.characterId;
      await cargarActor(esp);
      // La exportación a la historia necesita la jerarquía del GLB tal cual. El actor del caballo puede venir de la caché
      // con sus ramas ya reconectadas por el editor (prepareHorseHierarchy); clonarlo daba curvas locales de otra
      // jerarquía y en el Estudio el caballo salía retorcido. Se lee una copia limpia del mismo archivo.
      const horseUrl = caballosEstudio.find(c=>'estudio:'+c.id===A.modelo)?.url;
      const originalHorse = !actor.modelo.userData.horseEditorHierarchy ? clone(actor.modelo)
        : horseUrl ? (await loadModelURL(horseUrl,'caballo.glb')).root : null;
      if (!originalHorse) throw Error('No se pudo leer el modelo original del caballo.');
      const horseRig = new Rig(actor.modelo);
      const horseEngine = new Engine(horseRig,app.library);
      horseEngine.doc.fps = original.engine.fps;
      horseEngine.limitsOn = original.engine.limitsOn;
      actor.root.updateMatrixWorld(true);
      const horse = slotOf(horseInfo,actor.root,horseEngine,[],[]);
      horse.origin = actor.modelo.matrixWorld.clone();
      horse.source = originalHorse;

      const modelUrl = riderInfo.modelUrl ? '/ecosystem/model?url='+encodeURIComponent(riderInfo.modelUrl)
        : catalogo.find(item=>item.id===riderInfo.characterId)?.url;
      if(!modelUrl)throw Error(`No se encontró el modelo de ${riderInfo.name}.`);
      const riderModel = (await loadModelURL(modelUrl,'personaje.glb')).root;
      const riderSource = clone(riderModel);
      const riderEngineForPair = new Engine(original.rig,app.library);
      riderEngineForPair.doc.fps = original.engine.fps;
      riderEngineForPair.onMissingClip = original.engine.onMissingClip;
      riderEngineForPair.limitsOn = original.engine.limitsOn;
      // El rostro del jinete se evalúa con su propio documento (se ve al editar y se hornea al guardar la pareja).
      app.bindFace?.(riderEngineForPair);
      app.engine = riderEngineForPair;
      await app.setCharacterRoot(riderModel,{id:riderInfo.characterId,name:riderInfo.name},true,false,false);
      const riderGroup = new THREE.Group();
      const rider = slotOf(riderInfo,riderGroup,riderEngineForPair,[],[]);
      rider.source = riderSource;
      conJinete = true;
      previo = null;
      await prepararEscena(favorite.pasos());
      if (riderInfo.id===context.actorId && original.engine.doc.facialProject) {
        rider.engine.doc.facialProject=structuredClone(original.engine.doc.facialProject);
      }
      escena.editable=true;
      escena.bajada=null;
      const fps = horseEngine.fps, frames = Math.max(2,Math.round(escena.total*fps)+1);
      const native = Object.fromEntries(horseRig.bones.map(b=>[b.name,{q:[],p:[],s:[]}]));
      for(let i=0;i<frames;i++){
        poseCaballoEscena(escena,i/fps);
        for(const bone of horseRig.bones){
          const track=native[bone.name];
          track.q.push(...bone.quaternion.toArray());track.p.push(...bone.position.toArray());track.s.push(...bone.scale.toArray());
        }
      }
      const clip = makeClip({id:`monta:${horseInfo.characterId}:${favorite.id}`,name:`${horseInfo.name} · ${favorite.nombre}`,fps,frames,source:'propio',tracks:{}});
      Object.assign(clip,{native,character:horse.meta,animal:{editorVersion:3}});
      app.library.set(clip.id,clip);
      const strip = {id:uid('s'),clipId:clip.id,start:0,len:frames,blend:0,speed:1,loop:false,inPlace:false,mirror:false,reverse:false};
      horseEngine.doc.strips.push(strip);
      horse.strip = strip.id;horse.lib = clip.id;
      rider.strip = rider.engine.doc.strips[0]?.id;
      for(const slot of [horse,rider]){
        const mounted=options.documents?.get(slot.id);
        if(!mounted?.doc)continue;
        const clips=await Promise.all(mounted.doc.strips.map(({clipId})=>clipId.startsWith(`lib:${slug(PACK_JINETE)}:`)
          ? loadRiderClip(null,clipId) : app.ensureClip(clipId)));
        if(clips.some(item=>!item))throw Error('Falta un clip de la actuación montada de '+slot.meta.name);
        slot.engine.doc=mounted.doc;
        slot.strip=mounted.doc.strips[0]?.id;
      }
      app.viewport.charHolder.position.set(0,0,0);
      app.viewport.charHolder.quaternion.identity();
      app.viewport.charHolder.scale.setScalar(1);
      riderGroup.add(riderModel);
      app.viewport.charHolder.add(riderGroup);
      spare.add(actor.root);
      app.engine.frame = Math.max(0,Math.min(frame,frames-1));
      pair = {original,anchor:original,horse,rider,active:rider,slots:[horse,rider],favorite:favorite.id,name:favorite.nombre,poseVersion:0};
      // Cualquier evaluación del motor (pausar, seleccionar, paneles…) deja al jinete de pie en el espacio del motor.
      // Sin esto, el fotograma no cambiaba, no se volvía a sentar y los puntos quedaban bajo la silla mientras la
      // malla del escenario seguía sentada. tickEscena lo vuelve a poner en false después de sentar.
      for (const slot of pair.slots) slot.engine.onEvaluated = () => { if (pair) pair.needsPose = true; };
      await app.sceneLive?.bindPair(pair);
      previo=null;app.animalPreview=false;editor=false;
      A.sel = `fav:${favorite.id}`;A.fav = favorite.id;
      activateSlot(options.who==='caballo' || (!options.who&&context.actorId===horse.id) ? horse : rider);
      app.timeline.fit();
      revelar();refresh();refrescarBarra();
      return pair;
    } catch (error) {
      if (pair) releasePair();
      else {
        for(const [object,material] of original.materials)object.material=material;
        app.engine=original.engine;
        app.swapCharacter({...original,doc:original.engine.doc},{reframe:false});
        app.sceneLive?.selectPairRig();
      }
      previo=null;app.animalPreview=false;escena=null;
      quitarObstaculo();
      throw error;
    } finally {
      preparingPair=false;
      preparingAnchor=null;
    }
  }

  /** Devuelve false (no hay pareja que restaurar), true (último guardado) o 'draft' (con el borrador `draft` de la pareja). */
  A.restoreMounted = async (asset, { draft = null } = {}) => {
    const mounted=asset?.recipe?.mounted;
    if(!mounted?.doc)return false;
    const context=app.studioLink?.context();
    // Del contexto de la historia y no de studioCast(): al arrancar el Taller el modo aún puede no ser «escena».
    const cast=castOf(context),own=cast[0];
    const {horse:pairHorse,rider:pairRider}=pairIn(cast);
    const partner=own&&(pairHorse?.id===own.id?pairRider:pairRider?.id===own.id?pairHorse:null);
    const favorite=FAVORITOS.find(item=>item.id===mounted.favorite);
    if(!favorite||!partner?.behavior?.url)return false;
    // La revisión que la historia guardó para el compañero (si ya no está archivada, la última).
    const partnerUrl=new URL(partner.behavior.url);
    if(Number.isInteger(partner.behavior.revision)&&partner.behavior.revision>=0&&partnerUrl.pathname.startsWith('/ecosystem/assets/'))partnerUrl.searchParams.set('revision',String(partner.behavior.revision));
    let response=await fetch(partnerUrl,{cache:'no-store'});
    if(response.status===404&&partnerUrl.search)response=await fetch(partner.behavior.url,{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo recuperar la actuación del otro actor.');
    const other=await response.json();
    if(other.recipe?.mounted?.favorite!==mounted.favorite)return false;
    const documents=new Map([[context.actorId,mounted],[partner.id,other.recipe.mounted]]);
    // Borrador de la pareja: solo si es de esta misma pareja y trae un documento para cada actor.
    const useDraft=!!draft&&draft.favorite===mounted.favorite&&[...documents.keys()].every(id=>draft.docs?.[id]?.strips);
    if(useDraft)for(const [id,item] of documents)documents.set(id,{...item,doc:draft.docs[id]});
    await preparePair(favorite,{documents,frame:Math.max(0,((context.time??0)-(context.at??0))*mounted.doc.fps)});
    return useDraft?'draft':true;
  };

  /** Phase-matched transitions: a gait ends at the point of its cycle whose
   * legs (each hoof relative to its own shoulder/hip) best match the next
   * clip's start, measured at the middle of the crossfade. Otherwise the fade
   * blends opposite phases and the forelegs scissor with a flipped hoof (the
   * walk → stop transition did exactly that). */
  function alinearFases(pasos) {
    const rel = (f, j) => f[j][3].clone().sub(f[j][0]);
    for (let i = 0; i + 1 < pasos.length; i++) {
      const p = pasos[i], q = pasos[i + 1];
      if (p.m === q.m || p.una || /idle/i.test(p.h) || !p.m.fk || !q.m.fk) continue;
      const mid = FUNDIDO / 2, Dp = p.m.duration, Fp = p.m.frames;
      const q0 = q.m.fk[Math.min(q.m.frames, Math.round(((q.desde ?? 0) + mid) / q.m.duration * q.m.frames))];
      const shift = Math.round(mid / Dp * Fp);
      let best = 0, bd = Infinity;
      for (let k = 0; k < Fp; k++) {
        const f = p.m.fk[(k + shift) % Fp];
        let d = 0; for (let j = 0; j < 4; j++) d += rel(f, j).distanceToSquared(rel(q0, j));
        if (d < bd) { bd = d; best = k; }
      }
      const phi = best * Dp / Fp;
      p.dur = phi + Math.max(0, Math.round((p.dur - phi) / Dp)) * Dp;
      if (p.dur < 0.6) p.dur += Dp;
    }
  }

  /** A rustic log fence where the jump clears it: at the moment the four hooves
   * are highest, rail top at 70% of that clearance. Scene-only prop. */
  let obstaculo = null;
  function quitarObstaculo() { obstaculo?.removeFromParent(); obstaculo = null; }
  function ponerObstaculo(E) {
    quitarObstaculo();
    const j = E.pasos.find((p) => p.salto);
    if (!j) return;
    let best = null;
    for (let i = 10; i <= 40; i++) {
      const lt = i / 50 * j.m.duration, rep = j.m.evaluate(lt, { circle: 0 });
      const lo = Math.min(...rep.legs.map((l) => l.soleY));
      if (!best || lo > best.lo) best = { lo, lt };
    }
    // Distance travelled up to that moment (same integration as the scene).
    let z = 0;
    for (let s = 0; s < j.t0 + best.lt; s += 1 / 120) {
      const q = E.pasos[paso(s)], pr = E.pasos[paso(s) - 1], l = s - q.t0, f = pr && l < FUNDIDO ? smooth(l / FUNDIDO) : 1;
      z += (f < 1 ? velocidadPaso(pr, pr.dur + l) * (1 - f) + velocidadPaso(q, l) * f : velocidadPaso(q, l)) / 120;
    }
    const alto = Math.max(.35, best.lo * .7), madera = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: .9 });
    obstaculo = new THREE.Group(); obstaculo.name = 'obstaculo';
    for (const x of [-1, 1]) {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, alto + .2, 10), madera);
      poste.position.set(x, (alto + .2) / 2, 0); poste.castShadow = true; obstaculo.add(poste);
    }
    for (const y of [alto * .55, alto]) {
      const tronco = new THREE.Mesh(new THREE.CylinderGeometry(.07, .075, 2.2, 12), madera);
      tronco.rotation.z = Math.PI / 2; tronco.position.set(0, y, 0); tronco.castShadow = true; obstaculo.add(tronco);
    }
    obstaculo.position.set(0, 0, z + (actor.root.scale.x || 1) * .05);
    app.viewport.scene.add(obstaculo);
  }

  /** Pelvis mean, seat height and real scale for a rider clip sampled directly. */
  function calibrarClip(seat, clip, desde) {
    const ch = app.viewport.charHolder;
    ch.position.set(0, 0, 0); ch.quaternion.identity(); ch.scale.set(1, 1, 1); ch.updateMatrixWorld(true);
    app.rig.resetToRest(); app.rig.root.updateMatrixWorld(true);
    const real = alturaReal(app.charMeta), h = alturaMalla(ch), escala = real && h > .05 ? real / h : 1;
    const pose = newPose(), mean = new THREE.Vector3(), hb = app.rig.bone('hips');
    const n = 24, dur = clip.duration;
    for (let k = 0; k < n; k++) {
      sampleClip(clip, desde != null ? desde : k * dur / n, pose); app.rig.applyCanonical(pose); app.rig.root.updateMatrixWorld(true);
      mean.add(hb.getWorldPosition(new THREE.Vector3()));
    }
    mean.divideScalar(n);
    // Pelvis above the saddle: hips bone to the lowest vertex it mainly drives.
    sampleClip(clip, desde ?? 0, pose); app.rig.applyCanonical(pose); app.rig.root.updateMatrixWorld(true);
    let low = Infinity; const v = new THREE.Vector3();
    ch.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      const ix = o.geometry.attributes.skinIndex, w = o.geometry.attributes.skinWeight, hi = o.skeleton.bones.indexOf(hb);
      if (hi < 0 || !ix || !w) return;
      o.skeleton.update();
      for (let i = 0; i < ix.count; i += 2) {
        let wh = 0; for (let j = 0; j < 4; j++) if (ix.getComponent(i, j) === hi) wh += w.getComponent(i, j);
        if (wh >= .5) low = Math.min(low, o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld).y);
      }
    });
    let sit = hb.getWorldPosition(new THREE.Vector3()).y - low;
    if (!(sit > 0 && sit < .4)) sit = .1 * app.rig.hipsHeight;
    // Rest ankle height (for the dismount landing), in unscaled units.
    const ankle = Math.min(...['footL', 'footR'].map((c) => app.rig.restWorldPos?.[c]?.y ?? .08));
    return { escala, sit, mean, ankle };
  }

  function soltarRiendas() { actor && (actor.largoRienda = undefined); }

  const poseA = newPose(), poseB = newPose();
  function poseJinete(p, local, pose = poseA) {
    const t = (p.desde ?? 0) + Math.min(local, p.dur - 1e-4);
    sampleClip(p.c, p.c.loop && p.desde == null ? t % p.c.duration : Math.min(t, p.c.duration - 1e-4), pose);
    return pose;
  }
  function mezclarPoses(a, b, w) {
    for (const c in b.q) { if (a.q[c]) a.q[c].slerp(b.q[c], w); else a.q[c] = b.q[c].clone(); }
    a.hips.lerp(b.hips, w);
    return a;
  }
  const smooth = (x) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  function paso(t) {
    const P = escena.pasos;
    let i = P.findIndex((p) => t < p.t0 + p.dur);
    if (i < 0) i = P.length - 1;
    return i;
  }
  function evaluarCaballo(p, local) {
    p.m.evaluate(p.una ? Math.min(local, p.m.duration - 1e-4) : local, { circle: 0 });
  }
  function capturar(huesos) { return huesos.map((b) => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]); }
  /** Forward speed (m/s) of a step at its local time. */
  function velocidadPaso(p, local) {
    if (!p.raiz) return p.depie || /idle/i.test(p.h) ? 0 : p.m.speed;
    // Source root travel, smoothed: the jump's Root is keyed in steps.
    if (!p.avance) {
      // No-slip travel: while hooves are planted the body moves exactly as fast
      // as they slide back under it (the stop used the source root and the
      // planted forelegs skated forward). Lightly smoothed; scrubbing stays
      // deterministic.
      const m = p.m, N = 60, dt = m.duration / N, z = [], legs = [];
      for (let i = 0; i <= N; i++) {
        const tt = Math.min(i * dt, m.duration - 1e-4);
        m.sampleSource(tt); z.push(m.sn.get('Pelvis').getWorldPosition(new THREE.Vector3()).z * m.scale);
        legs.push(m.evaluate(tt, { circle: 0 }).legs.map((l) => ({ z: l.ankle[2], c: l.contact && l.soleY < 0.03 })));
      }
      // Grounded samples: median backward speed of the hooves that really touch
      // the ground. In the air there is no ground force, so the horizontal speed
      // carries over (momentum): it is interpolated between takeoff and landing.
      // Only with no grounded sample at all does the source root travel count.
      const v = z.slice(1).map((_, i) => {
        const pl = legs[i + 1].map((l, j) => (l.c && legs[i][j].c ? -(l.z - legs[i][j].z) / dt : null)).filter((x) => x !== null);
        pl.sort((a, b) => a - b);
        return pl.length ? Math.max(0, pl[Math.floor((pl.length - 1) / 2)]) : null;
      });
      const idx = v.map((x, i) => (x === null ? -1 : i)).filter((i) => i >= 0);
      // The jump clip's hind hooves slide forward during the crouch: a galloping
      // horse keeps most of its speed at takeoff, so no grounded sample of a
      // jump drops below 60 % of the clip's typical grounded speed.
      if (p.salto && idx.length) { const sorted = idx.map((i) => v[i]).sort((a, b) => a - b), floor = 0.6 * sorted[Math.floor(sorted.length / 2)]; for (const i of idx) v[i] = Math.max(v[i], floor); }
      if (!idx.length) { for (let i = 0; i < v.length; i++) v[i] = Math.max(0, (z[i + 1] - z[i]) / dt); }
      else for (let i = 0; i < v.length; i++) {
        if (v[i] !== null) continue;
        const a = [...idx].reverse().find((k) => k < i), b = idx.find((k) => k > i);
        v[i] = a === undefined ? v[b] : b === undefined ? v[a] : v[a] + (v[b] - v[a]) * (i - a) / (b - a);
      }
      p.avance = v.map((_, i) => { let s = 0, n = 0; for (let k = i - 4; k <= i + 4; k++) if (k >= 0 && k < v.length) { s += v[k]; n++; } return s / n; });
      m.evaluate(0, { circle: 0 });
    }
    const f = THREE.MathUtils.clamp(local / p.m.duration, 0, .9999) * p.avance.length;
    return p.avance[Math.floor(f)];
  }

  function poseCaballoEscena(E, time, { procedural = true } = {}) {
    E.tiempo = THREE.MathUtils.clamp(time, 0, E.total);
    const t = E.tiempo, i = paso(t), p = E.pasos[i], local = t - p.t0;
    const prev = E.pasos[i - 1], fundido = prev && local < FUNDIDO ? smooth(local / FUNDIDO) : 1;
    actor.root.position.set(0, 0, 0); actor.root.quaternion.identity(); actor.root.updateMatrixWorld(true);
    let pose = null;
    if (procedural && fundido < 1) { evaluarCaballo(prev, prev.dur + local); pose = capturar(E.huesos); }
    actor.motion = p.m;
    // Travel: integrate the blended forward speed (scrubbing back restarts it).
    if (t < E.ultimo) { E.distancia = 0; E.ultimo = 0; }
    for (let s = E.ultimo; s < t - 1e-6;) {
      const step = Math.min(1 / 120, t - s), j = paso(s), q = E.pasos[j], l = s - q.t0, pr = E.pasos[j - 1];
      const f = pr && l < FUNDIDO ? smooth(l / FUNDIDO) : 1;
      E.distancia += step * (f < 1 ? velocidadPaso(pr, pr.dur + l) * (1 - f) + velocidadPaso(q, l) * f : velocidadPaso(q, l));
      s += step;
    }
    E.ultimo = t;
    if (procedural) evaluarCaballo(p, local);
    if (pose) E.huesos.forEach((b, k) => { b.position.lerp(pose[k][0], 1 - fundido); b.quaternion.slerp(pose[k][1], 1 - fundido); });
    actor.root.position.set(0, 0, E.distancia); actor.root.updateMatrixWorld(true);
    return { i, p, local, prev, fundido };
  }

  function tickEscena(dt, { follow = true, effects = true } = {}) {
    const E = escena, frame = app.engine.frame, time = frame / app.engine.fps;
    const { i, p, local, prev, fundido } = poseCaballoEscena(E, time, { procedural: !pair });
    if (pair && (!app.dragging || app.rig !== pair.horse.rig)) {
      pair.horse.engine.evaluate(Math.min(frame, pair.horse.engine.range()[1]));
      actor.root.updateMatrixWorld(true);
    }
    const ch = riderHolder(), seat = E.seat, rig = riderRig(), engine = riderEngine();
    if (pair && app.dragging && app.rig === rig && !app.autoKey) {pair.poseVersion++;return;}
    ch.position.set(0, 0, 0); ch.quaternion.identity();
    const rp = p.c ? p : [...E.pasos.slice(0, i)].reverse().find((q) => q.c);
    const cal = E.cal.get(rp.c.id);
    ch.scale.setScalar(cal.escala); ch.updateMatrixWorld(true);
    if (E.editable) {
      // En Base manda el motor: las tiras del jinete y las claves del usuario (rig). Solo se vuelve a sentar sobre la silla.
      if (!app.dragging || pair) engine.evaluate(Math.min(frame, engine.range()[1]));
    } else {
      let rpose = copyPose(poseJinete(rp, p.c ? local : rp.dur));
      if (fundido < 1 && prev.c && p.c && prev.c !== p.c) rpose = mezclarPoses(copyPose(poseJinete(prev, prev.dur + local, poseB)), rpose, fundido);
      rig.applyCanonical(rpose);
    }
    rig.root.updateMatrixWorld(true);
    const rider=pair?.rider;
    const source=rider&&rider.rig===app.rig?capturar(rig.bones):null;
    if (p.desmonte || p.depie) bajar(E, p, rp, cal, local, time>E.total?Math.round(E.total*engine.fps):engine.frame);
    else {
      E.bajada = null;
      const montado = /idle/i.test(p.h) ? { vertical: 1, pelvis: .6, torso: .3 } : p.salto ? { vertical: 1, pelvis: .5, torso: .2 } : {};
      if(rider){
        const controls=new Set(engine.activeLayers().flatMap(layer=>Object.keys(layer.tracks)
          .filter(key=>/^[rt]:/.test(key)&&layer.tracks[key].length).map(key=>key.slice(2))));
        const sides=(names)=>new Set(['L','R'].filter(side=>names.some(name=>controls.has(rig.bone(name+side)?.name))));
        montado.fisica={editedLegs:sides(['upperLeg','lowerLeg','foot','toes']),editedArms:sides(['upperArm','lowerArm','hand'])};
      }
      sentar(cal, seat, effects ? montado : { ...montado, riendas:false });
    }
    if(source)rider.displayOffsets=new Map(rig.bones.map((bone,i)=>[bone,{
      sourceP:source[i][0],sourceQ:source[i][1],displayP:bone.position.clone(),displayQ:bone.quaternion.clone(),
    }]));
    app.engine.frame = frame;
    if(pair){pair.needsPose=false;pair.lastFrame=frame;pair.poseVersion++;}
    // Camera follows along the path, keeping the user's framing. Sobre el escenario vivo del Estudio no: la vista es la
    // misma que en el Estudio y solo la mueve el usuario (si no, al volver al Taller saltaba lo recorrido por el caballo).
    if (!follow || app.sceneLive?.on) { camPath.set(0, 0, E.distancia); return; }
    const delta = new THREE.Vector3(0, 0, E.distancia).sub(camPath);
    app.viewport.camera.position.add(delta); app.viewport.orbit.target.add(delta); app.viewport.orbit.update();
    camPath.set(0, 0, E.distancia);
  }

  /** Dismount on the left, procedural and measured on this horse
   * (src/core/rider-dismount.js): the HAP clip went through Rocinante. The base
   * pose blends the seated idle into the standing rest; IK does the rest. */
  function bajar(E, p, rp, cal, local, baseFrame = riderEngine().frame) {
    const rig = riderRig(), engine = riderEngine(), ch = riderHolder();
    let authored, unedited;
    if (E.editable) {
      authored = capturar(rig.bones);
      engine.evaluate(baseFrame, { stopAt: 0 });
      unedited = capturar(rig.bones);
    }
    const seat = E.seat, t = p.depie ? Desmonte.T : Math.min(local, Desmonte.T);
    const D = seat.bone.matrixWorld.clone().multiply(seat.restInv);
    if (!E.bajada) {
      // Seated anchor: the pose already applied, on the saddle with real contact.
      sentar(cal, seat, { vertical: 1, pelvis: .6, torso: .3, riendas: false, fisica: { brazos: 0, manos: 0 } });
      const P0 = rig.bone('hips').getWorldPosition(new THREE.Vector3()).applyMatrix4(D.clone().invert());
      if (!fisica || fisica.rig !== rig) fisica = new RiderPhysics(rig, ch);
      E.bajada = { des: new Desmonte({ rig, holder: ch, fisica, silla: seat.silla, seat, cuerpo: seat.cuerpo, P0 }) };
    }
    const reposo = app.library.get('gen_reposo');
    let base = E.editable ? rig.captureCanonical(newPose()) : copyPose(poseJinete(rp, p.c ? local : rp.dur));
    if (reposo?.tracks) {
      const w = smooth((t - 0.9) / 1.3);
      if (w > 0) { sampleClip(reposo, (t * 0.5) % reposo.duration, poseB); base = mezclarPoses(base, poseB, w); }
    }
    rig.applyCanonical(base); rig.root.updateMatrixWorld(true);
    const path = actor.root.getWorldQuaternion(new THREE.Quaternion());
    const M = new THREE.Matrix4().compose(actor.root.getWorldPosition(new THREE.Vector3()), path, new THREE.Vector3(1, 1, 1));
    E.bajada.des.aplicar(t, { D, M, path });
    if (authored) rig.bones.forEach((bone,i)=>{
      bone.position.add(authored[i][0].sub(unedited[i][0]));
      bone.quaternion.multiply(unedited[i][1].invert().multiply(authored[i][1]));
      bone.scale.multiply(authored[i][2].divide(unedited[i][2]));
    });
    rig.root.updateMatrixWorld(true);
    riendas(false);
    revelar();
  }

  /** La escena montada deja de ser vista previa: sus tiras quedan en la capa Base del documento (se guardan) y el jinete
   * se edita con su rig. El caballo sigue el mismo reloj y el jinete se vuelve a sentar sobre la silla en cada fotograma. */
  function pasarABase() {
    if (!escena) return false;
    if (!escena.editable) {
      escena.editable = true;
      previo = null; // al salir de Animales ya no se devuelve el documento anterior: la escena es el documento
      app.animalPreview = false;
      app.selStrip = app.engine.doc.strips[0]?.id;
      app.changed();
    }
    $('#timelineWrap')?.classList.remove('hidden'); app.panels.layout?.(); app.topmenu?.paintSides?.();
    visibilidad(); guardarSesion(); refresh();
    return true;
  }
  A.pasarABase = pasarABase;
  let jineteEditor = null, favEditor = null; // jinete y favorito que había antes de pasar a Rocinante al editor de cuatro patas
  let pidiendo = null;
  /** Rig pedido (menú Rig o Editar movimiento, herramienta Mover/Rotar/IK) con Animales abierto.
   * quien: 'jinete' → la escena va a Base y se ven los controles del jinete; 'caballo' → Rocinante en el editor de cuatro patas. */
  A.pedirRig = (quien) => {
    if (!pair && !A.visible) return Promise.resolve(false);
    if (pidiendo) return pidiendo;
    pidiendo = (async () => {
      if (pair) {
        const next=quien==='caballo'?pair.horse:quien==='jinete'?pair.rider:pair.active;
        if (next!==pair.active) activateSlot(next);
        return true;
      }
      if (quien && studioHorse() && studioRider()) {
        const favorite=FAVORITOS.find(item=>item.id===(A.fav||'reposo'));
        return !!(await preparePair(favorite,{who:quien}));
      }
      if (app.studioLink?.context() && app.sceneLive?.on) {
        const requestingOther=quien==='jinete'&&app.rig.kind==='quadruped'||quien==='caballo'&&app.rig.humanoid;
        if (requestingOther) app.toast('Añade el caballo y su jinete a la misma escena del Estudio.',true);
        return !requestingOther;
      }
      quien ||= editor || app.rig.kind === 'quadruped' || !app.rig.humanoid ? 'caballo' : 'jinete';
      if (quien === 'caballo') {
        if (editor) return true;
        if (app.rig.humanoid) jineteEditor = app.charMeta.id;
        favEditor = A.fav;
        const archivo = escena ? escena.pasos[paso(escena.tiempo)].h : A.sel && !A.sel.startsWith('fav:') && !A.sel.startsWith('j:') ? A.sel : 'H_Idle_01.FBX';
        await editar(archivo);
        app.panels.refreshRig?.(); app.panels.refreshMotion?.();
        return true;
      }
      if (editor) {
        // Volver del editor de Rocinante al jinete montado.
        const id = jineteEditor || sesion.jinete; // tras recargar, el jinete guardado en la sesión
        if (!id || !app.characters.some((c) => c.id === id)) { app.toast('Elige el jinete en «Jinete» (Biblioteca › Animales).', true); return false; }
        editor = false;
        await app.wearCharacter(id);
        conJinete = !!app.rig.humanoid;
      }
      if (!app.rig.humanoid) { app.toast('El jinete tiene que ser un personaje humano.', true); return false; }
      conJinete = true;
      if (escena?.editable) { visibilidad(); return true; }
      if (escena) pasarABase();
      else await A.favorito(A.fav || favEditor || favoritoDeClip(A.sel), { base: true, frame: 0, pausa: true });
      app.panels.refreshRig?.(); app.panels.refreshMotion?.();
      return true;
    })().catch((e) => { console.warn('[animales] rig', e); app.toast(e.message, true); return false; }).finally(() => { pidiendo = null; });
    return pidiendo;
  };
  A.enEditor = () => editor || !!pair&&pair.active===pair.horse;
  A.enBase = () => !!escena?.editable;
  A.escenaActual = () => escena; // inspección (IA y pruebas)
  A.fisicaCaballo = () => fisicaCaballo(); // inspección: cola, crin y colisionador del cuello
  A.escena = async (op = {}) => {
    if (op.parar) { escena = null; quitarObstaculo(); await soltarJinete(); refresh(); return null; }
    if (!escena || op.reiniciar) {
      await prepararEscena(); app.viewport.orbit.target.set(0, 1.1, 0); app.viewport.camera.position.set(5.5, 1.9, 1.5); app.viewport.orbit.update(); camPath.set(0, 0, 0);
      app.engine.frame = 0; app.playDir = 1; app.playing = op.pausa === undefined ? true : !op.pausa; A.sel = 'fav:completa'; A.fav = null;
    }
    // Tiempo, pausa y velocidad son los de la línea de tiempo: fotograma, ▶/❚❚ y velocidad del motor.
    if (op.tiempo !== undefined) app.setFrame(THREE.MathUtils.clamp(op.tiempo, 0, escena.total) * app.engine.fps);
    if (op.pausa !== undefined) app.playing = !op.pausa;
    if (op.velocidad !== undefined) app.speed = op.velocidad;
    refrescarBarra();
    tickEscena(0);
    if (pendiente) revelar();
    return { tiempo: escena.tiempo, total: escena.total, paso: escena.pasos[paso(escena.tiempo)].h, distancia: escena.distancia };
  };

  let ultimoGuardado = 0;
  A.tick = (dt) => {
    sync();
    if (preparingPair) return;
    if (editor) return;
    if ((!A.visible&&!pair) || !actor) return;
    if (pair) {
      spare.visible=holder.visible=!app.sceneLive?.on;
      if(!pair.needsPose&&pair.lastFrame===app.engine.frame&&!app.dragging)return;
    }
    dtFis = dt;
    try { tickFrame(dt); } finally { dtFis = 0; }
  };
  function tickFrame(dt) {
    if (escena) { tickEscena(dt); pasoCaballo(dt); if (pendiente) revelar(); guardarTiempo(); return; }
    if (soloJinete) { // el motor del Taller lleva al jinete; el caballo espera en reposo
      actor.mixer.update(dt);
      if (actor.motion && app.playing) actor.totalTime += dt * app.speed;
    } else if (enlace && action && clipActual) {
      // El reloj es el fotograma del motor (línea de tiempo): el caballo muestra el mismo instante (proporcional, por si las duraciones difieren).
      const c = app.library.get(enlace.id);
      if (c && !c.lazy && c.frames > 1) {
        const tH = THREE.MathUtils.clamp(app.engine.frame / (c.frames - 1), 0, 1) * clipActual.duration;
        action.paused = true; action.time = tH; actor.mixer.update(0);
        if (app.playing) actor.totalTime += dt * app.speed * (app.playDir || 1); else actor.totalTime = tH;
        if (!actor.motion) app.evaluate();
      }
    } else {
      actor.mixer.update(dt);
      if (actor.motion && action && !action.paused && !pausa) actor.totalTime += dt * velocidad;
    }
    actualizarMovimiento();
    pasoCaballo(dt);
    if (pendiente && enlace?.cal) revelar();
    guardarTiempo();
  }
  /** El instante de la línea de tiempo se guarda a lo sumo una vez por segundo. */
  function guardarTiempo() {
    if (app.studioLink?.context()) return;
    const ahora = performance.now();
    if (restaurando || pendiente || !(escena || enlace || soloJinete) || ahora - ultimoGuardado < 1000) return;
    ultimoGuardado = ahora;
    guardarSesion();
  }
  A.estado = () => ({ especie: A.especie, modelo:A.modelo, jinete:conJinete?app.charMeta.name:null, clip: A.sel, visible: A.visible, favorito: A.fav, pendiente, error:estado.startsWith('Error:')?estado:null, huesos: actor ? (() => { let n = 0; actor.root.traverse((o) => { if (o.isBone) n++; }); return n; })() : 0, tiempo: action?.time ?? null, movimiento:actor?.motion?.lastReport });
  A.play = reproducir;
  A.editar = editar;
  const especiesReady = cargarEspecies().then(refresh);
  A.restoreDocument = async () => {
    const strip = app.engine.doc.strips[0], clip = strip && app.library.get(strip.clipId);
    if (clip?.native && clip.character && clip.animal?.editorVersion >= 2) {
      const c = clip.character;
      if (app.rig.kind === 'quadruped' && app.charMeta.id === c.id) {
        editor = true; visibilidad(); return;
      }
      const model = c.kind === 'url' ? await loadModelURL(c.url, c.file) : await (async () => { const r=await db.get('characters',c.id); return loadModel(r.data,r.file); })();
      editor = true;
      if (!app.characters.some(x => x.id === c.id)) app.characters.push(c);
      await app.setCharacterRoot(model.root, c);
      app.selStrip = strip.id; app.libSel = clip.id;
      $('#timelineWrap').classList.remove('hidden'); app.panels.layout?.(); app.topmenu?.paintSides();
      visibilidad();
    } else if (strip && (/^mio:rocinante_/i.test(strip.clipId) || clip?.animal)) {
      await especiesReady;
      const horse = studioHorse();
      A.modelo = 'estudio:' + (horse?.characterId || caballosEstudio[0]?.id || 'rocinante');
      await editar(clip?.animal?.archivo || (/galope|gallop/i.test(clip?.name || strip.clipId) ? 'H_Gallop.FBX' : 'H_Walk.FBX'), {keepDoc:true});
    }
  };
  /** Tras recargar la página: vuelve a abrir Biblioteca › Animales con el mismo caballo, jinete y selección (clip, clip del jinete o favorito)
   * y el mismo instante. El jinete queda oculto (pendiente) hasta que se coloca sobre el caballo. */
  A.restaurar = async () => {
    let logrado = false;
    const S = prefs('animalSesion', null);
    if (!S?.activo) { revelar(); return; }
    restaurando = true; trabajando++;
    ocultar();
    try {
      await especiesReady;
      apartarFlotantes();
      for (let i = 0; i < 300 && !jinetes().length; i++) await new Promise((r) => setTimeout(r, 200)); // la biblioteca se lee en segundo plano
      if (editor) return; // el documento es el del caballo en el editor: lo restaura restoreDocument
      if (S.especie && A.especies.some((e) => e.id === S.especie)) A.especie = S.especie;
      const ok = (id) => id === 'predeterminado' || (id === 'seleccionado' && (selectedHorse || isARPHorse(app.rig.root))) || (String(id).startsWith('estudio:') && caballosEstudio.some((c) => 'estudio:' + c.id === id)) || app.characters.some((c) => c.id === id);
      A.modelo = ok(S.modelo) ? S.modelo : (caballosEstudio[0] ? 'estudio:' + caballosEstudio[0].id : 'predeterminado');
      conJinete = !!S.conJinete && !!app.rig.humanoid;
      app.panels.openRight('biblioteca'); app.panels.openLib('animales');
      refresh();
      await sync(); await A.syncP;
      if (conJinete) {
        const fav = S.favorito || (S.sel?.startsWith('fav:') ? S.sel.slice(4) : null);
        if (fav && FAVORITOS.some((f) => f.id === fav)) await A.favorito(fav, { frame: S.tiempo || 0, pausa: !S.reproduciendo, ...(S.base ? { base: true, conservar: true } : {}) });
        else if (S.sel?.startsWith('fav:')) { /* favorito que ya no existe: se queda montado en reposo */ }
        else if (S.sel?.startsWith('j:')) await reproducirJinete(S.sel.slice(2));
        else if (S.sel) await reproducir(S.sel);
        if (escena || enlace || soloJinete) {
          if (Number.isFinite(S.tiempo)) app.setFrame(S.tiempo);
          app.playing = !!S.reproduciendo;
        }
      } else if (S.sel && !S.sel.startsWith('j:') && !S.sel.startsWith('fav:')) A.sel = S.sel;
      logrado = !conJinete || !!(escena || enlace || soloJinete);
    } catch (e) {
      estado = `Error: ${e.message}`;
      console.warn('[animales] restaurar', e);
    } finally {
      restaurando = false; trabajando--;
      revelar();
      if (logrado) guardarSesion(); // si no se pudo reponer la selección, se conserva la guardada
      refresh(); refrescarBarra();
    }
  };
  return A;
}
