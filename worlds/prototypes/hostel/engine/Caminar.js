import * as T from './three.js';
import { DIMENSIONS as D, WALK } from './dimensions.js';
import { dentro } from './Planta.js';

// Primera persona: la cámara camina a la altura de los ojos sobre una planta (y del piso).
// Límites: lista de rectángulos caminables (Planta.areasCaminables). Bloquean, con rayos a tres
// alturas (rodilla, cintura, ojos), los objetos SÓLIDOS visibles; una puerta abierta deja pasar.
const SOLIDOS = new Set(['muro', 'pretil', 'baranda', 'puerta', 'porton', 'reja', 'columna', 'pilar', 'litera', 'mostrador', 'sofa', 'mesa', 'banca',
  'estanteria', 'nevera', 'estufa', 'mueble', 'buffet', 'barra', 'tanque', 'lavadero', 'asoleadora', 'consigna', 'escalera', 'soporte-hamaca', 'casa', 'silla', 'taburete', 'tendedero', 'ducha']);

export function crearCaminante(camera, target) {
  let yaw = 0, pitch = 0;
  const ray = new T.Raycaster(), dir = new T.Vector3(), off = new T.Vector3();
  function sincronizar() { camera.getWorldDirection(dir); yaw = Math.atan2(-dir.x, -dir.z); pitch = Math.asin(T.MathUtils.clamp(dir.y, -1, 1)); }
  function orientar() { dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); target.copy(camera.position).add(dir); camera.lookAt(target); }
  function mirar(dx, dy) { yaw -= dx * WALK.lookSpeed; pitch = T.MathUtils.clamp(pitch - dy * WALK.lookSpeed, -WALK.maxPitch, WALK.maxPitch); orientar(); }
  const visible = hit => { for (let p = hit.object; p; p = p.parent) if (!p.visible) return false; return hit.object.material?.name !== 'contorno'; };
  function mover(adelante, lado, dt, raices, areas, piso) {
    off.set(-Math.sin(yaw) * adelante + Math.cos(yaw) * lado, 0, -Math.cos(yaw) * adelante - Math.sin(yaw) * lado);
    if (!off.lengthSq()) return false;
    off.normalize().multiplyScalar(WALK.speed * dt);
    const obst = raices.filter(r => SOLIDOS.has(r.userData.tipo) && r.visible && !r.userData.abierta);
    // Solo se prueban los sólidos cercanos (caja guardada una vez: el decorado no se mueve).
    const p = new T.Vector3(camera.position.x, piso + 1, camera.position.z);
    const cerca = obst.filter(r => { const c = r.userData.caja ??= new T.Box3().setFromObject(r); return c.distanceToPoint(p) < 2 && c.max.y > piso + .2 && c.min.y < piso + D.eye; });
    let movido = false;
    for (const eje of ['x', 'z']) {
      if (!off[eje]) continue;
      const nx = eje === 'x' ? camera.position.x + off.x : camera.position.x, nz = eje === 'z' ? camera.position.z + off.z : camera.position.z;
      if (!areas.some(a => dentro(a, nx, nz))) continue;   // sin margen: los rectángulos contiguos no dejan rendija; los huecos ya vienen agrandados
      dir.set(0, 0, 0); dir[eje] = Math.sign(off[eje]); ray.far = Math.abs(off[eje]) + D.playerRadius;
      let bloqueado = false;
      fuera: for (const h of [.35, .9, D.eye - .05]) for (const l of [-D.playerRadius, 0, D.playerRadius]) {
        const o = new T.Vector3(camera.position.x, piso + h, camera.position.z); o[eje === 'x' ? 'z' : 'x'] += l;
        ray.set(o, dir); if (ray.intersectObjects(cerca, true).some(visible)) { bloqueado = true; break fuera; }
      }
      if (!bloqueado) { camera.position[eje] += off[eje]; movido = true; }
    }
    camera.position.y = piso + D.eye; orientar(); return movido;
  }
  return { sincronizar, mirar, mover, orientar };
}
