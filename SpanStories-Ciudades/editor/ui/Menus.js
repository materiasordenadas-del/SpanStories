// Barra superior: cada menú abre su contenido en el panel DERECHO (no hay desplegables). El contenido sale del registro
// de acciones (core/Acciones.js); un menú puede añadir secciones propias con `contribuciones` (p. ej. ajustes de Vista).
import { MENUS } from '../core/Acciones.js';
import { el, svg } from './componentes.js';
import { icono } from './iconos.js';

export const ESPACIOS = Object.freeze([
  { id: 'objetos', nombre: 'Objetos', icono: 'caja' },
  { id: 'terreno', nombre: 'Terreno y vegetación', icono: 'cesped' },
  { id: 'cielo', nombre: 'Cielo e iluminación', icono: 'sol' },
  { id: 'estilo', nombre: 'Estilo visual', icono: 'paleta' },
  { id: 'escena', nombre: 'Preparación de escena', icono: 'camara' },
]);

export function montarMenus({ shell, acciones, contexto, contribuciones = {}, alElegirEspacio = () => {}, espacioInicial = 'objetos', abrirPaleta = () => {} }) {
  const barra = shell.area.menu;
  barra.append(el('div', { class: 'ed-marca' }, 'SpanStories', el('small', {}, shell.titulo)));
  const botonesMenu = new Map();
  for (const nombre of MENUS) {
    const b = el('button', { type: 'button', role: 'menuitem', 'aria-haspopup': 'true', onclick: () => alternar(nombre) }, nombre);
    barra.append(el('div', { class: 'ed-menu' }, b)); botonesMenu.set(nombre, b);
  }
  // Espacios de trabajo: cambian qué contenido muestra el inspector y qué barra de herramientas hay.
  const espacios = el('div', { class: 'ed-tabs-espacio', role: 'tablist', style: 'display:flex;gap:2px;margin-left:10px;padding-left:10px;border-left:1px solid var(--ed-borde)' });
  const botonesEspacio = new Map();
  for (const e of ESPACIOS) {
    const b = el('button', { type: 'button', role: 'tab', class: 'ed-btn', title: e.nombre, onclick: () => elegirEspacio(e.id) }, svg(e.icono), el('span', {}, e.nombre));
    espacios.append(b); botonesEspacio.set(e.id, b);
  }
  barra.append(espacios, el('span', { class: 'ed-espaciador' }));
  const derecha = el('div', { style: 'display:flex;gap:4px;align-items:center' });
  derecha.append(
    el('button', { type: 'button', class: 'ed-btn', title: 'Buscar una acción (Ctrl+K)', onclick: abrirPaleta }, svg('buscar'), el('span', {}, 'Buscar acción'), el('kbd', { class: 'ed-atajo' }, 'Ctrl+K')),
    el('button', { type: 'button', class: 'ed-btn ed-primario', title: 'Probar el escenario caminando', 'data-accion': 'probar' }, svg('jugar'), el('span', {}, 'Probar')),
  );
  barra.append(derecha);

  let menuAbierto = null, espacio = espacioInicial;
  function marcar() {
    for (const [n, b] of botonesMenu) b.setAttribute('aria-selected', String(n === menuAbierto));
    for (const [id, b] of botonesEspacio) b.setAttribute('aria-selected', String(id === espacio));
  }
  function elegirEspacio(id) { espacio = id; marcar(); alElegirEspacio(id); }

  function fila(a) {
    const habilitada = acciones.habilitada(a.id, contexto());
    if (a.marcada) {
      const on = acciones.marcada(a.id, contexto());
      const r = el('button', { type: 'button', class: 'ed-item', role: 'menuitemcheckbox', 'aria-checked': String(on), disabled: !habilitada, onclick: () => ejecutar(a.id) },
        el('span', { html: a.icono ? icono(a.icono, { tam: 15 }) : '' }), a.nombre, el('kbd', {}, on ? 'Sí' : 'No'));
      return r;
    }
    return el('button', { type: 'button', class: 'ed-item', role: 'menuitem', title: a.ayuda, disabled: !habilitada, onclick: () => ejecutar(a.id) },
      el('span', { html: a.icono ? icono(a.icono, { tam: 15 }) : '' }), a.nombre, el('kbd', {}, a.atajo || ''));
  }
  async function ejecutar(id) { try { await acciones.ejecutar(id, contexto()); } catch (error) { contexto().estado?.(error.message); } dibujar(); }

  function dibujar() {
    if (!menuAbierto) return;
    const hub = shell.vistaHub; hub.replaceChildren();
    const cuerpo = el('div', { class: 'ed-cuerpo' });
    hub.append(el('div', { class: 'ed-hub-cab' }, el('span', {}, menuAbierto), el('span', { class: 'ed-espaciador' }),
      el('button', { type: 'button', class: 'ed-btn', title: 'Volver al Inspector', onclick: () => cerrar() }, svg('cerrar', { tam: 14 }), el('span', {}, 'Inspector'))), cuerpo);
    for (const [grupo, lista] of acciones.deMenu(menuAbierto)) {
      if (grupo) cuerpo.append(el('div', { class: 'ed-hub-grupo' }, grupo));
      for (const a of lista) cuerpo.append(fila(a));
    }
    for (const extra of contribuciones[menuAbierto] ?? []) { const nodo = extra(contexto()); if (nodo) cuerpo.append(nodo); }
  }
  function alternar(nombre) { if (menuAbierto === nombre) cerrar(); else abrir(nombre); }
  function abrir(nombre) { menuAbierto = nombre; marcar(); dibujar(); shell.verDerecha('menu:' + nombre); }
  function cerrar() { menuAbierto = null; marcar(); shell.verDerecha('inspector'); }
  const desuscribir = acciones.alCambiar(dibujar);
  marcar();
  return { abrir, cerrar, dibujar, elegirEspacio, get abierto() { return menuAbierto; }, get espacio() { return espacio; }, dispose() { desuscribir(); } };
}
