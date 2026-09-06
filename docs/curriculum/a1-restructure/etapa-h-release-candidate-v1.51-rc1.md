# ETAPA H — A1 CurriculumRelease v1.51 RC1

**Estado:** `PASS — RELEASE_CANDIDATE_READY`  
**Release ID:** `A1-CURRICULUM-v1.51`  
**Schema:** `2.0.0-rc1`  
**Runtime activation:** `NO`

## Conteos cerrados

```text
MODULES             = 8
ISLANDS             = 11
STORY_BLUEPRINTS    = 32

FIRST_INTRO_OBJECTS = 985
  SENSE             = 602
  GRAMMAR           = 169
  MWU               = 214

FOCUS               = 448
SUPPORTED           = 537
MAX_FOCUS/STORY     = 20

RECYCLE_EDGES       = 2867
  FIRST_RETURN      = 985
  SECOND_RETURN     = 950
  THIRD_RETURN      = 932

REGIONAL_RECEPTIVE  = 16
A2_AS_A1            = 0
DELE                = 13 / 13
```

## Identidad

```text
NEW_ISLAND_IDS       = 11
NEW_STORY_IDS        = 32
OLD_STORY_IDS_REUSED = 0
```

## Determinismo

El candidato se generó dos veces desde el mismo commit y los 8 archivos internos comparados resultaron byte-identical.

Hashes de los cinco CSV canónicos v1.51:

```text
architecture = f92ef63b83cb39f938cac35dcb107c6242bee20cf64dd96a51bb681bb2d517cd
allocation   = fa49a85a7ecbeda98159b937fa8c258126ecedcebd748605a23dcdfd66d01c3d
blueprints   = c0e7248e008cc46f369d5ce32ce6a6602b483328ac3b105adcd06dd817e40afd
recycling    = ad4c84f6130f235ec295db1487ca0ded9be00194f0b8dbb2b1fe8770e1bfb065
final_audit  = 0fceba0f9117bb4b7991d56e90d39015f36f60a4f31765b3b0b1a5cdfefebf63
```

## Autoridad

Los CSV v1.51 son **release candidate curricular**. Su presencia en `content/a1/vocabulary/` no activa el runtime.

```text
CURRENT_EXECUTABLE = A1-CURRICULUM-v1.44
CANDIDATE          = A1-CURRICULUM-v1.51
```

La activación requiere todavía:

1. Manifest de respaldo.
2. Implementation manifest.
3. Claude Code: importer/schema/expectations/registry.
4. Regresión Fase 1.
5. Revalidación Fase 2.
6. Solo entonces reespecificar/iniciar Fase 3.
