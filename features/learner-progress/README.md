# Learner Progress feature (engine phase 4)

An event-first, append-only, reconstructible record of learner interaction,
plus the projections derived from it. See
`docs/learner-progress-implementation.md` for the full design rationale; this
file is the short orientation.

## Public boundary

Import from [`index.ts`](./index.ts). The file layout below it (`domain/`,
`engine/`, `repository/`, `runtime/`) is not a contract.

## What phase 4 is

```text
LearnerEvent (OCCURRENCE_OPENED | STATE_DECLARED)
      |  append-only, immutable, frozen
      v
LearnerEventRepository  (no update, no delete — by interface, not convention)
      |
      +--> DeclaredStateProjection    (latest STATE_DECLARED per Lexeme)
      +--> ContextHistoryProjection   (every OCCURRENCE_OPENED, never collapsed to a count)
      +--> ProgressProjection         (content coverage + evidence + declared state;
      |                                computedMastery is always null — no formula yet)
      v
LearnerEventAttribution
  (reads a historical event against the *current* LexiconRelease:
   EXACT / BY_OCCURRENCE / BY_SENSE / BY_EQUIVALENT_MERGE /
   AMBIGUOUS_LEGACY / UNATTRIBUTED)
```

- **`event != current state`.** Nothing in `domain/` is a mutable "current
  state" record; every projection is a pure fold over the event log, rebuilt
  on demand.
- **`NEW`/`LEARNING`/`KNOWN` are `USER_DECLARED_STATE`**, never
  `COMPUTED_MASTERY`. See `domain/declared-state.ts`.
- **A split never duplicates evidence.** An ambiguous lineage split
  contributes to at most one candidate (`BY_SENSE` or `AMBIGUOUS_LEGACY`),
  never both. See `engine/attribution-engine.ts`.
- **A merge never copies events.** The event log is unchanged by attribution;
  only what a projection concludes from it changes.
- **Ordering is total, even on a tie.** Two events sharing `occurredAt` still
  sort the same way on every rebuild — see `engine/ordering.ts`.
- **Every reconstructible projection carries `ProjectionMetadata`**
  (`projectionAlgorithmVersion`, `curriculumReleaseId`, `lexiconReleaseId`,
  `eventCutoff`, `calculatedAt`). Compare two projections' *content* with
  `withoutCalculatedAt`, the only field allowed to differ between two
  rebuilds of the same log.

## What phase 4 does not do

Spaced repetition, an adaptive recommender, a computed mastery formula,
PostgreSQL persistence, auth, or any UI. See
`docs/architecture/plan-implementacion-motor-v1.0.md` §6.

## Tests

`__tests__/*.test.ts`, run via `npm test`. Attribution/progress tests assert
against the real committed `A1-CURRICULUM-v1.51` registry and
`A1-LEXICON-v1.0` engine (same convention as `features/curriculum`,
`features/lexical-engine` and `features/story-engine`); repository contract
tests run the identical suite against both `InMemoryLearnerEventRepository`
and `LocalStorageLearnerEventRepository`.
