"use client";

import { usePersonalPracticeNotesEditor } from "@/lib/adapters/personal-practice";
import styles from "@/components/accounts/accounts.module.css";

const SAVE_LABEL: Readonly<Record<string, string>> = { idle: "", saving: "Guardando…", saved: "Guardado" };

/**
 * Palabras y frases para practicar: una línea, un elemento. Sin botón de
 * guardar — escribir es suficiente, el autosave (con debounce) hace el resto.
 */
export function PersonalPracticeNotes() {
  const { ready, text, saveState, onChange } = usePersonalPracticeNotesEditor();
  return <section className={styles.studentSection} id="notas">
    <h2>Palabras y frases para practicar</h2>
    <p className={styles.user}>Escribe una palabra o frase por línea. Se guardan solas y aparecen en tu práctica.</p>
    <textarea
      aria-label="Palabras y frases para practicar"
      className={styles.notesArea}
      disabled={!ready}
      onChange={(event) => onChange(event.target.value)}
      placeholder={"qué pena\nllegar tarde\n¿me puedes ayudar?"}
      rows={6}
      value={text}
    />
    <p aria-live="polite" className={styles.notesStatus}>{SAVE_LABEL[saveState]}</p>
  </section>;
}
