# ETAPA A — Auditoría canónica A1 v1.44

**Estado:** `PASS`  
**Baseline:** `prueba@2bc6851ebf12085be5eccbff9af5ef0826ebe0b4`  
**Fecha:** 2026-09-06

## Invariantes auditados

```text
MODULES                    = 8
ISLANDS                    = 32
STORY_BLUEPRINTS           = 103
FIRST_INTRODUCTIONS        = 985
A1_SENSE_TARGETS           = 602
GRAMMAR_TARGETS            = 169
MWU_TARGETS                = 214
RECYCLE_EDGES              = 2955
RECYCLE_EDGES_PER_TARGET   = 3
A2_BOUNDARY_AS_A1          = 0
BACKWARD_OR_CYCLIC_EDGES   = 0
REGIONAL_RECEPTIVE_TARGETS = 16
BLOCKER_CONTRADICTION      = NO
```

## Canonical v1.44 sequencing blobs

```text
architecture    3290d72cf9a7ab676e217cb1e1fec75ea9b1d327
story_blueprints c53561a55440f0569c6699bd399d79b528a109a2
allocation      8fc1e2f2ecf813029772ddd3549fae3d8466ff39
recycling_edges 3f46344ac494c51519cdd1558dca33ef20448661
final_audit     cbf204fc0f6cc7c93aafa8053c5aece60406981a
```

## Structural finding

The 103 old StoryBlueprints are largely planning slots rather than 103 independent narratives:

```text
32 CONTEXTUAL_INPUT
32 VARIATION_AND_LOCAL_RECYCLING
32 TRANSFER_AND_RETRIEVAL
 7 EXTENSION_AND_TRANSFER_PREP
=103
```

Seven old islands required a fourth slot because of load balancing:

- M01-I03 ¿De dónde eres? — 54 first introductions
- M02-I01 Mi familia y mi gente — 45
- M02-I02 ¿Cómo es? — 49
- M02-I03 En casa — 49
- M03-I01 Fecha, hora y calendario — 55
- M03-I03 En clase — 44
- M08-I03 Información y mundo hispano — 53

Module totals:

```text
M01 = 128
M02 = 167
M03 = 146
M04 = 122
M05 = 118
M06 = 92
M07 = 93
M08 = 119
TOTAL = 985
```

## Required redesign decisions identified

The old `<=20 new targets/story` rule cannot coexist with 32 Stories and 985 first introductions. The old one-final-transfer-per-island rule also cannot be copied mechanically. The old three-return recycling policy and the zero-introduction capstone must be explicitly reconsidered rather than silently inherited.

## Historical archive candidates

At minimum, once a new release exists:

```text
spanishstories_a1_ws_sequencing_architecture_v1.44.csv
spanishstories_a1_ws_sequencing_allocation_v1.44.csv
spanishstories_a1_ws_story_blueprints_v1.44.csv
spanishstories_a1_ws_recycling_edges_v1.44.csv
spanishstories_a1_ws_sequencing_final_audit_v1.44.csv
```

Shared lexical inventories remain active if unchanged.

## Gate

ETAPA A does not modify content, importer, registry, generated files or Fase 1/2 code. Fase 3 remains blocked.
