// Barra de estado inferior: cambios sin guardar, último mensaje, revisión, selección.
import { el } from './componentes.js';
import { agruparTipos, textoRecuento } from '../core/Tipos.js';

export function montarEstado({ shell, editor, seleccion, objetos, gizmo }) {
  const punto = el('span', { class: 'ed-pt' }), texto = el('span', {}, 'Todo guardado');
  const mensaje = el('span', { class: 'ed-mensaje', 'aria-live': 'polite' }, 'Selecciona un objeto o arrastra archivos GLB al visor para añadir objetos.');
  const revision = el('span', {}), seleccionado = el('span', {}), almacen = el('span', {});
  shell.area.estado.append(el('span', {}, punto, texto), mensaje, seleccionado, revision);
  let ultimo = '', memo = { n: -1, texto: '' };
  /** Objetos DISTINTOS y ejemplares (100 árboles iguales = 1 objeto). Se recalcula solo si cambia el total. */
  function resumenTipos() {
    if (memo.n === objetos.entries.size) return memo.texto;
    const archivoDe = id => { const r = objetos.obtener(id); return (r?.userData.cityImportId && editor.state.imports.get(r.userData.cityImportId)?.filename) || null; };
    memo = { n: objetos.entries.size, texto: textoRecuento(agruparTipos(objetos.listar(), archivoDe)) }; return memo.texto;
  }
  function actualizar() {
    const sucio = editor.dirty();
    if (sucio) punto.dataset.sucio = ''; else delete punto.dataset.sucio;
    texto.textContent = editor.ocupado ? 'Trabajando…' : sucio ? 'Cambios sin guardar' : 'Todo guardado';
    revision.textContent = editor.revision ? 'Revisión ' + editor.revision.slice(0, 10) : 'Escenario base';
    seleccionado.textContent = seleccion.cantidad ? `${seleccion.cantidad} seleccionado${seleccion.cantidad === 1 ? '' : 's'}` : resumenTipos();
  }
  const baja = editor.alCambiar(t => { if (t.startsWith('mensaje:')) { ultimo = t.slice(8); mensaje.textContent = ultimo; } actualizar(); });
  const baja2 = seleccion.alCambiar(actualizar), baja3 = gizmo.alCambiar(actualizar);
  actualizar();
  return { mensaje(t) { mensaje.textContent = t; }, actualizar, dispose() { baja(); baja2(); baja3(); shell.area.estado.replaceChildren(); } };
}
