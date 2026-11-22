import * as T from './three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe } from './Luz25D.js';

/** Crea una raíz independiente desde un artículo estático sin modificar su fuente. */
export function adaptarArticuloCatalogo(fuente, {
  ficha, id, tipo, etiqueta = ficha?.nombre, nodoNombre = null, altura = null,
  color = null, conservarTexturas = false, contorno = true, nivelContorno = 'medio'
} = {}) {
  if (!fuente?.isObject3D || !ficha?.catalogoId || !id || !tipo || !etiqueta)
    throw new Error('Fuente, ficha.catalogoId, ID de mundo, tipo y etiqueta obligatorios');
  if (altura !== null && (!Number.isFinite(altura) || altura <= 0)) throw new Error('Altura inválida');
  let selected = fuente;
  if (nodoNombre) {
    const matches = []; fuente.traverse(o => { if (o.name === nodoNombre || o.userData?.name === nodoNombre) matches.push(o); });
    if (matches.length !== 1) throw new Error('nodoNombre debe identificar exactamente un objeto');
    selected = matches[0];
  }
  let unsupported = false, meshes = 0;
  selected.traverse(o => {
    if (o.isSkinnedMesh || o.isInstancedMesh || (o.morphTargetInfluences?.length)) unsupported = true;
    if (o.isMesh) meshes++;
  });
  if (unsupported) throw new Error('Rig, morph o instancia requiere adaptación específica; no convertir silenciosamente');
  if (!meshes) throw new Error('El artículo no contiene mallas');
  fuente.updateWorldMatrix(true, true);
  const content = selected.clone(true);
  // Si se eligió un nodo, conserva sus transformaciones heredadas antes de centrar.
  if (selected !== fuente) selected.matrixWorld.decompose(content.position, content.quaternion, content.scale);
  const root = new T.Group(); root.name = id;
  root.userData = { id, tipo, label: etiqueta, catalogoId: ficha.catalogoId,
    origen: ficha.rutaOrigen, sha256Origen: ficha.sha256Origen,
    estilo: 'Luz25D', verificacionVisual: 'pendiente' };
  root.add(content);
  const renderMeshes = [], excluded = [];
  content.traverse(o => { if (o.isMesh) renderMeshes.push(o); if (o.isLight || o.isCamera) excluded.push(o); });
  excluded.forEach(o => o.removeFromParent());
  const geometries = new Map();
  for (const mesh of renderMeshes) {
    if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, mesh.geometry.clone());
    mesh.geometry = geometries.get(mesh.geometry);
    const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const materials = old.map(m => {
      if (!conservarTexturas && (m.alphaTest > 0 || m.transparent) && (m.map || m.alphaMap))
        throw new Error('Transparencia texturada: revisar albedo neutro antes de conservarTexturas');
      if (conservarTexturas && m.alphaMap) throw new Error('alphaMap independiente requiere preparar alfa en el albedo');
      return crearMaterialToon({
        color: color ?? m.color ?? '#ffffff',
        albedo: conservarTexturas ? m.map : null,
        normal: conservarTexturas ? m.normalMap : null,
        fuerzaNormal: m.normalScale?.x ?? 1,
        opacidad: m.opacity ?? 1, corteAlfa: m.alphaTest ?? 0,
        transparente: Boolean(m.transparent), doble: m.side === T.DoubleSide, bandas: 3
      });
    });
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    if (contorno) {
      const outlines = old.map(m => crearMaterialContorno(color ?? m.color ?? '#ffffff', nivelContorno));
      contornoDe(mesh, Array.isArray(mesh.material) ? outlines : outlines[0]);
    }
  }
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root), size = bounds.getSize(new T.Vector3());
  if (bounds.isEmpty() || size.y <= 0) throw new Error('Límites del artículo inválidos; revisar orientación y dimensiones');
  if (altura !== null) content.scale.multiplyScalar(altura / size.y);
  root.updateMatrixWorld(true); bounds.setFromObject(root);
  const center = bounds.getCenter(new T.Vector3());
  content.position.x -= center.x; content.position.y -= bounds.min.y; content.position.z -= center.z;
  root.updateMatrixWorld(true);
  return root;
}

export async function cargarArticuloCatalogo(url, options) {
  // Loader independiente por llamada: instancias con geometría/estado propios.
  const gltf = await new GLTFLoader().loadAsync(url);
  if (gltf.animations.length) throw new Error('Artículo animado: adaptar y verificar su animación explícitamente');
  return adaptarArticuloCatalogo(gltf.scene, options);
}

