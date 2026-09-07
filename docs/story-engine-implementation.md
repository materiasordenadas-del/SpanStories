# Story Engine — implementation notes (engine phase 3)

A versioned, publishable domain for narrative content and its lexical/
grammatical annotations, built over the phase-1 curriculum registry and the
phase-2 lexical engine.

```text
Curriculum release   A1-CURRICULUM-v1.51   (active baseline, unchanged)
Lexicon release       A1-LEXICON-v1.0      (active baseline, unchanged)
Story Engine          phase 3, no release id of its own — it is code, not data
```

Phase 3 introduces no new curriculum or lexicon release: it adds an engine
layer over the existing two, and mints its own technical (non-curricular) id
namespace for `Story`, `StoryVersion`, `TextAnchor` and friends.

---

## 1. What this layer adds

| Type | Role |
| --- | --- |
| `Story` | Stable narrative identity; references a `StoryBlueprintId` or is a technical fixture (`null`) |
| `StoryVersion` | Immutable snapshot of published content; new text is always a new version |
| `StorySentence` | Exact, unmodified contextual text of one sentence |
| `SurfaceToken` | Segmentation unit — deliberately not a lexical one |
| `TextAnchor` | A stable `[start, end)` code-point interval into one sentence |
| `StoryOccurrence` (`LEXICAL`/`CONSTRUCTION`) | A concrete, contextualised instance of a Lexeme or a productive construction |
| `OccurrencePart` | One surface fragment of an occurrence (`HEAD`/`FIXED`/`CLITIC` or `ANCHOR`/`SLOT`) |
| `OccurrenceAnnotationRevision` | Reannotation history; the occurrence's id never changes |
| `StoryTargetBinding` | Connects a Story to the curricular scheduling event it satisfies |
| `validateStoryPublication` | The publication gate — textual, lexical and curricular integrity |
| `StoryRepository` / `InMemoryStoryRepository` | The persistence contract phase 5 will implement against PostgreSQL |

`Story != StoryBlueprint`: the two are never assumed to share an id, and the
Story Engine's own ids use a fixed lowercase prefix per kind (`story-`,
`storyver-`, `anchor-`, ...) that cannot collide with a published curriculum
id (`LEX-A1-*`, `A1-M01-I05-S1`, `SEQ-A1-*`, all uppercase). See
`domain/ids.ts`.

---

## 2. Design decisions and why

### 2.1 `TextAnchor` offsets are Unicode code points, not UTF-16 code units

JavaScript strings are UTF-16 internally: `"a".length` and
`[...text].length` disagree for any character outside the Basic Multilingual
Plane. Every character this curriculum actually uses (`ñ`, `á`, `¿`, `¡`) is
in the BMP and both units would agree — but phase 6 hands these offsets to
Python, where `str` is already indexed by code point. Choosing code points now
is what makes an anchor mean the same interval on both sides of that
language boundary, rather than "whatever `.slice()` happened to do in
JavaScript." `domain/anchors.ts` documents and tests this; `anchors.test.ts`
includes an astral character (an emoji, one code point but two UTF-16 units)
to prove the distinction actually matters, not just in principle.

Intervals are half-open (`[start, end)`), matching `docs/lexical-engine.md`
§8A.

### 2.2 `Story.storyBlueprintId` is nullable

Section 6.2 of `docs/architecture/plan-implementacion-motor-v1.0.md` forbids
assuming `StoryBlueprintId == StoryId`, and section 14 forbids inventing a
mapping from the legacy `La compra olvidada` fixture onto one of the 32
published blueprints. The only way to satisfy both — a `Story` can exist
without curricular authority, but curricular authority is still enforced at
publish time — is a nullable field plus a validator rule
(`STORY_HAS_NO_BLUEPRINT`) that refuses to publish one with no blueprint.
`fixtures/la-compra-olvidada.ts` and `__tests__/legacy-fixture.test.ts`
demonstrate this end-to-end: the fixture builds fully with the phase-3 engine
and is provably unpublishable as curricular content.

### 2.3 Occurrence kinds: `LEXICAL` vs `CONSTRUCTION`

`docs/lexical-engine.md` §9A distinguishes a real lexical identity
(`HEAD`/`FIXED`/`CLITIC`) from a productive grammatical pattern
(`ANCHOR`/`SLOT`) that is not itself a Lexeme. Modelling both as one shape
with an optional `lexemeId` would let a construction accidentally acquire a
fake lexical identity, or a lexical occurrence silently skip having one.
A discriminated union (`kind: "LEXICAL" | "CONSTRUCTION"`) makes the two
mutually exclusive at the type level; `createLexicalOccurrence` and
`createConstructionOccurrence` each reject the other kind's roles
(`PART_ROLE_INVALID_FOR_KIND`).

### 2.4 `OccurrencePart.order` is derived, never trusted from input

Parts may be supplied in any order; `buildParts` (in
`engine/story-service.ts`) always sorts by the resolved anchor's `start` and
re-numbers `order` from that, so "surface order is stable" is true by
construction rather than by caller discipline. The overlap check runs on the
same sorted list, so `PART_OVERLAP` and ordering can never disagree with each
other.

### 2.5 `StoryTargetBinding.productiveClaim` — a new, deliberately narrow field

Section 13 requires that "a regional-receptive target never acquires a
universal productive demand," but `CurriculumTarget.expectedProductive` is
curriculum's own baseline and the Story Engine must not — and does not —
override it. `productiveClaim` (`NONE`/`CONTEXTUAL`/`UNIVERSAL`) is a
separate, Story-Engine-local annotation: an editorial claim that *this
occurrence* demonstrates productive use, capped by the validator so it can
never exceed what a regional target is allowed to claim
(`TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM`). It does not change or shadow
any curriculum field.

### 2.6 Construction/deserialization vs. publication validation are two different passes

`engine/story-service.ts`'s constructors (`createTextAnchor`,
`createLexicalOccurrence`, ...) validate structural invariants immediately and
throw `StoryEngineError` — useful for catching a bug the moment code tries to
build a bad object. `validation/publication-validator.ts` re-derives the same
textual checks from the stored data (so it catches a defect regardless of how
the data got there — hand-built, deserialized, or reconstructed from
PostgreSQL in phase 5) and adds every cross-referential check against the
curriculum/lexical registries that a pure constructor cannot perform without
them. Neither replaces the other.

### 2.7 Clock/IdGenerator are ports, not ambient calls

`Date.now()` or `crypto.randomUUID()` called directly inside a domain
function would make two publishes of identical content produce different
output, so a determinism test could only ever compare "everything except a
timestamp" by convention. `domain/ports.ts` declares `Clock`/`IdGenerator`;
every constructor that needs one takes it as a parameter.
`__tests__/determinism.test.ts` asserts full `JSON.stringify` equality between
two independent builds of the same story under the same injected clock and id
generator — not an approximate comparison.

---

## 3. `StoryRepository` — no update, no delete, by design

`repository/story-repository.ts` has exactly one write path for content:
`saveNewVersion`. There is no `updateVersion`, no `updateOccurrence`. A
published `StoryVersion`'s text is immutable not because a runtime check
forbids editing it (there is one, `markPublished`'s title/text guard, but
that is a safety net) — it is immutable because the interface never offers a
way to. New text is always a new `StoryVersionId`, saved alongside its own
sentences, anchors, occurrences and bindings in one call.
`InMemoryStoryRepository` is a pure in-memory adapter for tests and early
development; phase 5 implements the same interface against PostgreSQL, and
contract tests will run unchanged against both.

---

## 4. Publication Validator — what it checks

`validateStoryPublication` never throws; a corrupt input produces a complete
`{status: "INVALID", issues: [...]}` report, not a partial one and not an
exception a caller has to unwrap. It checks, in order:

1. **Textual integrity** — every anchor resolves within its sentence's
   bounds; every part's anchor exists; no two parts of one occurrence
   overlap; a `LEXICAL` occurrence has a `HEAD`, a `CONSTRUCTION` one has an
   `ANCHOR`.
2. **Lexical integrity** — the occurrence's `lexemeId` resolves
   (`LEXEME_NOT_FOUND` otherwise); its `senseId`, if declared, resolves and
   belongs to that lexeme (`SENSE_NOT_FOUND` / `SENSE_LEXEME_MISMATCH`); its
   `lexemeFormId`, if declared, resolves (`FORM_NOT_FOUND` — never fabricated
   if absent); a non-A1 (`A2_BOUNDARY_NOT_A1`) sense cannot be used
   (`A2_BOUNDARY_PUBLISHED_AS_A1`).
3. **Curricular integrity** — the Story's blueprint exists in the active
   release (`STORY_HAS_NO_BLUEPRINT` / `STORY_BLUEPRINT_NOT_FOUND`); every
   binding names a real target (`TARGET_BINDING_TARGET_NOT_FOUND`) that is
   actually scheduled in *this* story, at the *right* stage
   (`TARGET_BINDING_STORY_MISMATCH` / `TARGET_BINDING_KIND_MISMATCH`), with
   the *right* salience for a first introduction
   (`TARGET_BINDING_SALIENCE_MISMATCH` — `SUPPORTED` is still a first
   introduction, never a return); a regional target's binding never claims
   `UNIVERSAL` productive demand
   (`TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM`); every target the
   curriculum schedules to introduce or return here has a matching binding
   (`MISSING_REQUIRED_TARGET_BINDING`).

`__tests__/publication-validator.test.ts` exercises every code above, plus a
full end-to-end case: `buildFullyBoundStory` (in `__tests__/fixtures.ts`)
programmatically satisfies every first-introduction and return obligation of
a real story blueprint (`A1-M01-I05-S1`, the first story in the canonical
sequence — chosen because it has zero incoming returns, keeping the fixture
to 33 generated occurrences instead of the ~90+ a mid-sequence story would
need) and asserts the result is `VALID`. The occurrences it generates are
technical placeholders (`"Contexto tecnico para <targetId>."`), not real
narrative prose — authoring the 32 canonical stories is explicitly out of
scope for phase 3.

---

## 5. The legacy fixture

`content/a1/module-1/island-1/story-1.ts` ("La compra olvidada") is untouched.
`features/story-engine/fixtures/la-compra-olvidada.ts` is a **new** module
that rebuilds its two most structurally interesting examples — a contiguous
occurrence (`"fue"`) and a discontinuous one (`"se dio [finalmente] cuenta"`)
— using the phase-3 engine's own constructors, with `Story.storyBlueprintId`
set to `null`. `__tests__/legacy-fixture.test.ts` proves three things: the
engine reproduces the discontinuity, the fixture's ids
(`lex-ir`, `lex-darse-cuenta`) share no namespace with `LEX-A1-*`, and the
publication validator refuses to publish it as curricular
(`STORY_HAS_NO_BLUEPRINT`). No `BLOCKER_ID_COLLISION`: the technical-id prefix
scheme (§1) makes a collision with a published id impossible by construction,
independent of this specific fixture.

`lib/lexical-prototype.ts` and `components/story-reader.tsx` remain exactly as
they were — retiring them is a UI-adapter decision phase 3 does not make (see
`docs/architecture/plan-implementacion-motor-v1.0.md` §"No rediseñar UI").

---

## 6. Corruption and determinism coverage

Corruption (`__tests__/corruption.test.ts`, plus dedicated cases inside
`occurrences.test.ts`, `construction-occurrences.test.ts` and
`publication-validator.test.ts`):

1. A technical id with the wrong prefix is rejected (`asId`), never coerced.
2. An anchor past the end of its sentence throws (`ANCHOR_OUT_OF_BOUNDS`).
3. An inverted or empty anchor throws (`ANCHOR_EMPTY_OR_INVERTED`).
4. Overlapping parts within one occurrence are rejected (`PART_OVERLAP`).
5. Zero parts on an occurrence are rejected (`OCCURRENCE_EMPTY`).
6. A `LEXICAL` occurrence with no `HEAD`, or `CONSTRUCTION` with no `ANCHOR`,
   is rejected (`OCCURRENCE_MISSING_REQUIRED_ROLE`).
7. A role foreign to an occurrence's kind is rejected
   (`PART_ROLE_INVALID_FOR_KIND`).
8. A `SLOT` part with no label, or a non-`SLOT` part with one, is rejected
   (`SLOT_LABEL_INVALID`).
9. Publishing a version twice is rejected
   (`STORY_VERSION_ALREADY_PUBLISHED`).
10. Saving a version under a reused id is rejected, not merged
    (`DUPLICATE_STORY_VERSION_ID`).
11. `markPublished` cannot change text or title
    (`STORY_VERSION_TEXT_IMMUTABLE`).
12. Every publication-validator issue code in §4 is exercised by an explicit
    failing fixture.
13. A failed construction never reaches the repository — nothing partial is
    ever written, because assembly happens fully before the one
    `saveNewVersion` call.

Determinism (`__tests__/determinism.test.ts`): two independent builds of the
same real story blueprint, under the same injected `Clock`/`IdGenerator`,
serialize to byte-identical JSON.

---

## 7. Regression status

```text
npm run curriculum:check   PASS  (all invariants, unchanged)
npm test                   PASS  217/217 (160 phases 1-2 + 57 phase 3)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 warning
npm run build              PASS
```

The single lint warning is pre-existing and out of scope:
`components/visual/baseline-v1/_ds/modernist-.../\_ds_bundle.js:7:7`,
`'__ds_scope' is assigned a value but never used`. No new warnings were
introduced.

---

## 8. Deliberately not done

The 32 canonical A1 stories are not authored — `buildFullyBoundStory`'s
generated occurrences are technical placeholders for testing the engine, not
narrative content, and are never treated as published Story content anywhere.
No `LearnerEvent`, mastery, spaced repetition, NLP, automatic Story
generation, PostgreSQL persistence, or UI change exists. No file under
`components/visual/baseline-v1/` was touched.

`SurfaceToken` is modelled (segmentation, not lexical identity) but nothing in
phase 3 yet populates it from the sentences built here — occurrences anchor
directly into sentence text, which is sufficient for every phase-3 test
including the discontinuous cases. Token-level structure is available for
phase 6 to populate without changing `StorySentence`'s shape.

`StoryTargetBinding`'s cross-check against `MWU_SOURCE_UNIT`/`GRAMMAR_UNIT`
target types confirms the binding is well-formed and correctly scheduled, but
— unlike `SENSE` targets — does not verify the bound occurrence's own
`lexemeId`/`constructionId` actually realises that specific MWU or grammar
unit. Tightening this is straightforward (the registry already resolves both)
but was left for whichever phase first authors real Story content against a
non-`SENSE` target, since MVP does not require it and no test needs it yet.

---

## 9. Addendum (phase 5): `StoryRepository` is now `Promise`-based

Phase 5 (`docs/persistence.md`) needed to implement `StoryRepository`
against PostgreSQL, which cannot answer synchronously. Every method on the
interface (`repository/story-repository.ts`) and on
`InMemoryStoryRepository` was converted to return a `Promise` — a call-site
mechanical change (`await` added wherever the repository is used), not a
change to any type's shape, invariant, or this document's design rationale
above. `features/persistence`'s `PostgresStoryRepository` implements the
exact same interface; contract tests run unchanged assertions against both
(`features/persistence/__tests__/contract-parity.test.ts`).
