# SpanStories A1 — Current restructuring state v1.50

**Status:** `HUMAN_CURRICULAR_AUTHORITY_DURING_MIGRATION`  
**Date:** 2026-09-06  
**Executable curriculum remains:** A1 v1.44 until ETAPA H publishes a new CurriculumRelease.

## Architecture

```text
MODULES = 8
ISLANDS = 11
STORY_BLUEPRINTS = 32
FIRST_INTRO_OBJECTS = 985
```

## Stage status

```text
ETAPA A = COMPLETE
ETAPA B = COMPLETE / HARDENED
ETAPA C = COMPLETE
ETAPA D = COMPLETE
ETAPA E = COMPLETE / CORRECTED
ETAPA F = COMPLETE
ETAPA G = COMPLETE
ETAPA H = NEXT
```

## ETAPA E/F invariants

```text
FOCUS = 448
SUPPORTED = 537
MAX_FOCUS_PER_STORY = 20
B32-S32_FIRST_INTRODUCTIONS = 0
D-A09 = RESOLVED_NEW_IDS_FOR_ALL_32
FIRST_RETURN_EDGES  = 985
SECOND_RETURN_EDGES = 950
THIRD_RETURN_EDGES  = 932
TOTAL_RECYCLE_EDGES = 2867
```

## ETAPA G

```text
DELE_TASKS_PASS             = 13 / 13
READING                     = 4 / 4
LISTENING                   = 4 / 4
WRITING                     = 2 / 2
SPEAKING                    = 3 / 3
HISTORICAL_COMPAT_MAPPINGS = 24
NEW_COMPAT_MAPPINGS        = 24
UNIQUE_B32_STORIES_USED    = 16
BLOCKERS                    = 0
```

`D-A10 = RESOLVED`.

## Open decisions

```text
D-A08 = release-neutral sequencing schema
D-A11 = respaldo manifest
```

## Blocks

```text
FASE_3 = BLOCKED
CLAUDE_CODE_MIGRATION = BLOCKED
MAIN_BRANCH_CHANGES = PROHIBITED
```

Next:

> **ETAPA H — release-neutral schema + CSV release candidate + final audit.**
