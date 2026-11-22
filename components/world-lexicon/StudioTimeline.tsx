"use client";

import { useEffect, useRef,useState } from 'react';
import { Timeline, type TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { cueEnd, type Cue, type Sequence, type StudioScene } from '@/features/story-studio/model';
import { cueTrack, snapCue } from '@/features/story-studio/editing';
import styles from './story-studio.module.css';

const names = { camera: 'Cámara', actor: 'Actuación', dialogue: 'Diálogo', sound: 'Sonido', light: 'Luz' };
const actorNames={idle:'Esperar',walk:'Caminar',turn:'Girar',look:'Mirar',talk:'Hablar',listen:'Escuchar',wave:'Saludar',nod:'Asentir'};
export function StudioTimeline({ scene, sequence, time, selectedId, snap = true, onSeek, onEdit, onSelect }: { scene: StudioScene; sequence: Sequence; time: number; selectedId?: string | null; snap?: boolean; onSeek: (time: number) => void; onEdit: (cues: Cue[]) => void; onSelect: (id: string) => void }) {
  const ref = useRef<TimelineState>(null);
  const [scaleWidth,setScaleWidth]=useState(100);
  useEffect(() => { ref.current?.setTime(time); }, [time]);
  // «Cámara» es el Switcher (cues antiguos y cambios de cámara); cada cámara que se mueve tiene su pista de movimientos.
  const moving = (scene.cameras ?? []).filter(c => c.body.kind === 'path' || c.body.kind === 'orbit' || sequence.cues.some(q => q.kind === 'cameraMove' && q.cameraId === c.id));
  const keys = ['camera', ...moving.map(c => `camera:${c.id}`), ...scene.actors.map(a => `actor:${a.id}`), 'dialogue', 'sound', 'light'];
  const rows: TimelineRow[] = keys.map(id => ({ id, actions: sequence.cues.filter(c => cueTrack(c) === id).map(c => ({ id: c.id, start: c.at, end: cueEnd(c), effectId: c.kind, selected: c.id === selectedId })) }));
  const label = (k: string) => k.startsWith('actor:') ? scene.actors.find(a => a.id === k.slice(6))?.name : k.startsWith('camera:') ? `↳ ${scene.cameras?.find(c => c.id === k.slice(7))?.name ?? 'Cámara'}` : names[k as keyof typeof names];
  return <div className={styles.timelineBody}>
    <div className={styles.trackLabels}><span>Tiempo local <button aria-label="Alejar línea de tiempo" onClick={()=>setScaleWidth(value=>Math.max(25,value-25))}>−</button><button aria-label="Acercar línea de tiempo" onClick={()=>setScaleWidth(value=>Math.min(300,value+25))}>＋</button></span>{keys.map(k => <span key={k}>{label(k)}</span>)}</div>
    <Timeline key={sequence.id} ref={ref} editorData={rows} effects={{ camera: { id: 'camera' }, cameraSwitch: { id: 'cameraSwitch' }, cameraMove: { id: 'cameraMove' }, actor: { id: 'actor' }, dialogue: { id: 'dialogue' }, sound: { id: 'sound' }, light: { id: 'light' } }}
      scale={2} scaleWidth={scaleWidth} rowHeight={30} minScaleCount={8} gridSnap={snap} dragLine
      style={{ flex: 1, width: '100%', height: '100%', minHeight: 156, background: '#ffffff' }}
      getScaleRender={v => `${v}s`}
      getActionRender={action => { const cue = sequence.cues.find(c => c.id === action.id); if(!cue)return null; const label=cue.kind==='camera'?cue.label:cue.kind==='cameraSwitch'?`${cue.transition.kind==='cut'?'✂':'⤳'} ${scene.cameras?.find(c=>c.id===cue.cameraId)?.name??cue.label}`:cue.kind==='cameraMove'?`Movimiento ${Math.round(cue.from*100)}→${Math.round(cue.to*100)} %`:cue.kind==='actor'?cue.behavior?.name??actorNames[cue.action]:cue.kind==='dialogue'?'Intervención':cue.label;return <span title={`${label} · ${cue.at.toFixed(2)} s → ${(cue.at + cue.duration).toFixed(2)} s`} className={styles.timelineClip} data-kind={cue.kind==='cameraSwitch'||cue.kind==='cameraMove'?'camera':cue.kind} data-selected={cue.id === selectedId}>{label}</span>; }}
      onClickAction={(_, { action }) => onSelect(action.id)}
      onClickTimeArea={time => { onSeek(time); return true; }}
      onChange={next => {
        const positions = new Map(next.flatMap(r => r.actions.map(a => [a.id, a] as const)));
        onEdit(sequence.cues.map(c => {
          const action = positions.get(c.id);
          if (!action) return c;
          const at = Math.max(0, action.start), duration = Math.max(.05, action.end - action.start);
          if (Math.abs(at - c.at) < 1e-6 && Math.abs(duration - c.duration) < 1e-6) return c;
          // Magnetic edges: a moved or resized cue sticks to the start/end of the others.
          const snapped = snap ? snapCue(sequence, c.id, at, duration) : { at, duration };
          // La transición de una cámara nunca supera la duración de su toma.
          return { ...c, ...snapped, ...(c.kind==='camera'?{shot:{...c.shot,transition:Math.min(c.shot.transition,snapped.duration)}}:{}), ...(c.kind==='cameraSwitch'&&c.transition.kind==='blend'?{transition:{...c.transition,duration:Math.max(.05,Math.min(c.transition.duration,snapped.duration))}}:{}) } as Cue;
        }));
      }} />
  </div>;
}
