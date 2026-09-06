# ETAPA H — Decisión de schema release-neutral v1.0

**Estado:** `D-A08_RESOLVED`  
**Candidate:** `A1-CURRICULUM-v1.51` / RC1  
**Schema:** `2.0.0-rc1`

## Principio

Los nuevos CSV de secuenciación no publican columnas `v1_41_*`, `v1_42_*`, `v1_43_*` ni `v1_44_*` como autoridad activa. La historia de esas columnas permanece en el release v1.44 y posteriormente en `respaldo/`.

## Arquitectura

`spanishstories_a1_ws_sequencing_architecture_v1.51.csv`

```text
record_type
sequence_id
module_id
module_order
module_name
island_id
island_order
global_island_order
island_name
communicative_goal
design_role
story_count
island_checkpoint_story_id
module_checkpoint_story_id
hard_prerequisite
recycling_policy
module_gate
allocation_status
notes
```

## StoryBlueprint

`spanishstories_a1_ws_story_blueprints_v1.51.csv`

El release separa explícitamente:

```text
first_intro_target_count
focus_first_intro_count
supported_first_intro_count

first_return_in_count
second_return_in_count
third_return_in_count

is_island_checkpoint
is_module_checkpoint
is_final_transfer_story
```

`story_role` queda reducido a semántica narrativa release-neutral:

```text
NARRATIVE
INTEGRATION
CAPSTONE
```

Los labels analíticos de ETAPA B no se convierten en enum.

## Allocation

`spanishstories_a1_ws_sequencing_allocation_v1.51.csv`

La identidad/evidencia del target v1.44 se conserva; la colocación se publica con:

```text
module_id
island_id
story_id
intro_salience = FOCUS | SUPPORTED
```

Los IDs `SEQ-A1-*` se conservan porque el objeto de allocation sigue siendo la única primera introducción del mismo target; cambia su ubicación curricular, no la identidad del target/allocation.

## Recycling

`spanishstories_a1_ws_recycling_edges_v1.51.csv`

El antiguo modelo ancho `local/near/third` se normaliza a una fila por retorno:

```text
introduction_story
return_stage = FIRST_RETURN | SECOND_RETURN | THIRD_RETURN
return_story
relation_scope
expected_receptive
expected_productive
mastery_claim
```

Esto permite 3/2/1 returns según horizonte sin columnas ficticias vacías.

## IDs

Todos los IDs de las 11 islas y 32 Stories son nuevos y compatibles con los validators actuales:

```text
IslandId         = A1-Mxx-Ixx
StoryBlueprintId = A1-Mxx-Ixx-Sx
```

No se reutiliza ningún StoryBlueprint ID v1.44.

## Consecuencia técnica

El importer actual de Fase 1 **no debe consumir v1.51 todavía**. Claude Code deberá actualizar schema/parser/domain adapters y expectativas antes de activar el release. Hasta entonces:

```text
EXECUTABLE_RELEASE = A1-CURRICULUM-v1.44
RELEASE_CANDIDATE  = A1-CURRICULUM-v1.51
```
