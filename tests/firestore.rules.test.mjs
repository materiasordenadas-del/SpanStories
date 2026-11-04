import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { saveTeacherNotes } from "../features/accounts/teacher-notes-service.ts";
import { FirestorePersonalPracticeItemRepository } from "../features/practice/repository/firestore-personal-practice-item-repository.ts";
import { withUpdatedSurface } from "../features/practice/domain/personal-item.ts";

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

test("las líneas del tutor se guardan en ambos cuadernos; las observaciones son privadas", async () => {
  await assertSucceeds(saveTeacherNotes(as("teacher-1"), "teacher-1", "student-2", "hola\nbuenos días", "Reforzar pronunciación"));
  const personal = (await getDoc(doc(as("student-2"), "personalPractice/student-2"))).data();
  const teacher = (await getDoc(doc(as("teacher-1"), "teacherNotes/teacher-1_student-2"))).data();
  assert.deepEqual(personal.items, teacher.items);
  assert.equal(personal.items[0].addedBy, "TUTOR");
  assert.equal(teacher.privateText, "Reforzar pronunciación");
  await assertFails(getDoc(doc(as("student-2"), "teacherNotes/teacher-1_student-2")));
  await assertFails(getDoc(doc(as("teacher-2"), "teacherNotes/teacher-1_student-2")));
  await assertFails(saveTeacherNotes(as("teacher-2"), "teacher-2", "student-2", "intrusión", ""));
  await assertFails(setDoc(doc(as("student-2"), "teacherNotes/teacher-1_student-2"), teacher));
  await assertFails(setDoc(doc(as("teacher-1"), "teacherNotes/teacher-1_student-2"), { ...teacher, studentId: "student-1", updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as("teacher-1"), "teacherNotes/teacher-1_student-2"), { ...teacher, privateText: "x".repeat(20001), updatedAt: serverTimestamp() }));
  await assertFails(getDocs(collection(as("teacher-1"), "teacherNotes")));
});

test("fallar al guardar uno de los cuadernos no deja una copia parcial", async () => {
  const before = (await getDoc(doc(as("student-2"), "personalPractice/student-2"))).data().items;
  await assertFails(saveTeacherNotes(as("teacher-1"), "teacher-2", "student-2", "no guardar", ""));
  assert.deepEqual((await getDoc(doc(as("student-2"), "personalPractice/student-2"))).data().items, before);
});

function join(store, uid, name, code = "X7F4KD") {
  const batch = writeBatch(store);
  batch.set(doc(store, `teacherStudents/teacher-1_${uid}`), { teacherId:"teacher-1", teacherName:"Laura", studentId:uid, studentName:name, inviteCode:code, joinedAt:serverTimestamp() });
  batch.update(doc(store, `teacherInvites/${code}`), { active:false, usedBy:uid, usedAt:serverTimestamp() });
  return batch.commit();
}

test("el guardado del alumno conserva una línea que el tutor añadió después de cargar", async () => {
  const storage = new Map();
  const repository = new FirestorePersonalPracticeItemRepository(as("student-2"), "student-2", {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }, "test-notes");
  const base = await repository.list();
  await saveTeacherNotes(as("teacher-1"), "teacher-1", "student-2", "línea simultánea", "Reforzar pronunciación");
  await repository.replaceAll(base.map((item, index) => index === 0 ? withUpdatedSurface(item, "hola editada", new Date()) : item));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const saved = (await getDoc(doc(as("student-2"), "personalPractice/student-2"))).data().items;
  assert.equal(saved[0].surface, "hola editada");
  assert.equal(saved.at(-1).surface, "línea simultánea");
  assert.equal((await getDoc(doc(as("teacher-1"), "teacherNotes/teacher-1_student-2"))).data().items[0].surface, "hola");
});

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

test("las notas se comparten solo con el tutor vinculado; las palabras guardadas siguen privadas", async () => {
  const student = as("student-1");
  await assertSucceeds(setDoc(doc(student, "personalPractice/student-1"), { studentId:"student-1", items:[{ id:"a" }], updatedAt:serverTimestamp() }));
  await assertFails(setDoc(doc(student, "personalPractice/student-1"), { studentId:"student-1", items:Array(501).fill({ id:"x" }), updatedAt:serverTimestamp() }));
  await assertFails(setDoc(doc(as("student-2"), "personalPractice/student-1"), { studentId:"student-1", items:[], updatedAt:serverTimestamp() }));
  await assertSucceeds(getDoc(doc(as("teacher-1"), "personalPractice/student-1")));
  await assertFails(getDoc(doc(as("teacher-2"), "personalPractice/student-1")));
  await assertSucceeds(getDoc(doc(student, "personalPractice/student-1")));

  await assertSucceeds(setDoc(doc(student, "practiceItems/student-1"), { studentId:"student-1", items:[{ target:{ type:"LEXEME", lexemeId:"x" } }], updatedAt:serverTimestamp() }));
  await assertFails(setDoc(doc(student, "practiceItems/student-1"), { studentId:"student-1", items:Array(3001).fill({}), updatedAt:serverTimestamp() }));
  await assertFails(getDoc(doc(as("teacher-1"), "practiceItems/student-1")));
});

test("el conocimiento léxico solo lo escribe y lee el propio estudiante, con occurredAt reciente e inmutable", async () => {
  const student = as("student-1");
  const now = new Date();
  const base = {
    eventId:"ev-1", learnerId:"user:student-1", targetKey:"SENSE:x", occurredAt:now, kind:"SAVED",
    storyVersionId:null, occurrenceId:null, curriculumRelease:"A1-CURRICULUM-v1.51", lexiconRelease:"A1-LEXICON-v1.0",
  };
  await assertSucceeds(setDoc(doc(student, "studentKnowledge/student-1/events/ev-1"), base));
  await assertFails(setDoc(doc(student, "studentKnowledge/student-1/events/ev-2"), base)); // doc id must equal eventId
  await assertFails(setDoc(doc(student, "studentKnowledge/student-1/events/ev-1"), { ...base, targetKey:"SENSE:y" })); // create-only: no overwriting
  await assertFails(setDoc(doc(student, "studentKnowledge/student-1/events/ev-3"), { ...base, eventId:"ev-3", occurredAt:new Date(Date.now() + 3_600_000) })); // fuera de la ventana de tolerancia
  await assertFails(setDoc(doc(as("student-2"), "studentKnowledge/student-1/events/ev-4"), { ...base, eventId:"ev-4" }));
  await assertFails(getDocs(collection(as("teacher-1"), "studentKnowledge/student-1/events")));
  await assertSucceeds(getDocs(collection(student, "studentKnowledge/student-1/events")));
});

test("lastStory en studentProgress tiene forma acotada", async () => {
  const student = as("student-1");
  await assertSucceeds(setDoc(doc(student, "studentProgress/student-1"), { studentId:"student-1", updatedAt:serverTimestamp(), lastStory:{ island:"01", story:"02", title:"Título" } }, { merge:true }));
  // Replace the map: merge:true would retain its existing story/title fields.
  await assertFails(setDoc(doc(student, "studentProgress/student-1"), { studentId:"student-1", updatedAt:serverTimestamp(), lastStory:{ island:"01" } }));
});
