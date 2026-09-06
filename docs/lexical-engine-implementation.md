# Lexical Engine — implementation notes (engine phase 2)

Canonical lexical identity over the phase-1 curriculum registry.

```text
Lexical interpretation release   A1-LEXICON-v1.0
Validated curriculum registry    A1-CURRICULUM-v1.51   (active baseline)
```

Originally built on `prueba` from `e8f482c` over curriculum release
`A1-CURRICULUM-v1.44`, and revalidated unchanged against `A1-CURRICULUM-v1.51`
after the 103 → 32 restructure. The lexicon release id did **not** change:
resequencing the narrative altered no lexeme, form, sense, MWU identity or
homograph group. `A1-CURRICULUM-v1.44` is historical and is not the active
curriculum baseline.

---

## 1. What this layer adds

The registry already resolves `Lexeme`, `LexemeForm`, `Sense`, `MwuUnit`,
`GrammarUnit` and `SourceAssertion` by published id. Phase 2 does not repeat
any of that. It adds four things the curriculum layer has no reason to model:

| Addition | Why it is not in phase 1 |
| --- | --- |
| Identity annotations (lifecycle, pronominality) | The curriculum publishes what is taught, not how identity evolves |
| Homograph groups | Form collision is a lexical observation, not a curricular decision |
| Typed lexical relations | Same |
| Lineage (`SPLIT`/`MERGE`/`REPLACED_BY`/`RETIRE`) | The A1 release has no identity history yet |

Everything else is delegated. `getCurricularAssertionsForSense` forwards to the
registry; the engine has no code path that could derive a CEFR level.

---

## 2. Audit findings

Recorded before any code was written, each verified against
`generated/curriculum/a1`.

### 2.1 `docs/lexical-engine.md` does not exist

The phase brief lists it as authority 5. It is absent from the repository. Not
a contradiction — an absent authority. The conceptual model was therefore taken
from section 6 of the phase brief itself, which enumerates it in full
(lifecycle, homographs, pronominality, relations, lineage, lexicon release).
No conceptual requirement was dropped for want of the file.

### 2.2 `LexicalType` vs `LexemeType` — `CONTRADICTION_RESOLVED`

`lib/lexical-prototype.ts` publishes `SINGLE_WORD | MULTIWORD`; the canonical
`features/curriculum` model publishes `ATOMIC | MULTIWORD`.

Evidence: the registry has 555 `ATOMIC` and 44 `MULTIWORD` lexemes, and the 44
`MULTIWORD` lexemes are exactly the 44 MWUs carrying a `lexemeId`. The two
vocabularies describe the same partition under different names.

Resolution: the published name wins (authority 1 over authority 6). The
prototype was not edited beyond a header note; nothing in the registry changed.

### 2.3 Pronominality has no published evidence

Six lemmas end in `-se`: `bañarse` (LEX-A1-000062), `dedicarse`
(LEX-A1-000178), `ducharse` (LEX-A1-000200), `lavarse` (LEX-A1-000324),
`levantarse` (LEX-A1-000330), `llamarse` (LEX-A1-000333). All are `ATOMIC`.

Three facts blocked any classification:

1. No published field states pronominality anywhere in the release.
2. None of the six has a published non-pronominal counterpart — `bañar`,
   `lavar`, `levantar`, `llamar` are not in the lexicon.
3. `ir` is published; `irse` is not. The `IR != IRSE` case cannot be
   demonstrated from A1 at all.

Classifying the six from their spelling would be inference presented as data,
and the brief forbids exactly that. **All 599 published lexemes carry
`UNSPECIFIED` with authority `NOT_CLASSIFIED`.** The vocabulary
(`NONE` / `OBLIGATORY` / `LEXICALIZED_ALTERNANT`) is implemented and
declarable; `IR != IRSE` is tested as a fixture with authority `FIXTURE`.

`UNSPECIFIED` is not a synonym for `NONE`. `NONE` is a decision; `UNSPECIFIED`
is the absence of one. An override that sets a value while claiming
`NOT_CLASSIFIED` is rejected with `LEXICAL_ANNOTATION_UNAUTHORIZED`.

### 2.4 Homography: 20 real groups, all cross-POS

A1 publishes 20 lemmas carrying more than one lexeme. Every one is cross-POS
and every member has a non-null `enginePos`:

```text
alemán budista cristiano cuarto español este extranjero frío japonés joven
judío mañana marroquí mexicano móvil musulmán postal que tarde viejo
```

`este` DEMONSTRATIVE vs NOUN/CARDINAL_POINT, `mañana` ADV vs NOUN, `que` PRON
vs SCONJ. Zero same-POS groups. `lexemeKey` is unique across all 599, so nothing
collides at the key level.

This drove the central design decision. **Groups are keyed by canonical form
alone.** Keying by form + POS would appear correct against A1 — all 20 groups
would still form — and would silently make same-POS homography
(`cura` priest vs `cura` cure) unrepresentable. POS is recorded per member as
evidence, never as a discriminator. A test asserts the A1 same-POS count is 0
so the fixture is visibly covering a real gap rather than duplicating data.

### 2.5 468 of 599 lexemes have no published POS

`enginePos` is annotated only for function-word classes resolved in phase 14c.
Membership in a homograph group therefore cannot require a POS, and the engine
never supplies one the curriculum withheld. `HomographMember.enginePos` is
nullable and null is not a defect.

### 2.6 Phase-1 `getLexemeOfSense` / `getLexemeOfForm` conflate two failures

Both return `Lexeme | null`, where `null` means either "unknown id" or "known
id whose lexeme is missing" — a typo versus a corrupt registry.

This is **not** a phase-1 bug and no `PHASE1_REGRESSION_FIX` was made: phase 1
documents that contract deliberately and its own tests assert it. Phase 2 draws
the distinction at its own boundary instead. `getLexemeForForm` /
`getLexemeForSense` return `NOT_FOUND` for an unknown id and *throw*
`LEXICAL_REFERENCE_NOT_FOUND` for a dangling reference, because reporting
corruption as a bad input id is precisely the plausible-wrong-answer this suite
exists to prevent.

### 2.7 Data confirmed against the phase brief

| Claim | Verified |
| --- | --- |
| 599 lexemes, 666 forms, 608 senses, 214 MWU, 169 grammar units | yes |
| 602 A1 senses, 6 A2 boundary | yes (586 core + 16 regional receptive + 6 A2) |
| 44 MWUs with lexeme identity, 170 without | yes |
| No SourceAssertion addresses a `GRAM-A1-*` id | yes, 0 of 936 |
| 16 regional receptive targets | yes |
| 985 first introductions, 2955 recycle edges | yes |

No `BLOCKER_CONTRADICTION` was raised. Nothing in the canonical CSVs or the
generated registry was modified.

---

## 3. Contracts

```text
features/lexical-engine/
  index.ts                      public boundary
  domain/result.ts              LexicalResult, MwuIdentityResult
  domain/errors.ts              9 LEXICAL_* codes, LexicalEngineError
  domain/ids.ts                 LexiconReleaseId, HomographGroupId,
                                LexicalRelationId, LineageEventId
  domain/identity.ts            LexemeLifecycleStatus, Pronominality,
                                AnnotationAuthority, LexicalIdentity
  domain/homograph.ts           HomographGroup, HomographMember
  domain/relations.ts           LexicalRelation, 4 relation types
  domain/lineage.ts             LexemeLineageEvent, cardinality table,
                                semantics, transfer policy
  domain/release.ts             LexiconRelease
  engine/annotations.ts         derivation from published evidence
  engine/lineage-graph.ts       validateLineage, LineageGraph
  engine/lexicon.ts             LexicalEngine
  __tests__/                    identity, homograph, lineage, corruption
```

### 3.1 Three-way result semantics

```text
unknown id                       -> NOT_FOUND
known id, nothing attached       -> FOUND with []
known MWU, no lexeme by decision -> NO_LEXICAL_IDENTITY
```

`NO_LEXICAL_IDENTITY` has no `value` field, so a caller cannot reach a lexeme
through it by accident. It is a terminal, successful answer about 170 published
units, never a reason to mint a lexeme.

### 3.2 `LexiconRelease` is not `CurriculumRelease`

```text
CurriculumRelease  what is taught, in what order, on whose authority
LexiconRelease     how lexical identity is drawn
```

`A1-LEXICON-v1.0` records `curriculumReleaseId: "A1-CURRICULUM-v1.51"` as a
back-reference for auditing, not as a dependency. Splitting a lexeme changes
the lexicon without changing a curricular decision; resequencing an island does
the reverse. A test asserts the two ids are not equal.

The 103 → 32 restructure is the worked example. It moved the back-reference
from `A1-CURRICULUM-v1.44` to `A1-CURRICULUM-v1.51` and changed nothing else:
the lexicon kept `A1-LEXICON-v1.0`, all 599 lexemes, 666 forms, 608 senses, 20
homograph groups and the 44 / 170 MWU identity split. Minting an
`A1-LEXICON-v1.1` for a curricular resequencing would have made a narrative
decision indistinguishable from a lexical one.
`features/lexical-engine/__tests__/curriculum-revalidation.test.ts` is the
standing evidence, including a case that rebuilds the engine over a registry
with its story topology emptied and gets an identical lexical release.

### 3.3 Lineage

| Kind | Sources | Targets |
| --- | --- | --- |
| `SPLIT` | 1 | ≥ 2 |
| `MERGE` | ≥ 2 | 1 |
| `REPLACED_BY` | 1 | 1 |
| `RETIRE` | 1 | 0 |

Semantics (`EQUIVALENT_IDENTITY`, `COARSENING`) is independent of kind.
Transfer policy is constrained by semantics: `COARSENING` may not carry
`FULL_EQUIVALENT`, because an event admitting the distinction was lost cannot
also claim everything transfers unchanged. Phase 2 records the policy and acts
on none of it — there is no learner state to transfer.
`LearnerEventAttribution` is phase 4 and was not implemented.

`validateLineage` collects every issue in one pass and the engine rejects a
corrupt set **whole**; a partially loaded lineage would answer some questions
correctly and others silently wrong.

Cycle detection is an iterative three-colour DFS returning the offending path.
Self-edges (`A -> A`) are caught separately, since cardinality alone would not
notice them in a `SPLIT` or `MERGE`.

### 3.4 The split rule

`LineageGraph.resolve` on a `SPLIT` source returns `SUPERSEDED_AMBIGUOUS` with
every successor listed and none elected. The variant carries no `successor`
field at all, so a caller cannot read one by mistake. A merge or replacement,
having exactly one successor, returns `SUPERSEDED_RESOLVABLE`.

Superseded and retired ids keep resolving as lexemes with their published lemma
intact. Nothing is deleted and no id is reused.

---

## 4. Tests

117 total, up from 47. The 47 phase-1 tests are unchanged and still pass; no
file under `features/curriculum/`, `content/`, `generated/` or `scripts/` was
modified.

| Suite | Tests | Basis |
| --- | --- | --- |
| `identity.test.ts` | 17 | real registry |
| `homograph.test.ts` | 19 | real registry + 2 fixture cases |
| `lineage.test.ts` | 14 | fixtures + real published ids |
| `corruption.test.ts` | 20 | fixtures |

Fixtures are used only where A1 lacks the evidence: same-POS homography,
`IR`/`IRSE`, and all lineage topology (the release has no lineage history).
Everywhere else the real registry is used, because a fixture would prove less.
Fixture lexeme ids use a `LEX-FIXTURE-` prefix so a leak fails the published
`LEX-A1-\d{6}` pattern instead of passing for curriculum data.

### 4.1 The ten mandated corruption cases

1. Non-existent lexeme → `NOT_FOUND` from every lookup, never `[]`
2. Form → missing lexeme → throws `LEXICAL_REFERENCE_NOT_FOUND`
3. Sense → missing lexeme → throws `LEXICAL_REFERENCE_NOT_FOUND`
4. Non-lexicalised MWU read as a lexeme → `NO_LEXICAL_IDENTITY`, no `value`
5. Lineage cycle → `LEXICAL_LINEAGE_CYCLE` (2-cycle, 3-cycle, self-edge)
6. Invalid `SPLIT` cardinality → `LEXICAL_LINEAGE_CARDINALITY_INVALID`
7. Invalid `MERGE` cardinality → same
8. `REPLACED_BY` with two targets → same
9. `RETIRE` with a successor → same
10. Legacy split id → `SUPERSEDED_AMBIGUOUS`, never one child

Plus: double supersession, duplicate event id, empty reason, duplicated id
within an event, lineage naming an unpublished lexeme, whole-set rejection,
multi-issue reporting, and issue formatting.

---

## 5. Regression status

```text
npm run curriculum:check   PASS  (all invariants, 985 reconciled)
npm test                   PASS  117/117 (47 phase 1 + 70 phase 2)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 warning
npm run build              PASS
```

The single lint warning is pre-existing and out of scope:
`components/visual/baseline-v1/_ds/modernist-.../\_ds_bundle.js:7:7`,
`'__ds_scope' is assigned a value but never used`. It was present on `e8f482c`
before any phase-2 file existed. No new warnings were introduced.

---

## 6. The prototype

`lib/lexical-prototype.ts` was **not** deleted and no adapter was written.

It is types-only and is consumed by `components/story-reader.tsx`,
`content/a1/module-1/island-1/story-1.ts` and `lib/learner-event-prototype.ts`.
Its `Pronominality` and `LexicalType` are superseded by the canonical contracts;
a header note records that and points new code at
`features/lexical-engine`.

Its story-shaped types (`PrototypeStory`, `PrototypeStoryOccurrence`) have no
canonical replacement: `StoryOccurrence` and `TextAnchor` are phase 3. Its
hand-authored fixture ids (`lex-ir`, `sense-ir-move`) are not curriculum ids and
cannot be mapped onto `LEX-A1-*` without an editorial decision no authority has
published — an adapter would have to invent that mapping. Deleting the file
would break the vertical slice and buy nothing. Retire it when the Story Engine
publishes canonical occurrences.

---

## 7. Deliberately not done

`StoryVersion`, `TextAnchor`, canonical `OccurrencePart`,
`LearnerEventAttribution`, `UserLexemeState`, `PostgresLexiconRepository`, NLP,
mastery, spaced repetition, dictionary import. No UI file was touched. No
migration, ORM or Python service exists.

Relations other than `HOMOGRAPH_OF` are implemented and queryable but
unpopulated: A1 evidences none of them. An empty relation set is a correct
statement about the release, not a gap.
