// Colocación desde la biblioteca: un fantasma semitransparente sigue al cursor sobre el suelo; un clic coloca una copia
// y se puede seguir colocando (modo repetido). Esc o clic derecho terminan. No cambia nada del escenario hasta el clic.
import * as T from '../../engine/three.js';
import { resolverMovimiento } from './Colision.js';

const UMBRAL = 4;

export function montarColocacion({ host, canvas, camera, scene, loader, editor, ground = () => 0, obstaculos = () => [], ajustes = { colision: () => true, apoyo: () => true }, alCambiar = () => {}, estado = () => {} }) {
  const rayo = new T.Raycaster(), puntero = new T.Vector2();
  let pausado = false, activo = null, fantasma = null, caja = null, yaw = 0, repetir = true, abajo = null, ocupado = false, posicion = null, choca = false, generacion = 0;
  const materialOk = new T.MeshBasicMaterial({ color: 0xe0a458, transparent: true, opacity: .55, depthWrite: false });
  const materialMal = new T.MeshBasicMaterial({ color: 0xe5736a, transparent: true, opacity: .6, depthWrite: false });

  const marcar = obj => obj.traverse(n => { n.userData.ignorarSeleccion = true; if (n.isMesh) { n.userData.editorOverlay = true; n.layers.set(31); n.renderOrder = 998; n.raycast = () => {}; } });
  function limpiarFantasma() { if (!fantasma) return; scene.remove(fantasma); fantasma.traverse(n => { if (n.isMesh) n.geometry?.dispose(); }); fantasma = null; caja = null; }

  async function armar(item, blob, { una = false } = {}) {
    desarmar(); const mia = ++generacion; activo = { item, blob }; repetir = !una; yaw = 0; alCambiar();
    estado('Cargando vista previa de «' + item.nombre + '»…');
    try {
      const gltf = await loader.parseAsync(await blob.arrayBuffer(), ''); if (mia !== generacion) return;
      const raiz = gltf.scene;
      raiz.traverse(n => { if (n.isMesh) { n.material = materialOk; n.castShadow = false; } });
      raiz.updateMatrixWorld(true);
      const c = new T.Box3().setFromObject(raiz); raiz.position.set(-(c.min.x + c.max.x) / 2, -c.min.y, -(c.min.z + c.max.z) / 2);
      const envoltorio = new T.Group(); envoltorio.add(raiz); marcar(envoltorio); envoltorio.visible = false; scene.add(envoltorio);
      fantasma = envoltorio; caja = new T.Box3().setFromObject(envoltorio);
      estado('Clic para colocar «' + item.nombre + '» · Esc o clic derecho para terminar · Mayús + rueda: girar.');
    } catch (error) { activo = null; alCambiar(); estado('No se pudo previsualizar: ' + error.message); }
  }
  function desarmar() { generacion++; activo = null; abajo = null; limpiarFantasma(); posicion = null; alCambiar(); }

  function apuntar(e) {
    const r = canvas.getBoundingClientRect(); puntero.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); rayo.setFromCamera(puntero, camera);
  }
  function puntoSuelo(e) {
    apuntar(e);
    const duro = rayo.intersectObjects(scene.children, true).find(h => { for (let n = h.object; n; n = n.parent) if (!n.visible || n.userData.ignorarSeleccion || n.userData.storyActorId || n.isLine) return false; return true; });
    if (duro) return duro.point.clone();
    const p = new T.Vector3(); return rayo.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p) ? new T.Vector3(p.x, ground(p.x, p.z), p.z) : null;
  }

  function colocarFantasma(p) {
    if (!fantasma || !p) return;
    fantasma.visible = true; fantasma.rotation.set(0, yaw, 0); fantasma.position.copy(p); fantasma.updateMatrixWorld(true);
    const c = new T.Box3().setFromObject(fantasma);
    const r = resolverMovimiento({ caja: c, ground, obstaculos: obstaculos(), apoyar: ajustes.apoyo(), chocar: ajustes.colision() });
    fantasma.position.add(r.delta); fantasma.updateMatrixWorld(true);
    choca = r.choca.length > 0; posicion = fantasma.position.toArray();
    fantasma.traverse(n => { if (n.isMesh) n.material = choca ? materialMal : materialOk; });
  }

  async function colocar() {
    if (!activo || !posicion || ocupado) return;
    ocupado = true;
    try { await editor.colocarCopias(activo.blob, activo.item.nombre + '.glb', [{ posicion, rotacion: [0, yaw, 0], etiqueta: activo.item.nombre }], 'Colocar ' + activo.item.nombre); }
    catch (error) { estado(error.message); } finally { ocupado = false; }
    if (!repetir) desarmar();
  }

  const mover = e => { if (pausado || !activo || !fantasma) return; if (e.target !== canvas && !canvas.contains(e.target) && e.target !== host) return; colocarFantasma(puntoSuelo(e)); };
  const pulsar = e => { if (pausado || !activo || e.target !== canvas) return; abajo = { x: e.clientX, y: e.clientY, boton: e.button }; };
  const soltar = e => {
    if (!activo || !abajo) return; const a = abajo; abajo = null;
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > UMBRAL) return;
    if (a.boton === 0) { colocarFantasma(puntoSuelo(e)); void colocar(); } else if (a.boton === 2) { desarmar(); estado('Colocación terminada.'); }
  };
  const rueda = e => { if (!activo || !e.shiftKey) return; e.preventDefault(); e.stopPropagation(); yaw += Math.sign(e.deltaY) * Math.PI / 12; colocarFantasma(posicion ? new T.Vector3(...posicion) : null); };
  const tecla = e => { if (activo && e.key === 'Escape') { desarmar(); estado('Colocación terminada.'); } };

  // Arrastrar una tarjeta de la biblioteca al visor
  const sobre = e => { if (!Array.from(e.dataTransfer?.types ?? []).includes('application/x-spanstories-biblioteca')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (fantasma) colocarFantasma(puntoSuelo(e)); };
  const soltarTarjeta = e => { if (!Array.from(e.dataTransfer?.types ?? []).includes('application/x-spanstories-biblioteca')) return; e.preventDefault(); e.stopPropagation(); colocarFantasma(puntoSuelo(e)); void colocar(); };

  host.addEventListener('pointermove', mover); host.addEventListener('pointerdown', pulsar, true); window.addEventListener('pointerup', soltar);
  host.addEventListener('wheel', rueda, { capture: true, passive: false }); window.addEventListener('keydown', tecla);
  host.addEventListener('dragover', sobre); host.addEventListener('drop', soltarTarjeta, true);

  return {
    /** Con el pincel de dispersión activo, el clic no coloca copias sueltas ni se ve el fantasma. */
    pausar(v) { pausado = !!v; if (fantasma) fantasma.visible = fantasma.visible && !pausado; },
    armar, desarmar, get armado() { return !!activo; }, get item() { return activo?.item ?? null; }, get repetir() { return repetir; }, set repetir(v) { repetir = !!v; alCambiar(); },
    dispose() {
      desarmar(); host.removeEventListener('pointermove', mover); host.removeEventListener('pointerdown', pulsar, true); window.removeEventListener('pointerup', soltar);
      host.removeEventListener('wheel', rueda, true); window.removeEventListener('keydown', tecla); host.removeEventListener('dragover', sobre); host.removeEventListener('drop', soltarTarjeta, true);
      materialOk.dispose(); materialMal.dispose();
    },
  };
}
