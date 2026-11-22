// Cuadrícula del suelo (ayuda de edición). Es un overlay: nunca forma parte del escenario ni se puede seleccionar.
import * as T from '../../engine/three.js';

export function crearCuadricula({ scene, ground, target, tamano = 120, divisiones = 120 }) {
  const rejilla = new T.GridHelper(tamano, divisiones, 0x6b7a86, 0x9fb0bd);
  rejilla.material.transparent = true; rejilla.material.opacity = .45; rejilla.material.depthWrite = false;
  rejilla.visible = false; rejilla.renderOrder = 10; rejilla.name = 'ayuda-cuadricula';
  rejilla.traverse(n => { n.userData.ignorarSeleccion = true; });
  scene.add(rejilla);
  const actualizar = () => { rejilla.position.set(Math.round(target.x), ground(target.x, target.z) + .02, Math.round(target.z)); rejilla.updateMatrixWorld(true); };
  return {
    get visible() { return rejilla.visible; },
    alternar(v = !rejilla.visible) { rejilla.visible = !!v; if (v) actualizar(); },
    actualizar() { if (rejilla.visible) actualizar(); },
    dispose() { rejilla.removeFromParent(); rejilla.geometry.dispose(); rejilla.material.dispose(); },
  };
}
