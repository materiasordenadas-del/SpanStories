import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { crearMuroConHuecos } from '../objetos/MuroConHuecos.js';
import { crearEscalera } from '../objetos/Escalera.js';
import { crearPuertaBalcon } from '../objetos/PuertaBalcon.js';
import { crearAscensor } from '../objetos/Ascensor.js';
import { crearCerramiento } from '../objetos/Patio.js';
import { crearBarreraVehicular } from '../objetos/BarreraVehicular.js';
import { geometriaRampaAcceso,geometriaPoligono } from '../objetos/SuelosExterior.js';
import { DIMENSIONS as D,HOTEL_LAYOUT as H,LOBBY_CORE as L,FACADE as F,CORRIDOR as K,COURT,suiteALobby,pasilloALobby,puertasPasillo } from '../engine/dimensions.js';
import { planPatio,ejeCalzada,tramosCerramiento,planAccesos } from '../engine/PlantaPatio.js';
import { pilaresEntrada,tramosEntrada,marquesinaBajo } from '../engine/PlantaFachada.js';
import { ALTO_LOBBY,PELDAÑOS,escalera,galeria,huecosMuroEste,huecosMuroPosterior,entradaPasillo } from '../engine/PlantaLobby.js';
import { crearEstadoHotel,iniciarViaje,terminarViaje } from '../engine/HotelState.js';
import { aplicarDetalle } from '../engine/Detalle.js';
import { mesaLOD,sofaLOD } from '../objetos/MueblesLOD.js';

// Rayo horizontal contra un muro sin rotar (x local del muro).
function hits(root,x,y){root.updateMatrixWorld(true);return new T.Raycaster(new T.Vector3(x,y,5),new T.Vector3(0,0,-1)).intersectObject(root,true).filter(h=>h.object.material?.name!=='contorno');}
const ancho=28;// fondo del lobby = longitud del muro este

test('el muro este del lobby deja pasar al ascensor en PB y P1 con forjado sólido entre ambos',()=>{
  const wall=crearMuroConHuecos({ancho,alto:ALTO_LOBBY,huecos:huecosMuroEste()});
  assert.equal(hits(wall,L.liftZ,1.7).length,0);assert.equal(hits(wall,L.liftZ,D.floorHeight+1.7).length,0);
  assert.ok(hits(wall,L.liftZ,3.5).length,'entre plantas el hueco del ascensor es muro');
  for(const z of L.galleryArtZ)assert.ok(hits(wall,z,D.floorHeight+1.7).length,'las habitaciones ya no dan a la galería');
  assert.equal(hits(wall,L.conciergeZ,1.7).length,0);
  const back=crearMuroConHuecos({ancho:48,alto:ALTO_LOBBY,huecos:huecosMuroPosterior()});// lanza si se solapan
  assert.equal(hits(back,L.door203X,D.floorHeight+1.7).length,0,'la galería abre al pasillo');
  assert.ok(hits(back,L.door203X,1.7).length,'en PB no hay paso al pasillo');
});
test('el ascensor de P1 está sobre el de PB y la galería lleva a la puerta del pasillo',()=>{
  assert.equal(ALTO_LOBBY,2*D.floorHeight);
  assert.ok(L.liftZ-L.liftOpening/2>galeria.minZ&&L.liftZ+L.liftOpening/2<galeria.maxZ);
  assert.ok(entradaPasillo.x-entradaPasillo.ancho/2>galeria.minX&&entradaPasillo.x+entradaPasillo.ancho/2<galeria.maxX,'la puerta del pasillo cierra el fondo de la galería');
  // Altura libre bajo la galería para el ascensor y sobre ella hasta el techo del atrio.
  assert.ok(D.floorHeight-L.gallery.beam>L.liftHeight);assert.ok(ALTO_LOBBY-D.floorHeight>=3.2);
});
test('pasillo de doble crujía: habitaciones a izquierda y derecha, puertas escalonadas',()=>{
  const doors=puertasPasillo(),left=doors.filter(d=>d.lado<0),right=doors.filter(d=>d.lado>0);
  assert.ok(K.width>=1.8&&K.width<=2.2,'1,8–2 m libres en un 5 estrellas');
  assert.equal(left.length,K.rooms);assert.equal(right.length,K.rooms);
  assert.ok(left.every(d=>d.num%2===1)&&right.every(d=>d.num%2===0),'impares a la izquierda, pares a la derecha');
  assert.equal(doors.find(d=>d.num===201).lado,-1);assert.equal(Math.max(...left.map(d=>d.z)),doors.find(d=>d.num===201).z,'la 201 es la primera');
  for(const d of doors){assert.ok(d.z+K.door.nicheWidth/2<K.length/2-.6&&d.z-K.door.nicheWidth/2>-K.length/2+.6,'cada nicho cabe en el pasillo');}
  for(const l of left)for(const r of right)assert.ok(Math.abs(l.z-r.z)>=K.door.nicheWidth,'puertas nunca enfrentadas');
  for(const side of [left,right])for(let i=1;i<side.length;i++)assert.ok(side[i-1].z-side[i].z>=K.door.nicheWidth+1.5,'muro entre nichos');
  // Fuera del lobby, detrás de su muro posterior, y empalmado con la galería.
  const [ex,ez]=pasilloALobby(0,K.length/2);assert.ok(ez<=-14);assert.equal(ex,entradaPasillo.x);
  assert.ok(K.entryWidth<=K.width,'la puerta de la galería cabe en el pasillo');
});
test('la escalera arranca en PB y su último peldaño enrasa con el borde de la galería',()=>{
  const root=crearEscalera();root.updateMatrixWorld(true);
  const tread=root.getObjectByName('peldaño-'+(PELDAÑOS-1));
  assert.ok(Math.abs(new T.Box3().setFromObject(tread).max.y-D.floorHeight)<1e-5);
  const rail=root.getObjectByName('pasamanos-1'),top=new T.Vector3(0,0,-Math.hypot((PELDAÑOS-1)*D.stairRun,(PELDAÑOS-1)*D.stairRise)/2).applyMatrix4(rail.matrixWorld);
  assert.ok(Math.abs(top.y-(D.floorHeight+.95))<1e-5);
  assert.equal(escalera.topZ,galeria.maxZ);
  assert.ok(escalera.bottomZ<L.conciergeZ-L.conciergeWidth/2,'la escalera no tapa el arco de conserjería');
});
test('la suite 201 queda detrás del muro izquierdo del pasillo, fuera del lobby y del pasillo',()=>{
  const door=puertasPasillo().find(d=>d.num===201),[doorX,doorZ]=suiteALobby(H.suiteEntryX,H.suiteFrontZ),[wx,wz]=pasilloALobby(-K.width/2-K.door.niche,door.z);
  assert.ok(Math.abs(doorX-wx)<1e-9&&Math.abs(doorZ-wz)<1e-9,'la puerta de la suite es la 201 del pasillo');
  const corners=[[-7,6],[7,6],[-7,-6],[7,-6]].map(([x,z])=>suiteALobby(x,z));
  assert.ok(corners.every(([x])=>x<=wx+1e-9),'al oeste del pasillo');assert.ok(corners.every(([,z])=>z<-14),'fuera del lobby');
  const [balconyX]=suiteALobby(H.balcony.doorX,H.balcony.backZ-H.balcony.depth);assert.ok(balconyX<Math.min(...corners.map(c=>c[0]))+1e-9,'el balcón da al exterior');
});
test('el muro de entrada es simétrico y cada puerta cabe en su vano',()=>{
  const xs=pilaresEntrada(),tramos=tramosEntrada();
  for(let i=0;i<xs.length;i++)assert.ok(Math.abs(xs[i]+xs[xs.length-1-i])<1e-9,'pilares en espejo');
  assert.ok(Math.abs(xs.at(-1)+F.entrance.pier/2-F.entrance.width/2)<1e-9);
  const giratoria=tramos.filter(t=>t.contenido==='giratoria'),salida=tramos.filter(t=>t.contenido==='salida');
  assert.equal(giratoria.length,1);assert.equal(salida.length,1);
  assert.ok(giratoria[0].max-giratoria[0].min>=2*(F.revolving.radius+.1),'el tambor no toca los pilares');
  assert.ok(Math.abs(salida[0].max-salida[0].min-F.exit.width)<1e-9,'la puerta de salida llena su vano');
  assert.ok(F.canopy.width<F.entrance.width);
  // Altura libre medida bajo el vuelo del edificio: 3,86 m. La marquesina queda por debajo
  // y por encima del techo de la puerta giratoria (alto + 0,32 de techo de bronce).
  assert.ok(marquesinaBajo(3.86)>F.revolving.height+.32);
});
test('las puertas móviles permanecen dentro de sus carriles y dejan paso libre',()=>{
  const door=crearPuertaBalcon();door.userData.abierta=true;for(let i=0;i<100;i++)door.userData.animar(.05);
  const leaves=door.children.filter(o=>o.isGroup);assert.ok(Math.abs(leaves[0].position.x-leaves[1].position.x)<.01);
  assert.equal(hits(door,-.7,1.7).length,0);
  const lift=crearAscensor();lift.userData.abierta=true;for(let i=0;i<100;i++)lift.userData.animar(.05);
  const panels=['puerta-izquierda','puerta-derecha'].map(n=>new T.Box3().setFromObject(lift.getObjectByName(n)));
  assert.ok(panels[1].min.x-panels[0].max.x>D.playerRadius*2);
  assert.ok(panels[0].min.x>=-1.8&&panels[1].max.x<=1.8);
  // El hueco del muro coincide con el marco: no se ve el interior del pozo a los lados.
  const jamb=new T.Box3().setFromObject(lift.getObjectByName('jamba-1'));assert.ok(Math.abs(jamb.max.x-L.liftOpening/2)<.01);
});
test('patio de llegada: sentido único, entra por la derecha y sale por la izquierda',()=>{
  const p=planPatio(1),eje=ejeCalzada(p);
  assert.ok(eje[0][0]>0&&eje.at(-1)[0]<0,'entra por +x (derecha) y sale por −x (izquierda)');
  assert.equal(eje[0][1],p.zP);assert.equal(eje.at(-1)[1],p.zP);
  assert.equal(eje[0][0],p.gates.entrada);assert.equal(eje.at(-1)[0],p.gates.salida);
  assert.equal(COURT.perimeter.height,2,'muro frontal alto');
  // Frente bajo la marquesina: avanza hacia −x; su derecha (−z) es el edificio: el huésped baja a la acera.
  const i=eje.findIndex(([,z])=>Math.abs(z-p.zc)<1e-9),[ax,az]=eje[i],[bx,bz]=eje[i+1],dir=new T.Vector3(bx-ax,0,bz-az).normalize();
  assert.ok(dir.x<-.99);assert.ok(new T.Vector3().crossVectors(dir,new T.Vector3(0,1,0)).z<-.99,'la acera de llegada queda a la derecha del coche');
  assert.ok(p.front-p.zFace>=4,'acera de llegada amplia');assert.ok(COURT.dropLane<COURT.drive,'carril de parada + carril de paso');
  // Las columnas de la marquesina se apoyan en la isla, nunca en la calzada.
  const columnZ=p.islandFront+COURT.islandCurb.width+.3;assert.ok(columnZ>p.islandFront&&columnZ<p.islandFront+F.canopy.overIsland);
  assert.ok(F.canopy.width/2<p.cornerX,'la marquesina cubre el tramo recto del frente');
  const R=COURT.fountain.radius+COURT.fountain.ring;assert.ok(p.islandCenter-R>p.islandFront&&p.islandCenter+R<p.zP,'la fuente y su anillo caben en la isla');
  const t=tramosCerramiento();for(let k=1;k<t.length;k++)assert.equal(t[k][0],t[k-1][1],'muro continuo sin huecos');
  assert.deepEqual(p.gates,{entrada:COURT.gateX,salida:-COURT.gateX});
  assert.equal(t[0][0],-COURT.perimeter.extent);assert.equal(t.at(-1)[1],COURT.perimeter.extent);
});
test('muro fuera de la acera opuesta y accesos sin bordillo ni postes en el paso',()=>{
  const p=planPatio(1),a=planAccesos(p),Q=COURT.perimeter;
  const muro=crearCerramiento({largo:32,alto:Q.height,grosor:Q.thickness,pilar:Q.pier,altoPilar:Q.pierHeight,cada:Q.pierEvery});muro.position.z=a.wallZ;
  assert.ok(new T.Box3().setFromObject(muro).min.z>p.farSidewalk);
  for(const [x0,x1] of a.cortes){assert.equal(x1-x0,COURT.drive);
    assert.ok(a.bordillo.every(t=>t[1][0]<=x0||t[0][0]>=x1));
    assert.ok(a.acera.every(t=>t[1][0]<=x0||t[0][0]>=x1));}
  assert.equal(a.rampEnd,p.curbZ);assert.ok(Math.abs(a.rampEnd-a.rampStart-COURT.access.ramp)<1e-9);
  assert.ok((COURT.curb+COURT.access.surfaceY)/COURT.access.ramp<.1,'pendiente suave');
  for(const b of a.barreras)assert.ok(b.z+.25<p.zP,'pedestal detrás de la acera');
});
test('las barreras abren el paso y mantienen estados independientes',()=>{
  const entrada=crearBarreraVehicular(),salida=crearBarreraVehicular(),brazo=entrada.getObjectByName('brazo');
  assert.equal(entrada.userData.abierta,true);assert.equal(brazo.rotation.z,Math.PI/2);
  const abierto=new T.Box3().setFromObject(brazo);assert.ok(abierto.max.x<-COURT.drive/2+.1,'brazo vertical fuera del carril');
  entrada.userData.accion();entrada.userData.animar(2);
  assert.equal(brazo.rotation.z,0);assert.ok(new T.Box3().setFromObject(brazo).max.x>COURT.drive/2-.01,'cierra el ancho de calzada');
  assert.equal(salida.userData.abierta,true);assert.equal(salida.getObjectByName('brazo').rotation.z,Math.PI/2);
  entrada.userData.accion();entrada.userData.animar(2);assert.equal(brazo.rotation.z,Math.PI/2);
});
test('rampas unidas al adoquín y al asfalto, sin césped superpuesto',()=>{
  const p=planPatio(1),a=planAccesos(p),terreno=geometriaPoligono(a.fondo,3.2,-.03),mesh=new T.Mesh(terreno,new T.MeshBasicMaterial({side:T.DoubleSide}));
  for(const x of Object.values(p.gates)){
    const g=geometriaRampaAcceso({x,ancho:COURT.drive,z0:a.rampStart,z1:a.rampEnd,y0:COURT.access.surfaceY,y1:-COURT.curb}),v=g.getAttribute('position');
    for(let i=0;i<v.count;i++){const z=v.getZ(i),esperado=Math.abs(z-a.rampStart)<1e-5?COURT.access.surfaceY:-COURT.curb;assert.ok(Math.abs(v.getY(i)-esperado)<1e-5);}
    const ray=new T.Raycaster(new T.Vector3(x,1,(a.rampStart+a.rampEnd)/2),new T.Vector3(0,-1,0));
    assert.equal(ray.intersectObject(mesh).length,0,'el terreno no tapa la rampa');
  }
});
test('los accesos conservan el ancho útil de un carro hasta las curvas de la U',()=>{
  const p=planPatio(1),outside=ejeCalzada(p,COURT.drive/2,32,p.curbZ),inside=ejeCalzada(p,-COURT.drive/2,32,p.curbZ),center=ejeCalzada(p,0,32,p.curbZ);
  assert.equal(COURT.gateX,COURT.legX,'entrada y salida alineadas con sus ramales');
  for(let i=0;i<center.length;i++){
    const distance=Math.hypot(outside[i][0]-inside[i][0],outside[i][1]-inside[i][1]);
    assert.ok(Math.abs(distance-COURT.drive)<1e-8,'6,5 m de ancho en cada sección');
    if(i===0||i===center.length-1)continue;
    const previous=center[i-1],next=center[i+1],tangent=[next[0]-previous[0],next[1]-previous[1]],length=Math.hypot(...tangent);
    if(length<1e-8)continue;
    const width=Math.abs((outside[i][0]-inside[i][0])*tangent[1]-(outside[i][1]-inside[i][1])*tangent[0])/length;
    assert.ok(width>6.3,'el ancho perpendicular no se estrecha en conectores');
  }
});
test('el viaje de ida y vuelta desembarca en la galería y en el lobby',()=>{
  const state=crearEstadoHotel();assert.ok(iniciarViaje(state,1));assert.equal(iniciarViaje(state,0),false);
  assert.equal(terminarViaje(state),'galeria');assert.ok(iniciarViaje(state,0));assert.equal(terminarViaje(state),'circulacion');
});
test('LOD 3 conserva el color, la forma redonda y los brazos del mobiliario',()=>{
  const table=mesaLOD({redonda:true,ancho:1.6,color:'#faf1dd'}),sofa=sofaLOD();aplicarDetalle(table,2);aplicarDetalle(sofa,2);
  assert.equal(table.userData.nivelActual,2);assert.equal(sofa.userData.nivelActual,2);
  const meshes=[];table.levels[2].object.traverse(o=>{if(o.material?.uniforms?.uColor)meshes.push(o);});
  assert.ok(meshes.some(o=>o.material.uniforms.uColor.value.getHexString()==='faf1dd'));
  assert.ok(new T.Box3().setFromObject(sofa.levels[2].object).max.y>.8);
});
