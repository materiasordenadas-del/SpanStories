import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

function glb(extra=''){
  const json=Buffer.from('{"asset":{"version":"2.0"}'+extra+'}'),length=Math.ceil(json.length/4)*4,bytes=Buffer.alloc(20+length,32);
  bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);
  return bytes;
}

test('biblioteca: un GLB se registra una sola vez, admite favoritos y rechaza archivos no válidos',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'spanstories-lib-')),cwd=process.cwd();
  process.chdir(dir);
  const {GET,POST}=await import('../../../app/api/city-library/route.ts');
  process.chdir(cwd);
  const env=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'development'});
  t.after(async()=>{Object.assign(process.env,{NODE_ENV:env});await rm(dir,{recursive:true,force:true});});
  const post=(body:unknown)=>POST(new Request('http://localhost:3000/api/city-library',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  const lista=async()=>(await (await GET(new Request('http://localhost:3000/api/city-library'))).json());
  assert.deepEqual((await lista()).objetos,[]);

  const banco=glb().toString('base64');
  const a=await post({accion:'registrar',nombre:'Banco.glb',categoria:'mobiliario',glbBase64:banco,triangulos:2140,dimensiones:[1.6,.8,.5]});
  assert.equal(a.status,200);const primero=await a.json();assert.equal(primero.nuevo,true);assert.match(primero.entrada.sha,/^[a-f0-9]{64}$/);
  const b=await post({accion:'registrar',nombre:'Otro nombre',glbBase64:banco});
  const segundo=await b.json();assert.equal(segundo.nuevo,false,'el mismo archivo no se duplica');
  assert.equal((await lista()).objetos.length,1);
  assert.equal((await lista()).objetos[0].nombre,'Banco');

  const sha=primero.entrada.sha;
  assert.equal((await post({accion:'favorito',sha,valor:true})).status,200);
  assert.equal((await lista()).objetos[0].favorito,true);
  assert.equal((await post({accion:'categoria',sha,valor:'inventada'})).status,400);

  const descarga=await GET(new Request('http://localhost:3000/api/city-library?glb='+sha));
  assert.equal(descarga.status,200);assert.equal(Buffer.from(await descarga.arrayBuffer()).toString('base64'),banco);
  assert.equal((await GET(new Request('http://localhost:3000/api/city-library?glb=..%2fcatalogo'))).status,400);

  assert.equal((await post({accion:'registrar',nombre:'x',glbBase64:Buffer.from('no es un glb').toString('base64')})).status,400);
  const externo=glb(',"buffers":[{"uri":"http://ejemplo.com/a.bin","byteLength":1}]').toString('base64');
  assert.equal((await post({accion:'registrar',nombre:'x',glbBase64:externo})).status,400,'los recursos externos no se admiten');
  const archivos=await readdir(path.join(dir,'SpanStories-Ciudades/Mundo/Biblioteca'));
  assert.equal(archivos.filter(f=>f.endsWith('.glb')).length,1);
});
