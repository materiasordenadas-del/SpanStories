# SpanStories — Governing plan A1 restructure 103 → 32

**Version:** 1.3  
**Status:** `SUPERSEDED_BY_v1.4`  
**Branch:** `prueba`

> Historical plan snapshot through ETAPA G. The active plan is `governing-plan-v1.4.md`.

## Closed objective

Replace the historical A1 sequencing architecture:

```text
8 modules
32 islands
103 StoryBlueprints
985 first-introduction objects
2955 recycle edges
```

with a new audited curriculum containing:

```text
8 modules
11 islands
exactly 32 StoryBlueprints
985 first-introduction objects preserved
2867 horizon-valid recycle edges
DELE task-structure coverage 13/13
```

without silent target deletion, CEFR promotion, identity rewriting or runtime CSV parsing.

## Authority hierarchy during migration

Until ETAPA H publishes a new `CurriculumRelease`:

```text
EXECUTABLE BASELINE
= v1.44 CSVs + current generated registry

MIGRATION AUTHORITY
= docs/curriculum/a1-restructure/*
```

The migration docs do not become runtime inputs.

## Completed stages at this snapshot

```text
ETAPA A — canonical audit                         COMPLETE
ETAPA B — 8/11/32 topology                       COMPLETE
ETAPA C — story/island migration traceability    COMPLETE
ETAPA D — load/final-transfer/capstone/recycling COMPLETE
ETAPA E — 985 target allocation + ID policy      COMPLETE / CORRECTED
ETAPA F — recycling graph                        COMPLETE
ETAPA G — formal DELE remap 13/13                COMPLETE
```

## Remaining stage at this snapshot

```text
ETAPA H — release-neutral schema + CSV release candidate + audit
```

Before Claude Code migration also close:

```text
D-A08 release-neutral sequencing schema
D-A11 respaldo manifest
implementation manifest
```

Closed decisions:

```text
D-A09 = all 32 new StoryBlueprints receive NEW canonical IDs
D-A10 = DELE remap 13/13 resolved
```

## Non-negotiable gates

```text
FASE_3 = BLOCKED
CLAUDE_CODE_MIGRATION = BLOCKED
```

Claude Code does not make curricular decisions. It receives already-approved migration artifacts.

## Runtime/architecture restrictions

Do not:

- touch `main`;
- redesign `components/visual/baseline-v1/`;
- start Fase 3;
- parse curricular CSV at runtime;
- modify lexical identity merely because Stories/islands change;
- promote A2 boundary targets into A1;
- reuse old Story IDs in the new release;
- alter source data to make counts pass;
- duplicate an active generated registry as a second authority.

## Current invariants at this snapshot

```text
MODULES                         = 8
ISLANDS                         = 11
STORY_BLUEPRINTS                = 32
FIRST_INTRO_OBJECTS             = 985
FOCUS                           = 448
SUPPORTED                       = 537
MAX_FOCUS_PER_STORY             = 20
B32-S32_FIRST_INTRODUCTIONS     = 0
NEW_STORY_IDS_REQUIRED          = 32 / 32
RECYCLE_FIRST_RETURN_EDGES      = 985
RECYCLE_SECOND_RETURN_EDGES     = 950
RECYCLE_THIRD_RETURN_EDGES      = 932
RECYCLE_EDGES_TOTAL             = 2867
BACKWARD_EDGES                  = 0
CYCLES                          = 0
ISLAND_CHECKPOINTS_WITH_RETURN  = 11 / 11
MODULE_CHECKPOINTS_WITH_RETURN  = 8 / 8
DELE_TASKS_PASS                 = 13 / 13
READING_TASKS                   = 4 / 4
LISTENING_TASKS                 = 4 / 4
WRITING_TASKS                   = 2 / 2
SPEAKING_TASKS                  = 3 / 3
DELE_COMPAT_MAPPINGS            = 24
```

## Archive policy

Once the new release is validated, superseded sequencing sources move under:

`content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`

Shared unchanged lexical/source inputs stay active rather than being copied into the historical archive.

The archive README/manifest must record originating HEAD, moved files, unchanged shared inputs and hashes.
