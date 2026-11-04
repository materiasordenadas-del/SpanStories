import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../engine/three.js';
import { validarGLB, capturarObjeto, aplicarObjeto } from '../engine/EditorGLB.js';
import { adaptarArticuloCatalogo } from '../engine/ArticuloCatalogo.js';
import { RegistroObjetos } from '../engine/Objetos.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

test('GLB: acepta el binario real y rechaza cabeceras y longitudes inválidas', async () => {
  const file = await readFile(new URL('../assets/catalogo/habitacion/modulos.glb', import.meta.url));
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  assert.doesNotThrow(() => validarGLB(buffer));
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const root = adaptarArticuloCatalogo(gltf.scene, { ficha: { catalogoId: 'glb-real', nombre: 'Módulos' }, id: 'glb-real', tipo: 'glb-importado', conservarTexturas: true });
  assert.ok(!new T.Box3().setFromObject(root).isEmpty());
  assert.ok(Math.abs(new T.Box3().setFromObject(root).min.y) < 1e-6);
  assert.throws(() => validarGLB(new ArrayBuffer(4)));
  const broken = buffer.slice(0); new DataView(broken).setUint32(8, 12, true);
  assert.throws(() => validarGLB(broken));
});

test('editar y restaurar un importado conserva los objetos originales y su identidad', () => {
  const registry = new RegistroObjetos(), original = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
  registry.registrar(original, { id: 'hotel-existente', tipo: 'mueble', etiqueta: 'Original' });
  const source = new T.Group(); source.add(new T.Mesh(new T.BoxGeometry(2, 3, 4), new T.MeshBasicMaterial()));
  const imported = adaptarArticuloCatalogo(source, { ficha: { catalogoId: 'importado', nombre: 'Objeto' }, id: 'importado', tipo: 'glb-importado' });
  imported.userData.area = 'lobby'; registry.registrar(imported, { id: 'importado', tipo: 'glb-importado', etiqueta: 'Objeto' });
  const before = capturarObjeto(imported), originalMatrix = original.matrix.clone(), originalMaterial = original.material;
  const edited = { ...before, position: [10, 2, 3], rotation: [0, Math.PI / 2, 0], scale: [2, 2, 2], hidden: true };
  aplicarObjeto(imported, edited);
  assert.deepEqual(capturarObjeto(imported), edited);
  assert.equal(registry.resolver(imported.children[0].children[0]).id, 'importado');
  assert.deepEqual(original.matrix, originalMatrix); assert.equal(original.material, originalMaterial);
  aplicarObjeto(imported, before); assert.deepEqual(capturarObjeto(imported), before);
  const bounds = new T.Box3().setFromObject(imported); assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(bounds.getCenter(new T.Vector3()).x) < 1e-6);
  assert.throws(() => aplicarObjeto(imported, { ...before, scale: [0, 1, 1] }));
  assert.throws(() => aplicarObjeto(imported, { ...before, position: [NaN, 0, 0] }));
});
