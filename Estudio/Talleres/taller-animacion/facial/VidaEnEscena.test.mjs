import test from 'node:test';
import assert from 'node:assert/strict';
import {vidaPorDefecto,problemaVida,problemaCambio,fusionar,aplicarAjuste,leerAjuste,PARTES} from './VidaEnEscena.mjs';

test('ajuste base y cambio por momento: validación (espejo de features/story-studio/actor-life.ts)',()=>{
  const v=vidaPorDefecto();assert.equal(problemaVida(v),null);
  assert.ok(problemaVida({...v,animo:'eufórica'}));
  assert.ok(problemaVida({...v,energia:2}));
  assert.ok(problemaVida({...v,extra:1}));
  assert.ok(problemaVida({...v,mirada:{modo:'actor'}}),'mirar a un personaje necesita su id');
  assert.ok(problemaVida({...v,mirada:{modo:'actor',actorId:'b'}},new Set(['a'])),'el personaje debe estar en la escena');
  assert.equal(problemaVida({...v,mirada:{modo:'actor',actorId:'a'}},new Set(['a'])),null);
  assert.equal(problemaCambio({animo:'nerviosa'}),null);
  assert.ok(problemaCambio({}));assert.ok(problemaCambio({activo:{}}));
});

test('base + cambio: el momento cambia ánimo, energía o mirada y conserva el resto',()=>{
  const base={...vidaPorDefecto(),animo:'contenta',energia:.8};
  const out=fusionar(base,{animo:'nerviosa',mirada:{modo:'camara'}});
  assert.equal(out.animo,'nerviosa');assert.equal(out.energia,.8);assert.deepEqual(out.mirada,{modo:'camara'});
  assert.equal(base.animo,'contenta','no modifica la base');
  assert.equal(fusionar(undefined,{energia:.2}).energia,.2);
});

test('aplicar y leer un ajuste sobre un LifeCharacter (doble mínimo)',()=>{
  const vida={animo:'tranquila',energia:.5,intensidad:1,activo:Object.fromEntries([...PARTES,'habla'].map(k=>[k,true])),modoMirada:'cursor',objeto:null,mirarA(o){this.modoMirada='objeto';this.objeto=o;},mir:{prox:3}};
  const head={isObject3D:true};
  aplicarAjuste(vida,{...vidaPorDefecto(),animo:'triste',energia:.2,mirada:{modo:'actor',actorId:'b'},activo:{...vidaPorDefecto().activo,gestos:false}},{objetivo:id=>id==='b'?head:null});
  assert.equal(vida.animo,'triste');assert.equal(vida.objeto,head);assert.equal(vida.activo.gestos,false);assert.equal(vida.activo.habla,true,'habla no es de la vida en reposo');
  aplicarAjuste(vida,{...vidaPorDefecto(),mirada:{modo:'actor',actorId:'zz'}});assert.equal(vida.modoMirada,'deambular','sin el otro personaje, deambula');
  const leido=leerAjuste(vida,{modo:'camara'});assert.equal(problemaVida(leido),null);assert.deepEqual(leido.mirada,{modo:'camara'});
});
