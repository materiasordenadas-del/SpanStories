# Handoff — phases 1 + 2 to phase 3 (Story Engine)

```text
PHASE_1_MIGRATED    = PASS
PHASE_2_REVALIDATED = PASS
PHASE_3_IMPLEMENTED = NO
PHASE_3_READY       = YES
```

## 1. Commits

Branch `prueba`. `main` untouched, no merge, no push.

- Initial HEAD for this migration: `4c550674761eb9220a6d8157fbf7ba0e3d9edde7`
- Final HEAD: recorded in the follow-up commit on this branch.
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
generated/curriculum/a1/                        the executable registry
content/a1/vocabulary/*.csv                      authoring authority (v1.51 + v1.37/v1.40)
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/   archived v1.44, read by nothing
docs/curriculum-import.md                       phase 1 documentation
docs/lexical-engine-implementation.md           phase 2 documentation
docs/curriculum/a1-restructure/                 the approved A–H curricular package
```

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
npm test                   # 159 tests (78 phase 1 + 81 phase 2), 0 fail
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
- **The v1.51 manifest hashes carried-over sources over LF-normalised bytes.**
  `curriculum-release-v1.51-rc1.json` records LF hashes for the three shared
  `v1.37`/`v1.40` files because the generator ran without CRLF conversion; a
  Windows checkout hashes them differently. The five v1.51 files match exactly
  on both. The repo has no `.gitattributes`; adding one would settle this, and
  is deliberately left out of a curriculum migration.
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

## 11. The legacy fixture

`lib/lexical-prototype.ts`, `components/story-reader.tsx` and
`content/a1/module-1/island-1/story-1.ts` are untouched. The fixture story still
uses invented ids (`lex-ir`, `sense-ir-move`) that are **not** curriculum ids.

No `BLOCKER_ID_COLLISION` occurred: the fixture ids share no namespace with the
v1.51 canonical ids. Mapping the fixture onto `LEX-A1-*` still requires an
editorial decision no published artefact supplies. **This is phase 3's to
retire.**

## 12. Not started, by design

`Story`, `StoryVersion`, `StoryOccurrence`, `TextAnchor`, `OccurrencePart`,
`StoryTargetBinding`, the processor and the publication validator. No Learner
Event Engine, mastery or progress engine, PostgreSQL, ORM, auth, NLP or
Python/spaCy. No file under `app/`, `components/visual/`,
`features/story-engine/` or `features/learner-progress/` was touched.

## 13. Open contradictions

No `BLOCKER_CONTRADICTION` was raised. One apparent conflict was investigated
and resolved from evidence — the manifest/on-disk SHA-256 divergence on the
three carried-over inventory files, which is a CRLF-vs-LF artefact and not a
content difference (§9). Nothing in the canonical CSVs or the generated registry
was modified to make sources agree.
