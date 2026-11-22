// Componentes de interfaz reutilizables (sin estado de negocio). Todos usan las clases de shell.css.
import { icono } from './iconos.js';

/** Crea un elemento: el('div', {class:'x', onclick}, hijo1, 'texto'). Las claves on* son eventos; `html` inserta HTML de confianza. */
export function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') nodo.className = v;
    else if (k === 'html') nodo.innerHTML = v;
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in nodo && k !== 'list' && k !== 'style') nodo[k] = v;
    else nodo.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) nodo.append(h.nodeType ? h : document.createTextNode(h));
  return nodo;
}

export const svg = (nombre, opciones) => { const t = document.createElement('template'); t.innerHTML = icono(nombre, opciones); return t.content.firstChild; };

/** Botón con icono y/o texto. `activo` pone aria-pressed. */
export function boton({ icono: ic, texto = '', titulo = '', atajo = '', clase = '', onclick, activo, deshabilitado = false, id } = {}) {
  const b = el('button', { type: 'button', class: 'ed-btn ' + clase, title: titulo + (atajo ? ` (${atajo})` : ''), disabled: deshabilitado, onclick, id });
  if (ic) b.append(svg(ic));
  if (texto) b.append(el('span', {}, texto));
  if (activo !== undefined) b.setAttribute('aria-pressed', String(!!activo));
  if (!texto && titulo) b.setAttribute('aria-label', titulo);
  return b;
}

/** Sección plegable; el estado abierto/cerrado se recuerda por `clave`. */
export function seccion(titulo, contenido, { clave = titulo, abierta = true, preferencias = null } = {}) {
  const recordado = preferencias?.leer('sec:' + clave, abierta) ?? abierta;
  const d = el('details', { class: 'ed-seccion', open: !!recordado }, el('summary', {}, titulo), el('div', { class: 'ed-contenido' }, contenido));
  d.addEventListener('toggle', () => preferencias?.escribir('sec:' + clave, d.open));
  return d;
}

export function campo(etiqueta, control, { titulo = '' } = {}) {
  return el('div', { class: 'ed-campo', title: titulo }, el('span', { class: 'ed-etiqueta' }, etiqueta), control);
}

/** Campo numérico con rótulo de eje coloreado (x|y|z). Arrastrar sobre el rótulo cambia el valor (como en Blender). */
export function numero({ eje, paso = .1, decimales = 3, valor = 0, alCambiar = () => {}, titulo = '' } = {}) {
  const input = el('input', { class: 'ed-input', type: 'number', step: paso, value: valor, title: titulo, 'aria-label': (titulo || eje || '').toString() });
  const rotulo = el('span', { dataset: { eje } }, (eje ?? '').toUpperCase());
  rotulo.style.cursor = 'ew-resize'; rotulo.title = 'Arrastra para cambiar el valor';
  const caja = el('div', { class: 'ed-num' }, rotulo, input);
  input.addEventListener('change', () => alCambiar(input.valueAsNumber, input));
  let base = null;
  rotulo.addEventListener('pointerdown', e => { base = { x: e.clientX, v: input.valueAsNumber || 0 }; rotulo.setPointerCapture(e.pointerId); e.preventDefault(); });
  rotulo.addEventListener('pointermove', e => { if (!base) return; const v = base.v + (e.clientX - base.x) * paso * (e.shiftKey ? .1 : 1); input.value = +v.toFixed(decimales); input.dispatchEvent(new Event('change')); });
  rotulo.addEventListener('pointerup', () => { base = null; });
  caja.poner = v => { if (document.activeElement !== input) input.value = Number.isFinite(v) ? +(+v).toFixed(decimales) : ''; };
  caja.marcar = activo => { if (activo) caja.dataset.ejeActivo = eje; else delete caja.dataset.ejeActivo; };
  return caja;
}

export function vec3({ paso, decimales, valores = [0, 0, 0], alCambiar = () => {}, titulo = '' }) {
  const cajas = ['x', 'y', 'z'].map((eje, i) => numero({ eje, paso, decimales, valor: valores[i], titulo: `${titulo} ${eje.toUpperCase()}`, alCambiar: () => alCambiar(cajas.map(c => c.querySelector('input').valueAsNumber)) }));
  const nodo = el('div', { class: 'ed-vec3' }, ...cajas);
  nodo.poner = v => cajas.forEach((c, i) => c.poner(v[i]));
  nodo.marcar = eje => cajas.forEach((c, i) => c.marcar(eje === 'xyz'[i]));
  return nodo;
}

export function rango({ min = 0, max = 1, paso = .01, valor = 0, formato = v => (+v).toFixed(2).replace('.', ','), alCambiar = () => {}, titulo = '' } = {}) {
  const input = el('input', { type: 'range', min, max, step: paso, value: valor, 'aria-label': titulo }), salida = el('output', {}, formato(valor));
  input.addEventListener('input', () => { salida.textContent = formato(input.value); alCambiar(+input.value, 'input'); });
  input.addEventListener('change', () => alCambiar(+input.value, 'change'));
  const nodo = el('div', { class: 'ed-rango', title: titulo }, input, salida);
  nodo.poner = v => { input.value = v; salida.textContent = formato(v); };
  return nodo;
}

export function conmutador(texto, { valor = false, alCambiar = () => {}, titulo = '' } = {}) {
  const input = el('input', { type: 'checkbox', checked: valor, 'aria-label': texto });
  input.addEventListener('change', () => alCambiar(input.checked));
  const nodo = el('label', { class: 'ed-conmutador', title: titulo }, el('span', {}, texto), input);
  nodo.poner = v => { input.checked = !!v; };
  return nodo;
}

/** Mensaje de lista vacía con indicación de qué hacer. */
export const vacio = texto => el('div', { class: 'ed-vacio' }, texto);

/** Preferencias de interfaz en localStorage (tamaños de panel, secciones abiertas…). Nunca lanza. */
export function crearPreferencias(clave = 'spanstories.editor.ui.v1') {
  let datos = {};
  try { datos = JSON.parse(localStorage.getItem(clave) || '{}') || {}; } catch { datos = {}; }
  return {
    leer: (k, defecto) => (k in datos ? datos[k] : defecto),
    escribir(k, v) { datos[k] = v; try { localStorage.setItem(clave, JSON.stringify(datos)); } catch { /* sin almacenamiento */ } },
  };
}
