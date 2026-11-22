// Pincel genérico sobre el terreno (césped, pintura de suelo, colocación por pincel). Muestra un aro del tamaño del pincel y
// entrega puntos del suelo mientras se arrastra con el botón izquierdo. No sabe qué se pinta: lo decide quien lo configura.
import * as T from '../../engine/three.js';

export function montarPincel({ host, canvas, camera, scene, ground = () => 0 }) {
  const h = { activo: () => false, radio: () => 2, alEmpezar() {}, alPintar() {}, alTerminar() {} };   // los configura quien usa el pincel
  const rayo = new T.Raycaster(), puntero = new T.Vector2();
  const aro = new T.Mesh(new T.RingGeometry(.94, 1, 64), new T.MeshBasicMaterial({ color: 0xe0a458, transparent: true, opacity: .95, side: T.DoubleSide, depthTest: false }));
  aro.rotation.x = -Math.PI / 2; aro.visible = false; aro.renderOrder = 999; aro.name = 'ayuda-pincel';
  aro.traverse(n => { n.userData.ignorarSeleccion = true; n.userData.editorOverlay = true; n.layers.set(31); n.raycast = () => {}; });
  scene.add(aro);
  let pintando = false, ultimo = null, propietario = null;

  function suelo(e) {
    const r = canvas.getBoundingClientRect(); puntero.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); rayo.setFromCamera(puntero, camera);
    const hit = rayo.intersectObjects(scene.children, true).find(h => { for (let n = h.object; n; n = n.parent) if (!n.visible || n.userData.ignorarSeleccion || n.userData.storyActorId || n.isLine) return false; return true; });
    if (hit) return hit.point.clone();
    const p = new T.Vector3(); return rayo.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p) ? new T.Vector3(p.x, ground(p.x, p.z), p.z) : null;
  }
  function colocarAro(p) { if (!p) { aro.visible = false; return; } aro.visible = true; aro.scale.setScalar(Math.max(.1, h.radio())); aro.position.set(p.x, ground(p.x, p.z) + .08, p.z); aro.updateMatrixWorld(true); }

  const mover = e => {
    if (!h.activo()) { aro.visible = false; return; }
    if (e.target !== canvas) return;
    const p = suelo(e); colocarAro(p);
    if (pintando && p) { if (!ultimo || Math.hypot(p.x - ultimo.x, p.z - ultimo.z) >= Math.max(.15, h.radio() * .22)) { ultimo = p; h.alPintar(p); } }
  };
  const abajo = e => {
    if (!h.activo() || e.button !== 0 || e.target !== canvas) return;
    e.stopPropagation(); e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
    const p = suelo(e); if (!p) return; pintando = true; ultimo = p; h.alEmpezar(); h.alPintar(p); colocarAro(p);
  };
  const arriba = () => { if (!pintando) return; pintando = false; ultimo = null; h.alTerminar(); };
  const fuera = () => { aro.visible = false; };
  host.addEventListener('pointerdown', abajo, true); window.addEventListener('pointermove', mover); window.addEventListener('pointerup', arriba); canvas.addEventListener('pointerleave', fuera);
  return {
    /** Un solo pintor a la vez: quien toma el pincel desactiva al anterior (alPerder). */
    tomar(nombre, hooks, alPerder = () => {}) { if (propietario && propietario.nombre !== nombre) propietario.alPerder(); propietario = { nombre, alPerder }; Object.assign(h, hooks); },
    soltar(nombre) { if (propietario?.nombre === nombre) { propietario = null; Object.assign(h, { activo: () => false }); aro.visible = false; } },
    get propietario() { return propietario?.nombre ?? null; },
    refrescar() { if (!h.activo()) aro.visible = false; },
    dispose() { host.removeEventListener('pointerdown', abajo, true); window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', arriba); canvas.removeEventListener('pointerleave', fuera); aro.removeFromParent(); aro.geometry.dispose(); aro.material.dispose(); },
  };
}
