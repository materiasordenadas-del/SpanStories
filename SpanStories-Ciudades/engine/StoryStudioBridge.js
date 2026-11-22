import * as T from './three.js';
import { origenDelAnfitrion } from './LexicoPuertos.js';
import { LEXICO, STORY_STUDIO, CITY } from '../routes.js';
import { fetchCityGLB } from './CityTransport.js';
import { cloneCityAvatar } from './CityAvatarClone.js';
import { createBehaviorLibrary, performanceTime } from './StudioBehavior.js';
import { crearReproductorVida } from './vida/Reproductor.js';
import { grabarAmbiente } from './vida/Grabador.js';
import { crearNavegacionCuadricula } from './vida/Navegacion.js';
import { validarAmbienteReproducible, validarConfiguracion } from './vida/Ambiente.js';
import {puntoDeSuelta} from './SceneDrop.js';

const CHANNEL='spanstories.studio';
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<100000);
export function modelBoneMatrices(root,bones){
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),matrix=new T.Matrix4();
  return bones.flatMap(b=>b?matrix.multiplyMatrices(inverse,b.matrixWorld).toArray():new T.Matrix4().toArray());
}
export function applyModelBoneMatrices(root,bones,matrices){
  const indices=new Map(bones.map((b,i)=>[b,i])),local=new T.Matrix4(),model=new T.Matrix4();
  root.updateWorldMatrix(true,true);
  // Recorrer la jerarquía de destino: sus padres pueden diferir de los del Taller.
  root.traverse(b=>{
    const i=indices.get(b);if(i===undefined)return;
    b.parent.updateWorldMatrix(true,false);
    local.copy(b.parent.matrixWorld).invert().multiply(root.matrixWorld).multiply(model.fromArray(matrices,i*16))
      .decompose(b.position,b.quaternion,b.scale);
    b.updateWorldMatrix(false,false);
  });
}
/** Primer personaje visible bajo el cursor; los objetos del escenario siguen tapándolo. */
export function workshopActorHit(hits,actors){
  for(const {object,face} of hits){
    let visible=true;
    for(let node=object;node;node=node.parent)if(!node.visible){visible=false;break;}
    const material=Array.isArray(object.material)?object.material[face?.materialIndex??0]:object.material;
    if(!visible||material?.visible===false||!object.isMesh)continue;
    for(const [id,actor]of actors)for(let node=object;node;node=node.parent)if(node===actor.root)return id;
    if(!object.userData.ignorarSeleccion)return null;
  }
  return null;
}
export function validStudioStage(s,zoneId){
  return !!s&&s.zoneId===zoneId&&typeof s.sceneId==='string'&&typeof s.sequenceId==='string'&&Number.isFinite(s.time)&&s.time>=0&&
    vector(s.shot?.position)&&vector(s.shot?.target)&&Number.isFinite(s.shot.fov)&&s.shot.fov>=10&&s.shot.fov<=100&&
    Array.isArray(s.actors)&&s.actors.length<=20&&s.actors.every(a=>typeof a.id==='string'&&typeof a.characterId==='string'&&vector(a.position)&&Number.isFinite(a.rotation)&&Number.isFinite(a.height)&&a.height>=.2&&a.height<=5)&&
    Array.isArray(s.performances)&&s.performances.every(p=>s.actors.some(a=>a.id===p.actorId)&&typeof p.action==='string')&&
    Array.isArray(s.entryIds)&&s.entryIds.every(v=>typeof v==='string')&&
    (s.ambient===undefined||s.ambient===null||STUDIO_AMBIENTS.includes(s.ambient))&&
    (s.variantId===undefined||s.variantId===null||typeof s.variantId==='string'&&/^[\w:.-]{1,200}$/.test(s.variantId))&&
    (s.sceneTime===undefined||Number.isFinite(s.sceneTime)&&s.sceneTime>=0);
}
export const STUDIO_AMBIENTS=['manana','mediodia','tarde','nublado','noche'];
/** Story Studio only stages zones that carry a lexicon (atlas previews do not). */
export const studioZones=zones=>zones.filter(z=>!z.atlas).map(z=>({id:z.id,label:z.label,cityLabel:z.cityLabel,countryLabel:z.countryLabel}));

/** The same city/canvas renders both direction and playback. No new scene or renderer. */
export async function createStoryStudioBridge({scene,camera,target,renderer,assets,style,estilos=null,zone,manifest,world,ground,loadNearby,navigation,lexico,pinned,colliders=null,perfilVida=null,keepCamera=false,aplicarVariante=null,win=window,fetcher=fetch}){
  const origin=origenDelAnfitrion({win,permitidos:LEXICO.hostOrigins});
  if(!origin)throw new Error('Story Studio necesita el anfitrión de SpanStories.');
  const response=await fetcher(new URL('Personajes/personajes.json',world.world.manifestUrl));
  if(!response.ok)throw new Error('No se pudo leer la biblioteca de personajes.');
  const catalog=(await response.json()).characters,templates=new Map(),actors=new Map(),templateRoots=new Set();
  const imported=await fetcher(new URL('importados/catalogo.json',response.url),{cache:'no-store'});
  if(imported.ok){const extra=await imported.json();for(const c of extra.characters??[])if(!catalog.some(item=>item.id===c.id))catalog.push(c);}
  else if(imported.status!==404)throw Error('No se pudo leer la biblioteca de personajes importados.');
  const behaviorLibrary=createBehaviorLibrary(fetcher,reference=>send('ERROR',{message:`La actuación «${reference.name}» ya no conserva su revisión ${reference.revision}: se usa la última guardada.`}));
  // keepCamera: se entra desde el Editor de escenarios; la vista que había se conserva tal cual (sin saltar al plano).
  // suspended: el Editor está delante; personajes, luces y plano siguen en la escena, sin dirigirse.
  let suspended=false;
  let revision=0,disposed=false,playing=false,waiting=false,student=false,allowLook=true,gesture=null,lastStage=null;
  let portraitLights=null;
  const initialFov=camera.fov;
  // Vida en reposo (LifeCharacter del Taller facial) de los personajes quietos de la historia. El módulo vive una sola
  // vez en Estudio/Talleres/taller-animacion/facial y serve.py lo sirve en /vida-personaje/ (sin copias).
  let vidaModulo=null;
  const cargarVidaModulo=()=>vidaModulo??=import(new URL('../vida-personaje/facial/VidaEnEscena.mjs',import.meta.url).href).then(async m=>{await m.prepararCorrecciones();return m;}).catch(error=>{vidaModulo=null;throw error;});
  const VIDA_QUIETO=['idle','listen','look','talk'],VIDA_DISTANCIA=35;
  /** Pose del GLB (antes de cualquier clip): la vida se construye sobre ella aunque el actor esté a media acción. */
  function enReposo(actor,fn){
    const now=actor.reposo.map(([b])=>[b.quaternion.clone(),b.position.clone(),b.scale.clone()]);
    for(const [b,q,p,sc] of actor.reposo){b.quaternion.copy(q);b.position.copy(p);b.scale.copy(sc);}
    try{return fn();}finally{actor.reposo.forEach(([b],i)=>{b.quaternion.copy(now[i][0]);b.position.copy(now[i][1]);b.scale.copy(now[i][2]);});}
  }
  function soltarVida(actor){if(!actor.vida)return;try{actor.vida.liberar();}catch{}actor.vida=null;actor.vidaKey=null;actor.vidaViva=false;}
  /** Crea, ajusta o retira la vida de cada actor según la puesta en escena (base de la escena + cambio del momento ya fusionados por el director). */
  async function syncVidas(s){
    for(const data of s.actors){
      const actor=actors.get(data.id);if(!actor)continue;
      const p=s.performances.find(x=>x.actorId===data.id);
      actor.quieto=!p||(!p.behavior&&VIDA_QUIETO.includes(p.action));
      const ajuste=data.vida&&data.vida.activa?data.vida:null;
      if(!ajuste){if(actor.vida){soltarVida(actor);if(!actor.external)performanceActor(actor,p,s.time);}continue;}
      const key=JSON.stringify(ajuste);
      if(actor.vida){if(actor.vidaKey!==key){actor.vida.aplicar(ajuste);actor.vidaKey=key;}continue;}
      if(actor.vidaCargando)continue;actor.vidaCargando=true;
      try{
        const M=await cargarVidaModulo(),problema=M.problemaVida(ajuste);if(problema)throw Error(problema);
        if(disposed||actors.get(data.id)!==actor)continue;
        const objetivo=id=>{const other=actors.get(id);return other?headBone(other)||other.root:null;};
        // LifeCharacter guarda como reposo la pose que encuentra: se le da la del GLB, no la de un clip a medias.
        let vida=null;const crear=M.crearVidaActor({root:actor.clone.root,camera,characterId:actor.characterId,ajuste,objetivo,enReposo:fn=>enReposo(actor,fn)});
        vida=await crear;
        if(disposed||actors.get(data.id)!==actor){vida.liberar();continue;}
        actor.vida=vida;actor.vidaKey=key;
      }catch(error){console.warn('Vida en reposo de '+data.id,error);send('LIFE_ERROR',{actorId:data.id,message:error.message});}
      finally{actor.vidaCargando=false;}
    }
  }
  /** Cada fotograma: antes del mezclador, la vida deja huesos y morphs en reposo; después suma respiración, mirada… */
  function vidaAntes(){
    for(const actor of actors.values()){
      const viva=!!actor.vida&&actor.quieto&&!actor.external&&actor.root.visible&&!!actor.root.parent&&camera.position.distanceTo(actor.root.position)<VIDA_DISTANCIA;
      // Deja de estar quieto (camina, actúa…): se suelta una vez, y el clip vuelve a mandar en todo el cuerpo.
      if(!viva&&actor.vidaViva){actor.vida.antes();actor.mixer.update(0);}
      actor.vidaViva=viva;if(viva)actor.vida.antes();
    }
  }
  function vidaDespues(dt){
    for(const actor of actors.values()){
      if(!actor.vidaViva)continue;
      // En pausa el mezclador no avanza: se vuelve a poner la pose del instante (la vida la había devuelto a reposo).
      if(!(playing||waiting))actor.mixer.update(0);
      actor.vida.update(dt,{cuerpoOcupado:!!actor.bodyClip});
    }
  }
  // Actor que el Taller de animación está dirigiendo en vivo (null si ninguno).
  let workshop=null,workshopLostAt=-Infinity;
  /** Confirma al Taller el último estado (vista o pose) que ya está en pantalla: una vez por fotograma, el nº mayor. */
  let drawnSeq=-Infinity,drawnRaf=0;
  // Canal directo con el taller (MessageChannel que reparte el Estudio en WORKSHOP_BEGIN): vista, pose y confirmaciones
  // van de marco a marco sin pasar por el Estudio, que vive en otro proceso y añadía varios fotogramas de retraso.
  let workshopPort=null;
  const closeWorkshopPort=(lost=false)=>{if(!workshopPort)return;try{if(lost)workshopPort.postMessage({type:'WORKSHOP_LOST'});workshopPort.close();}catch{}workshopPort=null;};
  const ackDrawn=seq=>{if(seq>drawnSeq)drawnSeq=seq;if(!drawnRaf)drawnRaf=win.requestAnimationFrame(()=>{drawnRaf=0;if(workshopPort)workshopPort.postMessage({type:'WORKSHOP_DRAWN',seq:drawnSeq});else send('WORKSHOP_DRAWN',{seq:drawnSeq});});};
  function restoreWorkshopPair(){
    for(const entry of workshop?.pair?.values()||[]){
      const {actor,actorId,transforms}=entry;
      for(const {node,position,quaternion,scale} of transforms){
        node.position.copy(position);node.quaternion.copy(quaternion);node.scale.copy(scale);
      }
      actor.external=actor===workshop.actor;
      if(lastStage&&!actor.external)performanceActor(actor,lastStage.performances.find(p=>p.actorId===actorId),lastStage.time);
    }
    if(workshop)workshop.pair=null;
  }
  function holdActorPose(actor){
    const bones=[],morphs=[];
    actor.clone.root.traverse(node=>{
      if(node.isBone)bones.push({node,p:node.position.clone(),q:node.quaternion.clone(),s:node.scale.clone()});
      if(node.morphTargetInfluences)morphs.push({node,w:[...node.morphTargetInfluences]});
    });
    actor.mixer.stopAllAction();
    for(const {node,p,q,s} of bones){node.position.copy(p);node.quaternion.copy(q);node.scale.copy(s);}
    for(const {node,w} of morphs)w.forEach((value,i)=>{node.morphTargetInfluences[i]=value;});
    actor.root.updateMatrixWorld(true);
  }
  const workshopPose=(bones,root=null)=>({
    matched:bones.map(Boolean),
    q:bones.flatMap(b=>b?b.quaternion.toArray():[0,0,0,1]),
    p:bones.flatMap(b=>b?b.position.toArray():[0,0,0]),
    s:bones.flatMap(b=>b?b.scale.toArray():[1,1,1]),
    ...(root?{matrices:modelBoneMatrices(root,bones)}:{}),
  });
  function endWorkshop(){closeWorkshopPort(true);if(!workshop)return;restoreWorkshopPair();const {actor,bones,rest,morphs}=workshop;workshop=null;actor.external=false;bones.forEach((b,i)=>{if(b){b.quaternion.copy(rest[i].q);b.position.copy(rest[i].p);if(rest[i].s)b.scale.copy(rest[i].s);}});for(const m of morphs)m.rest.forEach((v,i)=>{m.mesh.morphTargetInfluences[i]=v;});const id=[...actors].find(([,a])=>a===actor)?.[0];if(lastStage&&id)performanceActor(actor,lastStage.performances.find(p=>p.actorId===id),lastStage.time);}
  /** Hueso de la cabeza del actor (Mixamo, AccuRig…): para mirar a otro personaje y para encuadrar el rostro. */
  function headBone(actor){if(actor.headBone!==undefined)return actor.headBone;let found=null;actor.clone.root.traverse(o=>{if(!found&&o.isBone&&/(^|[^a-z])head$/i.test(o.name))found=o;});return actor.headBone=found;}
  /** Posición de la cabeza en el mundo: el hueso si lo hay; si no, el 92 % de la altura de la caja. */
  function headOf(actor){
    actor.root.updateMatrixWorld(true);const bone=headBone(actor);if(bone)return bone.getWorldPosition(new T.Vector3()).toArray();
    const p=actor.root.getWorldPosition(new T.Vector3()),box=new T.Box3().setFromObject(actor.root),top=Number.isFinite(box.max.y)&&box.max.y>p.y?box.max.y:p.y+(actor.height||1.6);
    return [p.x,p.y+(top-p.y)*.92,p.z];
  }
  let lookYaw=0,lookPitch=0,placement=null,lastShotKey='',picking=null,press=null;
  // Personaje seleccionado (clic en el escenario o pestaña Personajes): centro de la pantalla y de la órbita (CityNavigation.setPivot).
  let selectedActor=null;
  function hipsBone(actor){if(actor.hipsBone!==undefined)return actor.hipsBone;let found=null;actor.clone.root.traverse(o=>{if(!found&&o.isBone&&/(^|[^a-z])(hips|pelvis)$/i.test(o.name))found=o;});return actor.hipsBone=found;}
  const actorAt=e=>{const roots=[...actors.values()].filter(a=>a.root.visible).map(a=>a.root);for(const hit of rayAt(e).intersectObjects(roots,true)){for(let o=hit.object;o;o=o.parent){const found=[...actors.entries()].find(([,a])=>a.root===o);if(found)return found[0];}}return null;};
  // Cámaras del Estudio: último cambio aplicado (los cortes reinician la mirada), pista de fotogramas que el
  // anfitrión calcula por delante (los mensajes llegan a ~10 Hz; aquí se interpola a la frecuencia del motor),
  // vista libre del autor y «Pilotar cámara».
  let lastVariant=null,lastSwitchId=null,stageTrack=null,viewMode='camera',pilot=null,pilotTimer=0;
  // Cámara del estudiante: en «Vista libre» el autor se mueve donde quiera (acercarse, revisar una animación de
  // cerca, editar) y la cámara del estudiante sigue en su sitio, dibujada como una pirámide y vista en un recuadro.
  const studentCam=new T.PerspectiveCamera(camera.fov,camera.aspect,camera.near,camera.far);studentCam.layers.mask=camera.layers.mask;
  let studentTarget=new T.Vector3(),inset=true;
  const studentGizmo=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:0xffb347,depthTest:false,transparent:true,opacity:.95}));
  studentGizmo.name='StudentCameraGizmo';studentGizmo.renderOrder=60;studentGizmo.frustumCulled=false;studentGizmo.userData.ignorarSeleccion=true;studentGizmo.raycast=()=>{};
  function placeStudent(position,lookAt,fov){
    studentCam.position.fromArray(position);studentTarget.fromArray(lookAt);studentCam.lookAt(studentTarget);
    if(Math.abs(studentCam.fov-fov)>1e-4){studentCam.fov=fov;studentCam.updateProjectionMatrix();}
    studentCam.updateMatrixWorld(true);
    // Pirámide de 1,2 m de largo: vértice en la cámara y rectángulo con el encuadre (16:9 por la zona segura).
    const d=1.2,h=Math.tan(T.MathUtils.degToRad(studentCam.fov)/2)*d,w=h*(studentCam.aspect||16/9);
    const c=[[-w,-h,-d],[w,-h,-d],[w,h,-d],[-w,h,-d]].map(p=>new T.Vector3(...p).applyMatrix4(studentCam.matrixWorld)),o=studentCam.position;
    const up=new T.Vector3(0,h*1.5,-d).applyMatrix4(studentCam.matrixWorld);
    const pts=[o,c[0],o,c[1],o,c[2],o,c[3],c[0],c[1],c[1],c[2],c[2],c[3],c[3],c[0],c[3],up,up,c[2]];
    studentGizmo.geometry.setFromPoints(pts);studentGizmo.geometry.computeBoundingSphere();
  }
  const send=(type,data={})=>win.parent.postMessage({channel:CHANNEL,version:1,type,...data},origin);
  const canvas=renderer.domElement;
  // Caminos de las caminatas (Motion Director del Estudio): se ven sobre el suelo, y sus puntos se eligen y se
  // arrastran con el ratón. Solo dirigiendo: el estudiante y el Editor no los ven.
  // Todo va pegado al suelo, como en las herramientas de dirección: un disco bajo los pies de cada personaje (dónde
  // está), y por cada caminata una franja sobre el suelo con flechas de sentido, discos pequeños en los puntos
  // intermedios y un disco de llegada con contorno (dónde estará).
  const pathLayer=new T.Group();pathLayer.name='StudioPaths';scene.add(pathLayer);
  // Caminos de las cámaras con nombre: a su altura real, con una línea hasta el suelo en cada punto.
  const cameraPathLayer=new T.Group();cameraPathLayer.name='StudioCameraPaths';cameraPathLayer.renderOrder=40;pathLayer.add(cameraPathLayer);
  pathLayer.add(studentGizmo);studentGizmo.visible=false;
  const holdingView=()=>!!workshop||(viewMode==='free'&&!student);
  function clearCameraPaths(){for(const o of [...cameraPathLayer.children]){o.traverse(x=>{x.geometry?.dispose();x.material?.dispose();});o.removeFromParent();}}
  function drawCameraPaths(items){
    clearCameraPaths();
    for(const item of items){
      const color=item.selected?0xffd166:0xb388ff,group=new T.Group();
      const line=new T.Line(new T.BufferGeometry().setFromPoints(item.samples.map(p=>new T.Vector3(...p))),new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));
      line.renderOrder=41;group.add(line);
      for(const p of item.points){
        const dot=new T.Mesh(new T.SphereGeometry(.09,12,8),new T.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));dot.position.fromArray(p);dot.renderOrder=42;group.add(dot);
        const drop=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(...p),new T.Vector3(p[0],ground(p[0],p[2])+.02,p[2])]),new T.LineDashedMaterial({color,dashSize:.12,gapSize:.08,depthTest:false,transparent:true,opacity:.6}));
        drop.computeLineDistances();drop.renderOrder=41;group.add(drop);
      }
      group.traverse(o=>{o.userData.ignorarSeleccion=true;o.userData.editorOverlay=true;o.frustumCulled=false;});
      cameraPathLayer.add(group);
    }
  }
  const sendPilotView=()=>{if(!pilot||student||suspended)return;win.clearTimeout(pilotTimer);pilotTimer=win.setTimeout(()=>send('PILOT_VIEW',{cameraId:pilot,shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,transition:0}}),250);};
  /** Auditoría de cámaras en edición: paredes, interior de volúmenes, oclusión y encuadre. Nunca cambia nada. */
  function auditCameras(checks){
    const box=new T.Box3(),ray=new T.Ray(),v=new T.Vector3(),w=new T.Vector3();
    // `colliders` es la consulta del motor (punto, radio) → cajas; se acepta también un CityCollisionIndex.
    const nearby=(p,r)=>typeof colliders==='function'?colliders(p,r)||[]:colliders?.query?.(p,r,[])||[];
    const boundsOf=e=>e?.bounds?.isBox3?e.bounds:e?.bounds?.min&&e?.bounds?.max?box.set(new T.Vector3().fromArray(e.bounds.min.toArray?e.bounds.min.toArray():e.bounds.min),new T.Vector3().fromArray(e.bounds.max.toArray?e.bounds.max.toArray():e.bounds.max)).clone():null;
    const insideAt=p=>{if(!colliders)return false;const q=new T.Vector3().fromArray(p);for(const e of nearby(q,.05)){if(e?.enabled===false||e?.visible===false||e?.source?.enabled===false)continue;if(boundsOf(e)?.containsPoint(q))return true;}return false;};
    const crosses=(a,b)=>{if(!colliders)return false;const from=new T.Vector3().fromArray(a),to=new T.Vector3().fromArray(b),length=from.distanceTo(to);if(length<1e-6)return insideAt(a);
      const mid=from.clone().add(to).multiplyScalar(.5);ray.set(from,to.clone().sub(from).normalize());
      for(const e of nearby(mid,length/2+.05)){if(e?.enabled===false||e?.visible===false||e?.source?.enabled===false)continue;const b=boundsOf(e);if(!b)continue;const hit=ray.intersectBox(b,new T.Vector3());if(hit&&hit.distanceTo(from)<=length)return true;}return false;};
    const roots=[...actors.values()].map(a=>a.root);
    const ownedBy=(o,root)=>{for(;o;o=o.parent)if(o===root)return true;return false;};
    const occluded=(from,to)=>{v.fromArray(from);w.fromArray(to);const d=v.distanceTo(w);if(d<1e-3)return false;const r=new T.Raycaster(v.clone(),w.clone().sub(v).normalize(),.05,Math.max(.06,d-.35));
      return r.intersectObjects(scene.children,true).some(h=>h.object.visible&&!h.object.userData.ignorarSeleccion&&!ownedBy(h.object,pathLayer)&&!roots.some(root=>ownedBy(h.object,root)));};
    const offscreen=(shot,points,aspect)=>{const c=new T.PerspectiveCamera(shot.fov,aspect,.05,2000);c.position.fromArray(shot.position);c.lookAt(new T.Vector3(...shot.target));c.updateMatrixWorld(true);c.updateProjectionMatrix();
      return points.map((p,i)=>{v.fromArray(p).project(c);return v.z>1||Math.abs(v.x)>.96||Math.abs(v.y)>.96?i:-1;}).filter(i=>i>=0);};
    return checks.map(check=>{
      const out={id:check.id};
      if(check.kind==='segment'){out.wall=check.points.slice(1).some((p,i)=>crosses(check.points[i],p));out.inside=check.points.some(insideAt);}
      if(check.kind==='view'){
        const aspects=Array.isArray(check.aspects)&&check.aspects.length?check.aspects.filter(Number.isFinite).slice(0,4):[16/9];
        out.inside=insideAt(check.shot.position);
        out.occluded=check.subjects.map((p,i)=>occluded(check.shot.position,p)?i:-1).filter(i=>i>=0);
        out.offscreen=Object.fromEntries(aspects.map(a=>[a.toFixed(3),offscreen(check.shot,check.subjects,a)]));
        // Objetos de una puerta «toca un objeto»: ¿se ve al menos uno de sus objetos en el plano?
        const ids=Array.isArray(check.entryIds)?check.entryIds.filter(x=>typeof x==='string').slice(0,20):[];
        const centers=ids.length?lexico?.centros?.(ids)??{}:{};
        out.entries=Object.fromEntries(ids.map(id=>{const pts=centers[id]??[];if(!pts.length)return [id,null];return [id,Object.fromEntries(aspects.map(a=>[a.toFixed(3),offscreen(check.shot,pts,a).length<pts.length]))];}));
      }
      return out;
    });
  }
  const routeMarks=new T.Group();routeMarks.name='StudioRoutes';
  const actorMarks=new T.Group();actorMarks.name='StudioActorMarks';
  pathLayer.add(actorMarks,routeMarks);
  const PATH_COLORS={line:0x4aa8ff,selected:0xffc23d,point:0xffffff};
  // Un color por personaje: su disco y sus caminos comparten color (la caminata elegida se resalta en amarillo).
  const ACTOR_COLORS=[0x4aa8ff,0xff6f61,0x4fd18b,0xb98bff,0x3fd6d6,0xff8fc7];
  const actorColors=new Map();
  const actorColor=id=>{if(typeof id!=='string'||!id)return PATH_COLORS.line;if(!actorColors.has(id))actorColors.set(id,ACTOR_COLORS[actorColors.size%ACTOR_COLORS.length]);return actorColors.get(id);};
  let pathItems=[],pathHandles=[],pathDrag=null;
  const validPaths=items=>Array.isArray(items)&&items.length<=STORY_STUDIO.pathMax&&items.every(p=>p&&typeof p.cueId==='string'&&(p.actorId===undefined||typeof p.actorId==='string')&&vector(p.start)&&Array.isArray(p.points)&&p.points.length>=1&&p.points.length<=STORY_STUDIO.pathPoints&&p.points.every(vector));
  /**
   * Curva Catmull-Rom por los puntos: el mismo cálculo y el mismo paso que routeSamples (features/story-studio/path.ts),
   * así la franja pasa exactamente por donde anda el actor. Devuelve la curva tal cual (la altura la pone el suelo).
   */
  function pathCurve(points){
    const P=points.filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1],p[2]-a[i-1][2])>1e-6);
    const out=[],n=P.length,at=i=>P[Math.max(0,Math.min(n-1,i))];
    for(let i=0;i<n-1;i++){
      const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),k=Math.max(1,Math.ceil(Math.hypot(p2[0]-p1[0],p2[1]-p1[1],p2[2]-p1[2])/STORY_STUDIO.pathStep));
      for(let j=0;j<k;j++){const u=j/k,u2=u*u,u3=u2*u,c=(a,b,d,e)=>n>2?.5*(2*b+(-a+d)*u+(2*a-5*b+4*d-e)*u2+(-a+3*b-3*d+e)*u3):b+(d-b)*u;out.push(new T.Vector3(c(p0[0],p1[0],p2[0],p3[0]),c(p0[1],p1[1],p2[1],p3[1]),c(p0[2],p1[2],p2[2],p3[2])));}
    }
    const last=P[n-1];out.push(new T.Vector3(last[0],last[1],last[2]));return out;
  }
  /** Altura de las marcas: el suelo del escenario y unos centímetros (nunca el aire entre dos puntos). */
  const floorAt=(x,z,extra=0)=>ground(x,z)+STORY_STUDIO.pathLift+extra;
  // El render estilizado (EstilosCompartidos) dibuja aparte, encima, lo marcado como editorOverlay. Se quedan en la
  // capa 0: la optimización de render descarta los grupos sin nada dibujable en esa capa.
  const overlay=o=>{o.userData.ignorarSeleccion=true;o.userData.editorOverlay=true;};
  // Semitransparentes y sin escribir profundidad; el desfase de polígono evita el parpadeo contra el suelo cuando
  // el render compara profundidad (en la pasada de superposición se dibujan siempre encima).
  const markMaterial=(color,opacity)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const flatMesh=(geometry,color,opacity,order)=>{const m=new T.Mesh(geometry.rotateX(-Math.PI/2),markMaterial(color,opacity));m.renderOrder=order;m.frustumCulled=false;overlay(m);return m;};
  /** Disco plano: relleno translúcido y contorno más opaco (edge = grosor del contorno, fracción del radio). */
  function groundDisc(radius,color,{fill,edge,ring,order}){
    const disc=flatMesh(new T.CircleGeometry(radius,40),color,fill,order);
    disc.add(flatMesh(new T.RingGeometry(radius*(1-edge),radius,40),color,ring,order+1));
    return disc;
  }
  function disposeMarks(group){group.traverse(o=>{if(o===group)return;o.geometry?.dispose();o.material?.dispose();});group.clear();}
  /** Franja de ancho fijo que sigue el suelo bajo la curva (y flechas de sentido cada pathArrow metros). */
  function groundStrip(curve,color,opacity){
    const half=STORY_STUDIO.pathWidth/2,sides=[],index=[],arrows=[],floor=curve.map(p=>floorAt(p.x,p.z));
    let run=0,next=STORY_STUDIO.pathArrow*.5;
    curve.forEach((p,i)=>{
      const a=curve[Math.max(0,i-1)],b=curve[Math.min(curve.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,tx=dx/l,tz=dz/l,nx=-tz*half,nz=tx*half;
      sides.push(p.x+nx,floor[i],p.z+nz,p.x-nx,floor[i],p.z-nz);if(i)index.push(i*2-2,i*2-1,i*2,i*2-1,i*2+1,i*2);
      if(i)run+=Math.hypot(p.x-curve[i-1].x,p.z-curve[i-1].z);
      // Flecha («>») apoyada en el suelo: punta hacia donde anda el actor.
      if(i&&i<curve.length-1&&run>=next){next+=STORY_STUDIO.pathArrow;const s=half*2.4,y=floor[i]+.005;arrows.push(p.x+tx*s,y,p.z+tz*s,p.x-tx*s*.6+nx*2.4,y,p.z-tz*s*.6+nz*2.4,p.x-tx*s*.6-nx*2.4,y,p.z-tz*s*.6-nz*2.4);}
    });
    const ribbon=new T.BufferGeometry();ribbon.setAttribute('position',new T.Float32BufferAttribute(sides,3));ribbon.setIndex(index);
    const strip=new T.Mesh(ribbon,markMaterial(color,opacity));strip.renderOrder=20;strip.frustumCulled=false;overlay(strip);
    if(arrows.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(arrows,3));const arrow=new T.Mesh(g,markMaterial(color,Math.min(1,opacity+.3)));arrow.renderOrder=21;arrow.frustumCulled=false;overlay(arrow);strip.add(arrow);}
    return strip;
  }
  function drawPaths(){
    disposeMarks(routeMarks);pathHandles=[];
    for(const item of pathItems){
      const color=item.selected?PATH_COLORS.selected:actorColor(item.actorId);
      const curve=pathCurve([item.start,...item.points]);
      routeMarks.add(groundStrip(curve,color,item.selected?.75:.5));
      item.points.forEach((p,index)=>{
        const on=item.selected&&item.selectedIndex===index,goal=index===item.points.length-1;
        const radius=goal?STORY_STUDIO.pathGoal:STORY_STUDIO.pathDisc;
        // El asa invisible (un cilindro bajo) recoge el clic aunque la cámara mire el disco casi de canto.
        const pick=new T.CylinderGeometry(radius,radius,radius*1.2,20);pick.translate(0,radius*.6,0);
        const handle=new T.Mesh(pick,new T.MeshBasicMaterial({visible:false}));overlay(handle);handle.frustumCulled=false;
        handle.add(goal?groundDisc(radius,on?PATH_COLORS.point:color,{fill:.55,edge:.22,ring:1,order:24}):groundDisc(radius,on?PATH_COLORS.point:color,{fill:.6,edge:.18,ring:.95,order:22}));
        if(goal){const dot=flatMesh(new T.CircleGeometry(radius*.28,24),on?color:PATH_COLORS.point,.95,26);dot.position.y=.003;handle.add(dot);}
        handle.position.set(p[0],floorAt(p[0],p[2],goal?.004:.002),p[2]);
        handle.userData.studioPath={cueId:item.cueId,index};handle.userData.radius=radius;
        routeMarks.add(handle);pathHandles.push(handle);
      });
    }
  }
  /** Discos bajo los pies de los personajes de la puesta en escena (se mueven con cada STAGE). */
  function drawActorMarks(list){
    const keep=new Set(list.map(a=>a.id));
    for(const mark of [...actorMarks.children])if(!keep.has(mark.userData.actorId)){disposeMarks(mark);mark.geometry?.dispose();mark.material?.dispose();mark.removeFromParent();}
    for(const a of list){
      const radius=STORY_STUDIO.pathActor*a.height,color=actorColor(a.id);
      let mark=actorMarks.children.find(m=>m.userData.actorId===a.id);
      if(mark&&(mark.userData.radius!==radius||mark.userData.color!==color)){disposeMarks(mark);mark.geometry.dispose();mark.material.dispose();mark.removeFromParent();mark=null;}
      if(!mark){
        mark=groundDisc(radius,color,{fill:.28,edge:.14,ring:.9,order:16});
        // Muesca hacia donde mira el personaje.
        const notch=new T.BufferGeometry();notch.setAttribute('position',new T.Float32BufferAttribute([0,0,radius*1.32, -radius*.26,0,radius*.9, radius*.26,0,radius*.9],3));
        const tip=new T.Mesh(notch,markMaterial(color,.9));tip.renderOrder=18;tip.frustumCulled=false;overlay(tip);mark.add(tip);
        mark.userData.actorId=a.id;mark.userData.radius=radius;mark.userData.color=color;actorMarks.add(mark);
      }
      mark.position.set(a.position[0],floorAt(a.position[0],a.position[2]),a.position[2]);mark.rotation.y=a.rotation;
    }
  }
  // Vida ambiental (NPC) grabada por escena. El estudiante solo la reproduce: su
  // reloj sale del tiempo de la escena y nunca de decisiones tomadas en directo.
  const vidas=new Map();let vidaEscena=null,vidaReloj=0,vidaUltimo=0;
  const hablarVida=texto=>{const voz=win.speechSynthesis,Frase=win.SpeechSynthesisUtterance;if(!voz||!Frase)return;voz.cancel();const u=new Frase(texto);u.lang=LEXICO.speechLang;u.rate=LEXICO.speechRate;voz.speak(u);};
  const vida=crearReproductorVida({scene,camera,cargarPersonaje:id=>template(id),perfil:()=>perfilVida?.(),contenedor:canvas.parentElement||null,lienzo:canvas,hablar:hablarVida});
  function montarVida(sceneId){
    vidaEscena=sceneId;const datos=vidas.get(sceneId);
    return datos?vida.montar(datos).catch(error=>{send('ERROR',{message:'Vida ambiental: '+error.message});}):Promise.resolve(vida.desmontar());
  }
  function validTrack(t,s){
    return !!t&&t.sequenceId===s.sequenceId&&Number.isFinite(t.step)&&t.step>0&&t.step<=1&&Array.isArray(t.frames)&&t.frames.length>=2&&t.frames.length<=64&&
      t.frames.every(f=>vector(f.shot?.position)&&vector(f.shot?.target)&&Number.isFinite(f.shot.fov)&&f.shot.fov>=10&&f.shot.fov<=100&&Array.isArray(f.actors)&&f.actors.length===s.actors.length&&f.actors.every(a=>Array.isArray(a)&&a.length===4&&a.every(Number.isFinite)));
  }
  const lerpAngle=(a,b,k)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*k;
  /** Interpola la pista de fotogramas del anfitrión: cámara y actores se mueven a la frecuencia del motor. */
  function applyTrack(){
    const t=stageTrack,frames=t.frames,f=Math.min(frames.length-1,Math.max(0,(performance.now()-t.arrived)/1000/t.step)),i=Math.min(frames.length-2,Math.floor(f)),k=f-i,a=frames[i],b=frames[i+1];
    const mixv=(p,q)=>p.map((v,n)=>v+(q[n]-v)*k);
    const fov=a.shot.fov+(b.shot.fov-a.shot.fov)*k;
    // Con la vista libre, la pista mueve la cámara del estudiante y no la del autor.
    if(holdingView())placeStudent(mixv(a.shot.position,b.shot.position),mixv(a.shot.target,b.shot.target),fov);
    else{camera.position.fromArray(mixv(a.shot.position,b.shot.position));target.fromArray(mixv(a.shot.target,b.shot.target));
    if(Math.abs(fov-camera.fov)>1e-4){camera.fov=fov;camera.updateProjectionMatrix();}
    camera.lookAt(target);if(student)applyLook();}
    lastStage?.actors.forEach((data,n)=>{const actor=actors.get(data.id);if(!actor||actor.external)return;const p=a.actors[n],q=b.actors[n];actor.root.position.set(p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k,p[2]+(q[2]-p[2])*k);actor.root.rotation.y=lerpAngle(p[3],q[3],k);});
  }
  function applyLook(){
    if(!lastStage)return;
    const direction=new T.Vector3(...lastStage.shot.target).sub(new T.Vector3(...lastStage.shot.position));
    const sphere=new T.Spherical().setFromVector3(direction);
    sphere.theta+=lookYaw;sphere.phi=T.MathUtils.clamp(sphere.phi+lookPitch,.1,Math.PI-.1);
    target.copy(camera.position).add(direction.setFromSpherical(sphere));camera.lookAt(target);
  }
  async function template(id){
    if(templates.has(id))return templates.get(id);
    const character=catalog.find(c=>c.id===id);if(!character)throw new Error('Personaje fuera de la biblioteca: '+id);
    const promise=(async()=>{
      const url=new URL(character.url,response.url).href,gzipUrl=character.gzipUrl?new URL(character.gzipUrl,response.url).href:null;
      const {buffer,json,binary}=await fetchCityGLB(url,{gzipUrl,sha256:character.sha256,prepareForParse:true});
      const gltf=await assets.loader.parseAsync(json||buffer,new URL('.',url).href,binary||null);
      if(character.id.startsWith('importado-'))gltf.scene.traverse(node=>{if(node.isMesh&&!node.geometry.getAttribute('normal'))node.geometry.computeVertexNormals();});
      // Personajes con materiales propios (dato del catálogo, no un nombre): conservan sus materiales y, en el
      // aeropuerto del estudio, reciben luz de retrato; el resto adopta el estilo de la ciudad.
      const ownMaterials=character.materialesPropios===true||gltf.scene.userData.spanstoriesPreserveModel===true;
      if(ownMaterials&&manifest.studioAirport){
        if(!portraitLights){portraitLights=new T.Group();portraitLights.name='StudioPortraitLights';portraitLights.add(new T.HemisphereLight(0xffffff,0x536078,2));const key=new T.DirectionalLight(0xffffff,1.2);key.position.set(-18,3,5);portraitLights.add(key);scene.add(portraitLights);win.addEventListener('pagehide',()=>portraitLights?.removeFromParent(),{once:true});}
      }else if(gltf.scene.userData.spanstoriesPreserveModel!==true) await style.adaptAsync(gltf.scene,gltf);
      if(character.animationLibraryUrl){
        const libraryUrl=new URL(character.animationLibraryUrl,response.url).href;
        const packed=await fetchCityGLB(libraryUrl);
        const library=await assets.loader.parseAsync(packed.buffer,new URL('.',libraryUrl).href);
        gltf.animations.push(...library.animations);gltf.studioIdleClip=character.studioIdleClip;
      }
      gltf.scene.traverse(o=>{o.userData.ignorarSeleccion=true;if(ownMaterials&&o.isMesh)o.frustumCulled=false;});
      templateRoots.add(gltf.scene);
      send('CHARACTER_READY',{characterId:id,modelUrl:url,animations:gltf.animations.map(c=>c.name)});
      return gltf;
    })();templates.set(id,promise);
    promise.catch(()=>templates.delete(id));return promise;
  }
  async function ensureActor(data){
    let actor=actors.get(data.id);if(actor?.characterId===data.characterId)return actor;
    const gltf=await template(data.characterId);
    if(disposed)return null;
    actor=actors.get(data.id);if(actor?.characterId===data.characterId)return actor;
    // Cambio de personaje: se retira el actor anterior entero (raíz y mezclador), no solo su copia del modelo.
    if(actor){actor.root.removeFromParent();actor.mixer?.stopAllAction();actor.mixer?.uncacheRoot(actor.clone.root);actor.clone.dispose();actors.delete(data.id);}
    if(actor)soltarVida(actor);
    const clone=cloneCityAvatar(gltf.scene),root=new T.Group(),carrier=new T.Group();
    carrier.add(clone.root);root.add(carrier);root.name='StoryActor:'+data.id;root.userData.storyActorId=data.id;
    clone.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(clone.root),size=box.getSize(new T.Vector3());
    const scale=data.height/(size.y||1);carrier.scale.setScalar(scale);carrier.position.set(-(box.min.x+box.max.x)*.5*scale,-box.min.y*scale,-(box.min.z+box.max.z)*.5*scale);
    scene.add(root);
    const mixer=new T.AnimationMixer(clone.root);
    const clips=gltf.animations.map(c=>{const clip=c.clone();for(const track of clip.tracks)if(/(hips|root).*\.position$/i.test(track.name)&&track.getValueSize()===3)for(let i=3;i<track.values.length;i+=3){track.values[i]=track.values[0];track.values[i+2]=track.values[2];}return clip;});
    const reposo=[];clone.root.traverse(o=>{if(o.isBone)reposo.push([o,o.quaternion.clone(),o.position.clone(),o.scale.clone()]);});
    actor={root,clone,mixer,clips,characterId:data.characterId,carrier,height:data.height,idleClip:gltf.studioIdleClip,reposo};actors.set(data.id,actor);return actor;
  }
  function performanceActor(actor,p,time){
    if(actor.external)return; // lo está posando el Taller de animación
    actor.behaviorControlled=!!p?.behavior;
    if(p?.behavior&&actor.behaviors?.has(p.behavior.url)){
      const clip=actor.behaviors.get(p.behavior.url);actor.behaviorSpeed=clip.duration/Math.max(.05,p.duration);actor.mixer.stopAllAction();
      const action=actor.mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();action.time=performanceTime(time,p,clip.duration);actor.mixer.update(0);return;
    }
    const specific=p?.action==='wave'?actor.clips.find(c=>/wave|greet/i.test(c.name)):p?.action==='nod'?actor.clips.find(c=>/nod|agree/i.test(c.name)):null;
    const clip=p?.clipName?actor.clips.find(c=>c.name===p.clipName):p?.action==='walk'?actor.clips.find(c=>/^Walking$/i.test(c.name)):specific||actor.clips.find(c=>c.name===actor.idleClip)||actor.clips.find(c=>/^(idle|restpose)$/i.test(c.name));
    actor.mixer.stopAllAction();actor.bodyClip=!!clip;
    if(clip){const action=actor.mixer.clipAction(clip);action.play();action.time=Math.max(0,time-(p?.at||0))%Math.max(clip.duration,.001);}
    if(p?.action==='talk'){const mouth=actor.clips.find(c=>/facial.*mouth/i.test(c.name));if(mouth){const action=actor.mixer.clipAction(mouth);action.play();action.time=Math.max(0,time-p.at)%Math.max(mouth.duration,.001);}}
    // Explicitly named facial channels are independent of body clips.
    if(p?.expression){const expression=actor.clips.find(c=>c.name===p.expression);if(expression){const action=actor.mixer.clipAction(expression);action.play();action.time=Math.min(Math.max(0,time-p.at),expression.duration);}}
    actor.mixer.update(0);
  }
  async function receive(e){
    if(e.origin!==origin||e.source!==win.parent)return;
    const m=e.data;if(m?.channel!==CHANNEL||m.version!==1)return;
    if(m.type==='HELLO'){ready();return;}
    if(m.type==='REGISTER_CHARACTER'){
      try{
        if(student||suspended)throw Error('Vuelve al Estudio para añadir el personaje desde la biblioteca.');
        const c=m.character;
        if(!c||!/^importado-[a-f0-9]{64}$/.test(c.id)||typeof c.label!=='string'||c.url!=='./importados/'+c.id.slice(10)+'.glb'||c.sha256!==c.id.slice(10))throw Error('Referencia de personaje importado inválida.');
        if(!catalog.some(item=>item.id===c.id))catalog.push(c);
        await template(c.id);
        send('CHARACTER_REGISTERED',{requestId:m.requestId,characterId:c.id});
      }catch(error){send('CHARACTER_IMPORT_ERROR',{requestId:m.requestId,message:error.message});}return;
    }
    if(m.type==='SCENARIO_INFO'&&!student){
      try{
        const choice=world.zones.find(z=>z.id===m.zoneId);if(!choice)throw Error('Escenario desconocido.');
        const r=await fetcher(choice.manifestUrl);if(!r.ok)throw Error('No se pudo cargar el escenario.');const manifest=await r.json();
        if(!vector(manifest.spawn))throw Error('El escenario no tiene una entrada válida.');
        const spawn=manifest.spawn;
        send('SCENARIO_INFO',{requestId:m.requestId,zoneId:choice.id,spawn,shot:manifest.studioShot??{position:spawn.map((v,i)=>v+CITY.inspectionOffset[i]),target:[spawn[0],spawn[1]+CITY.inspectionHeight,spawn[2]],fov:camera.fov,transition:0}});
      }catch(error){send('SCENARIO_INFO',{requestId:m.requestId,error:error.message});}return;
    }
    if(m.type==='FOCUS_ACTOR'&&!student){
      const actor=actors.get(m.actorId),ratio=Object.hasOwn(STORY_STUDIO.shotHeight,m.shotType)?STORY_STUDIO.shotHeight[m.shotType]:null;
      if(!actor||!ratio)return;
      actor.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(actor.root),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
      const height=size.y*ratio;center.y=box.max.y-height/2;
      const distance=height*STORY_STUDIO.frameMargin/(2*Math.tan(T.MathUtils.degToRad(camera.fov)/2));
      camera.position.set(center.x+Math.sin(actor.root.rotation.y)*distance,center.y,center.z+Math.cos(actor.root.rotation.y)*distance);target.copy(center);camera.lookAt(target);
      send('FOCUSED',{shotType:m.shotType,shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,transition:0}});return;
    }
    if(m.type==='CAPTURE'){
      const position=new T.Vector3(target.x,ground(target.x,target.z),target.z);
      send('CAPTURED',{requestId:m.requestId,shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,transition:0},position:position.toArray()});return;
    }
    if(m.type==='SELECT_ACTOR'){selectedActor=typeof m.actorId==='string'?m.actorId:null;return;}
    if(m.type==='CANCEL_PLACE'){if(placement){placement=null;send('PLACING',{actorId:null});}return;}
    if(m.type==='PLACE'&&!student){if(suspended){send('ERROR',{message:'Vuelve al Estudio para colocar el personaje.'});return;}picking=null;placement=m.actorId;send('PLACING',{actorId:placement});return;}
    // One-shot authoring pick: a ground point (walk destinations) or the lexical object under the cursor.
    if(m.type==='PICK'&&!student&&typeof m.requestId==='string'&&(m.mode==='point'||m.mode==='entry')){placement=null;if(picking)send('PICKED',{requestId:picking.requestId,cancelled:true});picking={requestId:m.requestId,mode:m.mode};send('PICKING',{requestId:m.requestId,mode:m.mode});return;}
    // Caminos de la escena que se está dirigiendo: el Estudio manda todos cada vez que cambian.
    if(m.type==='PATHS'){if(student||!validPaths(m.items))return;pathItems=m.items.map(p=>({cueId:p.cueId,actorId:typeof p.actorId==='string'?p.actorId:null,start:p.start,points:p.points.map(v=>[...v]),selected:p.selected===true,selectedIndex:Number.isInteger(p.selectedIndex)?p.selectedIndex:-1}));pathDrag=null;try{drawPaths();send('PATHS_DRAWN',{paths:pathItems.length,points:pathHandles.length,visible:pathLayer.visible&&pathLayer.parent===scene});}catch(error){send('PATHS_ERROR',{message:error.message});}return;}
    // Taller de animación «En escena»: el Taller edita sobre este mismo escenario. Él calcula la pose y mueve la
    // cámara; aquí el actor de la escena la muestra (con su luz, su estilo y los objetos que lo tapan).
    if(m.type==='WORKSHOP_BEGIN'&&!student){
      drawnSeq=-Infinity; // cada sesión del Taller numera sus estados desde cero
      const actor=actors.get(m.actorId);
      if(!actor||suspended){send('WORKSHOP_ERROR',{requestId:m.requestId,message:'El personaje no está en la escena que se está dirigiendo.'});return;}
      const reuse=workshop?.held&&actor===workshop.actor&&(m.faceOnly||workshop.faceOnly||
        Array.isArray(m.bones)&&m.bones.length===workshop.names.length&&m.bones.every((name,i)=>name===workshop.names[i])&&!m.meshes);
      const previous=reuse?workshop:null;
      if(!reuse)endWorkshop();
      // (después de endWorkshop, que cierra el canal de la sesión anterior)
      const port=e.ports?.[0]||null;
      // Solo vista y pose entran por el canal directo; lo demás sigue pasando por el Estudio.
      if(port){workshopPort=port;port.onmessage=ev=>{const d=ev.data;if(port!==workshopPort||(d?.type!=='WORKSHOP_VIEW'&&d?.type!=='WORKSHOP_POSE'))return;void receive({origin,source:win.parent,data:{...d,channel:CHANNEL,version:1}});};port.start?.();}
      if(reuse&&!m.faceOnly&&!workshop.faceOnly){
        workshop.held=null;
        send('WORKSHOP_READY',{requestId:m.requestId,actorId:m.actorId,matrix:workshop.origin,
          matched:workshop.bones.filter(Boolean).length,pose:workshopPose(workshop.bones,m.modelSpace?actor.clone.root:null),head:headOf(actor),shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov}});
        return;
      }
      const names=Array.isArray(m.bones)&&m.bones.length<=1500&&m.bones.every(n=>typeof n==='string')?m.bones:[],byName=new Map();
      actor.clone.root.traverse(o=>{if(o.isBone)byName.set(o.name,o);});
      const bones=names.map(n=>byName.get(n)||null);
      // Taller facial: además de los huesos, los pesos de las shape keys. Cada malla se reconoce por su nombre (y su
      // orden entre las del mismo nombre) y cada morph por su nombre, no por su posición: el índice taller→motor
      // vale aunque los dos cargadores ordenen distinto. Las que no casan quedan en -1 y se ignoran.
      const morphs=[];let weights=0;
      if(Array.isArray(m.meshes)&&m.meshes.length<=64){
        const seen=new Map(),own=new Map();
        actor.clone.root.traverse(o=>{if(!o.isMesh||!o.morphTargetDictionary||!o.morphTargetInfluences)return;const k=seen.get(o.name)||0;seen.set(o.name,k+1);own.set(o.name+'#'+k,o);});
        const asked=new Map();
        for(const item of m.meshes){
          if(typeof item?.name!=='string'||!Array.isArray(item.morphs)||item.morphs.length>400||!item.morphs.every(n=>typeof n==='string'))return send('WORKSHOP_ERROR',{requestId:m.requestId,message:'Lista de shape keys del Taller no válida.'});
          const k=asked.get(item.name)||0;asked.set(item.name,k+1);
          const mesh=own.get(item.name+'#'+k)||null,index=Int16Array.from(item.morphs,n=>mesh?.morphTargetDictionary[n]??-1);
          if(mesh&&index.some(i=>i>=0))morphs.push({mesh,index,offset:weights,rest:Float32Array.from(mesh.morphTargetInfluences)});
          weights+=item.morphs.length;
        }
      }
      actor.external=true;
      if(!reuse)holdActorPose(actor);
      const savedBones=new Map(previous?.names.map((name,i)=>[name,previous.rest[i]])??[]);
      workshop={actorId:m.actorId,actor,bones,names,origin:previous?.origin??actor.clone.root.matrixWorld.toArray(),
        rest:bones.map(b=>b?savedBones.get(b.name)??{q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()}:null),
        morphs,weights,pair:previous?.pair,faceOnly:!!m.faceOnly};
      send('WORKSHOP_READY',{requestId:m.requestId,actorId:m.actorId,matrix:actor.clone.root.matrixWorld.toArray(),matched:bones.filter(Boolean).length,matchedMorphs:morphs.reduce((n,x)=>n+x.index.filter(i=>i>=0).length,0),pose:workshopPose(bones,m.modelSpace?actor.clone.root:null),head:headOf(actor),shot:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov}});return;
    }
    // El Taller cree seguir «En escena» pero aquí ya no hay sesión (el escenario se recargó o pasó por el Editor):
    // sin este aviso la cámara y la pose se ignoraban en silencio y el actor quedaba congelado bajo los controles.
    if((m.type==='WORKSHOP_VIEW'||m.type==='WORKSHOP_POSE')&&!workshop){const now=performance.now();if(now-workshopLostAt>1000){workshopLostAt=now;send('WORKSHOP_LOST',{});}return;}
    if(m.type==='WORKSHOP_VIEW'&&workshop){if(vector(m.position)&&vector(m.target)&&m.position.some((n,i)=>n!==m.target[i])){camera.position.fromArray(m.position);target.fromArray(m.target);if(Number.isFinite(m.fov)&&m.fov>=10&&m.fov<=100&&m.fov!==camera.fov){camera.fov=m.fov;camera.updateProjectionMatrix();}camera.lookAt(target);}
      // Confirma al Taller qué vista quedó pintada: dibuja sus controles con la misma cámara (van al mismo paso).
      if(Number.isFinite(m.seq))ackDrawn(m.seq);
      return;}
    if(m.type==='WORKSHOP_BIND_PAIR'&&workshop){
      const requested=m.actors;
      if(!Array.isArray(requested)||requested.length!==2||new Set(requested.map(item=>item?.id)).size!==2||
        !requested.some(item=>item?.id===workshop.actorId)||requested.some(item=>!actors.has(item?.id)||!Array.isArray(item.bones)||item.bones.length>1500||!item.bones.every(n=>typeof n==='string'))){
        send('WORKSHOP_PAIR_ERROR',{requestId:m.requestId,message:'Los dos actores deben estar cargados en esta escena.'});return;
      }
      if(workshop.pair&&requested.every(({id,bones})=>{
        const previous=workshop.pair.get(id);
        return previous&&bones.length===previous.names.length&&bones.every((name,i)=>name===previous.names[i]);
      })){
        send('WORKSHOP_PAIR_READY',{requestId:m.requestId,matrices:Object.fromEntries([...workshop.pair].map(([id,entry])=>[id,entry.origin]))});return;
      }
      restoreWorkshopPair();
      workshop.pair=new Map();
      const matrices={};
      for(const {id,bones} of requested){
        const actor=actors.get(id),root=actor.clone.root,indices=new Map(bones.map((name,i)=>[name,i])),nodes=[];
        actor.root.updateMatrixWorld(true);matrices[id]=root.matrixWorld.toArray();
        root.traverse(node=>{if(node.isBone&&indices.has(node.name))nodes.push({node,index:indices.get(node.name)});});
        const transforms=[root,...nodes.map(item=>item.node)].map(node=>({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}));
        actor.external=true;holdActorPose(actor);
        workshop.pair.set(id,{actor,actorId:id,nodes,transforms,count:bones.length,names:bones,origin:matrices[id]});
      }
      send('WORKSHOP_PAIR_READY',{requestId:m.requestId,matrices});return;
    }
    if(m.type==='WORKSHOP_UNBIND_PAIR'&&workshop){restoreWorkshopPair();return;}
    if(m.type==='WORKSHOP_POSE'&&workshop){
      const applyMorphs=w=>{
        if(w&&w.length===workshop.weights)for(const {mesh,index,offset} of workshop.morphs){
          const out=mesh.morphTargetInfluences;
          for(let j=0;j<index.length;j++){const i=index[j],v=w[offset+j];if(i>=0&&Number.isFinite(v))out[i]=Math.max(-1,Math.min(1.5,v));}
        }
      };
      if(workshop.faceOnly){applyMorphs(m.w);return;}
      if(workshop.pair){
        if(!Array.isArray(m.poses)||m.poses.length!==2||new Set(m.poses.map(p=>p?.id)).size!==2)return;
        if(m.poses.some(p=>!workshop.pair.has(p?.id)||p.matrix?.length!==16||p.bones?.length!==workshop.pair.get(p.id).count*16||!p.matrix.every(Number.isFinite)||!p.bones.every(Number.isFinite)))return;
        const local=new T.Matrix4(),world=new T.Matrix4(),matrix=new T.Matrix4();
        for(const p of m.poses){
          const {actor,nodes}=workshop.pair.get(p.id),root=actor.clone.root;
          root.parent.updateWorldMatrix(true,false);
          world.fromArray(p.matrix);
          local.copy(root.parent.matrixWorld).invert().multiply(world).decompose(root.position,root.quaternion,root.scale);
          root.updateMatrixWorld(true);
          for(const {node,index} of nodes){
            node.parent.updateWorldMatrix(true,false);
            local.copy(node.parent.matrixWorld).invert().multiply(world).multiply(matrix.fromArray(p.bones,index*16))
              .decompose(node.position,node.quaternion,node.scale);
            node.updateWorldMatrix(false,false);
          }
        }
        if(Number.isFinite(m.seq))ackDrawn(m.seq);
        return;
      }
      const {bones}=workshop,q=m.q,p=m.p;
      if(m.matrices){
        if(m.matrices.length!==bones.length*16||!m.matrices.every(Number.isFinite))return;
        applyModelBoneMatrices(workshop.actor.clone.root,bones,m.matrices);
        if(Number.isFinite(m.seq))ackDrawn(m.seq);
        applyMorphs(m.w);return;
      }
      if(!q||!p||q.length!==bones.length*4||p.length!==bones.length*3)return;
      // La pose lleva el mismo nº que la vista: el Taller dibuja sus controles con la pose que se acaba de pintar aquí.
      if(Number.isFinite(m.seq))ackDrawn(m.seq);
      for(let i=0;i<bones.length;i++){const b=bones[i];if(!b)continue;const a=i*4,c=i*3;if(Number.isFinite(q[a]+q[a+1]+q[a+2]+q[a+3]+p[c]+p[c+1]+p[c+2])){b.quaternion.set(q[a],q[a+1],q[a+2],q[a+3]);b.position.set(p[c],p[c+1],p[c+2]);}}
      // Pesos de las shape keys (solo el Taller facial los manda), en el orden de las mallas anunciadas en BEGIN.
      applyMorphs(m.w);
      return;
    }
    if(m.type==='WORKSHOP_RAY'&&workshop){
      if(m.actorPick===true){
        let actorId=null;
        if(vector(m.origin)&&vector(m.direction)){
          scene.updateMatrixWorld(true);
          const ray=new T.Raycaster(new T.Vector3().fromArray(m.origin),new T.Vector3().fromArray(m.direction).normalize());
          actorId=workshopActorHit(ray.intersectObjects(scene.children,true),actors);
        }
        send('WORKSHOP_HIT',{requestId:m.requestId,actorId});return;
      }
      let position=null,point=null;
      if(vector(m.origin)&&vector(m.direction)){const ray=new T.Raycaster(new T.Vector3().fromArray(m.origin),new T.Vector3().fromArray(m.direction).normalize());const hit=ray.intersectObjects(scene.children,true).find(h=>!h.object.userData.ignorarSeleccion);if(hit){position=[hit.point.x,ground(hit.point.x,hit.point.z),hit.point.z];point=hit.point.toArray();}}
      // position: sobre el suelo (destinos y caminos); point: el punto exacto tocado (objetivos de mirada y de alcance)
      send('WORKSHOP_HIT',{requestId:m.requestId,position,point});return;
    }
    // Los demás personajes de la escena, para usarlos como objetivos (Look At, Reach Target, Ir a) desde el Taller.
    if(m.type==='WORKSHOP_ACTORS'&&workshop){
      const items=[];
      for(const [id,a] of actors){
        if(a===workshop.actor||!a.root.parent||!a.root.visible)continue;
        a.root.updateMatrixWorld(true);
        items.push({id,name:catalog.find(c=>c.id===a.characterId)?.name||a.characterId||id,position:a.root.getWorldPosition(new T.Vector3()).toArray(),head:headOf(a)});
      }
      send('WORKSHOP_ACTORS_LIST',{requestId:m.requestId,items});return;
    }
    // Ruta que rodea obstáculos (la misma cuadrícula A* de la vida ambiental) para los destinos del Taller.
    if(m.type==='WORKSHOP_ROUTE'&&workshop){
      let route=null;
      if(colliders&&vector(m.from)&&vector(m.to)){
        const d=Math.hypot(m.to[0]-m.from[0],m.to[2]-m.from[2]);
        if(d>.05&&d<200){
          try{
            const radio=Math.min(120,d/2+6),centro=[(m.from[0]+m.to[0])/2,0,(m.from[2]+m.to[2])/2];centro[1]=ground(centro[0],centro[2]);
            const nav=crearNavegacionCuadricula({centro,radio,celda:radio>40?.75:.5,ground,colliders,radioAgente:.3,limites:manifest.bounds||null});
            route=nav.buscarRuta(m.from,m.to);
          }catch(error){console.warn('Ruta del Taller',error);}
        }
      }
      send('WORKSHOP_ROUTE_RESULT',{requestId:m.requestId,route});return;
    }
    // Puntos con nombre del escenario (asientos…) cerca del personaje, para «ir a la silla» desde el Taller.
    if(m.type==='WORKSHOP_POINTS'&&workshop){
      const items=[],here=workshop.actor.root.getWorldPosition(new T.Vector3()),p=new T.Vector3(),q=new T.Quaternion(),f=new T.Vector3();
      scene.updateMatrixWorld();
      scene.traverse(o=>{
        if(!o.userData?.ssPoint)return;
        o.getWorldPosition(p);const dist=Math.hypot(p.x-here.x,p.z-here.z);if(dist>80)return;
        const fa=o.userData.ssFacing||[0,1];o.getWorldQuaternion(q);f.set(fa[0],0,fa[1]).applyQuaternion(q).setY(0).normalize();
        items.push({kind:o.userData.ssPoint,name:o.name||'Punto',position:[p.x,ground(p.x,p.z),p.z],facing:[f.x,f.z],seat:Number.isFinite(o.userData.ssSeat)?o.userData.ssSeat:null,dist});
      });
      items.sort((a,b)=>a.dist-b.dist);
      send('WORKSHOP_POINTS_LIST',{requestId:m.requestId,items:items.slice(0,40)});return;
    }
    if(m.type==='WORKSHOP_END'){
      if(m.keepPose&&workshop&&lastStage){
        closeWorkshopPort();
        workshop.held={sceneId:lastStage.sceneId,sequenceId:lastStage.sequenceId,time:lastStage.time,actors:JSON.stringify(lastStage.actors)};
      }else endWorkshop();
      return;
    }
    if(m.type==='PICK_CANCEL'){if(picking)send('PICKED',{requestId:picking.requestId,cancelled:true});picking=null;placement=null;return;}
    if(m.type==='LIFE'){
      if(typeof m.sceneId!=='string')return;
      if(m.life===null)vidas.delete(m.sceneId);
      else if(validarAmbienteReproducible(m.life,zone.id))vidas.set(m.sceneId,{cast:m.life.cast,recording:m.life.recording});
      else{send('ERROR',{message:'La vida ambiental recibida no es válida para este escenario.'});return;}
      if(m.sceneId===vidaEscena)void montarVida(m.sceneId);
      return;
    }
    if(m.type==='LIFE_RECORD'&&!student){
      const fail=message=>send('LIFE_ERROR',{requestId:m.requestId,message});
      if(!validarConfiguracion(m.life)||!Array.isArray(m.center)||m.center.length!==3||!m.center.every(Number.isFinite))return fail('Configuración de la vida ambiental inválida.');
      if(!colliders)return fail('Este escenario no ofrece colisiones para calcular rutas.');
      try{
        const clipsPorPersonaje={};
        for(const id of new Set(m.life.cast.map(c=>c.characterId)))clipsPorPersonaje[id]=(await template(id)).animations.map(c=>c.name);
        const centro=[m.center[0],ground(m.center[0],m.center[2]),m.center[2]];
        const navegacionVida=crearNavegacionCuadricula({centro,radio:m.life.radius,celda:m.life.radius>40?.75:.5,ground,colliders,limites:manifest.bounds||null});
        const recording=grabarAmbiente({ambiente:m.life,zoneId:zone.id,centro,navegacion:navegacionVida,clipsPorPersonaje});
        send('LIFE_RECORDED',{requestId:m.requestId,sceneId:m.sceneId,recording});
      }catch(error){fail(error.message);}
      return;
    }
    if(m.type==='VIEW'&&!student&&!workshop&&vector(m.position)&&vector(m.target)&&m.position.some((n,i)=>n!==m.target[i])){camera.position.fromArray(m.position);target.fromArray(m.target);if(Number.isFinite(m.fov)&&m.fov>=10&&m.fov<=100){camera.fov=m.fov;camera.updateProjectionMatrix();}camera.lookAt(target);return;}
    if(m.type==='PILOT'&&!student){pilot=typeof m.cameraId==='string'?m.cameraId:null;send('PILOTING',{cameraId:pilot});return;}
    if(m.type==='CAMERA_PATHS'&&!student){
      const ok=Array.isArray(m.items)&&m.items.length<=64&&m.items.every(i=>Array.isArray(i.samples)&&i.samples.length<=600&&i.samples.every(vector)&&Array.isArray(i.points)&&i.points.length<=64&&i.points.every(vector));
      if(!ok)return;try{drawCameraPaths(m.items);}catch(error){send('PATHS_ERROR',{message:error.message});}return;
    }
    if(m.type==='CAMERA_AUDIT'&&!student&&typeof m.requestId==='string'){
      const ok=Array.isArray(m.checks)&&m.checks.length<=400&&m.checks.every(c=>c&&typeof c.id==='string'&&(c.kind==='segment'&&Array.isArray(c.points)&&c.points.length>=1&&c.points.length<=200&&c.points.every(vector)||c.kind==='view'&&vector(c.shot?.position)&&vector(c.shot?.target)&&Number.isFinite(c.shot.fov)&&Array.isArray(c.subjects)&&c.subjects.length<=40&&c.subjects.every(vector)));
      if(!ok){send('CAMERA_AUDITED',{requestId:m.requestId,error:'Consulta de cámaras inválida.'});return;}
      try{send('CAMERA_AUDITED',{requestId:m.requestId,results:auditCameras(m.checks),colliders:!!colliders});}catch(error){send('CAMERA_AUDITED',{requestId:m.requestId,error:error.message});}return;
    }
    if(suspended||m.type!=='STAGE'||!validStudioStage(m.stage,zone.id))return;
    const current=++revision,s=m.stage;
    win.clearInterval(readyTimer);
    student=m.student===true;playing=m.playing===true;waiting=m.waiting===true;allowLook=m.allowLook!==false;
    const held=workshop?.held;
    if(held&&(student||playing||held.sceneId!==s.sceneId||held.sequenceId!==s.sequenceId||
      Math.abs(held.time-s.time)>1e-6||held.actors!==JSON.stringify(s.actors)))endWorkshop();
    navigation?.setEditorEnabled(!student);
    pathLayer.visible=!student;
    const newSequence=lastStage?.sequenceId!==s.sequenceId,shotKey=JSON.stringify(s.shot);
    // Un corte del Switcher reinicia la mirada del estudiante (decisión 8.2); en las mezclas se conserva.
    const switchId=s.camera&&typeof s.camera.switchId==='string'?s.camera.switchId:null,cutNow=!!s.camera&&s.camera.cut===true&&switchId!==lastSwitchId;lastSwitchId=switchId;
    if(cutNow&&!newSequence){lookYaw=0;lookPitch=0;}
    if(newSequence){lookYaw=0;lookPitch=0;lexico?.interaccion.cerrar('momento');}
    const backToCamera=viewMode==='free'&&m.view!=='free';
    viewMode=m.view==='free'?'free':'camera';
    lastStage=s;
    // Dónde está cada personaje ahora: el disco se mueve con cada puesta en escena (al reproducir o buscar).
    if(!student)try{drawActorMarks(s.actors);}catch(error){send('PATHS_ERROR',{message:error.message});}
    estilos?.ambienteEscena?.(s.ambient||null);
    // Variante del escenario (editor): objetos que la escena oculta o muestra; la luz de la escena sigue mandando en el Estudio.
    if((s.variantId||null)!==lastVariant){lastVariant=s.variantId||null;try{aplicarVariante?.(lastVariant);}catch(error){send('PATHS_ERROR',{message:'Variante: '+error.message});}}
    // Luz dirigida (pista «Luz» del Estudio): solo la aplican los escenarios que la entienden (colina de Don Quijote).
    const luz=s.light&&Number.isFinite(s.light.sol)&&Number.isFinite(s.light.luna)?{sol:Math.min(1.5,Math.max(0,s.light.sol)),luna:Math.min(1.5,Math.max(0,s.light.luna))}:null;
    assets.setLight?.(luz);
    // Dirigiendo, la cámara solo se recoloca si cambia el plano (otro momento u otra cámara) o al reproducir:
    // así se puede mover la vista a una zona y colocar allí un personaje sin que la cámara salte.
    // Entrando desde el Editor, la primera puesta en escena adopta la vista que ya había: Editor y Estudio ven lo mismo.
    const adopt=keepCamera&&!student&&!playing;keepCamera=false;
    // El Taller manda sobre la cámara mientras está abierto; en «Vista libre» el autor conserva su vista al dirigir.
    // También al reproducir: así se puede revisar de cerca una animación mientras el estudiante sigue viendo su plano.
    inset=m.inset!==false;
    const holdView=holdingView();
    placeStudent(s.shot.position,s.shot.target,s.shot.fov);studentGizmo.visible=holdView&&!workshop;
    stageTrack=playing&&!workshop&&validTrack(m.track,s)?{...m.track,arrived:performance.now()}:null;
    if(!adopt&&!holdView&&!workshop?.held&&(student||playing||newSequence||backToCamera||shotKey!==lastShotKey)){camera.position.fromArray(s.shot.position);target.fromArray(s.shot.target);camera.fov=s.shot.fov;camera.updateProjectionMatrix();camera.lookAt(target);if(student)applyLook();}
    lastShotKey=shotKey;
    lexico?.interaccion.habilitar(student?s.entryIds:[]);
    try{
      await Promise.all(s.actors.map(ensureActor));
      if(disposed||current!==revision)return;
      await Promise.all(s.performances.filter(p=>p.behavior).map(async p=>{const actor=actors.get(p.actorId);const clip=await behaviorLibrary.load(p.behavior,actor.characterId);actor.behaviors??=new Map();actor.behaviors.set(p.behavior.url,clip);}));
      if(disposed||current!==revision)return;
      const activeIds=new Set(s.actors.map(a=>a.id));for(const [id,actor]of actors)if(!activeIds.has(id)){soltarVida(actor);actor.root.removeFromParent();actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.clone.root);actor.clone.dispose();actors.delete(id);}
      const sceneTime=s.sceneTime??s.time;
      if(vidaEscena!==s.sceneId){vidaReloj=sceneTime;await montarVida(s.sceneId);}
      else if((!playing&&!waiting)||sceneTime<vidaUltimo-.01)vidaReloj=sceneTime;
      vidaUltimo=sceneTime;
      if(disposed||current!==revision)return;
      for(const data of s.actors){const actor=actors.get(data.id);actor.root.position.fromArray(data.position);actor.root.rotation.y=data.rotation;const scale=data.height/actor.height;actor.carrier.scale.multiplyScalar(scale);actor.carrier.position.multiplyScalar(scale);actor.height=data.height;performanceActor(actor,s.performances.find(p=>p.actorId===data.id),s.time);}
      void syncVidas(s);
      // Pin authored actor and target sectors while the scene is active.
      pinned.clear();const points=[s.shot.target,...s.actors.map(a=>a.position)];
      const required=manifest.sectors.filter(sector=>points.some(p=>p[0]>=sector.bounds.min[0]&&p[0]<=sector.bounds.max[0]&&p[2]>=sector.bounds.min[2]&&p[2]<=sector.bounds.max[2]));
      for(const sector of required)pinned.add(sector.id);
      await Promise.all(required.map(sector=>assets.load(sector,zone.manifestUrl)));
      void loadNearby();
      if(!disposed&&current===revision)send('STAGE_READY',{requestId:m.requestId,sequenceId:s.sequenceId});
    }catch(error){if(!disposed&&current===revision)send('ERROR',{message:error.message});}
  }
  const groundHit=e=>rayAt(e).intersectObjects(scene.children,true).find(h=>!h.object.userData.ignorarSeleccion);
  function down(e){press={x:e.clientX,y:e.clientY};
    // Un punto de camino bajo el cursor: se arrastra sobre el suelo (o se elige, si no se mueve).
    if(!student&&!suspended&&!placement&&!picking&&(e.button??0)===0&&pathLayer.visible&&pathHandles.length){const ray=rayAt(e);ray.layers.enableAll();const hit=ray.intersectObjects(pathHandles,false)[0];if(hit){pathDrag={...hit.object.userData.studioPath,moved:false};canvas.setPointerCapture?.(e.pointerId);return;}}
    if(!student)return;gesture={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,id:e.pointerId};canvas.setPointerCapture?.(e.pointerId);}
  function move(e){
    if(pathDrag){
      if(!pathDrag.moved&&press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)<5)return;
      const hit=groundHit(e),item=pathItems.find(p=>p.cueId===pathDrag.cueId);
      if(hit&&item){pathDrag.moved=true;item.points[pathDrag.index]=[hit.point.x,ground(hit.point.x,hit.point.z),hit.point.z];drawPaths();}
      return;
    }
    if(!gesture||!student||!allowLook)return;lookYaw-=(e.clientX-gesture.lastX)*.003;lookPitch-=(e.clientY-gesture.lastY)*.003;gesture.lastX=e.clientX;gesture.lastY=e.clientY;applyLook();}
  const rayAt=e=>{const rect=canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);return ray;};
  function up(e){
    if(pilot&&!pathDrag&&!placement&&!picking)sendPilotView();
    // Orbit drags in direction mode must not be mistaken for a pick.
    const tap=!press||Math.hypot(e.clientX-press.x,e.clientY-press.y)<6;press=null;
    if(pathDrag){
      const drag=pathDrag,item=pathItems.find(p=>p.cueId===drag.cueId);pathDrag=null;canvas.releasePointerCapture?.(e.pointerId);
      if(drag.moved&&item)send('PATH_POINT',{cueId:drag.cueId,index:drag.index,position:item.points[drag.index]});
      else send('PATH_POINT_SELECTED',{cueId:drag.cueId,index:drag.index});
      gesture=null;return;
    }
    if(placement&&!student&&tap&&(e.button??0)===0){const hits=rayAt(e).intersectObjects(scene.children,true);const hit=hits.find(h=>!h.object.userData.ignorarSeleccion);if(hit){const point=hit.point;send('PLACED',{actorId:placement,position:[point.x,ground(point.x,point.z),point.z]});placement=null;}}
    else if(picking&&!student&&tap){
      const request=picking;
      if(request.mode==='point'){const hit=rayAt(e).intersectObjects(scene.children,true).find(h=>!h.object.userData.ignorarSeleccion);if(hit){picking=null;send('PICKED',{requestId:request.requestId,position:[hit.point.x,ground(hit.point.x,hit.point.z),hit.point.z]});}}
      else{const entrada=lexico?.interaccion.identificar?.(e.clientX,e.clientY),hit=entrada?rayAt(e).intersectObjects(scene.children,true).find(h=>!h.object.userData.ignorarSeleccion):null;picking=null;send('PICKED',{requestId:request.requestId,entryId:entrada?.id??null,label:entrada?.speech?.text??null,...(hit?{position:hit.point.toArray()}:{})});}
    }
    else if(!student&&!suspended&&!playing&&!pilot&&!workshop&&!pathDrag&&tap&&(e.button??0)===0){const id=actorAt(e);if(id){selectedActor=id;send('ACTOR_SELECTED',{actorId:id});}}
    gesture=null;
  }
  navigation?.setPivot?.('estudio',out=>{
    if(disposed||suspended||student||playing||pilot||workshop||!selectedActor)return null;
    const actor=actors.get(selectedActor);if(!actor||!actor.root.visible)return null;
    actor.root.updateMatrixWorld(true);const bone=hipsBone(actor);if(bone)return bone.getWorldPosition(out);
    return actor.root.getWorldPosition(out).add(new T.Vector3(0,(actor.height||1.6)*.55,0));
  },()=>!!pathDrag);
  // Disabling navigation removes WASD and orbit in student mode; only the look gesture above remains.
  navigation?.setEditorEnabled(false);
  // Con el foco en el escenario, el Estudio no recibe el teclado: Esc cancela aquí la colocación/selección pendiente
  // y, junto con Ctrl+S/O/Z/Y, se reenvía al Estudio para que sus atajos funcionen igual.
  const keydown=e=>{
    if(disposed||suspended||student)return;
    const mod=e.ctrlKey||e.metaKey,key=(e.key||'').toLowerCase();
    if(e.key==='Escape'){if(placement){placement=null;send('PLACING',{actorId:null});}if(picking){send('PICKED',{requestId:picking.requestId,cancelled:true});picking=null;}}
    else if(!(mod&&['s','o','z','y'].includes(key)))return;
    if(mod)e.preventDefault();
    send('KEY',{key:e.key,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,altKey:e.altKey});
  };
  win.addEventListener('keydown',keydown);
  win.addEventListener('message',receive);canvas.addEventListener('wheel',sendPilotView,{passive:true});canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);
  // `repeat`: reintento periódico mientras el Estudio no envía una puesta en escena válida (no hace falta reenviar todo).
  const ready=(repeat=false)=>send('READY',{repeat,zoneId:zone.id,ambients:STUDIO_AMBIENTS,zones:(world.zones||[zone]).map(z=>({id:z.id,label:[z.countryLabel,z.cityLabel,z.label||z.id].filter(Boolean).join(' / ')})),characters:catalog.map(c=>({id:c.id,label:c.label,modelUrl:new URL(c.url,response.url).href})),entries:lexico?.mapa.entries.map(e=>({id:e.id,label:e.speech.text}))||[]});
  let readyTimer=win.setInterval(()=>ready(true),1500);ready();
  return {
    reportDropError(message){send('ERROR',{message});},
    dropFiles(files,event){
      if(suspended||student||disposed)throw Error('Activa la edición del Estudio para añadir personajes.');
      send('CHARACTER_FILES_DROPPED',{files,position:puntoDeSuelta({scene,camera,canvas,ground,target},event),zoneId:zone.id,sceneId:lastStage?.sceneId});
    },
    /** El Editor pasa delante: nada de lo puesto en escena se retira; solo se detiene la dirección. */
    suspend(){if(disposed)return;endWorkshop();lexico?.interaccion.habilitar([]);pathLayer.visible=false;pathDrag=null;suspended=true;playing=false;waiting=false;student=false;placement=null;picking=null;gesture=null;press=null;revision++;win.clearInterval(readyTimer);},
    /** El Estudio vuelve: la vista actual se conserva y se le anuncia el puente para que se reconecte. */
    resume(){if(disposed||!suspended)return;pathLayer.visible=true;suspended=false;keepCamera=true;navigation?.setEditorEnabled(true);win.clearInterval(readyTimer);readyTimer=win.setInterval(()=>ready(true),1500);ready();},
    /**
     * Recuadro «Cámara del estudiante» abajo a la izquierda, solo en «Vista libre»: lo que verá el estudiante en
     * este instante, sin las marcas de dirección. Se dibuja después del fotograma del autor, con tijera.
     */
    renderInset(r=renderer){
      if(suspended||student||disposed||!inset||!studentGizmo.visible||workshop)return;
      const size=r.getSize(new T.Vector2()),w=Math.round(Math.min(360,Math.max(160,size.x*.26))),h=Math.round(w*9/16),x=12,y=12;
      if(Math.abs(studentCam.aspect-16/9)>1e-3){studentCam.aspect=16/9;studentCam.updateProjectionMatrix();}
      const auto=r.autoClear,wasVisible=pathLayer.visible,clear=r.getClearColor(new T.Color()),alpha=r.getClearAlpha();pathLayer.visible=false;
      r.setScissorTest(true);r.setScissor(x-2,y-2,w+4,h+4);r.setViewport(x-2,y-2,w+4,h+4);r.setClearColor(0xffb347,1);r.clear(true,true,false);
      r.setScissor(x,y,w,h);r.setViewport(x,y,w,h);r.clear(false,true,false);r.autoClear=false;r.render(scene,studentCam);
      r.autoClear=auto;r.setClearColor(clear,alpha);r.setScissorTest(false);r.setViewport(0,0,size.x,size.y);pathLayer.visible=wasVisible;
    },
    update(dt){if(suspended)return;
      if(stageTrack&&playing&&!workshop)applyTrack();
      // Los puntos de los caminos no encogen al alejar la cámara: se pueden seguir cogiendo.
      if(pathLayer.visible)for(const dot of pathHandles)dot.scale.setScalar(Math.max(1,camera.position.distanceTo(dot.position)*STORY_STUDIO.pathScreen/(dot.userData.radius||STORY_STUDIO.pathHandle)));vidaAntes();if(playing||waiting){for(const actor of actors.values())if(actor.root.visible&&!actor.external&&(!actor.behaviorControlled||playing))actor.mixer.update(dt*(actor.behaviorControlled?actor.behaviorSpeed:1));vidaReloj+=dt;}vidaDespues(dt);vida.actualizar(vidaReloj);},retainedRoots(){return [pathLayer,...templateRoots,...[...actors.values()].map(a=>a.root),...vida.raices()];},destroy(){disposed=true;navigation?.setPivot?.('estudio',null);endWorkshop();clearCameraPaths();win.clearTimeout(pilotTimer);canvas.removeEventListener('wheel',sendPilotView);disposeMarks(routeMarks);disposeMarks(actorMarks);pathLayer.removeFromParent();vida.desmontar();revision++;estilos?.ambienteEscena?.(null);win.clearInterval(readyTimer);win.removeEventListener('message',receive);win.removeEventListener('keydown',keydown);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);for(const actor of actors.values()){soltarVida(actor);actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.clone.root);actor.root.removeFromParent();actor.clone.dispose();}actors.clear();pinned.clear();
    // Al volver al Editor de escenarios la escena queda como estaba: sin luces de retrato ni el campo de visión de un plano.
    portraitLights?.removeFromParent();portraitLights=null;camera.fov=initialFov;camera.updateProjectionMatrix();},setLexicalEvent(event){if(event.tipo==='abierta')send('OBJECT_TOUCHED',{entryId:event.entryId});if(event.tipo==='cerrada')send('OBJECT_CLOSED',{entryId:event.entryId});}};
}
