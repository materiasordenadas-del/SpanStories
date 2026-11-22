import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {storeImportedCharacter,readImportedCharacters,validateCharacterGLB} from '../imported-characters.ts';

function sample(){
  const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],animations:[{name:'Idle',channels:[],samplers:[]}]}));
  const padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
  const bytes=Buffer.alloc(20+padded.length);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);padded.copy(bytes,20);return bytes;
}
test('los personajes importados persisten sus bytes y animaciones, tienen identidad estable y no duplican biblioteca',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'spanstories-characters-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bytes=sample();assert.equal(validateCharacterGLB(bytes).animations[0].name,'Idle');
  const first=await storeImportedCharacter(bytes,'../Mi personaje.glb',dir);
  assert.equal(first.label,'Mi personaje');assert.match(first.id,/^importado-[a-f0-9]{64}$/);
  assert.equal(first.materialesPropios,true);assert.deepEqual(await readFile(path.join(dir,first.sha256+'.glb')),bytes);
  const again=await storeImportedCharacter(bytes,'otro-nombre.glb',dir);assert.equal(again.id,first.id);assert.equal((await readImportedCharacters(dir)).length,1);
  await assert.rejects(()=>storeImportedCharacter(bytes,'otro.fbx',dir),/\.glb/);
  assert.throws(()=>validateCharacterGLB(Buffer.from('incorrecto')),/GLB/);
  assert.equal((await readImportedCharacters(dir)).length,1);
});
