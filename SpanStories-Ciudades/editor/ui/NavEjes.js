// Widget de ejes de la vista, como el de Blender (arriba a la derecha del visor).
// Muestra hacia dónde mira la cámara y, al pulsar un eje, coloca la vista mirando en esa dirección.
import * as T from '../../engine/three.js';
import { COLOR_EJE } from '../herramientas/Gizmo.js';

const NS = 'http://www.w3.org/2000/svg';

export function montarNavEjes({ visor, camera, vista }) {
  const caja = document.createElement('div'); caja.className = 'ed-navejes'; caja.setAttribute('role', 'group'); caja.setAttribute('aria-label', 'Ejes de la vista');
  const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '-42 -42 84 84'); caja.append(s);
  const fondo = document.createElementNS(NS, 'circle'); fondo.setAttribute('r', '40'); fondo.setAttribute('class', 'fondo'); s.append(fondo);
  const defs = [['X', new T.Vector3(1, 0, 0)], ['Y', new T.Vector3(0, 1, 0)], ['Z', new T.Vector3(0, 0, 1)], ['-X', new T.Vector3(-1, 0, 0)], ['-Y', new T.Vector3(0, -1, 0)], ['-Z', new T.Vector3(0, 0, -1)]];
  const nodos = defs.map(([nombre, v]) => {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'eje');
    const l = document.createElementNS(NS, 'line'); l.setAttribute('stroke-width', '3'); l.setAttribute('x1', '0'); l.setAttribute('y1', '0');
    const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', nombre.startsWith('-') ? '6' : '9');
    const t = document.createElementNS(NS, 'text'); t.textContent = nombre.startsWith('-') ? '' : nombre;
    const color = COLOR_EJE[nombre.replace('-', '')];
    l.setAttribute('stroke', color); c.setAttribute('fill', nombre.startsWith('-') ? 'none' : color); if (nombre.startsWith('-')) { c.setAttribute('stroke', color); c.setAttribute('stroke-width', '1.5'); }
    g.append(l, c, t); s.append(g);
    g.addEventListener('click', e => { e.stopPropagation(); vista?.mirarDesde(v.clone()); });
    g.setAttribute('role', 'button'); g.setAttribute('aria-label', 'Mirar desde el eje ' + nombre);
    return { g, l, c, t, v };
  });
  visor.append(caja);
  const q = new T.Quaternion(), p = new T.Vector3();
  function actualizar() {
    camera.getWorldQuaternion(q); const inv = q.clone().invert();
    const orden = nodos.map(n => { p.copy(n.v).applyQuaternion(inv); return { n, x: p.x * 28, y: -p.y * 28, z: p.z }; }).sort((a, b) => a.z - b.z);
    for (const { n, x, y } of orden) { n.l.setAttribute('x2', x); n.l.setAttribute('y2', y); n.c.setAttribute('cx', x); n.c.setAttribute('cy', y); n.t.setAttribute('x', x); n.t.setAttribute('y', y); s.append(n.g); }
  }
  actualizar();
  return { actualizar, dispose() { caja.remove(); } };
}
