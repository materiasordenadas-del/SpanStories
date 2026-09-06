# SpanStories — Plan Claude Code: migración A1 32 StoryBlueprints — Fase 1 + Fase 2 atómicas

**Versión:** 1.1  
**Fecha:** 2026-09-06  
**Repositorio:** `materiasordenadas-del/SpanStories`  
**Rama obligatoria:** `prueba`  
**Prohibido:** `main`  
**CurriculumRelease objetivo:** `A1-CURRICULUM-v1.51` RC1  
**LexiconRelease esperado:** `A1-LEXICON-v1.0` si no cambia la interpretación lexical  
**Fase 3:** NO implementar

## 1. Cambio respecto de v1.0

Este plan sustituye el alcance ambiguo `migrar Fase 1 + verificar Fase 2 después` por una única ejecución técnica atómica:

```text
DELIVERABLE A = PHASE_1_MIGRATED
DELIVERABLE B = PHASE_2_REVALIDATED
```

Claude Code **no puede detenerse después de Fase 1** ni declarar la tarea terminada con Fase 2 pendiente.

El cierre solo es válido si:

```text
PHASE_1_MIGRATED = PASS
PHASE_2_REVALIDATED = PASS
PHASE_3_IMPLEMENTED = NO
```

`PHASE_3_READY = YES` solo si los dos primeros gates son PASS.

## 2. Autoridad

Claude debe usar conjuntamente:

```text
docs/curriculum/a1-restructure/curriculum-release-v1.51-rc1.json
docs/curriculum/a1-restructure/etapa-h-schema-decision-v1.0.md
docs/curriculum/a1-restructure/etapa-h-release-candidate-v1.51-rc1.md
docs/curriculum/a1-restructure/etapa-post-h-respaldo-manifest-v1.0.md
docs/curriculum/a1-restructure/spanstories_a1_implementation_manifest_v1.51.md
docs/curriculum/a1-restructure/spanstories_a1_implementation_manifest_phase1_phase2_atomic_v1.1.md
```

Fuentes v1.51 aprobadas:

```text
content/a1/vocabulary/spanishstories_a1_ws_sequencing_architecture_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_sequencing_allocation_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_story_blueprints_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_recycling_edges_v1.51.csv
content/a1/vocabulary/spanishstories_a1_ws_sequencing_final_audit_v1.51.csv
```

No modificar datos para hacerlos coincidir con código viejo.

Si datos, manifest, documentación o código se contradicen materialmente:

```text
BLOCKER_CONTRADICTION
```

## 3. Auditoría y baseline antes de escribir

Registrar:

```bash
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
git log --oneline --decorate -n 15
node --version
npm --version
cat package.json
```

Confirmar `branch=prueba` y ejecutar antes del cambio:

```bash
npm run curriculum:check
npm test
npm run typecheck
npm run lint
npm run build
```

Inspeccionar al menos:

```text
features/curriculum/**
features/lexical-engine/**
content/a1/**
generated/curriculum/a1/**
docs/**
HANDOFF_NEXT_PHASE.md
```

Distinguir referencias históricas de constantes activas. No reemplazar globalmente `103`, `32 islands` o `v1.44`.

## 4. Invariantes del nuevo baseline

```text
CurriculumRelease = A1-CURRICULUM-v1.51
schema = 2.0.0-rc1
modules = 8
islands = 11
storyBlueprints = 32
firstIntroductions = 985
FOCUS = 448
SUPPORTED = 537
maxFocusPerStory = 20
recycleEdges = 2867
FIRST_RETURN = 985
SECOND_RETURN = 950
THIRD_RETURN = 932
regionalReceptiveTargets = 16
A2BoundaryScheduledAsA1 = 0
DELE = 13/13
capstoneFirstIntroductions = 0
oldStoryIdsReused = 0
```

Conteos lexicales que deben seguir estables si las fuentes v1.37/v1.40 no cambiaron:

```text
Lexemes = 599
LexemeForms = 666
Senses = 608
A1 Senses = 602
A2 boundary Senses = 6
MWU = 214
Grammar = 169
```

## 5. Fase 1 — migración obligatoria

Migrar importer/registry al schema v1.51, no solo cambiar conteos.

Actualizar cuando corresponda:

```text
features/curriculum/domain/**
features/curriculum/import/**
features/curriculum/registry/**
features/curriculum/__tests__/**
scripts/curriculum/import-a1.ts
generated/curriculum/a1/**  # solo generado
```

Debe comprender el schema release-neutral v1.51:

```text
intro_salience = FOCUS | SUPPORTED
return_stage = FIRST_RETURN | SECOND_RETURN | THIRD_RETURN
checkpoint flags
DELE/modalities
11 islands / 32 Stories
```

Regenerar el registry mediante importer; prohibido editar `generated/` manualmente.

Pruebas de Fase 1 obligatorias:

```text
conteos
FKs
jerarquía
story order
first-introduction uniqueness
FOCUS/SUPPORTED reconciliation
horizon-adaptive recycling
checkpoint integrity
A2 boundary
regional receptive policy
DELE 13/13
corruption tests
determinism
query API regression
no partial release
```

## 6. Continuación automática a Fase 2

Cuando Fase 1 esté verde, Claude debe continuar en la misma ejecución:

```text
loadCurriculumRegistry()
→ A1-CURRICULUM-v1.51
→ loadLexicalEngine()
→ revalidar Fase 2 completa
```

Fase 2 no es opcional ni una tarea futura.

Si no requiere cambios sustantivos:

```text
PHASE_2_CODE_CHANGE_REQUIRED = NO
PHASE_2_REVALIDATED = PASS
```

Si el cambio 103→32 descubre un acoplamiento indebido:

```text
PHASE_2_CODE_CHANGE_REQUIRED = YES
```

corregir únicamente ese acoplamiento mínimo y documentarlo.

## 7. Contrato de identidad de Fase 2

La separación sigue siendo:

```text
CurriculumRelease != LexiconRelease
```

El código actual consume el registry de Fase 1 y construye el back-reference lexical desde `curriculum.release.releaseId`.

Si no cambió la interpretación lexical, el estado esperado es:

```text
loadLexicalEngine().release.releaseId
= A1-LEXICON-v1.0

loadLexicalEngine().release.curriculumReleaseId
= A1-CURRICULUM-v1.51

loadLexicalEngine().curriculum.release.releaseId
= A1-CURRICULUM-v1.51
```

**No crear `A1-LEXICON-v1.1` solo porque cambió la secuenciación curricular.**

## 8. Invariantes lexicales obligatorias

Si las fuentes lexicales no cambiaron, verificar:

```text
599 Lexemes
666 LexemeForms
608 Senses
214 MWUs
44 MWUs con identidad lexical
170 MWUs sin identidad lexical
20 HomographGroups
599 pronominality = UNSPECIFIED / NOT_CLASSIFIED
lineage acíclico
```

Mantener:

```text
surface != Lexeme
Lexeme != Sense
MWU without lexical identity is valid
pronominality no se infiere de -se
SPLIT no selecciona hijo silenciosamente
historical IDs no se reutilizan
```

Si cambia una invariante lexical sin cambio de fuente lexical:

```text
BLOCKER_PHASE2_SEMANTIC_DRIFT
```

## 9. Tests obligatorios de Fase 2

Después de regenerar `generated/curriculum/a1/**`, ejecutar toda la suite lexical y añadir/adaptar pruebas para demostrar:

```text
CurriculumRelease observado = A1-CURRICULUM-v1.51
LexiconRelease observado = A1-LEXICON-v1.0
LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51
```

Además probar:

```text
Lexeme/Form/Sense resolution
20 homograph groups
44/170 MWU identity split
pronominality unchanged
lineage rules unchanged
corruption rejection
no dependency on 103 Stories / 32 islands / old Story IDs
```

## 10. Documentación obligatoria

Actualizar después del cutover:

```text
docs/curriculum-import.md
docs/lexical-engine-implementation.md
features/curriculum/README o equivalente
features/lexical-engine/README.md
HANDOFF_NEXT_PHASE.md
plan técnico del motor
```

La documentación activa no debe presentar `A1-CURRICULUM-v1.44`, `103 Stories` o `32 islands` como baseline actual.

Debe quedar explícito:

```text
Fase 1 = A1-CURRICULUM-v1.51
Fase 2 = A1-LEXICON-v1.0 revalidated against v1.51
```

## 11. Respaldo y cutover

El respaldo histórico ya existe en:

```text
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/
```

Las cinco copias v1.44 de raíz son pins temporales. Solo eliminarlas en el mismo cambio de cutover si v1.51 ya importa, genera registry y pasa Fase 1 + Fase 2 + regresión completa.

No editar el respaldo.

## 12. Prohibiciones

No tocar:

```text
main
components/visual/baseline-v1/**
rediseño UI
Progress/Learner Event Engine
mastery
DB/ORM/Auth
NLP
Story Engine de Fase 3
prosa final de historias
CSV v1.51 aprobados para hacer pasar tests
```

No implementar `Story`, `StoryVersion`, `StoryOccurrence`, `TextAnchor`, `OccurrencePart`, `StoryTargetBinding` ni processor/publication validator.

## 13. Regresión final única

Después de completar **las dos fases**:

```bash
npm run curriculum:check
npm test
npm run typecheck
npm run lint
npm run build
```

Registrar resultados antes/después y demostrar que Fase 2 corre sobre el registry v1.51 recién generado.

## 14. Gate de aceptación

No existe cierre parcial.

Debe terminar exactamente con:

```text
PHASE_1_MIGRATED = PASS
PHASE_2_REVALIDATED = PASS
CURRICULUM_RELEASE = A1-CURRICULUM-v1.51
LEXICON_RELEASE = A1-LEXICON-v1.0   # salvo cambio lexical autorizado por evidencia
PHASE_3_IMPLEMENTED = NO
PHASE_3_READY = YES
```

Si Fase 1 o Fase 2 falla:

```text
PHASE_3_READY = NO
```

## 15. Reporte final

Entregar un único reporte de ambas fases con HEAD inicial/final, releases antes/después, archivos, conteos, cambios Fase 1, cambios Fase 2, tests, corrupción, determinismo, build, blockers, deuda técnica y estado de Fase 3.

No hacer push remoto salvo instrucción explícita del usuario.
