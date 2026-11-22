// Panel «Jerarquía» (izquierda): grupos del usuario, objetos añadidos y escenario original por sector.
// Buscar, seleccionar (Mayús/Ctrl suman), renombrar (doble clic), ocultar (ojo), bloquear (candado), aislar.
import { el, svg, vacio } from './componentes.js';
import { agruparTipos, textoRecuento } from '../core/Tipos.js';

const ICONO_TIPO = { edificio: 'casa', arbol: 'arbol', árbol: 'arbol', vegetacion: 'arbol', mobiliario: 'banco', banco: 'banco', farol: 'farol', roca: 'roca', 'glb-importado': 'caja', 'glb-nodo': 'caja', decoracion: 'farol' };
const iconoDe = tipo => ICONO_TIPO[(tipo ?? '').toLowerCase()] ?? 'caja';
const MAX_FILAS = 400, MAX_EJEMPLARES = 200;

export function montarJerarquia({ contenedor, objetos, seleccion, capas, editor, preferencias, mostrarMenu = () => {}, estado = () => {} }) {
  const entrada = el('input', { class: 'ed-input', type: 'search', placeholder: 'Buscar objeto…', 'aria-label': 'Buscar objeto' });
  const cabecera = el('div', { class: 'ed-buscar' }, svg('buscar', { tam: 14 }), entrada);
  const arbol = el('div', { class: 'ed-arbol', role: 'tree', 'aria-label': 'Objetos del escenario' });
  const resumen = el('div', { class: 'ed-tag-tipo', style: 'padding:4px 10px' });
  contenedor.append(cabecera, arbol, resumen);
  const plegados = new Set(preferencias.leer('jerarquia:plegados', []));
  let pendiente = 0, ultimaPulsada = null, disposed = false, ultimoTotal = -1;

  const guardarPlegados = () => preferencias.escribir('jerarquia:plegados', [...plegados]);
  const programar = () => { if (pendiente || disposed) return; pendiente = requestAnimationFrame(() => { pendiente = 0; dibujar(); }); };

  function propiedades(id) {
    const raiz = objetos.obtener(id);
    return { oculto: !!raiz?.userData.ocultoUsuario, bloqueado: capas.bloqueado(id), capaOculta: !capas.capaVisible(id) };
  }

  function fila({ id, nombre, tipo, nivel = 0, grupo = false, plegable = false, plegado = false, claveGrupo = null, icono = null }) {
    const sel = id && seleccion.tiene(id), p = id ? propiedades(id) : {};
    const f = el('div', { class: 'ed-arbol-fila' + (grupo ? ' ed-arbol-grupo' : ''), role: 'treeitem', tabIndex: -1, 'aria-selected': id ? String(!!sel) : null,
      dataset: { id: id ?? '' , ...(id && objetos.seleccion === id ? { primaria: '' } : {}), ...(p.oculto ? { oculto: '' } : {}), ...(p.capaOculta ? { capaOculta: '' } : {}) },
      style: `--ed-nivel:${nivel}` });
    const plegar = el('span', { class: 'ed-plegar' }, plegable ? svg(plegado ? 'chevron' : 'chevronAbajo', { tam: 12 }) : '');
    if (plegable) plegar.addEventListener('click', e => { e.stopPropagation(); alternarPlegado(claveGrupo); });
    f.append(plegar, svg(icono ?? iconoDe(tipo), { tam: 14 }), el('span', { class: 'ed-nombre', title: nombre }, nombre), el('span', { class: 'ed-tag-tipo' }, grupo ? '' : ''));
    if (id) {
      const ojo = el('button', { type: 'button', class: 'ed-mini', title: p.oculto ? 'Mostrar' : 'Ocultar', 'aria-label': p.oculto ? 'Mostrar' : 'Ocultar', ...(p.oculto ? { dataset: { on: '' } } : {}) }, svg(p.oculto ? 'ojoOculto' : 'ojo', { tam: 14 }));
      ojo.addEventListener('click', e => { e.stopPropagation(); alternarOculto(id); });
      const candado = el('button', { type: 'button', class: 'ed-mini', title: p.bloqueado ? 'Desbloquear' : 'Bloquear', 'aria-label': p.bloqueado ? 'Desbloquear' : 'Bloquear', ...(p.bloqueado ? { dataset: { on: '' } } : {}) }, svg(p.bloqueado ? 'candado' : 'candadoAbierto', { tam: 14 }));
      candado.addEventListener('click', e => { e.stopPropagation(); try { capas.bloquear([id], !p.bloqueado); } catch (error) { estado(error.message); } });
      f.append(ojo, candado);
      f.addEventListener('click', e => elegir(id, e));
      f.addEventListener('dblclick', e => { e.preventDefault(); renombrar(f, id); });
      f.addEventListener('contextmenu', e => { e.preventDefault(); if (!seleccion.tiene(id)) seleccion.poner(capas.expandirSeleccion([id]), id); mostrarMenu({ contexto: seleccion.cantidad > 1 ? 'multi' : 'objeto', x: e.clientX, y: e.clientY, entrada: objetos.entries.get(id), punto: null }); });
    } else if (plegable) f.addEventListener('click', () => alternarPlegado(claveGrupo));
    return f;
  }

  function alternarPlegado(clave) { plegados.has(clave) ? plegados.delete(clave) : plegados.add(clave); guardarPlegados(); programar(); }
  function alternarOculto(id) { try { const raiz = objetos.obtener(id); editor.applyMany([{ id, data: { hidden: !raiz.userData.ocultoUsuario } }]); capas.aplicarVisibilidad([id]); } catch (error) { estado(error.message); } }
  function elegir(id, e) {
    const lista = capas.expandirSeleccion([id]);
    if (e.shiftKey && ultimaPulsada) {
      const visibles = [...arbol.querySelectorAll('[data-id]')].map(n => n.dataset.id).filter(Boolean);
      const a = visibles.indexOf(ultimaPulsada), b = visibles.indexOf(id);
      if (a >= 0 && b >= 0) { seleccion.poner(visibles.slice(Math.min(a, b), Math.max(a, b) + 1), id); return; }
    }
    if (e.ctrlKey || e.metaKey) seleccion.poner(seleccion.tiene(id) ? seleccion.ids.filter(x => !lista.includes(x)) : [...seleccion.ids, ...lista], id);
    else seleccion.poner(lista, id);
    ultimaPulsada = id;
  }
  function renombrar(f, id) {
    const celda = f.querySelector('.ed-nombre'), antes = celda.textContent;
    celda.contentEditable = 'plaintext-only'; celda.focus();
    getSelection()?.selectAllChildren(celda);
    const fin = confirmar => {
      celda.removeEventListener('blur', onBlur); celda.removeEventListener('keydown', onTecla); celda.contentEditable = 'false'; celda.removeAttribute('contenteditable');
      const nuevo = celda.textContent.trim();
      if (confirmar && nuevo && nuevo !== antes) { try { editor.applyMany([{ id, data: { etiqueta: nuevo.slice(0, 120) } }]); } catch (error) { estado(error.message); } } else celda.textContent = antes;
      programar();
    };
    const onBlur = () => fin(true), onTecla = e => { if (e.key === 'Enter') { e.preventDefault(); fin(true); } else if (e.key === 'Escape') { e.preventDefault(); fin(false); } e.stopPropagation(); };
    celda.addEventListener('blur', onBlur); celda.addEventListener('keydown', onTecla);
  }

  function dibujar() {
    if (disposed) return;
    const consulta = entrada.value.trim().toLocaleLowerCase(), lista = objetos.listar(), filas = [];
    const anadido = id => id.startsWith('import-');
    if (consulta) {
      const encontrados = lista.filter(o => (o.etiqueta + ' ' + o.id + ' ' + o.tipo + ' ' + o.sector).toLocaleLowerCase().includes(consulta));
      for (const o of encontrados.slice(0, MAX_FILAS)) filas.push(fila({ id: o.id, nombre: o.etiqueta, tipo: o.tipo }));
      resumen.textContent = `${encontrados.length} coincidencia${encontrados.length === 1 ? '' : 's'}` + (encontrados.length > MAX_FILAS ? ` · se muestran ${MAX_FILAS}` : '');
    } else {
      const usados = new Set();
      const grupos = capas.e.grupos;
      if (grupos.length) {
        filas.push(fila({ nombre: 'Grupos', grupo: true, icono: 'agrupar', plegable: true, plegado: plegados.has('grupos'), claveGrupo: 'grupos' }));
        if (!plegados.has('grupos')) for (const g of grupos) {
          const clave = 'g:' + g.id, plegado = plegados.has(clave);
          filas.push(fila({ nombre: `${g.nombre} (${g.miembros.length})`, nivel: 1, grupo: true, icono: 'agrupar', plegable: true, plegado, claveGrupo: clave }));
          if (!plegado) for (const m of g.miembros) { const o = objetos.entries.get(m); if (o) { filas.push(fila({ id: m, nombre: o.etiqueta, tipo: o.tipo, nivel: 2 })); } }
        }
        for (const g of grupos) for (const m of g.miembros) usados.add(m);
      }
      const libres = lista.filter(o => !usados.has(o.id));
      const archivoDe = id => { const r = objetos.obtener(id); const imp = r?.userData.cityImportId && editor.state.imports.get(r.userData.cityImportId); return imp?.filename ?? null; };
      const secciones = [['anadidos', 'Objetos añadidos', 'mas', libres.filter(o => anadido(o.id))], ['original', 'Escenario original', 'casa', libres.filter(o => !anadido(o.id))]];
      for (const [clave, titulo, ic, items] of secciones) {
        if (!items.length && clave === 'anadidos') continue;
        const r = agruparTipos(items, archivoDe);
        filas.push(fila({ nombre: `${titulo} (${r.distintos.toLocaleString('es-ES')})`, grupo: true, icono: ic, plegable: true, plegado: plegados.has(clave), claveGrupo: clave }));
        if (plegados.has(clave)) continue;
        let pintadas = 0;
        for (const g of r.grupos) {
          if (pintadas > MAX_FILAS) { filas.push(fila({ nombre: '… usa el buscador para ver el resto', nivel: 1, grupo: true, icono: 'buscar' })); break; }
          if (g.ids.length === 1) { const o = objetos.entries.get(g.ids[0]); filas.push(fila({ id: o.id, nombre: o.etiqueta, tipo: o.tipo, nivel: 1 })); pintadas++; continue; }
          const k = 'abierto:' + g.clave, plegado = !plegados.has(k);
          filas.push(fila({ nombre: `${g.nombre} ×${g.ids.length.toLocaleString('es-ES')}`, nivel: 1, grupo: true, icono: ICONO_TIPO[g.nombre.toLowerCase()] ?? 'arbol', plegable: true, plegado, claveGrupo: k })); pintadas++;
          if (!plegado) for (const id of g.ids.slice(0, MAX_EJEMPLARES)) { const o = objetos.entries.get(id); filas.push(fila({ id, nombre: `${g.nombre} ${g.ids.indexOf(id) + 1}`, tipo: o.tipo, nivel: 2 })); pintadas++; }
          if (!plegado && g.ids.length > MAX_EJEMPLARES) filas.push(fila({ nombre: `… y ${(g.ids.length - MAX_EJEMPLARES).toLocaleString('es-ES')} ejemplares más`, nivel: 2, grupo: true, icono: 'vacio' }));
        }
      }
      resumen.textContent = textoRecuento(agruparTipos(lista, archivoDe)) + ` · ${seleccion.cantidad} seleccionado${seleccion.cantidad === 1 ? '' : 's'}`;
    }
    arbol.replaceChildren(...(filas.length ? filas : [vacio('Todavía no hay objetos. Añade uno desde la biblioteca.')]));
    arbol.querySelector('[data-primaria]')?.scrollIntoView({ block: 'nearest' });
  }

  // El sector «abierto:» usa la lógica inversa: por defecto todos los sectores están plegados.
  entrada.addEventListener('input', programar);
  const bajas = [seleccion.alCambiar(programar), capas.alCambiar(programar), editor.alCambiar(tipo => { if (tipo === 'refresco') { if (objetos.entries.size === ultimoTotal) return; } if (tipo === 'objeto' || tipo === 'refresco' || tipo === 'restaurado') { ultimoTotal = objetos.entries.size; programar(); } })];
  dibujar();
  return { refrescar: programar, dispose() { disposed = true; cancelAnimationFrame(pendiente); bajas.forEach(b => b()); contenedor.replaceChildren(); } };
}
