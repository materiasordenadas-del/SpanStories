import { Fragment, type ReactNode } from "react";
import type { ShownGloss } from "@/features/story-reader/gloss";
import type { StoryReaderGlossUnit, StoryReaderTextSegment } from "@/features/story-reader/model";
import { CLOSING, OPENING } from "./StoryText";
import styles from "./baseline.module.css";

/** Una palabra o una expresión que puede llevar su etiqueta de traducción encima. */
function GlossHost({ id, shown, expression = false, children }: { id: string; shown: ShownGloss | undefined; expression?: boolean; children: ReactNode }) {
  const className = [
    styles.glossHost,
    shown === undefined ? "" : styles.glossOn,
    shown?.leaving === true ? styles.glossLeaving : "",
    shown?.instant === true ? styles.glossInstant : "",
    shown?.gloss.kind === "MISSING" ? styles.glossMissing : "",
  ].filter(Boolean).join(" ");
  return <span
    className={className}
    data-gloss-expression={expression ? "" : undefined}
    data-gloss-host={id}
    data-gloss-run={shown?.run}
    data-gloss-state={shown === undefined ? undefined : shown.leaving ? "leaving" : "on"}
  >
    {shown === undefined ? null : <span aria-hidden="true" className={styles.glossRow} data-gloss-row=""><span className={styles.glossChip} data-gloss-chip="" lang="en">{shown.gloss.text}</span></span>}
    <span className={styles.glossWords} data-gloss-words="">{children}</span>
  </span>;
}

/**
 * La frase en modo traducción rápida: mismas palabras y puntuación que StoryText, pero cada palabra
 * y cada expresión es anfitriona de su etiqueta. La colocación de las etiquetas la hace layoutQuickGloss.
 */
export function GlossStoryText({ segments, units, shown, activeWordIds, onToggle, onSelect }: {
  segments: readonly StoryReaderTextSegment[];
  units: readonly StoryReaderGlossUnit[];
  shown: ReadonlyMap<string, ShownGloss>;
  activeWordIds: ReadonlySet<string>;
  onToggle: (wordId: string, surface: string) => void;
  onSelect: (segment: Exclude<StoryReaderTextSegment, { readonly kind: "TEXT" }>, word: HTMLElement) => void;
}) {
  const unitBySegment = new Map<number, StoryReaderGlossUnit>();
  for (const unit of units) for (const word of unit.words) unitBySegment.set(word.segmentIndex, unit);

  const nodes: ReactNode[] = [];
  for (let index = 0; index < segments.length;) {
    const segment = segments[index];
    if (segment.kind === "TEXT") {
      const previous = segments[index - 1];
      const following = segments[index + 1];
      let value = segment.text;
      if (previous !== undefined && previous.kind !== "TEXT") value = value.replace(CLOSING, "");
      if (following !== undefined && following.kind !== "TEXT") value = value.replace(OPENING, "");
      if (value !== "") nodes.push(<span key={index}>{value}</span>);
      index += 1;
      continue;
    }
    const unit = unitBySegment.get(index);
    const first = unit?.words[0]?.segmentIndex ?? index;
    const last = unit?.words.at(-1)?.segmentIndex ?? index;
    const beforeSegment = segments[first - 1];
    const afterSegment = segments[last + 1];
    const before = beforeSegment?.kind === "TEXT" ? beforeSegment.text.match(OPENING)?.[0] ?? "" : "";
    const after = afterSegment?.kind === "TEXT" ? afterSegment.text.match(CLOSING)?.[0] ?? "" : "";
    const inner = segments.slice(first, last + 1).map((part, offset) => {
      if (part.kind === "TEXT") return <Fragment key={`espacio-${offset}`}>{part.text}</Fragment>;
      const id = part.kind === "LEXICAL" ? part.occurrenceId : part.tokenId;
      return <GlossHost id={id} key={id} shown={shown.get(id)}>
        <button
          aria-pressed={activeWordIds.has(id)}
          className={part.curriculumFocus === true ? `${styles.selectableWord} ${styles.lexicalWord}` : styles.selectableWord}
          onClick={(event) => {
            onToggle(id, part.text);
            onSelect(part, event.currentTarget);
          }}
          type="button"
        >{part.text}</button>
      </GlossHost>;
    });
    const body = unit !== undefined && unit.words.length > 1
      ? <GlossHost expression id={unit.id} key={unit.id} shown={shown.get(unit.id)}>{inner}</GlossHost>
      : inner[0];
    nodes.push(before === "" && after === ""
      ? body
      : <span className={styles.wordGroup} data-gloss-group="" key={`grupo-${index}`}>{before}{body}{after}</span>);
    index = last + 1;
  }
  return <>{nodes}</>;
}
