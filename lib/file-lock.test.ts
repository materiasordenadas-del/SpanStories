import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, utimes, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {withFileLock} from './file-lock.ts';

test('withFileLock: runs, releases and reports busy while held', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lock-'));
  try {
    let inner: unknown;
    const outer = await withFileLock(dir, async () => { inner = await withFileLock(dir, async () => 'nested'); return 'ok'; });
    assert.equal(outer, 'ok');
    assert.equal(inner, 'busy');
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('withFileLock: a stale lock left by a dead process is recovered', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lock-'));
  try {
    const lock = path.join(dir, 'guardando.lock');
    await writeFile(lock, '');
    const old = new Date(Date.now() - 120000); await utimes(lock, old, old);
    assert.equal(await withFileLock(dir, async () => 'saved'), 'saved');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('withFileLock: create:false does not resurrect a missing folder', async () => {
  const dir = path.join(tmpdir(), 'lock-missing-' + Date.now());
  assert.equal(await withFileLock(dir, async () => 'x', {create: false}), 'missing');
  await assert.rejects(readdir(dir));
});
