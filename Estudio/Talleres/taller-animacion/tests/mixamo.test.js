// Descargas de Mixamo: verificación, nombres únicos, sesión única y progreso por id.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mixamoApi } from '../herramientas/mixamo.mjs';

const ID1 = 'c9c72233-b96c-11e4-a802-0aaa78deedf9';
const ID2 = 'c9c69305-b96c-11e4-a802-0aaa78deedf9';
const fbxFalso = () => Buffer.concat([Buffer.from('Kaydara FBX Binary  \0', 'latin1'), Buffer.alloc(5000), Buffer.from('AnimationCurve', 'latin1')]);

function entorno() {
  // en D: (junto a las pruebas), nunca en C:
  const biblio = fs.mkdtempSync(path.join(import.meta.dirname, '.tmp-mixamo-'));
  test.after(() => fs.rmSync(biblio, { recursive: true, force: true }));
  const avisos = [];
  const api = mixamoApi({ biblio, avisar: (a) => avisos.push(a) });
  return { biblio, avisos, api, dir: path.join(biblio, 'mixamo') };
}

test('comprobarFbx rechaza lo que no es un FBX con animación', () => {
  const { api } = entorno();
  const { comprobarFbx } = api._probar;
  assert.equal(comprobarFbx(fbxFalso()), null);
  assert.match(comprobarFbx(Buffer.from('<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>'.padEnd(5000))), /error en vez del FBX/);
  assert.match(comprobarFbx(Buffer.alloc(100)), /pequeño/);
  assert.match(comprobarFbx(Buffer.concat([Buffer.from('Kaydara FBX Binary  \0', 'latin1'), Buffer.alloc(5000)])), /no contiene animación/);
});

test('nombres únicos, sesión única y progreso que sobrevive al disco', async () => {
  const { api, dir, avisos } = entorno();
  fs.writeFileSync(path.join(dir, 'Walk.fbx'), 'x');
  const r1 = await api.manejar('reservar', { sesion: 'a', id: ID1, nombre: 'Walk', descripcion: 'Walking forward' });
  assert.equal(r1.archivo, 'Walk - Walking forward');
  // el mismo id reservado dos veces da el mismo nombre (nunca dos archivos)
  assert.equal((await api.manejar('reservar', { sesion: 'a', id: ID1, nombre: 'Walk' })).archivo, r1.archivo);
  const r2 = await api.manejar('reservar', { sesion: 'a', id: ID2, nombre: 'Walk', descripcion: 'Walking forward' });
  assert.equal(r2.archivo, 'Walk (2)');
  await assert.rejects(api.manejar('reservar', { sesion: 'b', id: ID2, nombre: 'x' }), /otro descargador/);
  // origen de descarga no permitido: no se marca nada
  await assert.rejects(api.manejar('guardar', { sesion: 'a', id: ID1, url: 'https://example.com/a.fbx' }), /no permitido/);
  assert.equal((await api.manejar('estado')).nHechos, 0);

  // descarga simulada correcta
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(fbxFalso(), { status: 200 });
  try {
    const g = await api.manejar('guardar', { sesion: 'a', id: ID1, url: 'https://mixamo-storage-prod.s3-us-west-2.amazonaws.com/x.fbx', nombre: 'Walk' });
    assert.equal(g.archivo, 'Walk - Walking forward.fbx');
    assert.deepEqual(avisos, ['Walk - Walking forward.fbx']);
    // descarga que devuelve un error de S3: falla y NO se marca
    globalThis.fetch = async () => new Response('<Error>Expired</Error>', { status: 403 });
    await assert.rejects(api.manejar('guardar', { sesion: 'a', id: ID2, url: 'https://mixamo-storage-prod.s3-us-west-2.amazonaws.com/y.fbx' }), /HTTP 403/);
  } finally {
    globalThis.fetch = real;
  }
  let e = await api.manejar('estado');
  assert.deepEqual(Object.keys(e.hechos), [ID1]);
  assert.equal((await api.manejar('reservar', { sesion: 'a', id: ID1, nombre: 'Walk' })).hecho, true);
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.part')));

  // si el archivo se borra a mano, deja de contar y se volverá a bajar
  fs.rmSync(path.join(dir, 'Walk - Walking forward.fbx'));
  e = await api.manejar('estado');
  assert.equal(e.nHechos, 0);
});
