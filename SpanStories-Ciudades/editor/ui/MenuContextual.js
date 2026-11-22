// Menú del clic derecho. Sus entradas salen del registro de acciones (campo `contextos`).
import { el } from './componentes.js';
import { icono } from './iconos.js';

export function montarMenuContextual({ raiz, acciones, contexto }) {
  let caja = null, cierre = null;
  function cerrar() {
    caja?.remove(); caja = null;
    if (cierre) { window.removeEventListener('pointerdown', cierre, true); window.removeEventListener('keydown', cierre, true); window.removeEventListener('blur', cerrar); cierre = null; }
  }
  function mostrar({ contexto: tipo, x, y, entrada = null, punto = null }) {
    cerrar();
    const ctx = { ...contexto(), punto };
    const grupos = acciones.deContexto(tipo);
    if (!grupos.length) return;
    caja = el('div', { class: 'ed-contextual', role: 'menu', 'aria-label': 'Acciones' });
    const titulo = tipo === 'vacio' ? 'Escenario' : tipo === 'multi' ? `${ctx.seleccion.cantidad} objetos` : (entrada?.etiqueta ?? 'Objeto');
    caja.append(el('div', { class: 'ed-titulo' }, titulo));
    grupos.forEach(([, lista], i) => {
      if (i) caja.append(el('hr', { class: 'ed-sep' }));
      for (const a of lista) {
        const habilitada = acciones.habilitada(a.id, ctx);
        caja.append(el('button', { type: 'button', class: 'ed-item', role: 'menuitem', disabled: !habilitada, title: a.ayuda,
          onclick: async () => { cerrar(); try { await acciones.ejecutar(a.id, ctx); } catch (error) { ctx.estado?.(error.message); } } },
          el('span', { html: a.icono ? icono(a.icono, { tam: 15 }) : '' }), a.etiquetaContexto?.(ctx) ?? a.nombre, el('kbd', {}, a.atajo || '')));
      }
    });
    raiz.append(caja);
    const w = caja.offsetWidth, h = caja.offsetHeight;
    caja.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px'; caja.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
    caja.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    cierre = e => { if (e.type === 'keydown') { if (e.key === 'Escape') cerrar(); return; } if (!caja?.contains(e.target)) cerrar(); };
    setTimeout(() => { window.addEventListener('pointerdown', cierre, true); window.addEventListener('keydown', cierre, true); window.addEventListener('blur', cerrar); }, 0);
  }
  return { mostrar, cerrar, dispose: cerrar };
}
