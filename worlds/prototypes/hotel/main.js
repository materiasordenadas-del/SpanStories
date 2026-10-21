import * as T from './engine/three.js';
import { luz } from './engine/Luz25D.js';
import { montarPanelEstilo } from './panel/PanelEstilo.js';
import { RegistroObjetos,montarSeleccion } from './engine/Objetos.js';
import { crearHotelWorld,ZONAS,areaDe } from './engine/HotelWorld.js';
import { LOBBY_CORE as L,DIMENSIONS as D,COURT,TRANSITIONS as TR,HOTEL_LAYOUT as H,BUFFET } from './engine/dimensions.js';
import { aplicarDetalle } from './engine/Detalle.js';
import { setGlossyFloors } from './engine/GlossyFloor.js';
import { crearPrimeraPersona } from './engine/PrimeraPersona.js';
import { conexiones,salidas,rutaEntre,cercaAcceso,cruzarAcceso,llegada,limitesZona,puntosEscalera,interpolarCamino } from './engine/Recorrido.js';
import { crearControlTransiciones } from './engine/Transiciones.js';
import { crearEstadoHotel,registrarEntrada,registrarSalida,reservarTour,pedir,iniciarViaje,terminarViaje } from './engine/HotelState.js';
import { montarEditorGLB } from './engine/EditorGLB.js';

const $=s=>document.querySelector(s),viewport=$('#viewport');
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.info.autoReset=false;
viewport.prepend(renderer.domElement);const scene=new T.Scene();scene.background=new T.Color('#cfdfdc');
const camera=new T.PerspectiveCamera(52,1,.1,300);const target=new T.Vector3(),objetos=new RegistroObjetos(),estado=crearEstadoHotel();
let dirty=true,lastTime=0,animateUntil=0,selection,active=null,detail=0;
const walker=crearPrimeraPersona(camera,target),keys=new Set();
let firstPerson=false,savedView=null,restaurantVariant='restaurante',editor=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)'),doorTimes=new WeakMap(),preparingDoors=new Set();
renderer.domElement.tabIndex=0;
function restoreWalls(){if(!active)return;for(const r of active.children)if(r.userData.corteVista)r.userData.corteVista=false;aplicarDetalle(active,detail,camera);}
function setFirstPerson(enabled){
  if(enabled===firstPerson||transitions.ocupada)return;
  firstPerson=enabled;keys.clear();
  if(enabled){savedView={position:camera.position.clone(),target:target.clone(),cuts:active.children.filter(r=>r.userData.corteVista)};restoreWalls();const cfg=ZONAS[estado.zona];camera.position.set(...cfg.cam);target.set(...cfg.target);camera.lookAt(target);walker.sincronizar();renderer.domElement.focus();}
  else if(savedView){camera.position.copy(savedView.position);target.copy(savedView.target);camera.lookAt(target);for(const r of savedView.cuts){r.userData.corteVista=true;r.visible=false;}savedView=null;}
  $('#first-person').setAttribute('aria-pressed',String(enabled));$('#caminar-controles').hidden=!enabled;
  for(const id of ['zoom-in','zoom-out','rotate'])$('#'+id).disabled=enabled;
  mensaje(enabled?'Primera persona · WASD o flechas para caminar · arrastra para mirar · Esc para salir.':'Arrastra para mirar · rueda para acercar · clic para seleccionar.');dirty=true;
}
const mensaje=t=>$('#mensaje').textContent=t;
const world=crearHotelWorld({scene,objetos,onNavigate:show,onAction:act});
let disabledBefore=new Map();
const transitions=crearControlTransiciones({
  capture:()=>({zone:estado.zona,state:structuredClone(estado),group:active,position:camera.position.clone(),target:target.clone(),variant:restaurantVariant,savedView,selected:objetos.seleccion,
    visibility:new Map([...world.zones.values()].flatMap(g=>[g,...g.children]).map(r=>[r,{visible:r.visible,cut:r.userData.corteVista,open:r.userData.abierta}]))}),
  restore:s=>{Object.assign(estado,s.state);restaurantVariant=s.variant;savedView=s.savedView;if(s.group)presentar(s.zone,s.group,{position:s.position,target:s.target});
    for(const g of world.zones.values())g.visible=g===s.group;for(const [r,v] of s.visibility){r.visible=v.visible;r.userData.corteVista=v.cut;if(v.open!==undefined)r.userData.abierta=v.open;}
    savedView=s.savedView;objetos.seleccionar(s.selected);wake();},
  lock:()=>{keys.clear();drag=null;suppressClick=false;viewport.setAttribute('aria-busy','true');disabledBefore=new Map([...document.querySelectorAll('#zonas button,#acciones button,#vista-controles button,#caminar-controles button,#accion-objeto,#objeto-seleccionado')].map(b=>[b,b.disabled]));for(const b of disabledBefore.keys())b.disabled=true;},
  unlock:()=>{viewport.classList.remove('transicion');viewport.setAttribute('aria-busy','false');for(const [b,disabled] of disabledBefore)if(b.isConnected)b.disabled=disabled;for(const id of ['zoom-in','zoom-out','rotate'])$('#'+id).disabled=firstPerson;
    for(const b of document.querySelectorAll('#acciones button'))b.disabled=false;$('#accion-objeto').disabled=!objetos.obtener(objetos.seleccion)?.userData.accion;keys.clear();if(firstPerson)renderer.domElement.focus();dirty=true;},
  onError:error=>{mensaje('No se pudo completar el recorrido: '+error.message);console.error(error);}
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fade(out){viewport.classList.toggle('transicion',out);if(!reducedMotion.matches)await pause(TR.fadeMs);}
function abrir(root){if(!root||root.userData.abierta===undefined)return;if(!root.userData.abierta){root.userData.abierta=true;doorTimes.set(root,performance.now());if(reducedMotion.matches){root.userData.animar?.(1);doorTimes.set(root,performance.now()-TR.doorWaitMs);}wake();}}
function puertaLista(root){return !root||(root.userData.abierta&&performance.now()-(doorTimes.get(root)||0)>=TR.doorWaitMs);}
async function prepararPuerta(id){const root=objetos.obtener(id);if(!root)return;abrir(root);if(reducedMotion.matches){root.userData.animar?.(1);dirty=true;return;}preparingDoors.add(root);try{await pause(Math.max(0,TR.doorWaitMs-(performance.now()-(doorTimes.get(root)||0))));}finally{preparingDoors.delete(root);}}
async function animarCamino(points,milliseconds,lookDirection){
  const dir=lookDirection?.clone()||camera.getWorldDirection(new T.Vector3());
  if(reducedMotion.matches){camera.position.copy(points.at(-1));target.copy(camera.position).add(dir);camera.lookAt(target);dirty=true;return;}
  await new Promise((resolve,reject)=>{const start=performance.now();function step(now){try{const t=T.MathUtils.clamp((now-start)/milliseconds,0,1);camera.position.copy(interpolarCamino(points,t));target.copy(camera.position).add(dir);camera.lookAt(target);dirty=true;if(t<1)requestAnimationFrame(step);else resolve();}catch(error){reject(error);}}requestAnimationFrame(step);});
}
const BASE_LIGHTS=[{pos:[0,5,-3],color:'#ffe4b4',intensidad:.28,radio:8},{pos:[-13,5,3],color:'#ffe7c2',intensidad:.22,radio:6},{pos:[14,5,5],color:'#ffe9cd',intensidad:.22,radio:6}];
function wake(){dirty=true;animateUntil=performance.now()+1700;}
function refreshSelection(){selection?.destruir();objetos.onChange=null;selection=montarSeleccion({objetos,scene,camera,canvas:renderer.domElement,selector:$('#objeto-seleccionado'),estado:$('#seleccion-status')});const previous=objetos.onChange;objetos.onChange=entry=>{previous?.(entry);$('#accion-objeto').disabled=!entry?.raiz.userData.accion;$('#ocultar-objeto').checked=entry?!entry.raiz.visible:false;editor?.seleccion();dirty=true;};
  for(const option of $('#objeto-seleccionado').options){const entry=objetos.obtener(option.value);if(entry)option.hidden=entry.userData.area!==areaDe(estado.zona);}
}
function controls(items){$('#acciones').replaceChildren();for(const [label,fn] of items){const b=document.createElement('button');b.textContent=label;b.disabled=transitions.ocupada;b.onclick=()=>{if(transitions.ocupada)return;fn();wake();};$('#acciones').append(b);}}
function act(action){const actions={entrada:()=>mensaje(registrarEntrada(estado)),salida:()=>mensaje(registrarSalida(estado)),tour:()=>mensaje(reservarTour(estado,'Centro Histórico de Cartagena')),islas:()=>mensaje(reservarTour(estado,'Islas del Rosario')),desayuno:()=>mensaje(pedir(estado,'arepa, huevos, fruta y café de origen')),bebida:()=>mensaje(pedir(estado,'limonada de coco')),cafe:()=>mensaje(pedir(estado,'café colombiano')),timbre:()=>mensaje('Ding. Bienvenido: recepción está lista para atenderte.'),equipaje:()=>mensaje('Equipaje etiquetado y resguardado en conserjería.'),minibar:()=>mensaje('Minibar: agua, jugo de maracuyá y café colombiano.'),'salida-calle':()=>mensaje('Puerta de salida: los huéspedes salen aquí a la acera.'),botones:()=>mensaje('Botones: «¡Bienvenido! ¿Le ayudo con el equipaje o le pido un taxi?»'),'ascensor-pb':()=>travel(1),'ascensor-p1':()=>travel(0),musica:()=>mensaje('Escenario: hoy toca el Trío Palma a las 8:00 pm. Bolero, vallenato y cumbia.'),buffet:()=>mensaje('Isla central: entradas frías, ensaladas, fruta, panes y jugos. Sírvase usted mismo; las bandejas calientes están en el frente.'),carvery:()=>mensaje('Parrilla y carvery: el cocinero lonchea el asado al carbón frente a usted.'),postres:()=>mensaje('Isla de postres: fuente de chocolate, cupcakes y tartas de la casa.'),directorio:()=>mensaje('Tótem: recepción, restaurante, lounge El Coral y conserjería en planta baja · habitaciones 201–212 en la primera planta.')};const ocupada=/^ocupada-(\d+)$/.exec(action);if(ocupada)mensaje('Habitación '+ocupada[1]+': ocupada'+(['204','209'].includes(ocupada[1])?' · «No molestar».':'. Tu tarjeta solo abre la suite 201.'));
  actions[action]?.();wake();}
async function travel(planta){return transitions.ejecutar(async()=>{
  if(!iniciarViaje(estado,planta))return;const zone=planta?'galeria':'circulacion',group=await world.build(zone),source=objetos.obtener(planta?'ascensor-pb':'ascensor-p1');
  mensaje('Ascensor: '+(planta?'subiendo a la primera planta…':'bajando a planta baja…'));if(source){source.userData.abierta=false;wake();if(!reducedMotion.matches)await pause(TR.doorWaitMs);else source.userData.animar?.(1);}
  await fade(true);if(!reducedMotion.matches)await pause(TR.liftMs);
  const position=new T.Vector3(L.wallX-TR.arrivalOffset,(planta?D.floorHeight:0)+D.playerHeight,L.liftZ),look=position.clone().add(new T.Vector3(-1,0,0));
  presentar(zone,group,{position,target:look});terminarViaje(estado);await prepararPuerta(planta?'ascensor-p1':'ascensor-pb');await fade(false);
  mensaje(planta?'Primera planta. La puerta doble de la galería lleva al pasillo.':'Planta baja. Estás en el lobby.');
});}
function areaControls(id){
  if(id==='fachada'){const P=active.userData.patio,ver=(cam,mira)=>{camera.position.set(...cam);target.set(...mira);camera.lookAt(target);aplicarDetalle(active,detail,camera);dirty=true;};
    controls([['Ver la entrada desde la isla',()=>ver([0,1.7,P.islandFront+1.6],[0,2.4,P.zFace])],['Llegar en coche (ENTRADA)',()=>ver([COURT.gateX,1.35,P.curbZ+5],[COURT.gateX-3,1.6,P.zc])],['Vista aérea del patio',()=>ver([38,24,P.curbZ+22],[0,0,P.islandCenter-4])],['Ver edificio completo',()=>ver([0,16,95],[0,15,0])],['Hablar con el botones',()=>act('botones')],['Entrar por la puerta giratoria',()=>show('lobby',{acceso:'entrada'})]]);}
  else if(id==='lobby')controls([['Registrar entrada',()=>act('entrada')],['Registrar salida',()=>act('salida')],['Ir al restaurante',()=>show('restaurante')],['Ir al lounge bar',()=>show('bar')],['Conserjería',()=>show('conserjeria')],['Ascensor y escalera',()=>show('circulacion')],['Salir a la calle',()=>show('fachada')]]);
  else if(id==='conserjeria')controls([['Tour por Cartagena',()=>act('tour')],['Islas del Rosario',()=>act('islas')],['Guardar equipaje',()=>act('equipaje')],['Volver al lobby',()=>show('lobby')]]);
  else if(id==='restaurante')controls([['Desayuno colombiano',()=>act('desayuno')],['Café de origen',()=>act('cafe')],['Música en vivo',()=>{camera.position.set(-3,1.7,5.5);target.set(5.4,1.6,5.5);camera.lookAt(target);aplicarDetalle(active,detail,camera);dirty=true;act('musica');}],['Ir a la terraza',()=>show('terraza')],['Ver versión buffet',()=>show('buffet')],['Volver al lobby',()=>show('lobby')]]);
  else if(id==='buffet')controls([['Recorrer el buffet',()=>{restoreWalls();camera.position.set(...ZONAS.buffet.cam);target.set(...ZONAS.buffet.target);camera.lookAt(target);aplicarDetalle(active,detail,camera);dirty=true;act('buffet');}],['Desayuno colombiano',()=>act('desayuno')],['Música en vivo',()=>{restoreWalls();camera.position.set(...BUFFET.stage.view.cam);target.set(...BUFFET.stage.view.target);camera.lookAt(target);aplicarDetalle(active,detail,camera);dirty=true;act('musica');}],['Ir a la terraza',()=>show('terraza')],['Ver restaurante original',()=>show('restaurante')],['Volver al lobby',()=>show('lobby')]]);
  else if(id==='bar')controls([['Limonada de coco',()=>act('bebida')],['Consultar carta',()=>mensaje('El Coral: frutas del Caribe, coctelería botánica, café colombiano y bebidas sin alcohol.')],['Ir a la terraza',()=>show('terraza')],['Volver al lobby',()=>show('lobby')]]);
  else if(id==='terraza')controls([['Pedir bebida',()=>act('bebida')],['Ir al restaurante',()=>show('restaurante')],['Ir al bar',()=>show('bar')]]);
  else if(id==='circulacion')controls([['Abrir / cerrar ascensor',()=>{const e=objetos.obtener('ascensor-pb');e.userData.abierta=!e.userData.abierta;wake();}],['Ascensor · subir a P1',()=>travel(1)],['Subir por la escalera',()=>show('galeria')],['Volver a recepción',()=>show('lobby')]]);
  else if(id==='galeria')controls([['Ir al pasillo de habitaciones',()=>show('pasillo')],['Ascensor · bajar a PB',()=>travel(0)],['Bajar por la escalera',()=>show('circulacion')]]);
  else if(id==='pasillo')controls([['Abrir / cerrar puerta 201',()=>{const door=objetos.obtener('puerta-201');if(door.userData.abierta)door.userData.abierta=false;else abrir(door);mensaje(door.userData.abierta?'Puerta 201 abierta.':'Puerta 201 cerrada.');wake();}],['Entrar a habitación 201',()=>show('habitacion')],['Llamar a la 202',()=>act('ocupada-202')],['Volver a la galería',()=>show('galeria')]]);
  else controls([['Consultar minibar',()=>act('minibar')],['Abrir / cerrar balcón',()=>{objetos.obtener('puerta-balcon-201').userData.accion();wake();}],['Salir al balcón',salirBalcon],['Ver suite',()=>show('habitacion',{tipo:'menu'})],['Volver al pasillo',()=>show('pasillo')]]);
}
function presentar(id,group,view=null){
    for(const g of world.zones.values())g.visible=g===group;active=group;estado.zona=id;
    for(const root of active.children)if(root.userData.corteVista){root.userData.corteVista=false;root.visible=true;}
    const cfg=ZONAS[id];for(const r of group.children)if(r.userData.tipo==='techo')r.visible=true;if(view){camera.position.copy(view.position);target.copy(view.target);}else{camera.position.set(...cfg.cam);target.set(...cfg.target);}camera.lookAt(target);camera.updateMatrixWorld();
    $('#zona-titulo h1').textContent=cfg.nombre;$('#zona-titulo p').textContent=cfg.descripcion;
    for(const b of document.querySelectorAll('[data-zone]'))b.setAttribute('aria-current',String(b.dataset.zone===id));
    scene.background=new T.Color(id==='fachada'?'#bfdde6':id==='terraza'?'#b4d4e1':id==='bar'?'#c2c9bf':'#dce4d8');
    const base=ZONAS[areaDe(id)];luz.salas(id==='fachada'||id==='terraza'?[]:[base.cubierta||[-base.tam[0]/2,-base.tam[1]/2,base.tam[0]/2,base.tam[1]/2]]);luz.ponerLamparas(id==='buffet'?BUFFET.lights:BASE_LIGHTS,'hotel');
    aplicarDetalle(group,detail,camera);setGlossyFloors(detail===0&&$('#reflejos').checked);refreshSelection();objetos.seleccionar(null);areaControls(id);dirty=true;
    keys.clear();if(firstPerson){savedView=null;walker.sincronizar();}
    estado.ascensor.planta=['galeria','pasillo','habitacion'].includes(id)?1:0;
    if(['restaurante','buffet'].includes(id))restaurantVariant=id;
    editor?.zona();mensaje(firstPerson?'Primera persona · WASD o flechas para caminar · arrastra para mirar · Esc para salir.':'Arrastra para mirar · rueda para acercar · clic para seleccionar · doble clic para usar un portal.');
}
async function show(id,context={tipo:'boton'}){
  if(!ZONAS[id])return false;if(estado.zona==='terraza'&&id==='restaurante'&&context.tipo!=='menu')id=restaurantVariant;
  if(id==='galeria'&&estado.zona==='galeria'&&context.tipo!=='menu')id='circulacion';
  return transitions.ejecutar(async()=>{
    const source=estado.zona,position=camera.position.clone(),direction=camera.getWorldDirection(new T.Vector3());
    const stairs=context.tipo!=='menu'&&((['lobby','circulacion'].includes(source)&&id==='galeria')||(source==='galeria'&&id==='circulacion'));
    mensaje('Preparando '+ZONAS[id].nombre+'…');const group=await world.build(id);
    const pairs=conexiones(ZONAS,objetos,['restaurante','buffet'].includes(id)?id:restaurantVariant);
    const route=salidas(source,pairs).find(r=>r.to.zone===id&&r.id===(context.route?.id||context.acceso))||rutaEntre(source,id,pairs);
    if(stairs){const up=id==='galeria',points=puntosEscalera(up,objetos.obtener('escalera-001')),dir=new T.Vector3(0,0,up?-1:1);
      restoreWalls();await animarCamino([camera.position.clone(),points[0]],TR.cameraMs,dir);await animarCamino(points,TR.stairMs,dir);
      presentar(id,group,{position:points.at(-1),target:points.at(-1).clone().add(dir)});return;
    }
    if(context.tipo!=='menu')await prepararPuerta(route?.from.door);
    const localView=context.tipo!=='menu'&&route?llegada(route,context.tipo==='cruce'?{lateral:context.lateral,direction}:{}):null;
    if(areaDe(source)===areaDe(id)&&active&&context.tipo!=='menu'){
      const cfg=ZONAS[id],view=localView||{position:new T.Vector3(...cfg.cam),target:new T.Vector3(...cfg.target)};
      restoreWalls();await animarCamino([position,view.position],TR.cameraMs,view.target.clone().sub(view.position).normalize());presentar(id,group,view);return;
    }
    await fade(true);if(context.tipo!=='menu')await prepararPuerta(route?.to.door);presentar(id,group,localView);await fade(false);
  });
}
async function salirBalcon(){return transitions.ejecutar(async()=>{
  await prepararPuerta('puerta-balcon-201');const b=H.balcony;
  // La corredera libera la mitad izquierda del vano; la derecha sigue acristalada.
  const x=b.doorX-b.doorWidth/4,inside=new T.Vector3(x,D.playerHeight,b.backZ+TR.arrivalOffset),outside=new T.Vector3(x,D.playerHeight,b.backZ-TR.arrivalOffset);
  await fade(true);camera.position.copy(inside);target.copy(inside).add(new T.Vector3(0,0,-1));camera.lookAt(target);dirty=true;await fade(false);
  await animarCamino([inside,outside],TR.cameraMs,new T.Vector3(0,0,-1));walker.sincronizar();
});}
for(const b of document.querySelectorAll('[data-zone]'))b.onclick=()=>show(b.dataset.zone,{tipo:'menu'});
$('#panel-toggle').onclick=()=>{const p=$('#panel');p.hidden=!p.hidden;$('#panel-toggle').setAttribute('aria-expanded',String(!p.hidden));};
$('#accion-objeto').onclick=()=>{if(transitions.ocupada)return;objetos.obtener(objetos.seleccion)?.userData.accion?.();wake();};
$('#ocultar-objeto').onchange=()=>{const r=objetos.obtener(objetos.seleccion);if(editor?.ocultar(r,$('#ocultar-objeto').checked))return;if(r){r.userData.ocultoUsuario=$('#ocultar-objeto').checked;r.visible=!r.userData.ocultoUsuario;dirty=true;}};
$('#quality').onchange=()=>{detail={HIGH:0,STANDARD:1,ECO:2}[$('#quality').value];renderer.setPixelRatio(detail===2?1:Math.min(devicePixelRatio,detail===0?1.5:1.25));// El contorno es parte del estilo: lo decide el panel, no la calidad.
if(active)aplicarDetalle(active,detail,camera);setGlossyFloors(detail===0&&$('#reflejos').checked);resize();};
$('#pantallas').onchange=()=>{dirty=true;};
$('#reflejos').onchange=()=>{setGlossyFloors(detail===0&&$('#reflejos').checked);dirty=true;};
function zoom(k){if(firstPerson)return;const delta=camera.position.clone().sub(target),distance=delta.length(),next=T.MathUtils.clamp(distance*k,5,180);camera.position.copy(target).add(delta.normalize().multiplyScalar(next));if(active)aplicarDetalle(active,detail,camera);dirty=true;}
$('#zoom-in').onclick=()=>zoom(.85);$('#zoom-out').onclick=()=>zoom(1.18);
// Vista de corte: se ocultan techo, muro frontal y muro este con todo lo que cuelga de ellos.
$('#overview').onclick=()=>{setFirstPerson(false);const a=areaDe(estado.zona),cfg=ZONAS[a],size=Math.max(...cfg.tam),cut=[a+'-muro-frontal',a+'-muro-lateral-1'];camera.position.set(size*.78,size*.64,size*.85);target.set(0,1,0);camera.lookAt(target);aplicarDetalle(active,detail,camera);for(const r of active.children)if(r.userData.tipo==='techo'||cut.includes(r.name)||cut.includes(r.userData.muro)){r.visible=false;r.userData.corteVista=true;}dirty=true;};
$('#first-person').onclick=()=>setFirstPerson(!firstPerson);
const movementKeys={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
renderer.domElement.addEventListener('keydown',e=>{if(!firstPerson)return;if(editor?.moverFlecha(e.code,e.shiftKey)){e.preventDefault();keys.delete(e.code);return;}if(e.code==='Escape'){if(editor?.activo())$('#edit-mode').click();else setFirstPerson(false);return;}if(movementKeys[e.code]){e.preventDefault();keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});renderer.domElement.addEventListener('blur',()=>keys.clear());
for(const button of document.querySelectorAll('[data-walk]')){button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.walk);};button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>keys.delete(button.dataset.walk);}
$('#rotate').onclick=()=>{camera.position.sub(target).applyAxisAngle(new T.Vector3(0,1,0),Math.PI/8).add(target);camera.lookAt(target);dirty=true;};
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.06:.94);},{passive:false});
let drag=null,suppressClick=false;
renderer.domElement.addEventListener('pointerdown',e=>{if(transitions.ocupada)return;renderer.domElement.focus();renderer.domElement.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,moved:false};});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag||!e.buttons)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;if(firstPerson){walker.sincronizar();walker.mirar(dx,dy);}else{const offset=camera.position.clone().sub(target),s=new T.Spherical().setFromVector3(offset);s.theta-=dx*.006;s.phi=T.MathUtils.clamp(s.phi+dy*.004,.25,1.5);camera.position.copy(target).add(new T.Vector3().setFromSpherical(s));camera.lookAt(target);}drag.x=e.clientX;drag.y=e.clientY;dirty=true;});
renderer.domElement.addEventListener('pointerup',()=>{suppressClick=Boolean(drag?.moved);drag=null;});
renderer.domElement.addEventListener('click',e=>{if(suppressClick){e.stopImmediatePropagation();suppressClick=false;}},true);
renderer.domElement.addEventListener('dblclick',()=>{if(transitions.ocupada)return;objetos.obtener(objetos.seleccion)?.userData.accion?.();wake();});
montarPanelEstilo({luz,contenedor:$('#panel-estilo'),clave:'hotel.luz.v2'});luz.usarAmbiente('mediodia');$('#panel-estilo').addEventListener('input',wake);$('#panel-estilo').addEventListener('click',wake);
function resize(){const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();luz.viewport(width,height,renderer.getPixelRatio());dirty=true;}new ResizeObserver(resize).observe(viewport);
$('#status').textContent='Hotel · áreas independientes · tres LOD · carga por área.';
if(new URLSearchParams(location.search).has('dev'))window.__escena={scene,camera,renderer,luz,objetos,estado,world,mostrar:show,detalle:()=>detail,transitions,recorrido:()=>conexiones(ZONAS,objetos,restaurantVariant),primeraPersona:()=>firstPerson};
// Pantallas vivas: ~12 pasos por segundo (6 en LOD 3), solo las del área activa que están visibles y dentro del encuadre.
const frustum=new T.Frustum(),pv=new T.Matrix4(),esfera=new T.Sphere();let ultimaPantalla=0;
function tickPantallas(t){camera.updateMatrixWorld();pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(pv);const area=areaDe(estado.zona);let n=0;
  for(const r of world.vivos){if(r.userData.area!==area)continue;let visible=true;for(let p=r;p;p=p.parent)if(!p.visible)visible=false;if(!visible)continue;
    r.getWorldPosition(esfera.center);esfera.radius=r.userData.radioVivo||2;if(!frustum.intersectsSphere(esfera))continue;r.userData.vivo(t);n++;}
  return n;}
renderer.setAnimationLoop(time=>{const dt=Math.min((time-lastTime)/1000,.05);lastTime=time;if(document.hidden||!active)return;
  const exits=firstPerson&&!transitions.ocupada?salidas(estado.zona,conexiones(ZONAS,objetos,restaurantVariant)):[];
  for(const route of exits)if(cercaAcceso(route.from,camera.position))abrir(objetos.obtener(route.from.door));
  if(firstPerson&&keys.size&&!transitions.ocupada&&!estado.ascensor.viajando){const held=action=>[...keys].some(k=>(movementKeys[k]||k)===action),bounds=limitesZona(estado.zona,ZONAS,camera.position);walker.sincronizar();
    const beforeStep=(before,after)=>{for(const route of exits){const crossing=cruzarAcceso(route.from,before,after);if(!crossing)continue;if(!puertaLista(objetos.obtener(route.from.door)))return true;show(route.to.zone,{tipo:'cruce',route,lateral:crossing.lateral});return true;}return false;};
    if(walker.mover(Number(held('forward'))-Number(held('back')),Number(held('right'))-Number(held('left')),dt,active,bounds,{beforeStep}))dirty=true;
  }
  if($('#pantallas').checked&&time-ultimaPantalla>(detail===2?160:80)){ultimaPantalla=time;if(tickPantallas(time/1000))dirty=true;}if(time<animateUntil||preparingDoors.size){for(const r of world.animated)if(r.userData.area===areaDe(estado.zona)||preparingDoors.has(r))r.userData.animar(dt);dirty=true;}if(!dirty)return;
  selection?.actualizar();renderer.info.reset();const start=performance.now();renderer.render(scene,camera);const elapsed=performance.now()-start;dirty=false;
  const loaded=performance.getEntriesByType('resource'),bytes=loaded.reduce((n,r)=>n+(r.encodedBodySize||0),0);
  $('#metrics').textContent=`LOD ${detail+1} · ${renderer.info.render.calls} llamadas · ${renderer.info.render.triangles.toLocaleString('es')} triángulos\n${elapsed.toFixed(1)} ms CPU al dibujar · DPR ${renderer.getPixelRatio()}\n${(bytes/1024/1024).toFixed(2)} MB descargados en esta visita\n${world.zones.size} áreas cargadas de ${Object.values(ZONAS).filter(z=>!z.area).length} · ${objetos.listar().length} objetos\nRender bajo demanda · reflexión solo en LOD 1`;
});
await show('lobby');
editor=montarEditorGLB({scene,objetos,viewport,camera,target,area:()=>areaDe(estado.zona),ocupado:()=>transitions.ocupada,esPrimeraPersona:()=>firstPerson,
  refresh:refreshSelection,wake,mensaje,onEnable:enabled=>{setFirstPerson(enabled);$('#panel').hidden=false;$('#panel-toggle').setAttribute('aria-expanded','true');},
  onFocus:root=>{const box=new T.Box3().setFromObject(root),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()).length();target.copy(center);camera.position.copy(center).add(new T.Vector3(1,.7,1).normalize().multiplyScalar(Math.max(3,size*1.6)));camera.lookAt(target);wake();}});
await editor.restaurar();
