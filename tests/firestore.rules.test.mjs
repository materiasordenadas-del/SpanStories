import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "spanstories-test", firestore: { rules: await readFile("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (context) => {
    const now = new Date();
    const store = context.firestore();
    await setDoc(doc(store, "users/student-1"), { uid:"student-1", role:"student", displayName:"Ana", email:"ana@example.com", createdAt:now });
    await setDoc(doc(store, "users/student-2"), { uid:"student-2", role:"student", displayName:"Beto", email:"beto@example.com", createdAt:now });
    await setDoc(doc(store, "users/teacher-1"), { uid:"teacher-1", role:"teacher", displayName:"Laura", email:"laura@example.com", createdAt:now });
    await setDoc(doc(store, "users/teacher-2"), { uid:"teacher-2", role:"teacher", displayName:"Otro", email:"otro@example.com", createdAt:now });
    await setDoc(doc(store, "teacherInvites/X7F4KD"), { code:"X7F4KD", teacherId:"teacher-1", teacherName:"Laura", active:true, usedBy:null, usedAt:null, createdAt:now });
    await setDoc(doc(store, "teacherStudents/teacher-1_student-2"), { teacherId:"teacher-1", teacherName:"Laura", studentId:"student-2", studentName:"Beto", inviteCode:"SEED23", joinedAt:now });
  });
});
after(async () => env?.cleanup());

const as = (uid) => env.authenticatedContext(uid).firestore();

function join(store, uid, name, code = "X7F4KD") {
  const batch = writeBatch(store);
  batch.set(doc(store, `teacherStudents/teacher-1_${uid}`), { teacherId:"teacher-1", teacherName:"Laura", studentId:uid, studentName:name, inviteCode:code, joinedAt:serverTimestamp() });
  batch.update(doc(store, `teacherInvites/${code}`), { active:false, usedBy:uid, usedAt:serverTimestamp() });
  return batch.commit();
}

test("la invitación activa se previsualiza sin cuenta, pero no se lista", async () => {
  const store = env.unauthenticatedContext().firestore();
  assert.equal((await assertSucceeds(getDoc(doc(store, "teacherInvites/X7F4KD")))).data().teacherName, "Laura");
  await assertFails(getDocs(collection(store, "teacherInvites")));
});

test("un estudiante no puede crear invitaciones ni cambiar su rol", async () => {
  const store = as("student-1");
  await assertFails(setDoc(doc(store, "teacherInvites/ABC234"), { code:"ABC234", teacherId:"student-1", teacherName:"Ana", active:true, usedBy:null, usedAt:null, createdAt:serverTimestamp() }));
  await assertFails(setDoc(doc(store, "users/student-1"), { uid:"student-1", role:"teacher", displayName:"Ana", email:"ana@example.com", createdAt:new Date() }));
});

test("el profesor crea invitaciones con su propio nombre y las lista", async () => {
  const store = as("teacher-1");
  await assertFails(setDoc(doc(store, "teacherInvites/QQQ234"), { code:"QQQ234", teacherId:"teacher-1", teacherName:"Otra persona", active:true, usedBy:null, usedAt:null, createdAt:serverTimestamp() }));
  await assertSucceeds(setDoc(doc(store, "teacherInvites/QQQ234"), { code:"QQQ234", teacherId:"teacher-1", teacherName:"Laura", active:true, usedBy:null, usedAt:null, createdAt:serverTimestamp() }));
  await assertSucceeds(getDocs(query(collection(store, "teacherInvites"), where("teacherId", "==", "teacher-1"))));
  await assertFails(getDocs(query(collection(as("teacher-2"), "teacherInvites"), where("teacherId", "==", "teacher-1"))));
});

test("unirse exige consumir la invitación en el mismo lote", async () => {
  const store = as("student-1");
  await assertFails(setDoc(doc(store, "teacherStudents/teacher-1_student-1"), { teacherId:"teacher-1", teacherName:"Laura", studentId:"student-1", studentName:"Ana", inviteCode:"X7F4KD", joinedAt:serverTimestamp() }));
  await assertSucceeds(join(store, "student-1", "Ana"));
});

test("una invitación usada no sirve para otra persona", async () => {
  await assertFails(join(as("student-2"), "student-2", "Beto"));
  await assertFails(getDoc(doc(as("student-2"), "teacherInvites/X7F4KD")));
  await assertSucceeds(getDoc(doc(as("student-1"), "teacherInvites/X7F4KD")));
});

test("el estudiante escribe su progreso; lo leen él y su profesor, nadie más", async () => {
  const student = as("student-1");
  await assertSucceeds(setDoc(doc(student, "studentProgress/student-1"), { studentId:"student-1", finishedStories:["05/01"], savedWords:["SENSE:x"], updatedAt:serverTimestamp() }, { merge:true }));
  await assertSucceeds(addDoc(collection(student, "studentProgress/student-1/events"), { kind:"practice", mode:"verbos", total:10, correct:8, incorrect:1, revealed:1, misses:[], at:serverTimestamp() }));
  await assertFails(addDoc(collection(student, "studentProgress/student-1/events"), { kind:"practice", mode:"verbos", total:1, correct:8, incorrect:0, revealed:0, misses:[], at:serverTimestamp() }));
  await assertFails(setDoc(doc(as("student-2"), "studentProgress/student-1"), { studentId:"student-1", updatedAt:serverTimestamp() }));

  await assertSucceeds(getDoc(doc(as("teacher-1"), "studentProgress/student-1")));
  await assertSucceeds(getDocs(collection(as("teacher-1"), "studentProgress/student-1/events")));
  await assertFails(getDoc(doc(as("teacher-2"), "studentProgress/student-1")));
  await assertFails(getDocs(collection(as("teacher-2"), "studentProgress/student-1/events")));
});

test("el profesor no puede borrar una invitación ya usada ni una ajena", async () => {
  await assertFails(deleteDoc(doc(as("teacher-1"), "teacherInvites/X7F4KD")));
  await assertFails(deleteDoc(doc(as("teacher-2"), "teacherInvites/QQQ234")));
  await assertSucceeds(deleteDoc(doc(as("teacher-1"), "teacherInvites/QQQ234")));
});

test("las tareas se asignan solo a estudiantes vinculados y no se pueden marcar manualmente", async () => {
  const teacher = as("teacher-1");
  const task = doc(teacher, "teacherTasks/task-1");
  const batch = writeBatch(teacher);
  const now = new Date();
  batch.set(task, {
    teacherId:"teacher-1", kind:"verbs", title:"Presente A1", content:{ source:"todos", minimumQuestions:10 },
    startsAt:now, dueAt:new Date(now.getTime() + 86_400_000), createdAt:serverTimestamp(),
  });
  batch.set(doc(task, "assignees/student-2"), { studentId:"student-2", studentName:"Beto", assignedAt:serverTimestamp() });
  await assertSucceeds(batch.commit());

  await assertSucceeds(getDoc(doc(as("student-2"), "teacherTasks/task-1")));
  await assertSucceeds(getDocs(query(collectionGroup(as("student-2"), "assignees"), where("studentId", "==", "student-2"))));
  await assertFails(getDocs(query(collectionGroup(as("student-1"), "assignees"), where("studentId", "==", "student-2"))));
  await assertFails(getDoc(doc(as("student-1"), "teacherTasks/task-1")));
  await assertFails(setDoc(doc(as("student-2"), "teacherTasks/task-1/assignees/student-1"), { studentId:"student-1", studentName:"Ana", assignedAt:serverTimestamp() }));
  await assertFails(setDoc(doc(as("teacher-2"), "teacherTasks/task-2"), {
    teacherId:"teacher-1", kind:"story", title:"Suplantación", content:{ storyKey:"05/01" }, startsAt:now, dueAt:now, createdAt:serverTimestamp(),
  }));
});
