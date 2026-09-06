# A1 curriculum restructure — 103 → 32 StoryBlueprints

This directory is the human-authority workspace for the A1 narrative restructuring while the executable registry still remains on audited v1.44.

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
FASE 3 = BLOCKED
CLAUDE CODE MIGRATION = BLOCKED UNTIL MANIFESTS ARE COMPLETE
```

## Current releases

```text
EXECUTABLE BASELINE = A1-CURRICULUM-v1.44
APPROVED CANDIDATE  = A1-CURRICULUM-v1.51 RC1
SCHEMA               = 2.0.0-rc1
```

The v1.51 CSVs are present in `content/a1/vocabulary/`, but the current importer/registry has **not** been switched to them.

## Candidate invariants

```text
MODULES            = 8
ISLANDS            = 11
STORY_BLUEPRINTS   = 32
FIRST_INTRO        = 985
FOCUS              = 448
SUPPORTED          = 537
RECYCLE_EDGES      = 2867
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

## Remaining pre-Claude work

```text
[ ] D-A11 / Manifest de respaldo
[ ] Implementation manifest
```

Only after both manifests are closed may Claude Code migrate Fase 1 to v1.51. Fase 3 remains blocked until Fase 1 is regenerated/verified and Fase 2 is revalidated.
