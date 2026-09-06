# POST-H 2/2 — Implementation Manifest para Claude Code

**Estado:** `READY_FOR_CLAUDE_CODE`  
**Fecha:** 2026-09-06  
**Repositorio:** `materiasordenadas-del/SpanStories`  
**Rama autorizada:** `prueba`  
**Rama prohibida:** `main`  
**Baseline ejecutable al inicio:** `A1-CURRICULUM-v1.44`  
**Objetivo de cutover:** `A1-CURRICULUM-v1.51` RC1  
**Fase 3:** `BLOCKED`

---

## 1. Objetivo técnico exacto

Migrar Fase 1 — Curriculum Importer / Registry — para que el runtime deje de importar la secuenciación v1.44 y pase a importar de forma determinista el release candidate curricular v1.51 aprobado en ETAPAS A–H.

La tarea termina cuando:

```text
CSV v1.51
→ schema/input validation
→ canonical domain
→ cross validators
→ CurriculumRelease
→ SHA-256/source manifest
→ generated/curriculum/a1
→ query API
→ tests
```

pasa completo con los invariantes v1.51.

Esta tarea **no crea historias finales**, no implementa Progress Engine y no inicia Fase 3.

---

## 2. Auditoría obligatoria antes de escribir código

Antes de modificar un archivo, Claude debe registrar:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
node --version
npm --version
```

Debe confirmar:

```text
branch = prueba
working tree = understood / no cambios ajenos pisados
Node >= 20.9.0
```

Después debe inspeccionar y contabilizar las fuentes reales, sus headers y relaciones. No puede asumir que este manifest o cualquier `.md` coincide con los CSV.

Debe ejecutar como baseline:

```bash
npm test
npm run typecheck
npm run lint
npm run curriculum:check
```

Si el baseline falla antes de sus cambios, debe distinguir fallo preexistente de fallo introducido.

### BLOCKER_CONTRADICTION

Si arquitectura, CSV, manifest, importer o tests se contradicen de forma material:

```text
BLOCKER_CONTRADICTION
```

Claude debe detener la migración y reportar:

1. archivos en conflicto;
2. valores exactos incompatibles;
3. evidencia de cada lado;
4. por qué no puede resolverse mecánicamente.

**Prohibido** editar, recortar, duplicar, rellenar o reordenar datos para forzar conteos esperados.

---

## 3. Fuentes canónicas del release v1.51

### Fuentes compartidas que siguen activas

```text
content/a1/vocabulary/spanishstories_a1_ws_normalization_master_v1.37.csv
content/a1/vocabulary/spanishstories_a1_ws_source_assertions_modes_v1.40.csv
content/a1/vocabulary/spanishstories_a1_ws_coverage_final_v1.40.csv
```

### Fuentes de secuenciación v1.51

```text
content/a1/vocabulary/spanishstories_a1_ws_sequencing_architecture_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_sequencing_allocation_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_story_blueprints_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_recycling_edges_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_sequencing_final_audit_v1.51.csv
```

### Manifest curricular aprobado

```text
docs/curriculum/a1-restructure/curriculum-release-v1.51-rc1.json
```

Claude debe comprobar SHA-256 y conteos contra ese manifest. Si los bytes reales no coinciden, no debe actualizar los hashes del manifest para hacer pasar la prueba: debe reportar contradicción.

---

## 4. Invariantes v1.51 no negociables

```text
lexemes = 599
lexemeForms = 666
senseRegistry = 608
a1Senses = 602
a2BoundarySenses = 6
mwuUnits = 214
grammarUnits = 169

modules = 8
islands = 11
storyBlueprints = 32
firstIntroductions = 985

focus = 448
supported = 537
maxFocusPerStory = 20

recycleEdges = 2867
firstReturnEdges = 985
secondReturnEdges = 950
thirdReturnEdges = 932

orphanSenses = 0
orphanForms = 0
a2BoundaryScheduledAsA1 = 0
backwardRecycleEdges = 0
duplicatePublishedIds = 0
regionalReceptiveTargets = 16
regionalTargetsWithUniversalProductiveDemand = 0
recycleEdgesClaimingMastery = 0

islandCheckpoints = 11
moduleCheckpoints = 8
dedicatedFinalTransferStories = 1
capstoneFirstIntroductions = 0
oldStoryIdsReused = 0
DELETaskStructures = 13
```

No conservar `2955`, `32 islands` o `103 stories` como expectativas activas por compatibilidad con código antiguo.

---

## 5. Contrato de schema v1.51

El schema curricular activo es release-neutral. No recrear campos `v1_41_*`, `v1_42_*`, `v1_43_*`, `v1_44_*` en el nuevo modelo para ahorrar cambios de código.

### 5.1 Arquitectura

Header real:

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

v1.51 publica **11 filas `ISLAND`**, no la estructura antigua con filas `MODULE` + `ISLAND`.

El importer debe construir los 8 módulos de forma determinista agrupando las islas por `module_id` y verificando que los atributos repetidos de módulo sean coherentes. No inventar información ausente.

Cada isla debe validar:

- `story_count` contra StoryBlueprints reales;
- `island_checkpoint_story_id` dentro de la misma isla;
- `module_checkpoint_story_id`, cuando exista, como Story del mismo módulo;
- `hard_prerequisite` contra una isla anterior o `NONE`;
- `global_island_order` estrictamente 1..11.

### 5.2 Allocation

Header real:

```text
allocation_id
target_type
target_id
item
lexeme_id
sense_id
source_record_id
object_class
sense_status
expected_receptive
expected_productive
formulaic_expectation
grammar_pcic_section
grammar_category
grammar_kind
mwu_object_class
mwu_subtype
module_id
module_name
island_id
island_name
story_id
intro_salience
allocation_authority
allocation_basis
allocation_reason
source_assertion_ids
regional_policy
story_blueprint_status
notes
```

Cambios obligatorios respecto de v1.44:

- `first_introduction_story` → `story_id`;
- `first_introduction_island` → `island_id`;
- desaparece `recycle_route_class` del allocation;
- aparece `intro_salience = FOCUS | SUPPORTED`;
- los 985 `SEQ-A1-*` se conservan porque siguen representando la única primera introducción del mismo target.

Validar:

```text
FOCUS + SUPPORTED = 985
FOCUS = 448
SUPPORTED = 537
```

No convertir `SUPPORTED` en segunda introducción. Sigue existiendo una sola first introduction por target.

### 5.3 StoryBlueprints

Campos de scheduling que el importer debe comprender:

```text
first_intro_target_count
focus_first_intro_count
supported_first_intro_count
first_return_in_count
second_return_in_count
third_return_in_count
regional_receptive_return_in_count
scheduled_relation_count
focus_guardrail
is_island_checkpoint
is_module_checkpoint
is_final_transfer_story
dele_task_ids
required_modalities
```

Roles release-neutral válidos:

```text
NARRATIVE
INTEGRATION
CAPSTONE
```

No reintroducir como enums canónicos los labels analíticos de ETAPA B.

Validaciones mínimas por Story:

```text
focus_first_intro_count + supported_first_intro_count = first_intro_target_count
focus_first_intro_count <= 20
story count per island = architecture.story_count
first intro count = allocation rows pointing to story
return counts = recycling rows pointing to story by return_stage
scheduled_relation_count = first introductions + incoming recycling relations, según contrato publicado
checkpoint flags = architecture checkpoint references
```

`A1-M08-I06-S3` debe conservar:

```text
is_final_transfer_story = YES
first_intro_target_count = 0
```

### 5.4 Recycling

Header real:

```text
edge_id
target_type
target_id
introduction_story
return_stage
return_story
relation_scope
evidence_demand
expected_receptive
expected_productive
mastery_claim
notes
```

El modelo antiguo de:

```text
edge_type
from_story_id
to_story_id
route_class
LOCAL / NEAR / THIRD
```

queda sustituido.

Nuevo orden cerrado:

```text
FIRST_RETURN
SECOND_RETURN
THIRD_RETURN
```

Cada edge debe apuntar al target de una allocation existente y `introduction_story` debe ser exactamente el `story_id` de esa allocation.

Para un target:

```text
1..3 returns
sin destinos duplicados
cada return_story posterior a introduction_story
FIRST < SECOND < THIRD cuando existan
```

No exigir 3 edges a todos los targets. El horizonte final produce:

```text
985 FIRST_RETURN
950 SECOND_RETURN
932 THIRD_RETURN
```

`mastery_claim` debe seguir siendo `NONE` en 2867/2867 edges.

---

## 6. Domain model esperado

Claude debe refactorizar `features/curriculum/domain/model.ts` para representar v1.51 y eliminar acoplamiento semántico a v1.42/v1.44.

### Mantener sin cambio semántico

```text
Lexeme
LexemeForm
Sense
MwuUnit
GrammarUnit
SourceAssertion
TargetType
SenseStatus
```

### Adaptar

`CurriculumModule` y `Island` deben representar topología/checkpoints v1.51 sin campos históricos versionados.

`StoryBlueprint` debe exponer al menos los conteos FOCUS/SUPPORTED/returns, flags de checkpoint/final transfer y contratos DELE/modality necesarios por query/validación.

`CurriculumTarget` debe conservar identidad, evidencia, mode policy y una sola primera introducción, añadiendo `introSalience`.

`RecycleEdge` debe representar `returnStage`, `introductionStoryId`, `returnStoryId`, `relationScope`, `evidenceDemand`, modo esperado y `masteryClaim`.

Si mantener un alias interno temporal facilita la migración, ese alias no puede filtrarse al registry final como semántica v1.44.

---

## 7. Archivos de código autorizados

Claude puede modificar, cuando sea necesario:

```text
features/curriculum/domain/model.ts
features/curriculum/domain/release.ts
features/curriculum/domain/ids.ts                 # solo si la validación de IDs lo exige; los IDs v1.51 ya respetan el patrón existente
features/curriculum/domain/errors.ts              # solo para errores nuevos de validación

features/curriculum/import/csv.ts                 # solo si el parser genérico lo necesita
features/curriculum/import/fields.ts
features/curriculum/import/sources.ts
features/curriculum/import/expectations.ts
features/curriculum/import/importer.ts
features/curriculum/import/validators.ts

features/curriculum/registry/files.ts              # normalmente no requiere cambio de layout
features/curriculum/registry/serialize.ts
features/curriculum/registry/query.ts
features/curriculum/index.ts

features/curriculum/__tests__/fixtures.ts
features/curriculum/__tests__/importer.test.ts
features/curriculum/__tests__/query.test.ts
features/curriculum/__tests__/corruption.test.ts
features/curriculum/__tests__/determinism.test.ts

scripts/curriculum/import-a1.ts                    # solo si el CLI necesita reportar nuevos invariantes

generated/curriculum/a1/**                        # solo como output regenerado del importer
```

Puede añadir tests nuevos dentro de `features/curriculum/__tests__/` si una invariante v1.51 no cabe limpiamente en los existentes.

---

## 8. Archivos que NO puede modificar

### Currículo aprobado

No modificar para hacer pasar el importer:

```text
content/a1/vocabulary/spanishstories_a1_ws_sequencing_architecture_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_sequencing_allocation_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_story_blueprints_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_recycling_edges_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_sequencing_final_audit_v1.51.csv
```

Tampoco modificar los inventories compartidos v1.37/v1.40 salvo que exista una contradicción real y se detenga con `BLOCKER_CONTRADICTION`.

### Respaldo

No editar:

```text
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/**
```

### Fuera de Fase 1

No tocar:

```text
components/visual/baseline-v1/**
prototipos visuales
Progress Engine
Fase 3
story authoring/prose final
lib/lexical-prototype.ts como fuente curricular
content/a1/module-1/island-1/story-1.ts como Story canónica
```

No modificar `main` ni hacer merge a `main`.

---

## 9. `sources.ts`

Actualizar las cinco fuentes de secuenciación a v1.51 y sus columnas exactas.

Mantener activas:

```text
normalizationMaster = v1.37
sourceAssertions = v1.40
coverageAudit = v1.40
```

Cambiar:

```text
sequencingArchitecture = v1.51
sequencingAllocation = v1.51
storyBlueprints = v1.51
recyclingEdges = v1.51
sequencingAudit = v1.51
```

`SEQUENCING_ALLOCATION.filenameVersion` debe producir:

```text
A1-CURRICULUM-v1.51
```

Cada columna publicada debe quedar en `requiredColumns` o `knownUnusedColumns`. Una columna desconocida sigue siendo schema drift y debe fallar.

No declarar como `knownUnused` un campo necesario para una invariante solo para evitar adaptar el importer.

---

## 10. `expectations.ts`

Actualizar expectativas activas a v1.51.

Los controles numéricos publicados ahora usan IDs `H-*`, no `SEQ16D-*`. Como mínimo mapear:

```text
H-001 → firstIntroductions = 985
H-002 → a1Senses = 602
H-003 → grammarUnits = 169
H-004 → mwuUnits = 214
H-005 → modules = 8
H-006 → islands = 11
H-007 → storyBlueprints = 32
H-014 → recycleEdges = 2867
H-018 → backwardRecycleEdges = 0
H-020 → recycleEdgesClaimingMastery = 0
```

No depender únicamente del hardcode: seguir confrontando expectativas internas + audit CSV + datos reales.

Añadir/integrar controles dedicados para:

```text
FOCUS = 448
SUPPORTED = 537
FIRST_RETURN = 985
SECOND_RETURN = 950
THIRD_RETURN = 932
island checkpoints = 11
module checkpoints = 8
capstone first introductions = 0
old Story IDs reused = 0
DELE = 13/13
```

---

## 11. CurriculumRelease y registry

Mantener separación entre:

```text
sourceHashes
contentHash
generatedAt
```

`generatedAt` continúa excluido del determinism hash.

Actualizar el registry schema version porque cambia la forma canónica de StoryBlueprint/RecycleEdge. Valor recomendado:

```text
curriculum-registry/2.0.0
```

No usar `2.0.0-rc1` del schema editorial como sustituto del namespace del registry; son contratos distintos.

Después del cutover:

```text
generated/curriculum/a1/release.json
```

debe declarar:

```text
releaseId = A1-CURRICULUM-v1.51
schemaVersion = curriculum-registry/2.0.0
validationResult.status = PASS
```

El runtime nunca parsea CSV; sigue leyendo únicamente el registry generado/query API.

---

## 12. Query API

Actualizar `features/curriculum/registry/query.ts` y tests solo donde el nuevo modelo lo exija.

Debe seguir siendo posible consultar de forma determinista:

- módulos por orden;
- islas por módulo/orden;
- Stories por isla/orden;
- target y first introduction;
- recycling route de un target;
- SourceAssertions/modo;
- Story checkpoint/final transfer;
- contratos DELE/modalidad si se exponen públicamente.

No introducir dependencia runtime hacia los CSV.

---

## 13. Pruebas de corrupción obligatorias

Además de conservar las pruebas existentes, deben existir casos que fallen deliberadamente al menos para:

1. Story apunta a isla inexistente.
2. Allocation apunta a Story inexistente.
3. Allocation duplica first introduction de un target.
4. `FOCUS` desconocido o salience inválida.
5. `focus_first_intro_count > 20`.
6. FOCUS + SUPPORTED no coincide con total Story.
7. `story_count` de arquitectura no coincide con blueprints.
8. checkpoint de isla apunta fuera de su isla.
9. checkpoint de módulo apunta fuera de su módulo.
10. capstone recibe una first introduction.
11. recycle edge apunta a target sin allocation.
12. `introduction_story` del edge no coincide con allocation.story_id.
13. return hacia una Story anterior.
14. duplicate destination dentro de la ruta del mismo target.
15. SECOND sin FIRST o THIRD sin SECOND cuando la secuencia publicada lo requiera.
16. `mastery_claim != NONE`.
17. A2 boundary programado como A1.
18. target regional receptivo convertido en demanda productiva universal.
19. header desconocido/schema drift.
20. hash/source bytes alterados.

La prueba debe demostrar que el importer **rechaza** corrupción; no que la corrige.

---

## 14. Determinismo obligatorio

Ejecutar al menos dos imports independientes de los mismos bytes.

Deben coincidir exactamente:

```text
release.contentHash
sourceHashes
actualCounts
registry payload serializado
orden de colecciones
orden de objetos dentro de cada colección
```

Solo `generatedAt` puede variar.

No ordenar por `Object.keys()` accidentalmente si el contrato no garantiza ese orden; usar comparadores/campos canónicos explícitos.

---

## 15. Orden de implementación recomendado

```text
1. Preflight audit
2. Update domain schema
3. Update sources.ts contracts
4. Update row parsing / fields
5. Adapt architecture import 11 ISLAND rows → 8 modules + 11 islands
6. Adapt allocation + introSalience
7. Adapt StoryBlueprint parsing/counts/checkpoints/DELE
8. Adapt RecyclingEdge FIRST/SECOND/THIRD model
9. Update validators/invariants
10. Update expectations / H audit mapping
11. Update CurriculumRelease schema version
12. Update registry serializer/query if required
13. Update fixtures/tests
14. npm run curriculum:check
15. npm test
16. npm run typecheck
17. npm run lint
18. npm run curriculum:import
19. rerun complete test suite against generated registry
20. determinism run
21. only after every gate passes: remove root v1.44 compatibility-pin files
22. rerun all gates after deletion
23. commit final migration on prueba
```

---

## 16. Cutover / eliminación de v1.44 de raíz

El respaldo ya existe en:

```text
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/
```

Solo después de un v1.51 completamente verde puede Claude eliminar de `content/a1/vocabulary/`:

```text
spanishstories_a1_ws_sequencing_architecture_v1.44.csv
spanishstories_a1_ws_sequencing_allocation_v1.44.csv
spanishstories_a1_ws_story_blueprints_v1.44.csv
spanishstories_a1_ws_recycling_edges_v1.44.csv
spanishstories_a1_ws_sequencing_final_audit_v1.44.csv
```

No borrar:

```text
spanishstories_a1_ws_normalization_master_v1.37.csv
spanishstories_a1_ws_source_assertions_modes_v1.40.csv
spanishstories_a1_ws_coverage_final_v1.40.csv
```

Después de borrar los pins v1.44, repetir tests para demostrar que ningún código activo todavía depende de esos paths.

---

## 17. Criterio de aceptación final

La migración de Claude solo puede declararse completa si presenta evidencia de:

```text
git branch = prueba
main untouched

releaseId = A1-CURRICULUM-v1.51
registry schema = curriculum-registry/2.0.0

599 lexemes
666 forms
608 senses
602 A1 senses
6 A2 boundary
214 MWUs
169 grammar units

8 modules
11 islands
32 stories
985 first introductions
448 FOCUS
537 SUPPORTED
2867 recycle edges
985/950/932 return-stage counts
16 regional receptive
0 A2-as-A1
0 backward edges
0 mastery edges
13/13 DELE structures
1 final-transfer Story
0 capstone first introductions

npm test = PASS
npm run typecheck = PASS
npm run lint = PASS
npm run curriculum:check = PASS
npm run curriculum:import = PASS
corruption suite = PASS
determinism = PASS
query regression = PASS
```

Y además:

```text
root v1.44 sequencing files removed
archive v1.44 still intact
archive SHA-256 unchanged
v1.51 CSV bytes unchanged
visual baseline untouched
Fase 3 untouched
```

---

## 18. Qué NO debe hacer Claude después de terminar

No iniciar Fase 3 automáticamente.

La salida correcta es entregar:

1. commit(s) de migración en `prueba`;
2. diff resumido;
3. tests ejecutados y resultados;
4. nuevo `CurriculumRelease`/contentHash;
5. prueba de determinismo;
6. confirmación de archivo v1.44 intacto;
7. lista de cualquier deuda no bloqueante.

Luego se hace una revisión separada de Fase 1 + compatibilidad Fase 2 y recién después se genera el nuevo prompt/especificación de Fase 3.

---

## 19. Gate final de autorización

Con ETAPAS A–H, `D-A11` y este implementation manifest completados:

```text
CURRICULAR_DECISIONS = CLOSED
CLAUDE_CODE_MIGRATION = AUTHORIZED_ON_PRUEBA
FASE_3 = STILL_BLOCKED
MAIN = STILL_FORBIDDEN
```
