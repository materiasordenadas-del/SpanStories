// Operaciones de cámara del editor usando solo la API pública de la navegación (no se modifica CityNavigation).
// El modo Editor orbita alrededor de `target` partiendo de camera.position − target, así que basta con colocar ambos.
import * as T from '../../engine/three.js';
import { cajaDeRaiz } from './Colision.js';

export const VISTAS = Object.freeze({
  superior: { nombre: 'Superior', dir: [0, 1, 0], arriba: [0, 0, -1] },
  inferior: { nombre: 'Inferior', dir: [0, -1, 0], arriba: [0, 0, 1] },
  frontal: { nombre: 'Frontal', dir: [0, 0, 1], arriba: [0, 1, 0] },
  trasera: { nombre: 'Trasera', dir: [0, 0, -1], arriba: [0, 1, 0] },
  derecha: { nombre: 'Derecha', dir: [1, 0, 0], arriba: [0, 1, 0] },
  izquierda: { nombre: 'Izquierda', dir: [-1, 0, 0], arriba: [0, 1, 0] },
});
const FOV_ALINEADA = 12;           // campo estrecho: la vista alineada se parece a una ortográfica sin cambiar de cámara

export function crearVista({ camera, target, navigation, objetos, seleccion, escena }) {
  let fovNormal = null;
  const restaurarFov = () => { if (fovNormal !== null) { camera.fov = fovNormal; camera.updateProjectionMatrix(); fovNormal = null; } };

  function distancia() { return Math.max(.5, camera.position.distanceTo(target)); }
  function colocar(dir, arriba = [0, 1, 0], d = distancia()) {
    const v = new T.Vector3(...dir).normalize();
    camera.up.set(...arriba);
    camera.position.copy(target).addScaledVector(v, d); camera.lookAt(target); camera.updateMatrixWorld(true);
    camera.up.set(0, 1, 0);
  }
  return {
    /** Mirar hacia el objetivo desde la dirección de un eje (widget de ejes). */
    mirarDesde(dir) { restaurarFov(); colocar(dir.toArray(), Math.abs(dir.y) > .99 ? [0, 0, -Math.sign(dir.y)] : [0, 1, 0]); },
    /** Vista alineada (superior, frontal…) con campo estrecho y distancia compensada. */
    alinear(nombre) {
      const v = VISTAS[nombre]; if (!v) throw new Error('Vista desconocida: ' + nombre);
      if (fovNormal === null) fovNormal = camera.fov;
      const d = distancia() * Math.tan(T.MathUtils.degToRad(fovNormal / 2)) / Math.tan(T.MathUtils.degToRad(FOV_ALINEADA / 2));
      camera.fov = FOV_ALINEADA; camera.updateProjectionMatrix(); colocar(v.dir, v.arriba, d);
    },
    restaurar() { restaurarFov(); },
    get alineada() { return fovNormal !== null; },
    encuadrar() {
      const raices = seleccion.raices(); if (!raices.length) return;
      const caja = new T.Box3(); for (const r of raices) caja.union(cajaDeRaiz(r, new T.Box3()).clone());
      restaurarFov(); navigation.focus(caja);
    },
    encuadrarTodo(manifestBounds) { restaurarFov(); navigation.focus(new T.Box3(new T.Vector3(...manifestBounds.min), new T.Vector3(...manifestBounds.max))); },
    /** Instantánea de cámara guardable: { position, target, fov }. */
    capturar() { return { position: camera.position.toArray(), target: target.toArray(), fov: camera.fov }; },
    aplicar(c) { restaurarFov(); camera.fov = c.fov ?? camera.fov; camera.updateProjectionMatrix(); target.fromArray(c.target); camera.position.fromArray(c.position); camera.lookAt(target); camera.updateMatrixWorld(true); },
  };
}
