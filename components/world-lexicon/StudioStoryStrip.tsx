"use client";

import { useState } from 'react';
import type { StudioProject } from '@/features/story-studio/model';
import { momentDuration, type FlowIssue } from '@/features/story-studio/editing';
import styles from './story-studio.module.css';

/**
 * Story-wide overview: every scene and moment in order, sized by duration.
 * Moments can be dragged to a new position inside their scene.
 */
export function StudioStoryStrip({ project, selectedId, playingId, issues, onSelect, onMove }: {
  project: StudioProject; selectedId: string; playingId: string | null; issues: Map<string, FlowIssue[]>;
  onSelect: (sequenceId: string) => void; onMove: (sequenceId: string, toIndex: number) => void;
}) {
  const [dragging, setDragging] = useState<{ sceneId: string; sequenceId: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const total = project.scenes.reduce((sum, scene) => sum + scene.sequences.reduce((s, q) => s + momentDuration(q), 0), 0);
  return <div className={styles.storyStrip} role="group" aria-label="Cronología de la historia">
    {project.scenes.map((scene, si) => <div key={scene.id} className={styles.stripScene} role="group" aria-label={`Escena ${si + 1}: ${scene.name}`}>
      <span className={styles.stripSceneLabel}>{String(si + 1).padStart(2, '0')}</span>
      {scene.sequences.map((sequence, qi) => {
        const problems = issues.get(sequence.id) ?? [];
        const severe = problems.some(p => p.code === 'unreachable' || p.code === 'trapped' || p.code === 'auto-loop');
        return <button key={sequence.id} draggable
          className={styles.stripMoment}
          style={{ flexGrow: momentDuration(sequence) / Math.max(1, total) * 100 }}
          aria-pressed={sequence.id === selectedId}
          data-playing={sequence.id === playingId}
          data-over={over === sequence.id}
          data-issue={problems.length ? (severe ? 'error' : 'warning') : undefined}
          title={`${scene.name} · ${sequence.name} · ${momentDuration(sequence).toFixed(1)} s${problems.length ? '\n⚠ ' + problems.map(p => p.message).join('\n⚠ ') : ''}\nArrastra para reordenar dentro de la escena.`}
          onClick={() => onSelect(sequence.id)}
          onDragStart={e => { setDragging({ sceneId: scene.id, sequenceId: sequence.id }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sequence.id); }}
          onDragOver={e => { if (dragging?.sceneId === scene.id && dragging.sequenceId !== sequence.id) { e.preventDefault(); setOver(sequence.id); } }}
          onDragLeave={() => setOver(o => o === sequence.id ? null : o)}
          onDrop={e => { e.preventDefault(); if (dragging?.sceneId === scene.id && dragging.sequenceId !== sequence.id) onMove(dragging.sequenceId, qi); setDragging(null); setOver(null); }}
          onDragEnd={() => { setDragging(null); setOver(null); }}>
          <span>{qi + 1}</span><small>{sequence.name}</small>
        </button>;
      })}
    </div>)}
  </div>;
}
