import { Fragment, type ReactNode } from "react";
import type { StoryReaderTextSegment } from "@/features/story-reader/model";
import styles from "./baseline.module.css";

type TextSegment = Extract<StoryReaderTextSegment, { readonly kind: "TEXT" }>;

// Puntuación que se pega a la palabra vecina: «clases.», «Sr.», «¿Quién», «—dice».
const CLOSING = /^[.,;:!?…»”)\]]+/u;
const OPENING = /[¿¡«“(\[—]+$/u;

const isText = (segment: StoryReaderTextSegment | undefined): segment is TextSegment => segment?.kind === "TEXT";

export function StoryText({ segments, selectedWordId, onSelect }: {
  segments: readonly StoryReaderTextSegment[];
  selectedWordId: string | null;
  onSelect: (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>, word: HTMLElement) => void;
}) {
  // Cada palabra es un botón y el navegador puede partir la línea justo después de él:
  // la puntuación contigua viaja con la palabra para que ninguna línea empiece por un punto.
  const nodes: ReactNode[] = segments.map((segment, index) => {
    const previous = segments[index - 1];
    const next = segments[index + 1];
    if (isText(segment)) {
      let text = segment.text;
      if (previous !== undefined && !isText(previous)) text = text.replace(CLOSING, "");
      if (next !== undefined && !isText(next)) text = text.replace(OPENING, "");
      return text === "" ? null : <span key={index}>{text}</span>;
    }
    const id = segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId;
    const before = isText(previous) ? previous.text.match(OPENING)?.[0] ?? "" : "";
    const after = isText(next) ? next.text.match(CLOSING)?.[0] ?? "" : "";
    const button = <button
      aria-controls="lexical-detail"
      aria-pressed={selectedWordId === id}
      className={segment.kind === "LEXICAL" ? `${styles.selectableWord} ${styles.lexicalWord}` : styles.selectableWord}
      onClick={(event) => onSelect(segment, event.currentTarget)}
      type="button"
    >{segment.text}</button>;
    return before === "" && after === ""
      ? <Fragment key={`${id}-${index}`}>{button}</Fragment>
      : <span className={styles.wordGroup} key={`${id}-${index}`}>{before}{button}{after}</span>;
  });
  return <>{nodes}</>;
}
