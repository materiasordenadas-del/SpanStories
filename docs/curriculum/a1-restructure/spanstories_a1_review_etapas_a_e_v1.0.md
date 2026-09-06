# SpanStories — Revisión cruzada de ETAPAS A–E

**Versión:** 1.0  
**Fecha:** 2026-09-06  
**Rama auditada:** `prueba`  
**HEAD previo al push documental:** `2bc6851ebf12085be5eccbff9af5ef0826ebe0b4`  
**Estado global:** `PASS_WITH_HARDENING_APPLIED`

## 1. Resultado ejecutivo

La lógica curricular de ETAPAS A–E es coherente y puede continuar a ETAPA F. La revisión encontró defectos de documentación/operacionalización, no una contradicción del baseline:

1. ETAPA B seguía marcada como “pendiente de aprobación” aunque la topología 8/11/32 ya había sido aprobada.
2. El encabezado del maestro v1.48 enumeraba C/D/E como pendientes aunque ya estaban completadas.
3. Los artefactos A–E existían localmente pero no estaban versionados en GitHub.
4. ETAPA E estaba disponible como `.md` + `.xlsx`; para que GitHub tenga una representación textual/machine-readable se añaden dos CSV espejo: reglas 69→985 y resumen de 32 Stories.
5. `D-A09` (reuse de IDs) debe revisarse después de ETAPA E: muchas Stories `RETAINED` absorben first introductions de otros slots, por lo que “retained narrative ancestor” no equivale automáticamente a “safe published-ID reuse”.

## 2. ETAPA A — PASS

- baseline v1.44 reconciliado;
- 8 módulos / 32 islas / 103 StoryBlueprints;
- 985 first introductions;
- 2955 recycle edges;
- 985/985 targets con tres returns históricos;
- `BLOCKER_CONTRADICTION = NO`;
- hashes del baseline registrados.

No se detecta razón para reabrir ETAPA A.

## 3. ETAPA B — PASS con hardening documental

Topología aprobada:

```text
MODULES = 8
ISLANDS = 11
STORY_BLUEPRINTS = 32
```

Se corrige el estado del artefacto a `APPROVED_TOPOLOGY_WITH_MINOR_HARDENING`.

Las etiquetas narrativas provisionales no son schema ni enum canónico.

## 4. ETAPA C — PASS

```text
OLD_STORY_BLUEPRINTS_ACCOUNTED_FOR = 103/103
NEW_STORY_BLUEPRINTS = 32/32
UNMAPPED_OLD_BLUEPRINTS = 0
```

La trazabilidad 103→32 es suficiente para continuar.

`D-A09` queda deliberadamente abierto y debe cerrarse después de considerar los bindings resultantes de ETAPA E.

## 5. ETAPA D — PASS

La política resuelve la contradicción matemática del antiguo hard cap:

```text
FIRST_INTRO_OBJECTS = 985
MAX_FOCUS_FIRST_INTRO_TARGETS_PER_STORY = 20
B32-S32_FIRST_INTRODUCTIONS = 0
```

`TOTAL_FIRST_INTRO > 40` es review gate, no error automático.

La fórmula de recycling queda correctamente diferida hasta conocer `N30` y `N31`.

## 6. ETAPA E — PASS con hardening de materialización

```text
FIRST_INTRO_OBJECTS = 985/985
FOCUS = 448
SUPPORTED = 537
FOCUS_OVER_20_STORIES = 0
B32-S32_FIRST_INTRODUCTIONS = 0
N30 = 18
N31 = 35
EXPECTED_RECYCLE_EDGE_COUNT = 2867
```

La overlay de 69 reglas es determinista porque cada una de las 985 filas canónicas v1.44 ya tiene `first_introduction_story`.

Para evitar una dependencia en un workbook binario, GitHub conserva también:

- `spanstories_a1_target_allocation_rules_etapa_e_v1.0.csv`
- `spanstories_a1_story_load_summary_etapa_e_v1.0.csv`

La matriz plana de 985 filas se materializará en el release candidate de ETAPA H; hasta entonces la autoridad sigue siendo `sequencing_allocation_v1.44.csv` + overlay ETAPA E.

## 7. Riesgo que debe cerrarse antes de ETAPA H — IDs

ETAPA C advertía que una Story `RETAINED` puede perder la recomendación de conservar ID si ETAPA E cambia sustancialmente sus target bindings.

ETAPA E confirma que varias Stories nuevas con ancestro `RETAINED` agregan first introductions provenientes de slots antiguos secundarios. Por tanto:

```text
RETAINED != AUTOMATIC_ID_REUSE
```

`D-A09` no debe resolverse por título ni por ancestry nominal; debe comparar semántica, función y bindings finales.

## 8. Estado para continuar

```text
ETAPA_A = PASS
ETAPA_B = PASS_HARDENED
ETAPA_C = PASS
ETAPA_D = PASS
ETAPA_E = PASS_HARDENED

NEXT = ETAPA_F
FASE_3 = BLOCKED
CLAUDE_CODE_MIGRATION = BLOCKED
```

Siguen pendientes antes de Claude Code:

- ETAPA F — recycling graph;
- ETAPA G — remapeo DELE 13/13;
- ETAPA H — release candidate CSV + audit final;
- `D-A08` — schema release-neutral;
- `D-A09` — política final de IDs;
- `D-A11` — manifest de respaldo;
- implementation manifest.
