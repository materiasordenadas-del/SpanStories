import type { Timestamp } from "firebase/firestore";

export type AccountRole = "student" | "teacher";

export interface UserProfile {
  uid: string;
  role: AccountRole;
  displayName: string;
  email: string;
  createdAt: Timestamp;
}

/** Invitación personal: sirve para una sola persona y deja de funcionar cuando alguien la usa. */
export interface TeacherInvite {
  code: string;
  teacherId: string;
  teacherName: string;
  active: boolean;
  usedBy: string | null;
  usedAt: Timestamp | null;
  createdAt: Timestamp | null;
}

/** Vínculo profesor–estudiante. Nace cuando el estudiante usa su invitación; el nombre viene de su cuenta. */
export interface TeacherStudent {
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  inviteCode: string;
  joinedAt: Timestamp | null;
}

/** Una tarea pertenece a un profesor. Sus destinatarios viven en la subcolección `assignees`. */
export type TeacherTaskKind = "story" | "flashcards" | "verbs";

export type TeacherTaskContent =
  | { readonly kind: "story"; readonly storyKey: string }
  | { readonly kind: "flashcards"; readonly minimumCards: 5 | 10 | 20 | 30 }
  | { readonly kind: "verbs"; readonly source: "todos" | "historias"; readonly minimumQuestions: 5 | 10 | 20 | 30 };

type TeacherTaskBase = {
  readonly id: string;
  readonly teacherId: string;
  readonly title: string;
  readonly startsAt: Timestamp;
  readonly dueAt: Timestamp;
  readonly createdAt: Timestamp | null;
};

/** `kind` y `content` se discriminan juntos para que la UI no mezcle actividades. */
export type TeacherTask = TeacherTaskBase & (
  | { readonly kind: "story"; readonly content: Extract<TeacherTaskContent, { readonly kind: "story" }> }
  | { readonly kind: "flashcards"; readonly content: Extract<TeacherTaskContent, { readonly kind: "flashcards" }> }
  | { readonly kind: "verbs"; readonly content: Extract<TeacherTaskContent, { readonly kind: "verbs" }> }
);

/** Copia mínima del destinatario para consultar una tarea sin exponer su perfil privado. */
export interface TaskAssignee {
  readonly studentId: string;
  readonly studentName: string;
  readonly assignedAt: Timestamp | null;
}
