"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/features/accounts/AuthProvider";
import { saveTeacherNotes } from "@/features/accounts/teacher-notes-service";
import { db } from "@/lib/firebase/client";
import t from "./teacher.module.css";

export function NotesPanel({ studentId }: { studentId: string }) {
  const { user } = useAuth();
  const [lines, setLines] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [privateText, setPrivateText] = useState<string | null>(null);
  const [remotePrivateText, setRemotePrivateText] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(doc(db, "teacherNotes", `${user.uid}_${studentId}`), (snapshot) => {
      const data = snapshot.data();
      setLines((data?.items ?? []).flatMap((item: { surface?: unknown }) => typeof item?.surface === "string" ? [item.surface] : []));
      setRemotePrivateText(typeof data?.privateText === "string" ? data.privateText : "");
      setReady(true);
    }, () => setError("No pudimos cargar las notas online. Revisa la conexión y los permisos."));
  }, [studentId, user]);

  async function save() {
    if (!db || !user || saving) return;
    setSaving(true); setMessage(""); setError("");
    try {
      await saveTeacherNotes(db, user.uid, studentId, text, privateText ?? remotePrivateText);
      setText(""); setPrivateText(null); setMessage("Guardado online.");
    } catch (cause) {
      setError(cause instanceof Error && !cause.message.includes("Firebase") ? cause.message : "No se pudo guardar online. Conservamos el texto para que vuelvas a intentarlo.");
    } finally { setSaving(false); }
  }

  return <section aria-labelledby="ficha-notas" className={t.mainCol}>
    <div className={t.mainHead}><h1 className={t.h1s} id="ficha-notas">Notas</h1></div>
    <p className={t.hint}>Añade aquí las palabras y frases de la clase. Se guardan en las notas del alumno y en tu cuaderno de este alumno.</p>
    {error ? <p className={t.error} role="alert">{error}</p> : null}
    <form className={t.notesForm} onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label htmlFor="class-notes">Nuevas líneas para practicar (una por línea)</label>
      <textarea disabled={!ready || saving} id="class-notes" onChange={(event) => setText(event.target.value)} rows={6} value={text} />
      <label htmlFor="private-notes">Observaciones privadas — solo tú puedes verlas</label>
      <textarea disabled={!ready || saving} id="private-notes" maxLength={20000} onChange={(event) => setPrivateText(event.target.value)} rows={5} value={privateText ?? remotePrivateText} />
      <div><button className={`${t.btn} ${t.primary}`} disabled={!ready || saving || (!text.trim() && privateText === null)} type="submit">{saving ? "Guardando online…" : "Guardar notas"}</button></div>
      <p aria-live="polite" role="status">{message || (!ready && !error ? "Cargando notas…" : "")}</p>
    </form>
    <h2 className={t.secTitle}>Tu cuaderno de clase</h2>
    <p className={t.hint}>Conserva las líneas que añadiste, aunque el alumno las edite después.</p>
    {lines.length > 0 ? <ol className={t.box}>{lines.map((line, index) => <li key={index}>{line}</li>)}</ol> : <p className={t.hint}>Todavía no has añadido líneas de clase.</p>}
  </section>;
}
