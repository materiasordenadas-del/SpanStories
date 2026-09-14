"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { AccountRole, TeacherInvite, TeacherStudent, UserProfile } from "./types";

function firestore() {
  if (!db) throw new Error("Firebase no está configurado. Revisa las variables NEXT_PUBLIC_FIREBASE_*.");
  return db;
}

export async function getProfile(uid: string) {
  const snapshot = await getDoc(doc(firestore(), "users", uid));
  return snapshot.exists() ? snapshot.data() as UserProfile : null;
}

export async function createProfile(input: { uid: string; role: AccountRole; displayName: string; email: string }) {
  const ref = doc(firestore(), "users", input.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return existing.data() as UserProfile;
  await setDoc(ref, { ...input, createdAt: serverTimestamp() });
  return (await getDoc(ref)).data() as UserProfile;
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const isInviteCode = (code: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(code);

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
}

/* ── Invitaciones personales ── */

/** La invitación de ese código, o null si no existe o esta cuenta no puede verla (ya usada por otra persona). */
export async function getTeacherInvite(code: string) {
  const value = normalizeCode(code);
  if (!isInviteCode(value)) return null;
  const snapshot = await getDoc(doc(firestore(), "teacherInvites", value));
  return snapshot.exists() ? snapshot.data() as TeacherInvite : null;
}

/** Crea una invitación para una sola persona y devuelve su código. */
export async function createStudentInvite(teacherId: string, teacherName: string) {
  const store = firestore();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const ref = doc(store, "teacherInvites", code);
    // Un código ya usado por otro profesor no se puede leer: también cuenta como ocupado.
    const taken = await getDoc(ref).then((snapshot) => snapshot.exists(), () => true);
    if (taken) continue;
    await setDoc(ref, { code, teacherId, teacherName, active: true, usedBy: null, usedAt: null, createdAt: serverTimestamp() });
    return code;
  }
  throw new Error("No se pudo generar un código único. Inténtalo de nuevo.");
}

export async function listTeacherInvites(teacherId: string) {
  const snapshot = await getDocs(query(collection(firestore(), "teacherInvites"), where("teacherId", "==", teacherId)));
  return snapshot.docs.map((item) => item.data() as TeacherInvite);
}

export async function deleteTeacherInvite(code: string) {
  await deleteDoc(doc(firestore(), "teacherInvites", normalizeCode(code)));
}

/* ── Vínculos profesor–estudiante ── */

export async function listTeacherStudents(teacherId: string) {
  const snapshot = await getDocs(query(collection(firestore(), "teacherStudents"), where("teacherId", "==", teacherId)));
  return snapshot.docs.map((item) => item.data() as TeacherStudent);
}

export async function listStudentTeachers(studentId: string) {
  const snapshot = await getDocs(query(collection(firestore(), "teacherStudents"), where("studentId", "==", studentId)));
  return snapshot.docs.map((item) => item.data() as TeacherStudent);
}

/** Desvincula a una persona y retira sus destinatarios de las tareas de ese profesor. */
export async function removeTeacherStudent(teacherId: string, studentId: string) {
  const store = firestore();
  const tasks = await getDocs(query(collection(store, "teacherTasks"), where("teacherId", "==", teacherId)));
  const batch = writeBatch(store);
  batch.delete(doc(store, "teacherStudents", `${teacherId}_${studentId}`));
  tasks.docs.forEach((task) => batch.delete(doc(task.ref, "assignees", studentId)));
  await batch.commit();
}

export type AcceptInviteResult = { readonly teacherName: string; readonly alreadyLinked: boolean };

/**
 * Usa la invitación: crea el vínculo con el profesor y la consume en el mismo lote,
 * así nadie más puede usarla. Si el estudiante ya estaba con ese profesor, no la gasta.
 */
export async function acceptTeacherInvite(input: { code: string; studentId: string; studentName: string }): Promise<AcceptInviteResult> {
  const store = firestore();
  const code = normalizeCode(input.code);
  const invite = await getTeacherInvite(code).catch(() => null);
  if (!invite) throw new Error("Esta invitación no es válida.");
  const linkRef = doc(store, "teacherStudents", `${invite.teacherId}_${input.studentId}`);
  if ((await getDoc(linkRef)).exists()) return { teacherName: invite.teacherName, alreadyLinked: true };
  if (!invite.active) throw new Error("Esta invitación ya se usó. Pide una nueva a tu profesor.");
  const batch = writeBatch(store);
  batch.set(linkRef, {
    teacherId: invite.teacherId,
    teacherName: invite.teacherName,
    studentId: input.studentId,
    studentName: input.studentName,
    inviteCode: code,
    joinedAt: serverTimestamp(),
  });
  batch.update(doc(store, "teacherInvites", code), { active: false, usedBy: input.studentId, usedAt: serverTimestamp() });
  await batch.commit();
  return { teacherName: invite.teacherName, alreadyLinked: false };
}
