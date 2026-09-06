# ETAPA D — Load policy + final transfer + capstone + recycling

**Estado:** `PASS`  
**Fecha:** 2026-09-06  
**Target topology:** 8 modules / 11 islands / 32 StoryBlueprints

## 1. Load policy

All 985 first-introduction objects are preserved.

```text
FIRST_INTRO_OBJECTS = 985
```

The old rule `total new targets/story <= 20` is retired because it is mathematically incompatible with 32 Stories.

Replacement policy:

```text
intro_salience = FOCUS | SUPPORTED
MAX_FOCUS_FIRST_INTRO_TARGETS_PER_STORY = 20
```

`FOCUS` = targets foregrounded for explicit instructional attention.  
`SUPPORTED` = legitimate first introductions that occur with contextual/scaffolded support and are not simultaneously treated as the Story's main instructional load.

A Story may contain more than 20 total first-introduction objects, but no more than 20 may be FOCUS.

```text
TOTAL_FIRST_INTRO_COUNT > 40
→ HOTSPOT_REVIEW_REQUIRED
```

The >40 threshold is a review gate, not an automatic failure.

## 2. Final-transfer policy

The old invariant “one final-transfer Story per island” is retired.

Transfer/retrieval remains mandatory as a pedagogical function, but it may be realized inside a Story or activity/checkpoint rather than requiring a standalone StoryBlueprint.

This is why 30 of the old 32 final-transfer Story slots can retire as independent Stories without deleting their function.

## 3. Capstone

The new final Story remains integration-only:

```text
B32-S32_FIRST_INTRODUCTIONS = 0
B32-S32_FOCUS_FIRST_INTRODUCTIONS = 0
B32-S32_SUPPORTED_FIRST_INTRODUCTIONS = 0
```

The capstone is not an exhaustive replay of every target; it is an integrated multimodal transfer task over accumulated repertoire.

## 4. Recycling policy

The semantic three-return model remains:

```text
INTRO
→ FIRST_RETURN
→ SECOND_RETURN
→ THIRD_RETURN
```

but late-introduced targets cannot be assigned impossible future Stories.

Required returns by introduction position:

```text
S01–S29 → 3 returns
S30     → 2 returns
S31     → 1 return
S32     → no first introductions
```

Therefore the new edge count is derived after ETAPA E:

```text
RECYCLE_EDGE_COUNT
= 3 * 985 - N30 - 2*N31
```

where `N30` and `N31` are the first-introduction counts in B32-S30 and B32-S31.

## 5. Required invariants for ETAPA E/F

```text
FIRST_INTRO_OBJECTS                    = 985
FIRST_INTRO_DUPLICATES                 = 0
CAPSTONE_FIRST_INTRO                   = 0
MAX_FOCUS_FIRST_INTRO_PER_STORY        = 20
UNREVIEWED_TOTAL_INTRO_HOTSPOTS        = 0
BACKWARD_RECYCLE_EDGES                 = 0
```

Regional receptive-only policy and existing A1/A2 boundary authority must be preserved.

## 6. Decisions resolved

```text
D-A04 LOAD POLICY          = RESOLVED
D-A05 FINAL TRANSFER       = RESOLVED
D-A06 RECYCLING STAGES     = RESOLVED
D-A07 CAPSTONE POLICY      = RESOLVED
```

ETAPA D does not publish new IDs or CSV schemas. `D-A08`, `D-A09`, `D-A10`, `D-A11` remain outside its scope.
