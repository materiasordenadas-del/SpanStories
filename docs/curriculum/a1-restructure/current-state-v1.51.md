# SpanStories A1 — Current restructuring state v1.51

**Status:** `READY_FOR_CLAUDE_CODE_PHASE1_PHASE2_ATOMIC`  
**Executable curriculum:** `A1-CURRICULUM-v1.44`  
**Approved candidate:** `A1-CURRICULUM-v1.51` RC1  
**LexiconRelease actual:** `A1-LEXICON-v1.0`

```text
ETAPA A = COMPLETE
ETAPA B = COMPLETE / HARDENED
ETAPA C = COMPLETE
ETAPA D = COMPLETE
ETAPA E = COMPLETE / CORRECTED
ETAPA F = COMPLETE
ETAPA G = COMPLETE
ETAPA H = COMPLETE
POST-H BACKUP MANIFEST = COMPLETE
POST-H IMPLEMENTATION MANIFEST = COMPLETE / ATOMIC v1.1
```

Candidate invariants:

```text
MODULES = 8
ISLANDS = 11
STORIES = 32
FIRST_INTRO = 985
FOCUS = 448
SUPPORTED = 537
RECYCLE_EDGES = 2867
FIRST/SECOND/THIRD RETURNS = 985 / 950 / 932
DELE = 13/13
A2_AS_A1 = 0
REGIONAL_RECEPTIVE = 16
OLD_STORY_IDS_REUSED = 0
DETERMINISM = PASS
```

Resolved decisions:

```text
D-A08 = RESOLVED — release-neutral schema 2.0.0-rc1
D-A09 = RESOLVED — new IDs for all 32 Stories
D-A10 = RESOLVED — DELE 13/13
D-A11 = RESOLVED — v1.44 archive staged with SHA-256 manifest
```

Backup state:

```text
ARCHIVE = content/a1/vocabulary/respaldo/a1-curriculum-v1.44/
ARCHIVE_COPY = COMPLETE / BYTE-IDENTICAL
ROOT_V1_44_FILES = TEMPORARY COMPATIBILITY PIN
ROOT_V1_44_REMOVAL = ONLY DURING SUCCESSFUL V1.51 CUTOVER
```

Authorization state:

```text
CLAUDE_CODE_MIGRATION = AUTHORIZED ON prueba
EXECUTION_SCOPE = FASE 1 + FASE 2 IN SAME TASK
FASE_3_IMPLEMENTATION = PROHIBITED
MAIN = DO NOT TOUCH
```

Claude authority:

```text
docs/curriculum/a1-restructure/spanstories_plan_claude_code_migracion_a1_32_storyblueprints_v1.1.md
docs/curriculum/a1-restructure/spanstories_a1_implementation_manifest_v1.51.md
docs/curriculum/a1-restructure/spanstories_a1_implementation_manifest_phase1_phase2_atomic_v1.1.md
```

The v1.1 atomic manifest overrides any older instruction that says Claude should stop after Fase 1.

Required final gate:

```text
PHASE_1_MIGRATED = PASS
PHASE_2_REVALIDATED = PASS
CURRICULUM_RELEASE = A1-CURRICULUM-v1.51
LEXICON_RELEASE = A1-LEXICON-v1.0  # unless real lexical evidence requires a new release
PHASE_3_IMPLEMENTED = NO
PHASE_3_READY = YES
```

If Fase 1 or Fase 2 is not PASS, `PHASE_3_READY = NO`.
