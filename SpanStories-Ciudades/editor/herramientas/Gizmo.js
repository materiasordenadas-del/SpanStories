// Manipulador 3D con ratón (TransformControls), pensado como el del Taller de animación:
//  · modo, espacio, imán y tamaño se eligen en pantalla (la UI llama a los setters; las teclas son solo atajos);
//  · el eje bajo el puntero y el eje en uso se publican en `estado.eje` (colores fijos X rojo · Y verde · Z azul);
//  · mientras se arrastra, `estado.hud` describe el cambio («Mover X +1,20 m») y una guía marca el eje;
//  · el objeto no atraviesa el suelo ni otros objetos (Colision.js); Alt suspende esas restricciones;
//  · varios objetos se mueven como un bloque y el arrastre entero es UNA entrada del historial.
import * as T from '../../engine/three.js';
import { TransformControls } from '../../vendor/TransformControls.js';
import { capturarObjeto } from '../../engine/CityProject.js';
import { resolverMovimiento, cajaDeRaiz } from './Colision.js';

export const COLOR_EJE = Object.freeze({ X: '#ff5a5a', Y: '#5fe05f', Z: '#5a8dff' });
const BASE = { translate: 1, rotate: 2, scale: .9 };        // los aros de giro son más grandes, como en el Taller
const GUIA = 400;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d).replace('.', ',');

export function montarGizmo({ scene, camera, canvas, objetos, seleccion, editor, ground = () => 0, obstaculos = () => [], capas = null, atlas = null,
  status = () => {}, preferencias = { leer: (_k, v) => v, escribir() {} } }) {
  const estado = {
    modo: 'translate', espacio: 'world', iman: false, colision: preferencias.leer('colision', true), apoyo: preferencias.leer('apoyo', true),
    tamano: Math.min(3, Math.max(.5, +preferencias.leer('tamano', 1) || 1)), pasos: { mover: .5, girar: 15, escalar: .1, ...preferencias.leer('pasos', {}) },
    eje: null, arrastrando: false, choca: [], hud: '', editable: false, cantidad: 0,
  };
  const oyentes = new Set(), avisar = () => { for (const fn of oyentes) fn(estado); };

  const gizmo = new TransformControls(camera, canvas);
  const ayudante = gizmo.getHelper();
  // Sin la esfera central ni el aro de pantalla: tapaban el objeto y robaban clics (mismo ajuste que el Taller).
  const tg = gizmo._gizmo;
  for (const grupo of [tg?.gizmo?.rotate, tg?.picker?.rotate]) for (const h of [...(grupo?.children ?? [])]) if (h.name === 'E' || h.name === 'XYZE') grupo.remove(h);
  // El render estilizado dibuja aparte lo marcado como overlay (capa 31): el gizmo queda siempre por delante.
  const marcarOverlay = o => o.traverse(n => { n.userData.ignorarSeleccion = true; if (n.isMesh || n.isLine) { n.userData.editorOverlay = true; n.layers.set(31); } });
  marcarOverlay(ayudante); gizmo.getRaycaster().layers.enableAll(); scene.add(ayudante);

  const pivote = new T.Object3D(); pivote.userData.ignorarSeleccion = true; scene.add(pivote);
  const guias = {};
  for (const eje of ['X', 'Y', 'Z']) {
    const g = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
    const linea = new T.Line(g, new T.LineBasicMaterial({ color: COLOR_EJE[eje], depthTest: false, transparent: true, opacity: .9 }));
    linea.visible = false; linea.renderOrder = 999; marcarOverlay(linea); scene.add(linea); guias[eje] = linea;
  }

  let activo = true, liberado = false, objetivos = [], inicio = [], antes = [], temporalImantado = false, temporalLibre = false, adjunto = false;
  const pivoteInicio = new T.Matrix4(), delta = new T.Matrix4(), tmp = new T.Matrix4(), caja = new T.Box3(), union = new T.Box3();
  const ejeVec = { X: new T.Vector3(1, 0, 0), Y: new T.Vector3(0, 1, 0), Z: new T.Vector3(0, 0, 1) };

  const editable = r => !!(r && editor && r.parent && (!r.userData.atlasBounds || r.userData.atlasEditable) && !capas?.bloqueado(r.userData.id));
  const elegidos = () => seleccion.raices().filter(editable);
  const idsOf = lista => new Set(lista.map(r => r.userData.id));

  function aplicarTamano() { gizmo.setSize((BASE[gizmo.mode] ?? 1) * estado.tamano); }
  function aplicarImanes() {
    const on = estado.iman || temporalImantado;
    gizmo.setTranslationSnap(on ? estado.pasos.mover : null);
    gizmo.setRotationSnap(on ? T.MathUtils.degToRad(estado.pasos.girar) : null);
    gizmo.setScaleSnap(on ? estado.pasos.escalar : null);
  }
  const huecoCaja = r => cajaDeRaiz(r, caja);

  function colocarPivote() {
    objetivos = elegidos();
    union.makeEmpty();
    for (const r of objetivos) union.union(huecoCaja(r).clone());
    if (union.isEmpty() && objetivos[0]) objetivos[0].getWorldPosition(pivote.position); else union.getCenter(pivote.position);
    if (objetivos.length === 1) objetivos[0].getWorldQuaternion(pivote.quaternion); else pivote.quaternion.identity();
    pivote.scale.set(1, 1, 1); pivote.updateMatrixWorld(true);
    pivoteInicio.copy(pivote.matrixWorld);
    inicio = objetivos.map(r => r.matrixWorld.clone());
  }

  function sync() {
    if (liberado) return;
    const lista = elegidos(), puede = activo && lista.length > 0;
    const misma = puede && adjunto && lista.length === objetivos.length && lista.every((r, i) => r === objetivos[i]);
    if (puede && !estado.arrastrando) { colocarPivote(); if (!misma) { gizmo.attach(pivote); adjunto = true; } }
    if (!puede && adjunto) { gizmo.detach(); adjunto = false; objetivos = []; }
    ayudante.visible = puede; estado.editable = puede; estado.cantidad = lista.length;
    if (!puede) ocultarGuias();
    avisar();
  }

  function ocultarGuias() { for (const l of Object.values(guias)) l.visible = false; }
  function mostrarGuias(ejes) {
    ocultarGuias();
    const local = gizmo.space === 'local' && objetivos.length === 1, q = pivote.quaternion;
    for (const e of ejes) {
      const dir = ejeVec[e].clone(); if (local) dir.applyQuaternion(q);
      const l = guias[e], pos = l.geometry.attributes.position;
      const a = pivote.position.clone().addScaledVector(dir, -GUIA), b = pivote.position.clone().addScaledVector(dir, GUIA);
      pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true; l.visible = true; l.computeLineDistances?.();
    }
  }
  const ejesDe = texto => (texto ?? '').split('').filter(c => 'XYZ'.includes(c));

  gizmo.addEventListener('axis-changed', e => {
    estado.eje = e.value || null;
    if (!estado.arrastrando) { if (estado.eje && estado.eje !== 'E' && estado.eje !== 'XYZ') mostrarGuias(ejesDe(estado.eje)); else ocultarGuias(); }
    avisar();
  });

  function hudDeCambio() {
    const ejes = ejesDe(estado.eje), nombre = ejes.join('') || 'XYZ';
    if (gizmo.mode === 'translate') {
      const d = pivote.position.clone().sub(new T.Vector3().setFromMatrixPosition(pivoteInicio));
      if (gizmo.space === 'local' && objetivos.length === 1) d.applyQuaternion(pivote.quaternion.clone().invert());
      return `Mover ${nombre}  ` + (ejes.length ? ejes : ['X', 'Y', 'Z']).map(e => `${e} ${fmt(d[e.toLowerCase()])} m`).join('  ');
    }
    if (gizmo.mode === 'rotate') {
      const q0 = new T.Quaternion().setFromRotationMatrix(pivoteInicio), q = pivote.quaternion.clone().multiply(q0.invert());
      const eje = ejeVec[ejes[0] ?? 'Y'], seno = new T.Vector3(q.x, q.y, q.z).dot(eje);
      let grados = T.MathUtils.radToDeg(2 * Math.atan2(seno, q.w)); if (grados > 180) grados -= 360; if (grados < -180) grados += 360;
      return `Girar ${nombre}  ${fmt(grados, 1)}°`;
    }
    const s = pivote.scale;
    return `Escalar ${nombre}  ` + (ejes.length === 1 ? `×${s[ejes[0].toLowerCase()].toFixed(2).replace('.', ',')}` : `×${s.x.toFixed(2).replace('.', ',')}`);
  }

  gizmo.addEventListener('dragging-changed', event => {
    estado.arrastrando = !!event.value;
    if (event.value) {
      antes = objetivos.map(r => capturarObjeto(r)); estado.choca = []; mostrarGuias(ejesDe(estado.eje).length && estado.eje !== 'XYZ' ? ejesDe(estado.eje) : []);
      avisar(); return;
    }
    ocultarGuias(); estado.hud = ''; estado.choca = [];
    if (!antes.length) { avisar(); return; }
    const despues = objetivos.map(r => capturarObjeto(r)), movido = despues.some((d, i) => ['position', 'rotation', 'scale'].some(k => d[k].some((v, j) => Math.abs(v - antes[i][k][j]) > 1e-6)));
    // Se vuelve al estado previo y se aplica por el editor: así el arrastre entra en el historial y en «Guardar».
    objetivos.forEach((r, i) => { r.position.fromArray(antes[i].position); r.rotation.set(...antes[i].rotation, antes[i].rotationOrder); r.scale.fromArray(antes[i].scale); r.updateMatrixWorld(true); r.userData.instanceBinding?.sync?.(); });
    const ids = objetivos.map(r => r.userData.id);
    antes = [];
    if (movido) {
      try { editor.applyMany(ids.map((id, i) => ({ id, data: { position: despues[i].position, rotation: despues[i].rotation, scale: despues[i].scale } }))); }
      catch (error) { status(error.message); }
    }
    sync();
  });

  gizmo.addEventListener('objectChange', () => {
    if (!objetivos.length) return;
    pivote.updateMatrixWorld(true);
    delta.copy(pivote.matrixWorld).multiply(tmp.copy(pivoteInicio).invert());
    objetivos.forEach((r, i) => {
      const m = new T.Matrix4().multiplyMatrices(delta, inicio[i]);
      if (r.parent) { r.parent.updateMatrixWorld(true); m.premultiply(tmp.copy(r.parent.matrixWorld).invert()); }
      m.decompose(r.position, r.quaternion, r.scale); r.updateMatrixWorld(true);
    });
    restringir();
    objetivos.forEach(r => r.userData.instanceBinding?.sync?.());
    estado.hud = hudDeCambio();
    if (scene.userData.alCambiarSeleccion) scene.userData.alCambiarSeleccion();
    avisar();
  });

  /** Suelo y objetos: se corrige el BLOQUE entero con un mismo desplazamiento. */
  function restringir() {
    if (temporalLibre || (!estado.colision && !estado.apoyo)) { estado.choca = []; return; }
    union.makeEmpty(); for (const r of objetivos) union.union(huecoCaja(r).clone());
    const resultado = resolverMovimiento({ caja: union, ground, obstaculos: obstaculos(), ignorar: idsOf(objetivos), apoyar: estado.apoyo, chocar: estado.colision });
    estado.choca = resultado.choca;
    if (!resultado.delta.lengthSq()) return;
    for (const r of objetivos) {
      const mundo = r.getWorldPosition(new T.Vector3()).add(resultado.delta);
      r.parent ? r.parent.worldToLocal(mundo) : null; r.position.copy(mundo); r.updateMatrixWorld(true);
    }
  }

  const alTeclaAbajo = e => {
    if (e.key === 'Control' && !temporalImantado) { temporalImantado = true; aplicarImanes(); }
    if (e.key === 'Alt' && !temporalLibre) { temporalLibre = true; }
  };
  const alTeclaArriba = e => {
    if (e.key === 'Control') { temporalImantado = false; aplicarImanes(); }
    if (e.key === 'Alt') temporalLibre = false;
  };
  const alPerderFoco = () => { temporalImantado = temporalLibre = false; aplicarImanes(); };
  window.addEventListener('keydown', alTeclaAbajo); window.addEventListener('keyup', alTeclaArriba); window.addEventListener('blur', alPerderFoco);
  aplicarTamano(); aplicarImanes(); gizmo.setSpace('world');

  const guardar = (k, v) => { try { preferencias.escribir(k, v); } catch { /* sin almacenamiento */ } };
  return {
    estado, sync, alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    setModo(modo) { if (!BASE[modo]) return; estado.modo = modo; gizmo.setMode(modo); aplicarTamano(); ocultarGuias(); avisar(); },
    setEspacio(espacio) { estado.espacio = espacio === 'local' ? 'local' : 'world'; gizmo.setSpace(estado.espacio); sync(); },
    setImanado(v) { estado.iman = !!v; aplicarImanes(); avisar(); },
    setPasos(p) { estado.pasos = { ...estado.pasos, ...p }; guardar('pasos', estado.pasos); aplicarImanes(); avisar(); },
    setTamano(v) { estado.tamano = Math.round(Math.min(3, Math.max(.5, +v || 1)) * 100) / 100; guardar('tamano', estado.tamano); aplicarTamano(); avisar(); },
    setColision(v) { estado.colision = !!v; guardar('colision', estado.colision); avisar(); },
    setApoyo(v) { estado.apoyo = !!v; guardar('apoyo', estado.apoyo); avisar(); },
    /** true si el gizmo tiene el puntero (encima de un eje o arrastrando): la cámara y la selección no deben reaccionar. */
    active(event) {
      if (!adjunto || !activo) return false;
      if (event && !gizmo.dragging && event.type === 'pointerdown') gizmo.pointerHover(gizmo._getPointer(event));
      return gizmo.dragging || gizmo.axis !== null;
    },
    enabled(v) { activo = !!v; if (!activo && gizmo.dragging) gizmo.pointerUp({ button: 0 }); sync(); },
    dispose() {
      liberado = true; window.removeEventListener('keydown', alTeclaAbajo); window.removeEventListener('keyup', alTeclaArriba); window.removeEventListener('blur', alPerderFoco);
      gizmo.detach(); gizmo.dispose(); ayudante.removeFromParent(); pivote.removeFromParent();
      for (const l of Object.values(guias)) { l.removeFromParent(); l.geometry.dispose(); l.material.dispose(); }
      oyentes.clear();
    },
  };
}
