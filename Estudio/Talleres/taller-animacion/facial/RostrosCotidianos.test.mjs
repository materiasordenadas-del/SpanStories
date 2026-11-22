import test from 'node:test';
import assert from 'node:assert/strict';
import {DAILY_ACTINGS} from './ActuacionesCotidianas.mjs';
import {ROSTROS,rostroEnBucle,presetRostroCotidiano,proyectoRostroCotidiano,momentosDeCabeza} from './RostrosCotidianos.mjs';
import {validatePreset,validateProject,evaluate,curve} from './FacialCore.mjs';

const DURACIONES=[2.2,5.3,11.7,24];

test('una ficha de rostro con intención por cada actuación cotidiana (51–100)',()=>{
  assert.equal(ROSTROS.length,50);
  assert.deepEqual(ROSTROS.map(r=>r.id),DAILY_ACTINGS.map(a=>a.id));
  for(const r of ROSTROS)assert.ok(r.intencion.length>10&&r.base&&r.beats?.length,r.id);
});

test('las 50 caras validan como bucle sin salto en cualquier largo de clip',()=>{
  for(const a of DAILY_ACTINGS)for(const D of DURACIONES){
    const p=presetRostroCotidiano(a,D,{eventos:[D*.2,D*.6]});
    validatePreset(p);
    for(const [n,k] of Object.entries(p.channels))assert.equal(k[0][1],k.at(-1)[1],`${a.id} ${n} @${D}`);
    validateProject(proyectoRostroCotidiano(a,D));
  }
});

test('parpadeos: nunca metrónomo, sin huecos largos y en los giros de cabeza',()=>{
  for(const a of DAILY_ACTINGS){
    const D=12,{blinks}=rostroEnBucle(a.id,D,{eventos:[3.1,7.4]});
    assert.ok(blinks.length>=2,a.id);
    const gaps=blinks.slice(1).map((t,i)=>t-blinks[i]);
    if(gaps.length>2)assert.ok(Math.max(...gaps)-Math.min(...gaps)>.3,`${a.id}: intervalos iguales`);
    assert.ok(gaps.every(g=>g<7.5),a.id);
    assert.ok(blinks.some(t=>Math.abs(t-3.1)<.05),`${a.id}: sin parpadeo en el giro de cabeza`);
  }
});

test('el parpadeo cierra rápido y abre lento, y llega a cerrar',()=>{
  const D=12,{channels,blinks}=rostroEnBucle('daily-1',D);
  const t=blinks[0],k=channels.eyeBlinkLeft;
  assert.ok(curve(k,t,'spline')>.95);
  assert.ok(curve(k,t-.06,'spline')<.5&&curve(k,t+.1,'spline')>.4,'asimetría cierre/apertura');
});

test('quien habla mueve la mandíbula; quien escucha, no',()=>{
  const D=10,peak=(id,n)=>Math.max(0,...(rostroEnBucle(id,D).channels[n]||[[0,0]]).map(k=>k[1]));
  assert.ok(peak('daily-2','jawOpen')>.15);
  assert.ok(peak('daily-6','jawOpen')<.05);
  assert.ok(peak('daily-11','browDownLeft')>.6,'discutir: ceño');
  assert.ok(peak('daily-36','cheekSquintLeft')>.6,'reír: mejillas');
});

test('la cara evaluada se queda en rango y sin saltos entre fotogramas a 60 fps',()=>{
  for(const a of DAILY_ACTINGS){
    const D=8,p=presetRostroCotidiano(a,D),i={...p.defaults,id:'x',presetId:p.id,start:0};let prev=null;
    for(let f=0;f<=D*60;f++){
      const w=evaluate([p],[i],Math.min(D-1e-3,f/60));
      for(const [n,v] of Object.entries(w)){assert.ok(v>=0&&v<=1);if(prev&&!n.startsWith('eye'))assert.ok(Math.abs(v-prev[n])<.2,`${a.id} ${n} salta en ${f}`);}
      prev=w;
    }
  }
});

test('momentosDeCabeza detecta el inicio de un giro',()=>{
  const n=120,t=new Float32Array(n),q=new Float32Array(n*4);
  for(let i=0;i<n;i++){t[i]=i/30;const ang=i<40?0:i<55?(i-40)/15*.8:.8;q[i*4+1]=Math.sin(ang/2);q[i*4+3]=Math.cos(ang/2);}
  const m=momentosDeCabeza(t,q);
  assert.equal(m.length,1);assert.ok(m[0]>1.2&&m[0]<1.6,String(m[0]));
});
