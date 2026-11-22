import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { crearRespaldo, claveValida, nombreArchivo } from '../herramientas/respaldo-navegador.mjs';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'respaldo-')), 'r');

test('solo acepta claves del Taller', () => {
  assert.ok(claveValida('spanstories.facial-project.v1:rachel'));
  assert.ok(claveValida('spanstories.facial-draft.v1:abc'));
  assert.ok(claveValida('taller:ajustes'));
  for (const k of ['', 'taller:', 'otra', '../x', 'spanstories.learner-events.v1', null, 5, 'spanstories.facial-project.v1']) assert.equal(claveValida(k), false, String(k));
});

test('el nombre de archivo es seguro y distinto por clave', () => {
  const a = nombreArchivo('spanstories.facial-project.v1:a/b'), b = nombreArchivo('spanstories.facial-project.v1:a_b');
  assert.notEqual(a, b);
  assert.match(a, /^[\w.-]+\.json$/);
});

test('guarda, relee, no reescribe sin cambios y conserva la versión anterior', () => {
  const dir = tmp(), r = crearRespaldo(dir), k = 'spanstories.facial-project.v1:rachel';
  assert.equal(r.escribir(k, '{"a":1}', 10), true);
  assert.equal(r.escribir(k, '{"a":1}', 20), false);
  assert.equal(r.escribir(k, '{"a":2}', 30), true);
  assert.deepEqual(r.leerTodo(), [{ clave: k, valor: '{"a":2}', fecha: 30 }]);
  const ant = fs.readdirSync(dir).filter((f) => f.endsWith('.anterior.json'));
  assert.equal(ant.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, ant[0]), 'utf8')).valor, '{"a":1}');
  assert.equal(fs.readdirSync(dir).some((f) => f.includes('.tmp-')), false);
});

test('rechaza claves/valores inválidos y lotes enormes sin tocar el disco', () => {
  const dir = tmp(), r = crearRespaldo(dir);
  assert.throws(() => r.escribir('../../evil', 'x'), /clave/);
  assert.throws(() => r.escribir('taller:x', 5), /valor/);
  assert.throws(() => r.guardarLote(new Array(401).fill({})), /lote/);
  assert.equal(fs.existsSync(dir), false);
});

test('un archivo dañado se ignora y no se toca', () => {
  const dir = tmp(), r = crearRespaldo(dir);
  r.escribir('taller:ok', '1');
  fs.writeFileSync(path.join(dir, 'roto.json'), '{no json');
  assert.equal(r.leerTodo().length, 1);
  assert.equal(fs.readFileSync(path.join(dir, 'roto.json'), 'utf8'), '{no json');
});
