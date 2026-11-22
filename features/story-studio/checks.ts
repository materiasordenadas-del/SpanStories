import {sequenceDuration,sequenceList,type StudioProject,type StudioSource} from './model.ts';
import {localAudioId} from './browser-media.ts';
import {cameraAuditKey} from './camera-model.ts';
export type StudioCheck={kind:'warning'|'dependency';message:string;sequenceId?:string};
/** Editorial diagnostics only: never mutate a route, performance, or review status. */
export function checkDirection(project:StudioProject,source:StudioSource,available:{characters:readonly string[];scenarios:readonly string[];audio:readonly string[]}):StudioCheck[]{
  const result:StudioCheck[]=[],list=sequenceList(project),reachable=new Set<string>(),pending=[list[0].sequence.id],byId=new Map(list.map((item,i)=>[item.sequence.id,{...item,index:i}]));
  while(pending.length){const id=pending.pop()!;if(reachable.has(id))continue;reachable.add(id);const item=byId.get(id);if(!item)continue;const gate=item.sequence.gate,next=gate.nextSequenceId??list[item.index+1]?.sequence.id;const targets=gate.kind==='choice'?gate.options.map(o=>o.nextSequenceId??next):[next];for(const target of targets)if(target&&!reachable.has(target))pending.push(target);}
  for(const scene of project.scenes){
    if(!scene.zoneId)result.push({kind:'dependency',message:`${scene.name}: todavía no tiene escenario.`});
    else if(!available.scenarios.includes(scene.zoneId))result.push({kind:'dependency',message:`${scene.name}: el escenario no está disponible en esta biblioteca.`});
    for(const actor of scene.actors)if(!available.characters.includes(actor.characterId))result.push({kind:'dependency',message:`${scene.name}: falta el modelo de ${actor.name}.`});
    // Cámaras con nombre: problemas que se ven sin el motor.
    const cameras=new Map((scene.cameras??[]).map(c=>[c.id,c]));
    for(const camera of cameras.values()){
      if(camera.aim.kind==='point'&&camera.aim.entryId&&!scene.entryIds.includes(camera.aim.entryId))result.push({kind:'warning',message:`${scene.name}: la cámara «${camera.name}» apunta a un objeto que ya no está entre los elementos de la escena.`});
      if(camera.body.kind==='static')for(const actor of scene.actors){const head=[actor.position[0],actor.position[1]+actor.height*.92,actor.position[2]];if(Math.hypot(...camera.base.position.map((v,i)=>v-head[i]))<.35)result.push({kind:'warning',message:`${scene.name}: la cámara «${camera.name}» está a menos de 35 cm de la cabeza de ${actor.name}; el plano de recorte puede cortarle la cara.`});}
    }
    // Revisión del motor (paredes, oclusión, encuadre): solo vale si nada cambió desde que se calculó.
    if(scene.cameraAudit){
      if(scene.cameraAudit.key!==cameraAuditKey(scene))result.push({kind:'dependency',message:`${scene.name}: la revisión de cámaras está desactualizada; vuelve a revisarla.`});
      else for(const w of scene.cameraAudit.warnings)result.push({kind:'warning',message:`${scene.name}: ${w.message}`,...(w.sequenceId?{sequenceId:w.sequenceId}:{})});
    }
    for(const sequence of scene.sequences){
      const add=(message:string,kind:StudioCheck['kind']='warning')=>result.push({kind,message:`${scene.name} / ${sequence.name}: ${message}`,sequenceId:sequence.id});
      if(!reachable.has(sequence.id))add('ninguna ruta desde el inicio llega a este momento.');
      if(sequence.gate.kind==='auto'&&sequenceDuration(sequence)===0)add('el momento automático no tiene duración.');
      const actorCues=sequence.cues.filter(c=>c.kind==='actor');
      for(let i=0;i<actorCues.length;i++)for(let j=i+1;j<actorCues.length;j++){
        const a=actorCues[i],b=actorCues[j];if(a.actorId===b.actorId&&(a.behavior||b.behavior)&&a.at<b.at+b.duration&&b.at<a.at+a.duration)add('hay acciones simultáneas sobre el mismo personaje; revisa qué actuación debe controlar su cuerpo.');
      }
      // Dos planos a la vez: gana el que va después en la lista (director.ts, byStart), algo que no se ve en la línea de tiempo.
      const cameraStarts=sequence.cues.filter(c=>c.kind==='camera'||c.kind==='cameraSwitch').map(c=>c.at);
      if(new Set(cameraStarts).size<cameraStarts.length)add('hay dos cambios de cámara en el mismo instante; solo se verá el último de la lista. Separa sus tiempos.');
      for(const cue of sequence.cues){
        // Jinete: su caminata (destino en el mundo) se suma a la de su montura si coinciden en el tiempo y el resultado depende del orden de los cues.
        if(cue.kind==='actor'&&(cue.destination||cue.path?.length)){const rider=scene.actors.find(a=>a.id===cue.actorId);const horse=rider?.montura&&scene.actors.find(a=>a.id===rider.montura!.caballoId);if(rider&&horse&&sequence.cues.some(o=>o.kind==='actor'&&o.actorId===horse.id&&(o.destination||o.path?.length)&&o.at<cue.at+cue.duration&&cue.at<o.at+o.duration))add(`${rider.name} camina mientras ${horse.name} también anda: los dos movimientos se suman y el jinete no llegará a su destino. Para que vaya en la silla, mueve solo a ${horse.name}.`);}
        if(cue.kind==='cameraMove'){const body=cameras.get(cue.cameraId)?.body.kind;if(body!=='path'&&body!=='orbit')add(`el movimiento de «${cameras.get(cue.cameraId)?.name}» no tiene efecto: esa cámara no tiene camino ni órbita.`);}
        if(cue.kind==='cameraSwitch'&&cue.transition.kind==='blend'&&cameras.get(cue.cameraId)?.cutOnly)add(`«${cue.label}» solo entra con corte: la mezcla se reproducirá como corte.`);
        if(cue.kind==='dialogue'&&!source.sentences.find(s=>s.id===cue.sentenceId)?.text.trim())add('hay una intervención sin texto.');
        if(cue.kind==='sound'||cue.kind==='dialogue'&&cue.audioUrl){const url=cue.audioUrl!,id=localAudioId(url);if(id&&!available.audio.includes(id))add('falta una grabación local.','dependency');else if(!id)add('el audio depende de un enlace externo al paquete.','dependency');}
      }
    }
  }
  return result;
}
