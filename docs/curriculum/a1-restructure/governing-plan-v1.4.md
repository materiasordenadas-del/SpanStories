# SpanStories — Governing plan A1 restructure 103 → 32

**Version:** 1.4  
**Status:** `ACTIVE — CURRICULUM RELEASE CANDIDATE READY`  
**Branch:** `prueba`

## Completed curricular stages

```text
ETAPA A — canonical audit                         COMPLETE
ETAPA B — 8/11/32 topology                       COMPLETE
ETAPA C — story/island migration traceability    COMPLETE
ETAPA D — load/final-transfer/capstone/recycling COMPLETE
ETAPA E — 985 target allocation + ID policy      COMPLETE / CORRECTED
ETAPA F — recycling graph                        COMPLETE
ETAPA G — formal DELE remap 13/13                COMPLETE
ETAPA H — schema + CSV release candidate + audit COMPLETE
```

## Approved candidate

```text
RELEASE_ID       = A1-CURRICULUM-v1.51
STATUS           = RC1
SCHEMA           = 2.0.0-rc1
MODULES          = 8
ISLANDS          = 11
STORIES          = 32
FIRST_INTRO      = 985
RECYCLE_EDGES    = 2867
DELE             = 13/13
DETERMINISM      = PASS
```

Closed decisions:

```text
D-A08 = release-neutral sequencing schema resolved
D-A09 = all 32 StoryBlueprints use new IDs
D-A10 = DELE 13/13 resolved
```

## Executable authority remains unchanged

The candidate is not yet the runtime release.

```text
EXECUTABLE = A1-CURRICULUM-v1.44
CANDIDATE  = A1-CURRICULUM-v1.51
```

`features/curriculum/import/sources.ts`, Fase 1 expectations and the generated registry still target v1.44. They are changed only by the later Claude Code migration.

## Remaining work before Claude Code

```text
D-A11 — historical respaldo manifest
implementation manifest
```

The respaldo step must identify exactly which v1.44 sequencing sources move to `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`, which shared files remain active, and their hashes.

The implementation manifest must tell Claude Code exactly what can change, what cannot change, new schemas/counts/IDs, importer expectations, tests and activation order.

## Non-negotiable gates

```text
CLAUDE_CODE_MIGRATION = BLOCKED UNTIL BOTH MANIFESTS COMPLETE
FASE_3 = BLOCKED
MAIN = DO NOT TOUCH
VISUAL_BASELINE = DO NOT TOUCH
RUNTIME_CSV_PARSING = PROHIBITED
```

After Claude migration:

```text
v1.51 importer/schema update
→ regenerate CurriculumRelease/registry
→ Fase 1 regression + corruption + determinism tests
→ Fase 2 compatibility revalidation
→ new handoff
→ only then re-specify Fase 3
```
