# SpanStories A1 — Current restructuring state v1.48

**Status:** `HUMAN_CURRICULAR_AUTHORITY_DURING_MIGRATION`  
**Date:** 2026-09-06  
**Executable curriculum remains:** A1 v1.44 until ETAPA H publishes a new CurriculumRelease.

## Current approved architecture

```text
MODULES = 8
ISLANDS = 11
STORY_BLUEPRINTS = 32
```

## Preserved linguistic inventory

```text
LEXEMES = 599
FORMS = 666 registry forms
SENSES = 608 total
A1_SENSES = 602
A2_BOUNDARY_SENSES = 6
MWU = 214
GRAMMAR_UNITS = 169
FIRST_INTRO_OBJECTS = 985
```

No lexical identity change is authorized by the narrative restructure.

## Stage status

```text
ETAPA A = COMPLETE
ETAPA B = COMPLETE / HARDENED
ETAPA C = COMPLETE
ETAPA D = COMPLETE
ETAPA E = COMPLETE / HARDENED
ETAPA F = NEXT
```

## ETAPA E allocation

```text
FIRST_INTRO_OBJECTS = 985/985
FOCUS = 448
SUPPORTED = 537
MAX_FOCUS_PER_STORY = 20
B32-S32_FIRST_INTRODUCTIONS = 0
N30 = 18
N31 = 35
EXPECTED_ETAPA_F_RECYCLE_EDGES = 2867
```

## Important authority rule

This file and the other documents in this directory are the human migration authority. They do not replace the executable v1.44 registry yet.

The new technical release only becomes authoritative after:

1. ETAPA F — recycling graph;
2. ETAPA G — formal DELE 13/13 remap;
3. ETAPA H — release-neutral schema, CSV release candidate and final audit;
4. archive manifest;
5. implementation manifest;
6. Claude Code migration and importer/registry verification.

## Open decisions

```text
D-A08 = release-neutral sequencing schema
D-A09 = final Story ID retain/new decisions
D-A10 = DELE remap 13/13
D-A11 = respaldo manifest
```

`RETAINED` ancestry is not sufficient to reuse a published Story ID. Final bindings must be compared first.

## Blocks

```text
FASE_3 = BLOCKED
CLAUDE_CODE_MIGRATION = BLOCKED
MAIN_BRANCH_CHANGES = PROHIBITED
```
