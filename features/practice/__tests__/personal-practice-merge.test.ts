import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersonalPracticeItem, withUpdatedSurface } from "../domain/personal-item.ts";
import { applyPersonalPracticeChanges } from "../engine/personal-practice-merge.ts";

const now = new Date("2026-09-18T12:00:00Z");
const item = (id: string) => createPersonalPracticeItem({ id, surface: id, addedBy: "STUDENT", scope: null, now });

test("editar o borrar una línea preserva las nuevas notas simultáneas del tutor", () => {
  const original = item("alumno");
  const tutor = { ...item("tutor"), addedBy: "TUTOR" as const };
  const edited = withUpdatedSurface(original, "edición", now);
  assert.deepEqual(applyPersonalPracticeChanges([original, tutor], [original], [edited]), [edited, tutor]);
  assert.deepEqual(applyPersonalPracticeChanges([original, tutor], [original], []), [tutor]);
});

test("una línea local sin cambios no sobrescribe una edición remota", () => {
  const original = item("línea");
  const remote = withUpdatedSurface(original, "remota", now);
  assert.deepEqual(applyPersonalPracticeChanges([remote], [original], [original, item("nueva")]), [remote, item("nueva")]);
});
