import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { ZONAS } from '../engine/HotelWorld.js';
import { DIMENSIONS as D,TRANSITIONS as S,HOTEL_LAYOUT as H } from '../engine/dimensions.js';
import { conexiones,salidas,rutaEntre,cercaAcceso,cruzarAcceso,llegada,limitesZona,puntosEscalera,datosAcceso,interpolarCamino } from '../engine/Recorrido.js';
import { crearControlTransiciones } from '../engine/Transiciones.js';
import { crearPrimeraPersona } from '../engine/PrimeraPersona.js';
const mockObjects={obtener:id=>id.startsWith('fachada-puerta-')?{position:new T.Vector3(id.endsWith('salida')?6:0,0,2)}:null};
const pairs=conexiones(ZONAS,mockObjects);
const eye=(e,d,side=0)=>e.center.clone().addScaledVector(e.n,d).addScaledVector(new T.Vector3(-e.n.z,0,e.n.x),side).add(new T.Vector3(0,D.playerHeight,0));

test('recorrido: conexiones de ida y vuelta, sin puertas de habitaciones ocupadas',()=>{
  for(const p of pairs){for(const [a,b] of [[p.a,p.b],[p.b,p.a]])if(a.enabled!==false){assert.ok(salidas(a.zone,pairs).some(r=>r.id===p.id&&r.to.zone===b.zone));assert.ok(a.width>2*D.playerRadius);}}
  assert.equal(pairs.filter(p=>p.id==='suite').length,1);
  assert.ok(!salidas('pasillo',pairs).some(r=>r.from.door==='puerta-202'));
  assert.ok(rutaEntre('circulacion','conserjeria',pairs),'vistas del mismo lobby comparten salidas');
});
test('fachada: el lobby puede iniciar la salida antes de cargar el edificio y exige resolver la llegada',()=>{
  const unloaded=conexiones(ZONAS,{obtener:()=>null});const route=rutaEntre('lobby','fachada',unloaded);
  assert.ok(route);assert.ok(route.to.unresolved);assert.throws(()=>llegada(route),/cargado/);
  const loaded=rutaEntre('lobby','fachada',pairs);assert.ok(!loaded.to.unresolved);assert.ok(llegada(loaded).position.z>loaded.to.center.z);
});
test('cruce: requiere salir, pasar por el vano y estar en su planta; no basta acercarse',()=>{
  for(const p of pairs)for(const e of [p.a,p.b]){
    const before=eye(e,-.7),after=eye(e,-.3);
    assert.ok(cruzarAcceso(e,before,after),p.id+' cruza');
    assert.equal(cruzarAcceso(e,after,before),null,'entrada inversa no dispara');
    assert.equal(cruzarAcceso(e,before,eye(e,-.6)),null,'acercarse no cruza');
    assert.equal(cruzarAcceso(e,eye(e,-.7,e.width),eye(e,-.3,e.width)),null,'muro fuera del vano');
    assert.equal(cruzarAcceso(e,before.clone().add(new T.Vector3(0,4.2,0)),after.clone().add(new T.Vector3(0,4.2,0))),null,'planta equivocada');
    assert.ok(cercaAcceso(e,before));assert.equal(cercaAcceso(e,eye(e,.2)),false);
  }
});
test('llegadas: 0,8 m al interior, altura correcta, orientación y desplazamiento lateral acotados',()=>{
  for(const p of pairs)for(const [from,to] of [[p.a,p.b],[p.b,p.a]]){
    const route={from,to},view=llegada(route,{lateral:10,direction:from.n.clone()});
    const a=datosAcceso(to,view.position);assert.ok(Math.abs(a.distance+S.arrivalOffset)<1e-6);assert.equal(view.position.y,to.floor+D.playerHeight);
    assert.ok(Math.abs(a.lateral)<=Math.min(from.width,to.width)/2-D.playerRadius+1e-6);
    assert.ok(view.target.clone().sub(view.position).dot(to.n)<0,'mira hacia dentro');
    assert.equal(cruzarAcceso(to,view.position,view.position.clone()),null,'no rebota al llegar');
    const extreme=llegada(route,{direction:from.n.clone().negate()}),look=extreme.target.clone().sub(extreme.position).normalize();assert.ok(look.dot(to.n.clone().negate())>=Math.cos(S.angleLimit)-1e-6);
  }
});
test('terraza: vuelve al restaurante original o al buffet según la variante usada',()=>{
  for(const variant of ['restaurante','buffet']){const exits=salidas('terraza',conexiones(ZONAS,mockObjects,variant));assert.ok(exits.some(r=>r.to.zone===variant));assert.ok(!exits.some(r=>r.to.zone===(variant==='buffet'?'restaurante':'buffet')));assert.ok(exits.some(r=>r.to.zone==='bar'));}
});
test('balcón: unión de suelos sin ampliar las zonas ajenas ni permitir salir por los lados',()=>{
  const b=H.balcony,bounds=limitesZona('habitacion',ZONAS),point=(x,z)=>new T.Vector3(x,D.playerHeight,z);
  assert.ok(bounds.contains(point(b.doorX-b.doorWidth/4,b.backZ)));
  assert.ok(bounds.contains(point(b.doorX,b.backZ-b.depth/2)));
  assert.ok(!bounds.contains(point(-5,b.backZ-.1)));
  assert.ok(!bounds.contains(point(b.doorX,b.backZ-b.depth-.1)));
  assert.ok(!bounds.contains(point(b.doorX+b.width/2+.1,b.backZ-b.depth/2)));
});
test('escalera: secuencia de peldaños real, ida y vuelta y desembarcos de PB/P1',()=>{
  const up=puntosEscalera(),down=puntosEscalera(false);assert.deepEqual(down,up.toReversed());
  assert.equal(up[0].y,D.playerHeight);assert.equal(up.at(-1).y,D.floorHeight+D.playerHeight);
  for(let i=1;i<up.length-1;i++){assert.ok(Math.abs(up[i].y-D.playerHeight-i*D.stairRise)<1e-6);assert.ok(up[i].z<up[i-1].z);}
  const limits=limitesZona('galeria',ZONAS);assert.ok(up.at(-1).x>limits.x[0]&&up.at(-1).x<limits.x[1]);assert.ok(up.at(-1).z>limits.z[0]&&up.at(-1).z<limits.z[1]);
});
test('movimiento: detecta el acceso antes del límite del suelo y mantiene el origen durante el cambio',()=>{
  const camera=new T.PerspectiveCamera(),target=new T.Vector3(0,D.playerHeight,5),root=new T.Group();camera.position.set(0,D.playerHeight,.5);camera.lookAt(target);
  const walker=crearPrimeraPersona(camera,target);walker.sincronizar();const e={center:new T.Vector3(0,0,1),n:new T.Vector3(0,0,1),width:2,floor:0};let crossed=false;
  walker.mover(1,0,.1,root,{x:[-1,1],z:[-1,1]},{beforeStep:(before,after)=>{crossed=!!cruzarAcceso(e,before,after);return crossed;}});
  assert.ok(crossed);assert.equal(camera.position.z,.5);
});
test('animación: admite un primer fotograma anterior al inicio y acota el final del recorrido',()=>{
  const points=puntosEscalera();assert.deepEqual(interpolarCamino(points,-.01),points[0]);assert.deepEqual(interpolarCamino(points,1.1),points.at(-1));assert.ok(interpolarCamino(points,.5).y>D.playerHeight);assert.throws(()=>interpolarCamino([],0));
});
test('control común: ignora clics simultáneos, espera y recupera el estado tras un fallo',async()=>{
  let release,state='origen',locked=false,errors=0;const wait=new Promise(resolve=>release=resolve);
  const control=crearControlTransiciones({capture:()=>state,restore:s=>state=s,lock:()=>locked=true,unlock:()=>locked=false,onError:()=>errors++});
  const first=control.ejecutar(async()=>{await wait;state='destino';});assert.ok(control.ocupada&&locked);
  assert.equal(await control.ejecutar(async()=>state='incorrecto'),false);release();assert.equal(await first,true);assert.equal(state,'destino');assert.ok(!control.ocupada&&!locked);
  assert.equal(await control.ejecutar(async()=>{state='parcial';throw new Error('fallo de carga');}),false);assert.equal(state,'destino');assert.equal(errors,1);assert.ok(!control.ocupada&&!locked);
  assert.equal(await control.ejecutar(async()=>state='recuperado'),true);assert.equal(state,'recuperado');
});
