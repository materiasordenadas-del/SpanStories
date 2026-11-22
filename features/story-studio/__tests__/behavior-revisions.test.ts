import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm, writeFile, readdir, utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newHistoria} from '../historia.ts';
import {pruneBehaviorRevisions, referencedRevisions} from '../behavior-revisions.ts';

const id = '12345678-1234-1234-1234-123456789abc';
const ref = (revision: number) => ({id, name: 'Saludar', characterId: 'rachel', duration: 1, review: {status: 'unreviewed' as const}, revision, url: `http://127.0.0.1:5189/ecosystem/assets/${id}.json`});

function historiaWith(revision: number, name: string) {
  const h = newHistoria({name, plantilla: 'vacia', zoneId: 'aeropuerto-entrada', id: name + '-abcd'});
  const scene = h.project.scenes[0];
  scene.actors.push({id: 'a1', characterId: 'rachel', name: 'Rachel', position: [0, 0, 0], rotation: 0, height: 1.7});
  scene.sequences[0].cues.push({id: 'c1', kind: 'actor', actorId: 'a1', at: 0, duration: 1, action: 'idle', behavior: ref(revision)});
  return h;
}

test('revisiones archivadas: se conservan las que usa una historia (guardada, copia, autoguardado o papelera) y se limpian las huérfanas viejas', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spanstories-revisiones-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const historias = path.join(dir, 'Estudio/Historias'), library = path.join(dir, 'biblioteca'), folder = path.join(library, '_revisiones');
  await mkdir(folder, {recursive: true});
  const save = async (where: string[], file: string, revision: number, name: string) => { const d = path.join(historias, ...where); await mkdir(d, {recursive: true}); await writeFile(path.join(d, file), JSON.stringify(historiaWith(revision, name))); };
  await save(['uno'], 'historia.json', 4, 'uno');
  await save(['uno'], 'historia.json1', 3, 'uno');
  await save(['uno'], 'autoguardado.json', 5, 'uno');
  await save(['_papelera', 'vieja-2026'], 'historia.json', 1, 'vieja');
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  for (const n of [0, 1, 2, 3, 4, 5, 6]) { const f = path.join(folder, `${id}.r${n}.json`); await writeFile(f, '{}'); await utimes(f, old, old); }
  // r6 es huérfana pero acaba de archivarse: entra en el margen.
  await utimes(path.join(folder, `${id}.r6.json`), new Date(), new Date());

  assert.deepEqual([...(await referencedRevisions(historias))!].sort(), [1, 3, 4, 5].map(n => `${id}.r${n}`).sort());
  const result = await pruneBehaviorRevisions({historiasRoot: historias, library});
  assert.deepEqual(result.deleted.sort(), [`${id}.r0.json`, `${id}.r2.json`]);
  assert.deepEqual((await readdir(folder)).sort(), [1, 3, 4, 5, 6].map(n => `${id}.r${n}.json`));
});

test('revisiones archivadas: ante un archivo de historia ilegible no se borra nada', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spanstories-revisiones-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const historias = path.join(dir, 'Estudio/Historias'), library = path.join(dir, 'biblioteca'), folder = path.join(library, '_revisiones');
  await mkdir(path.join(historias, 'rota'), {recursive: true}); await mkdir(folder, {recursive: true});
  await writeFile(path.join(historias, 'rota', 'historia.json'), '{no es json');
  const f = path.join(folder, `${id}.r0.json`); await writeFile(f, '{}'); const old = new Date(Date.now() - 10 * 24 * 3600 * 1000); await utimes(f, old, old);
  const result = await pruneBehaviorRevisions({historiasRoot: historias, library});
  assert.equal(result.skipped, true);
  assert.deepEqual(await readdir(folder), [`${id}.r0.json`]);
});
