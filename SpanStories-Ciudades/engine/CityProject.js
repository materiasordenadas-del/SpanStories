import * as T from './three.js';
import {ESCENARIO_VERSION,escenarioVacio,validarEscenario,migrarProyecto,depurarEscenario} from '../editor/core/EscenarioDoc.js';

// Captura/aplicación, historial e IndexedDB adaptados del EditorGLB del hotel.
export const CITY_EDITOR = { version: ESCENARIO_VERSION, legacyVersion: 1, maxBytes: 100 * 1024 * 1024, historyLimit: 50 };
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
    this.escenario = escenarioVacio();
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
  /** Varios objetos a la vez (selección múltiple): una sola entrada de historial. items = [{id, data}] */
  applyMany(items) {
    if (!items.length) return [];
    const edits = items.map(({ id, data }) => {
      const before = capturarObjeto(this.objetos.obtener(id));
      this.apply(id, { ...before, ...data, id }, false);
      return { id, before, after: capturarObjeto(this.objetos.obtener(id)) };
    });
    this.remember({ kind: 'multi', edits });
    return edits;
  }
  /** Comando genérico reversible (agrupar, capas, pintura…): { nombre, undo(), redo() }. Ya ejecutado por quien lo registra. */
  registrarComando(cmd) { this.remember({ kind: 'cmd', ...cmd }); return cmd; }
  /** Quita un objeto añadido (importado) de la escena, reversible. */
  quitarImport(id) {
    const record = this.imports.get(id); if (!record) throw new Error('Solo se pueden eliminar objetos añadidos.');
    this.setPresent(record, false); this.remember({ kind: 'borrar-import', id });
  }
  marcarCambio() { this.dirty = true; this.changed(null); }
  /** Agrupa en UNA entrada de historial todo lo que `fn` registre (borrar + ocultar, pegar varios…). */
  transaccion(nombre, fn) {
    const base = this.undoStack.length, resultado = fn();
    const hechos = this.undoStack.splice(base);
    if (hechos.length > 1) this.undoStack.push({ kind: 'grupo', nombre, hechos });
    else this.undoStack.push(...hechos);
    return resultado;
  }
  ejecutarComando(command, reverse) {
    if (command.kind === 'edit') this.apply(command.id, reverse ? command.before : command.after, false);
    else if (command.kind === 'multi') for (const e of reverse ? [...command.edits].reverse() : command.edits) this.apply(e.id, reverse ? e.before : e.after, false);
    else if (command.kind === 'cmd') (reverse ? command.undo : command.redo)();
    else if (command.kind === 'grupo') for (const c of reverse ? [...command.hechos].reverse() : command.hechos) this.ejecutarComando(c, reverse);
    else if (command.kind === 'borrar-import') this.setPresent(this.imports.get(command.id), reverse);
    else this.setPresent(this.imports.get(command.id), !reverse);
  }
  moveHistory(from, to, reverse) {
    const command = from.at(-1); if (!command) return false;
    this.ejecutarComando(command, reverse);
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
    // Solo se olvidan los objetos añadidos que ya no existen; los del escenario base pueden estar en un sector sin cargar.
    depurarEscenario(this.escenario, id => !id.startsWith('import-') || this.objetos.entries.has(id));
    return { version: CITY_EDITOR.version, cityId: this.cityId, escenario: structuredClone(this.escenario),
      overrides: [...overrides.values()].map(value => structuredClone(value)),
      imports: [...this.imports.values()].filter(record => record.present).map(record => ({
        id: record.id, filename: record.filename, blob: record.blob,
        nodes: record.nodes.map(node => ({ key: node.key, meta: { ...node.meta, etiqueta: node.root.userData.label,
          sector: node.root.userData.sector }, state: capturarObjeto(node.root) }))
      })) };
  }
}

export function validateProject(project, cityId) {
  if (!project || ![CITY_EDITOR.legacyVersion, CITY_EDITOR.version].includes(project.version) || project.cityId !== cityId ||
      !Array.isArray(project.overrides) || !Array.isArray(project.imports))
    throw new Error('Proyecto incompatible o perteneciente a otra ciudad.');
  if (project.version === CITY_EDITOR.version) validarEscenario(project.escenario);
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

async function huella(blob) {
  if (blob.sha) return blob.sha;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return blob.sha = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function aBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

/** Formato v2: cada GLB se guarda UNA vez en `recursos` (por SHA-256) aunque haya varias copias colocadas. */
export async function serializarProyecto(project) {
  const migrado = migrarProyecto(project), recursos = new Map(), imports = [];
  for (const record of migrado.imports) {
    const sha = await huella(record.blob);
    if (!recursos.has(sha)) recursos.set(sha, { sha, glbBase64: await aBase64(record.blob) });
    const { blob, ...rest } = record;
    imports.push({ ...rest, recurso: sha });
  }
  return JSON.stringify({ ...migrado, recursos: [...recursos.values()], imports });
}

function blobDeBase64(texto) {
  if (typeof texto !== 'string' || texto.length > Math.ceil(CITY_EDITOR.maxBytes / 3) * 4) throw new Error('GLB portable ausente o mayor de 100 MB.');
  const binary = atob(texto), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  validarGLB(bytes.buffer);
  return new Blob([bytes], { type: 'model/gltf-binary' });
}

/** Lee proyectos v1 (GLB embebido en cada import) y v2 (recursos únicos). Siempre devuelve v2 en memoria. */
export function deserializarProyecto(text, cityId) {
  const crudo = JSON.parse(text), project = validateProject(crudo, cityId);
  const blobs = new Map();
  for (const recurso of project.recursos ?? []) { if (typeof recurso?.sha !== 'string') throw new Error('Recurso GLB inválido.'); blobs.set(recurso.sha, blobDeBase64(recurso.glbBase64)); }
  project.imports = project.imports.map(record => {
    const { glbBase64, recurso, ...rest } = record;
    const blob = recurso ? blobs.get(recurso) : blobDeBase64(glbBase64);
    if (!blob) throw new Error('Un objeto añadido apunta a un recurso GLB ausente.');
    if (recurso) blob.sha = recurso;
    return { ...rest, blob };
  });
  delete project.recursos;
  return migrarProyecto(project);
}

export function crearPreparador({loader,adaptar=async()=>{},optimizar=async()=>null,liberar=()=>{},objetos,target=()=>new T.Vector3()}) {
  return async function prepare(blob, filename, id, storedNodes) {
    if (!blob?.arrayBuffer || blob.size > CITY_EDITOR.maxBytes) throw new Error('GLB ausente o mayor de 100 MB.');
    const buffer = await blob.arrayBuffer(); validarGLB(buffer);
    const gltf = await loader.parseAsync(buffer, '');
    if (gltf.animations?.length) throw new Error('Se admiten GLB estáticos; este archivo contiene animaciones.');
    gltf.scene.traverse(node=>{if(node.isMesh&&!node.geometry.getAttribute('normal'))node.geometry.computeVertexNormals();});
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
  };
}
