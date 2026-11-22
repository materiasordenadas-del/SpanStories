// Colores de material de objetos AÑADIDOS (GLB). Los objetos del escenario original van fundidos en sectores optimizados
// y no se recolorean desde aquí. Los cambios se guardan como { nombreDeMaterial: '#rrggbb' } en escenario.objetos[id].colores.
import * as T from '../../engine/three.js';

const HEX = /^#[\da-f]{6}$/i;

/** Materiales únicos de una raíz: [{ clave, nombre, material, hex }]. La clave es el nombre (o «material-N» si no tiene). */
export function materialesDe(raiz) {
  const vistos = new Map();
  raiz.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m?.color || vistos.has(m.uuid)) continue;
      vistos.set(m.uuid, m);
    }
  });
  const usados = new Map();
  return [...vistos.values()].map((material, i) => {
    let nombre = material.name?.trim() || `Material ${i + 1}`;
    const n = (usados.get(nombre) ?? 0) + 1; usados.set(nombre, n); if (n > 1) nombre += ` (${n})`;
    material.userData.editorColorOriginal ??= '#' + material.color.getHexString();
    return { clave: nombre, nombre, material, hex: '#' + material.color.getHexString(), original: material.userData.editorColorOriginal };
  });
}

export function aplicarColores(raiz, colores = {}) {
  let cambios = 0;
  for (const { clave, material, original } of materialesDe(raiz)) {
    const hex = colores[clave] ?? original;
    if (HEX.test(hex) && '#' + material.color.getHexString() !== hex.toLowerCase()) { material.color.set(hex); material.needsUpdate = true; cambios++; }
  }
  return cambios;
}

export function validarColores(colores) {
  if (!colores || typeof colores !== 'object' || Array.isArray(colores)) throw new Error('Colores inválidos.');
  for (const [k, v] of Object.entries(colores)) if (typeof k !== 'string' || !HEX.test(v)) throw new Error('Color inválido en ' + k);
  return colores;
}

export { T };
