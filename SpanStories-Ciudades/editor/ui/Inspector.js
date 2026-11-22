// Panel «Inspector» (derecha). Contextual: muestra lo que corresponde a la selección o, en los demás espacios de
// trabajo (terreno, cielo, estilo, escena), el panel registrado para ese espacio.
import * as T from '../../engine/three.js';
import { capturarObjeto } from '../../engine/CityProject.js';
import { el, svg, seccion, campo, vec3, boton, vacio, conmutador } from './componentes.js';
import { materialesDe, aplicarColores } from '../adaptadores/Materiales.js';
import { cajaDeRaiz, corregirPosicion } from '../herramientas/Colision.js';
import { agruparTipos, textoRecuento } from '../core/Tipos.js';
import { encontrarHuerfanos } from '../core/Huerfanos.js';

const n1 = v => (+v).toFixed(2).replace('.', ',');

export function montarInspector({ contenedor, objetos, seleccion, capas, editor, gizmo, preferencias, ground, obstaculos, acciones, contexto, estado = () => {}, existeId = () => true }) {
  const paneles = new Map(); let espacio = 'objetos', disposed = false, pendiente = 0;
  const cuerpo = el('div', { class: 'ed-cuerpo' }); contenedor.append(el('div', { class: 'ed-tabs' }, el('button', { class: 'ed-tab', role: 'tab', 'aria-selected': 'true', type: 'button' }, 'Inspector')), cuerpo);
  const titulo = contenedor.querySelector('.ed-tab');

  // Campos persistentes (se reutilizan entre selecciones para no perder foco al teclear)
  const nombre = el('input', { class: 'ed-input', type: 'text', maxLength: 120, 'aria-label': 'Nombre' });
  const capaSel = el('select', { class: 'ed-input', 'aria-label': 'Capa' });
  const pos = vec3({ paso: .1, decimales: 3, titulo: 'Posición', alCambiar: v => aplicar({ position: v }) });
  const rot = vec3({ paso: 1, decimales: 1, titulo: 'Rotación', alCambiar: v => aplicar({ rotation: v.map(g => T.MathUtils.degToRad(g)) }) });
  const esc = vec3({ paso: .05, decimales: 3, titulo: 'Escala', alCambiar: v => { if (v.some(x => !x)) { estado('La escala no puede ser 0.'); return pintar(); } aplicar({ scale: v }); } });
  const datos = el('div', { class: 'ed-fila-botones' });
  const colores = el('div', { class: 'ed-contenido', style: 'padding:0;display:grid;gap:6px' });

  nombre.addEventListener('change', () => { if (!nombre.value.trim()) return pintar(); aplicar({ etiqueta: nombre.value.trim() }); });
  capaSel.addEventListener('change', () => capas.moverACapa(seleccion.ids, capaSel.value));

  function aplicar(data) {
    try {
      if (seleccion.cantidad > 1) {
        // Edición numérica de varios: se aplica el DESPLAZAMIENTO de la primaria a todos (posición); el resto solo a la primaria.
        const primaria = objetos.obtener(objetos.seleccion), antes = capturarObjeto(primaria);
        if (data.position) { const d = data.position.map((v, i) => v - antes.position[i]); editor.applyMany(seleccion.ids.map(id => { const r = objetos.obtener(id); return { id, data: { position: r.position.toArray().map((v, i) => v + d[i]) } }; })); return; }
      }
      const id = objetos.seleccion; if (!id) return;
      editor.applySelected(data);
      // Posición por teclado: también respeta suelo y colisión (se corrige a la posición válida más cercana).
      if (data.position && (gizmo.estado.colision || gizmo.estado.apoyo)) {
        const raiz = objetos.obtener(id), r = corregirPosicion(raiz, { ground, obstaculos: obstaculos(), ignorar: new Set(seleccion.ids), apoyar: gizmo.estado.apoyo, chocar: gizmo.estado.colision });
        if (r.delta.lengthSq() > 0) { editor.applySelected({ position: raiz.position.toArray() }); estado(r.choca.length ? `Ajustado: chocaba con «${objetos.entries.get(r.choca[0])?.etiqueta ?? r.choca[0]}».` : 'Ajustado para no hundirse en el suelo.'); }
      }
    } catch (error) { estado(error.message); }
    pintar();
  }

  function estructuraObjeto(raiz, id) {
    const e = objetos.entries.get(id), p = capas.propiedades(id), triangulos = contarTriangulos(raiz), caja = cajaDeRaiz(raiz, new T.Box3()), tam = caja.getSize(new T.Vector3());
    capaSel.replaceChildren(...capas.e.capas.map(c => new Option(c.nombre, c.id))); capaSel.value = capas.capaDe(id);
    const esAnadido = !!raiz.userData.cityImportId;
    const secciones = [
      seccion('Objeto', [
        campo('Nombre', nombre), campo('Capa', capaSel),
        el('div', { class: 'ed-fila-botones' }, el('span', { class: 'ed-chip' }, e.tipo), e.sector ? el('span', { class: 'ed-chip' }, e.sector) : null,
          p.bloqueado || capas.bloqueado(id) ? el('span', { class: 'ed-chip', 'data-tipo': 'aviso' }, 'Bloqueado') : null,
          raiz.userData.ocultoUsuario ? el('span', { class: 'ed-chip', 'data-tipo': 'aviso' }, 'Oculto') : null,
          el('span', { class: 'ed-chip' }, esAnadido ? 'Añadido' : 'Escenario original')),
      ], { clave: 'objeto', preferencias }),
      seccion('Transformación', [
        campo('Posición (m)', pos), campo('Rotación (°)', rot), campo('Escala', esc),
        el('div', { class: 'ed-fila-botones' }, ...['transformar.alSuelo', 'transformar.restaurar', 'vista.encuadrar'].map(idA => botonAccion(idA))),
      ], { clave: 'transformacion', preferencias }),
    ];
    if (esAnadido) secciones.push(seccion('Materiales y colores', [colores], { clave: 'colores', preferencias }));
    secciones.push(seccion('Colisión', [
      conmutador('Colisiona al caminar', { valor: p.colision !== false, titulo: 'Si se desactiva, el estudiante puede atravesar este objeto', alCambiar: v => capas.fijar([id], { colision: v ? undefined : false }, 'Colisión') }),
      el('div', { class: 'ed-etiqueta', style: 'color:var(--ed-texto-3)' }, `Caja: ${n1(tam.x)} × ${n1(tam.y)} × ${n1(tam.z)} m`),
    ], { clave: 'colision', preferencias, abierta: false }));
    secciones.push(seccion('Propiedades', [
      campo('ID', el('code', { style: 'font-family:var(--ed-mono);color:var(--ed-texto-2);overflow:hidden;text-overflow:ellipsis', title: id }, id)),
      campo('Triángulos', el('span', {}, triangulos.toLocaleString('es-ES'))),
    ], { clave: 'propiedades', preferencias, abierta: false }));
    return secciones;
  }
  const botonAccion = idA => { const a = acciones.obtener(idA); const b = boton({ icono: a?.icono, texto: a?.nombre, titulo: a?.ayuda || a?.nombre, onclick: () => acciones.ejecutar(idA, contexto()).then(pintar).catch(e => estado(e.message)) }); b.disabled = !acciones.habilitada(idA, contexto()); return b; };
  function contarTriangulos(raiz) { let t = 0; raiz.traverse(o => { if (o.isMesh && o.geometry) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count ?? 0) / 3; }); return Math.round(t); }

  function pintarColores(raiz, id) {
    colores.replaceChildren();
    const guardados = capas.propiedades(id).colores ?? {};
    const lista = materialesDe(raiz);
    if (!lista.length) { colores.append(vacio('Este objeto no tiene materiales con color.')); return; }
    for (const m of lista) {
      const input = el('input', { type: 'color', class: 'ed-input', value: guardados[m.clave] ?? m.original, style: 'padding:0;height:24px', 'aria-label': 'Color de ' + m.nombre });
      input.addEventListener('input', () => { m.material.color.set(input.value); m.material.needsUpdate = true; });
      input.addEventListener('change', () => {
        const nuevos = { ...(capas.propiedades(id).colores ?? {}), [m.clave]: input.value };
        if (input.value.toLowerCase() === m.original.toLowerCase()) delete nuevos[m.clave];
        capas.fijar([id], { colores: Object.keys(nuevos).length ? nuevos : undefined }, 'Cambiar color'); aplicarColores(raiz, nuevos);
      });
      colores.append(campo(m.nombre, input));
    }
  }

  function pintar() {
    if (disposed) return; pendiente = 0;
    if (espacio !== 'objetos') { mostrarPanelEspacio(); return; }
    cuerpo.replaceChildren(); titulo.replaceChildren(svg('caja', { tam: 14 }), 'Inspector');
    if (!seleccion.cantidad) { cuerpo.append(resumenEscena()); return; }
    const id = objetos.seleccion, raiz = objetos.obtener(id);
    if (!raiz) { cuerpo.append(vacio('El objeto seleccionado ya no está en el escenario.')); return; }
    if (seleccion.cantidad > 1) cuerpo.append(el('div', { class: 'ed-contenido', style: 'padding:8px 10px;border-bottom:1px solid var(--ed-borde)' }, el('b', {}, `${seleccion.cantidad} objetos seleccionados`), el('span', { style: 'color:var(--ed-texto-3)' }, 'Los cambios de posición se aplican a todos; el resto, solo al principal: ' + (objetos.entries.get(id)?.etiqueta ?? id))));
    for (const s of estructuraObjeto(raiz, id)) cuerpo.append(s);
    refrescarValores(raiz); pintarColores(raiz, id);
  }
  function refrescarValores(raiz) {
    nombre.value = raiz.userData.label ?? raiz.name; pos.poner(raiz.position.toArray());
    rot.poner([raiz.rotation.x, raiz.rotation.y, raiz.rotation.z].map(r => T.MathUtils.radToDeg(r)));
    esc.poner(raiz.scale.toArray());
  }
  function resumenEscena() {
    const anadidos = [...objetos.entries.keys()].filter(i => i.startsWith('import-')).length;
    const archivoDe = id => { const r = objetos.obtener(id); return (r?.userData.cityImportId && editor.state.imports.get(r.userData.cityImportId)?.filename) || null; };
    const r = agruparTipos(objetos.listar(), archivoDe);
    const huerfanos = encontrarHuerfanos({ overrides: [...editor.state.overrides.values()], pendientes: editor.state.pending, existe: id => objetos.entries.has(id) || existeId(id) });
    const avisoHuerfanos = huerfanos.length ? seccion('Cambios que no se pudieron aplicar', [
      el('div', { style: 'color:var(--ed-texto-2);line-height:1.5' }, `${huerfanos.length} objeto${huerfanos.length === 1 ? '' : 's'} editado${huerfanos.length === 1 ? '' : 's'} ya no existe${huerfanos.length === 1 ? '' : 'n'} en esta revisión del lugar. No se trasladan a otros objetos.`),
      el('div', { class: 'ed-fila-botones' }, ...huerfanos.slice(0, 6).map(h => el('span', { class: 'ed-chip', 'data-tipo': 'aviso' }, h.id.slice(0, 22)))),
      el('button', { type: 'button', class: 'ed-btn', onclick: () => { for (const h of huerfanos) { editor.state.pending.delete(h.id); editor.state.overrides.delete(h.id); } editor.state.dirty = true; programar(); } }, svg('papelera', { tam: 14 }), el('span', {}, 'Descartar estos cambios')),
    ], { clave: 'huerfanos', preferencias }) : null;
    return el('div', {}, avisoHuerfanos, seccion('Escenario', [
      el('div', { class: 'ed-fila-botones' }, el('span', { class: 'ed-chip', title: 'Los ejemplares repetidos del mismo modelo cuentan como un solo objeto' }, textoRecuento(r)), el('span', { class: 'ed-chip' }, `${anadidos} añadidos`), el('span', { class: 'ed-chip' }, `${capas.e.grupos.length} grupos`)),
      el('div', { style: 'color:var(--ed-texto-2);line-height:1.5' }, 'Haz clic en un objeto para seleccionarlo (Mayús suma). Arrástralo para deslizarlo por el suelo; con el botón derecho lo subes o bajas. Clic derecho sin arrastrar abre el menú.'),
    ], { clave: 'escena', preferencias }));
  }
  function mostrarPanelEspacio() {
    const p = paneles.get(espacio); cuerpo.replaceChildren(p ? p.nodo : vacio('Este espacio de trabajo todavía no tiene herramientas.'));
    titulo.replaceChildren(svg(p?.icono ?? 'ajustes', { tam: 14 }), p?.titulo ?? 'Propiedades'); p?.alMostrar?.();
  }
  const programar = () => { if (!pendiente && !disposed) pendiente = requestAnimationFrame(pintar); };
  let ultimaFirma = '';
  const sincronizarVivo = () => { // valores durante el arrastre del gizmo: sin reconstruir el panel
    if (disposed || espacio !== 'objetos' || !seleccion.cantidad) return;
    const raiz = objetos.obtener(objetos.seleccion); if (!raiz) return; refrescarValores(raiz);
    const eje = gizmo.estado.arrastrando ? (gizmo.estado.eje || '').toLowerCase()[0] : null;
    const modo = gizmo.estado.modo; pos.marcar(modo === 'translate' ? eje : null); rot.marcar(modo === 'rotate' ? eje : null); esc.marcar(modo === 'scale' ? eje : null);
  };
  const bajas = [seleccion.alCambiar(programar), capas.alCambiar(programar), editor.alCambiar(t => { if (t === 'restaurado' || t === 'refresco') programar(); if (t === 'objeto') sincronizarVivo(); }), gizmo.alCambiar(sincronizarVivo)];
  pintar();
  return {
    registrarEspacio(id, { nodo, titulo: t, icono: ic, alMostrar }) { paneles.set(id, { nodo, titulo: t, icono: ic, alMostrar }); if (espacio === id) pintar(); },
    elegirEspacio(id) { espacio = id; pintar(); }, refrescar: programar,
    dispose() { disposed = true; cancelAnimationFrame(pendiente); bajas.forEach(b => b()); contenedor.replaceChildren(); },
  };
}
