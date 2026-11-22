import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readdir, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newHistoria, copyHistoria, validateHistoria} from '../historia.ts';

test('historias: crear, autoguardar, guardar con copias, conflicto, audio y papelera', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spanstories-historias-')), cwd = process.cwd();
  process.chdir(dir);
  const {GET, POST, PUT} = await import('../../../app/api/historias/route.ts');
  process.chdir(cwd);
  const env = process.env.NODE_ENV; Object.assign(process.env, {NODE_ENV: 'development'});
  t.after(async () => { Object.assign(process.env, {NODE_ENV: env}); await rm(dir, {recursive: true, force: true}); });
  const url = 'http://localhost:3000/api/historias';
  const post = (body: unknown) => POST(new Request(url, {method: 'POST', headers: {'content-type': 'application/json', origin: 'http://localhost:3000'}, body: JSON.stringify(body)}));
  const get = async (q = '') => (await GET(new Request(url + q))).json();
  const folder = (id: string) => path.join(dir, 'Estudio/Historias', id);

  assert.deepEqual((await get()).historias, []);
  const h = newHistoria({name: 'Rachel llega', plantilla: 'vacia', zoneId: 'aeropuerto-entrada', id: 'rachel-llega-abcd'});
  validateHistoria(JSON.parse(JSON.stringify(h)));
  assert.equal((await post({accion: 'crear', historia: h})).status, 200);
  assert.equal((await post({accion: 'crear', historia: h})).status, 409);

  // Autoguardado: no toca el guardado, pero la lista lo marca como recuperable.
  const edited = structuredClone(h); edited.project.scenes[0].name = 'Llegada';
  assert.equal((await post({accion: 'autoguardar', historia: edited})).status, 200);
  let list = await get();
  assert.equal(list.historias.length, 1); assert.equal(list.historias[0].recuperable, true); assert.equal(list.ultima, 'rachel-llega-abcd');
  const opened = await get('?id=rachel-llega-abcd');
  assert.equal(opened.historia.project.scenes[0].name, 'Escena 1'); assert.equal(opened.autoguardado.project.scenes[0].name, 'Llegada');

  // Guardar: revisión +1, copia .json1, autoguardado eliminado; otra pestaña con revisión vieja recibe 409.
  const first = await post({accion: 'guardar', historia: edited, expectedRevision: 0}); assert.equal(first.status, 200);
  const saved = (await first.json()).historia; assert.equal(saved.revision, 1); assert.equal(saved.project.revision, 1);
  assert.equal((await post({accion: 'guardar', historia: edited, expectedRevision: 0})).status, 409);
  const files = await readdir(folder('rachel-llega-abcd'));
  assert.ok(files.includes('historia.json1')); assert.ok(!files.includes('autoguardado.json'));
  assert.equal((await get('?id=rachel-llega-abcd&copia=1')).historia.revision, 0);
  list = await get(); assert.equal(list.historias[0].recuperable, false);

  // Audio: verificado por sha256 y copiado al duplicar.
  const bytes = Buffer.from('audio de prueba'), sha = createHash('sha256').update(bytes).digest('hex');
  const put = (s: string) => PUT(new Request(`${url}?id=rachel-llega-abcd&sha=${s}`, {method: 'PUT', headers: {origin: 'http://localhost:3000', 'x-audio-meta': encodeURIComponent(JSON.stringify({name: 'Hola', kind: 'voice', mimeType: 'audio/webm', duration: 1}))}, body: bytes}));
  assert.equal((await put('0'.repeat(64))).status, 400);
  assert.equal((await put(sha)).status, 200);
  assert.equal((await get('?id=rachel-llega-abcd&audios=1')).audio[0].id, sha);
  const copy = await (await post({accion: 'duplicar', id: 'rachel-llega-abcd'})).json();
  assert.equal(copy.historia.revision, 0);
  assert.deepEqual(await readFile(path.join(folder(copy.historia.id), 'audio', sha + '.bin')), bytes);

  // Renombrar, rechazar ids con rutas, y eliminar a la papelera sin borrar.
  assert.equal((await post({accion: 'renombrar', id: 'rachel-llega-abcd', name: 'Rachel en Madrid'})).status, 200);
  assert.equal((await get('?id=rachel-llega-abcd')).historia.name, 'Rachel en Madrid');
  assert.equal((await post({accion: 'eliminar', id: '../fuera'})).status, 400);
  assert.equal((await post({accion: 'eliminar', id: 'rachel-llega-abcd'})).status, 200);
  assert.equal((await readdir(path.join(dir, 'Estudio/Historias/_papelera'))).length, 1);
  assert.deepEqual((await get()).historias.map((x: {id: string}) => x.id), [copy.historia.id]);

  // Guardar como: otra identidad, mismo contenido.
  const other = copyHistoria(saved, 'Otra');
  assert.notEqual(other.id, saved.id); assert.equal(other.project.id, `historia-${other.id}`);
});

test('plantillas de historia nuevas son válidas y empiezan en su escenario', () => {
  for (const plantilla of ['vacia', 'barcelona', 'aeropuerto'] as const) {
    const h = newHistoria({name: 'Prueba ' + plantilla, plantilla, zoneId: 'aeropuerto-entrada'});
    validateHistoria(JSON.parse(JSON.stringify(h)));
    assert.equal(h.project.scenes[0].zoneId, 'aeropuerto-entrada');
  }
});

test('una historia vacía nueva no carga ningún escenario predeterminado', () => {
  const h = newHistoria({name: 'Sin lugar', plantilla: 'vacia'});
  assert.equal(h.project.scenes[0].zoneId, '');
  validateHistoria(JSON.parse(JSON.stringify(h)));
});
