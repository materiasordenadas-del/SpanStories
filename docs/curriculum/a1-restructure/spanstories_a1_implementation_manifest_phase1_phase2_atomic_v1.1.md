# SpanStories A1 — Implementation Manifest v1.1 — Fase 1 + Fase 2 atómicas

**Estado:** `READY_FOR_CLAUDE_CODE_PHASE1_PHASE2_ATOMIC`  
**Fecha:** 2026-09-06  
**Rama autorizada:** `prueba`  
**Rama prohibida:** `main`  
**CurriculumRelease objetivo:** `A1-CURRICULUM-v1.51` RC1  
**LexiconRelease esperado:** `A1-LEXICON-v1.0` si no cambia la interpretación lexical  
**Fase 3:** `BLOCKED_DURING_THIS_TASK`

## 1. Precedencia

Este documento **complementa y endurece** `spanstories_a1_implementation_manifest_v1.51.md`.

En cualquier conflicto sobre alcance de ejecución, prevalece esta regla:

```text
Claude debe completar Fase 1 + Fase 2 en la misma tarea.
```

El manifest v1.51 anterior sigue siendo autoridad para detalles de schema, CSV, invariantes de Fase 1, respaldo y cutover que este documento no contradiga.

Plan operativo asociado:

```text
docs/curriculum/a1-restructure/spanstories_plan_claude_code_migracion_a1_32_storyblueprints_v1.1.md
```

## 2. Gate atómico

No se acepta:

```text
PHASE_1_MIGRATED = PASS
PHASE_2_REVALIDATED = PENDING
```

La tarea solo termina cuando:

```text
PHASE_1_MIGRATED = PASS
PHASE_2_REVALIDATED = PASS
```

Si Fase 2 no necesita cambios sustantivos, debe demostrarlo con tests reales contra el registry v1.51 y declarar:

```text
PHASE_2_CODE_CHANGE_REQUIRED = NO
PHASE_2_REVALIDATED = PASS
```

## 3. Fase 1

Ejecutar íntegramente el manifest v1.51:

```text
v1.51 CSVs
→ parser/schema
→ domain model
→ validators
→ CurriculumRelease
→ SHA-256/source manifest
→ generated/curriculum/a1
→ query API
→ corruption tests
→ determinism tests
```

Invariantes principales:

```text
modules = 8
islands = 11
storyBlueprints = 32
firstIntroductions = 985
FOCUS = 448
SUPPORTED = 537
recycleEdges = 2867
FIRST_RETURN = 985
SECOND_RETURN = 950
THIRD_RETURN = 932
regionalReceptiveTargets = 16
A2BoundaryScheduledAsA1 = 0
DELE = 13/13
```

## 4. Fase 2 — obligatoria inmediatamente después

El código actual de Fase 2 carga el Curriculum Registry producido por Fase 1. Por tanto, una migración real no queda probada hasta ejecutar Fase 2 sobre el nuevo registry.

Estado esperado si las fuentes lexicales siguen iguales:

```text
LexiconRelease.releaseId = A1-LEXICON-v1.0
LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51
LexicalEngine.curriculum.release.releaseId = A1-CURRICULUM-v1.51
```

No crear una nueva identidad `A1-LEXICON-v1.1` solo por resecuenciación narrativa.

## 5. Invariantes lexicales

Verificar después del cutover:

```text
Lexemes = 599
LexemeForms = 666
Senses = 608
A1 Senses = 602
A2 boundary Senses = 6
MWUs = 214
MWUs with lexical identity = 44
MWUs without lexical identity = 170
HomographGroups = 20
Published lexemes with pronominality UNSPECIFIED/NOT_CLASSIFIED = 599
lineage = acyclic
```

Semántica que no cambia:

```text
surface != Lexeme
Lexeme != Sense
MWU without lexical identity is valid
pronominality is not inferred from spelling
SPLIT never silently selects a child
historical IDs are never reused
```

Si estos invariantes cambian sin cambio de fuente lexical:

```text
BLOCKER_PHASE2_SEMANTIC_DRIFT
```

## 6. Archivos Fase 2 permitidos

Solo si la revalidación demuestra necesidad:

```text
features/lexical-engine/**
docs/lexical-engine-implementation.md
features/lexical-engine/README.md
```

No modificar semántica lexical para ocultar problemas del nuevo CurriculumRelease.

## 7. Tests Fase 2 obligatorios

Ejecutar la suite completa existente después de regenerar el registry y añadir/adaptar únicamente lo necesario para demostrar:

```text
loadCurriculumRegistry() -> A1-CURRICULUM-v1.51
loadLexicalEngine().curriculum.release.releaseId -> A1-CURRICULUM-v1.51
loadLexicalEngine().release.releaseId -> A1-LEXICON-v1.0
loadLexicalEngine().release.curriculumReleaseId -> A1-CURRICULUM-v1.51
```

Además verificar:

```text
Lexeme/Form/Sense resolution
20 homograph groups
44/170 MWU identity split
599 UNSPECIFIED pronominality
lineage rules
corruption rejection
zero semantic dependency on 103 StoryBlueprints / 32 islands / old Story IDs
```

## 8. Documentación conjunta

Antes de cerrar actualizar:

```text
docs/curriculum-import.md
docs/lexical-engine-implementation.md
features/curriculum/README o equivalente
features/lexical-engine/README.md
HANDOFF_NEXT_PHASE.md
```

El handoff debe declarar:

```text
CurriculumRelease = A1-CURRICULUM-v1.51
LexiconRelease = A1-LEXICON-v1.0   # si no hay cambio lexical autorizado
PHASE_1_MIGRATED = PASS
PHASE_2_REVALIDATED = PASS
PHASE_3_IMPLEMENTED = NO
PHASE_3_READY = YES
```

Si cualquiera de las dos fases falla, `PHASE_3_READY = NO`.

## 9. Regresión final

Después de Fase 1 y Fase 2:

```bash
npm run curriculum:check
npm test
npm run typecheck
npm run lint
npm run build
```

No declarar terminado si Fase 2 no se ejecutó sobre el registry v1.51 recién generado.

## 10. Prohibiciones

Durante esta tarea no:

```text
implementar Fase 3
tocar main
rediseñar UI
modificar baseline visual
alterar CSV v1.51 para pasar tests
editar respaldo v1.44
introducir NLP/DB/mastery/progress
```

## 11. Reporte de cierre

El reporte final debe separar claramente:

```text
Cambios Fase 1
Cambios Fase 2
Tests Fase 1
Tests Fase 2
CurriculumRelease observado
LexiconRelease observado
LexiconRelease.curriculumReleaseId observado
Blockers
Deuda técnica
Estado Fase 3
```

Y terminar exactamente con:

```text
PHASE_1_MIGRATED = PASS|FAIL
PHASE_2_REVALIDATED = PASS|FAIL
PHASE_3_READY = YES|NO
```

No hacer push remoto salvo instrucción explícita del usuario.
