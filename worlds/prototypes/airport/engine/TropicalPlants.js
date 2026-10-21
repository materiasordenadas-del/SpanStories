import * as T from './three.js';
import { GLBAssetSource } from './GLBAssetSource.js';
import { crearMaterialToon, crearMaterialContorno, conContornoAlfa, conNormalContorno } from './Luz25D.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { REFLECT_LAYER } from './GlossyFloor.js';

// Planta tropical 2.5D en maceta (assets/planta-tropical.glb). Las salas
// registran sus posiciones con `plantar` (síncrono, en coordenadas de la sala)
// y AirportChunk las coloca con `colocarPlantas` cuando el GLB está cargado:
// una malla instanciada por pieza del modelo, con materiales toon (Luz25D).
// Cada matero es una instancia, así que el modo edición los mueve por separado.
const pendientes = new WeakMap();   // scope → posiciones
const HOJAS_ANCHO = 1.5, TIERRA = .71;   // bromelia (assets/bromelia.glb): ancho de copa y altura de la tierra en la maceta
const ESCALA = .85, BASE = .15;     // la maceta baja .15 m del origen del modelo

export function plantar(scope, x, z, { rot, esc = ESCALA, group, bromelia = false } = {}) {
  const lista = pendientes.get(scope) || pendientes.set(scope, []).get(scope);
  lista.push({ x, z, rot: rot ?? lista.length * 2.4, esc, group, bromelia });
}

export async function colocarPlantas({ registry, scope, group: porDefecto }) {
  const todas = pendientes.get(scope);
  if (!todas?.length) return;
  pendientes.delete(scope);
  // Solo las plantas pedidas con `bromelia` (D00) cambian de hojas; el resto de salas conserva el modelo original.
  for (const conBromelia of [false, true]) {
    const spots = todas.filter(p => p.bromelia === conBromelia);
    if (spots.length) await colocarGrupo({ registry, scope, group: spots[0].group || porDefecto, spots, conBromelia });   // D00: el grupo que refleja el piso brillante
  }
}

async function colocarGrupo({ registry, scope, group, spots, conBromelia }) {
  const modelo = await new GLBAssetSource(registry).instantiateStatic(new URL('../assets/planta-tropical.glb', import.meta.url).href, scope);
  modelo.updateMatrixWorld(true);
  // Solo se cambian las hojas: la maceta y la tierra siguen siendo las del modelo original.
  const partes = [];
  modelo.traverse(p => { if (p.isMesh && !(conBromelia && /follaje|pec/i.test(p.name))) partes.push({ parte: p, mat: p.matrixWorld }); });
  if (conBromelia) {
    const hojas = await new GLBAssetSource(registry).instantiateStatic(new URL('../assets/bromelia.glb', import.meta.url).href, scope);
    hojas.updateMatrixWorld(true);
    const caja = new T.Box3().setFromObject(hojas), tam = caja.getSize(new T.Vector3()), cen = caja.getCenter(new T.Vector3());
    const k = HOJAS_ANCHO / Math.max(tam.x, tam.z);   // ancho de copa objetivo; la base apoya sobre la tierra
    const ajuste = new T.Matrix4().makeTranslation(0, TIERRA, 0).multiply(new T.Matrix4().makeScale(k, k, k)).multiply(new T.Matrix4().makeTranslation(-cen.x, -caja.min.y, -cen.z));
    hojas.traverse(p => { if (p.isMesh) partes.push({ parte: p, mat: new T.Matrix4().multiplyMatrices(ajuste, p.matrixWorld), hoja: true }); });
  }
  const M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
  const potes = [];
  for (const { parte, mat, hoja } of partes) {
    const original = parte.material;
    const corte = hoja ? .5 : original.alphaTest || 0;
    const material = scope.own(crearMaterialToon({
      color: original.map ? '#ffffff' : `#${original.color.getHexString()}`,
      albedo: original.map || null, corteAlfa: corte, doble: true,
    }));
    if (corte > 0) conContornoAlfa(material, '#3a7d36');   // follaje: trazo en el borde del recorte
    if (/maceta/i.test(parte.name)) potes.push(parte);
    const malla = new T.InstancedMesh(parte.geometry, material, spots.length);
    malla.name = /maceta/i.test(parte.name) ? 'pot:planta' : 'planta';
    malla.frustumCulled = false;
    spots.forEach((p, i) => {
      M.compose(P.set(p.x, BASE * p.esc, p.z), Q.setFromAxisAngle(Y, p.rot), S.setScalar(p.esc)).multiply(mat);
      malla.setMatrixAt(i, M);
    });
    malla.instanceMatrix.needsUpdate = true;
    if (group.layers.isEnabled(REFLECT_LAYER)) malla.layers.enable(REFLECT_LAYER);   // salas con piso brillante
    group.add(malla);
    scope.defer(() => { malla.removeFromParent(); malla.dispose(); });
  }
  // Contorno cartoon de la maceta: un solo casco instanciado con todas sus piezas.
  if (potes.length) {
    const casco = scope.own(mergeGeometries(potes.map(p => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', p.geometry.getAttribute('position')); g.setAttribute('normal', p.geometry.getAttribute('normal'));
      g.setIndex(p.geometry.getIndex());
      return g.applyMatrix4(p.matrixWorld);
    })));
    conNormalContorno(casco);
    casco.setAttribute('aNivel', new T.InstancedBufferAttribute(new Float32Array(spots.length).fill(1), 1));
    const malla = new T.InstancedMesh(casco, scope.own(crearMaterialContorno('#d9d2c8', 'medio')), spots.length);
    malla.name = 'pot:contorno'; malla.frustumCulled = false; malla.raycast = () => {};
    spots.forEach((p, i) => { M.compose(P.set(p.x, BASE * p.esc, p.z), Q.setFromAxisAngle(Y, p.rot), S.setScalar(p.esc)); malla.setMatrixAt(i, M); });
    malla.instanceMatrix.needsUpdate = true;
    if (group.layers.isEnabled(REFLECT_LAYER)) malla.layers.enable(REFLECT_LAYER);
    group.add(malla);
    scope.defer(() => { malla.removeFromParent(); malla.dispose(); });
  }
}
