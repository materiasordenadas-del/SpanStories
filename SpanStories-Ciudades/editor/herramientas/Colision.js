// Restricciones de movimiento durante la edición: el objeto no atraviesa el suelo ni otros objetos.
// Funciones puras sobre cajas AABB (THREE.Box3) para poder probarlas sin escena.
import * as T from '../../engine/three.js';

const EPS = 1e-4;

/**
 * Altura máxima del suelo bajo la huella de la caja (esquinas, bordes y centro).
 * Un terreno inclinado exige apoyar el punto más alto de la huella, no solo el centro.
 */
export function sueloBajoCaja(caja, ground, muestras = 3) {
  let alto = -Infinity;
  for (let i = 0; i < muestras; i++) for (let j = 0; j < muestras; j++) {
    const x = caja.min.x + (caja.max.x - caja.min.x) * (muestras === 1 ? .5 : i / (muestras - 1));
    const z = caja.min.z + (caja.max.z - caja.min.z) * (muestras === 1 ? .5 : j / (muestras - 1));
    alto = Math.max(alto, ground(x, z));
  }
  return alto;
}

function solapa(a, b) {
  return a.min.x < b.max.x - EPS && a.max.x > b.min.x + EPS && a.min.y < b.max.y - EPS && a.max.y > b.min.y + EPS && a.min.z < b.max.z - EPS && a.max.z > b.min.z + EPS;
}

const aCaja = b => b.isBox3 ? b : new T.Box3(new T.Vector3(...b.min), new T.Vector3(...b.max));

/**
 * Corrige la posición propuesta de un objeto.
 *  caja        Box3 mundial del objeto en la posición propuesta.
 *  ground      (x,z) → y del suelo.
 *  obstaculos  [{id, bounds:{min,max}|Box3}] con las cajas de colisión de la escena.
 *  ignorar     Set de ids que no cuentan (el propio objeto y los seleccionados con él).
 *  apoyar      true: no entra en el suelo.   chocar: true: no entra en otros objetos.
 *  tolerarApoyo  Altura máxima (m) que se «sube» al borde de un objeto en vez de empujar de lado (subirse a un banco bajo).
 * Devuelve { delta:Vector3, choca:[ids], apoyado:boolean }; aplicar delta a la posición del objeto.
 */
export function resolverMovimiento({ caja, ground, obstaculos = [], ignorar = new Set(), apoyar = true, chocar = true, tolerarApoyo = .05 }) {
  const trabajo = caja.clone(), delta = new T.Vector3(), choca = new Set();
  let apoyado = false;
  if (apoyar && ground) {
    const suelo = sueloBajoCaja(trabajo, ground);
    if (trabajo.min.y < suelo - EPS) { const d = suelo - trabajo.min.y; delta.y += d; trabajo.min.y += d; trabajo.max.y += d; apoyado = true; }
    else if (trabajo.min.y - suelo < EPS) apoyado = true;
  }
  if (chocar) {
    const cajas = obstaculos.filter(o => !ignorar.has(o.id) && o.enabled !== false).map(o => ({ id: o.id, caja: aCaja(o.bounds) }));
    // Varias pasadas: empujar fuera de un objeto puede meter en otro.
    for (let pasada = 0; pasada < 4; pasada++) {
      let movido = false;
      for (const { id, caja: otra } of cajas) {
        if (!solapa(trabajo, otra)) continue;
        const penetra = {
          xp: otra.max.x - trabajo.min.x, xn: trabajo.max.x - otra.min.x,
          zp: otra.max.z - trabajo.min.z, zn: trabajo.max.z - otra.min.z,
          yp: otra.max.y - trabajo.min.y, yn: trabajo.max.y - otra.min.y,
        };
        // Subirse a lo bajo (apoyarse encima) solo si la penetración vertical es mínima; en otro caso se empuja de lado.
        const lado = Object.entries(penetra).filter(([k]) => k[0] !== 'y').sort((a, b) => a[1] - b[1])[0];
        let eje = lado, usaY = false;
        if (penetra.yp <= Math.max(tolerarApoyo, 0) + EPS) { eje = ['yp', penetra.yp]; usaY = true; }
        const [clave, valor] = eje, signo = clave.endsWith('p') ? 1 : -1, d = signo * valor;
        const comp = usaY ? 'y' : clave[0];
        delta[comp] += d; trabajo.min[comp] += d; trabajo.max[comp] += d; choca.add(id); movido = true;
      }
      if (!movido) break;
    }
  }
  return { delta, choca: [...choca], apoyado };
}

/** Caja mundial de una raíz del editor (usa los límites del adaptador si el objeto es un proxy del Generador). */
export function cajaDeRaiz(raiz, caja = new T.Box3()) {
  raiz.updateMatrixWorld(true);
  if (raiz.userData.atlasBounds) return caja.copy(raiz.userData.instanceBinding?.bounds?.() ?? raiz.userData.atlasBounds);
  return caja.setFromObject(raiz);
}

/** Posición válida más cercana de un objeto (para la edición numérica y el pegado). Devuelve el desplazamiento aplicado. */
export function corregirPosicion(raiz, opciones) {
  const caja = cajaDeRaiz(raiz), r = resolverMovimiento({ ...opciones, caja });
  if (r.delta.lengthSq() > 0) { raiz.position.add(r.delta); raiz.updateMatrixWorld(true); raiz.userData.instanceBinding?.sync?.(); }
  return r;
}
