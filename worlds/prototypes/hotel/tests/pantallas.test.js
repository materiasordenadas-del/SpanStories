import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { box,near } from '../engine/layout.js';
import { crearPantalla,PROGRAMAS,crearKiosco,crearTotemDigital,crearMesaTactil } from '../objetos/Pantallas.js';
import { crearTarima,crearTelon,crearPiano } from '../objetos/Escenario.js';
import { PANTALLAS as PA,LOBBY_TECH as LT,SALAS_TECH as ST } from '../engine/dimensions.js';

test('la pantalla apoya su cara trasera en z = 0 y la imagen queda por delante de la carcasa',()=>{
  const p=crearPantalla({ancho:1.6,alto:.9});p.updateMatrixWorld(true);const b=box(p);
  assert.ok(near(b.min.z,0,1e-6),'la espalda toca el plano del muro');assert.ok(near(b.min.y,0,1e-6),'pivot abajo-centro');
  assert.ok(near(b.max.z,PA.depth+.002,1e-6),'el plano de imagen sobresale 2 mm');
  const img=p.getObjectByName('pantalla');assert.ok(img.position.z>PA.depth,'la imagen no queda enterrada en la carcasa');
});

test('toda pantalla viva tiene programa y los equipos con pantalla exponen vivo()',()=>{
  for(const n of ['ondas','bienvenida','deportes','clima','tablero','carta','directorio','checkin','domotica','dashboard','mesa','puerta','musica'])assert.equal(typeof PROGRAMAS[n],'function',n);
  for(const f of [crearKiosco,crearTotemDigital,crearMesaTactil])assert.ok(f().userData.radioVivo>0);
});

test('lobby: la pantalla de bienvenida cabe entre los pilastros y no pisa el rótulo; los kioscos quedan entre el tapete y el mostrador',()=>{
  const W=LT.welcome;assert.ok(W.width/2<8.5-.17,'cabe entre los pilastros de la recepción (x = ±8,5)');
  assert.ok(W.base+W.height<4.5-.35,'queda por debajo del rótulo PALMA REAL');assert.ok(W.base>1.05+.5,'sobre el mostrador y los terminales');
  const [x0,x1]=[Math.min(...LT.kiosks.x),Math.max(...LT.kiosks.x)];
  assert.ok(x0-.31>-11.85,'el kiosco más a la izquierda no pisa el tapete');assert.ok(x1+.31<-5.5-.06,'el más a la derecha no pisa el mostrador');
});

test('conserjería: la mesa táctil no toca el mostrador ni el guardaequipajes; el tablero va entre las bibliotecas',()=>{
  const t=ST.conserjeria.table,b=ST.conserjeria.board;
  assert.ok(t.x-t.width/2>2.5+.5,'la mesa empieza después del mostrador (x = ±2,5)');
  assert.ok(t.z+t.depth/2+t.stool+.3<3-.4,'los taburetes no llegan al guardaequipajes (z = 3)');
  assert.ok(b.width/2<6-1.5,'el tablero no pisa las bibliotecas (x = ±6, ancho 3)');assert.ok(b.base>.85,'el tablero queda sobre el mostrador');
});

test('restaurante: el escenario va en la zona cubierta, delante del muro del patio y fuera de las mesas',()=>{
  const S=ST.restaurante.stage,back=S.frontX+S.depth,patio=6,mesaMax=0+1.15+.3;
  assert.ok(back<=patio-.07,'el telón no atraviesa el muro bajo del patio (x = 6, grosor .14)');
  assert.ok(S.frontX>mesaMax+.5,'queda a más de 0,5 m de la fila de mesas más cercana (x = 0)');
  assert.ok(S.z-S.width/2>-13&&S.z+S.width/2<13,'cabe en el fondo del salón (±13 m)');
  const tarima=crearTarima({ancho:S.width,fondo:S.depth,alto:S.height}),telon=crearTelon({ancho:S.width,alto:S.backdrop.height,fondo:S.backdrop.thickness}),piano=crearPiano();
  assert.ok(near(box(tarima).max.y,S.height,1e-3),'la tarima mide su altura');assert.ok(near(box(telon).getSize(new T.Vector3()).x,S.width+.08,.02),'el telón cubre el ancho de la tarima');
  assert.ok(box(piano).getSize(new T.Vector3()).x<S.width/2,'el piano cabe en media tarima');
  assert.ok(S.screen.base+S.screen.height<S.backdrop.height-.2,'la pantalla LED cabe en el telón con holgura para el rótulo');
});
