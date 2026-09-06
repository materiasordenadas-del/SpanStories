/**
 * Lineage graph: validation and resolution.
 *
 * Two responsibilities, kept apart on purpose.
 *
 * `validateLineage` decides whether a set of events may be loaded at all. It
 * checks every event, collects every issue and never repairs anything: a graph
 * that fails validation is rejected whole, because a partially-loaded lineage
 * would answer some questions correctly and others silently wrong.
 *
 * `LineageGraph` answers questions about a validated set. Its central rule is
 * that resolving a legacy id after a SPLIT returns *all* successors and refuses
 * to choose. Picking the first child would produce a plausible answer that
 * quietly attributes a history to an identity nobody selected, and no caller
 * could tell that a choice had been made on its behalf.
 */

import type { LexemeId } from "../../curriculum/domain/ids.ts";
import { lexicalIssue, type LexicalIssue } from "../domain/errors.ts";
import {
  ALLOWED_TRANSFER_POLICIES,
  LINEAGE_CARDINALITY,
  lifecycleAfterEvent,
  type LexemeLineageEvent,
} from "../domain/lineage.ts";
import type { LexemeLifecycleStatus } from "../domain/identity.ts";

/**
 * What a published id means now.
 *
 *   ACTIVE                  nothing has happened to it
 *   SUPERSEDED_RESOLVABLE   moved on, and exactly one successor is implied
 *   SUPERSEDED_AMBIGUOUS    moved on into several successors; no single answer
 *   RETIRED                 withdrawn with no successor
 *
 * `SUPERSEDED_AMBIGUOUS` is a successful answer carrying the candidates, not an
 * error and not a null. The caller decides what to do with several successors;
 * the job of the engine is to make sure the caller knows there are several.
 */
export type LineageResolution =
  | { readonly status: "ACTIVE"; readonly lexemeId: LexemeId }
  | {
      readonly status: "SUPERSEDED_RESOLVABLE";
      readonly lexemeId: LexemeId;
      readonly successor: LexemeId;
      readonly via: LexemeLineageEvent;
    }
  | {
      readonly status: "SUPERSEDED_AMBIGUOUS";
      readonly lexemeId: LexemeId;
      readonly successors: readonly LexemeId[];
      readonly via: LexemeLineageEvent;
    }
  | {
      readonly status: "RETIRED";
      readonly lexemeId: LexemeId;
      readonly via: LexemeLineageEvent;
    };

function cardinalityIssues(event: LexemeLineageEvent): LexicalIssue[] {
  const issues: LexicalIssue[] = [];
  const rule = LINEAGE_CARDINALITY[event.kind];

  const check = (
    actual: number,
    min: number,
    max: number | null,
    field: "sourceLexemeIds" | "targetLexemeIds",
  ): void => {
    if (actual >= min && (max === null || actual <= max)) return;
    const expected =
      max === null ? `>= ${min}` : min === max ? `${min}` : `${min}..${max}`;
    const what = field === "sourceLexemeIds" ? "source" : "target";
    issues.push(
      lexicalIssue(
        "LEXICAL_LINEAGE_CARDINALITY_INVALID",
        `${event.kind} requires ${expected} ${what} lexemes`,
        { recordId: event.id, field, expected, actual },
      ),
    );
  };

  check(
    event.sourceLexemeIds.length,
    rule.minSources,
    rule.maxSources,
    "sourceLexemeIds",
  );
  check(
    event.targetLexemeIds.length,
    rule.minTargets,
    rule.maxTargets,
    "targetLexemeIds",
  );

  // A lexeme on both sides of one event is a cycle of length one, which the
  // cardinality rules alone would not catch for a SPLIT or a MERGE.
  for (const source of event.sourceLexemeIds) {
    if (event.targetLexemeIds.includes(source)) {
      issues.push(
        lexicalIssue(
          "LEXICAL_LINEAGE_CYCLE",
          `lexeme ${source} is both a source and a target of ${event.id}`,
          { recordId: event.id, referencedId: source, path: [source, source] },
        ),
      );
    }
  }
  return issues;
}

function duplicateIssues(
  ids: readonly string[],
  recordId: string,
  field: string,
): LexicalIssue[] {
  const seen = new Set<string>();
  const issues: LexicalIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push(
        lexicalIssue(
          "LEXICAL_LINEAGE_CONFLICT",
          `lexeme ${id} is listed twice in ${field} of ${recordId}`,
          { recordId, referencedId: id, field },
        ),
      );
    }
    seen.add(id);
  }
  return issues;
}

const WHITE = 0;
const GREY = 1;
const BLACK = 2;

/**
 * Detect a cycle in the source -> target graph, returning the offending path.
 *
 * Iterative DFS with an explicit stack: a lineage set is small today, but
 * recursion depth should not be a load-bearing assumption for data that arrives
 * from outside the process.
 */
function findCycle(
  successorsOf: ReadonlyMap<string, readonly string[]>,
): readonly string[] | null {
  const colour = new Map<string, number>();
  for (const node of successorsOf.keys()) colour.set(node, WHITE);

  for (const start of successorsOf.keys()) {
    if (colour.get(start) !== WHITE) continue;
    const path: string[] = [start];
    const stack: { node: string; next: number }[] = [{ node: start, next: 0 }];
    colour.set(start, GREY);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const successors = successorsOf.get(frame.node) ?? [];
      if (frame.next >= successors.length) {
        colour.set(frame.node, BLACK);
        stack.pop();
        path.pop();
        continue;
      }
      const next = successors[frame.next];
      frame.next += 1;
      const state = colour.get(next) ?? WHITE;
      if (state === GREY) {
        // `next` is on the current path: the cycle runs from where it first
        // appears through to here and back.
        return [...path.slice(path.indexOf(next)), next];
      }
      if (state === WHITE) {
        colour.set(next, GREY);
        path.push(next);
        stack.push({ node: next, next: 0 });
      }
    }
  }
  return null;
}

export type LineageValidation = {
  readonly status: "PASS" | "FAIL";
  readonly issues: readonly LexicalIssue[];
};

/**
 * Validate a lineage set against a known lexeme universe.
 *
 * `knownLexemeIds` is the set of published lexemes. An empty set skips
 * reference checking, which is what pure-topology fixtures need; passing the
 * real registry ids is what production loading does.
 */
export function validateLineage(
  events: readonly LexemeLineageEvent[],
  knownLexemeIds: ReadonlySet<string>,
): LineageValidation {
  const issues: LexicalIssue[] = [];
  const seenEventIds = new Set<string>();
  const supersededBy = new Map<string, string>();

  for (const event of events) {
    if (seenEventIds.has(event.id)) {
      issues.push(
        lexicalIssue(
          "LEXICAL_DUPLICATE_ID",
          `lineage event ${event.id} is declared twice`,
          { recordId: event.id },
        ),
      );
    }
    seenEventIds.add(event.id);

    if (event.reason.trim() === "") {
      issues.push(
        lexicalIssue(
          "LEXICAL_LINEAGE_CARDINALITY_INVALID",
          `lineage event ${event.id} carries no reason`,
          { recordId: event.id, field: "reason" },
        ),
      );
    }

    issues.push(...cardinalityIssues(event));
    issues.push(
      ...duplicateIssues(event.sourceLexemeIds, event.id, "sourceLexemeIds"),
    );
    issues.push(
      ...duplicateIssues(event.targetLexemeIds, event.id, "targetLexemeIds"),
    );

    if (!ALLOWED_TRANSFER_POLICIES[event.semantics].has(event.transferPolicy)) {
      issues.push(
        lexicalIssue(
          "LEXICAL_TRANSFER_POLICY_INVALID",
          `${event.semantics} cannot carry transfer policy ${event.transferPolicy}`,
          {
            recordId: event.id,
            field: "transferPolicy",
            actual: event.transferPolicy,
          },
        ),
      );
    }

    if (knownLexemeIds.size > 0) {
      for (const id of [...event.sourceLexemeIds, ...event.targetLexemeIds]) {
        if (!knownLexemeIds.has(id)) {
          issues.push(
            lexicalIssue(
              "LEXICAL_REFERENCE_NOT_FOUND",
              `lineage event ${event.id} names unpublished lexeme ${id}`,
              { recordId: event.id, referencedId: id },
            ),
          );
        }
      }
    }

    // One lexeme cannot be superseded twice: its history would fork with no
    // way to say which branch is current.
    for (const source of event.sourceLexemeIds) {
      const previous = supersededBy.get(source);
      if (previous !== undefined) {
        issues.push(
          lexicalIssue(
            "LEXICAL_LINEAGE_CONFLICT",
            `lexeme ${source} is superseded by both ${previous} and ${event.id}`,
            { recordId: event.id, referencedId: source },
          ),
        );
      } else {
        supersededBy.set(source, event.id);
      }
    }
  }

  const successorsOf = new Map<string, string[]>();
  const touch = (id: string): string[] => {
    const existing = successorsOf.get(id);
    if (existing !== undefined) return existing;
    const created: string[] = [];
    successorsOf.set(id, created);
    return created;
  };
  for (const event of events) {
    for (const source of event.sourceLexemeIds) {
      const bucket = touch(source);
      for (const target of event.targetLexemeIds) {
        touch(target);
        bucket.push(target);
      }
    }
  }

  const cycle = findCycle(successorsOf);
  if (cycle !== null) {
    issues.push(
      lexicalIssue(
        "LEXICAL_LINEAGE_CYCLE",
        `lineage graph is cyclic: ${cycle.join(" -> ")}`,
        { path: cycle },
      ),
    );
  }

  return { status: issues.length === 0 ? "PASS" : "FAIL", issues };
}

/** A validated lineage set, queryable in both directions. */
export class LineageGraph {
  readonly events: readonly LexemeLineageEvent[];

  private readonly eventById: Map<string, LexemeLineageEvent>;
  private readonly eventBySource: Map<string, LexemeLineageEvent>;
  private readonly eventsByTarget: Map<string, LexemeLineageEvent[]>;

  constructor(events: readonly LexemeLineageEvent[]) {
    this.events = events;
    this.eventById = new Map(events.map((event) => [event.id, event]));
    this.eventBySource = new Map();
    this.eventsByTarget = new Map();
    for (const event of events) {
      for (const source of event.sourceLexemeIds) {
        this.eventBySource.set(source, event);
      }
      for (const target of event.targetLexemeIds) {
        const bucket = this.eventsByTarget.get(target);
        if (bucket === undefined) this.eventsByTarget.set(target, [event]);
        else bucket.push(event);
      }
    }
  }

  getEventById(id: string): LexemeLineageEvent | null {
    return this.eventById.get(id) ?? null;
  }

  /** Lifecycle implied by lineage alone. `ACTIVE` when nothing touched it. */
  lifecycleOf(lexemeId: string): LexemeLifecycleStatus {
    const event = this.eventBySource.get(lexemeId);
    if (event === undefined) return "ACTIVE";
    return lifecycleAfterEvent(event.kind);
  }

  /** Direct successors of a lexeme; empty for an active or retired one. */
  getSuccessors(lexemeId: string): readonly LexemeId[] {
    const event = this.eventBySource.get(lexemeId);
    if (event === undefined) return [];
    return event.targetLexemeIds;
  }

  /** Direct predecessors: every lexeme an event moved into this one. */
  getPredecessors(lexemeId: string): readonly LexemeId[] {
    const events = this.eventsByTarget.get(lexemeId) ?? [];
    const out: LexemeId[] = [];
    for (const event of events) out.push(...event.sourceLexemeIds);
    return out;
  }

  /**
   * What a published id means now.
   *
   * A SPLIT source always returns `SUPERSEDED_AMBIGUOUS`, even though every
   * successor is listed: the engine will not name one of them as *the* answer.
   */
  resolve(lexemeId: LexemeId): LineageResolution {
    const event = this.eventBySource.get(lexemeId);
    if (event === undefined) return { status: "ACTIVE", lexemeId };
    if (event.kind === "RETIRE") {
      return { status: "RETIRED", lexemeId, via: event };
    }
    if (event.targetLexemeIds.length === 1) {
      return {
        status: "SUPERSEDED_RESOLVABLE",
        lexemeId,
        successor: event.targetLexemeIds[0],
        via: event,
      };
    }
    return {
      status: "SUPERSEDED_AMBIGUOUS",
      lexemeId,
      successors: event.targetLexemeIds,
      via: event,
    };
  }
}
