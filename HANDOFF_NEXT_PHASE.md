# Handoff — phase 2 to phase 3 (Story Engine)

## 1. Phase commits

Branch `prueba`.

- Phase 1 (Curriculum Registry): `cb63cb2bfe1c77535e505bd4ba8f8246a7113e19`
- Phase 2 (Lexical Engine): recorded in the follow-up commit on this branch.

Phase 2 started from `e8f482c` and changed nothing under
`features/curriculum/`, `content/`, `generated/` or `scripts/`.

## 2. Entrypoints

```text
features/curriculum/index.ts          phase 1 public contract
features/lexical-engine/index.ts      phase 2 public contract — import from here
features/lexical-engine/domain/       result, errors, ids, identity, homograph,
                                      relations, lineage, release
features/lexical-engine/engine/       annotations, lineage-graph, lexicon
features/lexical-engine/__tests__/    identity, homograph, lineage, corruption
docs/curriculum-import.md             phase 1 documentation
docs/lexical-engine-implementation.md phase 2 documentation + audit findings
```

## 3. Using the lexical engine

```ts
import { loadLexicalEngine } from "@/features/lexical-engine";

const engine = loadLexicalEngine(); // Node-side; build once at module scope
```

Or, when a registry is already loaded:

```ts
import { createLexicalEngine } from "@/features/lexical-engine";
import { loadCurriculumRegistry } from "@/features/curriculum";

const engine = createLexicalEngine(loadCurriculumRegistry());
```

## 4. Tests

```bash
npm run curriculum:check   # registry invariants
npm test                   # 117 tests (47 phase 1 + 70 phase 2)
npm run typecheck
npm run lint               # 0 errors, 1 pre-existing warning (see §9)
npm run build
```

## 5. Public contracts available to phase 3

From `features/lexical-engine`:

- Results: `LexicalResult`, `MwuIdentityResult`, `found`, `notFound`,
  `isFound`, `expectFound`.
- Errors: `LexicalEngineError`, `LexicalIssue`, `formatLexicalIssue`,
  `lexicalIssue`, and nine `LEXICAL_*` codes.
- Ids: `LexiconReleaseId`, `HomographGroupId`, `LexicalRelationId`,
  `LineageEventId`, `LEXICAL_ID_PATTERNS`, `asLexicalId`,
  `matchesLexicalIdPattern`.
- Identity: `LexemeLifecycleStatus`, `Pronominality`, `AnnotationAuthority`,
  `LexicalIdentity`, `publishedIdentity`, `isUnauthorizedClassification`.
- Homographs: `HomographGroup`, `HomographMember`, `isSamePosGroup`.
- Relations: `LexicalRelation`, `LexicalRelationType`, `isSymmetric`.
- Lineage: `LexemeLineageEvent`, `LineageEventKind`, `LineageSemantics`,
  `TransferPolicy`, `LINEAGE_CARDINALITY`, `ALLOWED_TRANSFER_POLICIES`,
  `lifecycleAfterEvent`, `LineageGraph`, `validateLineage`,
  `LineageResolution`.
- Release: `LexiconRelease`, `LEXICON_SCHEMA_VERSION`,
  `CURRENT_LEXICON_RELEASE_ID`.
- Engine: `LexicalEngine`, `createLexicalEngine`, `loadLexicalEngine`,
  `LexicalEngineOptions`.

Engine methods: `resolveLexeme`, `resolveForm`, `resolveSense`, `resolveMwu`,
`getLexemeForForm`, `getLexemeForSense`, `getForms`, `getSenses`,
`getCurricularAssertionsForSense`, `getMwuLexicalIdentity`, `getIdentity`,
`getHomographGroups`, `getHomographGroupOf`, `getLexemesByCanonicalForm`,
`getRelations`, `resolveLineage`, `getSuccessors`, `getPredecessors`.

## 6. Constraints phase 3 must respect

Everything phase 2 inherited still holds — immutable published ids, no CEFR
recomputation, no MWU promotion, no CSV parsing at request time, A2 boundary
senses out of A1 scheduling, 16 regional receptive targets without universal
productive demand, recycle edges as scheduling not mastery. In addition:

- **Resolve through published ids, never surfaces.** A surface string does not
  identify a lexeme: 20 A1 lemmas carry two lexemes each. When phase 3 anchors
  a token in a story it must record which `LexemeId`/`SenseId` it means, and it
  cannot recover that by matching text. `getLexemesByCanonicalForm` returns
  *candidates*, never an answer.
- **Do not mint lexemes for MWUs.** `NO_LEXICAL_IDENTITY` is the correct answer
  for 170 of 214 units. A story occurrence over one of them anchors to the MWU
  id, not to a lexeme.
- **Do not classify pronominality.** All 599 lexemes are `UNSPECIFIED` with
  authority `NOT_CLASSIFIED`, deliberately; see §2.3 of
  `docs/lexical-engine-implementation.md`. An occurrence of surface "se" is not
  evidence about lexeme identity.
- **Do not consume a split id as if it had one successor.** `resolveLineage`
  returns `SUPERSEDED_AMBIGUOUS` with candidates and no elected child.
- **`LexiconRelease` is not `CurriculumRelease`.** A story must record both if
  it needs to be reproducible.

## 7. Technical debt deliberately deferred

- **Pronominality is entirely unpopulated.** The contract, the override path
  and the authority check exist; no lexeme carries a classification, because no
  authority has published one. Unblocking this needs an editorial decision, not
  code.
- **Relations other than `HOMOGRAPH_OF` are empty.**
  `PRONOMINAL_COUNTERPART_OF`, `VARIANT_OF` and `DERIVED_FROM` are typed and
  queryable but unevidenced in A1.
- **Lineage has no persistence.** Events are passed to the constructor. There
  is no lineage file, no importer and no id allocator; A1 has no lineage
  history, so none was needed.
- **`LexicalIdentity.lifecycle` is uniform.** All published lexemes are
  `ACTIVE` unless a lineage event says otherwise. `PROVISIONAL` is declarable
  and unused.
- **Homograph groups are recomputed on construction**, not serialised. Group
  ids are positional within a stable ordering, so they are reproducible for a
  given registry but would shift if the lexeme inventory changed. Serialise
  them before treating `HG-A1-*` as durable.
- **`getLexemesByCanonicalForm` is a linear scan** over 599 lexemes. Fine at
  this size; index it if phase 3 calls it per token.

## 8. Not started, by design

`StoryVersion`, `TextAnchor`, canonical `OccurrencePart`,
`LearnerEventAttribution`, `UserLexemeState`, `PostgresLexiconRepository`, NLP
or spaCy, auth, mastery, spaced repetition, recommender. No migration, ORM or
Python service exists. No file under `app/`, `components/visual/`,
`features/story-engine/` or `features/learner-progress/` was touched.

## 9. Known warning

`npm run lint` reports one warning, pre-existing and out of scope:

```text
components/visual/baseline-v1/_ds/modernist-.../_ds_bundle.js
  7:7  warning  '__ds_scope' is assigned a value but never used
```

Present on `e8f482c` before any phase-2 file existed. Phase 2 added none.

## 10. The prototype

`lib/lexical-prototype.ts` is kept and carries a header explaining its status.
Its `Pronominality` and `LexicalType` are superseded by
`features/lexical-engine`; its story-shaped types are not, because
`StoryOccurrence` and `TextAnchor` are phase 3 work.

**This is phase 3's to retire.** When the Story Engine publishes canonical
occurrences, `components/story-reader.tsx` and
`content/a1/module-1/island-1/story-1.ts` can move off it. Note that the story
fixture uses invented ids (`lex-ir`, `sense-ir-move`) that are not curriculum
ids; mapping the fixture story onto `LEX-A1-*` requires an editorial decision
that no published artefact currently supplies.

## 11. Open contradictions

None blocking. Two were found and resolved from evidence, both recorded in
`docs/lexical-engine-implementation.md` §2: the prototype/canonical
`LexicalType` naming difference (`CONTRADICTION_RESOLVED`, published name wins),
and the absence of `docs/lexical-engine.md` (an absent authority, not a
conflict — the conceptual model came from §6 of the phase-2 brief). No
`BLOCKER_CONTRADICTION` was raised. Nothing in the canonical CSVs or the
generated registry was modified to make sources agree.
