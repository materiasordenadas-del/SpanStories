// Armazón del editor: crea las áreas de shell.css, mueve el visor al centro y gestiona tamaños, plegado y pantalla completa.
// No sabe nada de objetos, ambiente ni biblioteca: ofrece contenedores y cada panel se monta en el suyo.
import { el } from './componentes.js';

const LIMITES = { izq: [150, 380], der: [260, 520], inf: [120, 480] };

function cargarEstilos() {
  for (const nombre of ['tokens.css', 'shell.css']) {
    const href = new URL('./' + nombre, import.meta.url).href;
    if (!document.querySelector(`link[href="${href}"]`)) document.head.append(el('link', { rel: 'stylesheet', href }));
  }
}

export function crearShell({ viewport, preferencias, titulo = 'Editor de escenarios' }) {
  cargarEstilos();
  const raiz = el('div', { class: 'ed ed-shell', dataset: { tema: preferencias.leer('tema', 'claro') } });
  const area = {
    menu: el('div', { class: 'ed-menubar', role: 'menubar' }),
    tools: el('div', { class: 'ed-toolbar', role: 'toolbar', 'aria-label': 'Herramientas' }),
    izq: el('aside', { class: 'ed-dock ed-izq', 'aria-label': 'Jerarquía' }),
    visor: el('section', { class: 'ed-visor', 'aria-label': 'Escena 3D' }),
    der: el('aside', { class: 'ed-dock ed-der', 'aria-label': 'Propiedades' }),
    inf: el('section', { class: 'ed-dock ed-inf', 'aria-label': 'Biblioteca e inventario' }),
    estado: el('div', { class: 'ed-estado', role: 'status' }),
  };
  raiz.append(...Object.values(area));
  const original = { padre: viewport.parentElement, siguiente: viewport.nextSibling };
  let acoplado = false;
  /** Mete el visor en el hueco central y muestra el editor (modo Editor). */
  function acoplar() { if (acoplado) return; area.visor.prepend(viewport); document.body.append(raiz); document.body.classList.add('ed-activo'); acoplado = true; window.dispatchEvent(new Event('resize')); }
  /** Devuelve el visor a su sitio original y oculta el editor (Estudio, aprendizaje). */
  function desacoplar() { if (!acoplado) return; original.padre.insertBefore(viewport, original.siguiente); raiz.remove(); document.body.classList.remove('ed-activo'); acoplado = false; window.dispatchEvent(new Event('resize')); }
  acoplar();

  // -- Tamaños persistentes con divisores arrastrables -------------------------------------------------------------
  const medir = { izq: '--ed-w-izq', der: '--ed-w-der', inf: '--ed-h-inf' };
  for (const [clave, variable] of Object.entries(medir)) {
    const guardado = preferencias.leer('tam:' + clave, null);
    if (guardado) raiz.style.setProperty(variable, guardado + 'px');
    const divisor = el('div', { class: 'ed-divisor', role: 'separator', 'aria-orientation': clave === 'inf' ? 'horizontal' : 'vertical', tabIndex: 0, title: 'Arrastra para cambiar el tamaño (doble clic: tamaño original)' });
    area[clave].append(divisor);
    const [min, max] = LIMITES[clave];
    divisor.addEventListener('pointerdown', e => {
      divisor.setPointerCapture(e.pointerId); divisor.dataset.arrastrando = '';
      const r = area[clave].getBoundingClientRect(), inicio = clave === 'inf' ? r.height : r.width, origen = clave === 'inf' ? e.clientY : e.clientX;
      const mover = ev => {
        const d = (clave === 'inf' ? ev.clientY : ev.clientX) - origen;
        const nuevo = Math.round(Math.max(min, Math.min(max, clave === 'der' || clave === 'inf' ? inicio - d : inicio + d)));
        raiz.style.setProperty(variable, nuevo + 'px'); preferencias.escribir('tam:' + clave, nuevo);
      };
      const soltar = () => { delete divisor.dataset.arrastrando; divisor.removeEventListener('pointermove', mover); divisor.removeEventListener('pointerup', soltar); };
      divisor.addEventListener('pointermove', mover); divisor.addEventListener('pointerup', soltar);
    });
    divisor.addEventListener('dblclick', () => { raiz.style.removeProperty(variable); preferencias.escribir('tam:' + clave, null); });
    divisor.addEventListener('keydown', e => {
      const paso = e.shiftKey ? 40 : 10, actual = parseFloat(getComputedStyle(raiz).getPropertyValue(variable)) || area[clave].getBoundingClientRect()[clave === 'inf' ? 'height' : 'width'];
      const signo = ({ ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, ArrowUp: 1 })[e.key]; if (!signo) return;
      e.preventDefault(); const nuevo = Math.max(min, Math.min(max, actual + signo * paso * (clave === 'izq' ? 1 : -1) * (clave === 'inf' ? -1 : 1)));
      raiz.style.setProperty(variable, nuevo + 'px'); preferencias.escribir('tam:' + clave, nuevo);
    });
  }

  // -- Visibilidad de paneles ----------------------------------------------------------------------------------------
  for (const clave of ['izq', 'der', 'inf']) if (preferencias.leer('oculto:' + clave, false)) raiz.dataset[clave] = 'oculto';
  const panelOculto = clave => raiz.dataset[clave] === 'oculto';
  function alternar(clave, visible = panelOculto(clave)) {
    if (visible) delete raiz.dataset[clave]; else raiz.dataset[clave] = 'oculto';
    preferencias.escribir('oculto:' + clave, !visible); window.dispatchEvent(new Event('resize'));
  }
  function pantallaCompleta(valor = raiz.dataset.pantalla !== 'completa') {
    if (valor) raiz.dataset.pantalla = 'completa'; else delete raiz.dataset.pantalla;
    window.dispatchEvent(new Event('resize'));
  }
  function tema(valor) { raiz.dataset.tema = valor; preferencias.escribir('tema', valor); }

  // -- Panel derecho: Inspector (por defecto) o el contenido de un menú superior ---------------------------------------
  const vistaInspector = el('div', { class: 'ed-dock-vista ed-vista-inspector', style: 'display:flex;flex-direction:column;min-height:0;flex:1' });
  const vistaHub = el('div', { class: 'ed-dock-vista ed-hub', style: 'display:none;flex-direction:column;min-height:0;flex:1' });
  area.der.prepend(vistaInspector, vistaHub);
  let vistaActual = 'inspector'; const oyentesVista = new Set();
  function verDerecha(nombre) {
    vistaActual = nombre === 'inspector' ? 'inspector' : nombre;
    vistaInspector.style.display = nombre === 'inspector' ? 'flex' : 'none'; vistaHub.style.display = nombre === 'inspector' ? 'none' : 'flex';
    if (panelOculto('der')) alternar('der', true);
    for (const fn of oyentesVista) fn(vistaActual);
  }

  // -- Pestañas genéricas (izquierda y abajo) ------------------------------------------------------------------------
  function pestanas(contenedor, definiciones, { clave, inicial } = {}) {
    const barra = el('div', { class: 'ed-tabs', role: 'tablist' }), cuerpos = new Map(), botones = new Map();
    const cuerpo = el('div', { class: 'ed-cuerpo', style: 'display:flex;flex-direction:column' });
    contenedor.prepend(cuerpo); contenedor.prepend(barra);
    let actual = preferencias.leer('tab:' + clave, inicial ?? definiciones[0].id);
    if (!definiciones.some(d => d.id === actual)) actual = definiciones[0].id;
    for (const d of definiciones) {
      const b = el('button', { class: 'ed-tab', role: 'tab', type: 'button', onclick: () => elegir(d.id) }, d.icono ? d.icono() : null, d.titulo);
      const c = el('div', { class: 'ed-tab-cuerpo', style: 'display:none;min-height:0;flex:1;overflow:auto', role: 'tabpanel' });
      barra.append(b); cuerpo.append(c); botones.set(d.id, b); cuerpos.set(d.id, c);
    }
    function elegir(id) {
      actual = id; preferencias.escribir('tab:' + clave, id);
      for (const [k, b] of botones) { b.setAttribute('aria-selected', String(k === id)); cuerpos.get(k).style.display = k === id ? 'block' : 'none'; }
    }
    elegir(actual);
    return { barra, cuerpo: id => cuerpos.get(id), elegir, boton: id => botones.get(id), get actual() { return actual; } };
  }

  function dispose() { desacoplar(); }
  return { raiz, area, vistaInspector, vistaHub, verDerecha, alternar, panelOculto, pantallaCompleta, tema, pestanas, dispose, acoplar, desacoplar, get acoplado() { return acoplado; },
    get vistaDerecha() { return vistaActual; }, alCambiarVista(fn) { oyentesVista.add(fn); return () => oyentesVista.delete(fn); },
    get enPantallaCompleta() { return raiz.dataset.pantalla === 'completa'; }, titulo };
}
