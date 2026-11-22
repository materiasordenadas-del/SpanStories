// Colina de Don Quijote exportada desde Blender (Mundo/ColinaQuijoteBlender).
// Los sectores son GLB normales: el Editor los carga, selecciona y guarda como cualquier zona.
// Particularidades (marcadas en Blender como propiedades personalizadas → userData):
//  · ss_keepMaterial: colores NPR horneados en Blender (KHR_materials_unlit); CityStyle no los convierte a toon.
//  · ss_cielo: grupo «Cielo_Skybox» (bóveda, luna, nubes y colinas lejanas a escala 1/8) que sigue a la cámara
//    y se dibuja detrás de todo en el orden ss_cielo_orden.
// La fuente editable es el .blend maestro indicado en zona.json › source.
import * as T from './three.js';
import { CityAssets } from './CityAssets.js';

export function prepararCieloBlender(root) {
  let cielo = null;
  root.traverse(o => { if (o.userData.ss_cielo) cielo = o; });
  if (!cielo) return null;
  cielo.traverse(o => {
    o.frustumCulled = false;
    if (!o.isMesh) return;
    o.renderOrder = -1000 + Math.round((o.userData.ss_cielo_orden ?? 0) * 100);
    for (const m of [o.material].flat()) { m.depthTest = false; m.depthWrite = false; m.fog = false; }
    o.raycast = () => {};
    o.userData.ignorarSeleccion = true;
  });
  cielo.matrixAutoUpdate = true;
  return cielo;
}

export function prepararMaterialesBlender(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) { m.fog = false; m.side = T.DoubleSide; m.needsUpdate = true; }
  });
}

// Opciones › Escena › Nubes para esta zona (mismo selector que la colina procedural).
export const CLOUD_STYLES_BLENDER = Object.freeze([
  { id: 0, label: 'Cúmulos 3D de Blender' },
  { id: 1, label: 'Cúmulos 3D suaves (translúcidos)' },
  { id: 2, label: 'Solo cúmulos bajos' },
  { id: 3, label: 'Sin nubes' },
]);

export class BlenderHillAssets extends CityAssets {
  constructor(options) {
    // Sin multi-draw: fusionaría las nubes (comparten material) y el cielo dejaría de poder seguir a la cámara.
    super({ ...options, multiDraw: false });
    this.sinClima = true;
    this.cielos = new Map();
    this.tiempo = 0;
    this.cloudStyles = CLOUD_STYLES_BLENDER;
    this.cloudStyle = 0;
    this.groundStyle = 1;
    this.grassDensity = 1;
    const onLoad = this.onLoad;
    this.onLoad = record => {
      prepararMaterialesBlender(record.root);
      const cielo = prepararCieloBlender(record.root);
      if (cielo) this.cielos.set(record.sector.id, cielo);
      record.root.traverse(o => { if (o.isInstancedMesh) o.userData.cuentaBase ??= o.count; });
      this.aplicarOpciones(record.root);
      onLoad(record);
    };
  }

  aplicarOpciones(root) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const nombre = o.name + ' ' + (o.parent?.name ?? '');
      if (/Nube_/.test(nombre)) {
        o.visible = this.cloudStyle !== 3 && !(this.cloudStyle === 2 && /Nube_Media/.test(nombre));
        for (const m of [o.material].flat()) {
          const suave = this.cloudStyle === 1;
          if (m.transparent !== suave) { m.transparent = suave; m.needsUpdate = true; }
          m.opacity = suave ? 0.78 : 1;
        }
      }
      if (/Colina_Terreno/.test(nombre)) {
        for (const m of [o.material].flat()) m.color?.setRGB(...(this.groundStyle === 0 ? [0.72, 0.76, 0.86] : [1, 1, 1]));
      }
      // Densidad: las instancias se exportan en orden aleatorio, así que recortar la cuenta aclara de forma uniforme.
      if (o.isInstancedMesh && o.userData.cuentaBase != null && /Cesped|Flores/.test(nombre)) {
        o.count = Math.max(1, Math.round(o.userData.cuentaBase * Math.min(1, this.grassDensity)));
      }
    });
  }

  aplicarATodo() { for (const r of this.records.values()) if (r.root) this.aplicarOpciones(r.root); }
  setCloudStyle(style) { this.cloudStyle = style; this.aplicarATodo(); }
  setGroundStyle(style) { this.groundStyle = style; this.aplicarATodo(); }
  setGrassDensity(density) { this.grassDensity = Math.min(2, Math.max(.25, density)); this.aplicarATodo(); }

  detach(record) {
    this.cielos.delete(record.sector.id);
    super.detach(record);
  }

  update(dt) {
    this.tiempo += dt;
    for (const cielo of this.cielos.values()) {
      // Skybox: acompaña a la cámara para que luna, nubes y horizonte queden siempre a distancia «infinita».
      cielo.position.copy(this.camera.position);
      cielo.updateMatrixWorld(true);
    }
  }
}
