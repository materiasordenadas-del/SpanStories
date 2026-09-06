# ETAPA C — Migration ledger 103 → 32

**Estado:** `PASS`  
**Fecha:** 2026-09-06

## Reconciliation

```text
OLD_STORY_BLUEPRINTS_ACCOUNTED_FOR = 103 / 103
NEW_STORY_BLUEPRINTS                = 32 / 32
UNMAPPED_OLD_BLUEPRINTS             = 0
ORPHAN_NEW_BLUEPRINTS               = 0
```

Disposition counts:

```text
RETAINED   = 21
RECOMPOSED = 12
MERGED     = 40
RETIRED    = 30
TOTAL      = 103
```

Old final-transfer handling:

```text
OLD_FINAL_TRANSFER_SLOTS                 = 32
FINAL_TRANSFER_SLOTS_RETIRED_AS_STORY    = 30
FINAL_TRANSFER_SLOTS_RECOMPOSED_AS_STORY = 2
```

The two old final-transfer slots that become substantive Stories are:

- `A1-M02-I01-S4 — ¿Quién es quién?` → `B32-S07`
- `A1-M05-I04-S3 — Compra con problema` → `B32-S21`

## Machine-readable traceability

Complete old-story accounting is split into two complementary files:

1. `spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv` — the 69 old StoryBlueprints that introduced targets; includes their ETAPA C disposition and successor.
2. `etapa-c-zero-intro-story-migration-34-v1.0.csv` — the remaining 34 zero-introduction StoryBlueprints.

Therefore:

```text
69 + 34 = 103
```

Island traceability is stored in:

`etapa-c-island-migration-32-to-11-v1.0.csv`

with:

```text
OLD_ISLAND_COUNT       = 32
NEW_ISLAND_COUNT       = 11
UNMAPPED_OLD_ISLANDS   = 0
MULTI_MAPPED_ISLANDS   = 0
```

## Identity warning

`RETAINED` means strong editorial continuity only. It does not authorize published-ID reuse.

ETAPA E later shows that several retained ancestors absorb additional target bindings, so:

```text
RETAINED != AUTOMATIC_ID_REUSE
```

`D-A09` remains open until release-candidate bindings are compared.

## Gate

No canonical runtime ID is published by ETAPA C. `B32-*` keys remain provisional. Fase 3 and Claude migration remain blocked.
