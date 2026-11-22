// Interacción con el ratón sobre el visor (modo Editor). Una sola fuente de verdad para:
//   · clic izquierdo = seleccionar (Mayús suma/quita);
//   · arrastrar con el IZQUIERDO un objeto ya seleccionado = deslizarlo por el suelo (sin atravesar nada);
//   · arrastrar con el DERECHO un objeto seleccionado = subirlo/bajarlo;
//   · clic DERECHO sin arrastrar = menú contextual (sobre objeto o sobre vacío);
//   · arrastrar en vacío = lo de siempre (la cámara: izquierdo gira, derecho desplaza).
// Escucha en la fase de captura del contenedor para que la cámara no reaccione cuando el gesto es de edición.
import * as T from '../../engine/three.js';
import { capturarObjeto } from '../../engine/CityProject.js';
import { resolverMovimiento, cajaDeRaiz } from './Colision.js';

const UMBRAL = 4;   // píxeles antes de considerar «arrastre»

export function montarInteraccion({ host, canvas, camera, scene, objetos, seleccion, editor, capas = null, ground = () => 0, obstaculos = () => [],
  gizmo, activo = () => true, mostrarMenu = () => {}, expandir = ids => ids, ajustes = { colision: () => true, apoyo: () => true }, status = () => {} }) {
  const rayo = new T.Raycaster(), puntero = new T.Vector2(), plano = new T.Plane(), punto = new T.Vector3();
  const caja = new T.Box3(), union = new T.Box3();
  let gesto = null, libre = false;

  const rect = () => canvas.getBoundingClientRect();
  function apuntar(e) {
    const r = rect(); puntero.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); rayo.setFromCamera(puntero, camera);
  }
  function entradaBajo(e) {
    apuntar(e);
    return objetos.elegirImpacto(rayo.intersectObjects(scene.children, true));
  }
  const editable = r => !!(r && r.parent && (!r.userData.atlasBounds || r.userData.atlasEditable) && !capas?.bloqueado(r.userData.id));
  const idsOf = lista => new Set(lista.map(r => r.userData.id));

  function empezar(e, tipo, entrada) {
    const objetivos = seleccion.raices().filter(editable);
    if (!objetivos.length) return null;
    union.makeEmpty(); for (const r of objetivos) union.union(cajaDeRaiz(r, caja).clone());
    const centro = union.getCenter(new T.Vector3()), base = union.min.y;
    apuntar(e);
    if (tipo === 'suelo') plano.set(new T.Vector3(0, 1, 0), -base); else {
      const dir = camera.getWorldDirection(new T.Vector3()); dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize().negate();
      plano.setFromNormalAndCoplanarPoint(dir, centro);
    }
    if (!rayo.ray.intersectPlane(plano, punto)) return null;
    return { tipo, x: e.clientX, y: e.clientY, boton: e.button, entrada, objetivos, antes: objetivos.map(capturarObjeto), inicio: punto.clone(), movido: false };
  }

  function mover(e) {
    const g = gesto; if (!g) return;
    if (!g.movido && Math.hypot(e.clientX - g.x, e.clientY - g.y) <= UMBRAL) return;
    g.movido = true;
    if (!g.objetivos) return;                              // gesto de clic derecho en vacío: la cámara lo gestiona
    apuntar(e);
    if (!rayo.ray.intersectPlane(plano, punto)) return;
    const d = punto.clone().sub(g.inicio);
    if (g.tipo === 'suelo') d.y = 0; else { d.x = 0; d.z = 0; }
    g.objetivos.forEach((r, i) => {
      const mundo = new T.Vector3().fromArray(g.antes[i].position);
      if (r.parent) r.parent.localToWorld(mundo);
      mundo.add(d); if (r.parent) r.parent.worldToLocal(mundo);
      r.position.copy(mundo); r.updateMatrixWorld(true);
    });
    restringir(g);
    g.objetivos.forEach(r => r.userData.instanceBinding?.sync?.());
    gizmo?.sync?.();
    if (scene.userData.alCambiarSeleccion) scene.userData.alCambiarSeleccion();
  }

  function restringir(g) {
    if (libre) return;
    const colision = ajustes.colision(), apoyo = ajustes.apoyo();
    if (!colision && !apoyo) return;
    union.makeEmpty(); for (const r of g.objetivos) union.union(cajaDeRaiz(r, caja).clone());
    const r = resolverMovimiento({ caja: union, ground, obstaculos: obstaculos(), ignorar: idsOf(g.objetivos), apoyar: apoyo, chocar: colision });
    if (!r.delta.lengthSq()) return;
    for (const o of g.objetivos) {
      const mundo = o.getWorldPosition(new T.Vector3()).add(r.delta);
      if (o.parent) o.parent.worldToLocal(mundo); o.position.copy(mundo); o.updateMatrixWorld(true);
    }
  }

  function terminarArrastre(g) {
    const despues = g.objetivos.map(capturarObjeto);
    g.objetivos.forEach((r, i) => { r.position.fromArray(g.antes[i].position); r.rotation.set(...g.antes[i].rotation, g.antes[i].rotationOrder); r.scale.fromArray(g.antes[i].scale); r.updateMatrixWorld(true); r.userData.instanceBinding?.sync?.(); });
    const cambio = despues.some((d, i) => d.position.some((v, j) => Math.abs(v - g.antes[i].position[j]) > 1e-6));
    if (cambio) {
      try { editor.applyMany(g.objetivos.map((r, i) => ({ id: r.userData.id, data: { position: despues[i].position } }))); }
      catch (error) { status(error.message); }
    }
    gizmo?.sync?.();
  }

  function abajo(e) {
    if (!activo() || e.target !== canvas && !canvas.contains(e.target)) return;
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 0 && gizmo?.active(e)) { gesto = { gizmo: true, x: e.clientX, y: e.clientY, boton: 0 }; return; }
    const entrada = entradaBajo(e);
    const sobreSeleccion = !!entrada && seleccion.tiene(entrada.id);
    if (sobreSeleccion) {
      const g = empezar(e, e.button === 0 ? 'suelo' : 'altura', entrada);
      if (g) { gesto = g; e.stopPropagation(); e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); gesto.pid = e.pointerId; return; }
    }
    gesto = { x: e.clientX, y: e.clientY, boton: e.button, entrada, movido: false };
  }

  function movimiento(e) { if (gesto && !gesto.gizmo) mover(e); }

  function arriba(e) {
    const g = gesto; gesto = null; if (!g || g.gizmo) return;
    if (g.pid !== undefined) canvas.releasePointerCapture?.(g.pid);
    const movido = g.movido || Math.hypot(e.clientX - g.x, e.clientY - g.y) > UMBRAL;
    if (g.objetivos && g.movido) { terminarArrastre(g); return; }
    if (movido) return;                                    // fue un gesto de cámara
    if (g.boton === 0) {
      const entrada = g.entrada;
      if (!entrada) { if (!e.shiftKey) seleccion.limpiar(); return; }
      if (e.shiftKey) seleccion.poner(expandir(seleccion.tiene(entrada.id) ? seleccion.ids.filter(i => i !== entrada.id) : [...seleccion.ids, entrada.id]), entrada.id);
      else seleccion.poner(expandir([entrada.id]), entrada.id);
    } else if (g.boton === 2) {
      const entrada = g.entrada;
      if (entrada && !seleccion.tiene(entrada.id)) seleccion.poner(expandir([entrada.id]), entrada.id);
      mostrarMenu({ contexto: !entrada ? 'vacio' : seleccion.cantidad > 1 ? 'multi' : 'objeto', x: e.clientX, y: e.clientY, entrada, punto: puntoSuelo(e) });
    }
  }

  /** Punto del suelo bajo el cursor (para «Pegar aquí» y «Añadir aquí»). */
  function puntoSuelo(e) {
    apuntar(e);
    const duro = rayo.intersectObjects(scene.children, true).find(h => !h.object.userData?.ignorarSeleccion && !h.object.isLine);
    if (duro) return duro.point.toArray();
    const plano0 = new T.Plane(new T.Vector3(0, 1, 0), 0), p = new T.Vector3();
    if (rayo.ray.intersectPlane(plano0, p)) return [p.x, ground(p.x, p.z), p.z];
    return null;
  }

  const teclaAbajo = e => { if (e.key === 'Alt') libre = true; };
  const teclaArriba = e => { if (e.key === 'Alt') libre = false; };
  host.addEventListener('pointerdown', abajo, true);
  window.addEventListener('pointermove', movimiento);
  window.addEventListener('pointerup', arriba);
  window.addEventListener('keydown', teclaAbajo); window.addEventListener('keyup', teclaArriba);
  const bloquearMenuNativo = e => { if (activo()) e.preventDefault(); };
  host.addEventListener('contextmenu', bloquearMenuNativo);

  return {
    puntoSuelo, entradaBajo,
    get arrastrando() { return !!gesto?.objetivos && gesto.movido; },
    dispose() {
      host.removeEventListener('pointerdown', abajo, true); host.removeEventListener('contextmenu', bloquearMenuNativo);
      window.removeEventListener('pointermove', movimiento); window.removeEventListener('pointerup', arriba);
      window.removeEventListener('keydown', teclaAbajo); window.removeEventListener('keyup', teclaArriba);
    },
  };
}
