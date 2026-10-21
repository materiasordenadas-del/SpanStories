import * as T from './three.js';
import { place,box } from './layout.js';
import { crearMuroFrontal } from './Cerramiento.js';
import { optimizarObjeto } from './Optimizar.js';
import { COLORS as C,DIMENSIONS as D,HOTEL_LAYOUT as H,LOBBY_CORE as L,FACADE as F,CORRIDOR as K,COURT as P0,LOBBY_TECH,SALAS_TECH,BUFFET,FRONT_OPENINGS,puertasPasillo } from './dimensions.js';
import { ALTO_LOBBY,escalera,galeria,huecosMuroEste,huecosMuroPosterior,entradaPasillo } from './PlantaLobby.js';
import { planPatio,ejeCalzada,poligonoCalzada,contornoIsla,aLoLargo,tramosCerramiento,planAccesos } from './PlantaPatio.js';
import { REFLECT_LAYER } from './GlossyFloor.js';
import { crearPisoHotel,crearMuro,crearColumna,crearAlfombra,crearVentana,crearLampara } from '../objetos/Arquitectura.js';
import { crearMostrador } from '../objetos/Mostrador.js';
import { crearPlanta } from '../objetos/Planta.js';
import { crearPalma } from '../objetos/Palma.js';
import { crearRotulo } from '../objetos/Rotulo.js';
import { crearPuerta } from '../objetos/Puerta.js';
import { crearAscensor } from '../objetos/Ascensor.js';
import { crearEscalera } from '../objetos/Escalera.js';
import { crearFlorero,crearServicioMesa,crearFuente } from '../objetos/Servicio.js';
import { aplicarPiso,crearArco,crearLustre,crearArte,crearMedallon,crearBiombo } from '../objetos/AcabadosLujo.js';
import { sofaLOD,sillaLOD,mesaLOD } from '../objetos/MueblesLOD.js';
import { caja,cilindro,esfera,pieza } from '../objetos/Piezas.js';
import { crearSombraContacto } from '../objetos/SombraContacto.js';
import { crearMuroConHuecos } from '../objetos/MuroConHuecos.js';
import { crearBaranda } from '../objetos/Balcon.js';
import { crearPuertaBalcon } from '../objetos/PuertaBalcon.js';
import { crearAplique } from '../objetos/Aplique.js';
import { crearVistaCaribe } from '../objetos/VistaCaribe.js';
import { crearPuertaGiratoria,crearPilarPiedra,crearPanoVidrio,crearDownlight,crearAtrilBotones,crearCarritoEquipaje } from '../objetos/EntradaHotel.js';
import { pilaresEntrada,tramosEntrada,marquesinaBajo } from './PlantaFachada.js';
import { crearSuperficie,crearRampaAcceso,rectangulo,circulo,franja } from '../objetos/SuelosExterior.js';
import { crearBarreraVehicular } from '../objetos/BarreraVehicular.js';
import { crearPalmaJardin,crearSeto,crearMacizo } from '../objetos/Jardin.js';
import { crearFuenteMonumental,crearFarola,crearMonolito,crearBolardoLuz,crearMarcasViales,crearCerramiento,crearCinta } from '../objetos/Patio.js';
import { crearAlfombraPasillo,crearPuertaDoble,crearCarritoLimpieza,crearConsola,crearLineaLuz } from '../objetos/Pasillo.js';
import { crearPantalla,crearKiosco,crearTotemDigital,crearMesaTactil } from '../objetos/Pantallas.js';
import { crearTarima,crearTelon,crearPiano,crearMicrofono,crearAltavoz } from '../objetos/Escenario.js';
import { crearIslaBuffet,crearChafing,crearCuenco,crearTorrePostres,crearCloche,crearPilaPlatos,crearCestaPan,crearJarrasJugo,crearEsculturaHielo,crearAsado,crearLamparaCalor,crearFuenteChocolate,crearDosel } from '../objetos/Buffet.js';

const F1=D.floorHeight;
const DESAYUNO=[['Arepa con huevo','12.000'],['Calentado paisa','18.000'],['Fruta tropical','11.000'],['Changua','10.000'],['Café de origen','9.000'],['Chocolate santafereño','8.000']];
// Las vistas `circulacion` y `galeria` no son salas aparte: son cámaras dentro del lobby
// (núcleo vertical y galería de P1). El pasillo de habitaciones sí es un área propia. `area` indica el grupo que se construye y se muestra.
export const ZONAS={
  lobby:{nombre:'Gran lobby · Palma Real',descripcion:'Atrio de doble altura · recepción, salones, ascensor y escalera a la galería.',tam:[48,28],cam:[4,1.7,11],target:[-2,2.1,-10],alto:ALTO_LOBBY},
  conserjeria:{nombre:'Salón de conserjería',descripcion:'Biblioteca de viajes, atención privada y experiencias colombianas.',tam:[20,16],cam:[5,1.7,6.6],target:[0,1.5,-4],alto:4.6},
  restaurante:{nombre:'Jardín de Palma',descripcion:'Salón gastronómico, desayuno colombiano y patio con fuente.',tam:[30,26],cubierta:[-15,-13,6,13],cam:[5,1.7,10],target:[-4,1.6,-6],alto:5.5},
  buffet:{nombre:'Jardín de Palma · Buffet',descripcion:'Salón buffet de 27 × 24 m: estaciones, comedor y escenario junto al muro; acceso a la terraza.',tam:[BUFFET.room.width,BUFFET.room.depth],cam:BUFFET.view.cam,target:BUFFET.view.target,alto:BUFFET.room.ceiling},
  bar:{nombre:'El Coral · lounge bar',descripcion:'Madera oscura, arcos, coctelería y rincones de conversación.',tam:[26,22],cam:[5,1.7,8.4],target:[0,1.8,-6],alto:5},
  terraza:{nombre:'Terraza Palma',descripcion:'Jardín tropical, pérgolas y vistas del Caribe colombiano.',tam:[32,24],cam:[4,1.7,10.5],target:[0,1.5,-7],alto:4.6},
  circulacion:{area:'lobby',nombre:'Ascensor y escalera',descripcion:'En el propio lobby: ascensor PB–P1 y escalera a la galería de habitaciones.',tam:[48,28],cam:[9.5,1.7,.8],target:[22.5,3.2,-4.5],alto:ALTO_LOBBY},
  galeria:{area:'lobby',nombre:'Galería · P1',descripcion:'Balcón abierto al atrio · ascensor, escalera y puerta al pasillo de habitaciones.',tam:[48,28],cam:[22.7,F1+1.7,-.35],target:[L.door203X,F1+1.5,-14],alto:ALTO_LOBBY},
  pasillo:{nombre:'Pasillo de habitaciones · P1',descripcion:'Doble crujía: impares a la izquierda, pares a la derecha. Tu suite es la 201.',tam:[K.width+2*K.door.niche+.4,K.length],cam:[0,1.62,K.length/2-.7],target:[0,1.42,-K.length/2],alto:K.height},
  habitacion:{nombre:'Suite Palma · 201',descripcion:'Suite con baño privado y salida a un balcón amueblado de 18 m².',tam:[14,12],cam:[1,1.7,4.9],target:[-2,1.3,-4],alto:3.4},
  fachada:{nombre:'Hotel Palma Real · entrada',descripcion:'Acceso de cinco estrellas: puerta giratoria, marquesina y llegada con botones.',tam:[130,70],cam:[0,1.7,27],target:[0,3.4,1],alto:36}
};
export const areaDe=id=>ZONAS[id]?.area||id;

export function crearHotelWorld({scene,objetos,onNavigate,onAction,buffetLayout=BUFFET}){
  const zones=new Map(),animated=[],vivos=[],gloss=[],count=new Map();
  const zoneConfig={...ZONAS,buffet:{...ZONAS.buffet,tam:[buffetLayout.room.width,buffetLayout.room.depth],alto:buffetLayout.room.ceiling}};
  let active;
  // Cada llamada crea UNA raíz seleccionable con ID estable, tipo y etiqueta.
  function add(root,tipo,etiqueta,x=0,z=0,y=0,{id,detalle=2,accion,reflect=true,fijo=false,muro,optimizar=true}={}){
    const key=active.userData.id+'-'+tipo,n=(count.get(key)||0)+1;count.set(key,n);id??=key+'-'+String(n).padStart(3,'0');
    if(optimizar&&!root.isLOD)optimizarObjeto(root);active.add(root);if(!fijo)place(root,{cx:x,cz:z,minY:y-(tipo==='piso'?.18:0)});
    root.userData.detalleMin=detalle;root.userData.area=active.userData.id;if(accion)root.userData.accion=accion;if(muro)root.userData.muro=muro;
    if(y===0&&['sofa','butaca','silla','mesa','palmera','recepcion','conserjeria','barra','buffet','cama','mesita','escritorio','mesa-tactil','kiosco','totem'].includes(tipo)){
      const b=box(root),s=crearSombraContacto(b.max.x-b.min.x,b.max.z-b.min.z);s.position.y=.009-root.position.y;root.add(s);
      if(active.userData.id==='buffet'){
        s.quaternion.premultiply(root.quaternion.clone().invert());
        s.position.copy(root.worldToLocal(new T.Vector3((b.min.x+b.max.x)/2,.009,(b.min.z+b.max.z)/2)));
      }
    }
    objetos.registrar(root,{id,tipo,etiqueta});if(root.userData.animar)animated.push(root);if(root.userData.vivo)vivos.push(root);
    if(reflect&&tipo!=='piso'&&tipo!=='alfombra'&&tipo!=='muro')root.traverse(o=>{if(o.isMesh&&o.material?.name!=='contorno')o.layers.enable(REFLECT_LAYER);});
    return root;
  }
  function block(label,w,h,d,color,x,z,y=0,options={}){const r=new T.Group();caja(r,label,w,h,d,color);return add(r,options.tipo||'acabado',label,x,z,y,options);}
  // Rótulo: placa frente a +z girada `rot`; `muro` lo oculta junto a su pared en la vista de corte.
  function text(text,x,z,y=2.4,w=2.5,sub='',options={}){const r=crearRotulo({texto:text,subtexto:sub,ancho:w,alto:sub?.7:.42});active.add(r);r.position.set(x,y,z);r.rotation.y=options.rot||0;
    const n=count.get('rotulo')||0;if(!options.id)count.set('rotulo',n+1);r.userData.area=active.userData.id;r.userData.detalleMin=options.detalle??2;if(options.muro)r.userData.muro=options.muro;
    objetos.registrar(r,{id:options.id||active.userData.id+'-rotulo-'+n,tipo:'rotulo',etiqueta:text});return r;}
  function floor(w,d,tipo='marmol',polish=true){
    const r=add(crearPisoHotel({ancho:w,fondo:d,color:C.stone}),'piso','Piso '+active.userData.id,0,0,0,{id:active.userData.id+'-piso'});
    const reflection=aplicarPiso(r,{ancho:w,fondo:d,tipo,brillante:polish});if(reflection){reflection.userData.reflejoSuperficie=true;gloss.push(reflection);}return r;
  }
  function walls(w,d,h,color=C.ivory){
    const id=active.userData.id;
    if(id==='terraza')return;
    const rear=id==='lobby'?huecosMuroPosterior():id==='habitacion'?[{x:H.balcony.doorX,ancho:H.balcony.doorWidth,alto:2.85}]:id==='buffet'?buffetLayout.rearWindows.x.map(x=>({x,ancho:buffetLayout.rearWindows.width,alto:buffetLayout.rearWindows.height,base:buffetLayout.rearWindows.base})):[];
    add(crearMuroConHuecos({ancho:w,alto:h,color,huecos:rear}),'muro','Muro posterior',0,-d/2,0,{id:id+'-muro-posterior'});
    for(const x of [-1,1]){
      const holes=id==='lobby'&&x===1?huecosMuroEste():id==='buffet'&&x===1?[...buffetLayout.windows.z.map(z=>({x:z,ancho:buffetLayout.windows.width,alto:buffetLayout.windows.height,base:buffetLayout.windows.base})),{x:buffetLayout.door.z,ancho:buffetLayout.door.width,alto:D.doorHeight}]:[];
      const m=crearMuroConHuecos({ancho:d,alto:h,color,huecos:holes});m.rotation.y=-Math.PI/2;add(m,'muro','Muro lateral '+x,x*w/2,0,0,{id:id+'-muro-lateral-'+x});
    }
    if(id==='habitacion')add(crearMuroFrontal(id,{tam:[w,d],alto:h},color),'muro','Muro de entrada',0,d/2,0,{id:id+'-muro-frontal'});
    block('Cornisa posterior',w,.18,.3,C.gold,0,-d/2+.12,h-.28,{id:id+'-cornisa-posterior'});
    for(const x of [-1,1])block('Cornisa lateral',.3,.18,d,C.gold,x*(w/2-.12),0,h-.28,{id:id+'-cornisa-lateral-'+x,muro:id+'-muro-lateral-'+x});
  }
  function portal(label,x,z,dest,{width=4.2,height=5,rotation=0,muro,id,acceso}={}){const r=crearArco({ancho:width,alto:height,grosor:.34,color:C.stone});r.rotation.y=rotation;add(r,'portal',label,x,z,0,{id:id||active.userData.id+'-portal-'+dest,accion:()=>onNavigate(dest,{tipo:'interaccion',acceso}),muro});
    text(label,x+Math.sin(rotation)*.2,z+Math.cos(rotation)*.2,height-.45,width-.3,'',{rot:rotation,muro,...(id?{id:id+'-rotulo'}:{})});}
  // Palmeras solo al aire libre; bajo techo, planta compacta en maceta.
  function palms(spots,alto=3.8,exterior=()=>['fachada','terraza'].includes(active.userData.id)){for(const [x,z] of spots){const out=exterior(x,z);add(out?crearPalma({alto}):crearPlanta({alto:Math.min(alto,1.6)}),out?'palmera':'planta',out?'Palma tropical exterior':'Planta de interior en maceta',x,z);}}
  function flower(x,z,y=.76){add(crearFlorero(),'florero','Arreglo floral',x,z,y);}
  function chandelier(x,z,y=4.6,radio=1){add(crearLustre({radio,alto:ZONAS[active.userData.id].alto-y-.345}),'lustre','Araña de latón suspendida del techo',x,z,y);}
  function loungeSet(x,z,color=C.green){add(crearAlfombra({ancho:6.3,fondo:4.5,color:C.peach}),'alfombra','Tapete tejido colombiano',x,z);add(sofaLOD({ancho:3,color}),'sofa','Sofá de salón',x,z-1.5);for(const side of [-1,1]){const s=sofaLOD({ancho:1.2,color:side<0?C.cloth:color});s.rotation.y=-side*Math.PI/2;add(s,'butaca','Butaca de salón',x+side*2.3,z+.3);}add(mesaLOD({ancho:1.9,fondo:1,alto:.46,color:C.darkWood}),'mesa','Mesa de centro',x,z+.1);flower(x,z+.1,.46);for(const dx of [-.5,.3])block('Libro de arte',.36,.04,.26,dx<0?C.green:C.peach,x+dx,z+.15,.46,{detalle:0,tipo:'libro'});}
  function dining(x,z,i,{color=C.green,round=true}={}){add(mesaLOD({ancho:round?1.6:1.7,fondo:1.1,redonda:round,color:C.ivory}),'mesa','Mesa del restaurante '+i,x,z,0,{id:active.userData.id+'-mesa-'+i});
    for(const [dx,dz,rot] of [[-1.15,0,Math.PI/2],[1.15,0,-Math.PI/2],[0,-1.15,0],[0,1.15,Math.PI]]){const s=sillaLOD({color});s.rotation.y=rot;add(s,'silla','Silla mesa '+i,x+dx,z+dz);}
    add(crearServicioMesa(),'vajilla','Servicio mesa '+i,x,z,.76,{detalle:0});flower(x,z,.76);
  }
  function art(x,z,y=1.3,rotation=0,theme=0){const a=crearArte({ancho:1.4,alto:1.7,tema:Math.abs(theme)%3});a.rotation.y=rotation;return add(a,'arte','Arte botánico colombiano',x,z,y);}
  function buffet(x,z){add(crearMostrador({ancho:8,alto:.9,color:C.wood}),'buffet','Buffet de desayuno colombiano',x,z,0,{accion:()=>onAction('desayuno')});
    for(let i=0;i<4;i++){const r=new T.Group();caja(r,'bandeja',1.1,.04,.52,C.gold);for(let k=0;k<9;k++)esfera(r,'fruta-'+k,.08,[C.peach,C.gold,C.green,C.ivory][i],(k%3-1)*.22,.12,(Math.floor(k/3)-1)*.15);add(r,'bandeja','Bandeja de desayuno '+i,x-2.7+i*1.8,z,.9,{detalle:1});}
    text('DESAYUNO COLOMBIANO',x,z-.3,1.9,4.3,'6:30–10:00 · CAFÉ DE ORIGEN');
  }
  function buildBuffet(cfg){
    const id='buffet',[w,d]=cfg.tam;
    // Copia alternativa del restaurante, tipo buffet de hotel de lujo (constantes en BUFFET). Todo bajo techo: sin patio ni fuente;
    // la terraza es la zona `terraza`, a la que se sale por una puerta del muro este.
    const B=buffetLayout,H0=B.height,este='buffet-muro-lateral-1',pared=B.serviceRear,RM=B.decoration,ST=B.stage;
    text('JARDÍN DE PALMA',RM.title.x,RM.title.z,RM.title.base,RM.title.width,'BUFFET · GASTRONOMÍA COLOMBIANA');
    for(const [row,z] of B.westTables.z.entries())for(const [col,x] of B.westTables.x.entries())dining(x,z,row*B.westTables.x.length+col+1);
    let n=10;for(const x of B.eastTables.x)for(const z of B.eastTables.z)dining(x,z,n++);
    for(const x of B.gallery.x){add(crearArco({ancho:B.gallery.width,alto:B.gallery.height,grosor:B.gallery.depth}),'arco','Galería del restaurante',x,B.gallery.z);add(crearVentana({ancho:B.rearWindows.width,alto:B.rearWindows.height,vidrio:B.glass}),'ventana','Ventanal del jardín',x,B.rearWindows.z,B.rearWindows.base);}
    const banquette=sofaLOD({ancho:RM.banquette.width,color:C.teal});banquette.rotation.y=Math.PI/2;add(banquette,'sofa','Banqueta del restaurante',RM.banquette.x,RM.banquette.z);
    for(const z of RM.art.z){art(RM.art.x,z,RM.art.base,Math.PI/2,Math.round(z));block('Panel de madera restaurante',RM.art.panelWidth,RM.art.panelHeight,RM.art.panelDepth,C.wood,RM.art.panelX,z,0);}
    // Muro este: tres ventanales al jardín y la puerta a la terraza (hueco de 2,4 m bajo el arco).
    for(const z of B.windows.z){const v=crearVentana({ancho:B.windows.width,alto:B.windows.height,vidrio:B.glass});v.rotation.y=-Math.PI/2;add(v,'ventana','Ventanal del muro este',B.room.east,z,B.windows.base,{muro:este});}
    portal('TERRAZA',B.room.eastInner,B.door.z,'terraza',{width:B.door.width,height:B.door.height,rotation:-Math.PI/2,muro:este});portal('LOBBY',FRONT_OPENINGS.buffet[0].x,B.room.front,'lobby',{height:FRONT_OPENINGS.buffet[0].alto,muro:id+'-muro-frontal'});
    palms(RM.plants,3.5,()=>false);
    for(const p of RM.chandeliers)chandelier(...p,RM.chandelierBase,RM.chandelierRadius);
    for(const z of RM.beamsZ)block('Viga del salón',w-RM.beamInset,RM.beamHeight,RM.beamDepth,C.wood,0,z,RM.beamBase,{tipo:'techo',reflect:false});
    // Estaciones. `sobre` apoya una pieza en la encimera (y = altura del buffet); `dosel` cuelga un dosel de luz del techo.
    const sobre=(root,tipo,label,x,z,rot=0)=>{root.rotation.y=rot;return add(root,tipo,label,x,z,H0,{detalle:1});};
    const dosel=(label,x,z,largo,fondo,radio,rotulo)=>{const k=B.canopy,d=crearDosel({largo,fondo,alto:k.height,radio,techo:cfg.alto-(k.base+k.height)});
      add(d,'luminaria',label,0,0,0,{fijo:true}).position.set(x,k.base,z);text(rotulo,x,z+fondo/2+.03,k.base+k.height/2,Math.min(largo-.4,3.6),'',{detalle:2});return d;};
    // Isla central fría: entradas, ensaladas, fruta, panes y jugos, con hielo y flores al centro.
    const I=B.island,C0=B.canopy;
    add(crearIslaBuffet({largo:I.length,fondo:I.depth,alto:H0,radio:I.radius,nichos:I.niches}),'buffet','Isla central del buffet · entradas y ensaladas',I.x,I.z,0,{id:'buffet-isla-central',accion:()=>onAction('buffet')});
    sobre(crearEsculturaHielo(),'hielo','Escultura de hielo',I.x,I.z);for(const dx of [-1.3,1.3])sobre(crearFlorero(),'florero','Arreglo floral del buffet',I.x+dx,I.z);
    for(const [i,[dx,comida]] of [[-1.5,C.gold],[-.5,C.peach],[.5,'#c99a5b'],[1.5,C.leaf]].entries())sobre(crearChafing({comida}),'chafing','Bandeja caliente '+(i+1),I.x+dx,I.z+.62);
    sobre(crearCuenco({colores:[C.peach,C.gold,'#c2414b',C.leaf]}),'cuenco','Frutas tropicales',I.x-1.8,I.z-.62);sobre(crearCestaPan(),'pan','Cesta de panes',I.x-1,I.z-.62);
    sobre(crearJarrasJugo(),'jugo','Jarras de jugo natural',I.x,I.z-.62,Math.PI);sobre(crearCestaPan(),'pan','Cesta de panes',I.x+1,I.z-.62);
    sobre(crearCuenco({colores:[C.leaf,C.peach,C.ivory]}),'cuenco','Ensalada fresca',I.x+1.8,I.z-.62);
    for(const sx of [-1,1])for(const sz of [-1,1])sobre(crearPilaPlatos(),'platos','Platos del buffet',I.x+sx*2.35,I.z+sz*.35);
    dosel('Dosel de luz de la isla central',I.x,I.z,I.length+2*C0.margin,I.depth+2*C0.margin,I.radius+C0.margin,'ISLA FRÍA · ENTRADAS Y ENSALADAS');
    // Parrilla y carvery contra el muro posterior, mirando al salón: asado, lámpara de calor y tres bandejas.
    const Cv=B.carvery,carv=add(crearIslaBuffet({largo:Cv.length,fondo:Cv.depth,alto:H0,radio:Cv.radius,nichos:Cv.niches,lados:'frente'}),'buffet','Parrilla y carvery',Cv.x,0,0,{id:'buffet-carvery',accion:()=>onAction('carvery')});
    place(carv,{minZ:pared},{physical:true});const cb=box(carv,{physical:true}),cz=(cb.min.z+cb.max.z)/2;
    sobre(crearAsado(),'asado','Asado en la tabla de carvery',Cv.x-1.55,cz);sobre(crearLamparaCalor(),'lampara','Lámpara de calor del carvery',Cv.x-1.55,cz);
    for(const [i,[dx,comida]] of [[-.4,'#a0603c'],[.65,C.gold],[1.7,C.leaf]].entries())sobre(crearChafing({comida}),'chafing','Bandeja del carvery '+(i+1),Cv.x+dx,cz);
    dosel('Dosel de luz del carvery',Cv.x,cz+C0.margin/2-.01,Cv.length+2*C0.margin,Cv.depth+C0.margin,Cv.radius+C0.margin,'PARRILLA Y CARVERY');
    // Isla de postres redonda junto al escenario: fuente de chocolate, torres de cupcakes y campanas con tarta.
    const Ds=B.desserts,rd=Ds.diameter/2;
    add(crearIslaBuffet({largo:Ds.diameter,fondo:Ds.diameter,alto:H0,radio:rd,nichos:0}),'buffet','Isla de postres',Ds.x,Ds.z,0,{id:'buffet-postres',accion:()=>onAction('postres')});
    sobre(crearFuenteChocolate(),'chocolate','Fuente de chocolate',Ds.x,Ds.z);
    for(const a of [90,210,330])sobre(crearTorrePostres(),'postres','Torre de postres',Ds.x+Math.cos(a*Math.PI/180)*.95,Ds.z+Math.sin(a*Math.PI/180)*.95);
    for(const a of [30,150,270])sobre(crearCloche(),'postres','Tarta bajo campana',Ds.x+Math.cos(a*Math.PI/180)*1,Ds.z+Math.sin(a*Math.PI/180)*1);
    dosel('Dosel de luz de la isla de postres',Ds.x,Ds.z,Ds.diameter+2*C0.margin,Ds.diameter+2*C0.margin,rd+C0.margin,'POSTRES');
    // Línea de desayuno colombiano contra el muro posterior (oeste): lo que anuncia la carta digital.
    const Bk=B.breakfast,linea=add(crearIslaBuffet({largo:Bk.length,fondo:Bk.depth,alto:H0,radio:Bk.radius,nichos:Bk.niches,lados:'frente'}),'buffet','Línea de desayuno colombiano',Bk.x,0,0,{id:'buffet-desayuno',accion:()=>onAction('desayuno')});
    place(linea,{minZ:pared},{physical:true});const lb=box(linea,{physical:true}),lz=(lb.min.z+lb.max.z)/2;
    for(const [i,[dx,comida]] of [[-3,C.gold],[-2,C.peach],[-1,'#c99a5b']].entries())sobre(crearChafing({comida}),'chafing','Bandeja de desayuno '+(i+1),Bk.x+dx,lz);
    sobre(crearCestaPan(),'pan','Cesta de arepas y pan',Bk.x+.1,lz);sobre(crearCuenco(),'cuenco','Frutas tropicales',Bk.x+.9,lz);sobre(crearCuenco({colores:[C.gold,C.peach,C.ivory]}),'cuenco','Frutas de temporada',Bk.x+1.6,lz);
    sobre(crearJarrasJugo(),'jugo','Jarras de jugo natural',Bk.x+2.7,lz);for(const dx of [-3.75,3.75])sobre(crearPilaPlatos(),'platos','Platos del buffet',Bk.x+dx,lz);
    text('DESAYUNO COLOMBIANO',Bk.x,pared+.03,RM.breakfastLabel.base,RM.breakfastLabel.width,'6:30–10:00 · CAFÉ DE ORIGEN');
    // Carta digital y música en vivo: iguales a las del restaurante original (ids propios de esta zona).
    const carta=add(crearPantalla({ancho:RM.menu.width,alto:RM.menu.height,programa:'carta',px:300,opciones:{titulo:'DESAYUNO · JARDÍN DE PALMA',items:DESAYUNO}}),'pantalla','Carta digital del desayuno',0,0,0,{id:'buffet-pantalla-carta',fijo:true,muro:'buffet-muro-lateral--1'});
    carta.rotation.y=Math.PI/2;carta.position.set(B.room.westInner,RM.menu.base,RM.menu.z);
    const Y0=ST.height;
    const en=(root,tipo,label,eid,x,z,y=Y0)=>{root.rotation.y=ST.rotation;return add(root,tipo,label,x,z,y,{id:'buffet-'+eid});};
    const tarima=en(crearTarima({ancho:ST.width,fondo:ST.depth,alto:Y0}),'tarima','Tarima del escenario de música en vivo','tarima',ST.x,ST.z,0);
    place(tarima,{cx:ST.x,maxZ:ST.backZ,minY:0});
    const telon=en(crearTelon({ancho:ST.width,alto:ST.backdrop.height,fondo:ST.backdrop.thickness}),'telon','Telón de nogal del escenario','telon',ST.x,ST.backZ);
    place(telon,{cx:ST.x,maxZ:box(tarima).max.z,minY:Y0});
    const faceZ=box(telon).min.z;
    const led=crearPantalla({ancho:ST.screen.width,alto:ST.screen.height,programa:'musica',px:300});led.rotation.y=ST.rotation;
    place(add(led,'pantalla','Pantalla LED del escenario · música en vivo',0,0,0,{id:'buffet-pantalla-escenario',fijo:true,accion:()=>onAction('musica')}),{cx:ST.x,maxZ:faceZ-ST.equipmentGap,minY:Y0+ST.screen.base});
    text('ESCENARIO PALMA',ST.x,faceZ-ST.equipmentGap,Y0+ST.screen.base+ST.screen.height+ST.labelGap,ST.labelWidth,'NOCHES DE MÚSICA',{rot:ST.rotation});
    const piano=en(crearPiano(),'piano','Piano vertical del escenario','piano',ST.pianoX,ST.z);
    place(piano,{cx:ST.pianoX,maxZ:faceZ-ST.equipmentGap,minY:Y0});
    const banco=sillaLOD({taburete:true,color:C.peach});
    place(add(banco,'taburete','Banqueta del pianista',ST.pianoX,ST.z,Y0,{id:'buffet-banqueta-piano'}),{cx:ST.pianoX,maxZ:box(piano).min.z-ST.benchGap,minY:Y0});
    en(crearMicrofono(),'microfono','Micrófono de pie del escenario','microfono',ST.microphoneX,box(tarima).min.z+ST.microphoneInset);
    for(const [i,x] of ST.speakerX.entries())place(en(crearAltavoz(),'altavoz','Altavoz del escenario '+(i+1),'altavoz-'+(i+1),x,ST.z),{cx:x,maxZ:faceZ-ST.equipmentGap,minY:Y0});
    for(const [i,x] of ST.lightX.entries())add(crearDownlight(),'luminaria','Foco del escenario '+(i+1),0,0,0,{id:'buffet-foco-escenario-'+(i+1),fijo:true}).position.set(x,cfg.alto,ST.z);
    return active;
  }
  async function build(id){if(zones.has(id))return zones.get(id);const cfg=zoneConfig[id];const group=new T.Group();group.name='area-'+id;group.userData={id};group.visible=false;scene.add(group);zones.set(id,group);active=group;
    if(id==='fachada'){await fachada(group);return group;}
    if(id==='pasillo'){pasillo();return group;}
    const [w,d]=cfg.tam;floor(w,d,id==='bar'||id==='habitacion'?'madera':'marmol',id!=='terraza');walls(w,d,cfg.alto,id==='bar'?C.darkWood:C.ivory);
    if(id!=='terraza')block('Techo de '+id,id==='restaurante'?21:w,.16,d,id==='bar'?'#78583e':'#efe7d7',id==='restaurante'?-4.5:0,0,cfg.alto,{tipo:'techo',reflect:false});
    if(id==='lobby'){
      // Gran atrio de doble altura: recepción al fondo, salones a los lados y núcleo vertical al este.
      const A=cfg.alto;
      add(crearMuro({ancho:18,alto:5.8,color:C.green}),'muro','Fondo monumental de recepción',0,-11.6);
      for(const x of [-8.5,8.5])block('Pilastro recepción',.34,5.8,.24,C.gold,x,-11.36);
      block('Cornisa recepción',18,.22,.3,C.gold,0,-11.3,5.65);
      text('PALMA REAL',0,-11.35,4.5,8,'GRAND HOTEL · COLOMBIA');
      add(crearMostrador({ancho:11,alto:1.05,fondo:1.2,accesible:true}),'recepcion','Front Desk · registro y atención',0,-9,0,{id:'recepcion-001',accion:()=>onAction('entrada')});
      for(const x of [-3.6,0,3.6]){const r=new T.Group();caja(r,'pie',.17,.21,.17,C.gold);caja(r,'pantalla',.46,.28,.045,C.ink,0,.33);add(r,'terminal','Terminal de recepción',x,-9,1.05,{detalle:1});}
      for(const x of [-4.6,4.6])flower(x,-9,1.05);
      const bell=new T.Group();cilindro(bell,'campana',.12,.04,C.gold);esfera(bell,'cúpula',.095,C.gold,0,.07);add(bell,'timbre','Timbre de recepción',1.4,-8.55,1.05,{id:'timbre-001',accion:()=>onAction('timbre')});
      for(const x of [-20,-12,12,20]){add(crearColumna({alto:A}),'columna','Columna del atrio',x,-4);add(crearColumna({alto:A}),'columna','Columna del atrio',x,10);}
      for(const [x,dest,label] of [[-17,'restaurante','RESTAURANTE'],[17,'bar','LOUNGE BAR']])portal(label,x,-13.9,dest,{width:5.3,height:5.6});
      portal('CONSERJERÍA',L.wallX,L.conciergeZ,'conserjeria',{width:L.conciergeWidth,height:L.conciergeHeight,rotation:-Math.PI/2});
      // Tecnología del lobby: pantalla sobre la recepción (pegada al fondo verde), auto check-in y tótem de orientación.
      const W0=LOBBY_TECH.welcome,KT=LOBBY_TECH.kiosks;
      add(crearPantalla({ancho:W0.width,alto:W0.height,programa:'bienvenida',px:128,fondo:.1,marco:.05}),'pantalla','Pantalla de bienvenida sobre la recepción',0,0,0,{id:'lobby-pantalla-bienvenida',fijo:true}).position.set(0,W0.base,W0.wallZ);
      for(const [i,x] of KT.x.entries())add(crearKiosco(),'kiosco','Kiosco de auto check-in '+(i+1),x,KT.z,0,{id:'lobby-kiosco-'+(i+1),accion:()=>onAction('entrada')});
      add(crearTotemDigital(),'totem','Tótem digital de orientación',LOBBY_TECH.directory.x,LOBBY_TECH.directory.z,0,{id:'lobby-totem-directorio',accion:()=>onAction('directorio')});
      // Conjuntos GLB del lobby: se excluyen la pared y la alfombra incluidas en el modelo.
      const [{GLTFLoader},{adaptarArticuloCatalogo}]=await Promise.all([import('../vendor/GLTFLoader.js'),import('./ArticuloCatalogo.js')]);
      const glbUrl=new URL('../assets/mobiliario/sofa_set_01_spanstories.glb',import.meta.url);
      const gltf=await new GLTFLoader().loadAsync(glbUrl.href),source=gltf.scene;
      const extras=[];source.traverse(node=>{const name=node.userData.name||node.name;if(name==='Plane.004_Material.001_0'||name==='Plane.004_Material.002_0')extras.push(node);});
      for(const node of extras)node.removeFromParent();
      const set=adaptarArticuloCatalogo(source,{ficha:{catalogoId:'sofa-set-01',nombre:'Conjunto de sofás del lobby',rutaOrigen:'mobiliario/sofa_set_01_spanstories.glb'},id:'lobby-sofa-set',tipo:'mueble',etiqueta:'Conjunto de sofás y mesa del lobby',conservarTexturas:true});
      // Escala humana: la cara superior del asiento del GLB queda a 46 cm del suelo.
      const sourceBounds=new T.Box3().setFromObject(source),seat=source.getObjectByName('Box040_Sofa_Dark_0');
      const seatHeight=new T.Box3().setFromObject(seat).max.y-sourceBounds.min.y;
      set.scale.setScalar(.46/seatHeight);set.updateMatrixWorld(true);
      const centered=new T.Box3().setFromObject(set),center=centered.getCenter(new T.Vector3());set.position.set(-center.x,-centered.min.y,-center.z);
      // El GLB conserva sus mallas: sus atributos distintos no admiten la fusión del mobiliario procedural.
      for(const [i,[x,z]] of [[-15,3],[-15,-5],[15,5]].entries())add(set.clone(true),'sofa','Conjunto de sofás y mesa '+(i+1),x,z,0,{id:'lobby-sofa-set-'+(i+1),optimizar:false});
      add(crearMedallon({radio:3.1}),'medallon','Rosa de los vientos del atrio',0,5);add(mesaLOD({redonda:true,ancho:2.4,alto:.85,color:C.ivory}),'mesa','Mesa floral central',0,5);flower(0,5,.85);
      palms([[-9,-10],[9,-10],[-21,6],[20.4,6.8],[-21,-8],[10,9]],4.7);
      for(const [x,z] of [[-13,3],[0,-3],[14,5]])chandelier(x,z,4.7,1.65);
      for(const z of [-9,-3,3,9]){const a=crearArco({ancho:4.8,alto:6,grosor:.3,color:C.stone});a.rotation.y=Math.PI/2;add(a,'arco','Arcada lateral del lobby',-23.6,z);art(-23.25,z,1.4,Math.PI/2,Math.round(z));}
      for(const z of [-9,-3,3,9]){const pane=crearVentana({ancho:3.9,alto:4.3});pane.rotation.y=Math.PI/2;add(pane,'ventana','Ventanal alto del atrio',-23.82,z,.45);}
      block('Revestimiento de piedra recepción',18,.28,.3,C.stone,0,-11.2,.12);
      for(const x of [-7.2,7.2])art(x,-11.25,1.7,0,x<0?0:1);
      // Techo artesonado: piezas baratas que se conservan en las tres calidades.
      for(const z of [-9,-4,1,6,11])block('Casetón del atrio',47,.15,.18,C.wood,0,z,A-.15);
      for(const x of [-8,8])block('Viga principal del atrio',.28,.3,28,C.darkWood,x,0,A-.3);
      nucleoVertical();
    }else if(id==='conserjeria'){
      add(crearMostrador({ancho:5,alto:.85,fondo:1,color:C.wood}),'conserjeria','Mesa de atención personalizada',0,-3,0,{id:'conserjeria-001',accion:()=>onAction('tour')});flower(1.8,-3,.85);
      text('CONSERJERÍA',0,-7.7,3.4,5,'EXPERIENCIAS · COLOMBIA');
      for(const x of [-6,6]){add(crearBiombo({ancho:3,alto:3.8}),'biombo','Biblioteca de viajes',x,-7.65);for(const y of [.7,1.5,2.3,3.1])block('Repisa biblioteca',2.8,.08,.4,C.wood,x,-7.3,y);for(let i=0;i<18;i++)block('Libro de viajes',.1,.28,.2,[C.peach,C.green,C.gold][i%3],x-1.1+(i%9)*.25,-7.1,.8+Math.floor(i/9)*1.6,{detalle:0,tipo:'libro'});}
      loungeSet(-4,3,C.teal);add(sillaLOD({color:C.green}),'silla','Silla atención',-.7,-1.5);add(sillaLOD({color:C.green}),'silla','Silla atención',.7,-1.5);
      for(const x of [-8,8])palms([[x,-5]],3.5);art(8,1,1.2,-Math.PI/2);art(-8,0,1.2,Math.PI/2);chandelier(0,0,3.2,1.1);portal('VOLVER AL LOBBY',FRONT_OPENINGS.conserjeria[0].x,d/2,'lobby',{height:3.5,width:3,muro:id+'-muro-frontal'});
      // Tecnología integrada: tablero de salidas sobre el muro del fondo y mesa táctil con el mapa de excursiones.
      const SB=SALAS_TECH.conserjeria.board,SM=SALAS_TECH.conserjeria.table;
      add(crearPantalla({ancho:SB.width,alto:SB.height,programa:'tablero',px:300}),'pantalla','Tablero digital de excursiones y traslados',0,0,0,{id:'conserjeria-pantalla-salidas',fijo:true,muro:'conserjeria-muro-posterior'}).position.set(0,SB.base,-d/2+.1);
      add(crearMesaTactil({ancho:SM.width,fondo:SM.depth}),'mesa-tactil','Mesa táctil del mapa de excursiones',SM.x,SM.z,0,{id:'conserjeria-mesa-tactil',accion:()=>onAction('tour')});
      for(const sx of [-.5,.5]){const stool=sillaLOD({taburete:true,color:C.peach});stool.rotation.y=Math.PI;add(stool,'taburete','Taburete de la mesa táctil',SM.x+sx,SM.z+SM.depth/2+SM.stool);}
      const rack=new T.Group();caja(rack,'base',3,.12,.8,C.wood);for(const x of [-1.3,0,1.3])caja(rack,'divisor-'+x,.05,1.4,.7,C.gold,x,.75);add(rack,'guardaequipajes','Guardaequipajes',6,3,0,{id:'guardaequipajes-001',accion:()=>onAction('equipaje')});
    }else if(id==='restaurante'){
      text('JARDÍN DE PALMA',-3,-12.7,4.25,7,'GASTRONOMÍA COLOMBIANA');
      for(let row=0;row<3;row++)for(let col=0;col<3;col++)dining(-10+col*5,-7+row*5,row*3+col+1);
      buffet(-5,-11);for(const x of [-12,-6,0,6,12]){add(crearArco({ancho:4.5,alto:5.1,grosor:.25}),'arco','Galería del restaurante',x,-12.55);}
      for(const x of [-12,-6,0,6,12])add(crearVentana({ancho:3.75,alto:3.8}),'ventana','Ventanal del patio',x,-12.75,.3);
      const banquette=sofaLOD({ancho:8,color:C.teal});banquette.rotation.y=Math.PI/2;add(banquette,'sofa','Banqueta del restaurante',-14,0);
      for(const z of [-7,-2,3,8]){art(-14.76,z,1.6,Math.PI/2,Math.round(z));block('Panel de madera restaurante',.12,1.1,4.7,C.wood,-14.75,z,0);}
      block('Muro del patio',.14,1.1,21,C.stone,6,-1);add(crearFuente(),'fuente','Fuente del patio del restaurante',10,-3);
      // El techo cubre hasta el muro del patio (x = 6): al este es patio abierto.
      const patio=x=>x>ZONAS.restaurante.cubierta[2];
      palms([[8,-10],[13,-9],[12,2],[8,7],[-13,8]],3.5,patio);for(const p of [[-7,-4],[-7,5],[1,0]])chandelier(...p,3.8,1.2);
      for(const z of [-10,-5,0,5,10])block('Viga del salón',21,.16,.22,C.wood,-4.5,z,5.3);
      portal('TERRAZA',FRONT_OPENINGS.restaurante[1].x,d/2,'terraza',{height:4.3,muro:id+'-muro-frontal'});portal('LOBBY',FRONT_OPENINGS.restaurante[0].x,d/2,'lobby',{height:4.3,muro:id+'-muro-frontal'});
      const RM=SALAS_TECH.restaurante.menu;
      add(crearPantalla({ancho:RM.width,alto:RM.height,programa:'carta',px:300,opciones:{titulo:'DESAYUNO · JARDÍN DE PALMA',items:DESAYUNO}}),'pantalla','Carta digital del desayuno',0,0,0,{id:'restaurante-pantalla-carta',fijo:true,muro:'restaurante-muro-lateral--1'}).rotation.y=Math.PI/2;
      objetos.obtener('restaurante-pantalla-carta').position.set(-w/2+.1,RM.base,RM.z);
      // Música en vivo: tarima, telón con pantalla LED, piano, micrófonos y altavoces. Todo se deriva de `stage`:
      // el telón apoya su espalda en el muro del patio y el resto se asienta sobre la tarima y delante del telón.
      const ST=SALAS_TECH.restaurante.stage,backX=ST.frontX+ST.depth,faceX=backX-ST.backdrop.thickness,Y0=ST.height,R90=-Math.PI/2;
      const en=(root,tipo,label,id,x,z,y=Y0,extra={})=>{root.rotation.y=extra.rot??R90;return add(root,tipo,label,x,z,y,{id,...extra.opts});};
      en(crearTarima({ancho:ST.width,fondo:ST.depth,alto:Y0}),'tarima','Tarima del escenario de música en vivo','restaurante-tarima',(ST.frontX+backX)/2,ST.z,0);
      place(en(crearTelon({ancho:ST.width,alto:ST.backdrop.height,fondo:ST.backdrop.thickness}),'telon','Telón de nogal del escenario','restaurante-telon',backX,ST.z),{maxX:backX});
      const led=crearPantalla({ancho:ST.screen.width,alto:ST.screen.height,programa:'musica',px:300});led.rotation.y=R90;
      add(led,'pantalla','Pantalla LED del escenario · música en vivo',0,0,0,{id:'restaurante-pantalla-escenario',fijo:true,accion:()=>onAction('musica')}).position.set(faceX,Y0+ST.screen.base,ST.z);
      text('ESCENARIO PALMA',faceX-.03,ST.z,Y0+ST.screen.base+ST.screen.height+.4,3.2,'NOCHES DE MÚSICA',{rot:R90});
      const piano=en(crearPiano(),'piano','Piano vertical del escenario','restaurante-piano',0,ST.z+1.8);place(piano,{maxX:faceX-.02});
      const banco=sillaLOD({taburete:true,color:C.peach});banco.rotation.y=-R90;add(banco,'taburete','Banqueta del pianista',faceX-.02-.62-.3,ST.z+1.8,Y0,{id:'restaurante-banqueta-piano'});
      en(crearMicrofono(),'microfono','Micrófono de pie del escenario','restaurante-microfono',ST.frontX+1.3,ST.z-.9);
      for(const [i,dz] of [-2.3,.7].entries()){const sp=en(crearAltavoz(),'altavoz','Altavoz del escenario '+(i+1),'restaurante-altavoz-'+(i+1),0,ST.z+dz);place(sp,{maxX:faceX-.03});}
      for(const [i,dz] of [-1.8,0,1.8].entries())add(crearDownlight(),'luminaria','Foco del escenario '+(i+1),0,0,0,{id:'restaurante-foco-escenario-'+(i+1),fijo:true}).position.set((ST.frontX+backX)/2,ZONAS.restaurante.alto,ST.z+dz);
    }else if(id==='buffet'){
      buildBuffet(cfg);
    }else if(id==='bar'){
      text('EL CORAL',0,-10.7,4,5.5,'LOUNGE BAR · BOTÁNICA DEL CARIBE');
      add(crearMostrador({ancho:13,alto:1.1,fondo:1.25,color:C.teal}),'barra','Bar principal El Coral',0,-6,0,{id:'bar-001',accion:()=>onAction('bebida')});
      for(const x of [-5,-2.5,0,2.5,5]){const rack=new T.Group();for(const y of [0,.6,1.2,1.8])caja(rack,'repisa-'+y,2.15,.075,.5,C.gold,0,y);for(const dx of [-1,1])caja(rack,'costado-'+dx,.07,2,.5,C.wood,dx,1);add(rack,'estanteria','Botellero de barra',x,-10.3,1.3);}
      for(let i=0;i<35;i++){const r=new T.Group(),color=[C.green,C.gold,C.peach,C.blue][i%4];cilindro(r,'botella',.07,.24,color);cilindro(r,'cuello',.03,.12,color,0,.3);caja(r,'etiqueta',.07,.1,.01,C.ivory,0,.13,.068,false);add(r,'botella','Botella decorativa '+i,-5.4+(i%12)*.98,-10,1.45+Math.floor(i/12)*.6,{detalle:1});}
      for(let i=0;i<7;i++){const s=sillaLOD({taburete:true,color:C.peach});s.rotation.y=Math.PI;add(s,'taburete','Taburete de barra',-5.4+i*1.8,-4.5);}
      for(const p of [[-7,3],[2,3]])loungeSet(...p,C.cloth);for(const x of [-5,0,5])chandelier(x,-6,3.6,.75);
      for(const z of [-6,1,8])block('Viga de madera del bar',26,.25,.25,C.wood,0,z,4.7);for(const x of [-11,11])palms([[x,-2],[x,7]],3.6);
      for(const x of [-10,-5,0,5,10])add(crearArco({ancho:3.8,alto:4.6,color:C.wood}),'arco','Arcada lounge',x,-10.5);
      portal('TERRAZA',FRONT_OPENINGS.bar[1].x,d/2,'terraza',{height:4,width:3,muro:id+'-muro-frontal'});portal('LOBBY',FRONT_OPENINGS.bar[0].x,d/2,'lobby',{height:4,width:3,muro:id+'-muro-frontal'});
      // TV deportivas y carta digital en los muros laterales (origen sobre la cara del muro).
      for(const [i,[s,z,programa]] of [[-1,-4.2,'deportes'],[-1,.8,'carta'],[1,-4.2,'carta'],[1,.8,'deportes']].entries()){
        const tv=crearPantalla({ancho:1.9,alto:1.07,programa,px:300});tv.rotation.y=-s*Math.PI/2;
        add(tv,'pantalla',(programa==='carta'?'Carta digital':'TV deportes')+' del bar '+(i+1),0,0,0,{id:'bar-pantalla-'+(i+1),fijo:true,muro:id+'-muro-lateral-'+s}).position.set(s*(w/2-.1),1.7,z);}
    }else if(id==='terraza'){
      // En terraza no hay muros altos: horizonte ilustrado y perímetro vegetal.
      for(const r of group.children)if(r.userData.tipo==='muro'){r.visible=false;r.userData.ocultoEnCorte=true;}
      for(const x of [-13,1,13])for(const z of [-10,8])add(crearColumna({alto:3.9}),'columna','Pilar de pérgola',x,z);
      for(const z of [-10,-8,-6,-4,-2,0,2,4,6,8])block('Viga pérgola',27,.14,.18,C.wood,0,z,3.75);
      for(const [i,x,z] of [[1,-9,-5],[2,-3,-5],[3,4,-5],[4,10,-5]])dining(x,z,'terraza-'+i,{color:C.cloth});
      loungeSet(-7,5,C.cloth);loungeSet(7,5,C.teal);add(crearFuente(),'fuente','Fuente del jardín tropical',0,4);
      // Palmeras fuera de la pérgola (|x| > 13,5 o entre la pérgola y la baranda) y más altas
      // que sus vigas: la corona pasa por encima y no atraviesa pilares.
      palms([[-15,-7],[-15,3],[15,-7],[15,3],[-7,-11],[7,-11]],5.6);
      const railing=new T.Group();caja(railing,'pasamanos',31,.1,.12,C.wood,0,1.05);for(let i=0;i<40;i++)caja(railing,'balaustre-'+i,.04,1,.05,C.gold,-15.2+i*.78,.5);add(railing,'baranda','Baranda de la terraza',0,-11.7);
      text('TERRAZA PALMA',0,-11.5,2.25,5,'CARIBE COLOMBIANO');portal('RESTAURANTE',-11,d/2,'restaurante',{height:3.8,width:3});portal('BAR',11,d/2,'bar',{height:3.8,width:3});
    }else if(id==='habitacion'){
      add(crearAlfombra({ancho:5,fondo:5,color:C.peach}),'alfombra','Alfombra de la suite',-2.4,-2,0);
      block('Cabecero de madera',5.7,2.8,.2,C.darkWood,-2.5,-5.7);text('SUITE PALMA',-2.5,-5.52,2.6,3.3,'201 · COLOMBIA');
      for(const x of [-4.5,-.5])add(crearLampara({alto:1.1}),'lampara','Lámpara apoyada en mesita',x,-4.25,.6,{detalle:1});
      add(mesaLOD({ancho:2.2,fondo:.75,color:C.wood}),'escritorio','Escritorio de la suite',-5,4);const chair=sillaLOD({color:C.teal});chair.rotation.y=Math.PI;add(chair,'silla','Silla escritorio',-5,2.9);
      // Salón compacto: circulación libre hacia balcón y baño, sin butacas contra el televisor.
      add(crearAlfombra({ancho:4.2,fondo:2.8,color:C.peach}),'alfombra','Tapete del salón de la suite',3.5,-1);
      add(sofaLOD({ancho:2.5,color:C.cloth}),'sofa','Sofá de la suite',3.5,.1);
      add(mesaLOD({ancho:1.4,fondo:.7,alto:.46,color:C.darkWood}),'mesa','Mesa del salón de la suite',3.5,-1.1);flower(3.5,-1.1,.46);
      add(crearPuertaBalcon({ancho:H.balcony.doorWidth}),'puerta-balcon','Puerta corredera al balcón',H.balcony.doorX,H.balcony.backZ,0,{id:'puerta-balcon-201'});
      for(const x of [1.55,5.65])block('Cortina de lino',.58,3.1,.18,C.cloth,x,-5.78,0,{tipo:'cortina'});
      add(crearMostrador({ancho:1.9,fondo:.6,alto:.85,color:C.wood}),'minibar','Minibar de la suite',-5.7,1,0,{id:'minibar-001',accion:()=>onAction('minibar')});
      const bathroomSide=crearMuro({ancho:3.8,alto:3.4});bathroomSide.rotation.y=Math.PI/2;add(bathroomSide,'muro','Pared privada del baño',1.2,4.1);
      add(crearMuroConHuecos({ancho:5.8,alto:3.4,huecos:[{x:0,ancho:1.1,alto:2.5}]}),'muro','Entrada del baño',4.1,2.2);
      add(crearPuerta({ancho:.95}),'puerta-bano','Puerta del baño privado',4.1,2.2,0,{id:'puerta-bano-201'});
      add(crearMostrador({ancho:1.3,fondo:.6,alto:.85,color:C.green}),'lavamanos','Mueble del lavamanos',2.4,5.5);const basin=new T.Group();cilindro(basin,'lavabo',.24,.1,C.ivory);cilindro(basin,'grifo',.024,.22,C.gold,.22,.17);add(basin,'lavabo','Lavabo baño',2.4,5.5,.85);
      const toilet=new T.Group();esfera(toilet,'taza',.25,C.ivory,0,.32);caja(toilet,'cisterna',.44,.65,.2,C.ivory,0,.325,-.24);add(toilet,'sanitario','Sanitario del baño',2.4,3.4);
      block('Plato de ducha',1.7,.08,1.7,C.stone,5.9,4.9,0,{tipo:'ducha'});
      block('Mampara de ducha',.06,2.4,1.7,C.blue,5,4.9,.08,{tipo:'mampara'});
      block('Columna de ducha',.035,1.6,.035,C.gold,5.9,5.83,.7,{tipo:'griferia'});
      // La araña cuelga a 2,3 m libres: no se interpone en el paso.
      palms([[-6.1,-.8]],1.5);art(-6.76,-1,1.1,Math.PI/2);chandelier(-1,0,2.55,.65);
      const suiteDoor=add(crearPuerta(),'puerta','Salida de la suite al pasillo',H.suiteEntryX,H.suiteFrontZ,0,{id:'salida-suite-201',accion:()=>onNavigate('pasillo',{tipo:'interaccion'})});suiteDoor.rotation.y=Math.PI;
      balcony();
      await room(group);
      // Tecnología de la suite: la TV existente muestra la bienvenida del hotel (pantalla ajustada a su frente medido)
      // y un panel domótico junto al cabecero, apoyado en el muro del fondo.
      const tv=objetos.obtener('tv-201'),tb=box(tv),tvScreen=crearPantalla({ancho:tb.max.z-tb.min.z,alto:tb.max.y-tb.min.y,programa:'bienvenida',px:300,fondo:.004,marco:.045,contorno:false});tvScreen.rotation.y=-Math.PI/2;
      add(tvScreen,'pantalla','Pantalla de la TV · bienvenida del hotel',0,0,0,{id:'habitacion-pantalla-tv',fijo:true}).position.set(tb.min.x,tb.min.y,(tb.min.z+tb.max.z)/2);
      add(crearPantalla({ancho:.3,alto:.2,programa:'domotica',px:480,fondo:.02,marco:.012}),'pantalla','Panel domótico de la suite',0,0,0,{id:'habitacion-panel-domotico',fijo:true,muro:'habitacion-muro-posterior'}).position.set(.8,1.2,-d/2+.1);
    }
    // Añadir al final conserva los IDs automáticos de los objetos existentes.
    if(!['habitacion','terraza'].includes(id))add(crearMuroFrontal(id,cfg,id==='bar'?C.darkWood:C.ivory),'muro','Muro de entrada',0,d/2,0,{id:id+'-muro-frontal'});
    if(id==='lobby')for(const [i,label] of ['ENTRADA','SALIDA'].entries()){const h=FRONT_OPENINGS.lobby[i],acceso=i?'salida':'entrada';portal(label,h.x,d/2,'fachada',{width:h.ancho,height:h.alto,muro:'lobby-muro-frontal',id:'lobby-portal-'+acceso,acceso});}
    return group;
  }
  // Núcleo vertical en el muro este del lobby: ascensor PB/P1 apilado, escalera de 24
  // contrahuellas y galería de P1 que es el pasillo de las habitaciones 201–203.
  function nucleoVertical(){
    const g=galeria,rot=-Math.PI/2,wallCenter=L.wallX+L.wallThickness/2,este='lobby-muro-lateral-1';
    const len=g.maxZ-g.minZ,cz=(g.maxZ+g.minZ)/2,cx=(g.minX+g.maxX)/2,beamY=F1-L.gallery.beam;
    for(const [y,id,label,action,sign] of [[0,'ascensor-pb','Ascensor · planta baja','ascensor-pb','PB · P1'],[F1,'ascensor-p1','Ascensor · primera planta','ascensor-p1','P1 · PB']]){
      // Las jambas quedan en el plano del muro y las hojas se esconden en su espesor.
      const lift=add(crearAscensor(),'ascensor',label,0,0,y,{id,accion:()=>onAction(action),muro:este,fijo:true});lift.rotation.y=rot;lift.position.set(wallCenter,y,L.liftZ);
      for(const s of [-1,1])block('Revestimiento del ascensor',.12,3,.4,C.green,L.wallX-.06,L.liftZ+s*(L.liftOpening/2+.2),y,{muro:este,id:id+'-revestimiento-'+(s<0?'sur':'norte')});
      block('Dintel del ascensor',.12,.35,L.liftOpening+.8,C.green,L.wallX-.06,L.liftZ,y+2.85,{muro:este,id:id+'-dintel'});
      text('ASCENSOR',L.wallX-.15,L.liftZ,y+3.42,1.9,'',{rot,muro:este});text(sign,L.wallX-.15,L.liftZ,y+2.98,.9,'',{rot,muro:este,detalle:1});
    }
    // Escalera pegada al muro: su último peldaño enrasa con el borde sur de la galería.
    const stairs=add(crearEscalera(),'escalera','Escalera principal a la galería P1',0,0,0,{id:'escalera-001',accion:()=>onNavigate('galeria')});place(stairs,{maxX:escalera.maxX,minZ:escalera.topZ});
    add(crearPisoHotel({ancho:L.gallery.width,fondo:len}),'piso','Losa de la galería de habitaciones',cx,cz,F1,{id:'galeria-p1-losa'});
    block('Viga de borde de la galería',.3,L.gallery.beam,len,C.stone,g.minX+.15,cz,beamY,{id:'galeria-p1-viga-oeste'});
    block('Viga frontal de la galería',L.gallery.width,L.gallery.beam,.3,C.stone,cx,g.maxZ-.15,beamY,{id:'galeria-p1-viga-sur'});
    block('Filete de latón de la galería',.32,.06,len,C.gold,g.minX+.15,cz,beamY-.06,{id:'galeria-p1-filete'});
    text('HABITACIONES 201–212',cx,g.maxZ+.04,F1-.28,2.9,'',{});
    for(const z of L.galleryColumnsZ){const c=add(crearColumna({alto:beamY}),'columna','Columna bajo la galería',g.minX+.18,z);place(c,{maxY:beamY});}
    const side=crearBaranda({ancho:len});side.rotation.y=Math.PI/2;add(side,'baranda','Baranda de la galería sobre el atrio',g.minX+.06,cz,F1,{id:'galeria-p1-baranda-oeste'});
    const stairMinX=box(stairs).min.x,front=crearBaranda({ancho:stairMinX-g.minX});add(front,'baranda','Baranda junto a la llegada de la escalera',(stairMinX+g.minX)/2,g.maxZ-.06,F1,{id:'galeria-p1-baranda-sur'});
    add(crearAlfombra({ancho:1.5,fondo:len-.6,color:C.green}),'alfombra','Alfombra de la galería',cx+.35,cz,F1,{id:'galeria-p1-alfombra'});
    // Fondo de la galería: puerta doble al pasillo de habitaciones (doble crujía, área propia).
    // El muro este de P1 ya no tiene puertas: arte botánico entre los apliques.
    const E=entradaPasillo,doble=crearPuertaDoble({ancho:E.ancho-.2,alto:E.alto});
    add(doble,'puerta','Puerta al pasillo de habitaciones 201–212',E.x,-ZONAS.lobby.tam[1]/2,F1,{id:'puerta-pasillo-p1',accion:()=>onNavigate('pasillo',{tipo:'interaccion'})});
    text('HABITACIONES 201–212',E.x,g.minZ+.04,F1+E.alto+.32,2.4,'',{detalle:2});
    for(const [i,z] of L.galleryArtZ.entries()){const a=crearArte({ancho:1.2,alto:1.5,tema:i+1});a.rotation.y=rot;add(a,'arte','Arte botánico de la galería',L.wallX-.06,z,F1+1.05,{muro:este,id:'galeria-p1-arte-'+(i+1)});}
    for(const z of [-2.4,-6.5,-11]){const lamp=crearAplique();lamp.rotation.y=rot;add(lamp,'aplique','Aplique de latón de la galería',L.wallX-.16,z,F1+2.05,{muro:este});}
    add(crearPlanta({alto:1.3}),'planta','Planta en maceta de la galería, entre el arte y el ascensor',L.wallX-.6,(L.galleryArtZ[1]+L.liftZ)/2,F1);
  }
  // Pasillo de habitaciones de P1, de doble crujía (CORRIDOR). Se entra por la puerta doble de la
  // galería (z = +length/2) mirando a −z: impares a la izquierda, pares a la derecha, cada puerta
  // en un nicho de nogal con su luz y su número; enfrente de cada puerta, un cuadro entre apliques.
  function pasillo(){
    const w=K.width,len=K.length,A=K.height,N=K.door,half=w/2,doors=puertasPasillo(),rotDe=lado=>lado<0?Math.PI/2:-Math.PI/2;
    const muroDe=lado=>'pasillo-muro-lateral-'+lado,pared='#efe4cf';
    add(crearAlfombraPasillo({ancho:w+2*N.niche,largo:len}),'piso','Moqueta del pasillo',0,0,0,{id:'pasillo-piso',fijo:true});
    for(const lado of [-1,1]){
      const huecos=doors.filter(d=>d.lado===lado).map(d=>({x:d.z,ancho:N.nicheWidth,alto:N.nicheHeight}));
      const m=crearMuroConHuecos({ancho:len,alto:A,color:pared,huecos});m.rotation.y=-Math.PI/2;
      add(m,'muro',lado<0?'Muro izquierdo · habitaciones impares':'Muro derecho · habitaciones pares',lado*(half+.1),0,0,{id:muroDe(lado)});
      // Zócalo de nogal solo entre nichos; moldura de latón corrida por encima de ellos.
      const bordes=[len/2,...huecos.flatMap(h=>[h.x+h.ancho/2,h.x-h.ancho/2]),-len/2].sort((a,b)=>b-a);
      for(let i=0;i<bordes.length;i+=2)block('Zócalo de nogal',.03,.14,bordes[i]-bordes[i+1],C.darkWood,lado*(half-.015),(bordes[i]+bordes[i+1])/2,0,{muro:muroDe(lado),id:'pasillo-zocalo-'+lado+'-'+i/2});
      block('Moldura de latón',.03,.05,len,C.gold,lado*(half-.015),0,N.nicheHeight+.1,{muro:muroDe(lado),id:'pasillo-moldura-'+lado});
    }
    for(const d of doors){const s=d.lado,num=d.num,fondo=s*(half+N.niche+.1),muro=muroDe(s),propia=num===201;
      const back=crearMuroConHuecos({ancho:N.nicheWidth,alto:N.nicheHeight,color:'#e2d4b9',huecos:[{x:0,ancho:N.width+.2,alto:N.height+.1}]});back.rotation.y=-Math.PI/2;
      add(back,'muro','Fondo del nicho '+num,fondo,d.z,0,{id:'pasillo-nicho-'+num,muro});
      for(const k of [-1,1])block('Jamba de nogal del nicho',N.niche,N.nicheHeight,.07,C.darkWood,s*(half+N.niche/2),d.z+k*(N.nicheWidth/2-.035),0,{muro,id:'pasillo-nicho-'+num+'-jamba-'+(k<0?'a':'b')});
      block('Techo del nicho',N.niche+.2,.06,N.nicheWidth,C.darkWood,s*(half+N.niche/2+.1),d.z,N.nicheHeight-.06,{muro,id:'pasillo-nicho-'+num+'-techo'});
      for(const k of [-1,1])block('Filete de latón del nicho',.035,N.nicheHeight,.05,C.gold,s*(half-.012),d.z+k*(N.nicheWidth/2+.025),0,{muro,id:'pasillo-nicho-'+num+'-filete-'+(k<0?'a':'b')});
      add(crearDownlight(),'luminaria','Luz del nicho '+num,0,0,0,{id:'pasillo-nicho-'+num+'-luz',fijo:true,muro}).position.set(s*(half+N.niche/2),N.nicheHeight-.06,d.z);
      const door=crearPuerta({ancho:N.width,alto:N.height,color:C.darkWood,sentido:1});door.rotation.y=rotDe(s);
      add(door,'puerta','Puerta habitación '+num+(propia?' · tu suite':' · ocupada'),fondo,d.z,0,{id:'puerta-'+num,muro,accion:propia?()=>onNavigate('habitacion',{tipo:'interaccion'}):()=>onAction('ocupada-'+num)});
      // Número junto al nicho, del lado por el que se llega (+z).
      text(String(num),s*(half-.03),d.z+N.nicheWidth/2+.36,1.55,.5,'',{rot:rotDe(s),muro,detalle:2});
      const eink=crearPantalla({ancho:.2,alto:.28,programa:'puerta',px:700,opciones:{num:String(num),estado:propia?'bienvenido':[204,209].includes(num)?'dnd':'ocupada'},estatica:true,fondo:.015,marco:.012,contorno:false});eink.rotation.y=rotDe(s);
      add(eink,'pantalla','Pantalla de puerta '+num,0,0,0,{id:'pasillo-pantalla-'+num,muro,fijo:true,detalle:1}).position.set(s*half,.8,d.z+N.nicheWidth/2+.36);
      if([204,209].includes(num))block('Luz roja «No molestar»',.03,.05,.05,'#c2414b',s*(half-.03),d.z+N.nicheWidth/2+.36,1.2,{muro,id:'pasillo-no-molestar-'+num,detalle:1});
      // Enfrente, en la otra pared: arte botánico entre dos apliques (salvo donde aparca la camarera).
      if(num===207)continue;
      const o=-s,a=crearArte({ancho:.9,alto:1.15,tema:num%3});a.rotation.y=rotDe(o);add(a,'arte','Arte botánico frente a la '+num,o*(half-.04),d.z,1.15,{id:'pasillo-arte-'+num,muro:muroDe(o)});
      for(const k of [-1,1]){const lamp=crearAplique();lamp.rotation.y=rotDe(o);add(lamp,'aplique','Aplique de latón del pasillo',o*(half-.06),d.z+k*.98,1.62,{id:'pasillo-aplique-'+num+'-'+(k<0?'a':'b'),muro:muroDe(o)});}
    }
    // Carrito de camarera frente a la 207, pegado a la pared derecha.
    const cart=crearCarritoLimpieza();cart.rotation.y=Math.PI/2;add(cart,'carrito','Carrito de camarera',half-.3,doors.find(d=>d.num===207).z,0,{id:'pasillo-carrito-camarera',muro:muroDe(1)});
    // Techo: plafones laterales a 2,62 m y artesón central más alto con dos líneas de luz cálida.
    for(const lado of [-1,1]){block('Plafón lateral del pasillo',.5,.08,len,'#efe7d7',lado*(half-.25),0,K.soffit,{tipo:'techo',reflect:false,id:'pasillo-plafon-'+lado});
      block('Canto del artesón',.04,A-K.soffit,len,'#f4ecdc',lado*(half-.52),0,K.soffit,{tipo:'techo',reflect:false,id:'pasillo-canto-'+lado});
      add(crearLineaLuz({largo:len-.4}),'techo','Línea de luz del artesón',lado*(half-.6),0,A-.03,{id:'pasillo-luz-cornisa-'+lado,reflect:false});}
    block('Techo del pasillo',w,.1,len,'#f6efe1',0,0,A,{tipo:'techo',reflect:false,id:'pasillo-techo'});
    // Fondo: ventana con vista lejana y consola con flores (2 m no dan para plantas a los lados).
    const V=K.window;
    add(crearMuroConHuecos({ancho:w+.4,alto:A,color:pared,huecos:[{x:0,ancho:V.width,alto:V.height,base:V.base}]}),'muro','Muro del fondo con ventana',0,-len/2-.1,0,{id:'pasillo-muro-posterior'});
    add(crearVentana({ancho:V.width,alto:V.height}),'ventana','Ventana del fondo del pasillo',0,-len/2-.1,V.base,{id:'pasillo-ventana'});
    add(crearVistaCaribe(),'panorama','Vista lejana desde el pasillo',0,0,0,{id:'pasillo-panorama',fijo:true,reflect:false}).position.set(0,2.8,-len/2-60);
    add(crearConsola({ancho:1.3}),'mesa','Consola bajo la ventana',0,-len/2+.22,0,{id:'pasillo-consola'});flower(0,-len/2+.22,.8);
    // Entrada: puerta doble que vuelve a la galería del lobby.
    add(crearMuroConHuecos({ancho:w+.4,alto:A,color:pared,huecos:[{x:0,ancho:K.entryWidth,alto:K.entryHeight}]}),'muro','Muro de la entrada del pasillo',0,len/2+.1,0,{id:'pasillo-muro-frontal'});
    const back=crearPuertaDoble({ancho:K.entryWidth-.2,alto:K.entryHeight});back.rotation.y=Math.PI;
    add(back,'puerta','Puerta doble · volver a la galería',0,len/2+.1,0,{id:'puerta-pasillo-galeria',accion:()=>onNavigate('galeria')});
  }
  function balcony(){
    const b=H.balcony,z=b.backZ-b.depth/2;
    add(crearVistaCaribe(),'panorama','Vista lejana del Caribe',b.doorX,-80,-33,{id:'balcon-201-panorama',reflect:false});
    add(crearPisoHotel({ancho:b.width,fondo:b.depth}),'piso','Losa del balcón suite 201',b.doorX,z,0,{id:'balcon-201-piso'});
    add(crearBaranda({ancho:b.width,alto:b.railingHeight}),'baranda','Baranda frontal balcón 201',b.doorX,b.backZ-b.depth+.06,0,{id:'balcon-201-baranda-frontal'});
    for(const side of [-1,1]){const rail=crearBaranda({ancho:b.depth,alto:b.railingHeight});rail.rotation.y=Math.PI/2;add(rail,'baranda','Baranda lateral balcón 201',b.doorX+side*(b.width/2-.06),z,0,{id:'balcon-201-baranda-'+side});}
    for(const [side,rot] of [[-1,Math.PI/2],[1,-Math.PI/2]]){const chair=sillaLOD({color:C.cloth});chair.rotation.y=rot;add(chair,'silla','Butaca exterior del balcón',b.doorX+side*1.45,z,0,{id:'balcon-201-butaca-'+side});}
    add(mesaLOD({ancho:.8,fondo:.8,redonda:true,alto:.6,color:C.stone}),'mesa','Mesa de café del balcón',b.doorX,z,0,{id:'balcon-201-mesa'});
    add(crearPlanta({alto:1.1}),'planta','Maceta exterior del balcón',b.doorX-b.width/2+.5,b.backZ-b.depth+.55,0,{id:'balcon-201-planta'});
    block('Remate del balcón',b.width,.12,.15,C.stone,b.doorX,b.backZ-b.depth+.06,-.16,{tipo:'acabado'});
  }
  async function room(group){const [{GLTFLoader},{adaptarArticuloCatalogo}]=await Promise.all([import('../vendor/GLTFLoader.js'),import('./ArticuloCatalogo.js')]);const base='../assets/catalogo/habitacion/';
    const ficha=await(await fetch(new URL(base+'articulo.json',import.meta.url))).json();const gltf=await new GLTFLoader().loadAsync(new URL(base+ficha.modelo,import.meta.url).href);
    // Cada nodo deriva directamente del original y conserva su identidad semántica.
    for(const [nodoNombre,id,tipo,label,x,z,altura] of [['bed','cama-201','cama','Cama suite 201',-2.5,-3.65,1.45],['bedsidetable','mesita-201-a','mesita','Mesita izquierda',-4.5,-4.25,.6],['bedsidetable (2)','mesita-201-b','mesita','Mesita derecha',-.5,-4.25,.6],['tv','tv-201','televisor','Televisor suite',4.8,-1.4,.8]]){
      const r=adaptarArticuloCatalogo(gltf.scene,{ficha,id,tipo,etiqueta:label,nodoNombre,altura,color:tipo==='cama'?C.cloth:tipo==='televisor'?C.ink:C.wood});
      const size=box(r).getSize(new T.Vector3());
      if(tipo==='cama')r.scale.set(2/size.x,1.25/size.y,2.3/size.z);
      if(tipo==='mesita')r.scale.set(.62/size.x,.6/size.y,.55/size.z);
      if(tipo==='televisor')r.rotation.y=-Math.PI/2;
      active=group;add(r,tipo,label,tipo==='televisor'?6.74:x,z,tipo==='televisor'?1.1:0,{id});
    }
  }
  // Fachada: edificio Grand Hotel original con sus texturas, adaptado solo en planta baja,
  // que es lo que ve el estudiante. Como en el aeropuerto, la cámara está en la acera frente
  // a un muro de entrada recto: puerta giratoria de ENTRADA al centro y SALIDA al este.
  // Todo lo que toca el edificio se coloca sobre su superficie MEDIDA con rayos (la curva).
  async function fachada(group){
    const {cargarArticuloCatalogo}=await import('./ArticuloCatalogo.js');const base=new URL('../assets/fachada/',import.meta.url);
    const ficha=await(await fetch(new URL('articulo.json',base))).json();
    const model=await cargarArticuloCatalogo(new URL('scene.gltf',base).href,{ficha,id:'fachada-grandhotel',tipo:'fachada',etiqueta:'Edificio Grand Hotel (texturas originales)',nodoNombre:'Cube',altura:F.modelHeight,conservarTexturas:true,contorno:false});
    model.rotation.y=Math.PI/2;active=group;group.add(model);place(model,{cx:0,cz:F.modelZ,minY:0});
    objetos.registrar(model,{id:'fachada-grandhotel',tipo:'fachada',etiqueta:'Edificio Grand Hotel (texturas originales)'});model.userData.area='fachada';model.userData.detalleMin=2;
    model.updateMatrixWorld(true);const ray=new T.Raycaster();
    const frente=(x,y)=>{ray.set(new T.Vector3(x,y,200),new T.Vector3(0,0,-1));return ray.intersectObject(model,true)[0]?.point.z??null;};
    const pb=x=>frente(x,1.5),cuerpo=x=>frente(x,F.modelHeight/2);
    const z0=pb(0);ray.set(new T.Vector3(0,.1,z0+.5),new T.Vector3(0,1,0));const libre=ray.intersectObject(model,true)[0].point.y;
    const canopyY=marquesinaBajo(libre),bandY=F.revolving.height+.35,E=F.entrance,zE=z0+E.pierDepth/2,zFace=z0+E.pierDepth;
    group.userData.front=z0;group.userData.medidas={frentePB:z0,alturaLibre:libre,frenteCuerpo:cuerpo(0)};
    // Patio de llegada de sentido único (PlantaPatio): suelos, isla, portones y jardines.
    const P=planPatio(zFace);group.userData.patio=P;
    // Vista inicial desde la acera pública, a un lado del eje: la fuente no tapa la puerta.
    ZONAS.fachada.cam=[P0.legX/3,1.7,P.zP+2];ZONAS.fachada.target=[-1,2.6,zFace+1];
    suelosPatio(P,x=>pb(T.MathUtils.clamp(x,-48,48)));
    // Muro de entrada recto: pilares de piedra y, entre ellos, vidrio o puertas.
    const xs=pilaresEntrada();
    for(const [i,x] of xs.entries()){const end=i===0||i===xs.length-1;
      // Los pilares extremos llegan hasta la curva del edificio: no queda rendija detrás.
      const depth=end?zFace-pb(x)+.1:E.pierDepth,pier=crearPilarPiedra({ancho:E.pier,fondo:depth,alto:canopyY});
      add(pier,'pilar','Pilar de piedra de la entrada',x,zFace-depth/2,0,{id:'fachada-pilar-entrada-'+(i+1)});}
    for(const [i,t] of tramosEntrada().entries()){const cx=(t.min+t.max)/2,w=t.max-t.min;
      if(t.contenido==='vidrio')add(crearPanoVidrio({ancho:w,alto:bandY,modulos:Math.max(1,Math.round(w/1.2))}),'ventana','Paño de vidrio de la entrada',cx,zE,0,{id:'fachada-vidrio-entrada-'+(i+1)});
      else if(t.contenido==='giratoria')add(crearPuertaGiratoria({radio:F.revolving.radius,alto:F.revolving.height}),'puerta','Puerta giratoria · ENTRADA',cx,zE,0,{id:'fachada-puerta-entrada',accion:()=>onNavigate('lobby',{tipo:'interaccion',acceso:'entrada'})});
      else add(crearPuertaBalcon({ancho:w,alto:F.revolving.height}),'puerta','Puerta corredera · SALIDA',cx,zE,0,{id:'fachada-puerta-salida',accion:()=>onNavigate('lobby',{tipo:'interaccion',acceso:'salida'})});
    }
    block('Dintel de bronce de la entrada',E.width,canopyY-bandY,.3,C.darkWood,0,zE,bandY,{id:'fachada-dintel'});
    text('ENTRADA',0,zE+.18,(bandY+canopyY)/2,2);text('SALIDA',F.exit.x,zE+.18,(bandY+canopyY)/2,1.6);
    // Marquesina: losa fina bajo el vuelo que cubre la acera de llegada y los dos carriles; sus
    // columnas se apoyan en la isla, detrás del bordillo, nunca en la calzada.
    const K=F.canopy,depth=P.islandFront+K.overIsland-zFace,columnZ=P.islandFront+P0.islandCurb.width+.3,canopy=new T.Group();
    caja(canopy,'losa',K.width,K.thickness,depth,C.ivory,0,K.thickness/2,depth/2);
    caja(canopy,'fascia',K.width+.08,.5,.12,C.green,0,.15,depth,false);
    for(const s of [-1,1])caja(canopy,'canto-'+s,.1,.5,depth,C.green,s*K.width/2,.15,depth/2,false);
    caja(canopy,'filete',K.width+.1,.05,.14,C.gold,0,-.08,depth,false);
    add(canopy,'marquesina','Marquesina de la entrada',0,0,0,{id:'fachada-marquesina',fijo:true}).position.set(0,canopyY,zFace);
    text('PALMA REAL',0,zFace+depth+.07,canopyY+.15,5.5);
    for(const s of [-1,1])add(crearColumna({alto:canopyY}),'columna','Columna de la marquesina',s*(K.width/2-.5),columnZ,0,{id:'fachada-columna-marquesina-'+(s<0?'oeste':'este')});
    for(const x of [-5,0,5])for(let dz=2.2;dz<depth-.6;dz+=3)add(crearDownlight(),'luminaria','Luz empotrada de la marquesina',0,0,0,{id:'fachada-luz-marquesina-'+x+'-'+dz.toFixed(1),fijo:true}).position.set(x,canopyY,zFace+dz);
    // Planta baja acristalada a lo largo de la curva: cada paño se apoya en el frente medido
    // y gira según su tangente; un pilar de piedra en cada junta. Se repite en espejo (x → −x).
    const step=F.glazingStep,tangent=x=>-Math.atan(pb(x+.5)-pb(x-.5));
    const onCurve=(root,x,offset=0)=>{const a=tangent(x);root.rotation.y=a;root.position.set(x+Math.sin(a)*offset,0,pb(x)+Math.cos(a)*offset);return root;};
    for(const s of [-1,1]){const lado=s<0?'oeste':'este';
      for(let x=E.width/2+step/2,k=1;x<F.glazingTo;x+=step,k++){
        add(onCurve(crearPanoVidrio({ancho:step-.5,alto:libre-.02,modulos:3}),s*x,.05),'ventana','Ventanal de planta baja',0,0,0,{id:'fachada-ventanal-'+lado+'-'+k,fijo:true});
        add(onCurve(crearPilarPiedra({ancho:.5,fondo:.4,alto:libre-.02}),s*(x+step/2),.2),'pilar','Pilar de piedra de la planta baja',0,0,0,{id:'fachada-pilar-'+lado+'-'+k,fijo:true});
      }
      // Luces empotradas bajo el vuelo, a media distancia entre el vidrio y el borde del vuelo.
      for(let x=K.width/2+2,k=1;x<F.glazingTo;x+=step,k++)add(crearDownlight(),'luminaria','Luz empotrada bajo el vuelo',0,0,0,{id:'fachada-luz-vuelo-'+lado+'-'+k,fijo:true,detalle:1}).position.set(s*x,libre,(pb(s*x)+cuerpo(s*x))/2);
    }
    // Llegada: alfombra hasta el borde de la acera, atril del botones y carrito de equipaje.
    const dz0=zE+F.revolving.radius+.15;
    add(crearAlfombra({ancho:3.6,fondo:P.front-.45-dz0,color:C.green}),'alfombra','Alfombra de bienvenida',0,(dz0+P.front-.45)/2,0,{id:'fachada-alfombra'});
    add(crearAtrilBotones(),'atril','Atril del botones · equipaje, valet y taxis',-3.4,dz0+1.2,0,{id:'fachada-atril-botones',accion:()=>onAction('botones')});
    const cart=crearCarritoEquipaje();cart.rotation.y=.4;add(cart,'carrito','Carrito portaequipajes',-5.6,dz0+1.8,0,{id:'fachada-carrito'});
    patio(P);
  }
  // Suelos del patio por capas (y en m): césped base < losa < césped de jardines < calzada <
  // caminos < bandas y marcas. Todo a ras salvo la calle (−curb) y los bordillos de la isla.
  function suelosPatio(P,pb){
    const W=P0.drive,A=planAccesos(P),y={cesped:.004,calzada:P0.access.surfaceY,camino:.01,banda:.012};
    const suelo=(tipo,label,id,polys,alto=0)=>add(crearSuperficie(tipo,polys,alto),'piso',label,0,0,0,{id:'fachada-suelo-'+id,fijo:true,reflect:false});
    const xs=[];for(let x=-60;x<=60;x+=2)xs.push(x);
    const borde=xs.map(x=>[x,pb(x)-1.2]),frenteJardin=x=>pb(x)+3;
    suelo('cesped','Césped de fondo','fondo',[A.fondo,rectangulo(-160,P.farSidewalk,160,P.farSidewalk+80)],-.03);
    suelo('losa','Losa de piedra · acera de llegada y paseo frente al edificio','paseo',[[[-60,P.zP],[60,P.zP],...[...borde].reverse()]]);
    suelo('losa','Acera pública','acera',[...A.acera,rectangulo(-160,P.streetFar,160,P.farSidewalk)]);
    suelo('asfalto','Calle frente al hotel','calle',[rectangulo(-160,P.curbZ,160,P.streetFar)],-P0.curb);
    // Jardines laterales: del paseo del edificio al seto del cerramiento, fuera del camino del ramal.
    const jardin=s=>{const x0=P0.legX+W/2+P0.band+P0.sideWalk,pts=xs.filter(x=>x>x0&&x<60).map(x=>[s*x,frenteJardin(s*x)]);
      return [[s*x0,frenteJardin(s*x0)],...pts,[s*60,P.zP-.3],[s*x0,P.zP-.3]];};
    suelo('cesped','Jardín lateral oeste','jardin-oeste',[jardin(-1)],y.cesped);suelo('cesped','Jardín lateral este','jardin-este',[jardin(1)],y.cesped);
    suelo('cesped','Césped de la isla','isla',[contornoIsla(P,P0.islandCurb.width)],y.cesped);
    const R=P0.fountain.radius+P0.fountain.ring,a=P0.axisPath/2;
    suelo('losa','Plaza de la fuente y camino peatonal','camino-isla',[circulo(0,P.islandCenter,R),rectangulo(-a,P.islandFront,a,P.islandCenter),rectangulo(-a,P.islandCenter,a,P.zP+.01)],y.camino);
    suelo('adoquin','Calzada de adoquín en espiga · sentido único','calzada',[poligonoCalzada(P,P.zP),...Object.values(P.gates).map(x=>rectangulo(x-W/2,P.zP,x+W/2,A.rampStart))],y.calzada);
    suelo('granito','Banda de granito del borde de la calzada','banda',[franja(ejeCalzada(P,W/2+P0.band,14,P.zP),ejeCalzada(P,W/2,14,P.zP))],y.banda);
    const bordillo=new T.Group();for(const tramo of A.bordillo)bordillo.add(crearCinta(tramo,{ancho:.3,alto:P0.curb+.012,color:'#9b958b',y:-P0.curb}));
    add(bordillo,'bordillo','Bordillo de la acera pública',0,0,0,{id:'fachada-bordillo',fijo:true,reflect:false});
    for(const [id,x] of Object.entries(P.gates))add(crearRampaAcceso({x,ancho:W,z0:A.rampStart,z1:A.rampEnd,y0:y.calzada,y1:-P0.curb}),'piso','Rampa de '+id,0,0,0,{id:'fachada-rampa-'+id,fijo:true,reflect:false});
    add(crearCinta([[-160,P.streetFar-.15],[160,P.streetFar-.15]],{ancho:.3,alto:P0.curb+.012,color:'#9b958b',y:-P0.curb}),'bordillo','Bordillo de la acera de enfrente',0,0,0,{id:'fachada-bordillo-enfrente',fijo:true,reflect:false});
    const linea=[];for(let x=-150;x<150;x+=6)linea.push([x+1.5,(P.curbZ+P.streetFar)/2,3,.13]);
    add(crearMarcasViales({rectas:linea}),'marca-vial','Línea central de la calle',0,0,0,{id:'fachada-marca-calle',fijo:true,detalle:1}).position.y=-P0.curb+.004;
  }
  // Isla con fuente, pórticos de ENTRADA (derecha) y SALIDA (izquierda), cerramiento bajo,
  // vegetación, farolas, bolardos y marcas viales. Todo derivado de planPatio.
  function patio(P){
    const W=P0.drive,a=P0.axisPath/2,cw=P0.islandCurb.width,yMarca=.016;
    // Bordillo de la isla, cortado por el paso de cebra del eje (el frente recto cruza x = 0).
    const borde=ejeCalzada(P,-W/2-cw/2,14,P.zP),tramos=[[]];
    for(let i=0;i<borde.length;i++){const p=borde[i],q=borde[i-1];
      if(q&&Math.sign(p[0])!==Math.sign(q[0])&&Math.abs(p[1]-q[1])<1e-6){tramos.at(-1).push([Math.sign(q[0])*(a+.05),p[1]]);tramos.push([[Math.sign(p[0])*(a+.05),p[1]]]);}
      tramos.at(-1).push(p);}
    for(const [i,t] of tramos.entries())add(crearCinta(t,{ancho:cw,alto:P0.islandCurb.height,color:C.stone,contorno:true}),'bordillo','Bordillo de piedra de la isla',0,0,0,{id:'fachada-bordillo-isla-'+(i+1),fijo:true});
    add(crearFuenteMonumental({radio:P0.fountain.radius}),'fuente','Fuente monumental de la isla',0,P.islandCenter,0,{id:'fachada-fuente'});
    // Barreras independientes dentro del terreno; no invaden la acera pública.
    const A=planAccesos(P);
    for(const b of A.barreras)add(crearBarreraVehicular(),'barrera','Barrera de '+b.id,0,0,0,{id:'fachada-barrera-'+b.id,fijo:true}).position.set(b.x,P0.access.surfaceY,b.z);
    // Cerramiento continuo al otro lado de la calle; el paso central queda en el hotel.
    for(const [i,[x0,x1]] of tramosCerramiento().entries()){const Q=P0.perimeter;
      add(crearCerramiento({largo:x1-x0,alto:Q.height,grosor:Q.thickness,pilar:Q.pier,altoPilar:Q.pierHeight,cada:Q.pierEvery}),'muro','Muro de piedra frente al hotel',(x0+x1)/2,A.wallZ,0,{id:'fachada-cerramiento-'+(i+1)});}
    for(const s of [-1,1]){const x=s*(P0.pedestrianGate/2+P0.monolith/2);
      add(crearMonolito({ancho:P0.monolith}),'monolito','Monolito del acceso peatonal',x,P.zP,0,{id:'fachada-monolito-'+(s<0?'oeste':'este')});
      }
    // Setos bajos al frente de la isla (dejan libres el paso de cebra y las columnas) y junto a los ramales.
    const col=F.canopy.width/2-.5,sz=P.islandFront+cw+.45;
    for(const s of [-1,1]){const lado=s<0?'oeste':'este';
      for(const [k,[x0,x1]] of [[a+.4,col-.6],[col+.6,P.cornerX]].entries())add(crearSeto({ancho:x1-x0,alto:.6,fondo:.6}),'seto','Seto bajo del frente de la isla',s*(x0+x1)/2,sz,0,{id:'fachada-seto-isla-'+lado+'-'+(k+1)});
      const z0=P.zc+P0.turnRadius+.5,z1=P.zP-1.6,leg=crearSeto({ancho:z1-z0,alto:.6,fondo:.6});leg.rotation.y=Math.PI/2;
      add(leg,'seto','Seto bajo junto al ramal',s*(P0.legX-W/2-cw-.45),(z0+z1)/2,0,{id:'fachada-seto-ramal-'+lado});
      add(crearMacizo({ancho:1.6,fondo:4,semilla:s<0?2:5}),'macizo','Macizo de heliconias junto a la fuente',s*9,P.islandCenter,0,{id:'fachada-macizo-fuente-'+lado});
      add(crearMacizo({ancho:4.4,fondo:1.3,semilla:s<0?8:11,colores:['#e05a8a','#f2b33d','#ffffff']}),'macizo','Macizo de flores junto al acceso peatonal',s*(a+.5+2.2),P.zP-2.05,0,{id:'fachada-macizo-acceso-'+lado});
    }
    // Palmeras: isla, rincones junto al edificio, jardines laterales y alcorques de la acera pública.
    const palmas=[];
    for(const s of [-1,1])palmas.push([s*8.8,P.islandCenter-3.2,8.2],[s*8.8,P.islandCenter+3.4,7.2],[s*13.6,P.islandCenter+2.4,9],[s*17.6,P.zFace+3.2,8.6],
      [s*30,P.zP-6,8],[s*33.5,P.zP-10,9.4],[s*37,P.zP-5,7],[s*45,P.zP-8,8.6],[s*52,P.zP-4.5,7.6],
      ...[10,34,46,58].map(x=>[s*x,P.curbZ-1.1,7.8]));
    for(const [i,[x,z,alto]] of palmas.entries())add(crearPalmaJardin({alto,giro:Math.atan2(x,z)+i,inclinacion:.06+(i%4)*.03,semilla:i+1}),'palmera','Palmera real del patio',0,0,0,{id:'fachada-palmera-'+(i+1),fijo:true}).position.set(x,0,z);
    for(const s of [-1,1])add(crearMacizo({ancho:2.6,fondo:2.6,semilla:s<0?21:23}),'macizo','Macizo al pie de la palmera',s*17.6,P.zFace+3.2,0,{id:'fachada-macizo-rincon-'+(s<0?'oeste':'este')});
    // Farolas: acera pública, eje peatonal de la isla y caminos de los ramales.
    const farolas=[];for(const s of [-1,1])farolas.push(...[5,28,40,52].map(x=>[s*x,P.curbZ-.55]),[s*(a+.4),P.islandFront+1.4],[s*(a+.4),P.zP-1],[s*(P0.legX+W/2+P0.band+P0.sideWalk/2),P.zP-4.5]);
    for(const [i,[x,z]] of farolas.entries()){
      const despejado=z>P.zP&&A.cortes.some(([a,b])=>x>a-.25&&x<b+.25)?Math.sign(x)*(P0.gateX+W/2+.6):x;
      add(crearFarola(),'farola','Farola del patio',despejado,z,0,{id:'fachada-farola-'+(i+1)});}
    // Bolardos luminosos por el borde exterior de la calzada, fuera de la zona de descenso.
    const bol=aLoLargo(ejeCalzada(P,W/2+P0.band+.3,14,P.zP-1.2),1.9).filter(p=>Math.abs(p.x)>F.canopy.width/2+1.2);
    for(const [i,p] of bol.entries())add(crearBolardoLuz(),'bolardo','Bolardo luminoso',p.x,p.z,0,{id:'fachada-bolardo-'+(i+1),detalle:1});
    // Marcas de calzada: paso de cebra, líneas de carril y flechas de sentido único.
    const rectas=[],X=P0.crossing;
    for(let z=P.front+.3;z+X.bar<=P.islandFront-.2;z+=2*X.bar)rectas.push([0,z+X.bar/2,X.width,X.bar]);
    for(let x=-P.cornerX+1;x<P.cornerX-1;x+=3)if(Math.abs(x+.75)>X.width/2+.6)rectas.push([x+.75,P.front+P0.dropLane,1.5,.12]);
    const zCurva=P.zc+P0.turnRadius,dxEntrada=P0.legX-P0.gateX,dzEntrada=zCurva-P.zP;
    const rumboEntrada=Math.atan2(dxEntrada,-dzEntrada),rumboSalida=Math.atan2(-P0.gateX+P0.legX,dzEntrada);
    const xMarca=(a,b)=>(a+b)/2,zMarca=(a,b)=>(a+b)/2;
    rectas.push([xMarca(-P0.gateX,-P0.legX),zMarca(P.zP,zCurva),W-.6,.4,rumboSalida]);
    const paso=P.front+P0.dropLane+(W-P0.dropLane)/2;
    add(crearMarcasViales({rectas,flechas:[[xMarca(P0.gateX,P0.legX),zMarca(P.zP,zCurva),rumboEntrada],[10,paso,Math.PI/2],[-10,paso,Math.PI/2],[xMarca(-P0.gateX,-P0.legX),zMarca(P.zP,zCurva),rumboSalida]]}),'marca-vial','Marcas viales del patio',0,0,0,{id:'fachada-marcas',fijo:true}).position.y=yMarca;
    const cruces=[];for(const x of Object.values(P.gates))for(let dx=-W/2+.2;dx+.4<W/2;dx+=.8)cruces.push([x+dx+.2,P.zP+.9,.4,1.3]);
    add(crearMarcasViales({rectas:cruces}),'marca-vial','Cruces peatonales de los accesos',0,0,0,{id:'fachada-cruces-accesos',fijo:true}).position.y=yMarca;
    for(const b of A.barreras){const x=b.x-W/2-P0.access.postWidth/2;
      block('Poste del rótulo de '+b.id,.06,1.8,.06,C.darkWood,x,b.z-.4,0,{id:'fachada-poste-rotulo-'+b.id});
      text(b.id==='entrada'?'ENTRADA':'SALIDA',x,b.z-.4,1.65,1.35,'',{rot:b.id==='salida'?Math.PI:0,detalle:1});}
  }
  let buildQueue=Promise.resolve();const pending=new Map();
  function obtenerArea(id){id=areaDe(id);if(pending.has(id))return pending.get(id);if(zones.has(id))return Promise.resolve(zones.get(id));
    const promise=buildQueue.then(async()=>{const previousCount=new Map(count);try{return await build(id);}catch(error){
      const group=zones.get(id);group?.removeFromParent();zones.delete(id);
      for(const [key,entry] of objetos.entries)if(entry.raiz.userData.area===id){objetos.roots.delete(entry.raiz);objetos.entries.delete(key);}
      const belongs=r=>{if(r.userData.area===id)return true;for(let p=r.parent;p;p=p.parent)if(p===group)return true;return false;};
      for(const list of [animated,vivos,gloss])for(let i=list.length-1;i>=0;i--)if(belongs(list[i]))list.splice(i,1);
      count.clear();for(const [key,value] of previousCount)count.set(key,value);throw error;
    }}).finally(()=>pending.delete(id));pending.set(id,promise);buildQueue=promise.catch(()=>{});return promise;
  }
  return {build:obtenerArea,zones,animated,vivos,gloss,ZONAS:zoneConfig};
}
