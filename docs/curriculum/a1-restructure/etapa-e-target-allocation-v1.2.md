# ETAPA E — Redistribución de los 985 targets

**Revisión:** 1.2  
**Estado:** `PASS_CORRECTED`  
**Fecha:** 2026-09-06

## Resultado

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
```

La asignación de targets no cambia respecto de ETAPA E v1.1.

## Corrección normativa de identidad

La advertencia anterior sobre posible reutilización de IDs queda cerrada.

```text
D-A09 = RESOLVED_NEW_IDS_FOR_ALL_32
```

Regla:

```text
ALL 32 NEW STORYBLUEPRINTS
→ receive NEW canonical published IDs in ETAPA H

ALL 103 v1.44 STORYBLUEPRINT IDs
→ are never reused for the new release
→ remain historical and traceable through the migration ledger
```

Por tanto:

```text
RETAINED
= strong editorial ancestry only

RETAINED
!= same technical identity
!= published-ID reuse candidate
```

La razón es estructural: la arquitectura 103 → 32 cambia fronteras narrativas, bindings de targets, funciones de transferencia y contexto de Story. Reutilizar selectivamente IDs antiguos añadiría una distinción frágil y difícil de auditar sin aportar valor curricular.

ETAPA H asignará los 32 IDs definitivos de forma determinista y documentará lineage/migration desde los IDs v1.44.

## Autoridad de asignación

La transformación sigue siendo:

```text
sequencing_allocation_v1.44.csv
+
spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv
```

hasta que ETAPA H materialice el CSV plano del nuevo release.

## Parámetros para ETAPA F

```text
N30 = 18
N31 = 35
B32-S32_FIRST_INTRODUCTIONS = 0
EXPECTED_RECYCLE_EDGE_COUNT = 2867
```
