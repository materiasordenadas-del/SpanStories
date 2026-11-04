import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { adaptarArticuloCatalogo } from '../engine/ArticuloCatalogo.js';
import { RegistroObjetos } from '../engine/Objetos.js';

const ficha = { catalogoId: 'catalogo-uno', nombre: 'Mueble', rutaOrigen: 'mobiliario/uno.glb' };
function fuente() {
  const group = new T.Group(), mesh = new T.Mesh(new T.BoxGeometry(1, 2, 1), new T.MeshStandardMaterial({ color: '#aabbcc' }));
  mesh.name = 'mueble'; mesh.position.y = 3;
  group.add(mesh, new T.PointLight()); return { group, mesh };
}
test('derivado toon tiene identidad, pivot al suelo y no altera fuente o luz global', () => {
  const { group, mesh } = fuente(), material = mesh.material, geometry = mesh.geometry;
  const a = adaptarArticuloCatalogo(group, { ficha, id: 'mueble-001', tipo: 'mueble', altura: 1 });
  const b = adaptarArticuloCatalogo(group, { ficha, id: 'mueble-002', tipo: 'mueble', altura: 1 });
  const objetos = new RegistroObjetos();
  objetos.registrar(a, { id: a.name, tipo: 'mueble', etiqueta: 'Mueble 1' });
  objetos.registrar(b, { id: b.name, tipo: 'mueble', etiqueta: 'Mueble 2' });
  assert.equal(objetos.resolver(a.getObjectByName('mueble')).id, 'mueble-001');
  assert.equal(a.getObjectByName('mueble').material.name, 'toon-relightable');
  assert.equal(a.userData.catalogoId, ficha.catalogoId);
  assert.equal(mesh.material, material); assert.equal(mesh.geometry, geometry); assert.equal(mesh.position.y, 3);
  assert.equal(group.children.length, 2);
  assert.ok(!a.children[0].children.some(o => o.isLight));
  const box = new T.Box3().setFromObject(a);
  assert.ok(Math.abs(box.min.y) < 1e-8); assert.ok(Math.abs(box.max.y - 1) < 1e-8);
  a.position.x = 10; assert.equal(b.position.x, 0);
  assert.notEqual(a.getObjectByName('mueble').material, b.getObjectByName('mueble').material);
});
test('permite separar un nodo de paquete sin importar objetos vecinos', () => {
  const { group, mesh } = fuente();
  const other = mesh.clone(); other.name = 'otro'; group.add(other);
  mesh.userData.name = 'Nombre.Original';
  const object = adaptarArticuloCatalogo(group, { ficha, id: 'uno', tipo: 'mueble', nodoNombre: 'mueble', contorno: false });
  assert.equal(object.getObjectByName('otro'), undefined);
  const alias = adaptarArticuloCatalogo(group, { ficha, id: 'alias', tipo: 'mueble', nodoNombre: 'Nombre.Original', contorno: false });
  assert.ok(alias.getObjectByName('mueble'));
  assert.throws(() => adaptarArticuloCatalogo(group, { ficha, id: 'uno', tipo: 'mueble', nodoNombre: 'ausente' }));
});
test('rechaza rigs y conserva originales al fallar', () => {
  const group = new T.Group(); group.add(new T.SkinnedMesh(new T.BoxGeometry(), new T.MeshStandardMaterial()));
  assert.throws(() => adaptarArticuloCatalogo(group, { ficha, id: 'uno', tipo: 'personaje' }), /Rig/);
  assert.equal(group.children[0].material.isMeshStandardMaterial, true);
});

