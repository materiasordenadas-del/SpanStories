"use client";

import { useEffect, useMemo, useState } from 'react';
import type { StudioProject, StudioSource } from '@/features/story-studio/model';
import { sentenceCoverage } from '@/features/story-studio/editing';
import styles from './story-studio.module.css';

type Filter = 'all' | 'unused' | 'repeated' | 'voiceless';
const filterNames: Record<Filter, string> = { all: 'Todas', unused: 'Sin usar', repeated: 'Repetidas', voiceless: 'Sin voz' };

/** Screenplay view of the Story: every line, where it is staged, who says it and whether it has a voice. */
export function StudioScript({ project, source, currentSequenceId, onClose, onGoTo, onPlace, onCreateMoment, onStageUnused, onSpeaker }: {
  project: StudioProject; source: StudioSource; currentSequenceId: string;
  onClose: () => void;
  onGoTo: (sequenceId: string, cueId: string) => void;
  onPlace: (sentenceId: string) => void;
  onCreateMoment: (sentenceId: string) => void;
  onStageUnused: () => void;
  onSpeaker: (sequenceId: string, cueId: string, speakerId: string | null) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const coverage = useMemo(() => sentenceCoverage(project, source), [project, source]);
  const locations = useMemo(() => new Map(project.scenes.flatMap((scene, si) => scene.sequences.map((sequence, qi) => [sequence.id, { scene, label: `E${si + 1} · M${qi + 1}`, name: sequence.name }] as const))), [project]);
  const current = locations.get(currentSequenceId);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  const rows = source.sentences.map((sentence, index) => ({ sentence, index, uses: coverage.uses.get(sentence.id) ?? [] })).filter(({ uses }) =>
    filter === 'all' || (filter === 'unused' && !uses.length) || (filter === 'repeated' && uses.length > 1) || (filter === 'voiceless' && uses.some(u => !u.audio)));
  return <div className={styles.modalShade} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className={styles.scriptDialog} role="dialog" aria-modal="true" aria-label="Guion de la historia">
      <header className={styles.scriptHeader}>
        <div><h3>Guion · {source.title}</h3><p><strong>{coverage.used}</strong> de {coverage.total} frases en escena{coverage.unused ? <> · <span className={styles.warnText}>{coverage.unused} sin usar</span></> : ' · todas colocadas'}{coverage.repeated ? <> · {coverage.repeated} repetidas</> : null}</p></div>
        <div className={styles.inlineButtons}>
          <button disabled={!coverage.unused} onClick={onStageUnused} title="Crea un momento por cada frase sin usar, en el orden de la Story, después del momento actual.">Crear momentos para las frases sin usar</button>
          <button onClick={onClose} aria-label="Cerrar guion">Cerrar</button>
        </div>
      </header>
      <div className={styles.scriptFilters} role="toolbar" aria-label="Filtrar frases">{(Object.keys(filterNames) as Filter[]).map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{filterNames[f]}</button>)}<span className={styles.subtle}>Momento actual: {current ? `${current.label} · ${current.name}` : '—'}</span></div>
      <div className={styles.scriptTable} role="table" aria-label="Frases de la Story">
        <div role="row" className={styles.scriptRowHead}><span role="columnheader">#</span><span role="columnheader">Frase de la Story</span><span role="columnheader">Puesta en escena</span><span role="columnheader">Colocar</span></div>
        {rows.map(({ sentence, index, uses }) => <div role="row" key={sentence.id} className={styles.scriptRow} data-state={!uses.length ? 'unused' : uses.length > 1 ? 'repeated' : 'used'}>
          <span role="cell" className={styles.scriptIndex}>{index + 1}</span>
          <span role="cell" className={styles.scriptText}>{sentence.text}</span>
          <span role="cell" className={styles.scriptUses}>{uses.length ? uses.map(use => {
            const where = locations.get(use.sequenceId);
            return <span key={use.cueId} className={styles.scriptUse}>
              <button onClick={() => onGoTo(use.sequenceId, use.cueId)} title={`Ir a ${where?.name ?? 'el momento'}`}>{where?.label ?? '—'}</button>
              <select aria-label={`Quién dice la frase ${index + 1} en ${where?.label ?? 'el momento'}`} value={use.speakerId ?? ''} onChange={e => onSpeaker(use.sequenceId, use.cueId, e.target.value || null)}>
                <option value="">Narrador</option>{where?.scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <span className={styles.voiceBadge} data-voice={use.audio} title={use.audio ? 'Con grabación' : 'Sin grabación: se usará la voz del navegador'}>{use.audio ? 'Voz' : 'Sin voz'}</span>
            </span>;
          }) : <span className={styles.subtle}>Sin usar</span>}</span>
          <span role="cell" className={styles.scriptActions}>
            <button onClick={() => onPlace(sentence.id)} title="Añade la frase al momento actual, después de lo que ya se dice.">En este momento</button>
            <button onClick={() => onCreateMoment(sentence.id)} title="Crea un momento nuevo después del actual con esta frase.">Momento nuevo</button>
          </span>
        </div>)}
        {!rows.length && <p className={styles.scriptEmpty}>No hay frases con este filtro.</p>}
      </div>
    </section>
  </div>;
}
