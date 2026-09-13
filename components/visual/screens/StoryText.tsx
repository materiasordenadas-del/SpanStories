import type { StoryReaderTextSegment } from "@/features/story-reader/model";
import styles from "./baseline.module.css";

export function StoryText({ segments, selectedWordId, onSelect }: {
  segments: readonly StoryReaderTextSegment[];
  selectedWordId: string | null;
  onSelect: (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>, word: HTMLElement) => void;
}) {
  return <>{segments.map((segment, index) => segment.kind === "TEXT"
    ? <span key={index}>{segment.text}</span>
    : <button
        aria-controls="lexical-detail"
        aria-pressed={selectedWordId === (segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId)}
        className={styles.selectableWord}
        key={`${segment.kind === "LEXICAL" ? segment.occurrenceId : segment.tokenId}-${index}`}
        onClick={(event) => onSelect(segment, event.currentTarget)}
        type="button"
      >{segment.text}</button>)}</>;
}
