import * as T from './three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { adaptarArticuloCatalogo } from './ArticuloCatalogo.js';
import { DIMENSIONS } from './dimensions.js';

export const EDITOR = { version: 1, maxBytes: 100 * 1024 * 1024, historyLimit: 50, duplicateOffset: 1 };

// Solo GLB autocontenido: no carga recursos externos ni altera el archivo fuente.
export function validarGLB(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20 || buffer.byteLength > EDITOR.maxBytes)
    throw new Error('GLB vacío, inválido o mayor de 100 MB.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength)
    throw new Error('Se necesita un archivo GLB válido, versión 2.');
}

export function capturarObjeto(root) {
  return { id: root.userData.id, etiqueta: root.userData.label, area: root.userData.area,
    position: root.position.toArray(), rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
    scale: root.scale.toArray(), hidden: Boolean(root.userData.ocultoUsuario) };
}

export function aplicarObjeto(root, data) {
  for (const key of ['position', 'rotation', 'scale']) {
    if (!Array.isArray(data[key]) || data[key].length !== 3 || !data[key].every(Number.isFinite)) throw new Error('Transformación inválida.');
  }
  if (data.scale.some(n => n <= 0)) throw new Error('La escala debe ser mayor que cero.');
  root.position.fromArray(data.position); root.rotation.set(...data.rotation); root.scale.fromArray(data.scale);
  root.userData.label = data.etiqueta; root.userData.area = data.area; root.userData.ocultoUsuario = Boolean(data.hidden);
  root.updateMatrixWorld(true);
}

async function database() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('spanstories.hotel.editor', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('projects');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function persist(value) {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('projects', value ? 'readwrite' : 'readonly'), store = tx.objectStore('projects');
    const req = value ? store.put(value, 'hotel') : store.get('hotel');
    tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

export function montarEditorGLB({ scene, objetos, viewport, camera, target, area, ocupado, esPrimeraPersona, refresh, wake, mensaje, onEnable, onFocus }) {
  const host = document.querySelector('#editor'), toggle = document.querySelector('#edit-mode');
  host.innerHTML = `<h4>Edición del mundo</h4>
    <p>Importa un objeto GLB o arrástralo a la escena. Cada archivo es una unidad seleccionable. Los objetos originales están protegidos.</p>
    <button id="glb-import">Introducir GLB</button><input id="glb-file" type="file" accept=".glb" multiple hidden>
    <p id="editor-status" role="status" aria-live="polite">GLB estáticos autocontenidos · máximo 100 MB por archivo.</p>
    <label>Objetos importados <select id="edit-objects" aria-label="Objetos importados"></select></label>
    <fieldset id="edit-properties" disabled><legend>Objeto importado seleccionado</legend>
    <label>Nombre <input id="edit-name" maxlength="120"></label>
    <div class="edit-grid">${['x', 'y', 'z'].map(a => `<label>Posición ${a.toUpperCase()} (m)<input id="edit-p${a}" type="number" step="0.1"></label>`).join('')}</div>
    <div class="edit-grid">${['x', 'y', 'z'].map(a => `<label>Giro ${a.toUpperCase()} (°)<input id="edit-r${a}" type="number" step="5"></label>`).join('')}</div>
    <label>Escala uniforme <input id="edit-scale" type="number" min="0.001" step="0.1"></label>
    <label><input id="edit-hidden" type="checkbox"> Ocultar</label>
    <div class="edit-actions"><button id="edit-apply">Aplicar cambios</button><button id="edit-focus">Encuadrar</button><button id="edit-duplicate">Duplicar</button><button id="edit-delete">Eliminar</button></div>
    </fieldset><div class="edit-actions"><button id="edit-undo" disabled>Deshacer</button><button id="edit-redo" disabled>Rehacer</button><button id="edit-save">Guardar edición</button></div>
    <p>El guardado incluye los GLB y sus posiciones en este navegador. Pulsa Guardar edición después de cambiar; no modifica el hotel original.</p>`;
  const $ = id => host.querySelector('#' + id), records = new Map(), undo = [], redo = [];
  let enabled = false, busy = false, changed = false, restoreFailed = false;
  const selected = () => records.get(objetos.seleccion);
  const status = text => { $('editor-status').textContent = text; };
  const snapshot = () => [...records.values()].filter(r => r.present).map(r => capturarObjeto(r.root));
  function check() { if (!enabled || busy || ocupado()) throw new Error('Espera a que termine la carga o el recorrido y activa Modo edición.'); }
  function mark() { undo.push(snapshot()); if (undo.length > EDITOR.historyLimit) undo.shift(); redo.length = 0; changed = true; }
  function zona() {
    for (const r of records.values()) r.root.visible = r.present && r.root.userData.area === area() && !r.root.userData.ocultoUsuario;
    seleccion(); wake();
  }
  function seleccion() {
    const r = selected(), root = r?.present ? r.root : null;
    $('edit-properties').disabled = !root || busy || ocupado();
    $('edit-objects').replaceChildren(new Option('Seleccionar importado…', ''));
    for (const record of records.values()) if (record.present && record.root.userData.area === area())
      $('edit-objects').add(new Option(record.root.userData.label, record.root.userData.id));
    $('edit-objects').value = root?.userData.id || '';
    if (root) {
      $('edit-name').value = root.userData.label;
      for (const a of ['x', 'y', 'z']) { $('edit-p' + a).value = +root.position[a].toFixed(4); $('edit-r' + a).value = +T.MathUtils.radToDeg(root.rotation[a]).toFixed(3); }
      $('edit-scale').value = +root.scale.x.toFixed(4); $('edit-hidden').checked = Boolean(root.userData.ocultoUsuario);
    }
    $('edit-undo').disabled = !undo.length || busy; $('edit-redo').disabled = !redo.length || busy;
  }
  function reconcile(data) {
    const ids = new Set(data.map(d => d.id));
    for (const [id, r] of records) if (r.present && !ids.has(id)) { objetos.retirar(id); r.root.removeFromParent(); r.present = false; }
    for (const d of data) {
      const r = records.get(d.id); aplicarObjeto(r.root, d);
      if (!r.present) { objetos.registrar(r.root, { id: d.id, tipo: 'glb-importado', etiqueta: d.etiqueta }); scene.add(r.root); r.present = true; }
      objetos.entries.get(d.id).etiqueta = d.etiqueta;
    }
    refresh(); zona();
  }
  async function prepare(blob, name, id) {
    if (!blob || blob.size > EDITOR.maxBytes) throw new Error('Archivo ausente o mayor de 100 MB.');
    const buffer = await blob.arrayBuffer(); validarGLB(buffer);
    const manager = new T.LoadingManager(); manager.setURLModifier(url => {
      if (!url.startsWith('blob:') && !url.startsWith('data:')) throw new Error('El GLB debe contener sus texturas y recursos; no se admiten archivos externos.');
      return url;
    });
    const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
    if (gltf.animations.length) throw new Error('Este editor admite objetos estáticos. Las animaciones necesitan un editor de personajes.');
    return adaptarArticuloCatalogo(gltf.scene, { ficha: { catalogoId: id, nombre: name }, id, tipo: 'glb-importado', etiqueta: name, conservarTexturas: true });
  }
  async function importar(files) {
    try { check(); } catch (e) { status(e.message); return; }
    busy = true; seleccion(); const destination = area(), position = target.clone();
    const floor = ['habitacion', 'pasillo'].includes(destination) ? DIMENSIONS.floorHeight : 0;
    for (const file of files) {
      let root;
      try {
        if (!/\.glb$/i.test(file.name)) throw new Error('Selecciona un archivo .glb.');
        const id = 'glb-' + crypto.randomUUID(), name = file.name.replace(/\.glb$/i, ''); status('Cargando ' + file.name + '…');
        root = await prepare(file, name, id); root.position.set(position.x, floor, position.z); root.userData.area = destination;
        mark(); objetos.registrar(root, { id, tipo: 'glb-importado', etiqueta: name }); scene.add(root);
        records.set(id, { root, blob: file, filename: file.name, present: true }); refresh(); zona(); objetos.seleccionar(id);
        status(file.name + ' introducido. Ajusta su posición o usa Encuadrar. Cambios sin guardar.');
      } catch (e) { status(file.name + ': ' + e.message); }
    }
    busy = false; seleccion(); wake();
  }
  const safe = fn => async () => { try { check(); await fn(); } catch (e) { status(e.message); } };
  toggle.onclick = () => {
    if (busy || ocupado()) return;
    enabled = !enabled; host.hidden = !enabled; toggle.setAttribute('aria-pressed', String(enabled));
    if (enabled) { onEnable(true); status(changed ? 'Cambios sin guardar.' : 'Primera persona · camina hasta el lugar donde quieras colocar el GLB.'); }
    else onEnable(false);
    viewport.classList.remove('glb-drop'); seleccion();
  };
  $('glb-import').onclick = safe(() => $('glb-file').click());
  $('glb-file').onchange = async e => { await importar([...e.target.files]); e.target.value = ''; };
  viewport.addEventListener('dragover', e => { if (enabled && e.dataTransfer.types.includes('Files')) { e.preventDefault(); viewport.classList.add('glb-drop'); } });
  viewport.addEventListener('dragleave', e => { if (!viewport.contains(e.relatedTarget)) viewport.classList.remove('glb-drop'); });
  viewport.addEventListener('drop', e => { if (!enabled) return; e.preventDefault(); viewport.classList.remove('glb-drop'); importar([...e.dataTransfer.files]); });
  $('edit-objects').onchange = e => objetos.seleccionar(e.target.value || null);
  $('edit-apply').onclick = safe(() => {
    const root = selected()?.root; if (!root) return;
    const data = capturarObjeto(root), axes = ['x', 'y', 'z'], value = id => { const field = $(id); if (!field.value.trim() || !Number.isFinite(field.valueAsNumber)) throw new Error('Introduce números válidos.'); return field.valueAsNumber; };
    data.etiqueta = $('edit-name').value.trim(); if (!data.etiqueta) throw new Error('El nombre no puede estar vacío.');
    data.position = axes.map(a => value('edit-p' + a)); data.rotation = axes.map(a => T.MathUtils.degToRad(value('edit-r' + a)));
    const scale = value('edit-scale'); if (scale <= 0) throw new Error('La escala debe ser mayor que cero.');
    data.scale = [scale, scale, scale]; data.hidden = $('edit-hidden').checked;
    mark(); aplicarObjeto(root, data); objetos.entries.get(data.id).etiqueta = data.etiqueta; refresh(); zona(); objetos.seleccionar(data.id); status('Cambios aplicados · sin guardar.');
  });
  $('edit-focus').onclick = safe(() => { const r = selected(); if (r) onFocus(r.root); });
  function moverFlecha(code, grande = false) {
    if (!enabled || !esPrimeraPersona()) return false;
    const record = selected(); if (!record?.present || record.root.userData.area !== area()) { status('Selecciona un GLB importado para moverlo con las flechas.'); return true; }
    const step = grande ? 1 : 0.25, directions = {
      ArrowLeft: [-step, 0, 0], ArrowRight: [step, 0, 0],
      ArrowUp: [0, 0, -step], ArrowDown: [0, 0, step],
      PageUp: [0, step, 0], PageDown: [0, -step, 0]
    };
    const delta = directions[code]; if (!delta) return false;
    mark(); record.root.position.add(new T.Vector3(...delta)); record.root.updateMatrixWorld(true);
    seleccion(); wake(); status(`${record.root.userData.label}: posición ${record.root.position.toArray().map(n => n.toFixed(2)).join(', ')} m. Flechas: mover 25 cm · Mayús: 1 m · Página arriba/abajo: altura.`);
    return true;
  }
  $('edit-delete').onclick = safe(() => { const r = selected(); if (!r) return; mark(); objetos.retirar(r.root.userData.id); r.root.removeFromParent(); r.present = false; refresh(); zona(); status('Objeto eliminado · puedes deshacer. Cambios sin guardar.'); });
  $('edit-duplicate').onclick = safe(async () => {
    const source = selected(); if (!source) return;
    busy = true; seleccion();
    try {
      const data = capturarObjeto(source.root), id = 'glb-' + crypto.randomUUID(), name = data.etiqueta + ' copia';
      const root = await prepare(source.blob, name, id); data.id = id; data.etiqueta = name; data.position[0] += EDITOR.duplicateOffset; aplicarObjeto(root, data);
      mark(); objetos.registrar(root, { id, tipo: 'glb-importado', etiqueta: name }); scene.add(root); records.set(id, { ...source, root, present: true });
      refresh(); zona(); objetos.seleccionar(id); status('Copia independiente creada · sin guardar.');
    } finally { busy = false; seleccion(); }
  });
  $('edit-undo').onclick = safe(() => { if (!undo.length) return; redo.push(snapshot()); reconcile(undo.pop()); changed = true; status('Cambio deshecho · sin guardar.'); });
  $('edit-redo').onclick = safe(() => { if (!redo.length) return; undo.push(snapshot()); reconcile(redo.pop()); changed = true; status('Cambio rehecho · sin guardar.'); });
  $('edit-save').onclick = safe(async () => {
    if (restoreFailed) throw new Error('El guardado está bloqueado para conservar la edición anterior que no pudo restaurarse.');
    busy = true; seleccion();
    try { await persist({ version: EDITOR.version, objects: snapshot().map(data => ({ ...data, blob: records.get(data.id).blob, filename: records.get(data.id).filename })) }); changed = false; status('Edición guardada en este navegador, incluidos los GLB.'); }
    finally { busy = false; seleccion(); }
  });
  window.addEventListener('beforeunload', e => { if (changed) { e.preventDefault(); e.returnValue = ''; } });
  return { seleccion, zona, activo: () => enabled, moverFlecha, ocultar(root, hidden) {
    if (!root || !records.has(root.userData.id)) return false;
    if (busy || ocupado()) return true;
    mark(); root.userData.ocultoUsuario = hidden; zona(); status('Visibilidad cambiada · sin guardar.'); return true;
  }, async restaurar() {
    busy = true;
    try {
      const project = await persist(); if (!project) return;
      if (project.version !== EDITOR.version) throw new Error('Versión de edición incompatible.');
      for (const data of project.objects) {
        const root = await prepare(data.blob, data.etiqueta, data.id); aplicarObjeto(root, data);
        objetos.registrar(root, { id: data.id, tipo: 'glb-importado', etiqueta: data.etiqueta }); scene.add(root);
        records.set(data.id, { root, blob: data.blob, filename: data.filename, present: true });
      }
      refresh(); zona(); status('Edición guardada restaurada.');
    } catch (e) { restoreFailed = true; status('No se pudo restaurar la edición: ' + e.message); mensaje('Revisa Modo edición: ' + e.message); }
    finally { busy = false; seleccion(); }
  } };
}
