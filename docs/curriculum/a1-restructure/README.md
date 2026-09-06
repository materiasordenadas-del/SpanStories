# A1 curriculum restructure — 103 → 32 StoryBlueprints

This directory is the human-authority workspace for the A1 narrative restructuring while the executable registry still remains on audited v1.44 until Claude Code completes the technical cutover.

## Current status

```text
ETAPA A = COMPLETE
ETAPA B = COMPLETE / HARDENED
ETAPA C = COMPLETE
ETAPA D = COMPLETE
ETAPA E = COMPLETE / CORRECTED
ETAPA F = COMPLETE
ETAPA G = COMPLETE
ETAPA H = COMPLETE
D-A11 / BACKUP MANIFEST = COMPLETE
IMPLEMENTATION MANIFEST = COMPLETE
CLAUDE CODE MIGRATION = AUTHORIZED ON prueba
FASE 3 = BLOCKED
```

## Current releases

```text
EXECUTABLE BASELINE = A1-CURRICULUM-v1.44
APPROVED CANDIDATE  = A1-CURRICULUM-v1.51 RC1
SCHEMA               = 2.0.0-rc1
```

The v1.51 CSVs are present in `content/a1/vocabulary/`, but the current importer/registry has **not** been switched to them yet.

## Candidate invariants

```text
MODULES            = 8
ISLANDS            = 11
STORY_BLUEPRINTS   = 32
FIRST_INTRO        = 985
FOCUS              = 448
SUPPORTED          = 537
RECYCLE_EDGES      = 2867
RETURNS            = 985 / 950 / 932
DELE               = 13 / 13
A2_AS_A1           = 0
REGIONAL_RECEPTIVE = 16
OLD_STORY_ID_REUSE = 0
DETERMINISM        = PASS
```

## Canonical v1.51 candidate sources

- `content/a1/vocabulary/spanishstories_a1_ws_sequencing_architecture_v1.51.csv`
- `content/a1/vocabulary/spanishstories_a1_ws_sequencing_allocation_v1.51.csv`
- `content/a1/vocabulary/spanishstories_a1_ws_story_blueprints_v1.51.csv`
- `content/a1/vocabulary/spanishstories_a1_ws_recycling_edges_v1.51.csv`
- `content/a1/vocabulary/spanishstories_a1_ws_sequencing_final_audit_v1.51.csv`

Shared unchanged sources remain:

- `content/a1/vocabulary/spanishstories_a1_ws_normalization_master_v1.37.csv`
- `content/a1/vocabulary/spanishstories_a1_ws_source_assertions_modes_v1.40.csv`
- `content/a1/vocabulary/spanishstories_a1_ws_coverage_final_v1.40.csv`

## ETAPA H authority

- `current-state-v1.51.md`
- `etapa-h-schema-decision-v1.0.md`
- `etapa-h-release-candidate-v1.51-rc1.md`
- `etapa-h-release-audit-v1.0.csv`
- `curriculum-release-v1.51-rc1.json`
- `etapa-h-id-crosswalk-v1.51-rc1.csv`
- `generation-summary-v1.51-rc1.json`
- `tools/generate_v151_release_candidate.py`

The generator was executed twice from the same commit; all eight internal generated files were byte-identical.

## Post-H authority

### Historical backup

- `etapa-post-h-respaldo-manifest-v1.0.md`
- `content/a1/vocabulary/respaldo/README.md`
- `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/README.md`
- `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/archive-manifest-v1.44.json`
- five byte-identical v1.44 sequencing CSV copies under the same archive folder

The five v1.44 sequencing CSVs still present at `content/a1/vocabulary/` are temporary compatibility pins because Fase 1 currently executes v1.44. They are removed only as part of a successful v1.51 cutover after all tests pass.

### Claude Code implementation contract

- `spanstories_a1_implementation_manifest_v1.51.md`

This is the authoritative technical scope for the next Claude Code task. Claude may migrate Fase 1 on `prueba`; it may not make curricular decisions, modify v1.51 CSVs to satisfy tests, touch the visual baseline, start Fase 3, or touch `main`.

## Earlier stage artifacts

- `etapa-a-audit-v1.1.md`
- `etapa-b-topology-v1.1.md`
- `etapa-c-migration-ledger-v1.1.md`
- `etapa-c-island-migration-32-to-11-v1.0.csv`
- `etapa-c-zero-intro-story-migration-34-v1.0.csv`
- `etapa-d-load-transfer-capstone-recycling-v1.1.md`
- `etapa-e-target-allocation-v1.2.md`
- `spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv`
- `spanstories_a1_story_load_summary_etapa_e_v1.0.csv`
- `etapa-f-recycling-graph-v1.0.md`
- `etapa-f-recycling-route-matrix-v1.0.csv`
- `etapa-f-recycling-destination-load-v1.0.csv`
- `etapa-g-dele-remap-v1.0.md`
- `etapa-g-dele-remap-13-of-13-v1.0.csv`
- `etapa-g-dele-story-support-contract-v1.0.csv`

## Authority rule

Until Claude Code updates Fase 1 and regenerates the registry:

```text
EXECUTABLE AUTHORITY
= v1.44 sequencing CSVs selected by features/curriculum/import/sources.ts
+ generated/curriculum/a1/* current registry

APPROVED MIGRATION / RELEASE-CANDIDATE AUTHORITY
= v1.51 candidate CSVs
+ docs/curriculum/a1-restructure/*
```

Do not treat the mere presence of v1.51 files as runtime activation.

## Next step

```text
CLAUDE CODE:
activate A1-CURRICULUM-v1.51 in Fase 1
→ regenerate registry
→ run corruption + determinism + query regressions
→ remove root v1.44 compatibility pins only after green cutover
→ stop
```

After that, ChatGPT reviews Fase 1 and Fase 2 compatibility and only then prepares the new Fase 3 specification.
