import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { crearMuroFrontal } from '../engine/Cerramiento.js';
import { crearPrimeraPersona } from '../engine/PrimeraPersona.js';
import { FRONT_OPENINGS,DIMENSIONS as D } from '../engine/dimensions.js';
import { box,near } from '../engine/layout.js';

test('muros frontales: cierran el límite, mantienen altura y dejan abiertos los accesos',()=>{
  for(const [id,tam,alto] of [['lobby',[48,28],8.4],['conserjeria',[20,16],4.6],['restaurante',[30,26],5.5],['buffet',[30,26],5.5],['bar',[26,22],5],['habitacion',[14,12],3.4],['bar',[30,24],5.5]]){
    const wall=crearMuroFrontal(id,{tam,alto}),b=box(wall);
    assert.ok(near(b.min.x,-tam[0]/2)&&near(b.max.x,tam[0]/2));
    assert.ok(near(b.min.y,0)&&near(b.max.y,alto));assert.ok(near((b.min.z+b.max.z)/2,tam[1]/2));
    wall.updateMatrixWorld(true);
    for(const opening of wall.userData.huecos){const ray=new T.Raycaster(new T.Vector3(opening.x,D.playerHeight,tam[1]/2+2),new T.Vector3(0,0,-1));assert.equal(ray.intersectObject(wall,true).length,0,id+' acceso libre');}
  }
  assert.equal(crearMuroFrontal('terraza',{tam:[32,24],alto:4.6}),null);
});

test('primera persona: mirar conserva posición, caminar respeta paredes y atraviesa vanos',()=>{
  const camera=new T.PerspectiveCamera(),target=new T.Vector3(0,D.playerHeight,0);
  camera.position.set(0,D.playerHeight,2);camera.lookAt(target);
  const walker=crearPrimeraPersona(camera,target);walker.sincronizar();
  const before=camera.position.clone();walker.mirar(120,40);assert.ok(camera.position.equals(before));
  camera.lookAt(0,D.playerHeight,0);walker.sincronizar();
  const root=new T.Group(),wall=crearMuroFrontal('lobby',{tam:[48,4],alto:8.4});wall.position.z=0;wall.userData.tipo='muro';root.add(wall);
  const bounds={x:[-24,24],z:[-5,5]};
  camera.position.x=5;
  for(let i=0;i<100;i++)walker.mover(1,0,.05,root,bounds);
  assert.ok(camera.position.z>=D.playerRadius,'no atraviesa el muro');
  camera.position.set(FRONT_OPENINGS.lobby[0].x,D.playerHeight,2);
  for(let i=0;i<25;i++)walker.mover(1,0,.05,root,bounds);
  assert.ok(camera.position.z<0,'pasa por el vano');assert.ok(near(camera.position.y,D.playerHeight));
  for(let i=0;i<100;i++)walker.mover(1,0,.05,root,bounds);
  assert.ok(camera.position.z>=bounds.z[0]+D.playerRadius,'no sale del suelo');
});

test('primera persona: evita muebles bajos aunque no lleguen a la altura de los ojos',()=>{
  const camera=new T.PerspectiveCamera(),target=new T.Vector3(0,D.playerHeight,-2);
  camera.position.set(0,D.playerHeight,2);camera.lookAt(target);
  const walker=crearPrimeraPersona(camera,target);walker.sincronizar();
  const root=new T.Group(),table=new T.Mesh(new T.BoxGeometry(2,.75,1),new T.MeshBasicMaterial());
  table.position.y=.75/2;table.userData.tipo='mesa';root.add(table);
  for(let i=0;i<60;i++)walker.mover(1,0,.05,root,{x:[-5,5],z:[-5,5]});
  assert.ok(camera.position.z>=.5+D.playerRadius,'se detiene ante el mueble bajo');
});
