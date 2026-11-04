import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { RegistroObjetos } from '../engine/Objetos.js';
import { crearSilla } from '../objetos/Silla.js';
import { crearPiso } from '../objetos/Piso.js';

function escena() {
  const scene = new T.Scene(), objetos = new RegistroObjetos();
  const silla = crearSilla(), otra = crearSilla(), piso = crearPiso();
  otra.position.x = 2;
  scene.add(silla, otra, piso);
  for (const [o, id, tipo] of [[silla, 'silla-001', 'silla'], [otra, 'silla-002', 'silla'], [piso, 'piso-001', 'piso']])
    objetos.registrar(o, { id, tipo, etiqueta: id });
  return { scene, objetos, silla, otra, piso };
}

test('clic real por raycast en asiento y piso resuelve identidades distintas', () => {
  const { scene, objetos, silla, piso } = escena();
  scene.updateMatrixWorld(true);
  const ray = new T.Raycaster(new T.Vector3(0, 3, 0), new T.Vector3(0, -1, 0));
  assert.equal(objetos.elegirImpacto(ray.intersectObjects(scene.children, true)).raiz, silla);
  ray.set(new T.Vector3(5, 3, 5), new T.Vector3(0, -1, 0));
  assert.equal(objetos.elegirImpacto(ray.intersectObjects(scene.children, true)).raiz, piso);
  assert.equal(objetos.resolver(silla.getObjectByName('pata-1')).id, 'silla-001');
});

test('seleccionar, mover y ocultar silla conserva piso, otra silla y materiales', () => {
  const { objetos, silla, otra, piso } = escena();
  const otherPosition = otra.position.clone(), floorPosition = piso.position.clone();
  const material = silla.getObjectByName('asiento').material;
  assert.equal(objetos.seleccionar('silla-001'), silla);
  silla.position.x = 4; silla.visible = false;
  assert.ok(otra.position.equals(otherPosition)); assert.ok(piso.position.equals(floorPosition));
  assert.equal(otra.visible, true); assert.equal(piso.visible, true);
  assert.equal(silla.getObjectByName('asiento').material, material);
  assert.notEqual(material, otra.getObjectByName('asiento').material);
  assert.equal(objetos.elegirImpacto([{ object: silla.getObjectByName('asiento') }, { object: piso }]).id, 'piso-001');
});

test('rechaza identidades duplicadas, raíces anidadas e instancias sin adaptar', () => {
  const { objetos, silla } = escena();
  assert.throws(() => objetos.registrar(crearSilla(), { id: 'silla-001', tipo: 'silla', etiqueta: 'Duplicada' }));
  assert.throws(() => objetos.registrar(silla.children[0], { id: 'pieza-001', tipo: 'pieza', etiqueta: 'Pieza' }));
  const group = new T.Group(); silla.removeFromParent(); group.add(silla);
  assert.throws(() => objetos.registrar(group, { id: 'grupo-001', tipo: 'grupo', etiqueta: 'Grupo' }));
  const instancia = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial(), 2);
  assert.throws(() => objetos.registrar(instancia, { id: 'instancia-001', tipo: 'silla', etiqueta: 'Sillas' }));
  assert.throws(() => objetos.seleccionar('desconocido'));
  objetos.retirar('silla-001'); assert.equal(objetos.obtener('silla-001'), null);
});

test('silla se apoya en Y=0 y cada fábrica produce una raíz independiente', () => {
  const silla = crearSilla(); silla.updateMatrixWorld(true);
  // Excluir casco de contorno para medir la geometría física.
  const box = new T.Box3();
  for (const pieza of silla.children) {
    pieza.geometry.computeBoundingBox();
    box.union(pieza.geometry.boundingBox.clone().applyMatrix4(pieza.matrixWorld));
  }
  assert.ok(Math.abs(box.min.y) < 1e-8);
  assert.ok(Math.abs(box.max.y - 0.9) < 1e-8);
  assert.notEqual(silla, crearSilla());
});

