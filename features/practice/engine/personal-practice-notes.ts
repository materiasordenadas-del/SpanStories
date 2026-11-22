import {
  createPersonalPracticeItem,
  normalizeSpaces,
  withUpdatedSurface,
  type PersonalPracticeAddedBy,
  type PersonalPracticeItem,
  type PersonalPracticeItemId,
} from "../domain/personal-item.ts";

/**
 * Turns the freeform "Palabras y frases para practicar" textarea into a
 * synced PersonalPracticeItem collection: one non-empty line, one item.
 *
 * Lines are matched to existing items by an LCS-style alignment on their
 * text, so a line that only moves or repeats keeps its `id` (KEEP), and a
 * line whose text changed in place — the common case while typing — is
 * paired with the nearest deleted line as an UPDATE rather than a
 * delete-then-create, so no item is ever orphaned by an edit.
 */

type RawOp = { readonly kind: "EQUAL"; readonly i: number; readonly j: number } | { readonly kind: "DELETE"; readonly i: number } | { readonly kind: "INSERT"; readonly j: number };

function lcsOps(a: readonly string[], b: readonly string[]): readonly RawOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "EQUAL", i, j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "DELETE", i });
      i++;
    } else {
      ops.push({ kind: "INSERT", j });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "DELETE", i });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "INSERT", j });
    j++;
  }
  return ops;
}

type LineOp =
  | { readonly kind: "KEEP"; readonly id: PersonalPracticeItemId }
  | { readonly kind: "UPDATE"; readonly id: PersonalPracticeItemId; readonly text: string }
  | { readonly kind: "CREATE"; readonly text: string }
  | { readonly kind: "DELETE"; readonly id: PersonalPracticeItemId };

function mergeToLineOps(oldLines: readonly { readonly id: PersonalPracticeItemId }[], newTexts: readonly string[], raw: readonly RawOp[]): readonly LineOp[] {
  const result: LineOp[] = [];
  let k = 0;
  while (k < raw.length) {
    const op = raw[k];
    if (op.kind === "EQUAL") {
      result.push({ kind: "KEEP", id: oldLines[op.i].id });
      k++;
      continue;
    }
    const deletes: number[] = [];
    const inserts: number[] = [];
    while (k < raw.length && raw[k].kind !== "EQUAL") {
      const next = raw[k];
      if (next.kind === "DELETE") deletes.push(next.i);
      else if (next.kind === "INSERT") inserts.push(next.j);
      k++;
    }
    const paired = Math.min(deletes.length, inserts.length);
    for (let p = 0; p < paired; p++) result.push({ kind: "UPDATE", id: oldLines[deletes[p]].id, text: newTexts[inserts[p]] });
    for (let p = paired; p < deletes.length; p++) result.push({ kind: "DELETE", id: oldLines[deletes[p]].id });
    for (let p = paired; p < inserts.length; p++) result.push({ kind: "CREATE", text: newTexts[inserts[p]] });
  }
  return result;
}

export type PersonalPracticeSyncResult = {
  /** The full, updated collection, in line order. */
  readonly items: readonly PersonalPracticeItem[];
  /** Items whose text is brand new — candidates for lexical resolution. */
  readonly created: readonly PersonalPracticeItem[];
  /** Items whose text changed in place — candidates for re-resolution. */
  readonly updated: readonly PersonalPracticeItem[];
  readonly removedIds: readonly PersonalPracticeItemId[];
};

/**
 * `scope` picks which notebook is being synced:
 *  - a Story key (`"01/02"`): only that Story's own lines take part in the
 *    diff — every other item passes through untouched. New lines are tagged
 *    with that scope, so the Story's notebook starts blank next time and
 *    only ever shows what was written in it.
 *  - `null`: the student's own "Palabras y frases para practicar" list,
 *    which is never scoped — every item, from every Story and from the list
 *    itself, takes part, so the whole collection stays editable from there.
 */
export function syncPersonalPracticeNotes(input: {
  readonly previousItems: readonly PersonalPracticeItem[];
  readonly rawText: string;
  readonly addedBy: PersonalPracticeAddedBy;
  readonly scope: string | null;
  readonly now: Date;
  readonly generateId: () => PersonalPracticeItemId;
}): PersonalPracticeSyncResult {
  const inScope = input.scope === null ? input.previousItems : input.previousItems.filter((item) => item.scope === input.scope);
  const outOfScope = input.scope === null ? [] : input.previousItems.filter((item) => item.scope !== input.scope);

  const oldLines = inScope.map((item) => ({ id: item.id, text: item.surface }));
  const newTexts = input.rawText.split("\n").map(normalizeSpaces).filter((line) => line !== "");
  const ops = mergeToLineOps(oldLines, newTexts, lcsOps(oldLines.map((line) => line.text), newTexts));

  const byId = new Map(inScope.map((item) => [item.id, item]));
  const scopedItems: PersonalPracticeItem[] = [];
  const created: PersonalPracticeItem[] = [];
  const updated: PersonalPracticeItem[] = [];
  const removedIds: PersonalPracticeItemId[] = [];

  for (const op of ops) {
    if (op.kind === "KEEP") {
      scopedItems.push(byId.get(op.id)!);
    } else if (op.kind === "UPDATE") {
      const next = withUpdatedSurface(byId.get(op.id)!, op.text, input.now);
      scopedItems.push(next);
      updated.push(next);
    } else if (op.kind === "CREATE") {
      const next = createPersonalPracticeItem({ id: input.generateId(), surface: op.text, addedBy: input.addedBy, scope: input.scope, now: input.now });
      scopedItems.push(next);
      created.push(next);
    } else {
      removedIds.push(op.id);
    }
  }

  return { items: [...outOfScope, ...scopedItems], created, updated, removedIds };
}
