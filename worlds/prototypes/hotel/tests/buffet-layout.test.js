import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { crearHotelWorld,ZONAS } from '../engine/HotelWorld.js';
import { RegistroObjetos } from '../engine/Objetos.js';
import { box,near,place } from '../engine/layout.js';
import { planBuffet,BUFFET } from '../routes.js';
import { crearVentana } from '../objetos/Arquitectura.js';
import { crearPrimeraPersona } from '../engine/PrimeraPersona.js';
import { conexiones,rutaEntre,llegada,limitesZona } from '../engine/Recorrido.js';
import { DIMENSIONS as D } from '../engine/dimensions.js';

// Solo se omite el dibujo 2D; se construye la geometría real del hotel, incluidos LOD y selección.
async function fixture(layout=BUFFET){
  const previous=globalThis.document;
  const context=new Proxy({}, {get:(_,key)=>key==='measureText'?s=>({width:s.length*12}):String(key).startsWith('create')?()=>({addColorStop(){}}):()=>{}});
  globalThis.document={createElement:()=>({getContext:()=>context})};
  const objects=new RegistroObjetos(),scene=new T.Scene();
  const world=crearHotelWorld({scene,objetos:objects,buffetLayout:layout,onNavigate(){},onAction(){}});
  try {const root=await world.build('buffet');root.visible=true;return {world,objects,root,layout};}
  finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
const solid=o=>box(o,{physical:true});
const separation=(a,b)=>Math.hypot(Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x),Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z));
function diningBounds(objects,i){
  const result=solid(objects.obtener('buffet-mesa-'+i));
  for(const entry of objects.listar().filter(e=>e.tipo==='silla'&&e.etiqueta==='Silla mesa '+i))result.union(solid(objects.obtener(entry.id)));
  return result;
}

test('buffet real: 27 × 24 m, 13 mesas con sillas, pasillos y estaciones sin solapes',async()=>{
  for(const layout of [BUFFET,planBuffet({width:28,depth:25})]){
    const {objects}=await fixture(layout),B=layout;
    const floor=solid(objects.obtener('buffet-piso'));
    assert.ok(near(floor.min.x,B.room.west)&&near(floor.max.x,B.room.east));
    assert.ok(near(floor.min.z,B.room.rear)&&near(floor.max.z,B.room.front));
    const tables=Array.from({length:13},(_,i)=>diningBounds(objects,i+1));
    assert.equal(objects.listar().filter(e=>e.tipo==='silla').length,52);
    const stations=['buffet-desayuno','buffet-carvery','buffet-isla-central','buffet-postres'].map(id=>solid(objects.obtener(id)));
    for(const [i,a] of tables.entries()){
      assert.ok(a.min.x>=B.room.westInner&&a.max.x<=B.room.eastInner&&a.min.z>=B.room.rear&&a.max.z<=B.room.frontInner,'mesa '+(i+1)+' dentro del recinto');
      for(const b of tables.slice(i+1))assert.ok(separation(a,b)>=B.aisle-1e-3,'paso entre mesas '+(i+1));
      for(const b of stations)assert.ok(separation(a,b)>=B.aisle-1e-3,'paso entre mesa '+(i+1)+' y estación');
      assert.ok(separation(a,solid(objects.obtener('buffet-sofa-001')))>=B.aisle-1e-3,'paso junto a banqueta');
    }
    for(const b of stations)assert.ok(near(b.min.y,0)&&near(b.max.y,B.height),'estación apoyada y encimera conservada');
    const [breakfast,carvery,island,desserts]=stations;
    assert.ok(near(breakfast.min.z,B.serviceRear)&&near(carvery.min.z,B.serviceRear),'respaldos alineados delante de las pilastras');
    assert.ok(island.min.z-carvery.max.z>=2*B.aisle-1e-3,'dos filas entre carvery e isla');
    assert.ok(near(B.room.eastInner-island.max.x,B.aisle,.001),'pasillo este calculado con saliente de tapa');
    assert.ok(B.room.eastInner-desserts.max.x>=B.aisle);
    const sofa=solid(objects.obtener('buffet-sofa-001'));assert.ok(sofa.min.x>=B.room.westInner,'banqueta dentro del salón');
    const beams=objects.listar().filter(e=>e.etiqueta==='Viga del salón');
    for(const e of beams)assert.ok(solid(objects.obtener(e.id)).max.y<B.room.ceiling,'vigas bajo el techo');
  }
});

test('buffet real: escenario contra el muro frontal, equipos apoyados y fuera de los pasos',async()=>{
  const {objects}=await fixture(),B=BUFFET,S=B.stage;
  const stage=solid(objects.obtener('buffet-tarima')),backdrop=solid(objects.obtener('buffet-telon'));
  assert.ok(near(stage.max.z,B.room.frontInner-S.wallGap)&&near(stage.max.y,S.height));
  assert.ok(near((stage.min.x+stage.max.x)/2,0)&&near(backdrop.max.z,stage.max.z));
  assert.ok(near(backdrop.min.y,stage.max.y));
  for(const id of ['buffet-piano','buffet-banqueta-piano','buffet-microfono','buffet-altavoz-1','buffet-altavoz-2']){
    const b=solid(objects.obtener(id));assert.ok(near(b.min.y,stage.max.y),'equipo apoyado: '+id);
    assert.ok(b.min.x>=stage.min.x&&b.max.x<=stage.max.x&&b.min.z>=stage.min.z&&b.max.z<=stage.max.z,'equipo dentro de tarima: '+id);
  }
  const screen=solid(objects.obtener('buffet-pantalla-escenario'));assert.ok(near(screen.max.z,backdrop.min.z-S.equipmentGap),'pantalla delante del telón');
  for(let i=1;i<=13;i++)assert.ok(separation(stage,diningBounds(objects,i))>=B.aisle,'mesas separadas del escenario');
  assert.ok(S.view.cam[2]<stage.min.z,'encuadre desde el comedor');
});

test('buffet real: cada ventana coincide con un hueco, con muro sólido alrededor y vidrio transparente',async()=>{
  const {objects}=await fixture(),B=BUFFET;
  for(const [id,axis] of [['buffet-muro-posterior','z'],['buffet-muro-lateral-1','x']]){
    const wall=objects.obtener(id);wall.updateMatrixWorld(true);
    const openings=wall.userData.huecos.filter(h=>h.base>0);
    assert.equal(openings.length,axis==='z'?5:3);
    for(const h of openings){
      const origin=axis==='z'?new T.Vector3(h.x,h.base+h.alto/2,B.room.rear+1):new T.Vector3(B.room.east-1,h.base+h.alto/2,h.x);
      const dir=axis==='z'?new T.Vector3(0,0,-1):new T.Vector3(1,0,0);
      assert.equal(new T.Raycaster(origin,dir).intersectObject(wall,true).length,0,'vano realmente abierto');
      origin.y=h.base/2;assert.ok(new T.Raycaster(origin,dir).intersectObject(wall,true).length,'antepecho sólido');
    }
  }
  for(const e of objects.listar().filter(e=>e.tipo==='ventana')){
    const root=objects.obtener(e.id),glass=root.getObjectByName('cristal');
    assert.ok(glass.material.transparent&&!glass.material.depthWrite);
    assert.ok(near(glass.material.uniforms.uOpacidad.value,B.glass.opacity));
    const b=solid(glass),rear=root.userData.muro!=='buffet-muro-lateral-1';
    assert.ok(near(rear?(b.min.z+b.max.z)/2:(b.min.x+b.max.x)/2,rear?B.room.rear:B.room.east),'vidrio dentro del espesor del muro');
  }
  const original=crearVentana().getObjectByName('cristal');assert.equal(original.material.transparent,false,'ventanas originales intactas');
});

test('buffet real: caminar de la entrada a las estaciones, mesas y terraza; selección independiente',async()=>{
  const {objects,root,world}=await fixture(),B=BUFFET;
  const camera=new T.PerspectiveCamera(),target=new T.Vector3(),walker=crearPrimeraPersona(camera,target);
  const pairs=conexiones(world.ZONAS,objects,'buffet'),incoming=rutaEntre('lobby','buffet',pairs),outgoing=rutaEntre('buffet','terraza',pairs);
  const arrival=llegada(incoming);camera.position.copy(arrival.position);
  const bounds=limitesZona('buffet',world.ZONAS);
  function walkTo(x,z){
    const end=new T.Vector3(x,D.playerHeight,z);target.copy(end);camera.lookAt(target);walker.sincronizar();
    const steps=Math.ceil(camera.position.distanceTo(end)/.08);
    for(let i=0;i<steps;i++)walker.mover(1,0,.08/2.8,root,bounds);
    assert.ok(camera.position.distanceTo(end)<.15,'recorrido llega a '+x+','+z);
  }
  walkTo(-10,6);walkTo(3.3,6);walkTo(3.3,B.island.z);walkTo(3.3,B.island.z+B.island.depth/2+.9);walkTo(B.island.x,B.island.z+B.island.depth/2+.9);
  walkTo(3.3,B.island.z+B.island.depth/2+.9);walkTo(3.3,6);walkTo(B.room.eastInner-.75,6);walkTo(B.room.eastInner-.75,B.door.z);
  assert.ok(near(outgoing.from.center.x,B.room.east)&&near(outgoing.from.center.z,B.door.z));
  const chair=objects.obtener('buffet-silla-001'),table=objects.obtener('buffet-mesa-1'),other=objects.obtener('buffet-silla-002');
  const tableBefore=table.position.clone(),otherBefore=other.position.clone();
  let piece;chair.traverse(o=>{if(o.isMesh&&!o.userData.ignorarSeleccion)piece??=o;});
  assert.equal(objects.resolver(piece).id,'buffet-silla-001');
  objects.seleccionar('buffet-silla-001');chair.position.x+=1;chair.visible=false;
  assert.ok(table.position.equals(tableBefore)&&other.position.equals(otherBefore));
  assert.equal(objects.obtener('buffet-piso').visible,true);
  assert.deepEqual(ZONAS.restaurante.tam,[30,26],'restaurante original conserva tamaño');
});

test('layout físico: sombras y ayudas no alteran una colocación de sólidos',()=>{
  const root=new T.Group(),solidMesh=new T.Mesh(new T.BoxGeometry(2,1,1),new T.MeshBasicMaterial());root.add(solidMesh);
  const helper=new T.Mesh(new T.BoxGeometry(10,1,10),new T.MeshBasicMaterial());helper.userData.ignorarSeleccion=true;root.add(helper);
  assert.ok(near(box(root).max.x,5));assert.ok(near(solid(root).max.x,1));
  place(root,{minZ:3},{physical:true});assert.ok(near(solid(root).min.z,3));
});
