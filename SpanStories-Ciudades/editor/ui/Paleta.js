// Paleta de comandos (Ctrl+K): busca cualquier acción del registro por nombre, menú o ayuda.
import { el } from './componentes.js';
import { icono } from './iconos.js';

export function montarPaleta({ raiz, acciones, contexto }) {
  let fondo = null;
  function cerrar() { fondo?.remove(); fondo = null; }
  function abrir() {
    if (fondo) { cerrar(); return; }
    const ctx = contexto();
    const entrada = el('input', { class: 'ed-input', type: 'text', placeholder: 'Escribe lo que quieres hacer… (Esc para cerrar)', 'aria-label': 'Buscar acción', autocomplete: 'off' });
    const lista = el('div', { class: 'ed-paleta-lista', role: 'listbox' });
    fondo = el('div', { class: 'ed-paleta-fondo', onpointerdown: e => { if (e.target === fondo) cerrar(); } }, el('div', { class: 'ed-paleta ed' , dataset: { tema: raiz.dataset.tema } }, entrada, lista));
    raiz.append(fondo);
    let indice = 0, resultados = [];
    const pintar = () => {
      resultados = acciones.buscar(entrada.value, ctx).slice(0, 40);
      lista.replaceChildren(...resultados.map(({ accion, habilitada }, i) => el('button', { type: 'button', class: 'ed-item', role: 'option', disabled: !habilitada, 'data-foco': i === indice ? '' : null,
        onclick: () => ejecutar(accion.id) }, el('span', { html: accion.icono ? icono(accion.icono, { tam: 15 }) : '' }), el('span', {}, accion.nombre, ' ', el('small', {}, accion.menu ?? '')), el('kbd', {}, accion.atajo || ''))));
      if (!resultados.length) lista.append(el('div', { class: 'ed-vacio' }, 'Ninguna acción coincide.'));
    };
    async function ejecutar(id) { cerrar(); try { await acciones.ejecutar(id, contexto()); } catch (error) { ctx.estado?.(error.message); } }
    entrada.addEventListener('input', () => { indice = 0; pintar(); });
    entrada.addEventListener('keydown', e => {
      if (e.key === 'Escape') { cerrar(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); indice = Math.max(0, Math.min(resultados.length - 1, indice + (e.key === 'ArrowDown' ? 1 : -1))); pintar(); lista.querySelector('[data-foco]')?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter') { e.preventDefault(); const r = resultados[indice]; if (r?.habilitada) ejecutar(r.accion.id); }
    });
    pintar(); entrada.focus();
  }
  return { abrir, cerrar, dispose: cerrar };
}
