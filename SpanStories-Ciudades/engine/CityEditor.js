import * as T from './three.js';
import {CITY_EDITOR,EstadoEditorCiudad,CiudadProjectStore,capturarObjeto,serializarProyecto,deserializarProyecto,validateProject,crearPreparador} from './CityProject.js';
import {ProyectoDisco} from './CityProjectDisk.js';
export {CITY_EDITOR,EstadoEditorCiudad,CiudadProjectStore,capturarObjeto,aplicarObjeto,validarObjeto,validarGLB,serializarProyecto,deserializarProyecto} from './CityProject.js';

/**
 * Fachada del editor: estado, historial, guardado en disco, importación y recuperación del proyecto.
 * NO contiene interfaz: los paneles, menús y herramientas viven en /editor (ver editor/EDITOR.md) y hablan con esta API.
 * La API pública (main.js y el Estudio) no cambia: refresh, restore, save, importFiles, applySelected, undo, redo,
 * exportProject, importProject, state, revision, dirty, enabled, dispose.
 */
export function montarEditorCiudad({ scene, objetos, cityId, loader, adaptar = root => root,
  optimizar = async () => null,
  liberar = () => {},
  focus = () => {}, changed = () => {}, target = () => new T.Vector3(), status = () => {},
  store = new CiudadProjectStore(), preguntarPendiente = null }) {
  if (!loader?.parseAsync) throw new Error('Editor requiere GLTFLoader.');
  const oyentes = new Set(), avisar = tipo => { for (const fn of oyentes) { try { fn(tipo); } catch (error) { console.error(error); } } };
  const state = new EstadoEditorCiudad({ scene, objetos, cityId, changed: root => { changed(root); avisar('objeto'); } });
  const disk = new ProyectoDisco(cityId);
  let active = true, busy = false, restoreFailed = false, disposed = false, recuperable = false, almacenamiento = 'Comprobando proyecto en disco…';
  const previousOnChange = objetos.onChange;
  function message(text) { if (disposed) return; status(text); avisar('mensaje:' + text); }
  function setStorage(text) { almacenamiento = text; avisar('almacenamiento'); }
  function assertEditable() { if (!active || busy || disposed) throw new Error('Activa Editor y espera a que termine la carga.'); }
  function ocupado(valor) { busy = valor; avisar('ocupado'); }
  const onChange = entry => { previousOnChange?.(entry); avisar('seleccion'); };
  objetos.onChange = onChange;

  // El diálogo de «cambios sin guardar» lo puede sustituir la interfaz (preguntarPendiente); por defecto, uno propio.
  function askPending() {
    if (preguntarPendiente) return preguntarPendiente();
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', 'Trabajo sin guardar');
      dialog.innerHTML = '<p>Hay cambios sin guardar. ¿Qué quieres hacer antes de abrir el proyecto?</p><button data-choice="save">Guardar y abrir</button><button data-choice="cancel">Cancelar</button><button data-choice="continue">Continuar sin guardar</button>';
      dialog.addEventListener('cancel', e => { e.preventDefault(); finish('cancel'); });
      function finish(choice) { dialog.close(); dialog.remove(); resolve(choice); }
      dialog.querySelectorAll('button').forEach(button => button.onclick = () => finish(button.dataset.choice));
      document.body.append(dialog); dialog.showModal();
    });
  }

  function refresh() { if (disposed) return; state.applyPending(); avisar('refresco'); }
  const prepare = crearPreparador({ loader, adaptar, optimizar, liberar, objetos, target });

  // -- Objetos añadidos -------------------------------------------------------------------------------------------
  /** Añade GLB desde archivos. `position` = [x,y,z] del punto de suelta. Devuelve los ids creados. */
  async function importFiles(files, position = null) {
    assertEditable(); ocupado(true);
    const results = [];
    try {
      for (const file of files) {
        try {
          if (!/\.glb$/i.test(file.name)) throw new Error('Selecciona un archivo .glb.');
          message('Cargando ' + file.name + '…');
          const record = await prepare(file, file.name, 'import-' + crypto.randomUUID());
          if (position) record.root.position.fromArray(position);
          state.addImport(record); objetos.seleccionar(record.id); results.push(record.id);
          message(file.name + ' añadido · cambios sin guardar.');
        } catch (error) { message(file.name + ': ' + error.message); }
      }
    } finally { ocupado(false); refresh(); }
    return results;
  }

  /** Coloca copias de un GLB ya cargado (biblioteca, copiar/pegar, duplicar). destinos = [{posicion, rotacion?, escala?, etiqueta?}] */
  async function colocarCopias(blob, filename, destinos, nombre = 'Añadir objetos') {
    assertEditable(); ocupado(true);
    const records = [];
    try {
      for (const d of destinos) {
        const record = await prepare(blob, filename, 'import-' + crypto.randomUUID());
        record.root.position.fromArray(d.posicion);
        if (d.rotacion) record.root.rotation.set(...d.rotacion);
        if (d.escala) record.root.scale.fromArray(d.escala);
        if (d.etiqueta) { record.root.userData.label = d.etiqueta; record.nodes[0].meta.etiqueta = d.etiqueta; }
        records.push(record);
      }
    } catch (error) { for (const r of records) { r.optimization?.dispose(); liberar(r.root); } ocupado(false); throw error; }
    try {
      for (const r of records) state.addImport(r, false);
      state.registrarComando({ nombre, undo: () => records.forEach(r => state.setPresent(r, false)), redo: () => records.forEach(r => state.setPresent(r, true)) });
      if (records.length) objetos.seleccionar(records.at(-1).id);
    } finally { ocupado(false); refresh(); }
    message(records.length + (records.length === 1 ? ' objeto añadido' : ' objetos añadidos') + ' · cambios sin guardar.');
    return records.map(r => r.id);
  }

  /** Duplica objetos añadidos (los del escenario original no se duplican: se mueven, ocultan o restauran). */
  async function duplicar(ids, desplazamiento = [.75, 0, .75]) {
    const fuentes = ids.map(id => objetos.obtener(id)).filter(r => r?.userData.cityImportId && state.imports.has(r.userData.cityImportId));
    if (!fuentes.length) throw new Error('Solo se pueden duplicar objetos añadidos al escenario.');
    const creados = [];
    for (const r of fuentes) {
      const record = state.imports.get(r.userData.cityImportId);
      const [id] = await colocarCopias(record.blob, record.filename, [{ posicion: r.position.toArray().map((v, i) => v + desplazamiento[i]), rotacion: [r.rotation.x, r.rotation.y, r.rotation.z], escala: r.scale.toArray(), etiqueta: r.userData.label }], 'Duplicar');
      creados.push(id);
    }
    return creados;
  }

  /** Elimina objetos: los añadidos desaparecen; los originales se ocultan (reversible). Una sola entrada de historial. */
  function eliminar(ids) {
    assertEditable();
    state.transaccion('Eliminar', () => {
      const ocultar = [], quitar = new Set();
      for (const id of ids) {
        const raiz = objetos.obtener(id); if (!raiz) continue;
        if (raiz.userData.cityImportId && state.imports.has(raiz.userData.cityImportId)) quitar.add(raiz.userData.cityImportId); else ocultar.push({ id, data: { hidden: true } });
      }
      if (ocultar.length) state.applyMany(ocultar);
      for (const importId of quitar) state.quitarImport(importId);
    });
    refresh(); message('Eliminado · Ctrl+Z para recuperarlo.');
  }

  // -- Edición ----------------------------------------------------------------------------------------------------
  function applySelected(data) {
    assertEditable();
    const id = objetos.seleccion;
    if (!id) throw new Error('Selecciona un objeto.');
    state.apply(id, { ...capturarObjeto(objetos.obtener(id)), ...data, id });
    refresh(); message('Cambios aplicados · sin guardar.');
  }
  /** Mismo cambio de transformación para varios objetos: una sola entrada de historial. */
  function applyMany(items) { assertEditable(); const r = state.applyMany(items); refresh(); return r; }

  // -- Guardado y recuperación --------------------------------------------------------------------------------------
  async function save() {
    assertEditable();
    if (restoreFailed) throw new Error('Guardado bloqueado para conservar el proyecto anterior que no pudo restaurarse.');
    ocupado(true);
    try {
      const project = state.snapshot(), result = await disk.save(cityId, project);
      state.dirty = false; setStorage('Disco · revisión ' + result.revision.slice(0, 12) + ' · ' + new Date(result.savedAt).toLocaleString() + ' · ' + result.directory);
      message('Edición guardada en disco, incluidos los GLB importados.');
      try { await store.save(cityId, project); } catch (error) { message('Guardado en disco correcto; caché del navegador no disponible: ' + error.message); }
    } finally { ocupado(false); }
  }
  async function restoreProject(project) {
    validateProject(project, cityId);
    // Preparar todo antes de alterar la escena evita restauraciones parciales por GLB corruptos.
    const prepared = [];
    try {
      for (const record of project.imports) prepared.push(await prepare(record.blob, record.filename, record.id, record.nodes));
      for (const record of prepared) for (const node of record.nodes)
        if (objetos.entries.has(node.meta.id) && !objetos.obtener(node.meta.id).userData.cityImportId)
          throw new Error('ID importado coincide con un objeto original.');
    } catch (error) { for (const record of prepared) { record.optimization?.dispose(); liberar(record.root); } throw error; }
    const replaced = [...state.imports.values()];
    for (const record of replaced) { state.setPresent(record, false); record.optimization?.dispose(); }
    state.imports.clear(); state.resetOverrides();
    state.restoreOverrides(project.overrides);
    for (const record of prepared) state.addImport(record, false);
    for (const record of replaced) liberar(record.root);
    state.escenario = structuredClone(project.escenario);
    state.undoStack.length = state.redoStack.length = 0;
    state.dirty = false;
    avisar('restaurado');
    message('Edición restaurada.' + (state.pending.size ? ' ' + state.pending.size + ' objetos esperan la carga de su sector.' : ''));
  }
  async function restore() {
    ocupado(true);
    try {
      let project = await disk.load(cityId);
      if (project) { await restoreProject(project); setStorage('Disco · revisión ' + disk.revision.slice(0, 12) + ' · ' + new Date(disk.savedAt).toLocaleString()); }
      else {
        project = await store.load(cityId);
        if (project) { project = deserializarProyecto(await serializarProyecto(project.version ? project : { ...project, version: 1 }), cityId); await restoreProject(project); state.dirty = true; message('Edición recuperada del navegador. Pulsa Guardar edición para llevarla a disco.'); }
        else setStorage('Escenario base · todavía sin edición guardada en disco');
      }
      recuperable = !!(await disk.load(cityId, 'recovery')); avisar('recuperable');
    } catch (error) { restoreFailed = true; message('No se pudo restaurar: ' + error.message); throw error; }
    finally { ocupado(false); refresh(); }
  }
  async function exportProject() { return serializarProyecto(state.snapshot()); }
  async function importProject(text) {
    assertEditable();
    const project = deserializarProyecto(text, cityId);
    if (state.dirty) {
      ocupado(true); let choice;
      try { choice = await askPending(); } finally { ocupado(false); }
      if (choice === 'cancel') return false;
      if (choice === 'save') await save();
    }
    ocupado(true);
    try {
      await disk.save(cityId, state.snapshot(), true); recuperable = true; avisar('recuperable');
      await restoreProject(project); state.dirty = true; restoreFailed = false;
      message('Proyecto abierto · sin guardar en disco. El estado anterior está en Recuperar proyecto anterior.');
      return true;
    } finally { ocupado(false); refresh(); }
  }
  async function recuperarAnterior() {
    const project = await disk.load(cityId, 'recovery');
    if (!project) throw new Error('No hay recuperación anterior.');
    return importProject(await serializarProyecto(project));
  }
  function undo() { assertEditable(); const result = state.undo(); refresh(); if (result) message('Cambio deshecho · sin guardar.'); return result; }
  function redo() { assertEditable(); const result = state.redo(); refresh(); if (result) message('Cambio rehecho · sin guardar.'); return result; }
  function unload(event) { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } }
  globalThis.addEventListener?.('beforeunload', unload);
  refresh();
  return { refresh, restore, save, importFiles, colocarCopias, duplicar, eliminar, applySelected, applyMany, undo, redo, exportProject, importProject, recuperarAnterior, state,
    focus, cityId,
    get revision() { return disk.revision; },
    get savedAt() { return disk.savedAt; },
    get almacenamiento() { return almacenamiento; },
    get ocupado() { return busy; },
    get activo() { return active; },
    get recuperable() { return recuperable; },
    dirty: () => state.dirty,
    /** La interfaz se suscribe aquí: recibe 'objeto' | 'seleccion' | 'refresco' | 'restaurado' | 'ocupado' | 'almacenamiento' | 'mensaje:…' */
    alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    enabled(value) { active = Boolean(value); avisar('activo'); },
    dispose() {
      disposed = true; globalThis.removeEventListener?.('beforeunload', unload);
      for (const record of state.imports.values()) record.optimization?.dispose();
      if (objetos.onChange === onChange) objetos.onChange = previousOnChange; oyentes.clear();
    },
  };
}
