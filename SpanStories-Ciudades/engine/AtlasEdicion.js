import * as T from './three.js';

/**
 * Edición de lugares del Generador (Atlas) sin volver a exportarlos.
 *
 * El Generador publica cada sector con los elementos FUNDIDOS para dibujar rápido: la estructura de muchos edificios
 * en una malla por categoría (con `_entity_id` por vértice) y los repetidos (ventanas, árboles, farolas…) en
 * InstancedMesh con `instanceEntityIds` por instancia. Esa identidad permite separar un elemento sin pérdida:
 *
 * - Instancias: se recalcula la matriz de cada instancia del elemento a partir de una copia de las originales.
 * - Estructura fundida: los triángulos del elemento se copian (todos sus atributos, mismo material y mismo contorno)
 *   a una malla propia, la «pieza», y en la malla fundida se reducen a triángulos degenerados (área cero, invisibles).
 *   Deshacer hasta la transformación original devuelve los vértices y retira la pieza.
 *
 * Solo se separa lo que se edita; el resto sigue fundido (mismas llamadas de dibujo que el paquete publicado).
 * La transformación del elemento es la del proxy que registra AtlasAssets: un desplazamiento en coordenadas del
 * mundo respecto a su posición publicada (identidad = sin cambios), que CityEditor guarda como cualquier objeto.
 */

const _m = new T.Matrix4(), _inv = new T.Matrix4(), _w = new T.Matrix4(), _zero = new T.Matrix4().makeScale(0, 0, 0);

/** Matriz de edición del proxy (posición, rotación y escala) y si está oculto. */
export function edicionDe(proxy) {
  proxy.updateMatrix();
  const hidden = !!proxy.userData.ocultoUsuario;
  return { matrix: proxy.matrix.clone(), hidden, identity: !hidden && esIdentidad(proxy.matrix) };
}
export function esIdentidad(m, eps = 1e-7) {
  const e = m.elements, id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return e.every((v, i) => Math.abs(v - id[i]) <= eps);
}

/** Números de entidad (los del GLB) que corresponden a cada identidad del lugar. */
export function numerosPorId(entities) {
  const map = new Map();
  for (const [n, id] of Object.entries(entities ?? {})) { if (!map.has(id)) map.set(id, new Set()); map.get(id).add(Number(n)); }
  return map;
}

const esFundida = o => o.isMesh && !o.isInstancedMesh && !o.userData.cityOutline && !o.userData.atlasPieza &&
  !!(o.geometry?.getAttribute('_entity_id') ?? o.geometry?.getAttribute('__entity_id'));
const esInstanciada = o => o.isInstancedMesh && !o.userData.cityOutline && Array.isArray(o.userData.instanceEntityIds);

/** Triángulos (índice del primer vértice) por número de entidad de una malla fundida no indexada; se calcula una vez. */
export function triangulosPorEntidad(mesh) {
  if (mesh.userData.atlasTriangulos) return mesh.userData.atlasTriangulos;
  const g = mesh.geometry, ids = g.getAttribute('_entity_id') ?? g.getAttribute('__entity_id'), map = new Map();
  if (g.index) throw new Error('Malla fundida indexada no admitida: ' + mesh.name);
  for (let v = 0; v + 2 < ids.count; v += 3) {
    const n = Math.round(ids.getX(v)); if (!n) continue;
    if (!map.has(n)) map.set(n, []); map.get(n).push(v);
  }
  mesh.userData.atlasTriangulos = map;
  return map;
}

/** Instancias (índices) por número de entidad de una InstancedMesh. */
function instanciasPorEntidad(mesh) {
  if (mesh.userData.atlasInstancias) return mesh.userData.atlasInstancias;
  const map = new Map();
  mesh.userData.instanceEntityIds.forEach((n, i) => { if (!n) return; if (!map.has(n)) map.set(n, []); map.get(n).push(i); });
  return (mesh.userData.atlasInstancias = map);
}

function refrescarInstancias(mesh) {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.boundingSphere = null; mesh.boundingBox = null; mesh.computeBoundingSphere();
  // Los contornos de instancias comparten instanceMatrix (atlasInstanceOutlines): recalculan su esfera de recorte.
  for (const c of mesh.children) if (c.isInstancedMesh && c.instanceMatrix === mesh.instanceMatrix) { c.boundingSphere = null; c.computeBoundingSphere(); }
}

function editarInstancias(mesh, indices, edicion) {
  if (!mesh.userData.atlasMatricesOriginales) mesh.userData.atlasMatricesOriginales = mesh.instanceMatrix.array.slice();
  const original = mesh.userData.atlasMatricesOriginales;
  mesh.updateWorldMatrix(true, false); _inv.copy(mesh.matrixWorld).invert();
  for (const i of indices) {
    if (edicion.hidden) { mesh.setMatrixAt(i, _zero); continue; }
    _m.fromArray(original, i * 16);
    if (!edicion.identity) _m.premultiply(_w.copy(mesh.matrixWorld)).premultiply(edicion.matrix).premultiply(_inv);
    mesh.setMatrixAt(i, _m);
  }
  refrescarInstancias(mesh);
}

function separarFundida(mesh, n, triangulos) {
  const piezas = mesh.userData.atlasPiezas ??= new Map();
  if (piezas.has(n)) return piezas.get(n);
  const g = mesh.geometry, vertices = triangulos.length * 3, geometry = new T.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const copy = new attr.array.constructor(vertices * attr.itemSize);
    let o = 0;
    for (const v of triangulos) for (let k = 0; k < 3; k++) { for (let c = 0; c < attr.itemSize; c++) copy[o++] = attr.array[(v + k) * attr.itemSize + c]; }
    geometry.setAttribute(name, new T.BufferAttribute(copy, attr.itemSize, attr.normalized));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  // Triángulos degenerados en la malla fundida: se guarda su posición original para devolverla al deshacer.
  const position = g.getAttribute('position'), guardado = new Float32Array(vertices * 3);
  let o = 0;
  for (const v of triangulos) {
    for (let k = 0; k < 3; k++) { for (let c = 0; c < 3; c++) guardado[o++] = position.array[(v + k) * 3 + c]; }
    for (let k = 1; k < 3; k++) for (let c = 0; c < 3; c++) position.array[(v + k) * 3 + c] = position.array[v * 3 + c];
  }
  position.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
  const pieza = new T.Mesh(geometry, mesh.material);
  pieza.name = mesh.name + ':pieza:' + n;
  pieza.userData = { ...mesh.userData, atlasTriangulos: undefined, atlasPiezas: undefined, atlasPieza: true, entityNumber: n };
  pieza.matrixAutoUpdate = false;
  // Mismo contorno que la malla fundida (mismo material de trazo), sobre la geometría de la pieza.
  const shell = mesh.children.find(c => c.userData.cityOutline && !c.isInstancedMesh);
  if (shell) { const casco = new T.Mesh(geometry, shell.material); casco.name = pieza.name + '_contorno'; casco.userData = { ...shell.userData }; casco.raycast = () => {}; pieza.add(casco); }
  mesh.parent.add(pieza);
  const record = { pieza, triangulos, guardado };
  piezas.set(n, record);
  return record;
}

function unirFundida(mesh, n) {
  const record = mesh.userData.atlasPiezas?.get(n); if (!record) return;
  const position = mesh.geometry.getAttribute('position');
  let o = 0;
  for (const v of record.triangulos) for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) position.array[(v + k) * 3 + c] = record.guardado[o++];
  position.needsUpdate = true; mesh.geometry.computeBoundingSphere(); mesh.geometry.computeBoundingBox();
  record.pieza.removeFromParent(); record.pieza.geometry.dispose();
  mesh.userData.atlasPiezas.delete(n);
}

function colocarPieza(mesh, record, edicion) {
  const { pieza } = record;
  mesh.updateWorldMatrix(true, false); mesh.parent.updateWorldMatrix(true, false);
  // Local de la pieza = padre⁻¹ · edición · mundo de la malla fundida.
  pieza.matrix.copy(mesh.matrixWorld).premultiply(edicion.matrix).premultiply(_inv.copy(mesh.parent.matrixWorld).invert());
  pieza.matrixWorldNeedsUpdate = true;
  pieza.visible = !edicion.hidden;
  pieza.updateMatrixWorld(true);
}

/**
 * Aplica la edición de una identidad a la raíz de un sector. `numeros` son sus números de entidad en el GLB.
 * Devuelve cuántas partes tocó (instancias y piezas), para pruebas y diagnóstico.
 */
export function aplicarEnSector(root, numeros, edicion) {
  if (!root || !numeros?.size) return 0;
  let partes = 0; const fundidas = [], instanciadas = [];
  root.traverse(o => { if (esFundida(o)) fundidas.push(o); else if (esInstanciada(o)) instanciadas.push(o); });
  for (const mesh of instanciadas) {
    const mapa = instanciasPorEntidad(mesh), indices = [];
    for (const n of numeros) indices.push(...(mapa.get(n) ?? []));
    if (!indices.length) continue;
    // Sin edición y sin copia previa no hay nada que devolver.
    if (edicion.identity && !mesh.userData.atlasMatricesOriginales) continue;
    editarInstancias(mesh, indices, edicion); partes += indices.length;
  }
  for (const mesh of fundidas) {
    const mapa = triangulosPorEntidad(mesh);
    for (const n of numeros) {
      const triangulos = mapa.get(n); if (!triangulos?.length) continue;
      if (edicion.identity) { unirFundida(mesh, n); continue; }
      colocarPieza(mesh, separarFundida(mesh, n, triangulos), edicion); partes++;
    }
  }
  return partes;
}

/** Devuelve un sector a su estado publicado (antes de que otro sistema, p. ej. la vegetación, lea sus matrices). */
export function restaurarSector(root) {
  if (!root) return;
  const fundidas = [], instanciadas = [];
  root.traverse(o => { if (esFundida(o)) fundidas.push(o); else if (esInstanciada(o)) instanciadas.push(o); });
  for (const mesh of instanciadas) {
    const original = mesh.userData.atlasMatricesOriginales; if (!original) continue;
    mesh.instanceMatrix.array.set(original); delete mesh.userData.atlasMatricesOriginales; refrescarInstancias(mesh);
  }
  for (const mesh of fundidas) for (const n of [...(mesh.userData.atlasPiezas?.keys() ?? [])]) unirFundida(mesh, n);
}

/** Caja actual del elemento: caja publicada transformada por su edición. */
export function cajaEditada(proxy) {
  const base = proxy.userData.atlasBounds; if (!base || base.isEmpty()) return new T.Box3();
  proxy.updateMatrix();
  return base.clone().applyMatrix4(proxy.matrix);
}

/**
 * Edición de un lugar Atlas: enlaza los proxies de AtlasAssets con las mallas de los sectores cargados.
 * `records()` devuelve los sectores listos; `entities` es el mapa número→id de zona.json.
 */
export class EdicionAtlas {
  constructor({ entities, records }) {
    this.numeros = numerosPorId(entities);
    this.records = records;
  }
  /** Adaptador que CityEditor llama al aplicar una transformación (instanceBinding.sync / bounds). */
  vincular(id, proxy) {
    proxy.userData.atlasEditable = true;
    proxy.userData.instanceBinding = { sync: () => this.aplicar(id), bounds: () => cajaEditada(proxy) };
  }
  aplicar(id) {
    const proxy = this.proxy?.(id); if (!proxy) return 0;
    const edicion = edicionDe(proxy), numeros = this.numeros.get(id);
    let partes = 0;
    for (const record of this.records()) if (!record.entityBounds || record.entityBounds.has(id)) partes += aplicarEnSector(record.root, numeros, edicion);
    return partes;
  }
  /** Al llegar (o volver) un sector, recibe las ediciones vigentes de sus elementos. */
  aplicarSector(record) {
    for (const id of record.entityBounds?.keys() ?? []) {
      const proxy = this.proxy?.(id); if (!proxy) continue;
      const edicion = edicionDe(proxy); if (edicion.identity) continue;
      aplicarEnSector(record.root, this.numeros.get(id), edicion);
    }
  }
  restaurarSector(record) { restaurarSector(record.root); }
}
