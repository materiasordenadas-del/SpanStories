import * as T from './three.js';
import { RenderMaterials } from './CityRenderOptimization.js';

const identity = new T.Matrix4(), hidden = new T.Matrix4().makeScale(0, 0, 0);
function visible(node) { for (let p = node; p; p = p.parent) if (!p.visible) return false; return true; }
function semantic(node) { for (let p = node; p; p = p.parent) if (p.userData.id || p.userData.ssId) return p.userData.id || p.userData.ssId; return null; }

// Representación GPU separada; los nodos GLTF originales conservan jerarquía y pivotes.
export function prepararBatches(root, { minimum = 2 } = {}) {
  root.updateMatrixWorld(true); const groups = new Map(), batches = [], original = [], materials = new RenderMaterials();
  let active=true;
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.userData.instanceBinding || mesh.morphTargetInfluences || mesh.userData.cityOutline || Array.isArray(mesh.material)
      || mesh.matrixWorld.determinant() <= 0 || !mesh.userData.geometryKey || !semantic(mesh)) return;
    const key = mesh.userData.geometryKey + ':' + mesh.material.uuid;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(mesh);
  });
  const host = new T.Group(); host.name = 'representacion-instanciada'; host.userData.ignorarSeleccion = false;
  root.add(host); root.updateMatrixWorld(true); const inverse = root.matrixWorld.clone().invert();
  for (const meshes of groups.values()) {
    if (meshes.length < minimum) continue;
    const first = meshes[0], batch = new T.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.material = materials.get(first.material, first.geometry, 'instanced');
    batch.name = 'batch:' + first.name; batch.userData.instanceIds = meshes.map(semantic);
    host.add(batch); batches.push(batch);
    const outlineSource = first.children.find(c => c.userData.cityOutline); let outline;
    if (outlineSource) {
      const g = new T.BufferGeometry(); g.setIndex(first.geometry.index);
      for (const [key, attr] of Object.entries(first.geometry.attributes)) g.setAttribute(key, attr);
      g.setAttribute('aNivel', new T.InstancedBufferAttribute(new Float32Array(meshes.length).fill(1), 1));
      outline = new T.InstancedMesh(g, outlineSource.material, meshes.length);
      outline.material = materials.get(outlineSource.material, g, 'instanced');
      outline.name = batch.name + ':contorno'; outline.userData.cityOutline = true; outline.raycast = () => {}; host.add(outline); batches.push(outline);
    }
    const updateBounds = () => {
      batch.computeBoundingBox(); batch.computeBoundingSphere();
      if (outline) { outline.computeBoundingBox(); outline.computeBoundingSphere(); }
    };
    meshes.forEach((mesh, index) => {
      const shell = mesh.children.find(c => c.userData.cityOutline);
      const source={mesh,layers:mesh.layers.mask,shell,shellLayers:shell?.layers.mask};original.push(source); mesh.layers.disable(0);
      if (shell) shell.layers.disable(0);
      mesh.userData.instanceBinding = {
        batch, index, updateBounds,
        sync(recomputeBounds = true) {
          mesh.updateWorldMatrix(true, false);
          // El host sigue al root: su inversa debe reflejar la transformación actual.
          inverse.copy(root.matrixWorld).invert();
          identity.multiplyMatrices(inverse,mesh.matrixWorld);const compatible=identity.determinant()>0;
          mesh.layers.mask=active&&compatible?source.layers&~1:source.layers;
          if(shell)shell.layers.mask=active&&compatible?source.shellLayers&~1:source.shellLayers;
          const matrix = visible(mesh)&&compatible ? identity : hidden;
          batch.setMatrixAt(index, matrix); batch.instanceMatrix.needsUpdate = true;
          if (outline) { outline.setMatrixAt(index, matrix); outline.instanceMatrix.needsUpdate = true; }
          if (recomputeBounds) updateBounds();
        },
        bounds() { mesh.updateWorldMatrix(true, false); return new T.Box3().copy(mesh.geometry.boundingBox || (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox)).applyMatrix4(mesh.matrixWorld); }
      };
      // Inicialización en bloque evita recalcular bounds por instancia.
      const matrix = visible(mesh) ? identity.multiplyMatrices(inverse, mesh.matrixWorld) : hidden;
      batch.setMatrixAt(index, matrix); outline?.setMatrixAt(index, matrix);
    });
    batch.computeBoundingBox(); batch.computeBoundingSphere();
    if (outline) { outline.computeBoundingBox(); outline.computeBoundingSphere(); }
  }
  function refresh(node = root) {
    node.updateWorldMatrix(true, true); const updates = new Set();
    node.traverse(o => { const binding = o.userData.instanceBinding; if (binding?.batch?.isInstancedMesh) { binding.sync(false); updates.add(binding.updateBounds); } });
    for (const update of updates) update();
  }
  return { batches, instanceCount: original.length, refresh,
    dispose() { for (const {mesh,layers,shell,shellLayers} of original) { mesh.layers.mask = layers; if (shell) shell.layers.mask = shellLayers; delete mesh.userData.instanceBinding; } for (const b of batches) { b.dispose(); if (b.userData.cityOutline) b.geometry.dispose(); } materials.dispose(); host.removeFromParent(); },
    setActive(on) { active=on;host.visible = on; for (const {mesh,layers,shell,shellLayers} of original) { mesh.layers.mask = on ? layers & ~1 : layers; if (shell) shell.layers.mask = on ? shellLayers & ~1 : shellLayers; } if (on) refresh(); }
  };
}
