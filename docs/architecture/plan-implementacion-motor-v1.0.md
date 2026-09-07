# SpanStories — Plan de implementación técnica del motor

**Versión:** 1.0  
**Repositorio:** `materiasordenadas-del/SpanStories`  
**Rama obligatoria de trabajo:** `prueba`  
**Objetivo:** construir las Fases 1–6 del motor canónico sin mezclar todavía la implementación técnica con la capa visual.  
**Modo de ejecución:** cada fase se realiza en un chat independiente de Claude Code, comienza con una auditoría técnica obligatoria y termina únicamente cuando el trabajo válido queda probado, documentado, commiteado y subido a `origin/prueba`, con handoff explícito y SHA verificable.

---

## 0. Estado vigente del motor

> **Actualizado tras la migración atómica Fase 1 + Fase 2 a `A1-CURRICULUM-v1.51`.**
> Copia canónica de este documento: `docs/architecture/plan-implementacion-motor-v1.0.md`
> en `materiasordenadas-del/SpanStories`, rama `prueba`.

### BASELINE ACTIVO

```text
CurriculumRelease = A1-CURRICULUM-v1.51
Registry schema   = curriculum-registry/2.0.0

Modules           = 8
Islands           = 11
StoryBlueprints   = 32

First introductions = 985
FOCUS               = 448
SUPPORTED           = 537

Recycle edges     = 2867
FIRST_RETURN      = 985
SECOND_RETURN     = 950
THIRD_RETURN      = 932

LexiconRelease                     = A1-LEXICON-v1.0
LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51
```

### Estado por fase

| Fase | Estado |
|---|---|
| **1** Curriculum Importer + Registry | `MIGRATED / PASS` sobre `A1-CURRICULUM-v1.51` |
| **2** Lexical Engine | `REVALIDATED / PASS` contra el registry v1.51; `A1-LEXICON-v1.0` sin cambio |
| **3** Story Engine | `READY` — implementación `NOT STARTED` |
| **4**–**6** | No iniciadas |

### HISTORICAL BASELINE — SUPERSEDED

```text
A1-CURRICULUM-v1.44        SUPERSEDED
  32 islas                 HISTORICAL BASELINE
  103 StoryBlueprints      HISTORICAL BASELINE
  2955 recycle edges       HISTORICAL BASELINE
  registry schema 1.0.0    SUPERSEDED
```

Estas cifras **no describen el estado activo**. Se conservan porque el release
v1.44 fue auditado y sigue siendo trazable: sus fuentes de secuenciación están
archivadas literalmente en
`content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`. Ningún código activo las
lee. Donde este documento vuelva a mencionarlas, van rotuladas.

Detalle de la migración: `HANDOFF_NEXT_PHASE.md` y `docs/curriculum-import.md`
en el repositorio.

---

## 1. Agrupación por dificultad

| Fase | Contenido | Dificultad | Chat propio | Nivel recomendado |
|---|---|---:|---|---|
| **1** | Schemas + Curriculum Importer + Registry + validators | **Media–alta** | **Sí** | Muy alto |
| **2** | Lexical Engine canónico | **Alta** | **Sí** | Muy alto |
| **3** | Story Engine + StoryVersion + processor/validator | **Muy alta** | **Sí** | Muy alto |
| **4** | Learner Event / Progress Engine + projections | **Alta** | **Sí** | Muy alto |
| **5** | PostgreSQL + repositories + migrations + persistence | **Media–alta** | **Sí** | Alto / Muy alto |
| **6** | NLP: tokenización, morfología y candidates | **Muy alta** | **Sí** | Muy alto |

### Decisión de agrupación

**No juntar Fase 1 + Fase 2.**  
La Fase 1 es fundacional y suficientemente delicada: debe importar múltiples artefactos canónicos, conservar IDs publicados, generar releases reproducibles, validar referencias cruzadas y fallar ante corrupción. La Fase 2 depende de que esa autoridad ya sea estable.

Por tanto, la secuencia será:

```text
CHAT 1 → FASE 1
CHAT 2 → FASE 2
CHAT 3 → FASE 3
CHAT 4 → FASE 4
CHAT 5 → FASE 5
CHAT 6 → FASE 6
↓
VERTICAL SLICE A1 CANÓNICO
```

---

# 2. Reglas globales para los seis chats

Cada chat de Claude Code debe recibir estas reglas. Son obligatorias y prevalecen sobre atajos de implementación.

## 2.1 Auditoría obligatoria antes de escribir código

Antes de modificar cualquier archivo, Claude Code debe inspeccionar el estado real del proyecto y dejar constancia de lo encontrado.

Como mínimo debe revisar:

```text
repository identity / remote
current branch
git status
recent relevant commits
package manager realmente usado
package.json + lockfile
dependencies existentes
scripts disponibles
lint / typecheck / tests / build actuales
estructura real de features/, lib/, content/ y components/
prototipos existentes
artefactos curriculares reales presentes en el repo
CSV requeridos por la fase
headers reales
conteos observados
IDs y relaciones relevantes
```

No debe empezar implementando desde la documentación sin comprobar primero el repositorio y los datos reales.

## 2.2 Nada se da por hecho

Claude Code **no puede asumir que la documentación, los CSV y el código coinciden entre sí**.

Debe tratar como hipótesis hasta verificar, entre otras cosas:

```text
nombres y versiones de archivos
headers de CSV
conteos esperados
formatos de IDs
foreign-key-like references
rutas del repositorio
scripts de package.json
estado de los prototipos
estructura de datos
invariantes descritos en documentación
```

Si el código real contradice un documento, o dos documentos contradicen los datos, no debe elegir silenciosamente la opción que haga más fácil la implementación.

## 2.3 Protocolo `BLOCKER_CONTRADICTION`

Cuando exista una contradicción material entre:

```text
arquitectura / especificaciones
CSV canónicos / auditorías
código actual / tests
```

Claude Code debe:

1. identificar exactamente los artefactos y campos en conflicto;
2. reproducir la contradicción con evidencia concreta;
3. comprobar si existe una autoridad explícita en la arquitectura que permita resolverla;
4. distinguir entre error documental, error de código y posible corrupción/inconsistencia de datos;
5. **no inventar una reconciliación**;
6. **no modificar datos canónicos para hacer pasar los tests**;
7. continuar únicamente con trabajo independiente que siga siendo correcto;
8. registrar el problema como `BLOCKER_CONTRADICTION` en el handoff y, cuando sea útil, en un archivo diagnóstico dentro de `docs/`;
9. no declarar la fase completada mientras el bloqueo afecte un criterio de salida.

Si la contradicción puede resolverse de forma determinista mediante una autoridad explícita y evidencia verificable del repositorio, debe documentar la resolución y continuar.

## 2.4 Reglas de repositorio y seguridad Git

1. Trabajar únicamente en `materiasordenadas-del/SpanStories`, rama `prueba`.
2. Verificar antes de editar que la rama activa sea `prueba` y que el remoto esperado sea el correcto.
3. **No tocar `main`**, ni directa ni indirectamente.
4. No hacer `force push`.
5. No usar `git reset --hard` para limpiar problemas.
6. No reescribir historia compartida.
7. No mezclar, borrar ni sobrescribir cambios ajenos no relacionados con la fase.
8. Si el working tree ya contiene cambios, debe identificarlos y preservarlos; no apropiárselos silenciosamente en su commit.
9. Cada fase debe terminar con commit propio y `git push origin prueba` del trabajo válido realizado.
10. Debe verificar que el commit quedó realmente en `origin/prueba` y devolver el **SHA exacto del commit subido**.

## 2.5 Límites arquitectónicos globales

1. Revisar primero el estado real del repositorio y reutilizar lo que ya funcione.
2. No hacer una reescritura total de los prototipos.
3. No rediseñar la UI.
4. **No modificar `components/visual/baseline-v1/`.**
5. No rehacer, eliminar ni sustituir prototipos existentes salvo que la fase lo autorice expresamente y exista reemplazo probado.
6. La UI no puede convertirse en autoridad curricular ni acceder directamente a persistencia.
7. No usar APIs pagas ni crear dependencia obligatoria de servicios externos.
8. No parsear los CSV canónicos durante requests de runtime.
9. No regenerar IDs curriculares publicados a partir del texto.
10. No usar `surface string` como identidad lexical.
11. No convertir frecuencia, cognados, NLP o exposición en autoridad curricular/mastery.
12. Mantener los prototipos mientras sigan siendo útiles como fixtures o pruebas de regresión.
13. Detectar y conservar el package manager ya usado por el repositorio; no cambiarlo arbitrariamente.
14. No adelantar trabajo de fases posteriores salvo el contrato mínimo estrictamente necesario para que la fase actual compile o pueda probarse.

## 2.6 Calidad técnica obligatoria antes del cierre

Toda fase debe ejecutar, según los scripts reales disponibles en el repositorio:

```text
lint
typecheck
tests
production build
```

Si alguno no existe, debe indicarlo explícitamente y no fingir que fue ejecutado. Si existe pero falla por una regresión introducida por la fase, la fase no puede marcarse como completada.

Además, cada fase debe incluir pruebas positivas y negativas relevantes, no solo “happy path”. Cuando la fase procese datos o genere artefactos, debe incluir una prueba de determinismo siempre que corresponda.

## 2.7 Cierre obligatorio de cada fase

Claude Code debe terminar cada chat entregando:

```text
1. Auditoría inicial realizada y hallazgos relevantes.
2. Qué implementó realmente.
3. Archivos creados/modificados.
4. Qué contratos públicos deja disponibles.
5. Tests ejecutados y resultado exacto.
6. Resultado de lint, typecheck y build.
7. Contradicciones, riesgos o BLOCKER_CONTRADICTION encontrados.
8. Limitaciones o deuda técnica deliberadamente dejada fuera.
9. HANDOFF_NEXT_PHASE.md actualizado/creado.
10. Commit realizado.
11. Push confirmado a origin/prueba.
12. SHA exacto del commit presente en origin/prueba.
```

No basta con sugerir un commit. Debe realizar el commit y el push cuando el entorno Git tenga acceso autorizado.

`HANDOFF_NEXT_PHASE.md` es obligatorio incluso si existe un bloqueo. Debe ser corto y contener solo hechos verificables necesarios para iniciar el siguiente chat.

No iniciar trabajo perteneciente a la fase siguiente salvo un contrato mínimo indispensable.

---

# 3. FASE 1 — Canonical Schemas + Curriculum Importer + Registry

## Objetivo cerrado

Convertir los artefactos curriculares publicados en un **registry ejecutable, determinista, validado y versionado**.

El alcance técnico exacto de esta fase es:

```text
canonical schemas
→ importer
→ validators
→ CurriculumRelease
→ SHA-256 source manifest
→ generated registries
→ query API
→ automated tests
```

Nada posterior forma parte de esta fase.

## Auditoría específica obligatoria de Fase 1

Antes de crear schemas o parsers, Claude Code debe inspeccionar y registrar:

```text
1. ubicación real de todos los CSV requeridos;
2. nombres y versiones reales presentes;
3. encoding y delimitador;
4. headers exactos de cada CSV;
5. número real de filas/entidades relevantes;
6. formatos de IDs existentes;
7. duplicados aparentes;
8. relaciones entre Lexeme / Form / Sense / SourceAssertion;
9. módulos / islas / Story blueprints;
10. first-introduction allocations;
11. recycle edges;
12. archivos de auditoría final;
13. código previo en features/curriculum/ y lib/curriculum.ts;
14. tests o scripts existentes que ya validen parte de estos datos.
```

Los conteos documentados son **invariantes esperados que deben verificarse**, no valores que deban forzarse.

Si el dato real no coincide, aplicar `BLOCKER_CONTRADICTION`; no editar el CSV para fabricar coincidencia.

## Entradas mínimas

```text
spanishstories_a1_ws_normalization_master_v1.37.csv
spanishstories_a1_ws_source_assertions_modes_v1.40.csv
spanishstories_a1_ws_sequencing_architecture_v1.51.csv
spanishstories_a1_ws_sequencing_allocation_v1.51.csv
spanishstories_a1_ws_story_blueprints_v1.51.csv
spanishstories_a1_ws_recycling_edges_v1.51.csv
```

Validación adicional:

```text
spanishstories_a1_ws_coverage_final_v1.40.csv
spanishstories_a1_ws_sequencing_final_audit_v1.51.csv
```

Las cinco fuentes de secuenciación `*_v1.44.csv` quedan **SUPERSEDED** y ya no
están en `content/a1/vocabulary/`: se archivaron en
`content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`.

## Implementar — y solo esto

### A. Schemas TypeScript canónicos

Definir los contratos necesarios para representar como mínimo:

```text
CurriculumRelease
Level
Module
Island
StoryBlueprint
CurriculumTarget
GrammarUnit
MwuUnit
Lexeme
LexemeForm
Sense
SourceAssertion
RecycleEdge
```

No añadir campos por intuición si no están respaldados por las fuentes o por una necesidad técnica explícita. Las discrepancias deben documentarse.

### B. Importer determinista

El importer debe:

- consumir los CSV canónicos fuera del request runtime;
- parsear con reglas explícitas;
- normalizar solo aquello autorizado por contrato;
- conservar IDs publicados exactamente;
- producir errores diagnósticos útiles;
- no ocultar filas inválidas;
- no corregir silenciosamente datos de entrada.

### C. Validators

Validar como mínimo:

```text
duplicate published IDs
missing references
Sense without Lexeme
Form without Lexeme
invalid target references
A2 boundary scheduled as A1
regional receptive target promoted to universal productive
missing intro Story
missing recycle Story
backward recycle edge
first-introduction duplication
expected release counts
```

Un invariant crítico inválido debe provocar:

```text
IMPORT FAIL
```

No warning silencioso.

### D. `CurriculumRelease`

Generar un manifiesto reproducible con, como mínimo:

```text
releaseId
schemaVersion
sourceFiles
source SHA-256 hashes
expected/observed counts
validation result
```

Un timestamp operativo puede existir, pero **no debe contaminar la prueba de determinismo del contenido canónico**.

### E. Generated Registry

Generar artefactos aptos para runtime equivalentes a:

```text
generated/curriculum/a1/
├── release.json
├── lexemes.json
├── forms.json
├── senses.json
├── source-assertions.json
├── modules.json
├── islands.json
├── story-blueprints.json
├── targets.json
└── recycle-edges.json
```

La ubicación exacta puede adaptarse a la estructura real del repo si existe una razón técnica demostrable; debe documentarse.

### F. Query API mínima

Debe permitir al menos:

```text
get Lexeme by LEX-A1-*
get Form by FORM-A1-*
get Sense by SENSE-A1-*
resolve relations Sense → Lexeme
resolve relations Form → Lexeme
find first-introduction Story for a target
retrieve recycle path / recycle edges for a target
retrieve module/island/story-blueprint metadata by canonical ID
```

### G. Tests

Crear tests automatizados suficientes para demostrar los invariantes y el comportamiento determinista.

## Invariantes de aceptación

Primero deben verificarse contra los archivos reales. Si se confirman, deben quedar codificados como invariantes de la release:

```text
LEXEME_COUNT = 599
LEXEME_FORM_COUNT = 666
SENSE_REGISTRY_COUNT = 608
A1_SENSE_COUNT = 602
MWU_COUNT = 214
GRAMMAR_UNITS = 169
MODULE_COUNT = 8
ISLAND_COUNT = 11
STORY_BLUEPRINT_COUNT = 32
FIRST_INTRO_OBJECTS = 985
FOCUS_FIRST_INTRO = 448
SUPPORTED_FIRST_INTRO = 537
MAX_FOCUS_PER_STORY = 20
RECYCLE_EDGE_COUNT = 2867
FIRST_RETURN_EDGES = 985
SECOND_RETURN_EDGES = 950
THIRD_RETURN_EDGES = 932
ISLAND_CHECKPOINTS = 11
MODULE_CHECKPOINTS = 8
FINAL_TRANSFER_STORIES = 1
CAPSTONE_FIRST_INTRO = 0
DELE_TASK_STRUCTURES = 13
REGIONAL_RECEPTIVE_TARGETS = 16
```

> **HISTORICAL BASELINE — SUPERSEDED.** El release `A1-CURRICULUM-v1.44`
> declaraba `ISLAND_COUNT = 32`, `STORY_BLUEPRINT_COUNT = 103` y
> `RECYCLE_EDGE_COUNT = 2955`. Son cifras históricas, no expectativas activas,
> y no deben codificarse como invariantes.

Además:

```text
orphan senses = 0
orphan forms = 0
A2 boundary scheduled as A1 = 0
backward recycle edges = 0
route order violations = 0
duplicate published IDs = 0
version-stamped columns = 0
```

**Prohibición:** no alterar, truncar, eliminar, duplicar o reinterpretar filas de los CSV canónicos solo para conseguir estos números.

## Pruebas técnicas obligatorias

### Happy path

- importar la release completa desde cero;
- lookup exitoso por IDs reales `LEX-A1-*`, `FORM-A1-*`, `SENSE-A1-*`;
- recuperar first-introduction de un target real;
- recuperar recycle path/edges de un target real;
- comprobar relaciones Form → Lexeme y Sense → Lexeme;
- comprobar que los generated artifacts son consumibles sin volver a parsear CSV en runtime.

### Corrupción deliberada

Las pruebas deben usar fixtures/copias temporales; **nunca modificar los CSV canónicos originales**.

Debe demostrarse `IMPORT FAIL` al menos ante:

```text
FK/referencia inexistente
ID publicado duplicado
Sense huérfano
Form huérfana
A2 boundary programado como A1
recycle edge hacia Story inexistente
first-introduction duplicada
```

### Determinismo

Con los mismos inputs:

```text
import #1
import #2
```

los artefactos canónicos generados deben tener contenido equivalente byte-a-byte o hashes de contenido idénticos, excluyendo únicamente metadata operacional explícitamente no determinista que esté separada del contenido canónico.

No se considera determinista si el orden depende accidentalmente del filesystem, de iteración no ordenada o de timestamps embebidos en los artefactos de contenido.

## Qué puede tocar

Preferentemente:

```text
features/curriculum/**
lib/adapters/** solo si hace falta un contrato mínimo
scripts/** o tooling equivalente para import/build
src generated path o generated/curriculum/** según estructura real
tests relacionados con curriculum/importer
package.json solo si se necesita un script/dependencia estrictamente justificada
docs/curriculum-import.md
HANDOFF_NEXT_PHASE.md
```

Puede crear archivos auxiliares estrictamente necesarios dentro de límites equivalentes si la estructura real del repo lo exige.

## Qué NO puede tocar

Esta fase **no autoriza** modificar funcionalmente:

```text
components/visual/baseline-v1/**
UI / layout / estilos
StoryReader visual
lib/lexical-prototype.ts
lib/learner-event-prototype.ts
Story Engine
Learner Event / Progress Engine
PostgreSQL / ORM / migrations
Auth
NLP / spaCy / Python service
mastery
spaced repetition
recommendation engine
real A1 story authoring
```

`lib/curriculum.ts` debe preservarse como prototipo/legacy salvo adaptación mínima y no destructiva demostrablemente necesaria. No debe borrarse ni reescribirse por completo en esta fase.

### Fases expresamente prohibidas

Durante Fase 1 está prohibido iniciar implementación de:

```text
FASE 2 — Lexical Engine canónico
FASE 3 — Story Engine
FASE 4 — Learner Event / Progress Engine
FASE 5 — PostgreSQL
FASE 6 — NLP Assistance
```

Si surge una necesidad futura, debe anotarse en `HANDOFF_NEXT_PHASE.md`, no implementarse anticipadamente.

## Validación final obligatoria de Fase 1

Antes del commit debe:

1. ejecutar importer completo;
2. ejecutar tests de corrupción deliberada;
3. ejecutar prueba de determinismo;
4. ejecutar `lint` real del repo;
5. ejecutar typecheck real del repo;
6. ejecutar test suite relevante/completa según scripts existentes;
7. ejecutar production build;
8. revisar `git diff` y confirmar que no existen cambios fuera del alcance;
9. revisar que ningún CSV canónico fue alterado para satisfacer los tests;
10. crear/actualizar `HANDOFF_NEXT_PHASE.md`.

Si un comando no existe, debe declararlo. Si una regresión propia falla, no puede declarar la fase completada.

## Cierre Git obligatorio de Fase 1

Con el trabajo válido y probado:

```text
git status
# revisar diff y archivos staged
git commit ...
git push origin prueba
```

Después debe verificar que el commit está en el remoto y entregar:

```text
branch = prueba
remote = origin/prueba
commit SHA = <SHA exacto realmente subido>
```

Prohibido:

```text
push a main
force push
reset --hard
rebase destructivo de historia compartida
incluir cambios ajenos no relacionados
```

Si existe `BLOCKER_CONTRADICTION`, debe commitear y subir únicamente trabajo técnicamente válido y el diagnóstico/handoff correspondiente; la fase se marca como **INCOMPLETA / BLOCKED**, nunca como completada artificialmente.

## Salida necesaria para Fase 2

La Fase 1 solo puede declararse completa si deja:

```text
Canonical domain schemas
+ deterministic Curriculum Importer
+ validators
+ CurriculumRelease reproducible
+ SHA-256 source manifest
+ registries estables
+ query API
+ corruption tests
+ determinism test
+ lint/typecheck/tests/build verdes
+ HANDOFF_NEXT_PHASE.md
+ commit presente en origin/prueba
+ SHA remoto verificado
```

---

# 4. FASE 2 — Lexical Engine canónico

## Objetivo cerrado

Sustituir progresivamente el modelo lexical prototípico por contratos canónicos basados en los IDs de la Fase 1.

## Implementar

- `Lexeme`;
- `LexemeForm`;
- `Sense`;
- `SourceAssertion`;
- `HomographGroup` si el dominio lo necesita ya;
- `Pronominality`;
- MWU resolution;
- lineage básico: `SPLIT_INTO`, `MERGED_INTO`, `REPLACED_BY`, `DEPRECATED`;
- lifecycle de identidades;
- query services;
- adapters que permitan mantener vivo el vertical slice prototípico.

## Invariantes centrales

```text
surface ≠ Lexeme
Lexeme ≠ Sense
Form ≠ Lexeme
same canonical form + POS ≠ guaranteed same Lexeme
published ID = immutable
lineage graph = acyclic
```

## Pruebas técnicas obligatorias

Casos mínimos:

```text
comió → COMER
vino(NOUN) ≠ vino/VENIR(VERB)
IR ≠ IRSE cuando corresponda
DARSE_CUENTA como unidad multiword
homógrafos same-POS permanecen separables
```

Lineage:

- split no reutiliza el ID fuente;
- merge no elimina IDs históricos;
- detectar ciclos de lineage;
- ID superseded sigue resolviendo;
- un split legacy no redirige silenciosamente a un solo hijo.

## No hacer

- Story tokenization definitiva;
- LearnerEvent definitivo;
- tablas PostgreSQL;
- NLP automático;
- UI nueva.

## Salida necesaria para Fase 3

```text
Lexical Engine estable
+ IDs reales
+ lineage
+ query contracts
+ adapter del prototipo
```

---

# 5. FASE 3 — Story Engine canónico

## Objetivo cerrado

Crear el modelo publicable y versionado de Stories y sus anotaciones lingüísticas.

## Implementar

```text
Story
StoryVersion
Sentence
SurfaceToken
TextAnchor
StoryOccurrence
OccurrencePart
StoryTargetBinding
publication validator
```

Debe soportar occurrences contiguas y discontinuas.

## Casos bloqueantes

```text
se dio finalmente cuenta
vete
ha llevado
llevar + duración + gerundio
```

`TextAnchor` debe poder seleccionar un fragmento dentro de un token; `OccurrencePart[]` no puede depender exclusivamente de `token_id`.

## Pruebas técnicas obligatorias

- offsets reproducen exactamente el texto original;
- una occurrence puede tener `1..N` parts;
- gaps entre parts son válidos;
- overlap inválido dentro de una misma occurrence falla;
- `vete` permite HEAD=`ve` y CLITIC=`te` dentro del mismo token;
- `se dio finalmente cuenta` permite CLITIC + HEAD + FIXED con gap;
- StoryVersion antigua conserva sus anchors tras publicar una versión nueva;
- occurrence con Lexeme/Sense inexistente no puede publicarse;
- target fuera de secuencia requiere error/override editorial explícito.

## Migración controlada

Mover o etiquetar `La compra olvidada` como fixture técnico y demostrar que el nuevo Story Engine reproduce su comportamiento sin convertirla falsamente en Story curricular canónica.

## No hacer

- NLP como autoridad;
- generación automática de Stories;
- PostgreSQL todavía;
- progreso/mastery avanzado;
- rediseño visual.

## Salida necesaria para Fase 4

```text
StoryVersion estable
+ occurrences versionadas
+ anchors fiables
+ publication validator
```

---

# 6. FASE 4 — Learner Event / Progress Engine

## Objetivo cerrado

Convertir el prototipo de eventos en un motor append-only con proyecciones reconstruibles y compatible con cambios lexicales futuros.

## Implementar

Mínimo:

```text
LearnerEvent
LearnerEventRepository interface
LearnerEventAttribution
DeclaredState projection
Context history projection
Progress projection
projection metadata/version
```

Eventos MVP:

```text
OCCURRENCE_OPENED
STATE_DECLARED
```

Dejar extensible para reconocimiento, recall y producción sin implementar todo aún.

## Reglas

```text
Event ≠ current state
NEW/LEARNING/KNOWN = declared state
Declared state ≠ mastery
LearnerEvent = immutable history
Projection = rebuildable
```

## Pruebas técnicas obligatorias

- reconstruir estado solo desde event log;
- borrar projection y obtener el mismo resultado al recomputar;
- orden temporal estable;
- evento conserva `storyVersionId`, `occurrenceId`, IDs registrados y releases;
- split: un evento histórico contribuye como máximo a un hijo;
- split ambiguo → `AMBIGUOUS_LEGACY`, sin duplicación;
- merge equivalente reúne evidencia sin copiar eventos;
- proyección registra `projectionAlgorithmVersion`, release y cutoff.

## Persistencia provisional

Mantener `localStorage` solo como adapter provisional si sigue siendo útil. El dominio no debe importar `window.localStorage`.

## No hacer

- fórmula de mastery avanzada;
- spaced repetition;
- recomendador;
- PostgreSQL todavía;
- auth.

## Salida necesaria para Fase 5

```text
repository interfaces
+ append-only contracts
+ deterministic projections
+ lineage-aware attribution
```

---

# 7. FASE 5 — PostgreSQL + repositories + persistence

## Objetivo cerrado

Persistir los contratos ya aprobados sin rediseñar el dominio para acomodar la base de datos.

## Secuencia interna

```text
domain contracts
→ docs/data-model.md
→ ERD
→ elegir acceso SQL/ORM
→ migrations
→ repositories
→ seeds/import
→ persistence tests
```

La elección entre Drizzle, Prisma, SQL tipado u otra opción se hace **aquí**, no antes, comparándola contra el modelo real.

## Persistir como mínimo

- curriculum release/registry necesario;
- lexical identities y lineage;
- Story/StoryVersion/anchors/occurrences;
- learner event log;
- projection metadata o mecanismo reproducible;
- repository implementations.

## Pruebas técnicas obligatorias

- migración desde DB vacía;
- constraints de FK;
- IDs publicados permanecen únicos e inmutables;
- lineage cíclico rechazado;
- StoryVersion y anchors no se destruyen al editar contenido;
- event log append-only por contrato;
- repository contract tests pasan igual con adapter in-memory y PostgreSQL;
- seed de curriculum produce los conteos esperados;
- índices cubren lookups principales por lexeme/sense/story/user/event time.

## No hacer

- hacer que React consulte tablas directamente;
- usar PK física como sustituto del ID curricular publicado;
- poner lógica de dominio en queries SQL ad hoc dispersas;
- auth complejo;
- NLP.

## Salida necesaria para Fase 6

```text
DB reproducible
+ migrations
+ repositories
+ seeds
+ contract tests
```

---

# 8. FASE 6 — NLP Assistance

## Objetivo cerrado

Añadir un servicio auxiliar que produzca **candidatos**, nunca autoridad editorial.

```text
text
→ sentence/token candidates
→ morphology
→ Lexeme candidates
→ MWU candidates
→ Sense candidates
→ canonical resolution suggestions
→ review
```

## Tecnología inicial preferida

```text
Python
spaCy
scripts propios
```

Puede cambiarse si las pruebas muestran una alternativa claramente superior y gratuita.

## Implementar primero

- contrato entrada/salida estable;
- tokenización y offsets compatibles con `TextAnchor`;
- lemma/POS/morphology candidates;
- candidate resolver contra registries canónicos;
- MWU candidate detection inicial;
- confidence/status;
- separación `AUTO` vs `REVIEWED/CONFIRMED`.

## Pruebas técnicas obligatorias

Corpus mínimo:

```text
comió
comía
ha comido
había comido
vino (NOUN / VENIR)
como (COMER / como)
me voy
vete
se dio finalmente cuenta
se lava
se venden libros
aquí se vive bien
lleva tres años estudiando
```

Comprobar:

- offsets NLP coinciden con el texto original;
- no genera nuevos IDs curriculares;
- no convierte candidate en published annotation;
- no clasifica automáticamente nivel CEFR;
- distingue cuando sea posible lexical-pronominal vs reflexive/passive/impersonal, y marca ambigüedad cuando no pueda;
- degradación explícita a `AMBIGUOUS/AUTO`, no invención silenciosa.

## No hacer

- llamadas pagas por click;
- procesamiento NLP en runtime del lector como requisito normal;
- publicar automáticamente Stories;
- reescribir anotaciones editoriales confirmadas.

## Salida final de las seis fases

```text
Canonical curriculum
→ Lexical Engine
→ Story Engine
→ Learner Event Engine
→ PostgreSQL
→ NLP Assistance
```

A partir de aquí se autoriza el siguiente trabajo:

```text
VERTICAL SLICE A1 REAL
A1 → M01 → I01 → S1/S2/S3
```

con IDs reales, Stories reales, events reales, persistencia y luego integración progresiva con el baseline visual.

---

# 9. Regla para abrir cada nuevo chat de Claude Code

Cada chat debe empezar con solo:

1. este plan;
2. la arquitectura V1 vigente;
3. la especificación particular de la fase si existe;
4. el handoff de la fase anterior;
5. acceso al repositorio `SpanStories`, rama `prueba`.

El agente debe realizar primero la auditoría obligatoria, inspeccionar el código y los datos reales antes de modificarlos, aplicar `BLOCKER_CONTRADICTION` cuando corresponda y trabajar únicamente hasta cumplir los criterios de salida de esa fase.

Cada chat debe cerrar con `HANDOFF_NEXT_PHASE.md`, commit y push a `origin/prueba`, y debe devolver el SHA remoto verificado. Si la fase está bloqueada, el handoff debe decirlo explícitamente y no debe declararse completada.

**No arrastrar conversaciones anteriores completas.** El contrato de continuidad será el código + tests + handoff + SHA remoto.
