# Handoff — phases 1-5 to phase 6 (NLP)

```text
PHASE_1_MIGRATED             = PASS
PHASE_2_REVALIDATED          = PASS
PHASE_3_STORY_ENGINE         = PASS
PHASE_4_LEARNER_EVENT_ENGINE = PASS
PHASE_5_POSTGRES             = PASS  (PostgreSQL via @electric-sql/pglite)
DEUDA_A_TARGET_EVIDENCE      = PASS  (see §17 — 985/985 targets representable)
PHASE_6_NLP                  = NOT_STARTED
PHASE_6_READY                = YES
```

Phase 3 (Story Engine) is documented in full in
`docs/story-engine-implementation.md` (§14 below is the short summary). Phase 4
(Learner Event / Progress Engine) is documented in full in
`docs/learner-progress-implementation.md` (§15 below is the short summary).
Phase 5 (PostgreSQL / Persistence) is documented in full in
`docs/persistence.md` and `docs/data-model.md` (§16 below is the short
summary). Sections 1-13 are the phase 1/2 handoff, unchanged and still
authoritative for their scope.

## 1. Commits

Branch `prueba`, pushed to `origin/prueba`. `main` untouched, no merge.

- Initial HEAD for this migration: `4c550674761eb9220a6d8157fbf7ba0e3d9edde7`
- Migration commit: `6944663b053b6e52289c2a27c5c973766b7984bb`
- Final HEAD: this commit, which records the SHA above.
- Phase 1 original implementation: `cb63cb2bfe1c77535e505bd4ba8f8246a7113e19`
- Phase 2 original implementation: `2bc6851ebf12085be5eccbff9af5ef0826ebe0b4`

Phases 1 and 2 were migrated **atomically, in one task**: phase 2 was revalidated
against the newly generated registry, not left for later.

## 2. Active baseline

```text
CurriculumRelease              A1-CURRICULUM-v1.51     ACTIVE
registry schemaVersion         curriculum-registry/2.0.0
LexiconRelease                 A1-LEXICON-v1.0         unchanged
lexicon.curriculumReleaseId    A1-CURRICULUM-v1.51

modules                        8
islands                        11
StoryBlueprints                32
first introductions            985   (448 FOCUS + 537 SUPPORTED)
recycle edges                  2867  (985 FIRST + 950 SECOND + 932 THIRD)
island checkpoints             11
module checkpoints             8
dedicated final-transfer story 1
capstone first introductions   0
DELE task structures           13
regional receptive targets     16
A2 boundary scheduled as A1    0
```

Lexical inventory, unchanged by the restructure:

```text
lexemes 599   forms 666   senses 608 (602 A1 + 6 A2 boundary)
MWU 214 (44 with lexical identity, 170 without)   grammar units 169
homograph groups 20   pronominality UNSPECIFIED / NOT_CLASSIFIED on all 599
lineage: empty and acyclic
```

`A1-CURRICULUM-v1.44` (8 modules / 32 islands / 103 StoryBlueprints / 2955
edges) is **historical**, not the active baseline. Phase 3 must not treat those
figures as current.

## 3. Entrypoints

```text
features/curriculum/index.ts                    phase 1 public contract
features/lexical-engine/index.ts                phase 2 public contract
features/story-engine/index.ts                  phase 3 public contract
features/learner-progress/index.ts              phase 4 public contract
features/persistence/index.ts                   phase 5 public contract
db/migrations/*.sql                             phase 5 SQL migrations, versioned
generated/curriculum/a1/                        the executable registry
content/a1/vocabulary/*.csv                      authoring authority (v1.51 + v1.37/v1.40)
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/   archived v1.44, read by nothing
docs/curriculum-import.md                       phase 1 documentation
docs/lexical-engine-implementation.md           phase 2 documentation
docs/story-engine-implementation.md             phase 3 documentation
docs/learner-progress-implementation.md         phase 4 documentation
docs/data-model.md                              phase 5 schema reference
docs/persistence.md                             phase 5 documentation
docs/curriculum/a1-restructure/                 the approved A–H curricular package
docs/architecture/                              engine architecture and phase specs
docs/lexical-engine.md                          lexical identity domain model
.gitattributes                                  byte authority for hashed paths
```

The architecture and phase-spec documents used to live only in a local folder
outside the repository. They are now versioned here and **these copies are
canonical** — see `docs/architecture/README.md`. Phase 3 does not need any
out-of-repo folder to reconstruct the technical context.

## 4. What changed in phase 1

The migration was a schema change, not a constant swap.

- **Architecture.** v1.51 publishes eleven `ISLAND` rows and no `MODULE` row.
  The eight modules are reconstructed by grouping on `module_id`; repeated
  module attributes must agree across a module or the import fails. A `MODULE`
  row is now schema drift.
- **Allocation.** `first_introduction_story`/`first_introduction_island` became
  `story_id`/`island_id`; `recycle_route_class` is gone; `intro_salience`
  (`FOCUS` | `SUPPORTED`) is new. There is still exactly one first introduction
  per target — salience weights it, it does not multiply it.
- **Return graph.** The `LOCAL`/`NEAR`/`THIRD` edge-type model was replaced by
  `FIRST_RETURN`/`SECOND_RETURN`/`THIRD_RETURN`. Edges carry no
  `allocation_id`: they join on (`target_id`, `introduction_story`), checked
  against the allocation. A target has **one to three** returns, not always
  three.
- **Blueprints.** FOCUS/SUPPORTED counts, per-stage return counts, checkpoint
  and final-transfer flags, DELE task ids and required modalities are now
  modelled and cross-checked.
- **Schema is release-neutral.** No `v1_4x_*` column survives, and the importer
  scans the published headers to enforce that (audit control H-024).
- **Registry schema bumped** to `curriculum-registry/2.0.0`: the canonical shape
  of `StoryBlueprint` and `RecycleEdge` changed.
- **Expectations** now map the published `H-*` audit controls, not `SEQ16D-*`.

## 5. What changed in phase 2

```text
PHASE_2_CODE_CHANGE_REQUIRED = NO (substantive)
```

No lexical logic changed. Exactly one line of behaviour-bearing coupling
existed — a test asserting the back-reference `A1-CURRICULUM-v1.44` — plus two
stale doc references. Those were corrected; the engine itself already derived
`curriculumReleaseId` from whatever registry it was given.

`A1-LEXICON-v1.0` was **kept**. Minting `A1-LEXICON-v1.1` for a narrative
resequencing would make a curricular decision indistinguishable from a lexical
one.

New suite `features/lexical-engine/__tests__/curriculum-revalidation.test.ts`
is the standing evidence: it asserts the four release identities, every lexical
count, the 20 homograph groups, the 44/170 MWU split, pronominality, lineage,
and — by rebuilding the engine over a registry with its story topology emptied —
that phase 2 depends on no story-topology figure at all.

Corroborating fact: `lexemes.json`, `forms.json`, `senses.json`,
`mwu-units.json`, `grammar-units.json` and `source-assertions.json` are
**byte-identical** before and after the migration. Only the six sequencing
files in `generated/` changed.

## 6. Tests

```bash
npm run curriculum:check   # IMPORT OK, 27 invariants PASS
npm run curriculum:import  # regenerates generated/curriculum/a1
npm test                   # 160 tests (79 phase 1 + 81 phase 2), 0 fail
npm run typecheck          # 0 errors
npm run lint               # 0 errors, 1 pre-existing warning (§10)
npm run build              # OK
```

- **Corruption suite**: 32 cases, each proving the importer *rejects* a defect
  — unknown island, allocation pointing at a missing story, duplicate first
  introduction, unknown salience, FOCUS guardrail breach, FOCUS+SUPPORTED not
  adding up, story_count disagreement, checkpoint outside its island or module,
  a first introduction landing on the capstone, edge with no allocation, wrong
  introduction story, backward return, duplicate destination, `SECOND_RETURN`
  without `FIRST_RETURN`, wrong `relation_scope`, mastery claim, mode-policy
  drift, A2-as-A1, regional receptive given productive demand, published audit
  contradicting the data, schema drift both ways, version mismatch, and a
  retired v1.44 record type.
- **Determinism**: two imports under two pinned clocks produce the same
  `contentHash`, the same serialised registry and byte-identical files;
  `generatedAt` is the only difference.
- **No partial release**: a failed import exposes no `data` to write out.

## 7. Cutover evidence

The five root v1.44 sequencing CSVs were deleted **after** every gate was green,
then every gate was rerun. `contentHash` was `4d598dc1bffebb…` before and after
the deletion — nothing in the active path read them.

The current `contentHash` is `e019ccc4675316…`. It moved only when
`.gitattributes` made the working tree carry the Git blob bytes verbatim (§9):
the hash covers `sourceHashes`, and three of those now record canonical blob
hashes rather than Windows-CRLF ones. All eleven generated collection files
stayed byte-identical through that change, so no canonical content moved.

The archive under `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/` was
verified byte-identical (SHA-256) to the deleted files before deletion and was
not modified. The three shared inventory CSVs (`v1.37`, `v1.40`) were not
touched.

## 8. Constraints phase 3 must respect

Everything phases 1 and 2 established still holds. In addition:

- **The sequence is 32 stories over 11 islands.** Any phase-3 artefact keyed on
  103 stories or 32 islands is reading a retired release.
- **Story ids are new and non-colliding.** v1.51 uses island indices `I05`/`I06`;
  v1.44 used `I01`–`I04`. Do not resurrect a retired story id.
- **`intro_salience` is not a second introduction.** FOCUS and SUPPORTED both
  mark *the* first introduction. A phase-3 occurrence model must not treat a
  SUPPORTED introduction as a return.
- **A target has one to three returns.** Do not assume three.
- **The capstone introduces nothing.** `A1-M08-I06-S3` is the single dedicated
  final-transfer story, with zero first introductions.
- **Checkpoints are published, not derived.** Island and module checkpoints come
  from the architecture ledger; the blueprint flags are cross-checked against it.
- **Resolve through published ids, never surfaces.** 20 A1 lemmas carry two
  lexemes each; `getLexemesByCanonicalForm` returns candidates, not an answer.
- **Do not mint lexemes for MWUs.** `NO_LEXICAL_IDENTITY` is correct for 170 of
  214 units.
- **Do not classify pronominality**, and do not infer it from `-se`.
- **Do not consume a split id as if it had one successor.**
- **`LexiconRelease` is not `CurriculumRelease`.** A story that must be
  reproducible records both.

## 9. Technical debt deliberately left

- **`oldStoryIdsReused` (H-022) is attested, not recomputed.** Proving it
  mechanically would require the importer to read the retired v1.44 id space,
  which is not a canonical source of the active release. The claim rests on the
  ETAPA H crosswalk. H-021 and H-023 *are* recomputed against the data.
- ~~The v1.51 manifest hashes carried-over sources over LF-normalised bytes.~~
  **Resolved.** `.gitattributes` now marks the byte-authoritative paths `-text`,
  so a checkout writes the Git blob verbatim on every platform. All **8/8**
  source hashes recorded in `release.json` equal the published manifest, and the
  v1.44 archive verifies 5/5 against its own manifest. No blob was rewritten and
  no approved hash changed; only `release.json` moved, recording the canonical
  blob hashes for the three shared inventory files instead of Windows-CRLF ones.
  A regression test in `importer.test.ts` now compares imported hashes against
  the published manifest.
- **`spanishstories_curriculo_a1_prueba1_v1.44.md`** remains under
  `content/a1/vocabulary/`. It is prose, not an importer source, and the cutover
  manifest lists only the five CSVs for removal.
- Everything phase 2 already deferred: pronominality unpopulated, relations
  other than `HOMOGRAPH_OF` empty, lineage has no persistence, `LexicalIdentity.
  lifecycle` uniform, homograph groups recomputed rather than serialised,
  `getLexemesByCanonicalForm` a linear scan.

## 10. Known warning

`npm run lint` reports one warning, pre-existing and out of scope:

```text
components/visual/baseline-v1/_ds/modernist-.../_ds_bundle.js
  7:7  warning  '__ds_scope' is assigned a value but never used
```

Present before this migration. No new warning was introduced.

## 11. The legacy fixture (retired by phase 3, original untouched)

`lib/lexical-prototype.ts`, `components/story-reader.tsx` and
`content/a1/module-1/island-1/story-1.ts` remain exactly as phase 2 left them —
still using invented ids (`lex-ir`, `sense-ir-move`) that are **not**
curriculum ids. Retiring them (pointing `story-reader.tsx` at the phase-3
engine) is a UI-adapter decision the engine phases do not make; see
`docs/architecture/plan-implementacion-motor-v1.0.md` §"No rediseñar UI".

Phase 3 satisfied the *technical* retirement this section asked for:
`features/story-engine/fixtures/la-compra-olvidada.ts` rebuilds the fixture's
most structurally interesting content (a contiguous occurrence, a
discontinuous one) with the canonical engine, proves it stays a
`TECHNICAL_FIXTURE` (`Story.storyBlueprintId = null`, unpublishable), and
proves its ids still share no namespace with `LEX-A1-*` — this time by
construction (the phase-3 id prefix scheme), not by accident. See
`docs/story-engine-implementation.md` §5. No `BLOCKER_ID_COLLISION`.

## 12. Not started, by design

No auth, no NLP or Python/spaCy (phase 6), no ORM. No file under `app/` or
`components/visual/` was touched. `features/story-engine/`,
`features/learner-progress/` and `features/persistence/` are phases 3, 4 and
5's own scope — see §14, §15 and §16.

## 13. Open contradictions

No `BLOCKER_CONTRADICTION` and no `BLOCKER_HASH_CANONICALIZATION` was raised.

One apparent conflict was investigated and resolved from evidence: the
manifest/on-disk SHA-256 divergence on the three carried-over inventory files.
It was a CRLF-vs-LF checkout artefact, not a content difference — the published
manifest had been computed over Git blob bytes all along, and the divergence
was confined to the Windows working tree. Fixing it therefore preserved every
published blob and changed no approved hash, so it did not require the blocker.

Nothing in the canonical CSVs or the generated collections was modified to make
sources agree.

## 14. Phase 3 (Story Engine) summary

```text
PHASE_3_STORY_ENGINE = PASS
```

Full design rationale, decisions and audit are in
`docs/story-engine-implementation.md`. Short version:

- **Entities implemented**: `Story`, `StoryVersion`, `StorySentence`,
  `SurfaceToken`, `TextAnchor`, `StoryOccurrence` (`LEXICAL`/`CONSTRUCTION`),
  `OccurrencePart`, `OccurrenceAnnotationRevision`, `StoryTargetBinding`,
  `StoryRepository`/`InMemoryStoryRepository`, and the publication validator
  (`validateStoryPublication`).
- **`Story != StoryBlueprint`**: never assumed equal; a `Story` may exist with
  `storyBlueprintId = null` (technical fixture) but can never be *published*
  as curricular without one.
- **Technical id namespace**: every phase-3 id carries a fixed lowercase
  prefix (`story-`, `storyver-`, `anchor-`, `occ-`, `part-`, `rev-`,
  `bind-`, ...) that cannot collide with a published curriculum id
  (`LEX-A1-*`, uppercase). No `BLOCKER_ID_COLLISION`.
- **`TextAnchor` offsets are Unicode code points**, half-open `[start, end)` —
  documented and tested against an astral character (an emoji) specifically
  because JavaScript's `.length` would disagree with Python's `len()` there.
- **Discontinuous occurrences work**: `"Marta se dio finalmente cuenta..."`
  (`CLITIC`+`HEAD`+`FIXED`, gap on "finalmente"), `"vete"` (two anchors inside
  one orthographic token), and `"Lleva tres años estudiando español"`
  (`ANCHOR`+`SLOT(DURATION)`+`SLOT(GERUND_PREDICATE)`, a `CONSTRUCTION`
  occurrence — no lexeme minted for the pattern) are all implemented and
  tested.
- **Publication validator** checks textual, lexical and curricular integrity
  and is proven end-to-end against a real story blueprint
  (`A1-M01-I05-S1`, all 33 first introductions bound, zero returns needed) —
  not just against synthetic fixtures.
- **No PostgreSQL yet** (phase 5): `InMemoryStoryRepository` is the only
  adapter; the repository interface has no update/delete for published
  content, by design, so a future PostgreSQL adapter cannot reintroduce
  in-place mutation without changing the interface everyone already composes
  against.
- **Legacy fixture retired technically**, original untouched — see §11.
- **Known, deliberate debt**: `StoryTargetBinding` does not deep-check that a
  bound occurrence's `lexemeId`/`constructionId` matches a non-`SENSE`
  (`MWU_SOURCE_UNIT`/`GRAMMAR_UNIT`) target's own identity — only that the
  binding itself is well-formed and correctly scheduled. See
  `docs/story-engine-implementation.md` §8.

```bash
npm run curriculum:check   # PASS, unchanged
npm test                   # PASS 217/217 (160 phases 1-2 + 57 phase 3)
npm run typecheck          # PASS
npm run lint               # PASS, 0 errors, 1 pre-existing warning
npm run build              # PASS
```

Phase 4 (Learner Event / Progress Engine) consumed
`features/story-engine/index.ts`'s `StoryOccurrenceId`/`StoryVersionId` in its
event shapes without waiting on real Story content (§8's debt) or on
PostgreSQL (phase 5) — see §15.

## 15. Phase 4 (Learner Event / Progress Engine) summary

```text
PHASE_4_LEARNER_EVENT_ENGINE = PASS
```

Full design rationale, decisions and audit are in
`docs/learner-progress-implementation.md`. Short version:

- **Entities implemented**: `LearnerEvent` (`OCCURRENCE_OPENED` |
  `STATE_DECLARED`, frozen/immutable), `LearnerEventRepository`/
  `InMemoryLearnerEventRepository`/`LocalStorageLearnerEventRepository`,
  `DeclaredStateProjection`, `ContextHistoryProjection`, `ProgressProjection`,
  `LearnerEventAttribution`, `ProjectionMetadata`.
- **`event != current state`**: every projection is a pure fold over the
  event log, rebuilt on demand; nothing is a mutable "current state" record.
- **Append-only by interface, not convention**: `LearnerEventRepository` has
  no `update`/`delete` method at all, mirroring
  `features/story-engine/repository/story-repository.ts`'s treatment of
  published `StoryVersion` content.
- **`LocalStorageLearnerEventRepository` never imports `window`**: it depends
  on a minimal `StorageLike` port, so the same contract-test suite runs
  against it and `InMemoryLearnerEventRepository` with no DOM in Node.
- **Attribution is lineage-aware and evidence-safe**: resolution order is
  occurrence reannotation -> Sense lineage -> lineage graph ->
  `AMBIGUOUS_LEGACY`/`UNATTRIBUTED`; proven against real published ids
  (`LEX-A1-000260` split, disambiguated via `SENSE-A1-000265`). A split never
  attributes to more than one candidate; a merge never copies events —
  attribution is a pure read.
- **`NEW`/`LEARNING`/`KNOWN` stay `USER_DECLARED_STATE`**: exposure
  (`OCCURRENCE_OPENED`) never creates or changes a declared state, and
  `computedMastery` is a real, always-`null` field — no formula invented.
- **Rebuildability proven**: two independent computations of all three
  projections from the same event log are equal once `calculatedAt` is
  excluded (`withoutCalculatedAt`).
- **Known, deliberate debt**: `ProgressProjection`'s evidence check only
  works for `SENSE`-type targets with a `lexemeId` — the same
  `MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` limitation
  `docs/story-engine-implementation.md` §8 already records. No administrative
  privacy-erasure path exists yet (documented as future work, not built).

```bash
npm run curriculum:check   # PASS, unchanged
npm test                   # PASS 263/263 (217 phases 1-3 + 46 phase 4)
npm run typecheck          # PASS
npm run lint               # PASS, 0 errors, 1 pre-existing warning
npm run build              # PASS
```

Phase 5 (PostgreSQL / Persistence) implemented `StoryRepository` and
`LearnerEventRepository` against PostgreSQL, using the same interfaces
`InMemoryStoryRepository`/`InMemoryLearnerEventRepository` already satisfy —
both were converted to `Promise`-based contracts as part of phase 5 (a real
adapter cannot answer synchronously); see §16 and §9 of
`docs/story-engine-implementation.md`.

## 16. Phase 5 (PostgreSQL / Persistence) summary

```text
PHASE_5_POSTGRES = PASS
```

Full design rationale, decisions and audit are in `docs/persistence.md` and
`docs/data-model.md`. Short version:

- **Environment**: no PostgreSQL or Docker was available in this
  environment (checked `PATH`, `Program Files`, Windows services — none
  found). With the user's explicit authorization, `@electric-sql/pglite`
  (real PostgreSQL compiled to WASM, embedded in-process) was used instead
  of installing system-level software unilaterally. See
  `docs/persistence.md` §1 for `POSTGRES_SERVER_PARITY_TEST = PENDING_BEFORE_PRODUCTION`
  — the explicit list of what a networked server would still need to prove
  (SSL, real connection pooling, concurrent-process load,
  deployment/backup/replication) before production use.
- **DB access decision**: raw parameterized SQL against a thin
  `SqlClient`/`SqlDatabase` seam, no ORM — see `docs/persistence.md` §2 for
  the full criteria comparison. `db/pglite-database.ts` is the only file
  that imports `@electric-sql/pglite`; a future real-server adapter
  (`pg.Pool`-backed) implements the same two interfaces with no change to
  any migration, seed or repository file.
- **Database identity != published curriculum identity**: every id column
  is a `TEXT PRIMARY KEY` carrying the exact published string; no
  serial/UUID surrogate key exists anywhere in the schema.
- **Migrations**: `db/migrations/0001_lexical.sql` through
  `0004_learner_progress.sql`, plain versioned PostgreSQL DDL, idempotent
  (tracked in `schema_migrations`). Ordered lexical -> curriculum -> story
  engine -> learner progress so every foreign key points at a table that
  already exists.
- **Seed**: `seedCurriculum` inserts the entire `A1-CURRICULUM-v1.51` /
  `A1-LEXICON-v1.0` release in one transaction from the same
  `loadCurriculumRegistry()`/`loadLexicalEngine()` phases 1-2 already use —
  never by re-parsing CSV. Verified exact published counts: 8 modules, 11
  islands, 32 story blueprints, 985 targets (448 FOCUS + 537 SUPPORTED),
  2867 recycle edges, 599 lexemes, 666 forms, 608 senses (602 A1 + 6 A2
  boundary), 214 MWUs, 169 grammar units.
- **A published `StoryVersion`'s text is protected twice over**: no
  application code path issues an `UPDATE` on it, and a database trigger
  (`db/migrations/0003_story_engine.sql`) rejects one regardless — proven by
  a test that issues the raw `UPDATE` directly and expects it to fail.
- **`learner_events` is append-only twice over** the same way: the
  application interface has no update/delete method, and database triggers
  reject a raw `UPDATE`/`DELETE` too.
- **Lineage acyclicity re-validated in a transaction, not a `CHECK`**: a
  cycle spans the whole table, which a single-row constraint cannot express.
  `insertLineageEvent` re-runs phase 2's own `validateLineage` over every
  existing event plus the candidate before the insert commits; a direct
  two-node cycle (`A -> B`, `B -> A`) is proven rejected.
- **Contract parity proven directly**: one shared assertion suite
  (`features/persistence/__tests__/contract-parity.test.ts`) runs against
  `InMemoryStoryRepository`/`InMemoryLearnerEventRepository` and their
  PostgreSQL counterparts — the literal same-interface-same-behaviour check,
  not just two similar-looking test files.
- **`BLOCKER_PGLITE_PORTABILITY`**: none encountered. Every migration is
  plain, standard PostgreSQL DDL; the one syntax fix needed during
  development (quoting the reserved word `order`) is standard Postgres
  behavior, not a PGlite-specific workaround.
- **Known, deliberate debt**: no `surface_tokens` table exists (same gap
  `docs/story-engine-implementation.md` §8 already records — nothing writes
  a non-empty token list yet).

```bash
npm run curriculum:check   # PASS, unchanged
npm test                   # PASS 294/294 (263 phases 1-4 + 31 phase 5)
npm run typecheck          # PASS
npm run lint               # PASS, 0 errors, 1 pre-existing warning
npm run build              # PASS
```

## 17. Deuda A closure: `TargetEvidence` for all 985 targets

```text
PROGRESS_ALL_TARGET_TYPES        = PASS
CURRICULAR_TARGET_MODEL_COVERAGE = 985/985  (602 SENSE + 214 MWU_SOURCE_UNIT + 169 GRAMMAR_UNIT)
```

`ProgressProjection` previously reported evidence only for `SENSE` targets
carrying a `lexemeId`; the 214 `MWU_SOURCE_UNIT` and 169 `GRAMMAR_UNIT`
targets (383/985, including all 170 MWUs with `NO_LEXICAL_IDENTITY`) could
never show evidence. `features/learner-progress/domain/target-evidence.ts`
introduces `TargetEvidence` (`SenseTargetEvidence` / `MwuTargetEvidence` /
`GrammarTargetEvidence`, a closed union — `Sense != MWU != GrammarUnit`
throughout); `engine/target-evidence-projection.ts` resolves it via two
independent paths that never merge: `SENSE` through lexeme attribution
(unchanged, lineage-aware, same lexeme-level granularity as before) and
`MWU_SOURCE_UNIT`/`GRAMMAR_UNIT` through `StoryTargetBinding`, which needs no
`Lexeme` at all. No `Lexeme`, `Sense` or grammar-Lexeme is ever minted by this
path. Full rationale: `docs/learner-progress-implementation.md` §9.

`ProgressProjection` gained `breakdown: TargetTypeBreakdown` at every scope
(Story/Island/Module/Level): `{ SENSE, MWU_SOURCE_UNIT, GRAMMAR_UNIT, total }`,
each `{ total, withEvidence, withoutEvidence }`. `computedMastery` stays
`null` everywhere; `KNOWN` stays `USER_DECLARED_STATE`, never derived from
evidence count.

```bash
npm run curriculum:check   # PASS, unchanged
npm test                   # PASS 312/312 (294 phases 1-5 + 18 deuda A)
npm run typecheck          # PASS
npm run lint                # PASS, 0 errors, 1 pre-existing warning
npm run build               # PASS
```

## 18. Not yet started

Deuda B (PostgreSQL server parity harness) and phase 6 (NLP / Annotation
Assistant) had not started as of this section. See the top-of-file status
block, which this handoff keeps current as each closes.

Phase 6 (NLP) may proceed once a real environment decision is made about
`POSTGRES_SERVER_PARITY_TEST`; nothing in phases 1-5's public contracts
should need to change for that to happen.
