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
| `spanishstories_a1_ws_sequencing_architecture_v1.44.csv` | Modules and islands |
| `spanishstories_a1_ws_sequencing_allocation_v1.44.csv` | First-introduction ledger; also the only source of grammar units |
| `spanishstories_a1_ws_story_blueprints_v1.44.csv` | Story blueprints |
| `spanishstories_a1_ws_recycling_edges_v1.44.csv` | Recycling graph over stories |
| `spanishstories_a1_ws_coverage_final_v1.40.csv` | Cross-validator (hashed, schema-checked) |
| `spanishstories_a1_ws_sequencing_final_audit_v1.44.csv` | Cross-validator; supplies published expected counts |

The importer reads them, never writes them. Every published column is either
consumed or explicitly listed as knowingly unused in
[`sources.ts`](../features/curriculum/import/sources.ts); an unaccounted-for
column fails the import as a schema change.

## Release identity

- `releaseId`: `A1-CURRICULUM-v1.44`
- `schemaVersion`: `curriculum-registry/1.0.0` (owned by this importer)
- Per-workstream curriculum versions are read from the files themselves
  (`1.37`, `1.40`, `1.44`) and cross-checked against the published filenames.

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

`generated/curriculum/a1/` (~5.2 MB), one canonical output tree:

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
MWU 214        grammar 169  modules 8    islands 32    stories 103
first introductions 985      recycle edges 2955
```

Structural invariants, all observed at zero:

- orphan senses, forms, MWU links and SourceAssertions
- duplicate published ids
- unresolved references between any two artefacts
- A2 boundary senses scheduled as A1
- targets with more or fewer than one first introduction
- backward or self-referential recycle edges in the story sequence
- recycling routes out of order (introduction < local < near < third leg)
- regional receptive targets carrying universal productive demand
- recycle edges claiming mastery
- story and island declared load disagreeing with the ledger

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

Two columns look authoritative but are superseded snapshots. Both were resolved
against the data, not by preference:

1. **`v1_43_*` story columns in the allocation ledger.** The unprefixed columns
   (`first_introduction_story`, `local_reuse_story`, `near_transfer_story`,
   `distant_or_terminal_story`) agree with the v1.44 recycling edges on
   2837/2837 destinations and 985/985 introductions; the `v1_43_*` columns agree
   on only 1225/2837 and 738/985. The unprefixed columns are the v1.44
   authority; the importer reads those and ignores the `v1_43_*` snapshot.

2. **`v1_42_total_first_intro_objects` in the architecture file.** Its *total*
   is still 985, but its *distribution* was changed by phase 16C (capstone
   integration correction) and 16D (load balancing): nine islands and four
   modules now differ. The decisive case is the capstone island `A1-M08-I04`,
   credited with 20 introductions while all three of its v1.44 story blueprints
   declare `new_target_count = 0` and published audit control SEQ16D-011 records
   "Capstone first introductions: expected 0, observed 0, PASS". The importer
   keeps the figure as `plannedFirstIntroObjectsV142`, validates that it still
   totals 985, and does not treat its per-island layout as a v1.44 expectation.
   The v1.44-era column in the same file (`v1_44_story_blueprint_count`) does
   match the data and *is* validated per island.

Two further structural facts worth knowing before phase 2:

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

## Not in scope for this phase

The Lexical Engine (phase 2), Story Engine, learner progress and mastery,
spaced repetition, adaptive recommendation, PostgreSQL/ORM/migrations, Python
NLP, authentication, and the real A1 stories. Phase 1 defines only the minimal
structural contracts (`Lexeme`, `LexemeForm`, `Sense`, …) the importer needs.
The prototypes in `lib/` and `components/` are untouched.
