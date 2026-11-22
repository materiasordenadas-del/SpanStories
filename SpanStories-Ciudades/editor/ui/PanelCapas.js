// Pestaña «Capas» (izquierda): controlar conjuntos de objetos sin tocar su jerarquía (visibilidad y bloqueo por capa).
import { el, svg } from './componentes.js';
import { CAPA_BASE, CAPA_ANADIDOS } from '../core/EscenarioDoc.js';

export function montarPanelCapas({ contenedor, capas, seleccion, estado = () => {} }) {
  let disposed = false, pendiente = 0;
  const lista = el('div', { class: 'ed-arbol', role: 'list' });
  const nombre = el('input', { class: 'ed-input', type: 'text', placeholder: 'Nueva capa…', 'aria-label': 'Nombre de la capa nueva', maxLength: 60 });
  const crear = () => { const n = nombre.value.trim(); if (!n) return; capas.crearCapa(n); nombre.value = ''; };
  nombre.addEventListener('keydown', e => { if (e.key === 'Enter') crear(); });
  contenedor.append(el('div', { class: 'ed-buscar' }, nombre, el('button', { type: 'button', class: 'ed-btn', title: 'Crear capa', onclick: crear }, svg('mas', { tam: 14 }))), lista,
    el('div', { style: 'padding:6px 10px;color:var(--ed-texto-3);line-height:1.5' }, 'Una capa oculta o bloqueada afecta a todos sus objetos. Para mover los objetos seleccionados a otra capa usa el Inspector.'));

  function fila(c) {
    const n = Object.keys(capas.e.objetos).filter(id => capas.capaDe(id) === c.id).length + (c.id === CAPA_BASE ? '+' : '');
    const f = el('div', { class: 'ed-arbol-fila', role: 'listitem', style: 'grid-template-columns:16px 1fr auto auto auto' });
    const ojo = el('button', { type: 'button', class: 'ed-mini', 'aria-label': c.visible ? 'Ocultar capa' : 'Mostrar capa', title: c.visible ? 'Ocultar capa' : 'Mostrar capa', dataset: c.visible ? {} : { on: '' }, onclick: () => capas.editarCapa(c.id, { visible: !c.visible }) }, svg(c.visible ? 'ojo' : 'ojoOculto', { tam: 14 }));
    const cand = el('button', { type: 'button', class: 'ed-mini', 'aria-label': c.bloqueada ? 'Desbloquear capa' : 'Bloquear capa', title: c.bloqueada ? 'Desbloquear capa' : 'Bloquear capa', dataset: c.bloqueada ? { on: '' } : {}, onclick: () => capas.editarCapa(c.id, { bloqueada: !c.bloqueada }) }, svg(c.bloqueada ? 'candado' : 'candadoAbierto', { tam: 14 }));
    for (const b of [ojo, cand]) b.style.opacity = 1;
    f.append(svg('capas', { tam: 14 }), el('span', { class: 'ed-nombre', title: c.nombre }, c.nombre), el('span', { class: 'ed-tag-tipo' }, `${n}`), ojo, cand);
    if (![CAPA_BASE, CAPA_ANADIDOS].includes(c.id)) f.append(el('button', { type: 'button', class: 'ed-mini', title: 'Eliminar capa', 'aria-label': 'Eliminar capa', style: 'opacity:1', onclick: () => { try { capas.eliminarCapa(c.id); } catch (error) { estado(error.message); } } }, svg('papelera', { tam: 14 })));
    return f;
  }
  const dibujar = () => { pendiente = 0; if (!disposed) lista.replaceChildren(...capas.e.capas.map(fila)); };
  const programar = () => { if (!pendiente && !disposed) pendiente = requestAnimationFrame(dibujar); };
  const baja = capas.alCambiar(programar); dibujar();
  return { dispose() { disposed = true; cancelAnimationFrame(pendiente); baja(); contenedor.replaceChildren(); } };
}
