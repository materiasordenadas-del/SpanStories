import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { box,near } from '../engine/layout.js';
import { BUFFET as B,DIMENSIONS as D } from '../engine/dimensions.js';
import { crearIslaBuffet,crearDosel,crearChafing,perimetro,crearTorrePostres,crearAsado } from '../objetos/Buffet.js';

// Zona `buffet` compacta. Medidas públicas conservadas mediante el adaptador de dimensions.js.
const W=B.room.width,DEPTH=B.room.depth,paredEste=B.room.eastInner,arcoFrente=B.gallery.z+B.gallery.depth/2,pared=B.serviceRear;
const sillas=1.15+.3;                                  // mesa redonda: eje a silla (1,15) + fondo de silla
const I=B.island,Cv=B.carvery,Ds=B.desserts,rd=Ds.diameter/2;

test('buffet: pasillos de servicio de al menos 1,5 m entre isla, muro este y mesas',()=>{
  assert.ok(I.x-I.length/2-(Math.max(...B.westTables.x)+B.chairRadius)>=B.aisle,'pasillo oeste de la isla');
  assert.ok(paredEste-(I.x+I.length/2)>=B.aisle,'pasillo entre la isla y el muro este');
  const frenteCarvery=pared+Cv.depth,fondoIsla=I.z-I.depth/2;
  assert.ok(fondoIsla-frenteCarvery>=2*B.aisle,'entre el carvery y la isla caben dos filas de gente');
  const primeraMesa=Math.min(...B.eastTables.z)-sillas;
  assert.ok(primeraMesa-(I.z+I.depth/2)>=B.aisle,'pasillo entre la isla y la primera fila de mesas del este');
  const ultimaMesa=Math.max(...B.eastTables.z)+sillas;
  assert.ok(Ds.z-rd-ultimaMesa>=B.aisle,'pasillo entre las mesas del este y la isla de postres');
  assert.ok(Ds.x-rd-B.stage.width/2>=B.aisle,'pasillo entre el escenario y la isla de postres');
  const [x0,x1]=B.eastTables.x;assert.ok(x1-x0>=2*sillas,'las dos columnas de mesas del este no se pisan');
  assert.ok(paredEste-(x1+sillas)>=.6,'las sillas no tocan el muro este');
});

test('buffet: carvery y línea de desayuno apoyan contra el muro posterior sin atravesar los arcos',()=>{
  const carv=crearIslaBuffet({largo:Cv.length,fondo:Cv.depth,alto:B.height,radio:Cv.radius,nichos:Cv.niches,lados:'frente'});
  assert.ok(near(box(carv).getSize(new T.Vector3()).z,Cv.depth+.14,.02),'el frente mide su fondo más la tapa');
  assert.ok(pared>=arcoFrente,'el respaldo queda delante de las pilastras de los arcos');
  assert.ok(Cv.x-Cv.length/2>B.room.westInner&&Cv.x+Cv.length/2<=paredEste,'el carvery cabe en el salón del buffet');
  assert.ok(B.breakfast.x+B.breakfast.length/2<=-.1&&B.breakfast.x-B.breakfast.length/2>=-W/2+1,'la línea de desayuno cabe en el lado oeste');
});

test('isla: la encimera mide 0,92 m, los nichos van en los dos lados y el listón no sobresale de la tapa',()=>{
  const isla=crearIslaBuffet({largo:I.length,fondo:I.depth,alto:B.height,radio:I.radius,nichos:I.niches}),b=box(isla),s=b.getSize(new T.Vector3());
  assert.ok(near(b.min.y,0,1e-3)&&near(b.max.y,B.height,1e-3),'apoya en el suelo y la tapa está a la altura del buffet');
  assert.ok(near(s.x,I.length+.14,.02)&&near(s.z,I.depth+.14,.02),'huella = isla + filete de latón');
  const luces=[];isla.traverse(o=>{if(o.name==='luz-nicho')luces.push(o);});
  assert.equal(luces.length,2*I.niches,'una luz por nicho y lado');
  assert.ok(luces.some(l=>l.position.z>0)&&luces.some(l=>l.position.z<0),'nichos a ambos lados de la isla');
  const frente=crearIslaBuffet({largo:Cv.length,fondo:Cv.depth,radio:Cv.radius,nichos:Cv.niches,lados:'frente'}),n=[];frente.traverse(o=>{if(o.name==='luz-nicho')n.push(o.position.z);});
  assert.ok(n.length===Cv.niches&&n.every(z=>z>0),'contra la pared los nichos solo miran al salón');
});

test('dosel: más ancho que la isla, con holgura bajo la cabeza y tirantes hasta el techo',()=>{
  const k=B.canopy,H=B.room.ceiling,techo=H-(k.base+k.height);
  const d=crearDosel({largo:I.length+2*k.margin,fondo:I.depth+2*k.margin,alto:k.height,radio:I.radius+k.margin,techo}),b=box(d);
  assert.ok(b.getSize(new T.Vector3()).x>I.length+k.margin,'cubre la isla con margen');
  assert.ok(k.base+b.min.y>=D.doorHeight,'las lámparas colgantes dejan paso (≥ 2,4 m)');
  assert.ok(near(k.base+b.max.y,H,.02),'los tirantes llegan al techo');
});

test('puerta a la terraza: hueco de 2,4 m bajo el arco, dentro del muro y lejos de la isla de postres',()=>{
  const spring=B.door.height-B.door.width/2;
  assert.ok(near(spring,D.doorHeight,.01),'el hueco rectangular llega hasta el arranque del arco');
  assert.ok(B.door.z+B.door.width/2+.34<=DEPTH/2,'el arco cabe en el muro');
  assert.ok(paredEste-(Ds.x+rd+B.canopy.margin)>=B.aisle,'entre el dosel de los postres y el muro este (puerta incluida) queda pasillo de servicio');
  for(const z of B.windows.z)assert.ok(z+B.windows.width/2<B.door.z-B.door.width/2-.34,'los ventanales no pisan la puerta');
  const zs=[...B.windows.z].sort((a,b)=>a-b);for(let i=1;i<zs.length;i++)assert.ok(zs[i]-zs[i-1]>=B.windows.width+.5,'ventanales separados');
});

test('piezas del buffet: apoyan en y = 0 y caben sobre la encimera',()=>{
  for(const [n,o] of Object.entries({chafing:crearChafing(),torre:crearTorrePostres(),asado:crearAsado()}))assert.ok(near(box(o).min.y,0,.005),n+' apoya en la encimera');
  const c=box(crearChafing()).getSize(new T.Vector3());
  assert.ok(c.x<=1&&c.z<=.5+1e-6,'una bandeja cabe en el carril de 0,5 m y hay cuatro en la isla');
  assert.ok(4*.9+3*.1<=I.length-2*I.radius+.9,'cuatro bandejas de 0,9 m caben a lo largo de la isla');
  const t=box(crearTorrePostres()).getSize(new T.Vector3());assert.ok(t.x<=.7,'la torre de postres cabe en el anillo de la isla redonda');
  const r=Math.hypot(.95,0),tor=.34;assert.ok(rd-(r+tor)>=0,'las torres no sobresalen de la isla de postres');
});

test('perímetro redondeado: normales unitarias y hacia fuera',()=>{
  for(const [w,d,r] of [[5.6,2.2,.6],[3,3,1.5],[8,1,.14]])for(const p of perimetro(w,d,r,.11)){
    assert.ok(near(Math.hypot(p.nx,p.nz),1,.02),'normal unitaria');assert.ok(p.x*p.nx+p.z*p.nz>0,'apunta hacia fuera');
    assert.ok(Math.abs(p.x)<=w/2+1e-6&&Math.abs(p.z)<=d/2+1e-6,'el punto está sobre el contorno');
  }
});
