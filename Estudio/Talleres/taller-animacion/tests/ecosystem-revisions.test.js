import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { ecosystemMiddleware } from '../herramientas/ecosystem.mjs';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taller-eco-'));
  const middleware = ecosystemMiddleware(root);
  const call = (method, urlPath, body) => new Promise((resolve, reject) => {
    const chunks = [];
    const res = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } });
    res.headers = {}; res.statusCode = 200; res.setHeader = (key, value) => { res.headers[key] = value; };
    res.on('finish', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { url: urlPath, method, headers: {} });
    middleware(req, res, () => reject(new Error('next'))).catch(reject);
  });
  return { root, call, library: path.join(root, 'biblioteca/comportamientos') };
}
const asset = (extra = {}) => ({ schema: 'spanstories.behavior', version: 1, name: 'Saludar', characterId: 'rachel', duration: 1, animation: { duration: 1, tracks: [{ name: 'hips.position', type: 'vector', times: [0, 1], values: [0, 0, 0, 0, 1, 0] }] }, recipe: { marca: 'v0' }, ...extra });

test('al reemplazar una actuación de historia se archiva la revisión anterior y se puede pedir por número', async (t) => {
  const { root, call, library } = setup();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owner = 'historia:rachel:escena:actor:mom';
  const first = JSON.parse((await call('POST', '/ecosystem/library', asset({ owner }))).text);
  assert.equal(first.revision, 0);
  const second = JSON.parse((await call('POST', '/ecosystem/library', asset({ owner, replace: first.id, recipe: { marca: 'v1' } }))).text);
  assert.equal(second.id, first.id);
  assert.equal(second.revision, 1);
  assert.ok(fs.existsSync(path.join(library, '_revisiones', `${first.id}.r0.json`)));
  const recipe = async (query) => { const r = await call('GET', `/ecosystem/assets/${first.id}.json${query}`); return { status: r.status, body: JSON.parse(r.text) }; };
  assert.equal((await recipe('')).body.recipe.marca, 'v1');
  assert.equal((await recipe('?revision=1')).body.recipe.marca, 'v1');
  assert.equal((await recipe('?revision=0')).body.recipe.marca, 'v0');
  const missing = await recipe('?revision=9');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.headRevision, 1);
  assert.equal((await recipe('?revision=x')).status, 400);
  // El archivo archivado no aparece en el listado de la biblioteca.
  const list = JSON.parse((await call('GET', '/ecosystem/library')).text).items;
  assert.equal(list.length, 1);
  // Una revisión archivada no se sobrescribe al volver a reemplazar.
  await call('POST', '/ecosystem/library', asset({ owner, replace: first.id, recipe: { marca: 'v2' } }));
  assert.equal((await recipe('?revision=0')).body.recipe.marca, 'v0');
  assert.equal((await recipe('?revision=1')).body.recipe.marca, 'v1');
});

test('la clave de dueño sin cue sigue valiendo cuando el cue ya existe (alias) y no duplica', async (t) => {
  const { root, call, library } = setup();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const withoutCue = 'historia:rachel:escena:actor:momento', withCue = withoutCue.replace(':momento', ':cue-1');
  const first = JSON.parse((await call('POST', '/ecosystem/library', asset({ owner: withoutCue }))).text);
  // Sin alias, el nuevo dueño no coincide: se crea una copia propia (el comportamiento que se corrige).
  const copy = JSON.parse((await call('POST', '/ecosystem/library', asset({ owner: withCue, replace: first.id }))).text);
  assert.notEqual(copy.id, first.id);
  // Con alias, se reemplaza en su sitio y el dueño pasa a la clave canónica.
  const same = JSON.parse((await call('POST', '/ecosystem/library', asset({ owner: withCue, ownerAlias: withoutCue, replace: first.id }))).text);
  assert.equal(same.id, first.id);
  assert.equal(same.revision, 1);
  const stored = JSON.parse(fs.readFileSync(path.join(library, `${first.id}.json`), 'utf8'));
  assert.equal(stored.owner, withCue);
  assert.equal('ownerAlias' in stored, false);
  // Un alias ajeno no permite reemplazar la actuación de otro cue.
  const other = JSON.parse((await call('POST', '/ecosystem/library', asset({ owner: withCue + 'x', ownerAlias: 'otra:clave', replace: first.id }))).text);
  assert.notEqual(other.id, first.id);
});
