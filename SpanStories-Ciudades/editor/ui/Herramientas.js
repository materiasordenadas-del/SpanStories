// Barra de herramientas: botones de acciones del registro + selector de orientación tipo Blender + tamaño del gizmo.
// Cada botón apunta a una acción por id; su estado (pulsado/deshabilitado) se recalcula con refrescar().
import { el, svg } from './componentes.js';

const GRUPOS = [
  { id: 'modo', botones: ['herramienta.seleccionar', 'herramienta.mover', 'herramienta.girar', 'herramienta.escalar'] },
  { id: 'orientacion', selector: 'orientacion' },
  { id: 'ajustes', botones: ['ajuste.iman', 'ajuste.colision', 'ajuste.apoyo'] },
  { id: 'tamano', tamano: true },
  { id: 'historial', botones: ['editar.deshacer', 'editar.rehacer', 'vista.encuadrar', 'editar.aislar'] },
  { id: 'vista', botones: ['vista.cuadricula', 'vista.ortografica', 'vista.pantallaCompleta'] },
];

export function montarHerramientas({ shell, acciones, contexto, gizmo }) {
  const barra = shell.area.tools, botones = new Map();
  const orientaciones = [['world', 'global', 'Global'], ['local', 'local', 'Local']];
  const selOrientacion = el('div', { class: 'ed-selector', role: 'radiogroup', 'aria-label': 'Orientación de los ejes' });
  const botonesOrientacion = orientaciones.map(([valor, ic, texto]) => {
    const b = el('button', { type: 'button', role: 'radio', title: valor === 'world' ? 'Ejes del mundo' : 'Ejes del propio objeto', onclick: () => { gizmo.setEspacio(valor); refrescar(); } }, svg(ic, { tam: 14 }), el('span', {}, texto));
    selOrientacion.append(b); return [valor, b];
  });
  const inputTamano = el('input', { type: 'range', min: .5, max: 3, step: .05, value: gizmo.estado.tamano, 'aria-label': 'Tamaño del manipulador', title: 'Tamaño del manipulador' });
  inputTamano.addEventListener('input', () => gizmo.setTamano(+inputTamano.value));

  for (const g of GRUPOS) {
    const caja = el('div', { class: 'ed-grupo', dataset: { grupo: g.id } });
    if (g.selector) caja.append(el('span', { class: 'ed-etiqueta-sel' }, 'Orientación'), selOrientacion);
    if (g.tamano) caja.append(el('label', { class: 'ed-tamano' }, svg('mover', { tam: 14 }), inputTamano));
    for (const id of g.botones ?? []) {
      const a = acciones.obtener(id); if (!a) continue;
      const b = el('button', { type: 'button', class: 'ed-btn ed-tbtn', 'aria-label': a.nombre, title: a.nombre + (a.atajo ? ` (${a.atajo})` : ''), onclick: async () => { try { await acciones.ejecutar(id, contexto()); } catch (error) { contexto().estado?.(error.message); } refrescar(); } }, svg(a.icono || 'vacio'));
      caja.append(b); botones.set(id, b);
    }
    barra.append(caja);
  }
  function refrescar() {
    const ctx = contexto();
    for (const [id, b] of botones) {
      const a = acciones.obtener(id); if (!a) continue;
      b.disabled = !acciones.habilitada(id, ctx);
      if (a.marcada) b.setAttribute('aria-pressed', String(acciones.marcada(id, ctx))); else b.removeAttribute('aria-pressed');
    }
    for (const [valor, b] of botonesOrientacion) b.setAttribute('aria-pressed', String(gizmo.estado.espacio === valor)), b.setAttribute('aria-checked', String(gizmo.estado.espacio === valor));
    inputTamano.value = gizmo.estado.tamano;
  }
  refrescar();
  return { refrescar };
}
