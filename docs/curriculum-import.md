# Curriculum import (engine phase 1)

Turns the published A1 curriculum into a validated, reproducible registry that
runtime can query without ever parsing a CSV.

```text
content/a1/vocabulary/*.csv  ->  importer + validators  ->  generated/curriculum/a1/*.json
```

## Canonical sources

All eight artefacts live in `content/a1/vocabulary/` and are UTF-8 **with BOM**,
comma-delimited, RFC 4180 quoted, CRLF.

| File | Role |
| --- | --- |
| `spanishstories_a1_ws_normalization_master_v1.37.csv` | Lexeme / LexemeForm / Sense / MWU identity registries |
| `spanishstories_a1_ws_source_assertions_modes_v1.40.csv` | Published SourceAssertions and receptive/productive mode policy |
| `spanishstories_a1_ws_sequencing_architecture_v1.51.csv` | Islands; the eight modules are grouped from them |
| `spanishstories_a1_ws_sequencing_allocation_v1.51.csv` | First-introduction ledger; also the only source of grammar units |
| `spanishstories_a1_ws_story_blueprints_v1.51.csv` | Story blueprints |
| `spanishstories_a1_ws_recycling_edges_v1.51.csv` | Return graph over stories |
| `spanishstories_a1_ws_coverage_final_v1.40.csv` | Cross-validator (hashed, schema-checked) |
| `spanishstories_a1_ws_sequencing_final_audit_v1.51.csv` | Cross-validator; supplies published expected counts |

The importer reads them, never writes them. Every published column is either
consumed or explicitly listed as knowingly unused in
[`sources.ts`](../features/curriculum/import/sources.ts); an unaccounted-for
column fails the import as a schema change.

## Release identity

- `releaseId`: `A1-CURRICULUM-v1.51` — **the active baseline**
- `schemaVersion`: `curriculum-registry/2.0.0` (owned by this importer)
- Per-workstream curriculum versions are read from the files themselves
  (`1.37`, `1.40`) and cross-checked against the published filenames. The v1.51
  sequencing artefacts declare no in-file version column; the release version
  comes from the allocation filename.

The importer's `schemaVersion` is its own contract and is deliberately distinct
from the editorial schema version the curriculum manifest declares
(`2.0.0-rc1`). They version different things.

### Release history

| Release | Topology | Status |
| --- | --- | --- |
| `A1-CURRICULUM-v1.51` | 8 modules / 11 islands / 32 StoryBlueprints | **active baseline** |
| `A1-CURRICULUM-v1.44` | 8 modules / 32 islands / 103 StoryBlueprints | historical; superseded |

v1.44 is **not** the active release and its figures (103 stories, 32 islands,
2955 recycle edges) are historical. Its sequencing artefacts are archived
verbatim under `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`, with a
manifest recording the byte length and SHA-256 of each. Nothing in the active
code path reads them.

## Commands

```bash
npm run curriculum:import    # import and regenerate the registry
npm run curriculum:check     # validate only, write nothing
npm test                     # importer, query, corruption and determinism suites
npm run typecheck
npm run lint
```

The importer accepts `--source-dir=` and `--out-dir=` so tests and audits can
run against copies. Exit code is 0 on IMPORT OK and 1 on IMPORT FAIL.

## Generated registry

`generated/curriculum/a1/` (~4.3 MB), one canonical output tree:

```text
release.json           modules.json        islands.json      story-blueprints.json
lexemes.json           forms.json          senses.json       mwu-units.json
grammar-units.json     source-assertions.json                targets.json
recycle-edges.json
```

`release.json` is the manifest: source list with SHA-256 per file, declared
versions, expected vs actual counts, every invariant with its observed value,
and `contentHash`.

Query it through the feature boundary, never by reading the JSON ad hoc:

```ts
import { loadCurriculumRegistry } from "@/features/curriculum";

const registry = loadCurriculumRegistry();       // load once, not per request
registry.getSenseById("SENSE-A1-000001");
registry.getRecyclePath("SENSE-A1-000015");
```

## Invariants

Counts verified against the data (architecture criteria **and** the published
audit ledger, which agree):

```text
lexemes 599    forms 666    senses 608 (602 A1 + 6 A2 boundary)
MWU 214        grammar 169  modules 8    islands 11    stories 32
first introductions 985 = 448 FOCUS + 537 SUPPORTED   max 20 FOCUS per story
return edges 2867 = 985 FIRST + 950 SECOND + 932 THIRD
island checkpoints 11   module checkpoints 8   final-transfer stories 1
capstone first introductions 0    DELE task structures 13
regional receptive targets 16
```

The inventory half (lexemes, forms, senses, MWUs, grammar units) is unchanged
from v1.44: the restructure resequenced the narrative, not the lexicon.

Structural invariants, all observed at zero:

- orphan senses, forms, MWU links and SourceAssertions
- duplicate published ids
- unresolved references between any two artefacts
- A2 boundary senses scheduled as A1
- targets with more or fewer than one first introduction
- island ordering gaps (`global_island_order` must be a gapless 1..11)
- island prerequisites that do not precede their island
- checkpoints outside their own island or module, or flags that disagree with
  the architecture ledger
- first introductions landing on the capstone
- backward or self-referential return edges in the story sequence
- return routes out of order, with a repeated destination, or with a gap
  (`SECOND_RETURN` without `FIRST_RETURN`)
- return edges whose `relation_scope` misdescribes the topology they span
- return edges that alter the productive expectation of their target
- regional receptive targets carrying universal productive demand
- return edges claiming mastery
- stories breaching the published FOCUS guardrail
- story, island and module declared load disagreeing with the ledger
- version-stamped column names in the active sequencing schema

## Behaviour on error

Nothing is repaired, defaulted or dropped. Every problem becomes a
`CurriculumIssue` with `code`, `reason` and as much of
`sourceFile / row / line / recordId / field / referencedId / expected / actual`
as applies. Codes: `CURRICULUM_SOURCE_MISSING`, `CURRICULUM_PARSE_ERROR`,
`CURRICULUM_SCHEMA_MISMATCH`, `CURRICULUM_IMPORT_INVALID`,
`CURRICULUM_DUPLICATE_ID`, `CURRICULUM_REFERENCE_NOT_FOUND`,
`CURRICULUM_ID_PATTERN_INVALID`, `CURRICULUM_COUNT_MISMATCH`,
`CURRICULUM_RELEASE_MISMATCH`, `CURRICULUM_TARGET_INVALID`,
`CURRICULUM_SEQUENCE_INVALID`.

Any issue means **IMPORT FAIL**: `importCurriculum` returns
`status: "IMPORT_FAIL"` with the full list, `importCurriculumOrThrow` throws
`CurriculumImportError`. There is no partially valid release.

Query lookups distinguish an unknown id (`NOT_FOUND`) from a known id with no
rows (`FOUND` with `[]`) — grammar units legitimately have zero SourceAssertions.

## Determinism

Same source bytes + same importer version produce the same canonical output:
collections are sorted by published id (or curricular order), and `generatedAt`
is the only volatile field, excluded from `contentHash`. The determinism suite
imports twice under two different pinned clocks and compares.

## Findings in the published data

The v1.51 schema is release-neutral: the version-stamped columns that made v1.44
awkward to read (`v1_42_*`, `v1_43_*`, `v1_44_*`) are gone, and audit control
H-024 asserts they stay gone. The importer enforces that rather than trusting
it, scanning the published headers of all five sequencing artefacts.

Structural facts worth knowing:

1. **The architecture ledger publishes islands, not modules.** v1.51 carries
   eleven `ISLAND` rows and no `MODULE` row. The eight modules are reconstructed
   by grouping on `module_id`; `module_order`, `module_name` and `module_gate`
   are repeated on every island of a module, and the importer **fails** if two
   islands of one module disagree rather than taking the first value it read.
   A `MODULE` row would now be schema drift, not a row to skip.

2. **Return edges carry no `allocation_id`.** They address the target directly
   and name the story that introduced it, so the importer joins on the pair
   (`target_id`, `introduction_story`) and checks that pair against the
   allocation. An edge naming the wrong introduction story fails the import.

3. **Grammar units exist only in the allocation ledger.** There is no grammar
   registry file and no SourceAssertion addresses a `GRAM-A1-*` id. The importer
   builds the 169 grammar units from the ledger and records this as the reason
   `getSourceAssertionsForTarget` returns a valid empty list for them.

4. **`source_assertion_ids` is not homogeneous.** Sense rows carry `SA-A1-*`
   ids (758 refs, all resolving). Grammar rows carry the source-catalogue id
   `PCIC-02`, which is not an assertion id. MWU rows leave it empty and link by
   target id instead. The importer splits these into `sourceAssertionIds` and
   `sourceCatalogueRefs` rather than reporting 169 false FK errors or silently
   discarding the provenance.

5. **The v1.51 manifest's hashes for carried-over sources assume LF.**
   `docs/curriculum/a1-restructure/curriculum-release-v1.51-rc1.json` records
   SHA-256 for the three shared inventory files (`v1.37`, `v1.40`) computed over
   **LF-normalised** bytes, because the generator ran on a checkout without
   CRLF conversion. On a Windows checkout (`core.autocrlf=true`, no
   `.gitattributes`) the files on disk are CRLF and hash differently. The five
   v1.51 sequencing files match the manifest exactly on both, because the
   generator wrote them with CRLF line terminators itself. The content is
   identical either way — the three shared files are byte-for-byte what v1.44
   read — but a hash comparison against that manifest must normalise line
   endings first. `release.json` always records the bytes actually read.

6. **`oldStoryIdsReused = 0` (audit control H-022) is attested, not
   recomputed.** Proving it mechanically would require the importer to read the
   retired v1.44 id space, which is not a canonical source of the active
   release. The claim rests on the ETAPA H crosswalk
   (`docs/curriculum/a1-restructure/etapa-h-id-crosswalk-v1.51-rc1.csv`) and on
   the new ids occupying a disjoint island range (`I05`/`I06` against v1.44's
   `I01`–`I04`). The importer checks the two controls it *can* recompute —
   H-021 (32 new story ids) and H-023 (11 new island ids) — against the data.

## Not in scope for this phase

The Lexical Engine (phase 2), Story Engine, learner progress and mastery,
spaced repetition, adaptive recommendation, PostgreSQL/ORM/migrations, Python
NLP, authentication, and the real A1 stories. Phase 1 defines only the minimal
structural contracts (`Lexeme`, `LexemeForm`, `Sense`, …) the importer needs.
The prototypes in `lib/` and `components/` are untouched.
