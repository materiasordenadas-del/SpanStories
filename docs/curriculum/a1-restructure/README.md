# A1 curriculum restructure — 103 → 32 StoryBlueprints

This directory is the human-authority workspace for the A1 narrative restructuring while the executable curriculum remains on audited v1.44.

## Current status

```text
ETAPA A = COMPLETE
ETAPA B = COMPLETE / HARDENED
ETAPA C = COMPLETE
ETAPA D = COMPLETE
ETAPA E = COMPLETE / HARDENED
ETAPA F = NEXT
FASE 3 = BLOCKED
CLAUDE CODE MIGRATION = BLOCKED
```

## Governing baseline

- Branch: `prueba`
- Historical executable curriculum: A1 v1.44
- Approved target topology: 8 modules / 11 islands / 32 StoryBlueprints
- Inventory preserved: 985 first-introduction objects
- ETAPA E allocation: 448 FOCUS / 537 SUPPORTED
- Expected ETAPA F recycle edges: 2867

## Documents

- `governing-plan-v1.2.md` — migration scope, authority and gates
- `current-state-v1.48.md` — current human curricular state
- `etapa-a-audit-v1.1.md` — frozen v1.44 baseline
- `etapa-b-topology-v1.1.md` — approved 8/11/32 architecture
- `etapa-c-migration-ledger-v1.1.md` — 103→32 reconciliation summary
- `etapa-d-load-transfer-capstone-recycling-v1.1.md` — load/final-transfer/capstone/recycling policy
- `etapa-e-target-allocation-v1.1.md` — 985-target allocation decision
- `spanstories_a1_review_etapas_a_e_v1.0.md` — cross-stage review and hardening findings

## Machine-readable migration data

- `spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv` — 69 old intro-bearing Stories; together account for all 985 first-introduction objects
- `etapa-c-zero-intro-story-migration-34-v1.0.csv` — remaining 34 old zero-introduction Stories
- `etapa-c-island-migration-32-to-11-v1.0.csv` — complete old-island → new-island mapping
- `spanstories_a1_story_load_summary_etapa_e_v1.0.csv` — load/FOCUS/SUPPORTED summary for all 32 B32 Stories

Story accounting is therefore complete:

```text
69 intro-bearing old Stories
+34 zero-intro old Stories
=103 / 103 old StoryBlueprints accounted for
```

## Authority rule

Until ETAPA H publishes a new audited `CurriculumRelease`:

```text
EXECUTABLE AUTHORITY
= content/a1/vocabulary/* v1.44 sequencing CSVs
+ generated/curriculum/a1/* current registry

HUMAN MIGRATION AUTHORITY
= docs/curriculum/a1-restructure/*
```

The restructuring documents are not runtime inputs and do not authorize Fase 3.

A separate giant copy of the historical curriculum master is not treated as a second active authority during migration; `current-state-v1.48.md` records the approved delta/state until the new release candidate is materialized in ETAPA H.
