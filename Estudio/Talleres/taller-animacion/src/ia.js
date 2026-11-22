// API para IA (Claude, Codex…): comandos de alto nivel con argumentos JSON.
// Se usan desde fuera con:  node herramientas/ia.mjs <comando> '{"arg":1}'
// o por HTTP:              POST http://127.0.0.1:5189/api/ia  {"cmd":"estado","args":{}}
// La app tiene que estar abierta en un navegador (el servidor reenvía el comando a la página).
import * as THREE from 'three';
import { CANON_IDS, canonLabel, IK_CHAINS, GROUPS } from './core/humanoid.js';
import { horseControlPoints } from './core/horse-editor.js';
import { anatomicalSystem, ANATOMICAL_MODES } from './core/anatomical-constraints.js';
import { newLayer, uid, INTERPS } from './core/animation.js';
import { processClip, STYLES, DIRECTIONS } from './core/motionlab.js';
import { sampleClip, newPose, clipToJSON } from './core/clip.js';
import { slug } from './ui/dom.js';
import { PROPS, SCENERY } from './ui/stage.js';
import { animationProfile, animationProfiles } from './core/library-profile.js';
import { webcamCommand } from '../facial/FaceWebcamCommands.mjs';
import { createTempIK, createTempWorld, bakeTemp, cancelTemp } from './core/edit/temp.js';
import { bakeBones } from './core/edit/bake.js';
import { movePathPointSoft } from './core/edit/motionpath.js';
import { prepareBlend } from './core/edit/inbetween.js';
import { copyWorld, copyRelative, pasteMatrix } from './core/edit/matrix.js';
import { offsetCascade, shareKeys, snapshotTracks, tracksOfBone, multikeyScale, multikeyRandom } from './core/edit/keyops.js';
import { pivotWorld, captureTargets, rotateAroundPivot } from './core/edit/pivot.js';
import { addMarker, removeMarker, retimeMarker } from './core/edit/retime.js';

const D2R = Math.PI / 180;

export function installIA(app) {
  const eng = () => app.engine;
  const rig = () => app.rig;

  /** Hueso por nombre canónico (upperArmL…) o real (upperarm_l / mixamorigLeftArm). */
  function boneOf(name) {
    if (!name) throw new Error('Falta el hueso');
    const r = rig();
    const b = r.bone(name) || r.byName.get(name) || [...r.byName.values()].find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    if (!b) throw new Error(`No existe el hueso «${name}». Usa un canónico (${CANON_IDS.slice(0, 12).join(', ')}…) o uno de 'huesos'.`);
    return b;
  }
  const frameOf = (a) => (a.f ?? a.fotograma ?? Math.round(eng().frame));
  const layerSel = (a) => {
    if (a.capa) {
      const l = eng().doc.layers.find((x) => x.id === a.capa || x.name === a.capa);
      if (!l) throw new Error(`No existe la capa ${a.capa}`);
      eng().doc.activeLayer = l.id;
    }
    return eng().layer();
  };
  const clipInfo = (c) => ({ id: c.id, nombre: c.name, perfil: animationProfile(c), perfiles: animationProfiles(c), libreria: c.mine ? (c.pack === 'Mixamo' ? 'Mixamo' : 'Tuyas') : c.source === 'generado' ? 'Generados' : c.pack, categorias: (c.tags || []).filter((t) => !/^(UAL|Humane|Fútbol|Mixamo|tuyas)/.test(t)), segundos: +c.duration.toFixed(3), fotogramas: c.frames, bucle: !!c.loop, avanza_m: +(c.travel * (rig()?.hipsHeight || 1)).toFixed(2) });

  const C = {
    animales: {
      d: 'Caballo nativo o AutoRig Pro: elegir modelo, clip FBX, jinete seleccionado y prueba en círculo. Estado incluye contacto medido de los cascos.',
      a: { modelo:'seleccionado | predeterminado | id de personaje', clip:'H_Gallop.FBX', circulo:false, jinete:false, editar:false, tiempo:0, pausa:false, velocidad:1, abrir:true },
      fn: async a => {
        if (!app.animales) throw Error('El módulo de animales no está listo.');
        if (a.abrir !== false) { app.panels.openRight('biblioteca');app.panels.openLib('animales');await app.animales.abrir(); }
        if (!Object.keys(a).length) return app.animales.estado();
        return app.animales.configurar(a);
      },
    },
    soltarAnimal: {
      d: 'Lo mismo que arrastrar una tarjeta de Biblioteca › Animales a la tira Base. «fav:<id>» (escena con jinete: reposo, paso, desmonte…) la ejecutan juntos el caballo y su jinete.',
      a: { archivo: 'fav:desmonte | H_Walk.FBX | j:<clip del jinete>', f: 0 },
      fn: async a => {
        if (!app.animales) throw Error('El módulo de animales no está listo.');
        await app.animales.insertClip(JSON.stringify({ file: a.archivo, species: app.animales.estado().especie }), Math.max(0, Math.round(a.f || 0)));
        return { animales: app.animales.estado(), tiras: app.engine.doc.strips.map(s => ({ clip: s.clipId, inicio: s.start, duracion: s.len, nombre: s.label || null })) };
      },
    },
    webcam: {
      d: 'Webcam MediaPipe del Taller facial: estado, iniciar o detener una sesión concreta.',
      a: {accion:'estado | iniciar | detener',sesion:'workshopSession de la URL del Taller facial'},
      fn: webcamCommand,
    },
    comportamiento: {
      d: 'Biblioteca de comportamientos: estado, elegir, cuerpo, rostro, guardar.',
      a: {accion:'estado | auditar | abrir | elegir | cuerpo | rostro | canal | intensidadCorporal | editarRostro | guardar | usarHistoria',id:'identificador',url:'URL de una variante guardada',canal:'nombre ARKit/FACEIT',valor:'peso 0..1'},
      fn: async a=>{if(!app.behaviors)throw Error('La biblioteca de comportamientos aún no está lista.');const b=app.behaviors;switch(a.accion){case 'auditar':return b.audit();case 'abrir':await b.loadAsset(a.url);break;case 'elegir':await b.choose(a.id);break;case 'cuerpo':b.setBody(a.id);break;case 'rostro':b.setFace(a.id);break;case 'canal':b.setChannel(a.canal,a.valor);break;case 'intensidadCorporal':b.setBodyIntensity(a.valor);break;case 'editarRostro':await b.editFace();break;case 'guardar':return b.save(false);case 'usarHistoria':return b.save(true);case undefined:case 'estado':break;default:throw Error('Acción desconocida');}return b.state();},
    },
    ayuda: {
      d: 'Lista de comandos con sus argumentos.',
      fn: () => Object.fromEntries(Object.entries(C).map(([k, v]) => [k, { descripcion: v.d, args: v.a || {} }])),
    },
    estado: {
      d: 'Resumen de todo: personaje, tiras, capas, IK, rango, fotograma, selección y librerías.',
      fn: () => {
        const e = eng();
        const libs = {};
        for (const c of app.library.values()) {
          const l = clipInfo(c).libreria;
          libs[l] = (libs[l] || 0) + 1;
        }
        return {
          personaje: { id: app.charMeta.id, nombre: app.charMeta.name, convencion: rig().convention, huesos: rig().bones.length, mapeados: Object.keys(rig().mapping).length, altura_cadera_m: +rig().hipsHeight.toFixed(3) },
          fotograma: Math.round(e.frame), rango: e.range(), fps: e.fps, reproduciendo: app.playing,
          tiras: e.doc.strips.map((s, i) => ({ indice: i, id: s.id, clip: s.clipId, nombre: app.library.get(s.clipId)?.name, inicio: s.start, duracion: s.len, fundido: s.blend, velocidad: s.speed, bucle: s.loop, en_sitio: s.inPlace, espejo: s.mirror, al_reves: s.reverse })),
          capas: e.doc.layers.map((l) => ({ id: l.id, nombre: l.name, modo: l.mode === 'add' ? 'aditiva' : 'sustituye', peso: l.weight, silencio: l.mute, solo: l.solo, bloqueada: l.lock, mascara: l.mask, pistas: Object.keys(l.tracks).length, claves: Object.values(l.tracks).reduce((a, k) => a + k.length, 0), activa: l.id === e.doc.activeLayer })),
          ik: e.doc.ik, ajustes: e.doc.adjust,
          seleccion: app.selectedBones().map((b) => b.name),
          librerias: libs,
          objetos: app.stage.props.map((p) => ({ id: p.id, mano: p.hand })),
          escenario: app.stage.pieces.map((p) => p.id),
        };
      },
    },
    librerias: {
      d: 'Librerías (packs) con número de clips y categorías.',
      fn: () => {
        const out = {};
        for (const c of app.library.values()) {
          const i = clipInfo(c);
          const L = (out[i.libreria] ||= { clips: 0, categorias: {} });
          L.clips++;
          for (const t of i.categorias) L.categorias[t] = (L.categorias[t] || 0) + 1;
        }
        return out;
      },
    },
    biblioteca: {
      d: 'Busca clips. Sin argumentos lista todos (resumidos).',
      a: { libreria: 'UAL 1 | UAL 2 | Mixamo | Humane | Fútbol (mocap) | Generados | Tuyas', perfil: 'male | female | unspecified (según maniquí/carpeta de origen)', categoria: 'locomoción…', buscar: 'texto', limite: 200 },
      fn: (a) => {
        const q = (a.buscar || '').toLowerCase();
        return [...app.library.values()].map(clipInfo).filter((c) => (!a.libreria || c.libreria === a.libreria) && (!a.perfil || c.perfiles.includes(a.perfil)) && (!a.categoria || c.categorias.includes(a.categoria)) && (!q || c.nombre.toLowerCase().includes(q) || c.id.includes(q))).slice(0, a.limite || 200);
      },
    },
    mixamo: {
      d: 'Estado de las descargas de Mixamo (biblioteca/mixamo): cuántas, fallos y si hay una tanda en marcha. Las descargas las lanza el usuario desde mixamo.com con el marcador «Taller ← Mixamo».',
      fn: async () => {
        const e = await (await fetch('/api/mixamo/estado')).json();
        return { descargadas: e.nHechos, enMarcha: e.enMarcha, fallos: e.fallos.slice(0, 50), carpeta: e.carpeta };
      },
    },
    texto: {
      d: 'Texto → animación con Kimodo local: genera, la guarda en la librería Kimodo y la aplica al personaje puesto. Texto en inglés. Tarda 2–4 min en CPU: manda timeout: 600.',
      a: { texto: 'a person jumps', segundos: 4, segmentos: '[{texto, segundos}] (alternativa a texto)', pasos: 50, semilla: 'opcional', nombre: 'opcional' },
      fn: async (a) => {
        const post = (acc, b) => fetch(`/api/kimodo/${acc}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
        const r = await post('generar', a);
        if (!r.ok) throw new Error(r.error);
        let j;
        do {
          await new Promise((res) => setTimeout(res, 2000));
          j = await (await fetch(`/api/kimodo/trabajo?id=${r.id}`)).json();
        } while (!['listo', 'error'].includes(j.estado));
        if (j.estado === 'error') throw new Error(j.error);
        const id = `lib:kimodo:${slug(j.archivo.replace(/\.glb$/i, ''))}`;
        for (let i = 0; i < 40 && !app.library.has(id); i++) {
          if (i % 5 === 0) app.scanLibrary();
          await new Promise((res) => setTimeout(res, 1000));
        }
        if (!app.library.has(id)) throw new Error(`generada (${j.archivo}) pero no aparece en la librería`);
        app.useClip(id);
        return { clip: id, archivo: j.archivo, fotogramas: j.fotogramas, semilla: j.semilla, segundos_calculo: j.segundos_calculo, personaje: app.charMeta.name };
      },
    },
    textoGuardar: {
      d: 'Guarda una animación de Kimodo (por defecto la última generada) en la librería «Kimodo guardadas». Sin archivo, la última; nombre opcional.',
      a: { archivo: 'a person jumps happily.glb (opcional)', nombre: 'Salto alegre (opcional)' },
      fn: async (a) => {
        const lista = (await (await fetch('/api/kimodo/lista')).json()).animaciones || [];
        const borr = lista.filter((x) => !x.archivo.startsWith('guardadas/'));
        const archivo = a.archivo || borr[borr.length - 1]?.archivo;
        if (!archivo) throw new Error('No hay borradores de Kimodo que guardar');
        const r = await (await fetch('/api/kimodo/guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivo, nombre: a.nombre }) })).json();
        if (!r.ok) throw new Error(r.error);
        const viejo = `lib:kimodo:${slug(archivo.replace(/\.glb$/i, ''))}`;
        const nuevo = `lib:kimodo_guardadas:${slug(r.nombre)}`;
        const enUso = app.engine.doc.strips.some((s) => s.clipId === viejo);
        app.library.delete(viejo);
        for (let i = 0; i < 40 && !app.library.has(nuevo); i++) {
          if (i % 5 === 0) app.scanLibrary();
          await new Promise((res) => setTimeout(res, 1000));
        }
        if (enUso && app.library.has(nuevo)) app.useClip(nuevo);
        app.texto?.refrescar();
        return { guardada: r.archivo, clip: nuevo };
      },
    },
    personajes: { d: 'Personajes disponibles.', fn: () => app.characters.map((c) => ({ id: c.id, nombre: c.name, origen: c.kind, puesto: c.id === app.charMeta.id })) },
    ponerPersonaje: {
      d: 'Cambia de personaje (id o parte del nombre).',
      a: { id: 'id o nombre' },
      fn: async (a) => {
        const c = app.characters.find((x) => x.id === a.id) || app.characters.find((x) => x.name.toLowerCase().includes(String(a.id || a.nombre).toLowerCase()));
        if (!c) throw new Error('No encuentro ese personaje');
        await app.wearCharacter(c.id);
        return { puesto: c.name, convencion: rig().convention, mapeados: Object.keys(rig().mapping).length };
      },
    },
    huesos: {
      d: 'Huesos del personaje: canónico → real (y los no mapeados si todos=true).',
      a: { todos: false },
      fn: (a) => ({ mapeo: Object.fromEntries(Object.entries(rig().mapping).map(([c, n]) => [c, { real: n, nombre: rig().kind === 'quadruped' ? horseControlPoints(rig()).find(p => p.bone.name === n)?.label || canonLabel(c) : canonLabel(c) }])), otros: a.todos ? rig().bones.filter((b) => !rig().canonOf.has(b)).map((b) => b.name) : undefined }),
    },
    controles: {
      d: 'Puntos de control visibles: nombre anatómico, hueso, posición de mundo y pivote. En caballos incluye caderas, rodillas, corvejones y cascos.',
      a: { estilo: 'opcional: puntos | aros' },
      fn: (a) => {
        const vp = app.viewport;
        if (a.estilo) {
          if (!['puntos', 'aros'].includes(a.estilo)) throw new Error('Estilo: puntos | aros');
          vp.setControlStyle(a.estilo);
        }
        eng().evaluate(eng().frame); vp.updateHandles();
        return { estilo: vp.ctlStyle, puntos: vp.handleList.filter(m => m.userData.kind === 'bone').map(m => ({
          id: m.userData.canon, nombre: m.userData.label || canonLabel(m.userData.canon), hueso: m.userData.bone.name,
          tipo:'articulacion', visible: m.visible, posicion: m.position.toArray(), pivote: m.userData.bone.getWorldPosition(new THREE.Vector3()).toArray(),
          origenARP:m.userData.bone.userData?.blenderBoneName || m.userData.bone.name,
        })), auxiliares:vp.handleList.filter(m=>['ik','pole'].includes(m.userData.kind)).map(m=>({
          tipo:m.userData.kind==='pole'?'polo_auxiliar':'objetivo_ik',cadena:m.userData.chain,
          visible:m.visible,posicion:m.position.toArray(),
          articulacionResuelta:eng().ikState[m.userData.chain]?.solved?.toArray(),
          errorMetros:eng().ikState[m.userData.chain]?.error || 0,
        })) };
      },
    },
    anatomia: {
      d:'Perfil anatómico compartido por IK/FK: modo anatomico | estilizado | libre, articulaciones, ejes, calibración y limitaciones.',
      a:{modo:null},
      fn:a=>{
        const system=anatomicalSystem(rig());
        if(!system) return {especie:'humano',activo:false};
        if(a.modo) {
          if(!ANATOMICAL_MODES.includes(a.modo))throw Error('Modo: anatomico | estilizado | libre');
          app.pushUndo();eng().doc.anatomyMode=a.modo;app.changed();
        }
        eng().evaluate(eng().frame);return system.report();
      },
    },
    usarClip: {
      d: 'Pone un clip solo en escena (sustituye las tiras).',
      a: { id: 'id del clip (ver biblioteca)' },
      fn: (a) => {
        if (!app.library.has(a.id)) throw new Error('No existe el clip ' + a.id);
        app.useClip(a.id);
        return { tiras: eng().doc.strips.length, rango: eng().range() };
      },
    },
    anadirTira: {
      d: 'Encadena un clip en la base (al final o en un fotograma).',
      a: { id: 'clip', inicio: 'fotograma (opcional)', fundido: 6, velocidad: 1, bucle: false, en_sitio: true, espejo: false },
      fn: (a) => {
        const fin = app.addStrip(a.id, a.inicio ?? null);
        if (fin === null) throw new Error('No existe el clip ' + a.id);
        const s = eng().doc.strips[eng().doc.strips.length - 1];
        Object.assign(s, pickStrip(a));
        app.changed();
        return { tira: s.id, fin };
      },
    },
    editarTira: {
      d: 'Cambia una tira (por índice o id).',
      a: { tira: 'índice o id', inicio: 0, duracion: 0, fundido: 0, velocidad: 1, bucle: true, en_sitio: true, espejo: false, al_reves: false, silencio: false },
      fn: (a) => {
        const s = stripOf(a.tira);
        app.pushUndo();
        Object.assign(s, pickStrip(a));
        app.changed();
        return s;
      },
    },
    alinearTira: {
      d: 'Dirección de movimiento (Motion Direction Control de iClone): alinea la raíz de una tira con el clip anterior o el siguiente, o fija a mano su giro y desplazamiento. accion: alinear | revertir | fijar.',
      a: { tira: 'índice o id', accion: 'alinear|revertir|fijar', con: 'anterior|siguiente', trasladar: true, rotar: true, x: 'm', y: 'm', z: 'm', giro: 'grados' },
      fn: (a) => {
        const s = stripOf(a.tira);
        app.pushUndo();
        let r;
        if (a.accion === 'revertir') r = app.engine.revertStripAlign(s.id);
        else if (a.accion === 'fijar') r = s.root = { x: +a.x || 0, y: +a.y || 0, z: +a.z || 0, yaw: +a.giro || 0 };
        else {
          r = app.engine.alignStrip(s.id, { to: a.con === 'siguiente' ? 'next' : 'prev', translate: a.trasladar !== false, rotate: a.rotar !== false });
          if (!r) throw Error('No hay clip con el que alinear en esa dirección.');
        }
        app.changed();
        app.panels.refreshStrip?.();
        return { tira: s.id, raiz: r };
      },
    },
    quitarTira: {
      d: 'Quita una tira.',
      a: { tira: 'índice o id' },
      fn: (a) => {
        const s = stripOf(a.tira);
        app.pushUndo();
        eng().doc.strips = eng().doc.strips.filter((x) => x !== s);
        app.changed();
        return { quedan: eng().doc.strips.length };
      },
    },
    fotograma: { d: 'Va a un fotograma.', a: { f: 0 }, fn: (a) => (app.setFrame(a.f ?? 0), { fotograma: a.f ?? 0 }) },
    reproducir: { d: 'Reproduce o pausa.', a: { activo: true }, fn: (a) => ((app.playing = a.activo !== false), app.panels.refreshTransport(), { reproduciendo: app.playing }) },
    rango: {
      d: 'Rango manual (o auto con auto=true).',
      a: { inicio: 0, fin: 60, auto: false },
      fn: (a) => {
        const d = eng().doc;
        d.rangeMode = a.auto ? 'auto' : 'manual';
        if (!a.auto) {
          d.start = a.inicio ?? 0;
          d.end = a.fin ?? 60;
        }
        app.changed();
        return { rango: eng().range() };
      },
    },
    rotar: {
      d: 'Pone clave de rotación a un hueso. modo "suma" (gira desde la pose actual, ejes locales) o "fija" (rotación local absoluta). Grados.',
      a: { hueso: 'head | upperArmL | nombre real', x: 0, y: 0, z: 0, f: 'fotograma', modo: 'suma', capa: 'id o nombre (opcional)', interpolacion: 'auto|smooth|linear|step' },
      fn: (a) => {
        layerSel(a);
        const b = boneOf(a.hueso);
        const f = frameOf(a);
        app.pushUndo();
        const e = new THREE.Quaternion().setFromEuler(new THREE.Euler((a.x || 0) * D2R, (a.y || 0) * D2R, (a.z || 0) * D2R));
        if (eng().chainOfBone(b)) {
          // miembro en IK: el giro se guarda como IK (efector + polo), desde la pose que se ve
          eng().evaluate(f);
          eng().keyPoseSmart(f, [{ bone: b, q: a.modo === 'fija' ? e : b.quaternion.clone().multiply(e) }]);
        } else {
          eng().evaluate(f, { ik: false });
          eng().keyBone(b, a.modo === 'fija' ? e : b.quaternion.clone().multiply(e), null, f);
          setInterp(`r:${b.name}`, f, a.interpolacion);
        }
        app.changed();
        return { hueso: b.name, fotograma: f };
      },
    },
    mover: {
      d: 'Desplaza el hueso elegido en metros, en el marco del personaje: x = a su izquierda, y = arriba, z = adelante.',
      a: { hueso: 'hips', x: 0, y: 0, z: 0, f: 'fotograma', capa: '' },
      fn: (a) => {
        layerSel(a);
        const b = boneOf(a.hueso || 'hips');
        const f = frameOf(a);
        app.pushUndo();
        eng().evaluate(f);
        const r = rig();
        const w = b.getWorldPosition(new THREE.Vector3());
        const d = new THREE.Vector3(a.x || 0, a.y || 0, a.z || 0).applyQuaternion(r.Fq);
        const target = w.add(d);
        const local = b.parent.worldToLocal(target.clone());
        eng().keyBone(b, null, local, f);
        app.changed();
        return { hueso: b.name, fotograma: f };
      },
    },
    escalar: {
      d: 'Clave de escala de un hueso (factor).',
      a: { hueso: '', x: 1, y: 1, z: 1, f: '' },
      fn: (a) => {
        layerSel(a);
        const b = boneOf(a.hueso);
        const f = frameOf(a);
        app.pushUndo();
        eng().evaluate(f);
        eng().keyBone(b, null, null, f, b.scale.clone().multiply(new THREE.Vector3(a.x ?? 1, a.y ?? 1, a.z ?? 1)));
        app.changed();
        return { hueso: b.name };
      },
    },
    arrastrar: {
      d: 'Arrastra una parte del cuerpo como con la herramienta Arrastrar: mano/pie (IK), rodilla/codo (lleva el miembro), cabeza/pecho (dobla la columna), cadera (mueve el cuerpo; pies con candado quietos). Desplazamiento en metros, marco del personaje.',
      a: { hueso: 'canónico: handL, footR, lowerLegL, head, hips…', mover: '[x, y, z] (x = su izquierda, y = arriba, z = delante)', fotograma: 'opcional' },
      f: (a) => {
        const b = app.rig.bone(a.hueso) || (app.rig.kind === 'quadruped' && horseControlPoints(app.rig).find(p => p.canon === a.hueso || p.bone.name === a.hueso)?.bone);
        if (!b) throw new Error('Hueso canónico no encontrado');
        if (a.fotograma != null) app.setFrame(Math.round(a.fotograma));
        app.setTool('ik');
        app.select({ kind: 'bone', bone: b });
        const d = new THREE.Vector3(...(a.mover || [0, 0, 0])).applyQuaternion(app.rig.Fq);
        const s = app.selection;
        app.onGizmoDrag(true);
        if (s.kind === 'bone' && !s.drag) b.position.copy(b.parent.worldToLocal(b.getWorldPosition(new THREE.Vector3()).add(d)));
        else app._proxy.position.add(d);
        app.onGizmoChange();
        app.onGizmoDrag(false);
        return { hueso: a.hueso, modo: s.drag || s.kind };
      },
    },
    dedos: {
      d: 'Dedos por deslizadores (como los controles de dedo del Control Rig): cerrar en grados (0–90) toda la mano o cada dedo, y abrir (spread −10…20). Guarda clave en el fotograma actual.',
      a: { mano: 'L|R|both', todos: 'opcional 0–90', pulgar: 'opcional', indice: 'opcional', medio: 'opcional', anular: 'opcional', menique: 'opcional', abrir: 'opcional −10…20' },
      f: (a) => {
        const v = {};
        const map = { todos: 'all', pulgar: 'thumb', indice: 'index', medio: 'middle', anular: 'ring', menique: 'little', abrir: 'spread' };
        for (const [es, en] of Object.entries(map)) if (a[es] !== undefined) v[en] = +a[es];
        const r = app.setFingers(a.mano || 'both', v);
        app.panels.refreshPicker?.();
        return r;
      },
    },
    ikOpciones: {
      d: 'Stretch y Softness de una cadena IK (leg_stretch / leg_softness del Control Rig). Stretch: el miembro se estira hasta +maxStretch si no llega. Softness 0–1: extensión suave sin chasquido.',
      a: { cadena: 'footL|footR|handL|handR', stretch: 'opcional bool', softness: 'opcional 0–1', maxStretch: 'opcional (0.3 = +30 %)' },
      f: (a) => {
        const d = eng().doc;
        if (!['footL', 'footR', 'handL', 'handR'].includes(a.cadena)) throw Error('cadena: footL|footR|handL|handR');
        app.pushUndo();
        const cur = { stretch: false, soft: 0, ...(d.ikOpts?.[a.cadena] || {}) };
        if (a.stretch !== undefined) cur.stretch = !!a.stretch;
        if (a.softness !== undefined) cur.soft = Math.min(1, Math.max(0, +a.softness));
        if (a.maxStretch !== undefined) cur.maxStretch = Math.max(0, +a.maxStretch);
        d.ikOpts = { ...(d.ikOpts || {}), [a.cadena]: cur };
        app.changed();
        return { cadena: a.cadena, ...cur, alcance: eng().ikState[a.cadena]?.reach };
      },
    },
    gizmo: {
      d: 'Gizmo del visor: tamaño en pantalla (factor 0.5–3; los aros de rotar ya son grandes por defecto), herramienta y ejes. Sin argumentos devuelve el estado.',
      a: { tamano: 'opcional número 0.5–3', herramienta: 'opcional ik|move|rotate|scale', ejes: 'opcional local|global' },
      f: (a) => {
        const vp = app.viewport;
        if (a.tamano !== undefined) vp.setGizmoScale(a.tamano);
        if (a.herramienta) app.setTool(a.herramienta);
        if (a.ejes) { app.space = a.ejes === 'global' ? 'global' : 'local'; app.attachGizmo(); }
        app.panels.refreshTools?.();
        return { tamano: vp.gizmoScale, tamanoReal: vp.gizmo.size, modo: vp.gizmo.mode, herramienta: app.tool, ejes: app.space, sujeto: !!vp.gizmo.object };
      },
    },
    pines: {
      d: 'Pines de Editar capa de movimiento: preajuste (none|hands|feet|limbs) o pin por cadena (false|TR|T|R; T = posición, R = giro). Sin argumentos devuelve el estado.',
      a: { preajuste: 'opcional none|hands|feet|limbs', handL: 'opcional false|TR|T|R', handR: 'opcional', footL: 'opcional', footR: 'opcional' },
      f: (a) => {
        if (a.preajuste) app.pinPreset(a.preajuste);
        for (const c of ['handL', 'handR', 'footL', 'footR']) if (a[c] !== undefined) app.setLock(c, a[c] === true ? 'TR' : a[c] || false);
        return { pines: app.locks };
      },
    },
    reposo: {
      d: 'Pose de reposo (Reset Pose): de pie con los brazos relajados, con clave en el fotograma actual (o en f).',
      a: { f: 'opcional fotograma' },
      f: (a) => {
        if (a.f !== undefined) app.setFrame(+a.f);
        return { ok: !!app.resetPose(), f: Math.round(eng().frame) };
      },
    },
    palma: {
      d: 'Puño desde la palma: cierra (90) o abre (0) todos los dedos de una mano, con clave en el fotograma actual.',
      a: { lado: 'L|R|both', cierre: 'número -10…95', f: 'opcional fotograma' },
      f: (a) => {
        if (a.f !== undefined) app.setFrame(+a.f);
        return app.palm(a.lado || 'both', a.cierre ?? 90);
      },
    },
    puntillas: {
      d: 'Efector IK del pie: gira el pie sobre los dedos (que se quedan en el suelo) y sube el talón tantos grados.',
      a: { lado: 'L|R', grados: 'número 0…60', f: 'opcional fotograma' },
      f: (a) => {
        if (a.f !== undefined) app.setFrame(+a.f);
        return { ok: app.tiptoe(a.lado === 'R' ? 'R' : 'L', +a.grados || 0, { start: true }) };
      },
    },
    titere: {
      d: 'Títere directo sin ratón: lleva la cadera o una mano/pie (cadena) de un desplazamiento a otro entre dos fotogramas, con una clave por fotograma y los pines aplicados (como grabar con el ratón).',
      a: { control: 'hips|handL|handR|footL|footR', desde: 'fotograma', hasta: 'fotograma', mover: '[x,y,z] metros al final (mundo)', girar: 'opcional screen|primary|secondary (gira en vez de mover)', angulo: 'grados al final (con girar)', reflejar: 'opcional bool (la mano/pie del otro lado en espejo)', curva: 'opcional "suave"|"lineal"' },
      f: (a) => {
        const f0 = Math.round(+a.desde || 0);
        const f1 = Math.round(+a.hasta || f0);
        app.setFrame(f0);
        app.select(a.control === 'hips' ? { kind: 'root' } : { kind: 'ik', chain: a.control });
        const keep = { rot: app.puppetRot, mirror: app.puppetMirror };
        app.puppetRot = ['screen', 'primary', 'secondary'].includes(a.girar) ? a.girar : null;
        app.puppetMirror = !!a.reflejar;
        let started = false;
        try { started = app.puppetStart({ record: false }); } finally { app.puppetRot = keep.rot; app.puppetMirror = keep.mirror; }
        if (!started) return { ok: false };
        const P = app.puppet;
        const d = new THREE.Vector3().fromArray(a.mover || [0, 0, 0]);
        const ang = THREE.MathUtils.degToRad(+a.angulo || 0);
        for (let f = f0; f <= f1; f++) {
          let u = f1 > f0 ? (f - f0) / (f1 - f0) : 1;
          if (a.curva !== 'lineal') u = u * u * (3 - 2 * u);
          P.offset.copy(d).multiplyScalar(u);
          if (P.rot) P.ang = ang * u;
          eng().frame = f;
          app.puppetKey(f);
        }
        app.puppetStop(false);
        app.setFrame(f1);
        return { ok: true, claves: f1 - f0 + 1 };
      },
    },
    capaNueva: {
      d: 'Crea una capa de animación con nombre y la deja activa (las ediciones van a ella).',
      a: { nombre: 'texto' },
      f: (a) => ({ id: app.addNamedLayer(a.nombre).id }),
    },
    capaActiva: {
      d: 'Activa/desactiva una capa (por nombre o id) o la elige para editar.',
      a: { capa: 'nombre o id', activa: 'opcional bool (activar/desactivar)', editar: 'opcional bool (hacerla la capa activa)' },
      f: (a) => {
        const l = eng().doc.layers.find((x) => x.id === a.capa || x.name === a.capa);
        if (!l) return { ok: false, error: 'no existe esa capa' };
        if (a.activa !== undefined) app.toggleLayer(l.id, !!a.activa);
        if (a.editar) app.setActiveLayer(l.id);
        return { ok: true, id: l.id, mute: l.mute, activa: eng().doc.activeLayer };
      },
    },
    mantenerTira: {
      d: 'Mantener en toda la tira: con true, cada edición queda igual del principio al final de la tira donde está el cabezal.',
      a: { activo: 'bool' },
      f: (a) => ((app.holdStrip = !!a.activo), { mantener: app.holdStrip }),
    },
    clavesFotograma: {
      d: 'Copia las claves del fotograma «de» de la capa activa (todas, o solo de lo elegido con soloElegido) y las pega en los fotogramas «en».',
      a: { de: 'fotograma', en: 'lista de fotogramas', soloElegido: 'opcional bool (por defecto false: todas las claves)' },
      f: (a) => {
        app.setFrame(+a.de);
        if (!a.soloElegido && app.selection) app.select(null);
        const n = app.copyFrameKeys();
        for (const f of a.en || []) { app.setFrame(+f); app.pasteFrameKeys(); }
        return { copiadas: n, pegadas: (a.en || []).length };
      },
    },
    ayudas: {
      d: 'Ayudas de edición: límites naturales, cuerpo que acompaña a la mano, brazos que no atraviesan el cuerpo, suelo y candados de manos/pies. Sin argumentos devuelve el estado.',
      a: { limites: 'opcional bool', cuerpo: 'opcional bool', colisiones: 'opcional bool', suelo: 'opcional bool', candados: 'opcional { handL, handR, footL, footR }' },
      f: (a) => {
        const d = eng().doc;
        if (a.limites !== undefined) app.limits = !!a.limites;
        if (a.candados) app.locks = { ...app.locks, ...a.candados };
        if (a.cuerpo !== undefined || a.colisiones !== undefined || a.suelo !== undefined) {
          app.pushUndo();
          if (a.cuerpo !== undefined) d.reach = !!a.cuerpo;
          if (a.colisiones !== undefined) d.collide = !!a.colisiones;
          if (a.suelo !== undefined) d.floor = !!a.suelo;
          app.changed();
        }
        app.panels.refreshMotion?.();
        return { limites: app.limits, cuerpo: d.reach !== false, colisiones: !!d.collide, suelo: !!d.floor, candados: app.locks };
      },
    },
    ikPeso: {
      d: 'Mezcla IK↔FK de una cadena con clave en el fotograma actual (0 = FK, 1 = IK).',
      a: { cadena: 'handL | handR | footL | footR', peso: '0..1', fotograma: 'opcional' },
      fn: (a) => {
        if (!IK_CHAINS[a.cadena]) throw new Error('Cadena: handL, handR, footL o footR');
        app.pushUndo();
        const fr = Math.round(a.fotograma ?? eng().frame);
        eng().switchIK(a.cadena, true, fr);
        eng().keyIKWeight(a.cadena, +a.peso, fr);
        app.changed();
        return { cadena: a.cadena, peso: +a.peso };
      },
    },
    anclar: {
      d: 'Ancla una mano o un pie donde está, fijo en el mundo: en un fotograma (queda fijo) o en un tramo desde-hasta. soltar:true quita las anclas.',
      a: { cadena: 'handL | handR | footL | footR', desde: 'fotograma (por defecto el actual)', hasta: 'opcional', soltar: 'opcional' },
      f: (a) => {
        if (!IK_CHAINS[a.cadena]) throw new Error('Cadena: handL, handR, footL o footR');
        app.pushUndo();
        const f0 = Math.round(a.desde ?? eng().frame);
        const r = a.soltar ? { quitadas: eng().unpinIK(a.cadena) } : { anclada: eng().pinIK(a.cadena, f0, Math.round(a.hasta ?? f0)) };
        app.changed();
        return { cadena: a.cadena, ...r };
      },
    },
    fijarPies: {
      d: 'Quita el patinaje: ancla cada pie en los tramos en que está apoyado. suelo:true/false activa que los pies no atraviesen el suelo.',
      a: { suelo: 'opcional true/false', soloSuelo: 'opcional: no buscar apoyos' },
      f: (a) => {
        app.pushUndo();
        if (a.suelo !== undefined) eng().doc.floor = !!a.suelo;
        const n = a.soloSuelo ? 0 : eng().lockFeet();
        app.changed();
        return { apoyosFijados: n, suelo: !!eng().doc.floor, tramos: { footL: eng().footContacts('footL'), footR: eng().footContacts('footR') } };
      },
    },
    curva: {
      d: 'Curva del tramo que sale de las claves de una pista en un fotograma: interp (auto, smooth, linear, in, out, step) o bezier [x1,y1,x2,y2].',
      a: { pista: 'id de pista, p. ej. r:<hueso> o ik:handR:pos (omitida: todas las de la capa activa)', fotograma: 'por defecto el actual', interp: 'opcional', bezier: 'opcional [x1,y1,x2,y2]' },
      f: (a) => {
        const f = Math.round(a.fotograma ?? eng().frame);
        const l = eng().layer();
        app.pushUndo();
        let n = 0;
        for (const [id, keys] of Object.entries(l.tracks)) {
          if (a.pista && id !== a.pista) continue;
          const k = keys.find((x) => x.f === f);
          if (!k) continue;
          if (a.bezier) {
            k.i = 'bezier';
            k.b = a.bezier.map(Number);
          } else {
            k.i = a.interp || 'smooth';
            delete k.b;
          }
          n++;
        }
        app.changed();
        return { claves: n };
      },
    },
    curvaTira: {
      d: 'Curva de tiempo de una tira (reparto de la velocidad): bezier [x1,y1,x2,y2] o null para velocidad uniforme.',
      a: { indice: 'tira (0 = primera)', bezier: '[x1,y1,x2,y2] | null' },
      f: (a) => {
        const s = eng().doc.strips[a.indice || 0];
        if (!s) throw new Error('No hay esa tira');
        app.pushUndo();
        if (a.bezier) s.warp = a.bezier.map(Number);
        else delete s.warp;
        app.changed();
        return { tira: s.clipId, curva: s.warp || null };
      },
    },
    ik: {
      d: 'Enciende/apaga IK de una cadena y opcionalmente mueve su objetivo (metros, marco del personaje) o su polo.',
      a: { cadena: 'handL | handR | footL | footR', activo: true, objetivo: [0, 0.2, 0.1], polo: [0, 0, -0.2], fijo: false, f: '' },
      fn: (a) => {
        const ch = a.cadena;
        if (!IK_CHAINS[ch]) throw new Error('Cadena: handL, handR, footL o footR');
        app.pushUndo();
        const f = frameOf(a);
        eng().switchIK(ch, a.activo !== false, f); // sin saltos: empareja la pose al cambiar
        eng().evaluate(f);
        const st = eng().ikState[ch];
        const r = rig();
        if (a.objetivo && st) {
          const d = new THREE.Vector3(...a.objetivo).applyQuaternion(r.Fq);
          eng().keyIK(ch, { pos: st.target.clone().add(d) }, f);
        }
        if (a.polo && st) eng().keyIK(ch, { pole: st.pole.clone().add(new THREE.Vector3(...a.polo).applyQuaternion(r.Fq)) }, f);
        app.changed();
        app.panels.refreshOutliner();
        return { cadena: ch, activo: eng().doc.ik[ch] };
      },
    },
    clave: {
      d: 'Clave con el valor actual para los huesos dados (o la selección / toda la capa).',
      a: { huesos: ['head'], f: '' },
      fn: (a) => {
        const f = frameOf(a);
        app.setFrame(f);
        if (a.huesos) app.selectMany(a.huesos.map(boneOf));
        app.keySelected();
        return { fotograma: f };
      },
    },
    borrarClave: {
      d: 'Borra claves en un fotograma (de los huesos dados o de toda la capa activa).',
      a: { f: 0, huesos: [] },
      fn: (a) => {
        app.pushUndo();
        const names = a.huesos?.length ? new Set(a.huesos.map((h) => boneOf(h).name)) : null;
        const n = eng().deleteKeys(frameOf(a), names ? (id) => names.has(id.slice(2)) : null);
        app.changed();
        return { borradas: n };
      },
    },
    claves: {
      d: 'Lista las claves de la capa (o de un hueso), con valores en grados / metros.',
      a: { capa: '', hueso: '' },
      fn: (a) => {
        const l = a.capa ? eng().doc.layers.find((x) => x.id === a.capa || x.name === a.capa) : eng().layer();
        const name = a.hueso ? boneOf(a.hueso).name : null;
        const out = {};
        for (const [id, keys] of Object.entries(l.tracks)) {
          if (name && id.slice(2) !== name) continue;
          out[id] = keys.map((k) => ({ f: k.f, i: k.i, v: id.startsWith('r:') || id.endsWith(':rot') ? (() => {
            const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(k.v));
            return [e.x, e.y, e.z].map((x) => +(x / D2R).toFixed(2));
          })() : k.v.map((x) => +x.toFixed(4)) }));
        }
        return out;
      },
    },
    capa: {
      d: 'Gestiona capas: accion nueva | activa | editar | borrar | fusionar | aplanar | duplicar.',
      a: { accion: 'nueva', id: '', nombre: '', modo: 'aditiva|sustituye', peso: 1, silencio: false, solo: false, bloqueada: false, mascara: GROUPS.map((g) => g.id) },
      fn: (a) => {
        const d = eng().doc;
        app.pushUndo();
        let l = a.id ? d.layers.find((x) => x.id === a.id || x.name === a.id) : eng().layer();
        switch (a.accion) {
          case 'nueva':
            l = newLayer(uid('capa'), a.nombre || `Capa ${d.layers.length}`);
            d.layers.push(l);
            d.activeLayer = l.id;
            break;
          case 'activa':
            if (!l) throw new Error('No existe la capa');
            d.activeLayer = l.id;
            break;
          case 'borrar':
            if (!l || l.id === 'base') throw new Error('Base no se borra');
            d.layers = d.layers.filter((x) => x !== l);
            d.activeLayer = d.layers[d.layers.length - 1].id;
            break;
          case 'fusionar':
            eng().mergeDown(l.id);
            break;
          case 'aplanar':
            eng().flatten();
            break;
          case 'duplicar': {
            const c = JSON.parse(JSON.stringify(l));
            c.id = uid('capa');
            c.name = a.nombre || `${l.name} copia`;
            d.layers.splice(d.layers.indexOf(l) + 1, 0, c);
            d.activeLayer = c.id;
            l = c;
            break;
          }
        }
        if (l && d.layers.includes(l)) {
          if (a.nombre && a.accion === 'editar') l.name = a.nombre;
          if (a.modo) l.mode = /sust|over/.test(a.modo) ? 'over' : 'add';
          if (a.peso !== undefined && l.id !== 'base') l.weight = +a.peso;
          for (const [k, p] of [['silencio', 'mute'], ['solo', 'solo'], ['bloqueada', 'lock']]) if (a[k] !== undefined) l[p] = !!a[k];
          if (a.mascara !== undefined) l.mask = a.mascara && a.mascara.length && a.mascara.length < GROUPS.length ? a.mascara : null;
        }
        app.changed();
        return { capa: l?.id, capas: d.layers.map((x) => x.name) };
      },
    },
    ajustar: {
      d: 'Deslizadores del clip (grados; speed = factor). Opcional: clave en f, o tramo [inicio, fin].',
      a: { armsV: 0, armsH: 0, posture: 0, chestH: 0, chestV: 0, headV: 0, headH: 0, speed: 1, f: null, tramo: null },
      fn: (a) => {
        const d = eng().doc;
        app.pushUndo();
        for (const k of Object.keys(d.adjust)) {
          if (a[k] === undefined) continue;
          if (a.f !== undefined && a.f !== null) {
            d.adjustKeys ||= {};
            const keys = (d.adjustKeys[k] ||= []);
            const old = keys.findIndex((x) => x.f === a.f);
            if (old >= 0) keys.splice(old, 1);
            keys.push({ f: a.f, v: [a[k], 0, 0], i: 'smooth' });
            keys.sort((x, y) => x.f - y.f);
          } else d.adjust[k] = a[k];
        }
        if (a.tramo !== undefined) d.adjustRange = a.tramo;
        app.changed();
        return { ajustes: d.adjust, claves: d.adjustKeys || {}, tramo: d.adjustRange || null };
      },
    },
    pose: {
      d: 'Aplica una pose: de cuerpo (id de clip de poses o pose guardada) o de mano.',
      a: { id: 'gen_pose_t | mano_puno | …', mano: 'L|R|both', cantidad: 1 },
      fn: (a) => {
        const hp = app.handPoses.find((x) => x.id === a.id) || app.savedHands.find((x) => x.id === a.id || x.name === a.id);
        if (hp) {
          const q = Object.fromEntries(Object.entries(hp.q).map(([k, v]) => [k, v.isQuaternion ? v : new THREE.Quaternion().fromArray(v)]));
          app.applyHandPose({ ...hp, q }, a.mano || 'both', a.cantidad ?? 1);
          return { mano: hp.name };
        }
        const c = app.library.get(a.id);
        const saved = app.bodyPoses.find((x) => x.id === a.id || x.name === a.id);
        if (c) {
          const p = sampleClip(c, a.t ?? 0, newPose());
          app.applyPose({ q: p.q, hips: p.hips }, { weight: a.cantidad ?? 1 });
          return { pose: c.name };
        }
        if (saved) {
          app.applyPose({ q: Object.fromEntries(Object.entries(saved.q).map(([k, v]) => [k, new THREE.Quaternion().fromArray(v)])), hips: new THREE.Vector3().fromArray(saved.hips) }, { weight: a.cantidad ?? 1 });
          return { pose: saved.name };
        }
        throw new Error('Pose no encontrada. Manos: ' + app.handPoses.map((x) => x.id).join(', '));
      },
    },
    espejo: {
      d: 'Copia la pose de un lado al otro en el fotograma.',
      a: { de: 'L', f: '' },
      fn: (a) => {
        app.pushUndo();
        eng().mirrorSide(frameOf(a), a.de === 'R' ? 'R' : 'L');
        app.changed();
        return { ok: true };
      },
    },
    motionLab: {
      d: 'Rehace un clip y lo guarda en Tuyas. Estilos: ' + Object.keys(STYLES).join(', ') + '. Direcciones en grados (0 adelante, 90 izq., 180 atrás, -90 der.).',
      a: { clip: 'id', estilo: 'cansado', velocidad: 1, exagerar: { arms: 1.2, legs: 1, torso: 1, head: 1, fingers: 1 }, solapamiento: 0, suavizado: 0, postura: 0, cabeza: 0, pecho: 0, rebote: 1, bajar: 0, a_saltos: 0, bucle_sin_salto: 0, direccion: 0, de_lado: false, espejo: false, al_reves: false, nombre: '', usar: true },
      fn: async (a) => {
        const src = app.library.get(a.clip);
        if (!src) throw new Error('No existe el clip ' + a.clip);
        const out = processClip(src, { style: a.estilo, speed: a.velocidad, amp: a.exagerar, overlap: a.solapamiento, smooth: a.suavizado, posture: a.postura, head: a.cabeza, chest: a.pecho, bounce: a.rebote, lower: a.bajar, hold: a.a_saltos, loopFix: a.bucle_sin_salto, direction: a.direccion, strafe: a.de_lado, mirror: a.espejo, reverse: a.al_reves });
        out.name = a.nombre || `${src.name} (${a.estilo && a.estilo !== 'ninguno' ? STYLES[a.estilo]?.label : 'lab'})`;
        out.id = `mio:${slug(out.name)}:${Date.now().toString(36)}`;
        out.tags = [...(src.tags || []).filter((t) => !/^(UAL|Humane|Fútbol)/.test(t)), 'tuyas'];
        out.source = 'propio';
        out.author = 'Motion Lab';
        await app.saveMine(out);
        if (a.usar !== false) app.useClip(out.id);
        app.panels.refreshLibrary();
        return clipInfo(out);
      },
    },
    ochoDirecciones: {
      d: 'Genera las 8 direcciones de un clip de locomoción en Tuyas (de_lado=true: mirando al frente).',
      a: { clip: 'id', de_lado: false },
      fn: async (a) => {
        const src = app.library.get(a.clip);
        if (!src) throw new Error('No existe el clip');
        const ids = [];
        for (const [deg, label] of DIRECTIONS) {
          const out = processClip(src, { direction: deg, strafe: !!a.de_lado });
          out.name = `${src.name} · ${label}`;
          out.id = `mio:${slug(out.name)}:${Date.now().toString(36)}${ids.length}`;
          out.tags = [...(src.tags || []), 'tuyas'];
          await app.saveMine(out);
          ids.push(out.id);
        }
        app.panels.refreshLibrary();
        return { clips: ids };
      },
    },
    objeto: {
      d: 'Pone/quita un objeto en la mano. ids: ' + PROPS.map((p) => p.id).join(', '),
      a: { id: 'espada', mano: 'R', quitar: false },
      fn: async (a) => {
        if (a.quitar) {
          for (const p of app.stage.props.filter((x) => !a.id || x.id === a.id)) app.stage.removeProp(p);
          return { objetos: app.stage.props.length };
        }
        const def = PROPS.find((p) => p.id === a.id);
        if (!def) throw new Error('Objeto desconocido');
        await app.stage.addProp(def, a.mano || def.hand || 'R');
        return { objetos: app.stage.props.map((p) => p.id) };
      },
    },
    escenario: {
      d: 'Añade/quita piezas de referencia. ids: ' + SCENERY.map((s) => s.id).join(', '),
      a: { id: 'mesa', posicion: [0, 0, -1.4], quitar: false },
      fn: (a) => {
        if (a.quitar) {
          for (const p of app.stage.pieces.filter((x) => !a.id || x.id === a.id)) app.stage.removePiece(p);
        } else {
          const def = SCENERY.find((s) => s.id === a.id);
          if (!def) throw new Error('Pieza desconocida');
          app.stage.addPiece(def, a.posicion || null);
        }
        return { piezas: app.stage.pieces.map((p) => p.id) };
      },
    },
    camara: {
      d: 'Vista del visor o cámara de plano.',
      a: { vista: 'front|right|top|persp', encuadrar: true, posicion: '[x,y,z] de la cámara', mira_a: '[x,y,z]', seguir: 'la cámara acompaña al personaje', plano: { desde_vista: true, focal: 50, aspecto: 1.7778, mirar: false, mini: false } },
      fn: (a) => {
        const vp = app.viewport;
        if (a.vista) vp.viewFrom(a.vista);
        if (a.encuadrar) vp.reframe();
        // cámara libre: posición y punto al que mira, en metros del visor
        if (Array.isArray(a.posicion)) vp.camera.position.fromArray(a.posicion);
        if (Array.isArray(a.mira_a)) vp.orbit.target.fromArray(a.mira_a);
        if (a.posicion || a.mira_a) vp.orbit.update();
        if (a.seguir !== undefined) vp.opts.follow = !!a.seguir;
        if (a.plano) {
          const st = app.stage;
          st.ensureShot();
          if (a.plano.desde_vista) st.setFromView();
          if (a.plano.aspecto) st.setAspect(a.plano.aspecto);
          if (a.plano.focal) st.setFocal(a.plano.focal);
          if (a.plano.mirar !== undefined) st.lookThrough(!!a.plano.mirar);
          if (a.plano.mini !== undefined) vp.shot.mini = !!a.plano.mini;
        }
        return { ok: true };
      },
    },
    captura: {
      d: 'Guarda una captura PNG (de la cámara de plano si existe, o de la vista) en reports/capturas y devuelve la ruta (léela con la herramienta de imágenes).',
      a: { nombre: 'captura.png', ancho: 1280, f: null, vista: null },
      fn: async (a) => {
        if (a.f !== null && a.f !== undefined) app.setFrame(a.f);
        if (a.vista) app.viewport.viewFrom(a.vista);
        app.viewport.render();
        const url = app.stage.snapshot(a.ancho || 1280);
        const bin = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
        const ruta = await app.saveToDisk(bin, a.nombre || `captura_${Date.now()}.png`, '', 'captura');
        return { ruta };
      },
    },
    exportar: {
      d: 'Exporta. formato three (paquete: GLB + cargador + reproductor), glb, fbx (con Blender) o clip (json canónico). Por defecto a la carpeta exportaciones/.',
      a: { formato: 'three', animaciones: 'actual|conjunto|ambos', nombre: '', solo_esqueleto: false },
      fn: async (a) => {
        const f = a.formato || 'three';
        if (f === 'three') return app.exportThree({ which: a.animaciones || 'actual', destino: 'disco', nombre: a.nombre, withMesh: !a.solo_esqueleto });
        if (f === 'fbx') return app.exportFBX({ which: a.animaciones || 'actual', destino: 'disco', nombre: a.nombre });
        if (f === 'glb') {
          const { exportGLB } = await import('./io/exporter.js');
          await app.prepareBake(a.animaciones || 'actual');
          const glb = await exportGLB(eng(), app.bakeClips(a.animaciones || 'actual'), { withMesh: !a.solo_esqueleto });
          return { ruta: await app.saveToDisk(new Uint8Array(glb), `${slug(a.nombre || app.charMeta.name)}.glb`) };
        }
        if (f === 'clip') {
          const { bakeCanonical } = await import('./io/exporter.js');
          const c = bakeCanonical(eng(), { id: `mio:${slug(a.nombre || 'clip')}`, name: a.nombre || 'Clip' });
          return { ruta: await app.saveToDisk(JSON.stringify(clipToJSON(c)), `${slug(a.nombre || 'clip')}.clip.json`) };
        }
        throw new Error('formato: three, glb, fbx o clip');
      },
    },
    conjunto: {
      d: 'Define el conjunto de animaciones a exportar juntas.',
      a: { clips: ['lib:ual_1:idle_loop'], nombres: ['idle'], nombre: 'set1', en_sitio: false },
      fn: (a) => {
        const set = app.sets.find((s) => s.id === app.activeSet) || app.sets[0];
        if (a.nombre) set.name = slug(a.nombre);
        if (a.clips) set.clips = a.clips.filter((id) => app.library.has(id)).map((id, i) => ({ id, name: slug(a.nombres?.[i] || app.library.get(id).name) }));
        if (a.en_sitio !== undefined) set.inPlace = !!a.en_sitio;
        app.panels.refreshSet?.();
        return set;
      },
    },
    importar: {
      d: 'Importa un archivo del disco (ruta absoluta en D:\\Español). como: personaje | animacion | ambos. Las de Mixamo van a la librería Mixamo.',
      a: { ruta: 'D:\\…\\Walk.fbx', como: 'animacion' },
      fn: async (a) => {
        const r = await fetch(`/api/leer?ruta=${encodeURIComponent(a.ruta)}`);
        if (!r.ok) throw new Error('No puedo leer ' + a.ruta);
        const name = a.ruta.split(/[\\/]/).pop();
        const file = new File([await r.arrayBuffer()], name);
        await app.importFiles([file], a.como === 'personaje' ? 'char' : a.como === 'ambos' ? 'both' : 'anim');
        return { importado: name };
      },
    },
    proyecto: {
      d: 'Proyectos: guardar | abrir | nuevo | json (devuelve el proyecto) | cargar (pone el documento «doc» de un json, p. ej. de otro navegador o de otra pestaña).',
      a: { accion: 'guardar', nombre: '', id: '', doc: 'con cargar: el documento (o el proyecto entero que devuelve json)' },
      fn: async (a) => {
        if (a.accion === 'nuevo') return (app.newProject(), { ok: true });
        if (a.accion === 'cargar') {
          const d = a.doc && a.doc.doc ? a.doc.doc : a.doc;
          if (!d || !Array.isArray(d.layers) || !Array.isArray(d.strips)) throw new Error('Falta un documento válido en «doc»');
          if (a.nombre || a.doc?.name) app.projectName = a.nombre || a.doc.name;
          app.loadDoc(JSON.parse(JSON.stringify(d)));
          return { cargado: app.projectName, capas: d.layers.length, tiras: d.strips.length };
        }
        if (a.accion === 'json') return app.projectJSON();
        if (a.accion === 'abrir') {
          const { db } = await import('./io/storage.js');
          const p = (await db.all('projects')).find((x) => x.id === a.id || x.name === a.nombre);
          if (!p) throw new Error('No existe el proyecto');
          await app.openProject(p);
          return { abierto: p.name };
        }
        if (a.nombre) app.projectName = a.nombre;
        app.projectId ||= uid('p');
        const { db } = await import('./io/storage.js');
        await db.put('projects', { id: app.projectId, ...app.projectJSON() });
        return { guardado: app.projectName, id: app.projectId };
      },
    },
    enlace: { d: 'Enlace con el estado actual.', fn: async () => ({ url: `${location.origin}${location.pathname}#${(await import('./io/url.js')).docToHash(eng().doc, rig())}` }) },
    director: {
      d: 'Motion Director: destinos (waypoints), caminos y secuencia de acciones. El plan se compila solo a tiras + trayectoria. Coordenadas en metros sobre el suelo (x = izquierda del personaje en reposo, z = delante).',
      a: {
        accion: 'estado | destino | camino | recorrer | accion | esperar | girar | inicio | ajustes | quitar | vaciar | reproducir',
        x: 1, z: 2, objetivo: 'nombre de un objetivo en vez de x, z (destino)', parar: 'metros antes del objetivo (destino)', mirar: 'grados al llegar (destino)', puntos: '[[x,z],…] (camino)', nombre: 'nombre del camino', curva: true, cerrado: false,
        camino: 'id del camino (recorrer)', desde: 'metros (recorrer)', hasta: 'metros (recorrer)', clip: 'id de clip (accion)', repeticiones: 1, mantener: 'segundos en la última pose', asiento: 'altura del asiento en m (silla: 0.45)',
        segundos: 1, grados: 90, velocidad: 1, paso: 'índice o id del paso (quitar, reproducir)', andar: 'clip para andar (ajustes)', quieto: 'clip de espera (ajustes)',
      },
      fn: (a) => {
        const D = app.directorUI;
        if (!D) throw new Error('El Motion Director no está montado');
        const extra = {};
        if (a.velocidad) extra.speed = +a.velocidad;
        switch (a.accion) {
          case undefined: case 'estado': break;
          case 'destino':
            if (a.mirar !== undefined) extra.face = a.mirar * D2R;
            if (a.objetivo) {
              // hasta un objetivo con nombre, deteniéndose antes si se pide
              D.addStep({ type: 'goto', target: targetId(a.objetivo), ...(a.parar ? { stop: +a.parar } : {}), ...extra });
              break;
            }
            if (!Number.isFinite(+a.x) || !Number.isFinite(+a.z)) throw new Error('Faltan x y z (o un objetivo)');
            D.addGoto(+a.x, +a.z, { ...extra, play: false });
            break;
          case 'camino':
            if (!Array.isArray(a.puntos) || a.puntos.length < 2) throw new Error('Un camino necesita al menos dos puntos [[x,z],…]');
            D.addPath(a.puntos, { name: a.nombre, curve: a.curva !== false, closed: !!a.cerrado });
            break;
          case 'recorrer': {
            const d = eng().doc.director;
            const p = d?.paths.find((x) => x.id === a.camino || x.name === a.camino) || d?.paths.at(-1);
            if (!p) throw new Error('No hay caminos: crea uno con accion "camino"');
            if (a.desde !== undefined) extra.from = +a.desde;
            if (a.hasta !== undefined) extra.to = +a.hasta;
            D.followPath(p.id, extra);
            break;
          }
          case 'accion':
            if (a.repeticiones) extra.loops = +a.repeticiones;
            if (a.mantener) extra.hold = +a.mantener;
            if (a.asiento !== undefined) extra.seat = +a.asiento;
            D.addAction(a.clip, extra);
            break;
          case 'esperar': D.addWait(+a.segundos || 1); break;
          case 'girar': D.addTurn(+a.grados || 0); break;
          case 'inicio': D.edit((d) => Object.assign(d.start, { x: +a.x || 0, z: +a.z || 0, yaw: (+a.grados || 0) * D2R })); break;
          case 'ajustes': D.edit((d) => {
            if (a.andar) d.walk = a.andar;
            if (a.quieto) d.idle = a.quieto;
            if (a.velocidad) d.speed = +a.velocidad;
          }); break;
          case 'quitar': D.edit((d) => {
            const i = typeof a.paso === 'number' ? a.paso : d.steps.findIndex((s) => s.id === a.paso);
            if (i < 0 || i >= d.steps.length) throw new Error('Paso desconocido');
            d.steps.splice(i, 1);
          }); break;
          case 'vaciar': D.clear(); break;
          case 'reproducir': {
            const st = D.state().pasos;
            const s = typeof a.paso === 'number' ? st[a.paso] : st.find((x) => x.id === a.paso);
            app.playing = false;
            D.play(s ? s.id : 0);
            break;
          }
          default: throw new Error('Acción desconocida');
        }
        return D.state();
      },
    },
    objetivo: {
      d: 'Objetivos del plan: puntos con nombre que usan Ir a, Look At, Reach Target y las condiciones. Metros; x, z como en director y «y» = altura sobre el suelo.',
      a: { accion: 'lista | nuevo | clic | mover | quitar | pieza | camara', nombre: 'Silla', x: 0, y: 1, z: 2, radio: 'radio de zona (m)', solido: false, pieza: 'id de una pieza del escenario (accion pieza)' },
      fn: async (a) => {
        const D = app.directorUI;
        const num3 = () => [+a.x || 0, +a.y || 0, +a.z || 0];
        switch (a.accion) {
          case undefined: case 'lista': break;
          case 'nuevo': D.addTarget({ name: a.nombre, pos: num3(), ...(a.radio ? { r: +a.radio } : {}), ...(a.solido ? { solid: true } : {}) }); break;
          case 'clic': {
            // espera a que el usuario haga clic en el escenario (sobre un objeto o el suelo)
            const p = await D.pickPoint({ y: a.y });
            if (!p) throw new Error('Se canceló el clic');
            D.addTarget({ name: a.nombre, pos: p });
            break;
          }
          case 'camara': if (!D.target(a.nombre || 'Cámara')) D.addTarget({ name: a.nombre || 'Cámara', kind: 'camera', pos: [0, 1.5, 3] }); break;
          case 'pieza': {
            const p = app.stage.pieces.find((x) => x.id === a.pieza) || app.stage.pieces.at(-1);
            if (!p) throw new Error('No hay piezas en el escenario: añade una con el comando escenario');
            D.addPieceTarget(p, a.nombre);
            break;
          }
          case 'mover': {
            const t = D.target(targetId(a.nombre));
            D.edit(() => {
              Object.assign(t, { kind: 'point', pos: [a.x ?? t.pos[0], a.y ?? t.pos[1], a.z ?? t.pos[2]].map(Number) });
              delete t.ref;
              delete t.off;
              if (a.radio !== undefined) +a.radio > 0 ? (t.r = +a.radio) : delete t.r;
            });
            break;
          }
          case 'quitar': D.removeTarget(targetId(a.nombre)); break;
          default: throw new Error('Acción desconocida');
        }
        return D.state().objetivos;
      },
    },
    mirar: {
      d: 'Look At: desde el fotograma f el personaje mira al objetivo (ojos → cabeza → torso) y lo sigue. Sin objetivo: deja de mirar. quitar: borra las miradas puestas a mano.',
      a: { objetivo: 'nombre o id (vacío = deja de mirar)', f: 'fotograma (por defecto el actual)', transicion: 0.45, intensidad: 1, ojos: true, cabeza: true, torso: true, quitar: false },
      fn: (a) => {
        const A = app.aimUI;
        if (a.quitar) A.clear(['look']);
        else {
          const parts = { eyes: a.ojos !== false, head: a.cabeza !== false, chest: a.torso !== false };
          A.set('look', a.objetivo ? targetId(a.objetivo) : null, { f: a.f, blend: a.transicion, w: a.intensidad ?? 1, parts: Object.values(parts).every(Boolean) ? undefined : parts });
        }
        eng().evaluate(eng().frame);
        return { mirada: eng().doc.aim?.look || [], ojos_en_este_fotograma: eng().lookEyes || null, huesos_de_ojo: (rig().eyeBones || []).map((b) => b.name) };
      },
    },
    alcanzar: {
      d: 'Reach Target: desde el fotograma f la mano va al objetivo y lo sigue (IK; el cuerpo acompaña si no llega). Sin objetivo: lo suelta. quitar: borra los alcances puestos a mano.',
      a: { mano: 'R | L | ambas', objetivo: 'nombre o id (vacío = suelta)', f: 'fotograma (por defecto el actual)', palma: 'libre | abajo', transicion: 0.5, quitar: false },
      fn: (a) => {
        const A = app.aimUI;
        const chs = a.mano === 'ambas' ? ['handR', 'handL'] : [a.mano === 'L' ? 'handL' : 'handR'];
        if (a.quitar) A.clear(['handL', 'handR']);
        else for (const ch of chs) A.set(ch, a.objetivo ? targetId(a.objetivo) : null, { f: a.f, blend: a.transicion, palm: a.palma === 'abajo' ? 'down' : undefined });
        eng().evaluate(eng().frame);
        const st = (c) => (eng().ikState[c] ? { peso: +eng().ikState[c].reachW.toFixed(2), alcance: +eng().ikState[c].reach.toFixed(2) } : null);
        return { handR: eng().doc.aim?.handR || [], handL: eng().doc.aim?.handL || [], ahora: { handR: st('handR'), handL: st('handL') } };
      },
    },
    plan: {
      d: 'Motion Planning: el plan del Motion Director como nodos con condiciones y ramas. nodo añade uno (después de «despues_de» o al final); conectar une una salida (siguiente | si | no) con otro nodo (o «fin»); decision fija el valor de prueba de una decisión.',
      a: {
        accion: 'estado | nodo | conectar | quitar | inicio | decision | editar | abrir',
        tipo: 'ir | girar | accion | esperar | mirar | alcanzar | condicion | decision | dialogo | emocion | camara',
        id: 'id propio del nodo (opcional)', despues_de: 'id del nodo anterior', objetivo: 'nombre de objetivo', parar: 'm antes del objetivo (ir)', clip: 'id de clip (accion)', mantener: 's', asiento: 'm', repeticiones: 1, segundos: 1, grados: 90,
        mano: 'R | L | ambas', palma: 'abajo', espera: 's que el plan espera en mirar / alcanzar',
        comprueba: 'distancia | posicion | ocupado | zona | decision', de: 'objetivo (vacío = personaje)', a: 'objetivo', op: 'menos | mas', valor: 1, fuera: false, variable: 'nombre de la decisión', vale: true,
        texto: 'texto del diálogo / emoción / cámara', quien: 'personaje',
        desde: 'id del nodo (conectar)', salida: 'siguiente | si | no', hasta: 'id del nodo o fin',
      },
      fn: (a) => {
        const D = app.directorUI;
        const P = app.plannerUI;
        const stepOf = (v) => {
          const st = eng().doc.director?.steps || [];
          const s = typeof v === 'number' ? st[v] : st.find((x) => x.id === v);
          if (!s) throw new Error(`No existe el nodo ${v}`);
          return s;
        };
        const tg = (v) => (v ? targetId(v) : undefined);
        switch (a.accion) {
          case undefined: case 'estado': break;
          case 'abrir': app.topmenu.openMenu('plan'); break;
          case 'nodo': {
            const hand = a.mano === 'ambas' ? 'both' : a.mano === 'L' ? 'L' : 'R';
            const CH = { distancia: 'distance', posicion: 'position', ocupado: 'placement', zona: 'zone', decision: 'bool' };
            const defs = {
              ir: () => ({ type: 'goto', ...(a.objetivo ? { target: tg(a.objetivo) } : { to: [+a.x || 0, +a.z || 0] }), ...(a.parar ? { stop: +a.parar } : {}), ...(a.mirar !== undefined ? { face: a.mirar * D2R } : {}) }),
              girar: () => ({ type: 'turn', ...(a.objetivo ? { target: tg(a.objetivo) } : { yaw: (+a.grados || 0) * D2R }) }),
              accion: () => {
                if (!app.library.has(a.clip)) throw new Error(`No existe el clip ${a.clip}`);
                return { type: 'action', clip: a.clip, ...(a.mantener ? { hold: +a.mantener } : {}), ...(a.asiento !== undefined ? { seat: +a.asiento } : {}), ...(a.repeticiones ? { loops: +a.repeticiones } : {}) };
              },
              esperar: () => ({ type: 'wait', seconds: +a.segundos || 1 }),
              mirar: () => ({ type: 'look', ...(a.objetivo ? { target: tg(a.objetivo) } : {}), ...(a.espera ? { hold: +a.espera } : {}), ...(a.transicion !== undefined ? { blend: +a.transicion } : {}) }),
              alcanzar: () => ({ type: 'reach', hand, ...(a.objetivo ? { target: tg(a.objetivo) } : {}), ...(a.palma === 'abajo' ? { palm: 'down' } : {}), ...(a.espera !== undefined ? { hold: +a.espera } : {}) }),
              condicion: () => ({ type: 'if', check: CH[a.comprueba] || 'distance', ...(a.de ? { a: tg(a.de) } : {}), ...(a.a ? { b: tg(a.a) } : {}), ...(a.op === 'mas' ? { op: 'gt' } : {}), ...(a.valor !== undefined ? { value: +a.valor } : {}), ...(a.fuera ? { exit: true } : {}), ...(a.variable ? { var: a.variable } : {}) }),
              decision: () => ({ type: 'set', var: a.variable || 'decision', value: a.vale !== false }),
              dialogo: () => ({ type: 'note', kind: 'dialog', text: a.texto || '', seconds: +a.segundos || 0, ...(a.quien ? { who: a.quien } : {}) }),
              emocion: () => ({ type: 'note', kind: 'emotion', text: a.texto || '', seconds: +a.segundos || 0 }),
              camara: () => ({ type: 'note', kind: 'camera', text: a.texto || '', seconds: +a.segundos || 0 }),
            };
            if (!defs[a.tipo]) throw new Error(`tipo: ${Object.keys(defs).join(', ')}`);
            const def = { ...defs[a.tipo](), ...(a.nombre ? { label: a.nombre } : {}) };
            const id = P.add(def, a.despues_de !== undefined ? stepOf(a.despues_de) : (eng().doc.director?.steps || []).at(-1) || null);
            if (a.id) D.edit((d) => {
              // id propio, para poder conectarlo después por nombre
              const s = d.steps.find((x) => x.id === id);
              for (const o of d.steps) for (const port of ['next', 'yes', 'no']) if (o[port] === id) o[port] = a.id;
              s.id = a.id;
            });
            break;
          }
          case 'conectar': {
            const s = stepOf(a.desde);
            const port = { si: 'yes', no: 'no' }[a.salida] || 'next';
            D.edit(() => (a.hasta === 'fin' ? (s[port] = null) : a.hasta === undefined || a.hasta === 'siguiente' ? delete s[port] : (s[port] = stepOf(a.hasta).id)));
            break;
          }
          case 'editar': {
            const s = stepOf(a.id);
            D.edit(() => Object.assign(s, a.campos || {}));
            break;
          }
          case 'quitar': P.remove(stepOf(a.id).id); break;
          case 'inicio': D.edit((d) => (d.entry = stepOf(a.id).id)); break;
          case 'decision': D.edit((d) => ((d.vars ||= {})[a.variable] = a.vale !== false)); break;
          default: throw new Error('Acción desconocida');
        }
        const st = D.state();
        return { nodos: st.pasos.map((s) => ({ id: s.id, tipo: s.type, etiqueta: s.etiqueta, fotogramas: s.fotogramas, ...(s.resultado !== undefined ? { resultado: s.resultado } : {}), ...(s.next !== undefined ? { siguiente: s.next } : {}), ...(s.yes !== undefined ? { si: s.yes } : {}), ...(s.no !== undefined ? { no: s.no } : {}) })), orden: st.orden, bucle_cortado: st.bucle_cortado, fin: st.fin, decisiones: eng().doc.director?.vars || {}, marcas: st.marcas };
      },
    },
    modo: {
      d: 'Modo de trabajo: maniqui (animación general, para todos los personajes) o escena (el personaje en su escenario, solo esa escena). guardar: guarda la animación general en Tuyas.',
      a: { modo: 'maniqui | escena', guardar: 'nombre con el que guardar la animación general' },
      fn: async (a) => {
        if (a.modo) await app.modes.set(a.modo);
        let guardada = null;
        if (a.guardar) guardada = await app.modes.saveGeneral(String(a.guardar));
        return { modo: app.mode, personaje: app.charMeta.name, guardada };
      },
    },
    escena: {
      d: 'Dentro del Estudio, «En escena» trabaja sobre el escenario vivo de la historia (mismo motor que el Editor y el Estudio). estado, encender o apagar (apagado: visor propio del Taller).',
      a: { accion: 'estado | encender | apagar' },
      fn: async (a) => {
        const L = app.sceneLive;
        if (a.accion === 'encender') {
          L.wanted = true;
          await L.start();
        } else if (a.accion === 'apagar') L.setWanted(false);
        const vp = app.viewport;
        const hips = rig().bone('hips')?.getWorldPosition(new THREE.Vector3());
        const r = (v) => v.toArray().map((x) => +x.toFixed(3));
        return {
          en_vivo: L.on, dentro_del_estudio: !!app.studioLink?.embedded, personaje: app.charMeta.name, modo: app.mode,
          escala: +L.scale.toFixed(4), camara: r(vp.camera.position), objetivo: r(vp.orbit.target), fov: vp.persp.fov,
          camara_escenario: L.on ? r(vp.camera.position.clone().applyMatrix4(L.X)) : null, objetivo_escenario: L.on ? r(vp.orbit.target.clone().applyMatrix4(L.X)) : null,
          cadera: hips ? r(hips) : null, cadera_escenario: L.on && hips ? r(hips.clone().applyMatrix4(L.X)) : null,
          visor: [vp.container.clientWidth, vp.container.clientHeight],
          vista_del_estudio_al_entrar: L.beginShot || null,
        };
      },
    },
    menu: {
      d: 'Menú superior de herramientas de animación: abrir/cerrar un desplegable, fijarlo, o devolver los paneles a la columna derecha.',
      a: { abrir: 'mover | transformar | rig | ajustar | tira | capas | director | plan | look | reach', cerrar: 'id', fijar: 'id', paneles: 'arriba | columna' },
      fn: (a) => {
        const T = app.topmenu;
        if (a.paneles) T.setDock(a.paneles === 'columna' ? 'side' : 'top');
        if (a.abrir) T.openMenu(a.abrir);
        if (a.fijar) T.pin(a.fijar);
        if (a.cerrar) T.close(a.cerrar);
        return { paneles: T.dock === 'top' ? 'arriba' : 'columna', fijados: [...T.pinned] };
      },
    },
    // ---------- Herramientas (add-on de Blender «Herramientas», MIT, reimplementado) ----------
    ikCambiar: {
      d: 'IK ⇄ FK sin saltos en el fotograma (la pose no se mueve; a FK se hornea lo que hacía el IK en todo el rango).',
      a: { cadena: 'handL | handR | footL | footR', ik: true, f: '' },
      fn: (a) => {
        if (!IK_CHAINS[a.cadena]) throw new Error('Cadena: handL, handR, footL o footR');
        app.pushUndo();
        eng().switchIK(a.cadena, a.ik !== false, frameOf(a));
        app.changed();
        return { cadena: a.cadena, ik: !!eng().doc.ik[a.cadena] };
      },
    },
    controlTemporal: {
      d: 'Crea un control temporal en [desde, hasta]: tipo "ik" (mano/pie como objetivo absoluto en el mundo, editable fotograma a fotograma) o "mundo" (el hueso conserva su giro de mundo). Devuelve su id.',
      a: { tipo: 'ik | mundo', cadena: 'footR (tipo ik)', hueso: 'head (tipo mundo)', desde: 0, hasta: 60 },
      fn: (a) => {
        app.pushUndo();
        const t = a.tipo === 'mundo' ? createTempWorld(eng(), boneOf(a.hueso), a.desde, a.hasta) : createTempIK(eng(), a.cadena, a.desde, a.hasta);
        if (!t) throw new Error('No se pudo crear (¿cadena/hueso válido? ¿capa bloqueada?)');
        app.changed();
        return { id: t.id, tipo: t.kind, desde: t.a, hasta: t.b, claves: t.keys };
      },
    },
    controlesTemporales: { d: 'Lista los controles temporales.', fn: () => (eng().doc.temp || []).map((t) => ({ id: t.id, tipo: t.kind, de: t.chain || t.bone, desde: t.a, hasta: t.b })) },
    hornearControl: {
      d: 'Hornea un control temporal a claves FK (solo las necesarias) y lo quita. cancelar: true lo quita sin hornear (vuelve a como estaba). precision en grados (0.6) o "cada" para una clave por fotograma.',
      a: { id: 'tmp…', cancelar: false, precision: 0.6 },
      fn: (a) => {
        app.pushUndo();
        if (a.cancelar) {
          cancelTemp(eng(), a.id);
          app.changed();
          return { cancelado: a.id };
        }
        const r = bakeTemp(eng(), a.id, a.precision === 'cada' ? { every: true } : { tolDeg: +a.precision || 0.6 });
        app.changed();
        return r || { error: 'no existe' };
      },
    },
    hornear: {
      d: 'Hornea a FK lo que se ve (IK, Look At, controles…) en los huesos dados y el rango, con claves inteligentes. Una cadena en IK pasa a FK.',
      a: { huesos: ['upperLegR', 'lowerLegR', 'footR'], desde: 0, hasta: 60, precision: 0.6 },
      fn: (a) => {
        const bs = (a.huesos || []).map(boneOf);
        app.pushUndo();
        const chains = Object.keys(IK_CHAINS).filter((c) => IK_CHAINS[c].bones.some((x) => bs.includes(rig().bone(x))) && eng().doc.ik[c]);
        const [r0, r1] = eng().range();
        const fr = Array.from({ length: (a.hasta ?? r1) - (a.desde ?? r0) + 1 }, (_, i) => (a.desde ?? r0) + i);
        for (const c of chains) for (const x of eng().ikBakeBones(c, fr)) if (!bs.includes(x)) bs.push(x); // columna y hombro si el IK los inclinaba
        const r = bakeBones(eng(), bs, [a.desde ?? r0, a.hasta ?? r1], { ...(a.precision === 'cada' ? { every: true } : { tolDeg: +a.precision || 0.6 }), before: () => chains.forEach((c) => (eng().doc.ik[c] = false)) });
        app.changed();
        return r;
      },
    },
    trayectoria: {
      d: 'Muestra u oculta la trayectoria editable de lo elegido; con "mover" lleva el punto del fotograma f a una posición de mundo (metros) y le pone clave.',
      a: { visible: true, modo: 'win | all', ventana: 30, influencia: 6, mover: { cadena: 'footR', hueso: 'hips', f: 12, pos: [0, 0.3, 0.2], influencia: 6 } },
      fn: (a) => {
        if (a.visible !== undefined || a.modo || a.ventana || a.influencia !== undefined) app.pathView.set({ ...(a.visible !== undefined ? { on: !!a.visible } : {}), ...(a.modo ? { mode: a.modo } : {}), ...(a.ventana ? { win: +a.ventana } : {}), ...(a.influencia !== undefined ? { falloff: Math.max(0, +a.influencia || 0) } : {}) });
        if (a.mover) {
          const m = a.mover;
          const t = m.cadena ? { kind: 'ik', chain: m.cadena } : { kind: 'bone', bone: boneOf(m.hueso) };
          app.pushUndo();
          // influencia: las claves vecinas acompañan con caída suave (por defecto, la del visor)
          movePathPointSoft(eng(), t, Math.round(m.f), new THREE.Vector3(...m.pos), { limits: app.limits !== false, falloff: m.influencia ?? app.pathView.opts.falloff ?? 0 });
          app.changed();
        }
        return { trayectoria: app.pathView.opts };
      },
    },
    intercalar: {
      d: 'Mezcla la pose de los huesos en f (con clave): modo "inbetween" (−1 clave anterior … 1 siguiente), "mirror" (0…1 hacia el otro lado reflejado) o "base" (0…1 hacia la pose sin esta capa). espacio: world | local.',
      a: { huesos: ['head'], f: '', modo: 'inbetween', valor: 0.5, espacio: 'world' },
      fn: (a) => {
        const bs = (a.huesos || []).map(boneOf);
        app.pushUndo();
        const job = prepareBlend(eng(), bs, frameOf(a), { mode: a.modo || 'inbetween', space: a.espacio || 'world' });
        if (!job) throw new Error('Nada que mezclar (¿huesos? ¿capa bloqueada?)');
        job.apply(+a.valor || 0);
        app.changed();
        return { ok: true };
      },
    },
    copiarMatriz: {
      d: 'Copia la matriz de mundo (tipo "mundo") o la relación con el hueso activo (tipo "relativa": activo + huesos). Queda en el portapapeles de Herramientas.',
      a: { tipo: 'mundo | relativa', huesos: ['handR'], activo: 'head', f: '' },
      fn: (a) => {
        const bs = (a.huesos || []).map(boneOf);
        const f = frameOf(a);
        app.toolsUI.state.clip = a.tipo === 'relativa' ? copyRelative(eng(), boneOf(a.activo), [boneOf(a.activo), ...bs], f) : copyWorld(eng(), bs, f);
        eng().evaluate(eng().frame);
        app.toolsUI.render();
        return { tipo: app.toolsUI.state.clip.kind, huesos: app.toolsUI.state.clip.items.length };
      },
    },
    pegarMatriz: {
      d: 'Pega lo copiado con copiarMatriz en [desde, hasta] (mundo: en cada fotograma; relativa: claves solo donde hacen falta).',
      a: { desde: 0, hasta: 0 },
      fn: (a) => {
        const c = app.toolsUI.state.clip;
        if (!c) throw new Error('Copia primero con copiarMatriz');
        app.pushUndo();
        const f = Math.round(eng().frame);
        const n = pasteMatrix(eng(), c, a.desde ?? f, a.hasta ?? a.desde ?? f);
        app.changed();
        return { claves: n };
      },
    },
    desfase: {
      d: 'Desfase en cascada de las claves (capa activa): el hueso i se desplaza n·i fotogramas en el orden dado (solapamiento: cadera, columna, cabeza…).',
      a: { huesos: ['spine', 'chest', 'neck', 'head'], n: 2 },
      fn: (a) => {
        const layer = eng().layer();
        const groups = (a.huesos || []).map((x) => tracksOfBone(layer, boneOf(x))).filter((g) => g.length);
        if (!groups.length) throw new Error('Esos huesos no tienen claves en la capa activa');
        app.pushUndo();
        const moved = offsetCascade(layer, groups, +a.n || 0, snapshotTracks(layer, groups.flat()));
        app.changed();
        return { claves: moved };
      },
    },
    compartirClaves: {
      d: 'Los huesos dados acaban con clave en los mismos fotogramas (unión), sin cambiar sus valores.',
      a: { huesos: ['upperArmL', 'lowerArmL', 'handL'] },
      fn: (a) => {
        const layer = eng().layer();
        const ids = (a.huesos || []).flatMap((x) => tracksOfBone(layer, boneOf(x)));
        app.pushUndo();
        const r = shareKeys(layer, ids);
        app.changed();
        return r;
      },
    },
    marcador: {
      d: 'Marcadores del retimer: añade en f (accion "poner"), quita por id ("quitar") o lista ("ver").',
      a: { accion: 'poner | quitar | ver', f: '', nombre: '', id: '' },
      fn: (a) => {
        const doc = eng().doc;
        if (a.accion === 'quitar') {
          app.pushUndo();
          removeMarker(doc, a.id);
          app.changed();
        } else if (a.accion !== 'ver') {
          app.pushUndo();
          addMarker(doc, frameOf(a), a.nombre || '');
          app.changed();
        }
        return (doc.markers || []).map((m) => ({ id: m.id, nombre: m.name, f: m.f }));
      },
    },
    retimer: {
      d: 'Mueve un marcador a otro fotograma: el tiempo entre sus vecinos se estira o encoge (claves y, con base: true, también las tiras/mocap). capas: all | active.',
      a: { id: 'mk…', f: 40, capas: 'all', base: true },
      fn: (a) => {
        app.pushUndo();
        const r = retimeMarker(eng(), a.id, +a.f, { scope: a.capas === 'active' ? 'active' : 'all', strips: a.base !== false });
        app.changed();
        return r || { sinCambios: true };
      },
    },
    multikey: {
      d: 'Multikey: en las claves de los huesos dados (capa activa) escala el movimiento respecto a su neutro (escala 1 = igual) o añade variación repetible (variar 0…1, semilla).',
      a: { huesos: ['head'], escala: 1.5, variar: 0, semilla: 1 },
      fn: (a) => {
        const layer = eng().layer();
        const ids = (a.huesos || []).flatMap((x) => tracksOfBone(layer, boneOf(x)));
        if (!ids.length) throw new Error('Esos huesos no tienen claves en la capa activa');
        const groups = new Map(ids.map((id) => [id, new Set(layer.tracks[id].map((k) => k.f))]));
        app.pushUndo();
        let n = 0;
        if (a.escala !== undefined && +a.escala !== 1) n += multikeyScale(layer, groups, +a.escala, snapshotTracks(layer, ids));
        if (+a.variar > 0) n += multikeyRandom(layer, groups, +a.variar, snapshotTracks(layer, ids), { seed: +a.semilla || 1, hips: rig().hipsHeight });
        app.changed();
        return { claves: n };
      },
    },
    pivote: {
      d: 'Pivote temporal: gira los huesos dados alrededor de un punto (el de «en», pegado a ese hueso si pegado: true) los grados dados [x, y, z] (ejes del mundo), con clave en f. quitar: true lo quita.',
      a: { en: 'footL', girar: ['hips'], grados: [0, 90, 0], pegado: true, f: '', quitar: false },
      fn: (a) => {
        const pv = app.pivotView;
        if (a.quitar) return pv.clear(), { pivote: null };
        const f = frameOf(a);
        eng().evaluate(f);
        if (a.en) pv.place({ bone: boneOf(a.en), follow: a.pegado !== false });
        if (!pv.active) throw new Error('Pon el pivote con «en»');
        if (a.girar) pv.setTargets(a.girar.map(boneOf));
        if (a.grados && pv.targets.length) {
          app.pushUndo();
          eng().evaluate(f);
          const P = pivotWorld(rig(), pv.pivot);
          const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(...a.grados.map((x) => (+x || 0) * D2R)));
          rotateAroundPivot(eng(), f, captureTargets(pv.targets), P, R);
          app.changed();
        }
        return { pivote: pv.pivotLabel, gira: pv.targets.map((b) => rig().canonOf.get(b) || b.name) };
      },
    },
    deshacer: { d: 'Deshace.', fn: () => (app.undo(), { ok: true }) },
    rehacer: { d: 'Rehace.', fn: () => (app.redo(), { ok: true }) },
    interpolaciones: { d: 'Tipos de interpolación.', fn: () => Object.fromEntries(INTERPS) },
    pose_actual: {
      d: 'Rotaciones locales actuales (grados) de los huesos mapeados en el fotograma.',
      a: { f: null },
      fn: (a) => {
        if (a.f !== null && a.f !== undefined) app.setFrame(a.f);
        eng().evaluate(eng().frame);
        const out = {};
        for (const [c, n] of Object.entries(rig().mapping)) {
          const b = rig().byName.get(n);
          const e = new THREE.Euler().setFromQuaternion(b.quaternion);
          out[c] = [e.x, e.y, e.z].map((x) => +(x / D2R).toFixed(1));
        }
        return out;
      },
    },
  };

  /** Objetivo por nombre o id. */
  function targetId(v) {
    const t = app.directorUI.target(v);
    if (!t) throw new Error(`No existe el objetivo «${v}». Créalo con el comando objetivo.`);
    return t.id;
  }
  function setInterp(track, f, mode) {
    if (!mode) return;
    const k = eng().layer().tracks[track]?.find((x) => x.f === Math.round(f));
    if (k) k.i = mode;
  }
  function stripOf(t) {
    const s = typeof t === 'number' ? eng().doc.strips[t] : eng().doc.strips.find((x) => x.id === t);
    if (!s) throw new Error('No existe la tira ' + t);
    return s;
  }
  function pickStrip(a) {
    const o = {};
    const map = { inicio: 'start', duracion: 'len', fundido: 'blend', velocidad: 'speed', bucle: 'loop', en_sitio: 'inPlace', espejo: 'mirror', al_reves: 'reverse', silencio: 'mute' };
    for (const [k, v] of Object.entries(map)) if (a[k] !== undefined) o[v] = a[k];
    return o;
  }

  async function run(cmd, args = {}) {
    const c = C[cmd];
    if (!c) throw new Error(`Comando desconocido «${cmd}». Usa 'ayuda'.`);
    const a = args || {};
    // La biblioteca se carga como fichas: antes del comando, las pistas de los clips que nombra y de los que ya están en uso.
    const ids = [a.id, a.clip, ...(Array.isArray(a.clips) ? a.clips : []), ...app.docClipIds()].filter((x) => typeof x === 'string');
    await app.ensureClips(ids);
    // algunos comandos antiguos usan «f» en vez de «fn» (anclar, fijarPies, dedos, curva…): antes fallaban todos
    const out = await (c.fn || c.f)(a);
    // El comando pudo poner clips nuevos: dejarlos listos antes de responder.
    await app.ensureClips(app.docClipIds());
    return out;
  }
  app.ia = { run, comandos: C };

  if (import.meta.hot) {
    import.meta.hot.on('taller:cmd', async ({ id, cmd, args, session }) => {
      const currentSession=new URLSearchParams(location.search).get('studioSession');
      if((session||null)!==currentSession)return;
      try {
        const result = await run(cmd, args);
        import.meta.hot.send('taller:res', { id, ok: true, result: JSON.parse(JSON.stringify(result ?? null)) });
      } catch (e) {
        import.meta.hot.send('taller:res', { id, ok: false, error: e.message });
      }
    });
    import.meta.hot.send('taller:hola', {});
  }
}
