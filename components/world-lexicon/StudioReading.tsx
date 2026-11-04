"use client";

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { StudioSource } from '@/features/story-studio/model';
import { StoryText } from '@/components/visual/screens/StoryText';
import { LexicalPanel } from '@/components/visual/screens/WordPanel';
import { readerWordPractice } from '@/features/practice/engine/reader';
import { practiceTargetKey } from '@/features/practice/domain/target';
import { recordKnowledge } from '@/lib/adapters/lexical-knowledge';
import styles from './story-studio.module.css';

/** Uses the reader's existing occurrence/token IDs and dictionary/save-word UI. */
export function StudioReading({ source, sentenceId, owner, onPause, recordProgress=false }: { source: StudioSource; sentenceId: string; owner: string; onPause: () => void; recordProgress?:boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState(false);
  const sentence = source.sentences.find(s => s.id === sentenceId);
  const readerSentence = source.reader?.sentences.find(s => s.id === sentenceId);
  if (!readerSentence || !source.reader) return <>{sentence?.text}</>;
  const reader = source.reader;
  return <>
    <StoryText segments={readerSentence.segments} selectedWordId={selected} onSelect={segment => {
      const id = segment.kind === 'LEXICAL' ? segment.occurrenceId : segment.tokenId;
      setSelected(id); setOpened(true); onPause();
      const word = readerWordPractice(reader, id);
      if (word&&recordProgress) setError(!recordKnowledge({ kind: 'OCCURRENCE_OPENED', targetKey: practiceTargetKey(word.target), storyVersionId: reader.storyVersionId, occurrenceId: id }, owner));
    }} />
    {opened && createPortal(<div className={styles.lexicalOverlay}><LexicalPanel model={reader} selectedWordId={selected} eventError={error} isOpen={opened} onToggle={() => setOpened(!opened)} /></div>,document.body)}
  </>;
}
