// Pestaña «Inventario de la historia» (abajo): solo lo que la historia usa en ESTE escenario.
// Palabras de vocabulario → objetos que las cubren (con aviso si faltan o están ocultos), personajes y cámaras.
import { el, svg, vacio } from './componentes.js';
import { construirInventario, cargarHistorias } from '../biblioteca/InventarioHistoria.js';

export function montarInventario({ contenedor, objetos, seleccion, capas, zonaId, vocabularioUrl, estado = () => {}, enfocar = () => {} }) {
  let historias = null, vocabulario = null, error = null, disposed = false, cargando = false, pendiente = 0;
  const refrescarBoton = el('button', { type: 'button', class: 'ed-btn', title: 'Volver a leer las historias guardadas', onclick: () => cargar() }, svg('restaurar', { tam: 14 }), el('span', {}, 'Actualizar'));
  const resumen = el('span', { class: 'ed-chip' }, 'Sin cargar');
  const cuerpo = el('div', { style: 'padding:8px 10px;overflow:auto;display:grid;gap:10px;align-content:start' });
  contenedor.append(el('div', { class: 'ed-bib' }, el('div', { class: 'ed-bib-cab' }, el('b', {}, 'Lo que usa la historia'), resumen, el('span', { class: 'ed-espaciador' }), refrescarBoton), cuerpo));

  async function cargar() {
    if (cargando) return; cargando = true; error = null; resumen.textContent = 'Leyendo historias…'; dibujar();
    try {
      vocabulario = vocabularioUrl ? await (await fetch(vocabularioUrl)).json().catch(() => null) : null;
      historias = await cargarHistorias();
    } catch (e) { error = e.message; historias = []; estado(e.message); }
    cargando = false; dibujar();
  }
  const programar = () => { if (pendiente || disposed) return; pendiente = requestAnimationFrame(() => { pendiente = 0; dibujar(); }); };

  function seleccionar(ids) { const validos = ids.filter(i => objetos.entries.has(i)); if (!validos.length) return; seleccion.poner(validos, validos[0]); enfocar(); }
  function dibujar() {
    if (disposed) return; cuerpo.replaceChildren();
    if (historias === null) { cuerpo.append(vacio('Pulsa «Actualizar» para leer las historias guardadas.')); return; }
    if (error) { cuerpo.append(vacio('No se pudieron leer las historias: ' + error)); resumen.textContent = 'Error'; return; }
    const lista = objetos.listar(), ocultos = new Set(lista.filter(o => objetos.obtener(o.id)?.userData.ocultoUsuario).map(o => o.id));
    const inv = construirInventario({ zonaId, lista, vocabulario, historias, ocultos });
    resumen.textContent = `${inv.palabras.length} palabras · ${inv.personajes.length} personajes`;
    if (!inv.palabras.length && !inv.personajes.length) { cuerpo.append(vacio(`Ninguna historia guardada usa este escenario todavía (${historias.length} historia${historias.length === 1 ? '' : 's'} leída${historias.length === 1 ? '' : 's'}).`)); return; }
    const secPalabras = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px' });
    for (const p of inv.palabras) {
      const estadoChip = p.faltan ? el('span', { class: 'ed-chip', 'data-tipo': 'error' }, 'Sin objeto en el escenario') : p.objetos.some(o => o.estado === 'oculto') ? el('span', { class: 'ed-chip', 'data-tipo': 'aviso' }, 'Hay objetos ocultos') : el('span', { class: 'ed-chip' }, `${p.objetos.length} objeto${p.objetos.length === 1 ? '' : 's'}`);
      const tarjeta = el('button', { type: 'button', class: 'ed-tarjeta', style: 'grid-template-rows:auto;padding:8px 10px;gap:4px', disabled: p.faltan, title: p.faltan ? 'Ningún objeto coincide con esta palabra' : 'Seleccionar sus objetos', onclick: () => seleccionar(p.objetos.map(o => o.id)) },
        el('div', { style: 'display:flex;justify-content:space-between;gap:6px;align-items:center' }, el('b', {}, p.palabra), estadoChip),
        el('span', { style: 'font-size:11px;color:var(--ed-texto-3)' }, [...new Set(p.escenas.map(s => `${s.historia} › ${s.escena}`))].slice(0, 3).join(' · ')));
      secPalabras.append(tarjeta);
    }
    if (inv.palabras.length) cuerpo.append(el('div', {}, el('div', { class: 'ed-hub-grupo', style: 'padding:0 0 4px' }, 'Vocabulario que se enseña aquí'), secPalabras));
    if (inv.personajes.length) cuerpo.append(el('div', {}, el('div', { class: 'ed-hub-grupo', style: 'padding:0 0 4px' }, 'Personajes en estas escenas'),
      el('div', { class: 'ed-fila-botones' }, ...inv.personajes.map(p => el('span', { class: 'ed-chip', title: [...new Set(p.escenas.map(s => s.escena))].join(', ') }, svg('marcador', { tam: 12 }), p.nombre)))));
    if (inv.camaras.length) cuerpo.append(el('div', { class: 'ed-etiqueta', style: 'color:var(--ed-texto-3)' }, 'Cámaras definidas: ' + inv.camaras.map(c => `${c.escena} (${c.cantidad})`).join(' · ')));
  }
  const bajas = [capas.alCambiar(programar)];
  dibujar(); cargar();
  return { recargar: cargar, dispose() { disposed = true; cancelAnimationFrame(pendiente); bajas.forEach(b => b()); contenedor.replaceChildren(); } };
}
