# SpanStories — Governing plan A1 restructure 103 → 32

**Version:** 1.2  
**Status:** `ACTIVE`  
**Branch:** `prueba`

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

## Completed stages

```text
ETAPA A — canonical audit                         COMPLETE
ETAPA B — 8/11/32 topology                       COMPLETE
ETAPA C — story/island migration traceability    COMPLETE
ETAPA D — load/final-transfer/capstone/recycling COMPLETE
ETAPA E — 985 target allocation                  COMPLETE
```

## Remaining stages

```text
ETAPA F — rebuild recycling graph
ETAPA G — formal DELE remap 13/13
ETAPA H — release-neutral schema + CSV release candidate + audit
```

Before Claude Code migration also close:

```text
D-A08 release-neutral sequencing schema
D-A09 final published-ID decisions
D-A11 respaldo manifest
implementation manifest
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
- invent target IDs or reuse old Story IDs without D-A09 approval;
- alter source data to make counts pass;
- duplicate an active generated registry as a second authority.

## Current invariants after ETAPA E

```text
MODULES                         = 8
ISLANDS                         = 11
STORY_BLUEPRINTS                = 32
FIRST_INTRO_OBJECTS             = 985
FOCUS                           = 448
SUPPORTED                       = 537
MAX_FOCUS_PER_STORY             = 20
B32-S32_FIRST_INTRODUCTIONS     = 0
N30                             = 18
N31                             = 35
EXPECTED_ETAPA_F_RECYCLE_EDGES  = 2867
```

## Archive policy

Once the new release is validated, superseded sequencing sources move under:

`content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`

Shared unchanged lexical/source inputs stay active rather than being copied into the historical archive.

The archive README/manifest must record originating HEAD, moved files, unchanged shared inputs and hashes.
