import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTACIONES, CLIMAS, combinarAmbiente, normalizar, cantidadParticulas, SistemaParticulas, destelloRayo, PARTICULAS } from '../engine/EstacionesClima.js';

test('normaliza claves desconocidas al valor por defecto',()=>{
  assert.deepEqual(normalizar({estacion:'otono',clima:'nieve'}),{estacion:'otono',clima:'nieve'});
  assert.deepEqual(normalizar({estacion:'x',clima:'y'}),{estacion:'primavera',clima:'despejado'});
});

test('toda combinación produce un filtro válido y grupos de partículas sin repetir',()=>{
  for(const e of Object.keys(ESTACIONES))for(const c of Object.keys(CLIMAS)){
    const r=combinarAmbiente(e,c);
    assert.match(r.filtro,/^saturate\([\d.]+\) brightness\([\d.]+\) contrast\([\d.]+\) sepia\([\d.]+\) hue-rotate\(-?[\d.]+deg\)$/);
    const tipos=r.particulas.map(p=>p.tipo);
    assert.equal(new Set(tipos).size,tipos.length,e+'/'+c);
    for(const t of tipos)assert.ok(PARTICULAS[t],t);
  }
});

test('el clima decide ambiente, rayos y niebla; la estación sus partículas',()=>{
  assert.equal(combinarAmbiente('verano','despejado').ambiente,null);
  assert.equal(combinarAmbiente('verano','lluvia').ambiente,'nublado');
  assert.equal(combinarAmbiente('verano','tormenta').rayos,true);
  assert.ok(combinarAmbiente('verano','niebla').niebla>0);
  assert.deepEqual(combinarAmbiente('otono','despejado').particulas.map(p=>p.tipo),['hojas']);
  assert.deepEqual(combinarAmbiente('otono','lluvia').particulas.map(p=>p.tipo),['lluvia']);
  assert.deepEqual(combinarAmbiente('primavera','viento').particulas.map(p=>p.tipo),['petalos']);
  assert.deepEqual(combinarAmbiente('invierno','viento').particulas.map(p=>p.tipo),['nieve']);
  const otono=combinarAmbiente('otono','viento').particulas;assert.equal(otono.length,1);assert.ok(otono[0].densidad>1);
});

test('la cantidad escala con el área, respeta el tope y se reduce con menos movimiento',()=>{
  const base=cantidadParticulas('lluvia',1,1280,720);
  assert.equal(base,PARTICULAS.lluvia.base);
  assert.equal(cantidadParticulas('lluvia',1,640,360),Math.round(base/4));
  assert.equal(cantidadParticulas('lluvia',5,3840,2160),PARTICULAS.lluvia.tope);
  assert.ok(cantidadParticulas('nieve',1,1280,720,true)<cantidadParticulas('nieve',1,1280,720));
});

test('las partículas caen y se reciclan dentro del lienzo',()=>{
  let semilla=1;const azar=()=>(semilla=(semilla*16807)%2147483647)/2147483647;
  const s=new SistemaParticulas({azar});
  s.configurar([{tipo:'nieve',densidad:1},{tipo:'hojas',densidad:1}],800,600,{viento:.5});
  const n=s.total;assert.ok(n>0);
  const y0=s.grupos[0].items[0].y;s.update(.016,0);assert.ok(s.grupos[0].items[0].y>y0||s.grupos[0].items[0].y<0);
  for(let i=0;i<600;i++)s.update(.05,i*.05);
  assert.equal(s.total,n);
  for(const g of s.grupos)for(const p of g.items){assert.ok(p.y<=630);assert.ok(p.x>=-140&&p.x<=920);}
  s.configurar([],800,600);assert.equal(s.total,0);
});

test('el rayo tiene dos destellos y se apaga',()=>{
  assert.ok(destelloRayo(.04)>.95);assert.ok(destelloRayo(.2)>.7);assert.ok(destelloRayo(.12)<.3);
  assert.equal(destelloRayo(-.1),0);assert.equal(destelloRayo(.5),0);
});
