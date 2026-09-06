# ETAPA F — Nuevo recycling graph

**Versión:** 1.0  
**Estado:** `PASS`  
**Fecha:** 2026-09-06  
**Depende de:** ETAPA E v1.2 corregida

## 1. Definición del grafo

ETAPA F define el grafo mediante una matriz determinista por Story de primera introducción:

```text
target
→ ETAPA E new first_intro_story
→ etapa-f-recycling-route-matrix-v1.0.csv
→ FIRST_RETURN
→ SECOND_RETURN, si el horizonte lo permite
→ THIRD_RETURN, si el horizonte lo permite
```

No se crea todavía una segunda copia editable con 2867 filas target-level. ETAPA H materializará esa expansión dentro del release candidate.

La matriz de 30 rutas es suficiente para reconstruir de forma determinista las 2867 aristas porque B32-S07 y B32-S32 tienen 0 first introductions.

## 2. Conteo exacto

```text
FIRST_RETURN edges  = 985
SECOND_RETURN edges = 950
THIRD_RETURN edges  = 932
TOTAL                = 2867
```

Esto coincide con:

```text
985 + (985 - 35) + (985 - 18 - 35)
= 985 + 950 + 932
= 2867
```

## 3. Invariantes estructurales

```text
BACKWARD_EDGES                 = 0
SAME_STORY_EDGES               = 0
DUPLICATE_STAGE_DESTINATIONS   = 0
ROUTE_ORDER_VIOLATIONS         = 0
CYCLES                         = 0
CAPSTONE_FIRST_INTRODUCTIONS   = 0
```

Cada ruta satisface:

```text
intro_story
<
FIRST_RETURN
<
SECOND_RETURN, si existe
<
THIRD_RETURN, si existe
```

## 4. Distancia pedagógica

Distribución por stage:

```text
FIRST_RETURN
  SAME_ISLAND                = 690
  SAME_MODULE_CROSS_ISLAND   = 71
  CROSS_MODULE               = 224

SECOND_RETURN
  SAME_ISLAND                = 264
  SAME_MODULE_CROSS_ISLAND   = 214
  CROSS_MODULE               = 472

THIRD_RETURN
  SAME_ISLAND                = 0
  SAME_MODULE_CROSS_ISLAND   = 66
  CROSS_MODULE               = 866
```

El tercer retorno es deliberadamente el más distante:

```text
THIRD_RETURN_CROSS_MODULE = 866 / 932
```

No se fuerza la etiqueta “distant” cuando el horizonte final no lo permite; los stages siguen siendo `FIRST_RETURN / SECOND_RETURN / THIRD_RETURN`.

## 5. Checkpoints

Todas las Stories de cierre de isla reciben recycling entrante:

```text
ISLAND_CHECKPOINTS_WITH_RETURN_IN = 11 / 11
```

Todos los cierres de módulo reciben recycling entrante:

```text
MODULE_CHECKPOINTS_WITH_RETURN_IN = 8 / 8
```

Esto operacionaliza la política de ETAPA D sin crear Stories extra de final-transfer.

## 6. Carga de destinos

```text
MAX_RECYCLE_INBOUND = 127
MAX_INBOUND_STORY   = B32-S10
CAPSTONE_S32_INBOUND = 88
```

No hay destinos por encima de 130 recycle edges.

Los destinos con carga >=120 quedan marcados `REVIEWED_PASS` en `etapa-f-recycling-destination-load-v1.0.csv`.

El capstone recibe exactamente 88 returns y solo por compresión de horizonte desde S29/S30/S31; no se utiliza como depósito general de returns tempranos.

## 7. Modalidad e identidad

Las aristas no cambian la identidad del target ni su policy de modalidad.

```text
TARGET_ID_MUTATIONS            = 0
REGIONAL_PRODUCTIVE_UPGRADES   = 0
A2_BOUNDARY_AS_A1_RECYCLE      = 0
MASTERY_CLAIMS                 = 0
```

Los 16 regionalismos receptivos continúan `RECEPTIVE_ONLY` en cualquier return.

## 8. Materialización target-level

ETAPA H debe expandir:

```text
985-row target allocation
JOIN
30-row recycling route matrix
```

y producir exactamente:

```text
2867 target-level recycle edges
```

La expansión debe fallar si el conteo no coincide.

## 9. Estado

```text
ETAPA_F = COMPLETE
EXPECTED_TARGET_LEVEL_EDGES = 2867
FLAT_RELEASE_CSV = DEFERRED_TO_ETAPA_H
```
