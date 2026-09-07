# SpanStories — MOTOR Fase 2: Lexical Engine canónico

**Versión:** 1.0  
**Repositorio:** `materiasordenadas-del/SpanStories`  
**Rama obligatoria:** `prueba`  
**Punto de partida verificado:** `origin/prueba = e8f482c86ca1bb3b6a1ee1e9d23f4d5130b4f6dc`  
**Commit funcional de Fase 1:** `cb63cb2bfe1c77535e505bd4ba8f8246a7113e19`  
**Objetivo exclusivo de este chat:** construir el **Lexical Engine canónico** encima del Curriculum Registry ya implementado, sin iniciar Story Engine, Learner Events, PostgreSQL ni NLP.

---

> ## Estado: `REVALIDATED / PASS`
>
> Fase 2 está **implementada y revalidada** contra el registry
> `A1-CURRICULUM-v1.51`. Copia canónica:
> `docs/architecture/fases-motor/fase2-lexical-engine-v1.0.md`.
>
> ```text
> LexiconRelease                     = A1-LEXICON-v1.0   (sin cambio)
> LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51
> PHASE_2_CODE_CHANGE_REQUIRED       = NO (sustantivo)
> ```
>
> La reestructuración 103 → 32 **no creó, fusionó, dividió ni eliminó ninguna
> identidad léxica**: el inventario (599 / 666 / 608 / 602 / 6 / 214 / 169), los
> 20 grupos de homógrafos, el reparto 44 / 170 de MWU, la pronominalidad
> `UNSPECIFIED / NOT_CLASSIFIED` y el lineage acíclico se mantienen. Evidencia:
> `features/lexical-engine/__tests__/curriculum-revalidation.test.ts`.
>
> **No se emitió `A1-LEXICON-v1.1`.** Un resecuenciado narrativo no justifica
> una nueva identidad léxica; hacerlo volvería indistinguible una decisión
> curricular de una lexical.

---

# 0. Instrucción principal

No comiences escribiendo código.

Primero inspecciona el repositorio real, el handoff de Fase 1 y los contratos existentes. **No des por hecho que este documento, la arquitectura, el handoff, los tipos TypeScript y los datos generados coinciden entre sí.**

La tarea se ejecuta en este orden:

```text
AUDITAR
→ CONTRASTAR
→ DELIMITAR CONTRATOS
→ IMPLEMENTAR
→ VALIDAR
→ TESTEAR
→ DOCUMENTAR
→ COMMIT
→ PUSH origin/prueba
```

Si descubres una contradicción real que no pueda resolverse mediante una autoridad explícita y evidencia verificable, activa `BLOCKER_CONTRADICTION`. No inventes una resolución para poder terminar la fase.

---

# 1. Auditoría obligatoria antes de modificar nada

Debes comprobar como mínimo:

```text
git remote -v
git branch --show-current
git status
git log --oneline --decorate -n 20
```

Confirma:

- repositorio correcto;
- rama actual `prueba`;
- `origin/prueba` actual;
- `main` no será modificado;
- cambios no rastreados o ajenos existentes;
- package manager real;
- versión de Node;
- scripts disponibles;
- baseline de `lint`, `typecheck`, tests y build antes de tocar código.

Después inspecciona obligatoriamente:

```text
HANDOFF_NEXT_PHASE.md
docs/curriculum-import.md
features/curriculum/index.ts
features/curriculum/domain/
features/curriculum/registry/
features/lexical-engine/README.md
lib/lexical-prototype.ts
lib/curriculum.ts
content/a1/module-1/island-1/story-1.ts
```

Y consulta la especificación conceptual vigente de Lexical Engine antes de decidir el modelo.

No copies ciegamente el prototipo. No reemplaces ciegamente los tipos de Fase 1.

---

# 2. Autoridades para esta fase

Orden de autoridad:

```text
1. Datos canónicos publicados + registry generado y validado de Fase 1
2. Contratos públicos reales exportados por features/curriculum/index.ts
3. Handoff de Fase 1
4. Arquitectura SpanStories V1
5. Especificación conceptual docs/lexical-engine.md
6. Prototipos existentes, solo como fixtures / referencia de comportamiento
```

El prototipo **no puede anular** un ID o una relación canónica ya publicada.

Si una decisión conceptual de `docs/lexical-engine.md` no puede implementarse porque los datos A1 todavía no contienen la evidencia necesaria, crea el contrato extensible y una fixture de dominio; **no fabriques datos curriculares**.

---

# 3. Estado de Fase 1 que esta fase debe respetar

La Fase 1 dejó disponible un Curriculum Registry canónico con:

```text
599 Lexemes
666 LexemeForms
608 Senses
602 Senses A1
6 Senses A2 boundary
214 MWU
169 GrammarUnits
8 Modules
11 Islands
32 StoryBlueprints
985 first introductions (448 FOCUS + 537 SUPPORTED)
2867 recycle edges (985 FIRST + 950 SECOND + 932 THIRD)
```

> **HISTORICAL BASELINE — SUPERSEDED.** Cuando se escribió esta especificación
> el registry era `A1-CURRICULUM-v1.44` con 32 islas, 103 StoryBlueprints y
> 2955 aristas. Ninguna de esas cifras es el estado activo. La parte lexical
> del inventario es idéntica en ambos releases, que es precisamente por lo que
> Fase 2 no necesitó cambio sustantivo.

Contratos públicos existentes incluyen, entre otros:

```text
Lexeme
LexemeForm
Sense
MwuUnit
GrammarUnit
SourceAssertion
CurriculumTarget
CurriculumRelease
CurriculumRegistry
```

Y consultas como:

```text
getLexemeById
getFormById
getSenseById
getLexemeOfSense
getLexemeOfForm
getFormsOfLexeme
getSensesOfLexeme
getSourceAssertionsForSense
getSourceAssertionsForTarget
resolveTarget
getFirstIntroduction
getRecyclePath
```

**No dupliques estas entidades con otra definición incompatible dentro de `features/lexical-engine/`.** El Lexical Engine debe consumir o ampliar estos contratos con límites claros.

---

# 4. Hechos detectados en Fase 1 que NO pueden reinterpretarse

## 4.1 IDs publicados

Son inmutables:

```text
LEX-A1-*
FORM-A1-*
SENSE-A1-*
GRAM-A1-*
SA-A1-*
MWU NNBn-MWU-NNNN
```

No generar IDs desde:

```text
surface
lemma
POS
hash de texto
orden de aparición
```

## 4.2 MWU

Hay 214 MWU, pero **solo 44 tienen identidad de Lexeme**.

Los otros 170 no están “incompletos”. Permanecen como `MwuUnit` sin `lexemeId` por decisión curricular.

Prohibido promocionarlos automáticamente a Lexeme.

## 4.3 GrammarUnit

Las 169 GrammarUnits existen en el allocation ledger y no tienen SourceAssertion propia.

Una lista vacía de SourceAssertions para GrammarUnit es un resultado válido, no un error.

## 4.4 A2 boundary

Los 6 Senses A2 boundary existen en el registry pero no pueden convertirse en targets A1.

## 4.5 Regional receptive

Los 16 targets regionales receptivos no pueden adquirir demanda productiva universal.

## 4.6 SourceAssertion

El nivel curricular proviene de SourceAssertion / política curricular. No se recalcula desde frecuencia, cognados, NLP, lemma o intuición lingüística.

---

# 5. Objetivo cerrado de Fase 2

Construir un subsistema que resuelva identidad y relaciones léxicas de forma estable sobre el registry canónico:

```text
published id
→ Lexeme
→ LexemeForm
→ Sense
→ SourceAssertion / curriculum metadata
→ MWU lexical identity when explicitly published
→ lexical relations
→ lifecycle / lineage
```

El Lexical Engine **no** es todavía:

```text
Story Engine
NLP pipeline
Learner Event Engine
dictionary import
mastery engine
PostgreSQL repository
UI component
```

---

# 6. Implementación requerida

## 6.1 Feature boundary

La implementación debe vivir principalmente en:

```text
features/lexical-engine/
```

Debe existir un único contrato público claro, preferentemente:

```text
features/lexical-engine/index.ts
```

La UI y otros features futuros deben importar desde el boundary público, no desde archivos internos arbitrarios.

## 6.2 Lexical Engine service / registry

Crear una API de dominio que permita como mínimo:

```text
resolveLexeme(id)
resolveForm(id)
resolveSense(id)
getForms(lexemeId)
getSenses(lexemeId)
getLexemeForForm(formId)
getLexemeForSense(senseId)
getCurricularAssertionsForSense(senseId)
resolveMwu(mwuId)
getMwuLexicalIdentity(mwuId)
```

No es obligatorio usar exactamente estos nombres si el repo ya tiene una convención mejor.

La API debe distinguir explícitamente:

```text
NOT_FOUND
FOUND with empty collection
FOUND with value
```

No convertir `undefined` silencioso en semántica de dominio.

## 6.3 Identidad lexical

Formalizar sin destruir los contratos de Fase 1:

```text
LexemeLifecycleStatus
PROVISIONAL
ACTIVE
SUPERSEDED
RETIRED
```

El estado puede vivir inicialmente en una capa lexical adicional si el currículo A1 publicado no proporciona todavía lifecycle histórico.

No modificar retrospectivamente el significado de un `LexemeId` publicado.

## 6.4 HomographGroup

El motor debe ser capaz de representar homógrafos que compartan forma canónica y POS sin fusionarlos.

Requisitos:

```text
surface string != lexical identity
canonical form + POS != guaranteed Lexeme identity
HomographGroup != learner knowledge unit
```

No inventes `HomographGroup` para todo el inventario si los datos no los publican. Implementa el contrato y tests con fixtures controladas cuando sea necesario.

## 6.5 Pronominality

Formalizar:

```text
NONE
OBLIGATORY
LEXICALIZED_ALTERNANT
```

Reglas:

```text
canonical -se != literal surface "se"
lexical-pronominal != reflexive by default
reflexive use != new Lexeme by default
reciprocal use != new Lexeme by default
passive se != pronominal Lexeme
impersonal se != pronominal Lexeme
```

Si el A1 registry no contiene todavía metadata suficiente para clasificar todos los verbos, no rellenes valores por intuición. Conserva `UNKNOWN/UNSPECIFIED` solo si el contrato conceptual lo justifica o mantén la metadata separada hasta que exista autoridad editorial.

## 6.6 Lexical relations

Preparar relaciones tipadas como mínimo para:

```text
HOMOGRAPH_OF
PRONOMINAL_COUNTERPART_OF
VARIANT_OF
DERIVED_FROM
```

No es necesario poblar relaciones que no estén sustentadas por datos o fixtures editoriales explícitas.

## 6.7 Lineage

Implementar el núcleo del lineage lexical:

```text
LexemeLineageEvent
SPLIT
MERGE
REPLACED_BY
RETIRE
```

Con:

```text
sourceLexemeIds[]
targetLexemeIds[]
effectiveRelease
reason
```

Y soporte conceptual para:

```text
EQUIVALENT_IDENTITY
COARSENING
```

más transfer policy:

```text
CONTEXTUAL
FULL_EQUIVALENT
EVIDENCE_ONLY
NONE
```

Todavía **no** implementar `LearnerEventAttribution`; pertenece a Fase 4.

## 6.8 Lineage resolver

El engine debe poder:

```text
consultar un Lexeme activo
consultar un Lexeme SUPERSEDED
obtener sucesores
obtener predecesores
resolver un merge con sucesor único
identificar un split con varios sucesores sin escoger uno arbitrariamente
```

Un ID legacy de split nunca redirige silenciosamente a un único hijo.

## 6.9 Grafo de lineage

Debe ser acíclico.

Rechazar:

```text
A -> B -> A
```

Rechazar cardinalidades inválidas:

```text
SPLIT: 1 -> menos de 2
MERGE: menos de 2 -> 1
REPLACED_BY: distinto de 1 -> 1
RETIRE: targets no vacíos
```

## 6.10 Release lexical

Definir `LexiconRelease` o contrato equivalente que permita identificar qué interpretación lexical está activa.

No confundir:

```text
CurriculumRelease
!=
LexiconRelease
```

Puede existir inicialmente una release lexical alineada con el snapshot actual, pero debe quedar preparada para evolucionar independientemente.

---

# 7. Integración con el prototipo

El archivo:

```text
lib/lexical-prototype.ts
```

no se borra al comienzo.

Secuencia obligatoria:

```text
1. inspeccionar comportamiento del prototipo
2. identificar qué comportamiento sigue siendo útil
3. implementar engine canónico
4. crear tests equivalentes
5. crear adapter mínimo si es necesario
6. solo entonces decidir si el prototipo puede deprecarse
```

Si eliminarlo rompe el StoryReader prototípico, no lo elimines en esta fase. El objetivo es introducir el motor canónico sin una reescritura big-bang.

---

# 8. Casos técnicos obligatorios

Antes de convertir ejemplos conceptuales en tests, **verifica si las identidades realmente existen en el registry A1**. No hardcodees IDs inventados.

Si un caso conceptual no existe en A1, usa fixture de dominio controlada.

Debe probarse el comportamiento equivalente a:

## 8.1 Forma → Lexeme

```text
una LexemeForm publicada
→ exactamente su Lexeme publicado
```

No resolver solo por comparación de strings.

## 8.2 Sense → Lexeme

```text
Sense publicado
→ exactamente su Lexeme publicado
```

## 8.3 Homografía cross-POS

Caso equivalente a:

```text
vino NOUN
!=
vino como forma de VENIR VERB
```

No es obligatorio que ambos estén en A1 si no existen; fixture válida.

## 8.4 Homógrafos same-POS

Caso equivalente a:

```text
cura sacerdote
!=
cura curación
```

Debe ser representable sin fusionar identidades.

## 8.5 Pronominal

Caso equivalente a:

```text
IR
!=
IRSE
```

cuando exista decisión editorial de identidad separada.

## 8.6 MWU lexicalizada

Una `MwuUnit` con `lexemeId` debe resolver esa identidad exacta.

## 8.7 MWU no lexicalizada

Una `MwuUnit` sin `lexemeId` debe devolver explícitamente:

```text
NO_LEXICAL_IDENTITY
```

o equivalente semántico claro.

Nunca crear Lexeme nuevo.

---

# 9. Tests de lineage obligatorios

Crear fixtures puramente técnicas para probar:

### Split válido

```text
A -> B + C
```

- A permanece resoluble;
- A pasa a SUPERSEDED;
- B y C son sucesores;
- resolver legacy A no selecciona B ni C arbitrariamente.

### Merge equivalente válido

```text
A + B -> C
```

- A y B permanecen resolubles;
- C es sucesor único;
- semántica = `EQUIVALENT_IDENTITY`;
- transfer policy compatible con `FULL_EQUIVALENT`.

### Merge por coarsening

```text
A + B -> C
```

- semántica = `COARSENING`;
- no implica por sí sola transferencia de mastery;
- esta fase no implementa learner state.

### Cycle rejection

```text
A -> B
B -> A
```

Debe fallar.

### Cardinality rejection

Probar cardinalidades inválidas para SPLIT, MERGE, REPLACED_BY y RETIRE.

---

# 10. Contradicciones y `BLOCKER_CONTRADICTION`

Activa este protocolo cuando dos autoridades relevantes no puedan reconciliarse objetivamente.

Formato mínimo:

```text
BLOCKER_CONTRADICTION

A. Fuentes en conflicto
B. Evidencia exacta
C. Qué contrato queda afectado
D. Qué alternativas existen
E. Por qué ninguna puede elegirse sin inventar autoridad
F. Trabajo seguro que sí puede continuar
```

No uses `BLOCKER_CONTRADICTION` para pequeñas diferencias de naming o implementación si pueden resolverse sin cambiar semántica.

Si una contradicción puede resolverse por evidencia, documenta:

```text
CONTRADICTION_RESOLVED
```

con evidencia y sin modificar los datos canónicos para “hacerlos coincidir”.

---

# 11. Qué SÍ puede tocar

Preferentemente:

```text
features/lexical-engine/**
features/lexical-engine/__tests__/**
lib/adapters/**          # solo adapter mínimo y justificado
docs/lexical-engine-implementation.md
HANDOFF_NEXT_PHASE.md    # reemplazar/actualizar para Fase 3
package.json             # solo scripts estrictamente necesarios
```

Puede modificar `lib/lexical-prototype.ts` únicamente si:

1. existe un adapter o reemplazo probado;
2. no rompe el vertical slice;
3. el cambio está documentado;
4. no introduce lógica de Fase 3 o Fase 4.

Puede corregir código de Fase 1 solo ante un bug real descubierto por tests y debe documentarlo como `PHASE1_REGRESSION_FIX`. No refactorizar Fase 1 por preferencia.

---

# 12. Qué NO puede tocar

No modificar por esta fase:

```text
main
components/visual/baseline-v1/**
components/visual/** salvo adapter visual absolutamente inevitable
app/** para rediseño
features/story-engine/**
features/learner-progress/**
PostgreSQL / migrations / ORM
NLP / spaCy / Python service
Auth
mastery
spaced repetition
recommender
canonical CSV contents
```

No rehacer:

```text
Curriculum Importer
Curriculum Registry
CSV parser
release hashes
sequencing validators
```

salvo bug reproducible.

No crear todavía:

```text
StoryVersion
TextAnchor
OccurrencePart canónico de Story Engine
LearnerEventAttribution
UserLexemeState
PostgresLexiconRepository
```

Esos pertenecen a fases posteriores.

---

# 13. Pruebas de regresión obligatorias

Antes del cierre debe pasar:

```bash
npm run curriculum:check
npm test
npm run typecheck
npm run lint
npm run build
```

Si introduces suites específicas, añádelas al flujo de test existente sin romper las 47 pruebas de Fase 1.

Debes demostrar explícitamente:

```text
Fase 1 regression tests = PASS
Lexical Engine tests = PASS
lineage corruption tests = PASS
cycle rejection = PASS
build = PASS
```

No ocultar warnings nuevos.

Warnings preexistentes fuera del alcance deben documentarse con evidencia de que ya existían antes.

---

# 14. Pruebas de corrupción deliberada

Esta fase también debe tener pruebas negativas.

Como mínimo:

1. Lexeme inexistente;
2. Form con Lexeme inexistente en fixture;
3. Sense con Lexeme inexistente en fixture;
4. MWU no lexicalizada tratada erróneamente como Lexeme;
5. lineage con ciclo;
6. split con cardinalidad inválida;
7. merge con cardinalidad inválida;
8. REPLACED_BY con más de un target;
9. RETIRE con successor;
10. ID legacy split resuelto arbitrariamente a un hijo.

Cada caso debe fallar de forma explícita y tipada.

---

# 15. Criterios de salida de Fase 2

Fase 2 solo puede marcarse `PASS` si:

1. existe un boundary público de Lexical Engine;
2. consume el Curriculum Registry real de Fase 1;
3. no duplica identidades curriculares incompatibles;
4. Lexeme/Form/Sense se resuelven por IDs canónicos;
5. MWU con y sin identidad lexical se distinguen correctamente;
6. HomographGroup es representable sin fusionar conocimiento;
7. Pronominality está formalizada sin inferencias no autorizadas;
8. lifecycle está formalizado;
9. lineage SPLIT/MERGE/REPLACED_BY/RETIRE funciona;
10. el grafo de lineage rechaza ciclos;
11. IDs superseded continúan resolviendo;
12. split legacy no elige un hijo arbitrariamente;
13. existe `LexiconRelease` o equivalente;
14. el prototipo no fue destruido antes de ser sustituido;
15. todas las pruebas de Fase 1 siguen verdes;
16. lint/typecheck/tests/build pasan;
17. existe documentación de implementación;
18. existe `HANDOFF_NEXT_PHASE.md` para Fase 3;
19. no se inició Story Engine, Learner Events, PostgreSQL ni NLP;
20. commit y push a `origin/prueba` están confirmados.

---

# 16. Git — reglas obligatorias

No usar:

```text
force push
git reset --hard
push a main
rebase destructivo sobre trabajo ajeno
```

Si `origin/prueba` avanzó durante el trabajo:

1. inspeccionar los commits remotos;
2. no sobrescribirlos;
3. sincronizar solo de forma no destructiva;
4. revisar conflictos semánticos;
5. volver a ejecutar toda la suite.

Antes de commit:

```text
git status
git diff --check
git diff --stat
revisión de archivos stageados
```

Stagear únicamente archivos propios de Fase 2.

Commit sugerido:

```text
feat(lexical-engine): implement canonical lexical engine
```

Después:

```text
git push origin prueba
```

Debes confirmar que el SHA subido existe realmente en `origin/prueba`.

---

# 17. Cierre obligatorio del chat

La respuesta final de Claude Code debe contener exactamente estas secciones conceptuales:

```text
FASE 2 — RESULTADO

Estado: PASS | BLOCKED

Implementado

Archivos principales

Auditoría / contradicciones encontradas

Contratos públicos nuevos

Tests

Regresiones Fase 1

Cambios fuera de features/lexical-engine y justificación

Pendiente deliberadamente para Fase 3

Git
- branch
- commit SHA
- push origin/prueba
```

Además debe crear o actualizar:

```text
HANDOFF_NEXT_PHASE.md
```

para que el siguiente chat pueda ejecutar Fase 3 sin cargar esta conversación completa.

---

# 18. Regla final

El éxito de Fase 2 no se mide por cuántas abstracciones nuevas se creen.

Se mide por si el sistema puede afirmar de manera determinista y auditable:

```text
esta forma pertenece a este Lexeme
este Sense pertenece a este Lexeme
esta MWU tiene —o no tiene— identidad lexical publicada
este ID publicado sigue significando la misma identidad
este Lexeme fue reemplazado/dividido/fusionado sin borrar su historia
```

sin depender de UI, PostgreSQL, NLP ni estado del estudiante.
