import { doc, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { createPersonalPracticeItem, normalizeSpaces } from "../practice/domain/personal-item.ts";

/** Copy class lines atomically to both notebooks; observations remain teacher-only. */
export async function saveTeacherNotes(db: Firestore, teacherId: string, studentId: string, text: string, privateText: string) {
  const lines = text.split("\n").map(normalizeSpaces).filter(Boolean);
  if (lines.some((line) => line.length > 2000) || privateText.length > 20000) throw new Error("Las notas superan el tamaño permitido.");
  const items = lines.map((surface) => createPersonalPracticeItem({ id: crypto.randomUUID(), surface, addedBy: "TUTOR", scope: null, now: new Date() }));
  const studentRef = doc(db, "personalPractice", studentId);
  const teacherRef = doc(db, "teacherNotes", `${teacherId}_${studentId}`);
  await runTransaction(db, async (transaction) => {
    const [student, teacher] = await Promise.all([transaction.get(studentRef), transaction.get(teacherRef)]);
    const studentItems = student.data()?.items ?? [];
    const teacherItems = teacher.data()?.items ?? [];
    if (studentItems.length + items.length > 500 || teacherItems.length + items.length > 500) throw new Error("El cuaderno admite hasta 500 líneas. No se guardó ningún cambio.");
    if (items.length > 0) transaction.set(studentRef, { studentId, items: [...studentItems, ...items], updatedAt: serverTimestamp() });
    transaction.set(teacherRef, { teacherId, studentId, items: [...teacherItems, ...items], privateText, updatedAt: serverTimestamp() });
  });
}
