import * as T from './three.js';

// Captura/aplicación, historial e IndexedDB adaptados del EditorGLB del hotel.
export const CITY_EDITOR = { version: 1, maxBytes: 100 * 1024 * 1024, historyLimit: 50 };
const AXES = ['x', 'y', 'z'];
const ORDERS = new Set(['XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX']);

export function validarGLB(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20 || buffer.byteLength > CITY_EDITOR.maxBytes)
    throw new Error('GLB vacío, inválido o mayor de 100 MB.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength)
    throw new Error('Se necesita un GLB válido, versión 2.');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length % 4 || 20 + length > buffer.byteLength)
    throw new Error('Bloque JSON de GLB inválido.');
  let json;
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))); }
  catch { throw new Error('Metadatos JSON de GLB inválidos.'); }
  if (json.asset?.version !== '2.0') throw new Error('Se requiere glTF 2.0.');
  for (const asset of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (asset.uri && !asset.uri.startsWith('data:')) throw new Error('El GLB debe ser autocontenido; contiene recursos externos.');
  return json;
}

export function capturarObjeto(root) {
  return { id: root.userData.id, etiqueta: root.userData.label ?? root.name,
    sector: root.userData.sector ?? root.userData.area ?? '',
    position: root.position.toArray(), rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
    rotationOrder: root.rotation.order, scale: root.scale.toArray(),
    hidden: Boolean(root.userData.ocultoUsuario) };
}

export function validarObjeto(data) {
  if (!data || typeof data.id !== 'string' || !data.id || typeof data.etiqueta !== 'string' || !data.etiqueta.trim())
    throw new Error('Identidad y nombre obligatorios.');
  for (const key of ['position', 'rotation', 'scale'])
    if (!Array.isArray(data[key]) || data[key].length !== 3 || !data[key].every(Number.isFinite))
      throw new Error('Transformación inválida: ' + key);
  // Escalas negativas representan espejos del original y deben conservarse.
  if (data.scale.some(value => value === 0)) throw new Error('La escala no puede ser cero.');
  if (data.rotationOrder && !ORDERS.has(data.rotationOrder)) throw new Error('Orden de rotación inválido.');
  if (data.sector != null && typeof data.sector !== 'string') throw new Error('Sector inválido.');
  return data;
}

export function aplicarObjeto(root, data) {
  validarObjeto(data);
  if (root.userData.id && root.userData.id !== data.id) throw new Error('La identidad del objeto no se puede cambiar.');
  if (root.userData.editorVisibleBase === undefined) root.userData.editorVisibleBase = root.visible;
  root.position.fromArray(data.position);
  root.rotation.set(...data.rotation, data.rotationOrder ?? root.rotation.order);
  root.scale.fromArray(data.scale);
  root.userData.label = data.etiqueta;
  root.userData.sector = data.sector ?? '';
  root.userData.ocultoUsuario = Boolean(data.hidden);
  root.visible = root.userData.editorVisibleBase && !data.hidden;
  root.updateMatrixWorld(true);
  root.userData.instanceBinding?.sync();
  return root;
}

export class CiudadProjectStore {
  constructor(indexedDB = globalThis.indexedDB) { this.indexedDB = indexedDB; }
  async database() {
    if (!this.indexedDB) throw new Error('IndexedDB no disponible en este navegador.');
    return new Promise((resolve, reject) => {
      const req = this.indexedDB.open('spanstories.ciudades.editor', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async transfer(cityId, project) {
    const db = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', project === undefined ? 'readonly' : 'readwrite');
        const store = tx.objectStore('projects');
        const req = project === undefined ? store.get(cityId) : store.put(project, cityId);
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('No se pudo completar el guardado.'));
      });
    } finally { db.close(); }
  }
  load(cityId) { return this.transfer(cityId); }
  save(cityId, project) { return this.transfer(cityId, project); }
}

// Historial por operación: editar una farola no copia el estado de toda la ciudad.
export class EstadoEditorCiudad {
  constructor({ scene, objetos, cityId, changed = () => {} }) {
    this.scene = scene; this.objetos = objetos; this.cityId = cityId; this.changed = changed;
    this.overrides = new Map(); this.pending = new Map(); this.imports = new Map(); this.baseline = new Map();
    this.undoStack = []; this.redoStack = []; this.dirty = false;
  }
  remember(command) {
    this.undoStack.push(command);
    if (this.undoStack.length > CITY_EDITOR.historyLimit) this.undoStack.shift();
    this.redoStack.length = 0; this.dirty = true;
  }
  apply(id, data, history = true) {
    const root = this.objetos.obtener(id);
    if (!root) throw new Error('Objeto desconocido: ' + id);
    const next = { ...data, id }; validarObjeto(next);
    const before = capturarObjeto(root);
    if (!root.userData.cityImportId && !this.baseline.has(id)) this.baseline.set(id, structuredClone(before));
    aplicarObjeto(root, next);
    const entry = this.objetos.entries.get(id);
    entry.etiqueta = next.etiqueta; entry.sector = next.sector ?? '';
    if (!root.userData.cityImportId) this.overrides.set(id, capturarObjeto(root));
    if (history) this.remember({ kind: 'edit', id, before, after: capturarObjeto(root) });
    this.changed(root);
    return root;
  }
  setPresent(record, present) {
    if (record.present === present) return;
    if (present) {
      for (const node of record.nodes) this.objetos.registrar(node.root, node.meta);
      this.scene.add(record.root);
    } else {
      for (const node of record.nodes) this.objetos.retirar(node.meta.id);
      record.root.removeFromParent();
    }
    record.present = present;
    this.changed(record.root);
  }
  addImport(record, history = true) {
    if (this.imports.has(record.id)) throw new Error('GLB importado duplicado.');
    this.imports.set(record.id, record); record.present = false;
    this.setPresent(record, true);
    if (history) this.remember({ kind: 'import', id: record.id });
    return record;
  }
  moveHistory(from, to, reverse) {
    const command = from.at(-1); if (!command) return false;
    if (command.kind === 'edit') this.apply(command.id, reverse ? command.before : command.after, false);
    else this.setPresent(this.imports.get(command.id), !reverse);
    from.pop(); to.push(command); this.dirty = true;
    return true;
  }
  undo() { return this.moveHistory(this.undoStack, this.redoStack, true); }
  redo() { return this.moveHistory(this.redoStack, this.undoStack, false); }
  applyPending() {
    for (const [id, data] of this.pending) if (this.objetos.obtener(id)) {
      this.apply(id, data, false); this.pending.delete(id);
    }
  }
  restoreOverrides(values) {
    for (const value of values) validarObjeto(value);
    for (const value of values) {
      if (this.objetos.obtener(value.id)) this.apply(value.id, value, false);
      else this.pending.set(value.id, value);
    }
  }
  resetOverrides() {
    for (const [id, value] of this.baseline) if (this.objetos.obtener(id)) this.apply(id, value, false);
    this.overrides.clear(); this.pending.clear();
  }
  snapshot() {
    const overrides = new Map([...this.pending, ...this.overrides]);
    return { version: CITY_EDITOR.version, cityId: this.cityId,
      overrides: [...overrides.values()].map(value => structuredClone(value)),
      imports: [...this.imports.values()].filter(record => record.present).map(record => ({
        id: record.id, filename: record.filename, blob: record.blob,
        nodes: record.nodes.map(node => ({ key: node.key, meta: { ...node.meta, etiqueta: node.root.userData.label,
          sector: node.root.userData.sector }, state: capturarObjeto(node.root) }))
      })) };
  }
}

function validateProject(project, cityId) {
  if (!project || project.version !== CITY_EDITOR.version || project.cityId !== cityId ||
      !Array.isArray(project.overrides) || !Array.isArray(project.imports))
    throw new Error('Proyecto incompatible o perteneciente a otra ciudad.');
  const ids = new Set();
  for (const value of project.overrides) { validarObjeto(value); if (ids.has(value.id)) throw new Error('ID duplicado.'); ids.add(value.id); }
  for (const record of project.imports) {
    if (typeof record.id !== 'string' || !record.id || !Array.isArray(record.nodes) || !record.nodes.length)
      throw new Error('Objeto importado incompleto.');
    for (const node of record.nodes) {
      validarObjeto(node.state);
      if (node.state.id !== node.meta?.id || typeof node.key !== 'string' || ids.has(node.meta.id)) throw new Error('Identidad importada inválida.');
      ids.add(node.meta.id);
    }
  }
  return project;
}

export async function serializarProyecto(project) {
  const imports = [];
  for (const record of project.imports) {
    const bytes = new Uint8Array(await record.blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const { blob, ...rest } = record;
    imports.push({ ...rest, glbBase64: btoa(binary) });
  }
  return JSON.stringify({ ...project, imports });
}

export function deserializarProyecto(text, cityId) {
  const project = validateProject(JSON.parse(text), cityId);
  project.imports = project.imports.map(record => {
    if (typeof record.glbBase64 !== 'string' || record.glbBase64.length > Math.ceil(CITY_EDITOR.maxBytes / 3) * 4)
      throw new Error('GLB portable ausente o mayor de 100 MB.');
    const binary = atob(record.glbBase64), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    validarGLB(bytes.buffer);
    const { glbBase64, ...rest } = record;
    return { ...rest, blob: new Blob([bytes], { type: 'model/gltf-binary' }) };
  });
  return project;
}

export function montarEditorCiudad({ scene, objetos, host, cityId, loader, adaptar = root => root,
  optimizar = async () => null,
  liberar = () => {},
  focus = () => {}, changed = () => {}, target = () => new T.Vector3(), status = () => {},
  store = new CiudadProjectStore() }) {
  if (!host || !loader?.parseAsync) throw new Error('Editor requiere contenedor y GLTFLoader.');
  host.innerHTML = `<h4>Editor de ciudad</h4>
    <label>Sector <select id="city-edit-sector-filter"><option value="">Todos</option></select></label>
    <label>Buscar <input id="city-edit-search" placeholder="Nombre o ID"></label>
    <label>Objeto <select id="city-edit-objects" aria-label="Objeto de ciudad"></select></label>
    <fieldset id="city-edit-properties" disabled><legend>Objeto seleccionado</legend>
      <label>Nombre <input id="city-edit-name" maxlength="120"></label>
      <label>Sector <input id="city-edit-sector" maxlength="120"></label>
      ${[['p','Posición (m)'],['r','Rotación (°)'],['s','Escala']].map(([prefix,label]) => `<div class="edit-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px">${AXES.map(a => `<label>${label} ${a.toUpperCase()}<input id="city-edit-${prefix}${a}" type="number" step="${prefix === 'r' ? '1' : '0.1'}" style="width:100%;box-sizing:border-box"></label>`).join('')}</div>`).join('')}
      <button id="city-edit-apply">Aplicar cambios</button><button id="city-edit-focus">Encuadrar</button>
    </fieldset>
    <button id="city-edit-import">Añadir GLB</button><input id="city-edit-files" type="file" accept=".glb" multiple hidden>
    <div><button id="city-edit-undo" disabled>Deshacer</button><button id="city-edit-redo" disabled>Rehacer</button><button id="city-edit-save">Guardar edición</button></div>
    <div><button id="city-edit-export">Exportar proyecto</button><button id="city-edit-project-open">Abrir proyecto</button><input id="city-edit-project-file" type="file" accept=".json" hidden></div>
    <p id="city-edit-status" role="status" aria-live="polite">Selecciona un objeto. Los cambios se guardan en este navegador.</p>`;
  const $ = id => host.querySelector('#city-edit-' + id);
  const state = new EstadoEditorCiudad({ scene, objetos, cityId, changed });
  let active = true, busy = false, restoreFailed = false, disposed = false;
  let previousOnChange = objetos.onChange;
  function message(text) { if (disposed) return; $('status').textContent = text; status(text); }
  function assertEditable() { if (!active || busy || disposed) throw new Error('Activa Editor y espera a que termine la carga.'); }
  function selection() {
    const root = objetos.obtener(objetos.seleccion);
    $('objects').value = root?.userData.id ?? '';
    $('properties').disabled = !root || !active || busy;
    if (root) {
      $('name').value = root.userData.label ?? root.name; $('sector').value = root.userData.sector ?? '';
      for (const axis of AXES) {
        // No redondear el estado: aplicar otro campo debe conservar estos valores.
        $('p' + axis).value = root.position[axis];
        $('r' + axis).value = T.MathUtils.radToDeg(root.rotation[axis]);
        $('s' + axis).value = root.scale[axis];
      }
    }
    $('undo').disabled = !active || busy || !state.undoStack.length;
    $('redo').disabled = !active || busy || !state.redoStack.length;
    for (const id of ['apply', 'import', 'save', 'project-open', 'export']) $(id).disabled = !active || busy;
  }
  function refresh() {
    if (disposed) return;
    state.applyPending();
    const sector = $('sector-filter').value, query = $('search').value.toLocaleLowerCase();
    const entries = objetos.listar();
    const sectors = [...new Set(entries.map(entry => entry.sector).filter(Boolean))].sort();
    $('sector-filter').replaceChildren(new Option('Todos', ''));
    for (const value of sectors) $('sector-filter').add(new Option(value, value));
    $('sector-filter').value = sectors.includes(sector) ? sector : '';
    $('objects').replaceChildren(new Option('Sin selección', ''));
    for (const entry of entries) {
      if (entry.id !== objetos.seleccion && ((sector && entry.sector !== sector) ||
          (query && !(entry.etiqueta + ' ' + entry.id).toLocaleLowerCase().includes(query)))) continue;
      $('objects').add(new Option(entry.etiqueta + (entry.sector ? ' · ' + entry.sector : ''), entry.id));
    }
    selection();
  }
  const onChange = entry => { previousOnChange?.(entry); selection(); };
  objetos.onChange = onChange;

  async function prepare(blob, filename, id, storedNodes) {
    if (!blob?.arrayBuffer || blob.size > CITY_EDITOR.maxBytes) throw new Error('GLB ausente o mayor de 100 MB.');
    const buffer = await blob.arrayBuffer(); validarGLB(buffer);
    const gltf = await loader.parseAsync(buffer, '');
    if (gltf.animations?.length) throw new Error('Se admiten GLB estáticos; este archivo contiene animaciones.');
    // Un Group adicional permite mover el archivo entero sin modificar su raíz GLTF.
    const root = new T.Group(); root.name = filename.replace(/\.glb$/i, ''); root.add(gltf.scene);
    root.userData.cityImportId = id;
    try {
    await adaptar(root, gltf);
    const saved = new Map(storedNodes?.map(node => [node.key, node]));
    const nodes = [];
    function collect(node, key) {
      if (node.userData.ignorarSeleccion) return;
      // Las claves solo reubican nodos del Blob inmutable. Su identidad es un UUID.
      const stored = saved?.get(key);
      const nodeId = stored?.meta.id ?? (key === '' ? id : id + ':node-' + crypto.randomUUID());
      const etiqueta = stored?.state.etiqueta ?? node.name ?? root.name;
      const meta = stored?.meta ?? { id: nodeId, tipo: key === '' ? 'glb-importado' : 'glb-nodo',
        etiqueta: etiqueta || 'Nodo GLB', sector: objetos.obtener(objetos.seleccion)?.userData.sector ?? '' };
      node.userData.cityImportId = id;
      node.userData.id = nodeId; node.userData.label = meta.etiqueta; node.userData.sector = meta.sector ?? '';
      if (stored) aplicarObjeto(node, stored.state);
      nodes.push({ key, root: node, meta });
      node.children.forEach((child, index) => collect(child, key + '/' + index));
    }
    collect(root, '');
    if (storedNodes && (nodes.length !== storedNodes.length || [...saved.keys()].some(key => !nodes.some(node => node.key === key))))
      throw new Error('La jerarquía importada no coincide con el proyecto guardado.');
    if (!storedNodes) root.position.copy(typeof target === 'function' ? target() : target);
    const optimization=await optimizar(root);
    return { id, root, nodes, blob, filename, optimization, present: false };
    } catch(error) {liberar(root);throw error;}
  }

  async function importFiles(files) {
    assertEditable(); busy = true; selection();
    const results = [];
    try {
      for (const file of files) {
        try {
          if (!/\.glb$/i.test(file.name)) throw new Error('Selecciona un archivo .glb.');
          message('Cargando ' + file.name + '…');
          const record = await prepare(file, file.name, 'import-' + crypto.randomUUID());
          state.addImport(record); objetos.seleccionar(record.id); results.push(record.id);
          message(file.name + ' añadido · cambios sin guardar.');
        } catch (error) { message(file.name + ': ' + error.message); }
      }
    } finally { busy = false; refresh(); }
    return results;
  }

  function applySelected(data) {
    assertEditable();
    const id = objetos.seleccion;
    if (!id) throw new Error('Selecciona un objeto.');
    state.apply(id, { ...capturarObjeto(objetos.obtener(id)), ...data, id });
    refresh(); message('Cambios aplicados · sin guardar.');
  }
  async function save() {
    assertEditable();
    if (restoreFailed) throw new Error('Guardado bloqueado para conservar el proyecto anterior que no pudo restaurarse.');
    busy = true; selection();
    try { await store.save(cityId, state.snapshot()); state.dirty = false; message('Edición guardada, incluidos los GLB importados.'); }
    finally { busy = false; selection(); }
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
    } catch(error) {for(const record of prepared){record.optimization?.dispose();liberar(record.root);}throw error;}
    const replaced=[...state.imports.values()];
    for (const record of replaced) {state.setPresent(record, false);record.optimization?.dispose();}
    state.imports.clear(); state.resetOverrides();
    state.restoreOverrides(project.overrides);
    for (const record of prepared) state.addImport(record, false);
    for (const record of replaced)liberar(record.root);
    state.undoStack.length = state.redoStack.length = 0;
    state.dirty = false;
    message('Edición restaurada.' + (state.pending.size ? ' ' + state.pending.size + ' objetos esperan la carga de su sector.' : ''));
  }
  async function restore() {
    busy = true; selection();
    try { const project = await store.load(cityId); if (project) await restoreProject(project); }
    catch (error) { restoreFailed = true; message('No se pudo restaurar: ' + error.message); throw error; }
    finally { busy = false; refresh(); }
  }
  async function exportProject() { return serializarProyecto(state.snapshot()); }
  async function importProject(text) {
    assertEditable(); busy = true; selection();
    try { await restoreProject(deserializarProyecto(text, cityId)); state.dirty = true; restoreFailed = false;
      message('Proyecto abierto · guarda para conservarlo en este navegador.'); }
    finally { busy = false; refresh(); }
  }
  const safe = fn => async () => { try { await fn(); } catch (error) { message(error.message); } };
  $('objects').onchange = event => objetos.seleccionar(event.target.value || null);
  $('sector-filter').onchange = refresh; $('search').oninput = refresh;
  $('apply').onclick = safe(() => {
    const value = id => { const input = $(id); if (!input.value.trim() || !Number.isFinite(input.valueAsNumber)) throw new Error('Introduce valores numéricos válidos.'); return input.valueAsNumber; };
    applySelected({ etiqueta: $('name').value.trim(), sector: $('sector').value.trim(),
      position: AXES.map(a => value('p' + a)), rotation: AXES.map(a => T.MathUtils.degToRad(value('r' + a))), scale: AXES.map(a => value('s' + a)) });
  });
  $('focus').onclick = safe(() => { if (objetos.seleccion) focus(objetos.obtener(objetos.seleccion)); });
  $('import').onclick = safe(() => { assertEditable(); $('files').click(); });
  $('files').onchange = safe(async () => { await importFiles([...$('files').files]); $('files').value = ''; });
  function undo() { assertEditable(); const result = state.undo(); refresh(); if (result) message('Cambio deshecho · sin guardar.'); return result; }
  function redo() { assertEditable(); const result = state.redo(); refresh(); if (result) message('Cambio rehecho · sin guardar.'); return result; }
  $('undo').onclick = safe(undo); $('redo').onclick = safe(redo); $('save').onclick = safe(save);
  $('export').onclick = safe(async () => {
    const text = await exportProject(), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = cityId + '.spanstories.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message('Proyecto portable exportado, incluidos los GLB importados.');
  });
  $('project-open').onclick = safe(() => { assertEditable(); $('project-file').click(); });
  $('project-file').onchange = safe(async () => {
    const file = $('project-file').files[0]; if (file) await importProject(await file.text()); $('project-file').value = '';
  });
  function unload(event) { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } }
  globalThis.addEventListener?.('beforeunload', unload);
  refresh();
  return { refresh, restore, save, importFiles, applySelected, undo, redo, exportProject, importProject, state,
    dirty: () => state.dirty,
    enabled(value) { active = Boolean(value); selection(); },
    dispose() { disposed = true; globalThis.removeEventListener?.('beforeunload', unload);
      for(const record of state.imports.values())record.optimization?.dispose();
      if (objetos.onChange === onChange) objetos.onChange = previousOnChange; host.replaceChildren(); }
  };
}
