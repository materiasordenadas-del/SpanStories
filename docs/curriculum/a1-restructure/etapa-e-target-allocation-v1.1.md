# ETAPA E — Redistribución de los 985 targets

**Estado:** `PASS_WITH_HARDENING_APPLIED`  
**Fecha:** 2026-09-06

## Result

```text
FIRST_INTRO_OBJECTS             = 985 / 985
FOCUS                           = 448
SUPPORTED                       = 537
FIRST_INTRO_DUPLICATES          = 0
CAPSTONE_FIRST_INTRO            = 0
FOCUS_OVER_20_STORIES           = 0
HOTSPOTS_OVER_40                = 7
UNREVIEWED_TOTAL_INTRO_HOTSPOTS = 0
A2_BOUNDARY_PROMOTED            = 0
TARGET_ID_CHANGES               = 0
```

## Deterministic allocation rule

The canonical v1.44 allocation already stores `first_introduction_story` for each target. ETAPA E therefore does not create a competing copy of the lexical authority.

For each canonical allocation row:

```text
target/allocation row
→ old first_introduction_story
→ ETAPA E migration rule
→ B32 Story
→ FOCUS | SUPPORTED
```

There are exactly 69 v1.44 StoryBlueprints with `new_target_count > 0`; their counts sum to 985.

The machine-readable transformation is:

`spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv`

## FOCUS / SUPPORTED

One primary narrative ancestor is selected for each B32 Story using editorial precedence:

```text
RETAINED > RECOMPOSED > MERGED
```

Targets introduced in the primary source Story become `FOCUS`. Targets inherited from secondary variation/extension Stories remain valid first introductions but become `SUPPORTED`.

Result:

```text
MAX_FOCUS_IN_ANY_STORY = 20
FOCUS_TOTAL = 448
SUPPORTED_TOTAL = 537
```

## Hotspots reviewed

```text
B32-S03 = 54 total / 18 FOCUS / 36 SUPPORTED
B32-S05 = 45 / 15 / 30
B32-S06 = 49 / 17 / 32
B32-S08 = 49 / 17 / 32
B32-S13 = 44 / 15 / 29
B32-S21 = 58 / 19 / 39
B32-S27 = 43 / 12 / 31
```

All seven pass review.

`B32-S21 — La compra con problema` additionally requires:

```text
AUTHORING_SEGMENTATION_REQUIRED
```

It should be authored as a multi-scene transaction rather than one dense passage.

## Stories with zero first introductions

```text
B32-S07 = 0
B32-S32 = 0
```

B32-S07 operates as an integration Story. B32-S32 remains the zero-introduction capstone required by ETAPA D.

## Recycling horizon fixed for ETAPA F

```text
N30 = 18
N31 = 35
B32-S32 first introductions = 0
```

Therefore:

```text
EXPECTED_RECYCLE_EDGE_COUNT
= 2955 - N30 - 2*N31
= 2955 - 18 - 70
= 2867
```

## Materialization note

The 985-row flat release candidate is intentionally deferred to ETAPA H. Until then the authoritative transformation is:

```text
sequencing_allocation_v1.44.csv
+
spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv
```

This prevents two editable copies of the same 985 target records from becoming competing authorities.

## ID warning

Several B32 Stories with a `RETAINED` primary ancestor also absorb target bindings from other old Stories. Published-ID reuse therefore remains unresolved:

```text
RETAINED != AUTOMATIC_ID_REUSE
```

`D-A09` must be closed against final bindings before ETAPA H publishes IDs.
