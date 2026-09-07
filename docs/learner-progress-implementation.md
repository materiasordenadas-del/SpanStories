# Learner Event / Progress Engine — implementation notes (engine phase 4)

An event-first, append-only, reconstructible record of learner interaction,
built over the phase-3 Story Engine (for `StoryVersionId`/`StoryOccurrenceId`
and occurrence reannotation) and the phase-2 lexical engine (for lineage-aware
attribution).

```text
Curriculum release   A1-CURRICULUM-v1.51   (active baseline, unchanged)
Lexicon release       A1-LEXICON-v1.0      (active baseline, unchanged)
Learner Progress      phase 4, no release id of its own — it is code, not data
```

---

## 1. What this layer adds

| Type | Role |
| --- | --- |
| `LearnerEvent` (`OCCURRENCE_OPENED` \| `STATE_DECLARED`) | Immutable historical truth; frozen at construction |
| `LearnerEventRepository` / `InMemoryLearnerEventRepository` / `LocalStorageLearnerEventRepository` | Append-only log, two adapters, one contract |
| `DeclaredStateProjection` | Latest self-reported `NEW`/`LEARNING`/`KNOWN` per Lexeme |
| `ContextHistoryProjection` | Every encounter, kept individually |
| `ProgressProjection` | Story/Island/Module coverage + evidence + declared state (`computedMastery` always `null`) |
| `LearnerEventAttribution` | Historical event re-read against the *current* lexicon release |
| `ProjectionMetadata` | `projectionAlgorithmVersion`/`curriculumReleaseId`/`lexiconReleaseId`/`eventCutoff`/`calculatedAt` on every projection |

`event != current state` runs through every design choice below: nothing in
`domain/` is a place to write "the learner currently knows X." That is always
a fold, computed on demand, over the append-only log.

---

## 2. Design decisions and why

### 2.1 The event union is closed to two members, not "extensible" in the type system

The brief lists `RECOGNITION_ATTEMPTED`, `PRODUCTION_FAILED`,
`EXERCISE_ANSWERED` and others as future MVP+ event kinds, and says their
"full logic" need not be implemented now. A `LearnerEventType` string literal
union with unused members and no branch anywhere that reads them would be
exactly the "half-finished implementation" the project's own engineering
guidance forbids — dead code with a plausible-looking name. `domain/events.ts`
ships `OCCURRENCE_OPENED` and `STATE_DECLARED` only; adding a real kind later
is one new union member plus one new branch in `engine/ordering.ts` and
whichever projection needs to read it — documented inline, not stubbed out in
advance.

### 2.2 Events are `Object.freeze`d, not just `readonly`-typed

TypeScript's `readonly` is compile-time only; nothing stops a caller with a
type assertion (or plain JS) from mutating a "historical" event in place.
`engine/record-event.ts` freezes every event it constructs, so an accidental
in-place edit throws a `TypeError` in strict mode (which every ES module here
already runs under) instead of silently rewriting history. Tested in
`__tests__/events.test.ts`.

### 2.3 Ordering ties break on `eventId`, not on insertion order

`occurredAt` alone is not a total order — a batch import or a fast
double-tap can share a timestamp to the millisecond. `engine/ordering.ts`
breaks ties with a plain string comparison on `eventId`. This is not
"insertion order preserved": it is a *fixed* order that does not depend on
which repository, or which run, happened to store the events in which
sequence — the property rebuildability actually needs. Tested with two
events sharing an instant in `__tests__/events.test.ts`.

### 2.4 `LocalStorageLearnerEventRepository` never imports `window`

The brief requires the domain to never import `window`/`localStorage`. The
adapter that actually persists to `localStorage` still doesn't import it
directly: `repository/local-storage-learner-event-repository.ts` depends on
`StorageLike` (the two Web Storage methods it uses), and the call site
decides what to pass — `window.localStorage` in the browser, a fake object in
`__tests__/repository.test.ts`. This is one level stricter than the brief
asked for and is what let the exact same contract-test suite run against
both adapters in Node with no DOM.

### 2.5 Attribution is a pure read; the event log is never touched by it

`resolveAttribution` (§4) takes an event and returns an answer — it never
appends, mutates or removes anything. "A merge never copies events" and "a
split never duplicates evidence" are therefore true by construction, not by
discipline: there is no code path in this feature that writes to a
`LearnerEventRepository` except `append`/`appendValidatedEvent`, and
attribution doesn't call either.

### 2.6 `computedMastery: null` is a real field, not an absent one

The brief forbids inventing a mastery formula, using `KNOWN` as mastery, or
using exposure count as mastery — but also requires that progress "distinguish
at least" four dimensions including computed mastery. `domain/progress.ts`
resolves this literally: `computedMastery` is a typed field on
`StoryProgress`/`IslandProgress`/`ModuleProgress`, always `null` in phase 4.
A future phase adds a formula by changing what the field can hold, not by
inventing a new shape elsewhere — and no test, and no code path, derives it
from `targetsWithEvidence` or `targetsDeclaredKnown`.

### 2.7 Referential corruption is caught by a service, not by the repository

A `LearnerEventRepository` is deliberately a dumb, append-only store (§3): it
has no way to know whether a `StoryVersionId` it's handed actually exists.
`engine/append-event.ts`'s `validateLearnerEvent`/`appendValidatedEvent` is
the layer that checks an event's `storyVersionId` and (when present)
`occurrenceId` against a real `StoryRepository` before the event becomes
permanent history — corruption caught once, here, rather than silently
poisoning every projection built from the log afterwards.

---

## 3. `LearnerEventRepository` — no update, no delete, by design

Same mechanism as `features/story-engine/repository/story-repository.ts`:
the interface has exactly `append`/`getById`/`listForLearner`/
`listForLearnerAndLexeme`/`listForStoryVersion`. There is no `update`, no
`delete`. `__tests__/repository.test.ts` asserts this at the object level
(`"update" in repo === false`) in addition to it being true at the type
level, and runs the identical contract suite against
`InMemoryLearnerEventRepository` and `LocalStorageLearnerEventRepository`
(backed by a fake `StorageLike` in tests). A future administrative erasure
for privacy is explicitly a different, out-of-band operation — not a method
either adapter exposes to a normal caller.

---

## 4. Attribution — resolution order and why each tier exists

`engine/attribution-engine.ts`'s `resolveAttribution`, in order:

1. **Occurrence reannotation.** If the event names a Story Engine occurrence
   and that occurrence has an `OccurrenceAnnotationRevision` whose effective
   lexeme (`effectiveAnnotationOf`) differs from what the event recorded,
   that wins — `BY_OCCURRENCE`. Editorial correction of a specific
   occurrence is more specific than any lexicon-wide lineage fact.
2. **Lineage graph, unambiguous cases.** `LexicalEngine.resolveLineage`:
   `ACTIVE` -> `EXACT`; `RETIRED` -> `UNATTRIBUTED` (no successor to credit);
   `SUPERSEDED_RESOLVABLE` (exactly one successor) -> `BY_EQUIVALENT_MERGE`
   *unless* the event is a `MERGE` under `COARSENING` semantics, in which
   case it is `UNATTRIBUTED` — a coarsening merge admits the sources denoted
   genuinely different things, so crediting former evidence to the coarser
   identity is not licensed automatically (§2.6 of the brief's transfer-policy
   table backs this: `COARSENING` never allows `FULL_EQUIVALENT`).
3. **Sense lineage, for an ambiguous split.** `SUPERSEDED_AMBIGUOUS` reports
   every successor and elects none (this is `LineageGraph`'s own rule,
   phase 2). If the event also recorded a `SenseId`, and that sense's
   *current* lexeme (`LexicalEngine.getLexemeForSense`) is one of the
   reported successors, that disambiguates it — `BY_SENSE`. This is possible
   because a Sense's `lexemeId` in the registry reflects where curriculum
   authority currently places it, independent of what the lexeme-lineage
   graph alone can say about an old, now-ambiguous id.
4. **`AMBIGUOUS_LEGACY`.** No sense recorded, or the sense doesn't
   disambiguate: several candidates exist and nothing says which one this
   evidence belongs to. `ambiguousCandidates` lists them; `effectiveLexemeId`
   is `null` — no candidate is picked by default.

`UNATTRIBUTED` also covers an event that recorded no lexeme at all, and one
naming a lexeme the current registry does not publish.

`__tests__/attribution.test.ts` exercises every status against real published
ids (`LEX-A1-000260` split into `LEX-A1-000261`/`LEX-A1-000584`, disambiguated
by `SENSE-A1-000265`, which the real registry currently assigns to
`LEX-A1-000261` — same "lineage over published ids" convention
`features/lexical-engine/__tests__/lineage.test.ts` uses), plus the two
negative-space claims the brief calls out by name: a split never attributes
to more than one candidate, and a merge never duplicates the underlying
event.

---

## 5. Projections — what "rebuildable" actually means here

Every `build*Projection` function in `engine/` is a pure function: event log
in, projection out, no persisted intermediate anywhere it could drift from
the log. `__tests__/rebuildability.test.ts` computes all three projections
twice from the same `InMemoryLearnerEventRepository`, under two different
`calculatedAt` values, and asserts `withoutCalculatedAt(a)` deep-equals
`withoutCalculatedAt(b)` — proving the *only* field a rebuild is allowed to
change actually is the only one that changed.

`ProgressProjection` walks `CurriculumRegistry.getTargetsIntroducedIn` per
story — the same authority `features/story-engine`'s publication validator
uses — rather than maintaining a second copy of "which targets does this
story introduce." As of the addendum in §9, a target counts as having
evidence when `TargetEvidenceProjection.evidenceByTarget` has an entry for
its `targetId`, for **all three** target types — not only `SENSE` targets
with a lexeme.

---

## 6. Regression status

```text
npm run curriculum:check   PASS  (all invariants, unchanged)
npm test                   PASS  263/263 (217 phases 1-3 + 46 phase 4)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 pre-existing warning
npm run build              PASS
```

The single lint warning is pre-existing and out of scope (same
`_ds_bundle.js` warning phases 1-3 already recorded). No new warnings were
introduced. One lint **error** class did come up during development —
`@next/next/no-assign-module-variable` on a test loop variable named
`module` — and was fixed by renaming to `learnerModule`, the same avoidance
`features/curriculum/registry/query.ts` already documents for exactly this
Next.js lint rule.

---

## 7. Deliberately not done

Spaced repetition, an adaptive recommender, a computed mastery formula,
PostgreSQL persistence (phase 5), auth, or any UI change. No file under
`components/visual/baseline-v1/` was touched.

An administrative, privacy-driven erasure path for `LearnerEvent` data is
explicitly out of scope: `docs/architecture/plan-implementacion-motor-v1.0.md`
§"Seguridad de datos" allows documenting the policy for a later phase without
building it now, and this implementation takes that option — the append-only
contract stays intentionally strict for every normal caller.

---

## 8. Addendum (phase 5): `LearnerEventRepository` is now `Promise`-based

Same change, same reason, as `features/story-engine`'s repository (see
`docs/story-engine-implementation.md` §9): phase 5 needed a real
PostgreSQL-backed `LearnerEventRepository`, which cannot answer
synchronously. Every method on the interface
(`repository/learner-event-repository.ts`), on
`InMemoryLearnerEventRepository`, and on `LocalStorageLearnerEventRepository`
now returns a `Promise`; `engine/append-event.ts`'s
`validateLearnerEvent`/`appendValidatedEvent` are `async` for the same
reason. No event shape, projection, or attribution rule changed.
`features/persistence`'s `PostgresLearnerEventRepository` implements the
identical interface — see `docs/persistence.md`.

---

## 9. Addendum (deuda A): `TargetEvidence` for all 985 targets

Before this addendum, `ProgressProjection`'s `hasEvidence` check worked only
for `SENSE` targets carrying a `lexemeId` — the 214 `MWU_SOURCE_UNIT` and 169
`GRAMMAR_UNIT` targets (383 of 985, including all 170 MWUs with
`NO_LEXICAL_IDENTITY`) could never show evidence, no matter how many times a
learner encountered them. `docs/architecture/plan-implementacion-motor-v1.0.md`
requires the progress engine to represent all 985 targets homogeneously
without collapsing `Sense != MWU != GrammarUnit`; this addendum closes that
gap.

### 9.1 `TargetEvidence` — a closed, discriminated union, not a `Lexeme` shape

`domain/target-evidence.ts` defines `SenseTargetEvidence` /
`MwuTargetEvidence` / `GrammarTargetEvidence` as three distinct members of one
union, mirroring `TargetType`. A `MwuTargetEvidence`/`GrammarTargetEvidence`
carries no `lexemeId` field at all — not `null`, absent from the type — so
there is no way to accidentally read a `Lexeme` identity off evidence for a
target that legitimately has none. `TargetEvidence != mastery`: it records
that >= 1 event evidences this exact target, nothing about how well the
learner knows it.

### 9.2 Two resolution paths, never merged into one

`engine/target-evidence-projection.ts`'s `buildTargetEvidenceProjection`
keeps `SENSE` and `MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` on separate, independent
paths:

- **`SENSE` -> lexeme attribution, byte-for-byte the pre-existing behaviour.**
  An `OCCURRENCE_OPENED` event with a non-null `recordedLexemeId` evidences
  *every* `SENSE` target sharing that lexeme — the same lexeme-level (not
  sense-exact) granularity `ProgressProjection` always had. This is a
  deliberate compatibility decision, not an oversight: narrowing it to
  sense-exact matching would change `targetsWithEvidence` counts for every
  existing test and fixture, and the brief explicitly asks to keep this path
  unchanged (§6 "no romper lineage-aware attribution"). Lineage-aware
  reattribution (`engine/attribution-engine.ts`) is untouched — it operates
  on the event's `recordedLexemeId` upstream of this projection and nothing
  here changes what it resolves to.
- **`MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` -> `StoryTargetBinding`, resolved from
  the event's `occurrenceId`.** No `Lexeme` involved at any point — correct
  for the 170 MWUs and 169 grammar units that have none.
  `indexTargetBindingsByOccurrence` builds an
  `occurrenceId -> StoryTargetBinding[]` map once per projection build (the
  caller supplies the bindings — typically every `StoryTargetBinding` on the
  `StoryVersion`s the learner's events reference); for each event, only the
  bindings on that exact occurrence are consulted, and only non-`SENSE`
  bindings are turned into evidence (a `SENSE` binding on the same occurrence
  is left to the lexeme path, so it is never double-resolved).

A `SENSE` target's evidence therefore never touches a `StoryTargetBinding`,
and an `MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` target's evidence never touches a
`Lexeme` — provably, by construction, not by convention: the two code paths
share no function.

### 9.3 `createStoryTargetBindingEvidence` fails loudly on corrupt input

Same convention as `CurriculumRegistry.getFirstIntroduction` and
`features/story-engine/engine/target-binding.ts`: resolving one
`MwuTargetEvidence`/`GrammarTargetEvidence` record is a pure, *throwing*
function, not one that silently drops a bad record from the projection.
Three distinct failure modes, each with its own error code and test:

- `TARGET_EVIDENCE_UNKNOWN_TARGET` — the binding names a `targetId` the
  registry does not publish.
- `TARGET_EVIDENCE_BINDING_MISMATCH` — the binding's `occurrenceId`/
  `storyVersionId` does not match the event being resolved (a caller passed
  the wrong pair).
- `TARGET_EVIDENCE_TARGET_TYPE_MISMATCH` — the binding claims a `targetType`
  that disagrees with what the registry actually publishes for that
  `targetId`.

A `SENSE` binding reaching this function at all is also rejected
(`TARGET_EVIDENCE_SENSE_VIA_BINDING_UNSUPPORTED`): `SENSE` evidence must come
from lexeme attribution, never from a binding, by design (§9.2).

### 9.4 `ProgressProjection` grew a per-type breakdown, not a second boolean

`buildProgressProjection`'s signature changed: it now takes a
`TargetEvidenceProjection` instead of a `ContextHistoryProjection` (the
latter still exists, unchanged, for its own purpose — "studied contexts" —
and is no longer progress's concern). `TargetCoverage` gained a `targetType`
field, and `StoryProgress`/`IslandProgress`/`ModuleProgress`/
`ProgressProjection` all gained a `breakdown: TargetTypeBreakdown` —
`{ SENSE, MWU_SOURCE_UNIT, GRAMMAR_UNIT, total }`, each a
`{ total, withEvidence, withoutEvidence }`. Every scope can now answer, per
type and overall: how many targets exist, how many have evidence, which ones
are missing (filter `targets` by `hasEvidence === false`) — without ever
computing a percentage or a mastery figure. `computedMastery` stays `null`
everywhere; `KNOWN` stays a declared state, never derived from evidence
count.

### 9.5 Structural coverage gate

`__tests__/target-evidence.test.ts` asserts, over the real committed
`A1-CURRICULUM-v1.51` registry with an empty event log, that
`ProgressProjection.breakdown` reports exactly 602 `SENSE`, 214
`MWU_SOURCE_UNIT`, 169 `GRAMMAR_UNIT` and 985 total — the progress engine
*understands* every published target, independent of whether any learner has
evidence for it yet.

```text
PROGRESS_ALL_TARGET_TYPES        PASS
CURRICULAR_TARGET_MODEL_COVERAGE 985/985  (602 SENSE + 214 MWU_SOURCE_UNIT + 169 GRAMMAR_UNIT)
npm run curriculum:check         PASS  (unchanged)
npm test                         PASS  312/312 (294 phases 1-5 + 18 deuda A)
npm run typecheck                PASS
npm run lint                     PASS  0 errors, 1 pre-existing warning
npm run build                    PASS
```
