"use client";
import {useRef} from 'react';
import {sceneDuration,sequenceDuration,type StudioProject} from '@/features/story-studio/model';
import {duplicateScene,reorderScene,duplicateMoment,reorderMoment} from '@/features/story-studio/editing';
import styles from './studio-storyboard.module.css';

export function StudioStoryboard({project,sceneId,sequenceId,view,scenarios,onScene,onMoment,onEdit,onAdd}:{project:StudioProject;sceneId:string;sequenceId:string;view:'scenes'|'moments';scenarios:{id:string;label:string}[];onScene:(id:string)=>void;onMoment:(id:string)=>void;onEdit:(project:StudioProject)=>void;onAdd:()=>void}){
  const dragging=useRef<string|null>(null),scene=project.scenes.find(s=>s.id===sceneId)!;
  const total=project.scenes.reduce((sum,s)=>sum+sceneDuration(s),0),waits=project.scenes.flatMap(s=>s.sequences).filter(s=>s.gate.kind!=='auto').length;
  return <div className={styles.board}>
    <div className={styles.summary}><span>{project.scenes.length} escenas <b>·</b> {total.toFixed(1)} s de animación <b>·</b> {waits} pausas interactivas</span><small>{view==='scenes'?'Arrastra las tarjetas para cambiar el orden de las escenas.':'Cada momento conserva sus acciones, diálogo y condición de avance.'}</small></div>
    <div className={styles.cards} aria-label={view==='scenes'?'Organizador de escenas':'Momentos de la escena'}>
      {view==='scenes'?project.scenes.map((item,index)=><article key={item.id} className={styles.card} data-active={item.id===sceneId} draggable onDragStart={event=>{dragging.current=item.id;event.dataTransfer.effectAllowed='move';}} onDragEnd={()=>dragging.current=null} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(dragging.current&&dragging.current!==item.id)onEdit(reorderScene(project,dragging.current,index));dragging.current=null;}}>
        <button className={styles.selectCard} aria-pressed={item.id===sceneId} aria-label={`Seleccionar escena ${index+1}: ${item.name}`} onClick={()=>onScene(item.id)}>
          <div className={styles.poster}><span className={styles.number}>{String(index+1).padStart(2,'0')}</span><span className={styles.sceneSymbol}>▱</span><span className={styles.time}>{sceneDuration(item).toFixed(1)} s</span></div>
          <strong>{item.name}</strong><small>{scenarios.find(s=>s.id===item.zoneId)?.label.split(' / ').at(-1)??item.zoneId}</small>
          <span className={styles.meta}>{item.sequences.length} momentos · {item.actors.length} personajes</span>
          <span className={styles.transition}>{item.transition?(item.transition.kind==='fade'?'Fundido':'Barrido')+` · ${item.transition.duration.toFixed(1)} s`:'Corte directo'}</span>
        </button>
        <div className={styles.cardTools}><button aria-label={`Mover escena ${index+1} antes`} disabled={index===0} onClick={()=>onEdit(reorderScene(project,item.id,index-1))}>←</button><button aria-label={`Mover escena ${index+1} después`} disabled={index===project.scenes.length-1} onClick={()=>onEdit(reorderScene(project,item.id,index+1))}>→</button><button aria-label={`Duplicar escena ${index+1}`} onClick={()=>{const next=duplicateScene(project,item.id);onEdit(next);}}>Duplicar</button><button onClick={()=>onScene(item.id)}>Propiedades</button></div>
      </article>):scene.sequences.map((moment,index)=><article key={moment.id} className={`${styles.card} ${styles.moment}`} data-active={moment.id===sequenceId} draggable onDragStart={event=>{dragging.current=moment.id;event.dataTransfer.effectAllowed='move';}} onDragEnd={()=>dragging.current=null} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(dragging.current&&dragging.current!==moment.id)onEdit(reorderMoment(project,scene.id,dragging.current,index));dragging.current=null;}}>
        <button className={styles.selectCard} aria-pressed={moment.id===sequenceId} onClick={()=>onMoment(moment.id)}><div className={styles.momentTop}><span className={styles.number}>{String(index+1).padStart(2,'0')}</span><span>{sequenceDuration(moment).toFixed(1)} s</span></div><strong>{moment.name}</strong><small>{moment.cues.length} acciones · {moment.cues.filter(c=>c.kind==='camera').length} planos</small><span className={styles.transition}>{({auto:'Avanza al terminar',continue:'Espera al estudiante',choice:'Decisión del estudiante',answer:'Respuesta escrita',object:'Tocar un objeto'})[moment.gate.kind]}</span></button>
        <div className={styles.cardTools}><button aria-label={`Mover momento ${index+1} antes`} disabled={index===0} onClick={()=>onEdit(reorderMoment(project,scene.id,moment.id,index-1))}>←</button><button aria-label={`Mover momento ${index+1} después`} disabled={index===scene.sequences.length-1} onClick={()=>onEdit(reorderMoment(project,scene.id,moment.id,index+1))}>→</button><button aria-label={`Duplicar momento ${index+1}`} onClick={()=>onEdit(duplicateMoment(project,scene.id,moment.id))}>Duplicar</button></div>
      </article>)}
      <button className={styles.addCard} onClick={onAdd}><span>＋</span>{view==='scenes'?'Añadir escena':'Añadir momento'}</button>
    </div>
  </div>;
}
