// Pestaña «Biblioteca de objetos» (abajo): objetos registrados por el usuario + objetos del ambiente que ya trae el motor.
// Categorías, búsqueda, favoritos, añadir GLB (también arrastrando archivos). Pulsar o arrastrar una tarjeta activa la colocación.
import { el, svg, vacio } from './componentes.js';
import { CATEGORIAS } from '../biblioteca/Registro.js';

const ICONO_CAT = { arquitectura: 'casa', naturaleza: 'arbol', mobiliario: 'banco', decoracion: 'farol', vehiculos: 'caja', estructuras: 'casa', 'mis-modelos': 'caja' };

export function montarBiblioteca({ contenedor, biblioteca, colocacion, preferencias, estado = () => {}, registrarArchivos }) {
  let categoria = preferencias.leer('bib:categoria', 'todos'), consulta = '', soloFavoritos = false, disposed = false, pendiente = 0;
  const buscar = el('input', { class: 'ed-input', type: 'search', placeholder: 'Buscar en la biblioteca…', 'aria-label': 'Buscar en la biblioteca', style: 'width:200px' });
  const archivos = el('input', { type: 'file', accept: '.glb', multiple: true, hidden: true });
  const chips = el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' });
  const repetir = el('label', { class: 'ed-chip', title: 'Seguir colocando copias hasta pulsar Esc' }, el('input', { type: 'checkbox', checked: true, style: 'margin:0' }), 'Colocar varias');
  repetir.querySelector('input').addEventListener('change', e => { colocacion.repetir = e.target.checked; });
  const anadir = el('button', { type: 'button', class: 'ed-btn', title: 'Añadir uno o varios archivos .glb a la biblioteca', onclick: () => archivos.click() }, svg('mas', { tam: 14 }), el('span', {}, 'Añadir GLB'));
  const rejilla = el('div', { class: 'ed-rejilla', role: 'list' });
  const cab = el('div', { class: 'ed-bib-cab' }, chips, el('span', { class: 'ed-espaciador' }), repetir, buscar, anadir, archivos);
  contenedor.append(el('div', { class: 'ed-bib' }, cab, rejilla));

  buscar.addEventListener('input', () => { consulta = buscar.value.trim().toLocaleLowerCase(); programar(); });
  archivos.addEventListener('change', async () => { const lista = [...archivos.files]; archivos.value = ''; if (lista.length) await registrarArchivos(lista); });
  // Soltar archivos .glb sobre la biblioteca
  rejilla.addEventListener('dragover', e => { if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  rejilla.addEventListener('drop', async e => { const lista = [...(e.dataTransfer?.files ?? [])]; if (!lista.length) return; e.preventDefault(); await registrarArchivos(lista); });

  const programar = () => { if (pendiente || disposed) return; pendiente = requestAnimationFrame(dibujar); };
  const chip = (id, texto, ic) => el('button', { type: 'button', class: 'ed-cat', 'aria-pressed': String(categoria === id), onclick: () => { categoria = id; soloFavoritos = id === 'favoritos'; preferencias.escribir('bib:categoria', id); programar(); } }, ic ? svg(ic, { tam: 12 }) : null, ' ', texto);

  function tarjeta(item) {
    const activa = colocacion.armado && colocacion.item?.clave === item.clave;
    const img = el('div', { class: 'ed-mini-img' }, svg(ICONO_CAT[item.categoria] ?? 'caja', { tam: 34 }));
    const fav = el('button', { type: 'button', class: 'ed-fav', title: item.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos', 'aria-label': 'Favorito', ...(item.favorito ? { dataset: { on: '' } } : {}), onclick: async e => { e.stopPropagation(); try { await biblioteca.marcarFavorito(item, !item.favorito); } catch (error) { estado(error.message); } } }, svg('estrella', { tam: 12 }));
    img.append(fav);
    biblioteca.miniaturaDe(item).then(url => { if (url && !disposed) { img.style.backgroundImage = `url("${url}")`; img.querySelector('.ed-ico')?.remove(); img.style.backgroundSize = 'contain'; } }).catch(() => {});
    const dim = item.dimensiones?.some(Boolean) ? item.dimensiones.map(v => (+v).toFixed(1).replace('.', ',')).join(' × ') + ' m' : (item.detalle || '');
    const meta = el('div', { class: 'ed-meta' }, el('b', { title: item.nombre }, item.nombre), el('span', {}, [dim, item.triangulos ? `${item.triangulos.toLocaleString('es-ES')} tri` : ''].filter(Boolean).join(' · ') || '—'), el('span', {}, item.origen === 'ambiente' ? 'Del ambiente' : 'Mi biblioteca'));
    const t = el('button', { type: 'button', class: 'ed-tarjeta', role: 'listitem', 'aria-pressed': String(activa), draggable: true, title: 'Clic: colocar en el escenario · arrastrar al visor',
      onclick: () => activar(item, false) }, img, meta);
    t.addEventListener('dragstart', e => { e.dataTransfer.setData('application/x-spanstories-biblioteca', item.clave); e.dataTransfer.effectAllowed = 'copy'; void activar(item, true); });
    return t;
  }
  async function activar(item, una) {
    try { if (colocacion.armado && colocacion.item?.clave === item.clave && !una) { colocacion.desarmar(); programar(); return; } const blob = await biblioteca.blobDe(item); await colocacion.armar(item, blob, { una }); }
    catch (error) { estado(error.message); } programar();
  }

  function dibujar() {
    pendiente = 0; if (disposed) return;
    const todos = biblioteca.todos();
    const conteo = id => todos.filter(i => i.categoria === id).length;
    chips.replaceChildren(chip('todos', `Todos · ${todos.length}`), chip('favoritos', `Favoritos · ${todos.filter(i => i.favorito).length}`, 'estrella'), ...CATEGORIAS.filter(([id]) => conteo(id)).map(([id, nombre]) => chip(id, `${nombre} · ${conteo(id)}`, ICONO_CAT[id])));
    let lista = todos.filter(i => (categoria === 'todos' || soloFavoritos ? true : i.categoria === categoria) && (!soloFavoritos || i.favorito) && (!consulta || (i.nombre + ' ' + i.categoria).toLocaleLowerCase().includes(consulta)));
    lista = lista.sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre, 'es'));
    rejilla.replaceChildren(...(lista.length ? lista.map(tarjeta) : [vacio(biblioteca.cargado ? (biblioteca.error ? 'No se pudo leer la biblioteca: ' + biblioteca.error : 'No hay objetos en esta categoría. Arrastra aquí un archivo .glb para añadir el primero.') : 'Cargando biblioteca…')]));
  }
  const bajas = [biblioteca.alCambiar(programar)]; dibujar();
  return { refrescar: programar, dispose() { disposed = true; cancelAnimationFrame(pendiente); bajas.forEach(b => b()); contenedor.replaceChildren(); } };
}
