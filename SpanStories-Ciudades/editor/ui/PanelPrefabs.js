// Pestaña «Prefabs» (abajo): conjuntos de objetos añadidos guardados para reutilizar. Un prefab recuerda el archivo de cada pieza
// y su posición relativa; al colocarlo se crean copias independientes (la biblioteca conserva cada GLB una sola vez).
import { el, svg, vacio } from './componentes.js';

export function montarPanelPrefabs({ contenedor, capas, colocarPrefab, estado = () => {} }) {
  let disposed = false, pendiente = 0;
  const lista = el('div', { class: 'ed-rejilla', role: 'list' });
  contenedor.append(el('div', { class: 'ed-bib' }, el('div', { class: 'ed-bib-cab' }, el('b', {}, 'Prefabs de este escenario'), el('span', { style: 'color:var(--ed-texto-3)' }, 'Selecciona varios objetos añadidos y usa «Guardar selección como prefab» (clic derecho).')), lista));
  function tarjeta(p) {
    const colocar = async () => { try { await colocarPrefab(p); } catch (error) { estado(error.message); } };
    return el('div', { class: 'ed-tarjeta', role: 'listitem', style: 'grid-template-rows:auto auto;cursor:default' },
      el('div', { class: 'ed-mini-img', style: 'height:46px' }, svg('agrupar', { tam: 28 })),
      el('div', { class: 'ed-meta' }, el('b', { title: p.nombre }, p.nombre), el('span', {}, `${p.items.length} pieza${p.items.length === 1 ? '' : 's'}`),
        el('div', { class: 'ed-fila-botones', style: 'margin-top:4px' },
          el('button', { type: 'button', class: 'ed-btn', onclick: colocar, title: 'Colocar una copia en el centro de la vista' }, svg('mas', { tam: 14 }), el('span', {}, 'Colocar')),
          el('button', { type: 'button', class: 'ed-btn', title: 'Borrar prefab', 'aria-label': 'Borrar prefab', onclick: () => capas.cambiar('Borrar prefab', e => { e.prefabs = e.prefabs.filter(x => x.id !== p.id); }) }, svg('papelera', { tam: 14 })))));
  }
  const dibujar = () => { pendiente = 0; if (disposed) return; const ps = capas.e.prefabs ?? []; lista.replaceChildren(...(ps.length ? ps.map(tarjeta) : [vacio('Todavía no hay prefabs. Un prefab es un conjunto de objetos (por ejemplo una mesa con cuatro sillas) que se coloca de una vez.')])); };
  const programar = () => { if (!pendiente && !disposed) pendiente = requestAnimationFrame(dibujar); };
  const baja = capas.alCambiar(programar); dibujar();
  return { refrescar: programar, dispose() { disposed = true; cancelAnimationFrame(pendiente); baja(); contenedor.replaceChildren(); } };
}
