"use client";

import { useEffect, useRef } from 'react';
import { Timeline, type TimelineState } from '@xzdarcy/react-timeline-editor';
import type { TimelineRow } from '@xzdarcy/timeline-engine';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import type { Cue, Sequence, StudioScene } from '@/features/story-studio/model';
import { cueTrack, snapCue } from '@/features/story-studio/editing';
import styles from './story-studio.module.css';

const names = { camera: 'Cámara', actor: 'Actuación', dialogue: 'Diálogo', sound: 'Sonido' };
export function StudioTimeline({ scene, sequence, time, selectedId, snap = true, onSeek, onEdit, onSelect }: { scene: StudioScene; sequence: Sequence; time: number; selectedId?: string | null; snap?: boolean; onSeek: (time: number) => void; onEdit: (cues: Cue[]) => void; onSelect: (id: string) => void }) {
  const ref = useRef<TimelineState>(null);
  useEffect(() => { ref.current?.setTime(time); }, [time]);
  const keys = ['camera', ...scene.actors.map(a => `actor:${a.id}`), 'dialogue', 'sound'];
  const rows: TimelineRow[] = keys.map(id => ({ id, actions: sequence.cues.filter(c => cueTrack(c) === id).map(c => ({ id: c.id, start: c.at, end: c.at + c.duration, effectId: c.kind, selected: c.id === selectedId })) }));
  return <div className={styles.timelineBody}>
    <div className={styles.trackLabels}><span>Tiempo local</span>{keys.map(k => <span key={k}>{k.startsWith('actor:') ? scene.actors.find(a => a.id === k.slice(6))?.name : names[k as keyof typeof names]}</span>)}</div>
    <Timeline key={sequence.id} ref={ref} editorData={rows} effects={{ camera: { id: 'camera' }, actor: { id: 'actor' }, dialogue: { id: 'dialogue' }, sound: { id: 'sound' } }}
      scale={2} scaleWidth={100} rowHeight={30} minScaleCount={8} gridSnap={snap} dragLine
      style={{ flex: 1, width: '100%', height: '100%', minHeight: 156, background: '#101c27' }}
      getScaleRender={v => `${v}s`}
      getActionRender={action => { const cue = sequence.cues.find(c => c.id === action.id); if (!cue) return null; return <span className={styles.timelineClip} data-kind={cue.kind} data-selected={cue.id === selectedId} title={`${cue.at.toFixed(2)} s → ${(cue.at + cue.duration).toFixed(2)} s`}>{cue.kind === 'camera' ? cue.label : cue.kind === 'actor' ? cue.action : cue.kind === 'dialogue' ? 'Intervención' : cue.label}</span>; }}
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
          return { ...c, ...snapped };
        }));
      }} />
  </div>;
}
