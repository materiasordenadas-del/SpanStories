"use client";

import { usePersonalPracticeNotesEditor } from "@/lib/adapters/personal-practice";
import styles from "./baseline.module.css";

const SAVE_LABEL: Readonly<Record<string, string>> = { idle: "", saving: "Guardando…", saved: "Guardado" };

/**
 * El mismo cuaderno de "Palabras y frases para practicar" de /student#notas,
 * abierto sobre la historia en vez de navegar a otra página. Usa el mismo
 * hook (mismo owner, mismo localStorage) — todo lo escrito aquí se guarda
 * también en la lista completa de /student#notas. Pero acotado a esta
 * historia (`scope`): al entrar en otra historia, este cuaderno aparece en
 * blanco y solo muestra/edita lo escrito en ella, nunca lo de otras.
 */
export function NotesNotebook({ island, story, onClose }: { island: string; story: string; onClose: () => void }) {
  const { ready, text, saveState, onChange } = usePersonalPracticeNotesEditor(`${island}/${story}`);
  return <div className={styles.notebookBackdrop} onMouseDown={onClose} role="presentation">
    <section aria-labelledby="notebook-title" aria-modal="true" className={styles.notebookDialog} onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <button aria-label="Cerrar" className={styles.notebookClose} onClick={onClose} type="button">×</button>
      <h2 id="notebook-title">Palabras y frases para practicar</h2>
      <p>Escribe una palabra o frase por línea. Se guardan solas y aparecen en tu práctica.</p>
      <textarea
        aria-label="Palabras y frases para practicar"
        autoFocus
        className={styles.notebookArea}
        disabled={!ready}
        onChange={(event) => onChange(event.target.value)}
        placeholder={"qué pena\nllegar tarde\n¿me puedes ayudar?"}
        rows={8}
        value={text}
      />
      <div className={styles.notebookFoot}>
        <p aria-live="polite" className={styles.notebookStatus}>{SAVE_LABEL[saveState]}</p>
        <button className={styles.notebookDone} onClick={onClose} type="button">Cerrar</button>
      </div>
    </section>
  </div>;
}
