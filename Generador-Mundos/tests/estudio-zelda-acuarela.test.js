import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Pipeline,MODES} from '../src/estudio/render/pipeline.js';
import {CHARACTERS,CHARACTER_SURF} from '../src/estudio/render/characters.js';

test('Zelda watercolour pass is only active in Zelda and can be switched off',()=>{
  const p=new Pipeline(null);
  assert.equal(p.params.paint,1);
  assert.match(p.paint.fragmentShader,/Kuwahara|Cuatro cuadrantes/);
  // Nine taps per pixel: the pass must stay cheap.
  assert.equal((p.paint.fragmentShader.match(/texture2D\(tColor/g)??[]).length,1);
  assert.ok(MODES.zelda===6&&MODES.ghibli===7);
});

test('Zelda composite shades characters (surface 25) and keeps the 0.14.2 formula for Ghibli-transferred parts',()=>{
  const p=new Pipeline(null),shader=p.composite.fragmentShader;
  assert.equal(CHARACTER_SURF,25);
  assert.match(shader,/person=surf==25\.0/);
  assert.match(shader,/void zCharacter\(/);
  assert.match(shader,/else if\(uMode==7\)\{\s*\/\/ Árboles y césped transferidos a Ghibli/);
});

test('style-preview characters are self-contained GLB files in public/',()=>{
  for(const spec of CHARACTERS){
    const bytes=readFileSync(fileURLToPath(new URL('../public'+spec.url,import.meta.url)));
    assert.equal(bytes.readUInt32LE(0),0x46546c67,spec.id+' no es GLB');
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    assert.ok(json.images?.length&&json.images.every(i=>!i.uri),spec.id+' debe incluir su textura');
    if(spec.clip)assert.ok(json.animations.some(a=>a.name===spec.clip),spec.id+' sin clip '+spec.clip);
    assert.ok(spec.height>1.4&&spec.height<2);
  }
});
