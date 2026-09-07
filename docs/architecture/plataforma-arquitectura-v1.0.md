# SpanStories — Arquitectura de Plataforma

**Estado:** Arquitectura consolidada para implementación del motor canónico  
**Versión:** 1.0  
**Fecha:** 2026-09-05  
**Sustituye:** `plataforma_espanol_arquitectura_v0.1.md`  
**Repositorio analizado:** `materiasordenadas-del/SpanStories`  
**Rama de desarrollo:** `prueba`  
**Snapshot de referencia:** commit `e3cdea8ce7bc13f780b3c6b4a0dc6ae4354ccafb`  
**Currículo A1 de referencia:** paquete A–H `A1-CURRICULUM-v1.51` en `docs/curriculum/a1-restructure/` *(sustituye a `spanishstories_curriculo_a1_prueba1_v1.44.md`, SUPERSEDED)*  
**Objetivo de esta versión:** consolidar la arquitectura conceptual original con el currículo A1 ya terminado, el vertical slice técnico existente y la separación visual/técnica ya implementada en el repositorio; definir con precisión qué debe construirse a continuación.

---

> ## Estado vigente del motor
>
> Actualizado tras la migración atómica Fase 1 + Fase 2.
> Copia canónica: `docs/architecture/plataforma-arquitectura-v1.0.md`.
>
> **BASELINE ACTIVO**
>
> ```text
> CurriculumRelease = A1-CURRICULUM-v1.51
> Registry schema   = curriculum-registry/2.0.0
> 8 módulos / 11 islas / 32 StoryBlueprints
> 985 primeras introducciones = 448 FOCUS + 537 SUPPORTED
> 2867 aristas de retorno = 985 FIRST + 950 SECOND + 932 THIRD
>
> LexiconRelease                     = A1-LEXICON-v1.0
> LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51
>
> Fase 1 = MIGRATED / PASS
> Fase 2 = REVALIDATED / PASS
> Fase 3 = READY — implementación NOT STARTED
> ```
>
> **HISTORICAL BASELINE — SUPERSEDED:** `A1-CURRICULUM-v1.44`, 32 islas,
> 103 story blueprints, 2955 aristas de reciclaje, registry schema `1.0.0`,
> currículo `spanishstories_curriculo_a1_prueba1_v1.44.md`.
>
> El inventario léxico (599 Lexemes, 666 LexemeForms, 608 Senses, 214 MWU,
> 169 unidades gramaticales, 16 regionales receptivos) **no cambió** con la
> reestructuración: donde este documento lo describe, sigue vigente.

---

# 0. Resumen ejecutivo

SpanStories ya no se encuentra en la etapa descrita por la arquitectura 0.1.

En la versión 0.1 todavía estaban pendientes:

- un currículo A1 normalizado;
- la secuenciación concreta;
- el repositorio funcional;
- los primeros tipos TypeScript;
- una Story interactiva;
- el modelo inicial de eventos;
- una frontera clara entre diseño y motor.

En la situación actual ya existen:

```text
CURRÍCULO A1 CANÓNICO
        +
SECUENCIACIÓN A1
        +
REPOSITORIO NEXT.JS FUNCIONAL
        +
VERTICAL SLICE TÉCNICO
        +
PROTOTIPO DE LEXICAL ENGINE
        +
PROTOTIPO DE LEARNER EVENTS
        +
BASELINE VISUAL CANÓNICO
```

Por tanto, el objetivo inmediato cambia.

Ya no es:

> diseñar conceptualmente qué podría ser el Lexical Engine.

Ahora es:

> convertir el vertical slice prototípico en un motor canónico capaz de consumir el currículo publicado, preservar IDs y lineage, validar historias y registrar evidencia del estudiante sin acoplar el dominio a la interfaz ni a proveedores externos.

La arquitectura V1 establece como siguiente cadena de implementación:

```text
CURRICULUM IMPORTER
        ↓
CANONICAL REGISTRIES
        ↓
LEXICAL ENGINE
        ↓
STORY ENGINE
        ↓
LEARNER EVENT ENGINE
        ↓
POSTGRESQL
        ↓
NLP ASSISTANCE
        ↓
VERTICAL SLICE A1 CANÓNICO
```

---

# 1. Visión del producto

Construir una plataforma completa para aprender español mediante historias conectadas, práctica lingüística y seguimiento longitudinal del aprendizaje.

La plataforma debe combinar:

- input comprensible;
- historias conectadas;
- exposición repetida;
- recuperación contextual;
- práctica receptiva;
- práctica productiva;
- vocabulario y expresiones multiword;
- gramática integrada y también explicitada cuando corresponda;
- funciones comunicativas;
- comprensión;
- seguimiento del progreso;
- adaptación futura basada en evidencia.

SpanStories no debe comportarse como una biblioteca estática de historias.

Debe comportarse como un:

```text
SISTEMA CURRICULAR
        +
SISTEMA NARRATIVO
        +
SISTEMA LÉXICO
        +
SISTEMA DE EVIDENCIA DEL ESTUDIANTE
```

---

# 2. Principios no negociables

## 2.1 Costo obligatorio inicial = 0

Ningún componente esencial del MVP debe depender de:

- una API comercial por consulta;
- un diccionario de pago obligatorio;
- un proveedor cerrado de IA;
- una base de datos que requiera pago para desarrollar;
- un proveedor de autenticación que controle el modelo de usuario;
- una infraestructura imposible de ejecutar localmente.

Se prioriza:

```text
open source
local development
PostgreSQL
TypeScript
Python para NLP
datasets descargables
preprocesamiento
propiedad operativa de los datos
```

Pagar en el futuro puede mejorar la operación.

Nunca debe ser necesario para rescatar una arquitectura dependiente de terceros.

## 2.2 Currículo ≠ interfaz

La organización pedagógica debe sobrevivir aunque cambie completamente el diseño visual.

## 2.3 Interfaz ≠ motor

La UI no debe contener reglas curriculares, persistencia, resolución de Lexemes ni lógica de mastery.

## 2.4 Forma ≠ Lexeme ≠ Sense

```text
surface form
!=
Lexeme
!=
Sense
```

## 2.5 Exposición ≠ mastery

```text
StoryOccurrence
!=
mastery

WORD_OPENED
!=
known

recognition
!=
productive mastery
```

## 2.6 Frecuencia ≠ nivel

La frecuencia puede priorizar objetos ya autorizados.

No puede convertir una palabra en A1.

## 2.7 Cognado ≠ nivel

La transparencia para una L1 no sustituye una SourceAssertion curricular.

## 2.8 Receptivo ≠ productivo

Los objetivos receptivos y productivos deben almacenarse y evaluarse de forma separada.

## 2.9 El NLP no es autoridad curricular

El NLP puede:

- detectar;
- proponer;
- lematizar;
- clasificar;
- sugerir candidatos.

No puede decidir por sí solo:

- el nivel CEFR;
- el Sense curricular;
- el target pedagógico;
- la publicación final de una Story.

## 2.10 Los IDs publicados son patrimonio del contenido

Los IDs canónicos publicados no deben regenerarse arbitrariamente.

---

# 3. Autoridades del sistema

La V1 formaliza cuatro autoridades diferentes.

## 3.1 Autoridad curricular

Actualmente reside en:

```text
content/a1/vocabulary/
```

y en sus artefactos canónicos.

La pertenencia A1, modalidad, secuenciación y relaciones no se deducen desde la UI ni desde el NLP.

## 3.2 Autoridad técnica

Reside progresivamente en:

```text
features/
lib/
```

Especialmente:

```text
features/curriculum/
features/lexical-engine/
features/story-engine/
features/learner-progress/
```

## 3.3 Autoridad visual

Reside en:

```text
components/visual/
```

La referencia visual actual es:

```text
components/visual/baseline-v1/
```

El baseline visual aprobado controla:

- layout;
- tipografía;
- color;
- spacing;
- responsive;
- composición;
- motion;
- presentación.

El motor no debe reinterpretar el diseño.

## 3.4 Frontera UI ↔ dominio

La integración debe seguir:

```text
DOMAIN / FEATURES
        ↓
lib/adapters/
        ↓
props + callbacks
        ↓
components/visual/
```

La capa visual no debe importar directamente persistencia ni reglas internas del motor.

---

# 4. Estado real del repositorio analizado

## 4.1 Stack actual

El repositorio ya utiliza:

```text
Next.js 16.2.11
React 19.2.8
React DOM 19.2.8
TypeScript
Node >= 20.9
ESLint
```

Todavía no están incorporados como dependencias de aplicación:

```text
PostgreSQL client / ORM
Auth.js
spaCy
servicio Python
```

## 4.2 Navegación existente

Existe navegación funcional para:

```text
nivel
→ módulo
→ isla
```

mediante App Router.

## 4.3 Vertical slice técnico existente

Existe una Story de prueba con:

- frases segmentadas;
- unidades seleccionables;
- `Lexeme`;
- `Sense`;
- `StoryOccurrence`;
- `OccurrencePart[]`;
- una expresión multiword;
- panel de vocabulario;
- estados `NEW / LEARNING / KNOWN`;
- event log;
- proyección de progreso;
- persistencia en `localStorage`.

## 4.4 Código prototípico existente

Se conservan:

```text
lib/lexical-prototype.ts
lib/learner-event-prototype.ts
lib/curriculum.ts
components/story-reader.tsx
content/a1/module-1/island-1/story-1.ts
```

Estos archivos sirven como prueba del circuito.

No son el modelo canónico final.

## 4.5 Estructura técnica preparada

Ya existen fronteras de trabajo:

```text
features/
├── curriculum/
├── lexical-engine/
├── story-engine/
└── learner-progress/

lib/
└── adapters/

components/
└── visual/
```

La V1 adopta esta estructura como base real.

No se requiere migrar prematuramente a un monorepo `apps/packages/services`.

---

# 5. Estado curricular A1

El currículo A1 dejó de ser una hipótesis.

Está normalizado, auditado, secuenciado y versionado.

## 5.1 Inventario canónico

```text
SURFACE_FORM_COUNT       = 602
LEXEME_COUNT             = 599
LEXEME_FORM_COUNT        = 666
SENSE_REGISTRY_COUNT     = 608
A1_SENSE_COUNT           = 602
A2_BOUNDARY_SENSES       = 6
MWU_COUNT                = 214
GRAMMAR_UNITS            = 169
```

## 5.2 SourceAssertions

Todos los Senses tienen procedencia curricular normalizada.

Existen:

```text
608 / 608 Senses con cobertura de SourceAssertion
```

Los IDs `SA-A1-*` publicados constituyen assertions normalizadas.

La autoridad de nivel pertenece a la assertion.

No a la cadena visible.

## 5.3 Modalidad

Para A1 se conserva explícitamente:

```text
expected_receptive
expected_productive
```

Los 16 Senses regionales receptivos no se convierten en objetivos productivos universales.

## 5.4 Secuenciación A1

El currículo final contiene:

```text
8 módulos
11 islas
32 story blueprints
985 objetos de primera introducción (448 FOCUS + 537 SUPPORTED)
2867 aristas de retorno (985 FIRST + 950 SECOND + 932 THIRD)
```

> **HISTORICAL BASELINE — SUPERSEDED.** La secuenciación v1.44 declaraba
> 32 islas, 103 story blueprints y 2955 aristas de reciclaje. Los 985 objetos
> de primera introducción son los mismos en ambos releases: la reestructuración
> los redistribuyó entre historias, no los añadió ni los quitó.

Los 985 objetos secuenciados son:

```text
602 Senses
169 GrammarUnits
214 MWU/chunks
```

## 5.5 Módulos A1

```text
M01 Contacto y supervivencia comunicativa
M02 Personas y entorno cercano
M03 Tiempo, rutina, estudio y trabajo
M04 Ciudad, servicios y desplazamientos
M05 Comer, comprar y pedir
M06 Ocio, gustos y vida social
M07 Viajes, alojamiento, clima y planes
M08 Opinión, información e integración A1
```

## 5.6 Consecuencia arquitectónica

El código prototípico que todavía representa:

```text
4 módulos
1 isla laboratorio
```

no es autoridad curricular.

Debe ser reemplazado progresivamente por datos derivados del registry canónico.

---

# 6. Artefactos curriculares: evidencia vs runtime

Los archivos en `content/a1/vocabulary/` no tienen todos la misma función.

## 6.1 Evidencia histórica

Los CSV de Fases 6–13 y auditorías relacionadas conservan:

- procedencia;
- decisiones;
- revisión temática;
- regionalidad;
- cognados;
- auditoría legal;
- pragmática;
- ortografía;
- cultura;
- interculturalidad.

Son parte del historial editorial.

No deben cargarse todos en cada request de la aplicación.

## 6.2 Inputs canónicos del motor

El primer importer deberá consumir como mínimo:

```text
spanishstories_a1_ws_normalization_master_v1.37.csv
spanishstories_a1_ws_source_assertions_modes_v1.40.csv
spanishstories_a1_ws_sequencing_architecture_v1.51.csv
spanishstories_a1_ws_sequencing_allocation_v1.51.csv
spanishstories_a1_ws_story_blueprints_v1.51.csv
spanishstories_a1_ws_recycling_edges_v1.51.csv
```

Como validadores adicionales:

```text
spanishstories_a1_ws_coverage_final_v1.40.csv
spanishstories_a1_ws_sequencing_final_audit_v1.51.csv
```

Como documentación humana consolidada:

```text
docs/curriculum/a1-restructure/spanstories_a1_implementation_manifest_v1.51.md
```

> **SUPERSEDED.** Las cinco fuentes `*_v1.44.csv` están archivadas en
> `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/` y ya no se importan;
> `spanishstories_curriculo_a1_prueba1_v1.44.md` es documentación histórica.

## 6.3 Regla runtime

La aplicación NO debe parsear CSV de varios megabytes en cada interacción.

Flujo correcto:

```text
CANONICAL CSV
    ↓ build/import
VALIDATION
    ↓
COMPILED REGISTRY / DB SEED
    ↓
RUNTIME
```

---

# 7. Curriculum Registry

Antes de PostgreSQL, el sistema necesita una representación ejecutable y validada del currículo.

## 7.1 Responsabilidad

El `Curriculum Registry` debe responder:

```text
qué existe
qué ID tiene
a qué nivel pertenece
qué Sense está autorizado
qué modalidad requiere
dónde se introduce
dónde se recicla
qué prerequisitos tiene
qué Story blueprint lo utiliza
```

## 7.2 Entidades mínimas

```text
CurriculumRelease

Level
Module
Island
StoryBlueprint

CurriculumTarget
GrammarUnit
MwuUnit
FunctionUnit

Lexeme
LexemeForm
Sense
SourceAssertion

RecycleEdge
```

## 7.3 Target polimórfico

No todo target curricular es un Lexeme.

El target debe poder apuntar a:

```text
Sense
GrammarUnit
MwuUnit
```

Las funciones y otros objetivos pueden formar capas de planificación sin forzarse a convertirse en palabras.

## 7.4 Validación obligatoria

El importer debe fallar si detecta:

- ID duplicado;
- FK inexistente;
- Sense sin Lexeme;
- Form sin Lexeme;
- A2 boundary programado como A1;
- target regional convertido a productivo universal;
- Story de introducción inexistente;
- recycle edge hacia una Story inexistente;
- ciclo temporal;
- objeto de first introduction duplicado;
- conteos que no coinciden con la release esperada.

---

# 8. Identidad y versionado

## 8.1 IDs curriculares publicados

Ejemplos:

```text
LEX-A1-000001
SENSE-A1-000001
FORM-A1-000001
SA-A1-000001
```

Estos son IDs de contenido.

No deben confundirse con la política de primary keys de PostgreSQL.

## 8.2 Inmutabilidad

Una vez publicado un ID:

```text
published_id = immutable
```

Las correcciones no deben reutilizar silenciosamente un ID para significar otra cosa.

## 8.3 Release

Cada importación canónica debe producir un manifiesto:

```text
CurriculumRelease
- releaseId
- schemaVersion
- sourceFiles
- sourceHashes
- importedAt
- expectedCounts
- validationResult
```

## 8.4 Split / merge

El sistema debe soportar correcciones editoriales posteriores sin destruir historial.

Ejemplos:

```text
Lexeme A
→ split
→ Lexeme B + Lexeme C
```

o:

```text
Lexeme A + Lexeme B
→ merge
→ Lexeme C
```

El historial antiguo no se reescribe.

Debe existir lineage equivalente a:

```text
EntityLineage
- predecessorId
- successorId
- relationType
- effectiveRelease
```

Tipos mínimos:

```text
SPLIT_INTO
MERGED_INTO
REPLACED_BY
DEPRECATED
```

Los eventos del estudiante mantienen el ID registrado originalmente y la release en la que existía.

Las proyecciones nuevas pueden resolver lineage explícitamente.

---

# 9. Lexical Engine canónico

## 9.1 Definición

El Lexical Engine es el subsistema encargado de resolver y relacionar:

```text
forma visible
→ LexemeForm
→ Lexeme
→ Sense
→ metadata
→ occurrences
→ curriculum
→ learner evidence
```

No es un simple diccionario.

## 9.2 Responsabilidades

Debe:

- resolver IDs;
- exponer formas;
- exponer sentidos;
- conocer relaciones Lexeme ↔ Sense;
- exponer metadata curricular;
- recuperar occurrences;
- recuperar contextos previos;
- representar MWUs;
- mantener release/lineage;
- ofrecer consultas estables a Story Engine y Learner Progress.

## 9.3 No responsabilidades

No debe:

- renderizar UI;
- decidir colores;
- guardar componentes React;
- inventar nivel CEFR;
- llamar a IA por cada click;
- convertir exposición en mastery;
- publicar automáticamente una desambiguación NLP no revisada.

---

# 10. Lexeme

Un `Lexeme` representa una unidad léxica normalizada.

Debe contener conceptualmente:

```text
Lexeme
- id
- canonicalForm
- partOfSpeech / lexicalClass
- lexicalType
- pronominality
- status
- release metadata
```

Puede ser:

```text
SINGLE_WORD
MULTIWORD
```

No todas las MWU del currículo son necesariamente Lexemes.

---

# 11. LexemeForm

`LexemeForm` representa una forma vinculada a un Lexeme.

Ejemplos:

```text
comer
como
comes
comió
comieron
```

La forma visible de una Story puede corresponder a un `LexemeForm`.

El motor debe distinguir:

```text
surface text
!=
canonical form
```

No debe crear un Lexeme nuevo por cada flexión.

---

# 12. Sense

Un `Sense` representa el significado específico relevante para la plataforma.

Ejemplo:

```text
banco
├── asiento
└── institución financiera
```

Cada `StoryOccurrence` lexical debe poder resolver un `Sense`.

La pertenencia curricular se determina a nivel de assertion/sense cuando corresponde.

Por eso:

```text
Lexeme A1
```

no implica automáticamente:

```text
todos los sentidos de ese Lexeme son A1
```

---

# 13. MWU y chunks

El currículo A1 contiene 214 unidades multiword/chunks.

Clases actuales:

```text
MULTIWORD_LEXEME
COLLOCATION
CONSTRUCTION_INSTANCE
FORMULA
DISCOURSE_MARKER
```

## 13.1 Regla

No se deben convertir automáticamente todas en Lexemes.

Los `MULTIWORD_LEXEME` pueden relacionarse con un Lexeme canónico.

Las demás pueden ser targets curriculares con identidad propia.

## 13.2 Frecuencia

Nunca:

```text
MWU frequency
=
sum(component frequencies)
```

La frecuencia de una MWU requiere evidencia propia.

---

# 14. Story Engine

El Story Engine administra contenido narrativo publicable.

Debe separar:

```text
AUTHORING
VALIDATION
PUBLISHED STORY
RUNTIME PRESENTATION
```

## 14.1 Entidades mínimas

```text
Story
StoryVersion
StorySentence
StoryOccurrence
OccurrencePart
StoryTargetBinding
```

## 14.2 Story versionada

Una Story publicada debe tener versión.

Editar el texto después de registrar eventos puede invalidar offsets y occurrences.

Por tanto:

```text
storyId
+
storyVersion
```

deben poder identificar el contenido exacto visto por el estudiante.

---

# 15. StoryOccurrence

`StoryOccurrence` representa una aparición lingüística anotada en una Story.

Para una occurrence lexical:

```text
StoryOccurrence
- id
- storyVersionId
- sentenceId
- lexemeId
- senseId
- lexemeFormId? 
- surface
- parts[]
```

## 15.1 LexemeForm opcional

No todas las occurrences necesitan resolver una fila de `LexemeForm` si el inventario todavía no contiene esa flexión.

El sistema debe poder almacenar:

```text
surface
+
morphology
+
Lexeme
+
Sense
```

sin fabricar una Form publicada inexistente.

---

# 16. OccurrencePart[] y discontinuidad

La V1 adopta explícitamente soporte para occurrences con varias partes.

Ejemplos:

```text
irse
darse cuenta
se dio finalmente cuenta
tener que + infinitivo
clíticos separados
```

No debe asumirse:

```text
Occurrence = un span contiguo
```

Modelo conceptual:

```text
StoryOccurrence
   ├── OccurrencePart 1
   ├── OccurrencePart 2
   └── OccurrencePart N
```

Cada parte puede registrar:

```text
token/span reference
role
order
surface
```

Roles iniciales posibles:

```text
HEAD
FIXED
CLITIC
```

La implementación podrá ampliar la taxonomía.

---

# 17. Tokens, spans y anotaciones

El texto publicado debe poder conservar una segmentación estable.

Flujo:

```text
StoryVersion
  ↓
Sentence
  ↓
Token
  ↓
Span / OccurrencePart
  ↓
StoryOccurrence
```

No todos los targets gramaticales deben convertirse artificialmente en un `Lexeme`.

Cuando una estructura necesite evidencia textual, puede añadirse una anotación de target sobre uno o varios spans.

Esto evita deformar el modelo lexical para representar gramática.

---

# 18. Story Processor

## 18.1 Flujo

```text
AUTHOR STORY
     ↓
normalize text
     ↓
sentence segmentation
     ↓
tokenization
     ↓
morphological analysis
     ↓
lexeme candidates
     ↓
MWU candidates
     ↓
sense candidates
     ↓
curriculum validation
     ↓
editorial review
     ↓
publish StoryVersion
```

## 18.2 Regla editorial

El NLP propone.

La publicación confirma.

```text
NLP_CANDIDATE
!=
PUBLISHED_ANNOTATION
```

## 18.3 Momento del procesamiento

El procesamiento debe hacerse preferentemente:

```text
antes de publicar
```

No en tiempo real cuando el estudiante hace click.

---

# 19. NLP

## 19.1 Tecnología candidata

Se mantiene:

```text
Python
spaCy
scripts propios
```

como candidato inicial.

## 19.2 Orden de implementación

NLP NO es Motor Fase 1.

Primero:

```text
IDs canónicos
importer
registries
Story schema
event contracts
```

Después se añade NLP.

## 19.3 Razón

Sin registry canónico, el NLP no tendría una autoridad contra la cual resolver sus candidatos.

---

# 20. Diccionario interno

La arquitectura objetivo continúa siendo:

```text
OPEN LEXICAL DATA
      ↓
IMPORT
      ↓
NORMALIZATION
      ↓
OUR STORAGE
      ↓
LEXICAL ENGINE
```

Fuentes candidatas:

```text
Kaikki / Wiktextract
Tatoeba
otros corpora abiertos compatibles
```

## 20.1 Separación de autoridad

Un dataset abierto puede aportar:

- gloss;
- POS;
- flexiones;
- traducciones;
- ejemplos.

No aporta automáticamente:

```text
curriculum level
productive expectation
first introduction
mastery
```

## 20.2 Prioridad de contextos

```text
1. contextos propios ya estudiados
2. ejemplos editoriales propios
3. corpus abierto complementario
```

---

# 21. Learner Event Engine

La V1 conserva el principio event-first ya probado en el vertical slice.

## 21.1 Evento ≠ estado

El sistema debe guardar:

```text
event log
```

y derivar:

```text
current projection
```

No sobrescribir simplemente:

```text
word = KNOWN
```

## 21.2 Eventos mínimos actuales

El prototipo ya demuestra:

```text
WORD_OPENED
STATE_DECLARED
```

## 21.3 Eventos canónicos futuros

El schema debe poder evolucionar hacia:

```text
OCCURRENCE_OPENED
STATE_DECLARED

RECOGNITION_ATTEMPTED
RECOGNITION_SUCCEEDED
RECOGNITION_FAILED

RECALL_ATTEMPTED
RECALL_SUCCEEDED
RECALL_FAILED

PRODUCTION_ATTEMPTED
PRODUCTION_SUCCEEDED
PRODUCTION_FAILED

EXERCISE_ANSWERED
```

No es necesario implementar todos en el MVP inicial.

---

# 22. Datos que debe congelar un evento

Un evento lexical debe conservar suficiente contexto histórico para seguir siendo interpretable después de cambios editoriales.

Conceptualmente:

```text
eventId
eventType
occurredAt
userId

storyId
storyVersionId
occurrenceId

recordedLexemeId
recordedSenseId
recordedFormId?

curriculumRelease
lexiconRelease

payload
```

El evento conserva lo registrado en su momento.

No se reescribe retroactivamente por un split/merge.

---

# 23. Estado declarado

Se mantienen inicialmente:

```text
NEW
LEARNING
KNOWN
```

Estos valores significan:

```text
user_declared_state
```

No mastery calculado.

La UI debe expresarlo como percepción/estado declarado del estudiante.

---

# 24. Mastery calculado

El futuro `computed_mastery` debe derivarse de evidencia.

Puede considerar:

- reconocimiento;
- recall;
- producción;
- tiempo;
- errores;
- variación contextual;
- repetición;
- spacing;
- Sense;
- modalidad.

No debe derivarse de:

```text
número bruto de apariciones
```

ni de:

```text
estado declarado = KNOWN
```

## 24.1 Versionado

Toda proyección debe registrar:

```text
projectionAlgorithmVersion
eventCutoff
calculatedAt
```

De este modo el algoritmo puede cambiar sin destruir el event log.

---

# 25. Progress Engine

El progreso debe poder calcularse en varias capas:

```text
Story
Island
Module
Level
Lexeme
Sense
GrammarUnit
MWU
```

Debe distinguir:

```text
content coverage
learner evidence
learner declared state
computed mastery
```

No existe un porcentaje universal de aprobación fijado por esta arquitectura.

---

# 26. Secuenciación y reciclaje

La secuenciación canónica ya define:

```text
INTRO
→ LOCAL_REUSE
→ NEAR_TRANSFER
→ DISTANT_RETURN
```

Para targets regionales receptivos:

```text
INTRO
→ LOCAL_RECEPTIVE_REUSE
→ REGIONAL_NEAR_RECOGNITION
→ REGIONAL_LATER_RECOGNITION
```

Estas aristas son obligaciones curriculares de planificación.

No son eventos de mastery.

El Story Engine deberá poder validar que una Story publicada satisface sus bindings previstos.

---

# 27. Adaptación futura

La personalización se construirá encima de evidencia real.

Puede considerar:

```text
targets débiles
targets nunca encontrados
targets declarados conocidos
reconocimiento
recall
producción
historial de errores
curriculum position
recycle requirements
```

No se fija todavía una fórmula como:

```text
70 / 20 / 10
```

como regla universal.

---

# 28. Arquitectura de capas

```text
┌───────────────────────────────────────────────┐
│               VISUAL LAYER                    │
│ components/visual/                            │
│                                               │
│ screens / layouts / patterns / primitives     │
└───────────────────────┬───────────────────────┘
                        │ props / callbacks
                        ▼
┌───────────────────────────────────────────────┐
│                 ADAPTERS                      │
│ lib/adapters/                                 │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│              APPLICATION FEATURES             │
│                                               │
│ curriculum                                    │
│ lexical-engine                                │
│ story-engine                                  │
│ learner-progress                              │
└──────────────┬───────────────────┬────────────┘
               │                   │
               ▼                   ▼
┌────────────────────────┐   ┌───────────────────────┐
│    PERSISTENCE         │   │   STORY/NLP PIPELINE  │
│                        │   │                       │
│ PostgreSQL             │   │ Python / spaCy        │
│ event log              │   │ preprocessing         │
│ registries             │   │ candidates            │
│ published content      │   │ validation assistance │
└──────────────┬─────────┘   └───────────────────────┘
               ▲
               │ import / seed
               │
┌──────────────┴────────────────────────────────┐
│           CANONICAL CURRICULUM DATA           │
│ CSV + release manifests + editorial data      │
└───────────────────────────────────────────────┘
```

---

# 29. Arquitectura visual

## 29.1 Baseline

La referencia visual canónica es:

```text
components/visual/baseline-v1/
```

Incluye actualmente referencias para:

- landing / lector;
- niveles;
- islas;
- progreso.

## 29.2 CSS legacy

```text
app/globals.css
components/story-reader.module.css
```

se consideran soporte temporal del prototipo técnico.

No son fuente visual para nuevas pantallas.

## 29.3 Regla

Una integración del motor:

```text
puede cambiar datos
puede cambiar handlers
puede cambiar adapters
```

pero no debe:

```text
rediseñar silenciosamente una pantalla aprobada
```

---

# 30. Arquitectura técnica actual del repo

La estructura real de V1 es:

```text
SpanStories/
│
├── app/
│   └── rutas Next.js
│
├── components/
│   ├── story-reader.tsx              # legacy/prototipo funcional
│   └── visual/
│       ├── baseline-v1/
│       ├── primitives/
│       ├── layouts/
│       ├── patterns/
│       └── screens/
│
├── features/
│   ├── curriculum/
│   ├── lexical-engine/
│   ├── story-engine/
│   └── learner-progress/
│
├── lib/
│   ├── adapters/
│   ├── curriculum.ts                 # prototipo a migrar
│   ├── lexical-prototype.ts
│   └── learner-event-prototype.ts
│
├── content/
│   └── a1/
│       ├── module-1/island-1/story-1.ts
│       └── vocabulary/
│
└── package.json
```

## 30.1 Decisión V1

No migrar ahora a un monorepo porque el documento 0.1 lo imaginara.

La extracción futura a:

```text
packages/
services/
```

solo se hará cuando exista una necesidad real:

- reutilización multi-app;
- proceso Python separado;
- package database independiente;
- workers;
- tooling compartido.

---

# 31. Curriculum Feature

`features/curriculum/` debe absorber progresivamente:

```text
registry
importer
validators
release manifest
module/island queries
target queries
sequencing
recycle graph
```

`lib/curriculum.ts` debe considerarse fixture/legacy hasta que el registry canónico lo reemplace.

---

# 32. Lexical Engine Feature

`features/lexical-engine/` debe absorber:

```text
domain types
registries
queries
lineage
lexeme resolution
sense resolution
form resolution
MWU resolution
occurrence lookup
context retrieval
```

`lib/lexical-prototype.ts` debe mantenerse temporalmente para no romper el vertical slice.

Se elimina solamente cuando el nuevo vertical slice canónico lo haya sustituido.

---

# 33. Story Engine Feature

`features/story-engine/` debe absorber:

```text
Story schema
StoryVersion
Sentence
Token
Occurrence
OccurrencePart
target bindings
publication validation
story retrieval
```

El archivo actual:

```text
content/a1/module-1/island-1/story-1.ts
```

se considera:

```text
TECHNICAL FIXTURE
```

No representa la Story curricular canónica M01-I01-S1.

---

# 34. Learner Progress Feature

`features/learner-progress/` debe absorber:

```text
event contracts
event repository interface
projections
declared state
progress
mastery evidence
lineage-aware projection
```

El almacenamiento `localStorage` actual se conserva como adapter provisional.

La lógica de dominio no debe depender directamente de `window.localStorage`.

---

# 35. Persistence

## 35.1 Objetivo

PostgreSQL sigue siendo la base de datos objetivo.

## 35.2 No implementado todavía

A fecha de V1 todavía no existe:

- schema PostgreSQL;
- migrations;
- ORM;
- DB repository layer.

## 35.3 Orden

No comenzar diseñando tablas desde la UI.

Primero:

```text
domain contracts
→ importer
→ registries
→ queries
→ persistence interfaces
→ ERD
→ PostgreSQL
```

## 35.4 PK vs domain IDs

Los IDs canónicos de contenido no determinan automáticamente la PK física.

El esquema puede utilizar una PK interna.

La decisión exacta se formalizará en `docs/data-model.md`.

Regla:

```text
database identity
!=
published curriculum identity
```

---

# 36. Repository interfaces

Los features no deben depender directamente de PostgreSQL ni `localStorage`.

Ejemplos conceptuales:

```text
CurriculumRepository
LexiconRepository
StoryRepository
LearnerEventRepository
```

Adapters iniciales:

```text
InMemory / GeneratedRegistry
LocalStorageLearnerEventRepository
```

Adapters posteriores:

```text
PostgresCurriculumRepository
PostgresLexiconRepository
PostgresStoryRepository
PostgresLearnerEventRepository
```

Esto permite construir el motor antes de desplegar una DB completa.

---

# 37. Contratos UI

Los componentes visuales deben consumir ViewModels simples.

Ejemplo:

```text
WordPanelViewModel
StoryReaderViewModel
ProgressViewModel
IslandMapViewModel
```

No deben recibir objetos internos gigantes del Lexical Engine.

El adapter convierte:

```text
Lexeme + Sense + history + progress
```

en:

```text
props visuales
```

---

# 38. Importer curricular — primera implementación nueva

Este es el siguiente componente que debe construirse.

## 38.1 Entrada

Los artefactos canónicos A1.

## 38.2 Salida inicial

Antes de PostgreSQL puede generar:

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

La ubicación exacta puede ajustarse.

## 38.3 Salida posterior

El mismo modelo podrá alimentar seeds de PostgreSQL.

## 38.4 Ventaja

El dominio se valida antes de mezclar:

```text
DB design
NLP
UI migration
```

---

# 39. Build invariants del importer

El build debe verificar como mínimo:

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
RECYCLE_EDGE_COUNT = 2867
FIRST_RETURN_EDGES = 985
SECOND_RETURN_EDGES = 950
THIRD_RETURN_EDGES = 932
```

> **HISTORICAL BASELINE — SUPERSEDED:** v1.44 declaraba `ISLAND_COUNT = 32`,
> `STORY_BLUEPRINT_COUNT = 103` y `RECYCLE_EDGE_COUNT = 2955`.

Además:

```text
orphan senses = 0
orphan forms = 0
A2 boundary scheduled as A1 = 0
capstone first introductions = 0
backward recycle edges = 0
```

Si falla un invariant crítico:

```text
IMPORT FAIL
```

No degradación silenciosa.

---

# 40. Release manifest y hashes

Para que una ejecución sea reproducible, el importer debe registrar hashes de archivos.

Ejemplo:

```json
{
  "curriculumRelease": "A1-CURRICULUM-v1.51",
  "schemaVersion": "curriculum-registry/2.0.0",
  "sources": [
    {
      "path": "...normalization_master_v1.37.csv",
      "sha256": "..."
    }
  ]
}
```

Esto permite saber exactamente con qué currículo fue producida una Story o projection.

---

# 41. Vertical slice V1

El vertical slice del documento 0.1 ya fue demostrado técnicamente con datos prototípicos.

La siguiente prueba debe ser canónica.

## 41.1 Objetivo

```text
A1
↓
M01
↓
I01
↓
S1 / S2 / S3 canónicas
↓
targets reales v1.44
↓
LEX-A1 / SENSE-A1 / FORM-A1
↓
StoryOccurrence
↓
Word panel visual aprobado
↓
learner event
↓
persistencia
↓
recuperación de contexto anterior
```

## 41.2 Criterio

No se considera completado únicamente porque la Story se renderice.

Debe demostrar:

1. IDs curriculares reales;
2. annotations reales;
3. event history;
4. context retrieval;
5. separación UI/adapter/domain;
6. persistencia sustituible;
7. ningún A2 boundary usado como target A1;
8. soporte de al menos una unidad multiword;
9. build validators verdes.

---

# 42. Qué hacer con la Story actual

`La compra olvidada` se conserva como fixture técnico.

Es útil porque prueba:

- flexiones;
- repeated Lexemes;
- una MWU;
- `OccurrencePart[]`;
- panel;
- events.

No debe renombrarse artificialmente como:

```text
A1-M01-I01-S1
```

porque curricularmente no corresponde a la primera isla actual.

Se mueve o etiqueta posteriormente como:

```text
fixtures/
prototype/
```

cuando el nuevo Story Engine exista.

---

# 43. Qué hacer con los prototipos

Regla de migración:

```text
DO NOT DELETE FIRST
```

Proceso:

```text
1. implementar contrato canónico
2. crear tests
3. conectar un adapter
4. reproducir comportamiento existente
5. migrar vertical slice
6. eliminar prototype solo cuando quede sustituido
```

Evita una reescritura total con regresiones innecesarias.

---

# 44. Testing

## 44.1 Unit tests

Deben cubrir:

- importer;
- ID parsing;
- registry lookup;
- Sense ↔ Lexeme;
- Form ↔ Lexeme;
- lineage;
- recycle graph;
- event projections.

## 44.2 Contract tests

Deben asegurar que adapters y UI no dependen de internals.

## 44.3 Fixture tests

La Story prototípica actual puede continuar como fixture de tests.

## 44.4 Curriculum snapshot tests

La release A1 debe tener snapshot de conteos e IDs.

## 44.5 Story validation tests

Una Story no puede publicarse con:

- occurrence huérfana;
- Sense inexistente;
- Lexeme inexistente;
- target no autorizado;
- partes fuera del texto;
- occurrence parts solapadas de forma inválida;
- Story target fuera de la secuencia sin override editorial.

---

# 45. Seguridad y privacidad

Los learner events son datos de usuario.

La arquitectura debe permitir:

- borrar cuenta;
- borrar eventos;
- exportar progreso;
- separar datos curriculares de datos personales;
- evitar información personal innecesaria dentro de eventos;
- aplicar autorización por usuario en la DB.

Los CSV curriculares son contenido global.

No pertenecen a un usuario.

---

# 46. Autenticación

Auth.js sigue siendo candidato.

No es bloqueante para Motor Fase 1.

Primero puede utilizarse un:

```text
anonymous / development learner id
```

detrás de una interfaz de usuario.

Antes de producción deben existir:

- identidad persistente;
- sesiones;
- recuperación;
- autorización;
- privacidad.

---

# 47. Rendimiento

## 47.1 No parsear CSV en request

Obligatorio.

## 47.2 Índices futuros

PostgreSQL deberá considerar búsquedas por:

```text
lexemeId
senseId
form
storyId/version
userId + lexemeId
userId + senseId
occurredAt
```

## 47.3 Context retrieval

La recuperación de contextos anteriores debe poder resolverse mediante IDs e índices.

No escaneando todas las Stories del usuario en frontend.

---

# 48. Observabilidad

No es requisito completo del MVP, pero el dominio debe producir errores explícitos.

Ejemplos:

```text
CURRICULUM_IMPORT_INVALID
LEXEME_NOT_FOUND
SENSE_NOT_FOUND
STORY_OCCURRENCE_INVALID
RELEASE_MISMATCH
LINEAGE_RESOLUTION_FAILED
```

Nunca convertir silenciosamente un error de dominio en:

```text
undefined
```

sin contexto.

---

# 49. Autoría de contenido

La Story debe diferenciar:

```text
draft
validated
published
deprecated
```

Un authoring workflow futuro puede ser:

```text
author writes
→ Story Processor
→ validator
→ editor confirms
→ publish
```

La fuente concreta de authoring —TypeScript, JSON, MDX o herramienta editorial— sigue pendiente.

La V1 no fuerza todavía una elección.

---

# 50. Estado del curriculum frequency workstream

La frecuencia existe como enriquecimiento.

No bloquea el motor.

Regla:

```text
frequency can rank authorized targets
```

Nunca:

```text
frequency determines CEFR level
```

La arquitectura debe permitir actualizar frecuencia sin regenerar identidades curriculares.

---

# 51. Datos culturales y referencias

La presencia de:

- nombre propio;
- lugar;
- institución;
- referencia cultural;

en una Story no crea automáticamente un target lexical A1.

Se mantiene:

```text
CULTURAL_REFERENCE
!=
A1_LEXICAL_ASSERTION
```

El Story validator debe poder distinguir contenido contextual de target pedagógico.

---

# 52. DELE

Los task types DELE informan diseño de actividad.

No deciden nivel lexical.

```text
DELE_TASK_ATTESTATION
!=
LEXICAL_LEVEL_ASSERTION
```

La secuenciación actual tiene cobertura estructural para los 13 task types auditados.

---

# 53. Repositorio: estado vs destino

## 53.1 Ya existe

```text
Next app
routing
prototype StoryReader
prototype Lexical types
prototype learner events
localStorage persistence
visual baseline
feature boundaries
adapter boundary
canonical A1 data
```

## 53.2 Preparado pero vacío / scaffold

```text
features/curriculum/
features/lexical-engine/
features/story-engine/
features/learner-progress/
lib/adapters/
components/visual/screens/
```

## 53.3 No existe todavía

```text
canonical importer
canonical registries
canonical engine implementation
PostgreSQL
migrations
ORM/data layer
Auth
Python NLP service
dictionary importer
canonical Story Processor
real canonical A1 stories
```

---

# 54. Decisiones resueltas desde V0.1

Ya no están pendientes:

## 54.1 Forma / Lexeme / Sense

Separados.

## 54.2 MWU

Son first-class curriculum objects.

## 54.3 Occurrences discontinuas

Se soportan mediante `OccurrencePart[]`.

## 54.4 Historial vs estado

Event log y projection son capas distintas.

## 54.5 Split / merge

Debe preservar lineage e historial.

## 54.6 Nivel

Pertenece a SourceAssertion/Sense scope, no a la cadena cruda.

## 54.7 Secuenciación A1

Ya existe.

## 54.8 Separación visual/técnica

Ya existe como frontera del repositorio.

---

# 55. Decisiones todavía pendientes

## 55.1 ORM / acceso a PostgreSQL

Pendiente:

```text
Drizzle
Prisma
SQL tipado
otro
```

Debe decidirse después de formalizar `docs/data-model.md`.

## 55.2 PK física

Pendiente.

No afecta IDs canónicos.

## 55.3 Authoring format definitivo

Pendiente:

```text
TS
JSON
MDX
DB/editor
```

## 55.4 NLP exacto

spaCy sigue siendo candidato, no contrato irreversible.

## 55.5 Diccionario de producción

Kaikki/Wiktextract es candidato inicial, sujeto a licencia, calidad y pipeline.

## 55.6 Mastery algorithm

Pendiente y versionable.

---

# 56. Documentación que debe existir

La V1 redefine la secuencia documental.

## 56.1 `docs/architecture.md`

Este documento.

## 56.2 `docs/lexical-engine.md`

Debe formalizar:

- entidades;
- invariantes;
- APIs de dominio;
- lineage;
- MWUs;
- occurrence model;
- queries.

## 56.3 `docs/curriculum-import.md`

Debe formalizar:

- archivos de entrada;
- parsers;
- release manifest;
- validators;
- generated artifacts;
- failure modes.

## 56.4 `docs/story-engine.md`

Debe formalizar:

- Story;
- StoryVersion;
- Sentence;
- Token;
- Occurrence;
- target bindings;
- publication.

## 56.5 `docs/learner-events.md`

Debe formalizar:

- event schema;
- append-only rules;
- projections;
- versioning;
- migration.

## 56.6 `docs/data-model.md`

Después de los contratos anteriores:

- ERD;
- tablas;
- FKs;
- indexes;
- constraints;
- migration strategy.

---

# 57. Roadmap de implementación del motor

## MOTOR 1 — Curriculum Importer + Registry

Objetivo:

```text
CSV v1.37/v1.40/v1.44
→ validated canonical registry
```

Entregables:

- schemas;
- parser;
- validators;
- release manifest;
- generated registry;
- tests.

No PostgreSQL todavía como condición obligatoria.

## MOTOR 2 — Lexical Engine canónico

Migrar:

```text
PrototypeLexeme
PrototypeSense
PrototypeStoryOccurrence
```

a contratos canónicos.

Implementar:

- Lexeme registry;
- Form registry;
- Sense registry;
- MWU registry;
- SourceAssertion queries;
- lineage.

## MOTOR 3 — Story Engine

Implementar:

- StoryVersion;
- token/span model;
- `OccurrencePart[]`;
- target bindings;
- publication validator.

Migrar la Story fixture.

## MOTOR 4 — Learner Event Engine

Formalizar:

- event contracts;
- event repository;
- declared state;
- projections;
- context history.

Conservar localStorage como adapter inicial.

## MOTOR 5 — PostgreSQL

Crear:

- ERD;
- migrations;
- repositories;
- seeds/import;
- persistence de events.

## MOTOR 6 — NLP Assistance

Crear pipeline:

```text
text
→ candidates
→ canonical resolution suggestions
→ editorial review
```

## MOTOR 7 — Vertical slice curricular real

Construir:

```text
A1-M01-I01
S1/S2/S3
```

con IDs reales, baseline visual y persistencia.

---

# 58. Criterios de salida de MOTOR 1

Motor 1 se considera completo cuando:

1. los archivos canónicos se importan automáticamente;
2. los conteos esperados pasan;
3. no existen FKs huérfanas;
4. A2 boundary no aparece como A1 target;
5. los 985 targets resuelven;
6. los 2867 recycle edges resuelven *(HISTORICAL BASELINE: 2955 en v1.44)*;
7. puede consultarse un Lexeme por `LEX-A1-*`;
8. puede consultarse un Sense por `SENSE-A1-*`;
9. puede consultarse una Form por `FORM-A1-*`;
10. puede consultarse la primera Story blueprint de un target;
11. puede recuperarse su ruta de reciclaje;
12. se produce un release manifest reproducible;
13. tests fallan ante corrupción deliberada.

---

# 59. Criterios de salida del vertical slice canónico

El vertical slice V1 se considera validado cuando:

```text
curriculum data
→ canonical engine
→ Story
→ occurrence click
→ lexical panel
→ event
→ persistence
→ projection
→ previous context retrieval
```

funciona sin mocks del dominio.

La UI puede seguir usando componentes visuales en migración.

Pero los IDs y datos lingüísticos ya deben ser reales.

---

# 60. Prohibiciones arquitectónicas

No:

1. hardcodear 8 módulos directamente en varios componentes;
2. copiar CSV manualmente a arrays dispersos;
3. generar IDs nuevos desde el texto visible;
4. usar surface strings como primary identity;
5. resolver Sense únicamente por lema;
6. asumir que una occurrence siempre es contigua;
7. guardar solo estado actual y borrar eventos;
8. recalcular historia pasada contra contenido modificado sin storyVersion;
9. hacer que `components/visual/` consulte PostgreSQL;
10. hacer que NLP determine nivel;
11. convertir frecuencia en nivel;
12. convertir cognado en nivel;
13. convertir exposición en mastery;
14. borrar IDs antiguos después de split/merge;
15. reescribir el vertical slice completo antes de sustituirlo incrementalmente;
16. parsear los CSV canónicos en cada request.

---

# 61. Principios de migración

## 61.1 Incremental

```text
prototype
→ adapter
→ canonical implementation
→ tests
→ replacement
```

## 61.2 No big-bang rewrite

La existencia de un prototipo funcional es un activo.

Debe utilizarse como test de regresión.

## 61.3 Canonical data first

No migrar UI y DB simultáneamente antes de tener importer y registry.

## 61.4 Visual preservation

La migración técnica no autoriza rediseño.

---

# 62. Estado actual del proyecto V1

```text
[✓] Visión de producto
[✓] Restricción de costo cero
[✓] Repo Next.js funcional
[✓] Rama experimental separada de main
[✓] Navegación nivel → módulo → isla
[✓] StoryReader prototípico
[✓] Lexeme/Sense prototípicos
[✓] StoryOccurrence prototípico
[✓] OccurrencePart[] prototípico
[✓] MWU técnica en Story fixture
[✓] Learner event log prototípico
[✓] NEW / LEARNING / KNOWN
[✓] localStorage prototípico
[✓] Separación visual / técnica
[✓] Baseline visual canónico
[✓] Scaffolds features/
[✓] Adapter boundary
[✓] Currículo A1 canónico
[✓] Normalización A1
[✓] SourceAssertions
[✓] Modalidad receptiva/productiva
[✓] Secuenciación A1
[✓] 8 módulos / 11 islas          (v1.51; HISTORICAL: 32 islas en v1.44)
[✓] 32 story blueprints           (v1.51; HISTORICAL: 103 en v1.44)
[✓] 2867 recycle edges            (v1.51; HISTORICAL: 2955 en v1.44)
[✓] Curriculum audit final

[✓] Curriculum importer ejecutable   Fase 1 MIGRATED / PASS
[✓] Curriculum Registry canónico     A1-CURRICULUM-v1.51
[✓] Lexical Engine canónico          Fase 2 REVALIDATED / PASS
[ ] Story Engine canónico
[ ] StoryVersion
[ ] Token/span model canónico
[ ] Learner Event Engine canónico
[ ] Repository interfaces definitivas
[ ] PostgreSQL
[ ] ERD
[ ] migrations
[ ] ORM/data access
[ ] NLP pipeline
[ ] dictionary importer
[ ] Auth
[ ] React screens migradas completamente al baseline visual
[ ] Stories A1 canónicas publicadas
[ ] Vertical slice A1-M01-I01 canónico
```

---

# 63. Próximo paso autorizado

La prioridad inmediata es:

> **MOTOR 1 — Curriculum Importer + Canonical Registry**

No comenzar todavía por:

```text
NLP completo
mastery avanzado
Auth complejo
recomendador adaptativo
todo PostgreSQL
todo A1 narrativo
```

La primera implementación nueva debe demostrar:

```text
los datos curriculares publicados
pueden convertirse de forma determinista
en objetos de dominio válidos
y consultables por el motor.
```

---

# 64. Orden recomendado de las próximas tareas

```text
1. Crear docs/lexical-engine.md
2. Crear schemas TypeScript canónicos
3. Crear curriculum importer
4. Crear validators e invariants
5. Generar CurriculumRelease + registries
6. Crear query API del registry
7. Migrar lexical-prototype mediante adapter
8. Definir StoryVersion / token / occurrence contracts
9. Migrar Story fixture
10. Formalizar learner events
11. Diseñar data-model / ERD
12. Añadir PostgreSQL
13. Añadir NLP
14. Construir A1-M01-I01 real
```

---

# 65. Estado de este documento

Esta V1 reemplaza el documento 0.1 como referencia arquitectónica general.

El 0.1 se conserva como historial.

La V1 no sustituye:

```text
curriculum v1.44
source assertion ledgers
normalization ledger
sequencing ledgers
visual baseline
```

Cada uno continúa siendo autoridad dentro de su ámbito.

La arquitectura V1 define cómo esas autoridades se conectan en un sistema ejecutable.

---

# 66. Regla final

La plataforma debe poder evolucionar desde:

```text
currículo auditado
+
historias anotadas
+
eventos del estudiante
```

hacia:

```text
aprendizaje adaptativo
```

sin sacrificar:

```text
trazabilidad
versionado
corrección lingüística
separación de capas
reproducibilidad
historial del estudiante
```

El motor debe construirse sobre esas propiedades desde su primera versión canónica.
