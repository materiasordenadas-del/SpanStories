# Lexical Engine — Especificación de Dominio

**Proyecto:** Plataforma de Español por Historias e Islas de Conocimiento  
**Documento:** `docs/lexical-engine.md`  
**Versión:** 0.4  
**Estado:** Especificación conceptual endurecida — evolución de identidad léxica y preservación histórica resueltas  
**Fecha:** 2026-08-18  
**Fase:** Modelo de dominio — previo a PostgreSQL y TypeScript

---

> ## Estado de implementación
>
> Esta especificación conceptual está **implementada** en
> `features/lexical-engine/` (Fase 2 del motor) y **revalidada** contra el
> registry `A1-CURRICULUM-v1.51`.
>
> ```text
> LexiconRelease                     = A1-LEXICON-v1.0
> LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51
> Fase 2 = REVALIDATED / PASS
> ```
>
> Copia canónica de este documento: `docs/lexical-engine.md` en
> `materiasordenadas-del/SpanStories`, rama `prueba` — la ruta que el propio
> documento declara arriba. Las notas de implementación, con las decisiones y
> hallazgos de auditoría, están en `docs/lexical-engine-implementation.md`;
> este documento sigue siendo la autoridad del **modelo de dominio**.
>
> El documento no fija cifras de secuenciación, así que la reestructuración
> 103 → 32 no lo invalida en ningún punto: no creó, fusionó, dividió ni
> eliminó identidad léxica.

---

# Historial de versión

## v0.4 — 2026-08-18

Esta revisión resuelve cómo evolucionar identidades léxicas después de que existan historias, anotaciones y progreso de estudiantes.

Principios nuevos:

- un `Lexeme` publicado conserva para siempre su `lexeme_id`;
- `split` y `merge` nunca reescriben destructivamente el Lexeme histórico;
- se introduce `LexemeLineageEvent`;
- los Lexemes reemplazados pasan a `SUPERSEDED`, no se eliminan;
- el grafo de lineage debe ser acíclico;
- se introduce `LexiconRelease` para identificar la interpretación léxica activa;
- `StoryOccurrence` conserva identidad estable y su asignación léxica se versiona mediante `OccurrenceAnnotationRevision`;
- `LearnerEvent` permanece inmutable y conserva el Lexeme observado históricamente;
- se introduce una proyección `LearnerEventAttribution` para resolver a qué Lexeme activo contribuye hoy cada evento;
- después de un `split`, evidencia ambigua nunca se copia a todos los hijos;
- después de un `merge`, los eventos se reúnen en la nueva identidad sin duplicarlos;
- los estados del estudiante se reconstruyen desde eventos, nunca se migran copiando contadores;
- se distinguen merges de identidad equivalente y merges que cambian granularidad;
- las proyecciones conservan `lexicon_release` y `projection_algorithm_version`;
- un split/merge puede revertirse mediante nuevos eventos de lineage, nunca borrando historia.

## v0.3 — 2026-08-18

Esta revisión cierra tres contratos bloqueantes antes del ERD:

- identidad de `Lexeme` cuando existen homógrafos dentro del mismo POS;
- roles internos y anclaje textual de `OccurrencePart`;
- representación formal de verbos pronominales y usos de clíticos.

Decisiones nuevas:

- se introduce `TextAnchor` basado en offsets de caracteres;
- `OccurrencePart` referencia texto, no depende exclusivamente de tokens;
- los parts de una occurrence lexical se clasifican como `HEAD`, `FIXED` o `CLITIC`;
- las constructions usan `ANCHOR` y `SLOT`;
- se introduce `HomographGroup` para agrupar Lexemes homógrafos sin fusionarlos;
- polisemia y homonimia quedan separadas formalmente;
- `Pronominality` pasa a ser propiedad de identidad léxica;
- `IR` e `IRSE` pueden ser Lexemes diferentes;
- usos reflexivos/recíprocos productivos no crean por defecto un Lexeme pronominal;
- `se` pasivo e impersonal pertenecen a la capa construccional, no al Lexeme;
- se introduce una taxonomía mínima de `CliticFunction`;
- `vete`, `me voy`, `nos fuimos` pueden mapear al Lexeme `IRSE` sin tratar `se` como cadena fija.

## v0.2 — 2026-08-18

Esta revisión endurece el dominio antes de `data-model.md`.

Cambios principales:

- `OccurrencePart` pasa a ser obligatorio conceptualmente;
- las occurrences pueden ser discontinuas;
- se define política de solapamiento entre capas;
- `POS` queda fijado como propiedad obligatoria de `Lexeme`;
- se introduce `SenseResolutionStatus`;
- se prohíbe usar `UNRESOLVED` como evidencia del mismo sentido;
- se incorporan `SourceSnapshot` y `EditorialRevision`;
- `LearnerEvent` queda como fuente histórica de verdad;
- se incorporan `CurricularAssertion` y `EffectiveCurricularDecision`;
- `PedagogicalRole` publicado queda bajo autoridad editorial;
- se incorporan privacidad, minimización y retención de eventos;
- `se dio finalmente cuenta` pasa a ser caso canónico bloqueante.

---

# 0. Propósito de este documento

Este documento define el modelo conceptual del **Lexical Engine**.

No define todavía:

- tablas PostgreSQL;
- columnas;
- claves primarias;
- índices;
- migraciones;
- interfaces TypeScript;
- endpoints;
- ORM;
- implementación definitiva del pipeline NLP.

La intención es establecer primero:

1. qué entidades lingüísticas existen;
2. qué significa cada una;
3. qué relaciones conceptuales tienen;
4. qué responsabilidades pertenecen al Lexical Engine;
5. qué información pertenece al estudiante;
6. qué información pertenece al currículo;
7. qué debe resolverse automáticamente;
8. qué debe poder revisarse editorialmente;
9. qué invariantes no deben romperse.

Principio rector:

> **La base de datos debe implementar nuestro modelo lingüístico; nuestro modelo lingüístico no debe deformarse para parecerse a una base de datos.**

---

# 1. Definición del Lexical Engine

El Lexical Engine es el subsistema que conecta el contenido lingüístico de las historias con:

- análisis del texto;
- unidades léxicas;
- morfología;
- significado;
- traducciones;
- ejemplos;
- información curricular;
- contexto narrativo;
- historial del estudiante;
- conocimiento declarado;
- evidencia de aprendizaje;
- recuperación futura.

No es simplemente un diccionario.

No es simplemente un lematizador.

No es simplemente un sistema de flashcards.

No es simplemente un sistema de spaced repetition.

Su función conceptual es:

```text
TEXTO
  ↓
ANÁLISIS LINGÜÍSTICO
  ↓
UNIDAD LÉXICA
  ↓
SIGNIFICADO
  ↓
INFORMACIÓN PEDAGÓGICA
  ↓
INTERACCIÓN DEL ESTUDIANTE
  ↓
MEMORIA DEL APRENDIZAJE
```

Flujo principal:

```text
Story
  ↓
Sentence
  ↓
Token / Span
  ↓
StoryOccurrence
  ↓
Lexeme
  ↓
Sense
  ↓
Translation / Definition / Example
  ↓
LearnerEvent
  ↓
LearnerKnowledgeState
```

---

# 2. Responsabilidades del Lexical Engine

El Lexical Engine debe poder, progresivamente:

- identificar unidades lingüísticas presentes en una historia;
- segmentar el texto;
- relacionar formas flexionadas con su lema;
- reconocer expresiones de varias palabras;
- representar variantes;
- conservar información morfológica;
- diferenciar sentidos cuando sea necesario;
- recuperar traducciones adecuadas al sentido;
- recuperar definiciones;
- recuperar ejemplos propios y externos;
- encontrar apariciones anteriores de una unidad;
- registrar encuentros del estudiante;
- registrar autoevaluaciones;
- registrar resultados de ejercicios;
- reconstruir historial de aprendizaje;
- mantener un estado actual resumido;
- permitir estimar dominio posteriormente;
- vincular elementos lingüísticos con currículo;
- conservar procedencia y licencia de datos;
- permitir correcciones editoriales;
- diferenciar predicción automática de análisis confirmado.

---

# 3. Fuera del alcance del Lexical Engine

No pertenecen directamente a este subsistema:

- autenticación;
- pagos;
- suscripciones;
- renderizado general de islas;
- navegación global;
- gestión de cuentas;
- gamificación general;
- diseño visual;
- email;
- facturación;
- permisos administrativos generales;
- almacenamiento de archivos multimedia en general.

Puede integrarse con esos sistemas, pero no debe absorber sus responsabilidades.

---

# 4. Modelo por capas

El dominio se divide conceptualmente en seis capas.

```text
1. TEXT LAYER
2. MORPHOSYNTACTIC LAYER
3. LEXICAL LAYER
4. SEMANTIC LAYER
5. PEDAGOGICAL LAYER
6. LEARNER LAYER
```

Estas capas pueden superponerse en una misma oración, pero no deben confundirse.

---

# PARTE I — TEXT LAYER

# 5. Story

Una `Story` es una unidad narrativa publicada dentro de una isla.

El Lexical Engine no necesita definir toda la estructura editorial de una Story, pero debe poder referenciarla de manera estable.

Una Story puede contener:

- título;
- párrafos;
- oraciones;
- diálogo;
- narración;
- actividades;
- audio;
- imágenes;
- metadatos curriculares.

Para el Lexical Engine, la Story funciona principalmente como:

```text
context container
```

---

# 6. Sentence

Una `Sentence` representa una unidad textual contextual suficientemente estable para:

- mostrar ejemplos;
- guardar contexto;
- recuperar apariciones;
- realizar análisis lingüístico;
- ofrecer evidencia al estudiante.

Ejemplo:

```text
Ayer Marta comió arroz con su familia.
```

Debe mantenerse el texto original.

La segmentación automática podrá ser corregida editorialmente.

---

# 7. Token

## 7.1 Definición

> **Token:** unidad resultante de segmentar una instancia concreta de texto.

Ejemplo:

```text
"No me doy cuenta."
```

puede segmentarse como:

```text
Token 1 = No
Token 2 = me
Token 3 = doy
Token 4 = cuenta
Token 5 = .
```

## 7.2 Propiedades conceptuales

Un Token:

- pertenece a una instancia textual concreta;
- tiene una posición;
- conserva texto superficial;
- puede tener offsets;
- puede recibir análisis morfosintáctico;
- puede participar en una unidad mayor;
- no constituye necesariamente una unidad de aprendizaje.

## 7.3 Invariante

```text
Token ≠ Lexeme
```

---

# 8. Span

## 8.1 Definición

> **Span:** intervalo de uno o varios tokens identificado dentro del texto.

Ejemplo:

```text
No [me doy cuenta] del problema.
```

El span:

```text
me doy cuenta
```

puede asociarse con el lexema:

```text
darse cuenta
```

## 8.2 Razón de existir

Sin `Span`, una arquitectura basada únicamente en tokens no puede representar correctamente:

- locuciones;
- expresiones idiomáticas;
- conectores multiword;
- nombres propios multiword;
- colocaciones seleccionadas pedagógicamente;
- construcciones continuas.

## 8.3 Relación conceptual

```text
Token
Token
Token
  \ | /
   Span
    ↓
StoryOccurrence
    ↓
Lexeme
```

---

# 8A. `TextAnchor`

## 8A.1 Definición

> **`TextAnchor` es una referencia estable a un intervalo de caracteres dentro de una versión inmutable del texto.**

Conceptualmente:

```text
story_version
sentence
start_offset
end_offset
```

Los offsets deben permitir recuperar exactamente el fragmento superficial original.

Ejemplo:

```text
vete
0123
```

podemos distinguir conceptualmente:

```text
"ve" → HEAD
"te" → CLITIC
```

aunque ambos pertenezcan al mismo token ortográfico.

## 8A.2 Razón arquitectónica

`OccurrencePart` no puede depender exclusivamente de:

```text
token_id
```

porque el español permite clíticos:

```text
proclíticos
me voy

enclíticos
vete
decírmelo
dámelo
```

En los casos enclíticos, el verbo y uno o varios clíticos pueden compartir el mismo token ortográfico.

Por tanto:

```text
OccurrencePart
    ↓
TextAnchor
```

es la relación conceptual primaria.

Una relación opcional con tokens o palabras sintácticas podrá utilizarse para navegación y análisis, pero no será el único mecanismo de anclaje.

## 8A.3 Invariantes

```text
TextAnchor references immutable text version

TextAnchor uses half-open character intervals [start, end)

OccurrencePart → exactly one TextAnchor

TextAnchor may cover:
- a whole token
- several tokens
- part of one orthographic token
```

El texto publicado deberá versionarse; si cambia el texto, las anotaciones no se desplazan silenciosamente a la nueva versión.

---

# 9. Expresiones discontinuas y `OccurrencePart`

No todas las unidades relevantes aparecen como un tramo continuo.

Ejemplo:

```text
Me di inmediatamente cuenta del problema.
```

La expresión léxica es:

```text
darse cuenta
```

pero sus componentes no forman un único `Span` contiguo.

Por tanto, esta versión adopta como decisión arquitectónica:

> **Una `Occurrence` puede estar formada por una o más `OccurrencePart`, y esas partes no tienen que ser contiguas.**

Definiciones conceptuales:

```text
Span
= selección textual contigua

OccurrencePart
= una selección textual contigua que participa en una Occurrence

Occurrence
= interpretación lingüística compuesta por 1..N OccurrencePart
```

Ejemplo:

```text
Marta se dio finalmente cuenta del problema.
```

puede representarse como:

```text
LexicalOccurrence: DARSE_CUENTA

Part 1:
"se dio"

Part 2:
"cuenta"
```

El material intermedio:

```text
finalmente
```

pertenece a la oración, pero no a la unidad léxica `darse cuenta`.

Invariante:

```text
Occurrence ≠ necessarily one contiguous Span
```

Esta decisión es **bloqueante para `data-model.md`** y debe conservarse en el modelo relacional.

---


# 9A. Roles de `OccurrencePart`

Los roles dependen del tipo de occurrence.

## 9A.1 Roles para `LexicalOccurrence`

Taxonomía mínima:

```text
HEAD
FIXED
CLITIC
```

### `HEAD`

Componente que porta el núcleo léxico o la flexión principal cuando existe un núcleo identificable.

Ejemplos:

```text
comió
→ HEAD = "comió"

se dio cuenta
→ HEAD = "dio"

me voy
→ HEAD = "voy"
```

### `FIXED`

Componente lexicalizado necesario para identificar la unidad, pero que no funciona como clítico pronominal.

Ejemplos:

```text
darse cuenta
→ FIXED = "cuenta"

sin embargo
→ FIXED = "sin"
→ FIXED = "embargo"
```

Una expresión fija puede no tener `HEAD` si no existe un núcleo útil para nuestra representación.

### `CLITIC`

Pronombre átono seleccionado por una unidad léxica pronominal.

Ejemplos:

```text
me voy
→ CLITIC = "me"

se dio cuenta
→ CLITIC = "se"

vete
→ CLITIC = "te"
```

`CLITIC` no significa automáticamente reflexividad. Describe que ese fragmento es el componente clítico de la occurrence léxica; su función se especifica además mediante `CliticFunction`.

## 9A.2 Roles para `ConstructionOccurrence`

Las construcciones productivas usan una taxonomía diferente:

```text
ANCHOR
SLOT
```

### `ANCHOR`

Elemento lingüístico que activa o identifica la construcción.

### `SLOT`

Constituyente variable que realiza una posición de la construcción.

Ejemplo:

```text
Llevo tres años estudiando español.
```

para:

```text
LLEVAR + DURATION + GERUND
```

puede conceptualizarse como:

```text
"llevo"       → ANCHOR
"tres años"   → SLOT(name = DURATION)
"estudiando"  → SLOT(name = GERUND_PREDICATE)
```

## 9A.3 Material intermedio

Texto situado entre dos `OccurrencePart` pero que no pertenece a la unidad:

```text
se dio finalmente cuenta
       ^^^^^^^^^^^
```

no se convierte en `OccurrencePart`.

Puede calcularse como material dentro del envelope textual de la occurrence, pero no es miembro de la unidad.

## 9A.4 Orden y solapamiento interno

Dentro de una misma occurrence:

```text
- debe existir al menos un OccurrencePart;
- los parts se ordenan por posición superficial;
- dos parts de la misma occurrence no deben solaparse;
- pueden existir gaps entre parts;
- dos occurrences diferentes sí pueden superponerse según la política de capas.
```

## 9A.5 Invariante pedagógica

Para una `LexicalOccurrence`:

```text
morphological component ≠ automatically learner-facing lexical component
```

Los roles de `OccurrencePart` describen la composición de la occurrence reconocida, no crean encounters adicionales por sí mismos.

---

# PARTE II — MORPHOSYNTACTIC LAYER

# 10. Propósito de la capa morfosintáctica

Esta capa responde preguntas como:

- ¿cuál es el lema probable?
- ¿qué categoría gramatical tiene la forma?
- ¿qué persona expresa?
- ¿qué número?
- ¿qué modo?
- ¿qué forma verbal?
- ¿qué rasgos morfológicos tiene?
- ¿qué tiempo verbal representa en español?
- ¿forma parte de una perífrasis o tiempo compuesto?

Debe distinguirse entre:

1. **rasgos normalizados para interoperabilidad NLP**;
2. **análisis pedagógico específico del español**.

---

# 11. Ejemplo corregido: `llevó`

Oración:

```text
María llevó las maletas al coche.
```

## 11.1 Análisis léxico-morfológico básico

```text
surface = llevó
lemma = llevar
POS = VERB
VerbForm = Finite
Mood = Indicative
Person = 3
Number = Singular
```

## 11.2 Tiempo verbal pedagógico español

```text
SpanishVerbTense = PRETERITO_PERFECTO_SIMPLE
TraditionalAlias = PRETERITO_INDEFINIDO
```

Representación humana:

```text
pretérito perfecto simple de indicativo
```

También conocido en parte de la tradición didáctica como:

```text
pretérito indefinido
```

## 11.3 Rasgo técnico interoperable

Un sistema NLP basado en Universal Dependencies puede expresar además:

```text
Tense = Past
```

Pero:

> **`Tense=Past` no es suficientemente preciso como representación pedagógica del sistema verbal español.**

Por tanto:

```text
UD / NLP feature
Tense = Past
```

y:

```text
Spanish pedagogical tense
PRETERITO_PERFECTO_SIMPLE
```

son capas diferentes.

---

# 12. Diferenciación obligatoria de tiempos pasados

El sistema debe distinguir, como mínimo, los tiempos verbales relevantes para la enseñanza del español.

Ejemplos:

```text
llevó
→ pretérito perfecto simple / indefinido

llevaba
→ pretérito imperfecto

ha llevado
→ pretérito perfecto compuesto

había llevado
→ pretérito pluscuamperfecto
```

Estas formas no deben reducirse pedagógicamente a:

```text
past
```

---

# 13. Tiempo simple vs tiempo compuesto

Una forma simple puede analizarse sobre un único token:

```text
llevó
```

Pero:

```text
ha llevado
```

incluye al menos:

```text
ha
llevado
```

El tiempo verbal pedagógico:

```text
PRETERITO_PERFECTO_COMPUESTO
```

pertenece a la construcción verbal completa, no únicamente a `llevado`.

Esto implica que necesitaremos distinguir:

```text
TokenMorphology
```

de:

```text
VerbPhraseAnalysis / ConstructionAnalysis
```

conceptualmente.

---

# 14. Ejemplos de análisis verbal

## 14.1 `llevó`

```text
surface = llevó
lemma = llevar
POS = VERB
VerbForm = FINITE
Mood = INDICATIVE
Person = 3
Number = SINGULAR

normalized_nlp_tense = PAST
spanish_verb_tense = PRETERITO_PERFECTO_SIMPLE
```

## 14.2 `llevaba`

```text
surface = llevaba
lemma = llevar
POS = VERB
VerbForm = FINITE
Mood = INDICATIVE
Person = 1 | 3
Number = SINGULAR

spanish_verb_tense = PRETERITO_IMPERFECTO
```

La forma aislada `llevaba` puede ser:

```text
yo llevaba
él llevaba
ella llevaba
usted llevaba
```

El contexto sintáctico puede resolver la persona.

Esto demuestra:

> el análisis morfológico de una forma puede mantener ambigüedad.

## 14.3 `ha llevado`

Tokens:

```text
ha
llevado
```

Análisis de la construcción:

```text
lemma = llevar
Mood = INDICATIVE
Person = 3
Number = SINGULAR

spanish_verb_tense = PRETERITO_PERFECTO_COMPUESTO
```

El auxiliar porta gran parte de la flexión:

```text
ha
→ haber
→ present indicative
→ third person singular
```

El participio:

```text
llevado
→ llevar
→ participle
```

## 14.4 `había llevado`

```text
spanish_verb_tense = PRETERITO_PLUSCUAMPERFECTO
Mood = INDICATIVE
```

---

# 15. Taxonomía inicial de tiempos verbales españoles

Esta lista es conceptual y deberá revisarse con el currículo.

## Indicativo

```text
PRESENTE
PRETERITO_PERFECTO_SIMPLE
PRETERITO_IMPERFECTO
PRETERITO_PERFECTO_COMPUESTO
PRETERITO_PLUSCUAMPERFECTO
PRETERITO_ANTERIOR
FUTURO_SIMPLE
FUTURO_COMPUESTO
CONDICIONAL_SIMPLE
CONDICIONAL_COMPUESTO
```

## Subjuntivo

```text
PRESENTE_SUBJUNTIVO
PRETERITO_PERFECTO_SUBJUNTIVO
PRETERITO_IMPERFECTO_SUBJUNTIVO
PRETERITO_PLUSCUAMPERFECTO_SUBJUNTIVO
```

## Formas no personales

```text
INFINITIVO
INFINITIVO_COMPUESTO
GERUNDIO
GERUNDIO_COMPUESTO
PARTICIPIO
```

La lista final deberá considerar:

- nomenclatura RAE/ASALE;
- terminología habitual en enseñanza ELE;
- correspondencia PCIC;
- alias didácticos.

---

# 16. Alias terminológicos

El sistema podrá conservar nombres canónicos y alias.

Ejemplo:

```text
canonical:
PRETERITO_PERFECTO_SIMPLE

aliases:
- pretérito indefinido
- indefinido
```

La interfaz podrá usar una denominación adaptada al nivel del estudiante sin alterar la identidad interna.

---

# 17. Rasgos morfológicos normalizados

Cuando sea posible, se reutilizará vocabulario interoperable inspirado en Universal Dependencies para:

```text
POS
VerbForm
Mood
Person
Number
Gender
Case
Degree
PronType
Poss
Reflex
Polarity
etc.
```

No obstante, el modelo interno podrá añadir conceptos específicos de enseñanza de español que UD no represente con el nivel de detalle pedagógico necesario.

---

# 18. Predicción vs análisis editorial

Una anotación automática es una hipótesis.

Conceptualmente deberá poder distinguirse:

```text
predicted_analysis
```

de:

```text
editorial_analysis
```

o estados equivalentes.

Ejemplo:

```text
AUTO
REVIEWED
CONFIRMED
AMBIGUOUS
```

El Lexical Engine nunca debe asumir:

```text
output del NLP = verdad lingüística definitiva
```

---

# PARTE III — LEXICAL LAYER

# 19. Lexeme

## 19.1 Definición

> **Lexeme:** unidad abstracta del léxico que agrupa formas lingüísticas relacionadas y que puede expresar uno o más sentidos.

Ejemplos:

```text
COMER
VIVIR
CASA
ROJO
AUNQUE
DARSE CUENTA
POR SUPUESTO
```

## 19.2 Un Lexeme no es texto superficial

Estas formas:

```text
como
comes
come
comemos
comieron
comí
comiendo
comido
```

pueden relacionarse con:

```text
COMER
```

Por tanto:

```text
surface form ≠ Lexeme
```

---

# 20. Propiedades conceptuales de Lexeme

Un Lexeme tendrá conceptualmente información equivalente a:

```text
language
canonical_form
part_of_speech
lexical_type
```

Posibles tipos:

```text
SINGLE_WORD
MULTIWORD
DISCOURSE_MARKER
FIXED_EXPRESSION
IDIOM
```

La taxonomía exacta queda pendiente.

---

# 21. Identidad de `Lexeme`

Una cadena ortográfica no identifica necesariamente un único Lexeme.

Ejemplo:

```text
bajo
```

puede funcionar como:

```text
adjetivo
preposición
sustantivo
forma verbal de bajar
```

Por tanto:

```text
surface string ≠ Lexeme identity
```

## 21.1 POS como discriminador obligatorio

> **`part_of_speech` es una propiedad obligatoria de `Lexeme`, y un cambio de categoría gramatical implica por defecto un Lexeme diferente.**

Ejemplo:

```text
BAJO_1
canonical_form = bajo
POS = ADJ

BAJO_2
canonical_form = bajo
POS = ADP

BAJO_3
canonical_form = bajo
POS = NOUN
```

## 21.2 El problema restante: homógrafos dentro del mismo POS

Incluso:

```text
language
+
canonical_form
+
POS
```

no garantiza identidad única.

Ejemplo conceptual:

```text
CURA_A
canonical_form = cura
POS = NOUN
inherent_gender = MASCULINE
meaning = sacerdote

CURA_B
canonical_form = cura
POS = NOUN
inherent_gender = FEMININE
meaning = curación
```

Estos deben poder existir como Lexemes diferentes aunque compartan forma canónica y POS.

## 21.3 `HomographGroup`

Se introduce:

```text
HomographGroup
```

como agrupación de búsqueda y desambiguación, no como unidad de aprendizaje.

Puede agrupar Lexemes que comparten aproximadamente:

```text
language
canonical_form
POS
```

pero que no deben fusionarse.

Ejemplo:

```text
HomographGroup: ES:cura:NOUN

├── Lexeme CURA_SACERDOTE
└── Lexeme CURA_CURACION
```

El estudiante aprende Lexemes/Senses; el `HomographGroup` sirve para:

- resolver análisis;
- presentar opciones editoriales;
- importar diccionarios;
- agrupar homógrafos;
- evitar que una cadena sea usada como identidad.

## 21.4 Polisemia vs homonimia

Regla operativa:

### Mantener **un Lexeme con varios Sense** cuando:

- los significados pertenecen razonablemente a una misma unidad léxica sincrónica;
- comparten comportamiento morfosintáctico esencial;
- comparten paradigma;
- la diferencia puede expresarse pedagógicamente como polisemia;
- las fuentes lexicográficas fiables los tratan predominantemente como sentidos de una misma entrada.

Ejemplo:

```text
BANCO
├── Sense: institución financiera
└── Sense: asiento
```

Este ejemplo podrá revisarse editorialmente si la política lexicográfica elegida exige separarlo; lo importante es que el sistema soporte ambas decisiones sin depender de la cadena.

### Crear **Lexemes diferentes** dentro del mismo POS cuando exista evidencia suficiente de identidad léxica distinta, por ejemplo:

- comportamiento gramatical lexicalizado diferente;
- género inherente diferente con significado distinto;
- paradigma o restricciones morfológicas diferentes;
- pronominalidad lexicalizada diferente;
- homonimia reconocida por fuentes lexicográficas;
- significados sin relación sincrónica útil y tratados como entradas distintas.

## 21.5 La etimología es evidencia, no identidad

No utilizaremos:

```text
different etymology → automatically different Lexeme
```

ni:

```text
same etymology → automatically same Lexeme
```

La plataforma enseña español sincrónico.

La etimología puede ayudar a decidir homonimia, pero no controla sola el modelo pedagógico.

## 21.6 Propiedades de identidad

La identidad lingüística podrá utilizar conceptualmente:

```text
language
canonical_form
part_of_speech
lexical_type
pronominality
inherent_grammatical_features
editorial homonym decision
```

Los rasgos inherentes pueden incluir, cuando sean lexicalmente discriminativos:

```text
grammatical gender
inflection class
other lexicalized grammatical restrictions
```

## 21.7 Identificador físico

> **La firma lingüística nunca será la primary key física.**

Cada Lexeme tendrá un identificador opaco y estable:

```text
lexeme_id
```

Esto permite:

- corregir análisis;
- dividir un Lexeme;
- fusionar Lexemes;
- conservar referencias históricas;
- migrar occurrences;
- cambiar criterios editoriales.

## 21.8 Estado de identidad

Durante importación automática puede ser útil distinguir:

```text
PROVISIONAL
CONFIRMED
```

Una identidad `PROVISIONAL` puede ser utilizada durante ingestión, pero las unidades que vayan a afectar progreso pedagógico deberían pasar por las reglas editoriales correspondientes.

## 21.9 Relaciones entre Lexemes

Se prepara el dominio para relaciones como:

```text
HOMOGRAPH_OF
PRONOMINAL_COUNTERPART_OF
VARIANT_OF
DERIVED_FROM
```

No todas serán necesarias en el MVP.

## 21.10 Invariantes

```text
POS is mandatory for Lexeme

POS change
→ different Lexeme by default

same canonical form + same POS
≠ guaranteed same Lexeme

HomographGroup
≠ learner knowledge unit

polysemy
→ preferably Sense distinction inside one Lexeme

homonymy
→ separate Lexemes

linguistic signature
≠ physical database identity
```

---

# 22. LexemeForm

## 22.1 Definición

> **LexemeForm:** una realización formal posible de un Lexeme.

Ejemplo:

```text
Lexeme: COMER

Forms:
comer
como
comes
come
comemos
coméis
comen
comí
comiste
comió
comimos
comisteis
comieron
comía
comías
...
comiendo
comido
```

---

# 23. Tipos conceptuales de forma

Puede ser necesario distinguir:

```text
CANONICAL
INFLECTED
ORTHOGRAPHIC_VARIANT
REGIONAL_VARIANT
ALTERNATIVE_SPELLING
```

Aún no se decide si será un enum, tablas o metadata.

---

# 24. Prealmacenamiento de formas

Todavía no se decide si todas las formas flexionadas españolas estarán:

```text
precomputed
```

o serán:

```text
generated / analyzed on demand during content preprocessing
```

Ambos enfoques tienen ventajas y deberán evaluarse al diseñar PostgreSQL.

---

# PARTE IV — SEMANTIC LAYER

# 25. Sense

## 25.1 Definición

> **Sense:** significado o uso semánticamente distinguible de un Lexeme.

Ejemplo:

```text
BANCO
│
├── Sense A
│   institución financiera
│
└── Sense B
    asiento
```

## 25.2 Invariante

```text
Lexeme ≠ Sense
```

---

# 26. Sense vs Translation

Una traducción no define por sí sola un sentido.

Ejemplo:

```text
llevar
```

puede traducirse según el contexto como:

```text
to carry
to take
to wear
to bring
to have been doing
```

Por tanto:

```text
Sense ≠ Translation
```

La relación conceptual correcta será:

```text
Lexeme
   ↓
Sense
   ↓
Translation
```

---

# 27. Granularidad de sentidos

Un diccionario exhaustivo puede dividir un verbo frecuente en numerosos sentidos y subsentidos.

Ese nivel de granularidad no necesariamente es apropiado para un estudiante.

Principio propuesto:

> **Los sentidos internos deben ser lingüísticamente defendibles y pedagógicamente útiles, sin necesidad de reproducir cada microdistinción de un diccionario académico.**

La granularidad deberá probarse con vocabulario polisémico de alta frecuencia.

---

# 28. Ejemplo: `llevar`

Posibles sentidos pedagógicos:

```text
LLEVAR

1. transportar algo
   → carry / take

2. vestir algo
   → wear

3. conducir o acompañar hacia un lugar
   → take

4. duración acumulada
   → have been ... for

5. mantener cierta situación
   → lead / manage / keep
```

No se considera todavía una clasificación definitiva.

---

# 29. Translation

## 29.1 Definición

> **Translation:** equivalencia útil en otra lengua vinculada preferentemente a un Sense.

Ejemplo:

```text
Lexeme:
BANCO

Sense:
ASIENTO

Translation:
bench
```

Una traducción puede tener:

```text
target_language
text
register
region
notes
source
```

conceptualmente.

---

# 30. Definition / Gloss

Debe distinguirse entre:

```text
Translation
```

y:

```text
Definition
```

Ejemplo:

```text
Lexeme:
llevar

Sense:
transportar

English translation:
to carry

Spanish learner definition:
transportar algo de un lugar a otro
```

En niveles superiores podremos priorizar definiciones monolingües.

---

# PARTE V — MULTIWORD EXPRESSIONS

# 31. Principio

El sistema no puede asumir:

```text
lexical unit = one orthographic word
```

Debe poder representar:

```text
por supuesto
darse cuenta
tener ganas de
a pesar de
sin embargo
cada vez que
```

---

# 32. Multiword Lexeme

Hipótesis inicial:

> Una expresión multiword puede ser un `Lexeme` con un tipo diferente, en lugar de exigir una entidad separada.

Ejemplo:

```text
Lexeme
canonical_form = darse cuenta
lexical_type = MULTIWORD
```

Esto permitiría que:

```text
COMER
```

y:

```text
DARSE CUENTA
```

participen en muchas de las mismas relaciones:

```text
Sense
Translation
Example
StoryOccurrence
LearnerState
```

---

# 33. Variación interna de expresiones

Ejemplo:

```text
darse cuenta
```

puede aparecer como:

```text
me doy cuenta
te das cuenta
se dio cuenta
nos dimos cuenta
se había dado cuenta
```

Por tanto, una expresión multiword no puede almacenarse únicamente como búsqueda exacta de texto.

Necesita una representación lingüística.

---

# 34. Expresiones discontinuas

Ejemplo:

```text
Se dio finalmente cuenta del problema.
```

Podemos identificar:

```text
se dio ... cuenta
```

como realización de:

```text
darse cuenta
```

La arquitectura deberá admitir ocurrencias discontinuas en una fase posterior.

---

# 35. Construcciones gramaticales

No toda secuencia frecuente es un Lexeme.

Ejemplos:

```text
ir a + infinitivo
tener que + infinitivo
acabar de + infinitivo
llevar + gerundio
seguir + gerundio
```

Estas estructuras son productivas.

Se propone mantener conceptual separación:

```text
Lexeme
```

vs:

```text
Construction / GrammarPattern
```

---

# 36. Superposición entre Lexeme y Construction

Una oración puede contener simultáneamente información léxica y construccional.

Ejemplo:

```text
Llevo tres años estudiando español.
```

Puede contener:

```text
Lexeme:
LLEVAR
```

y:

```text
Construction:
LLEVAR + DURATION + GERUND
```

No son mutuamente excluyentes.

---

# PARTE V-A — VERBOS PRONOMINALES Y CLÍTICOS

# 36A. Principio

El español utiliza pronombres átonos en fenómenos lingüísticamente diferentes.

No debemos tratar todas las apariciones de:

```text
me
te
se
nos
os
```

como si fueran equivalentes.

La arquitectura distingue:

```text
pronominalidad lexicalizada
```

de:

```text
reflexividad productiva
reciprocidad
voz media / anticausatividad
pasiva con se
impersonal con se
se como alomorfo de le/les
```

---

# 36B. `Pronominality` como propiedad de `Lexeme`

No se crea una clase distinta `PronominalVerb`.

Un verbo pronominal sigue siendo:

```text
Lexeme
```

pero su identidad contiene una propiedad conceptual:

```text
Pronominality
```

Taxonomía inicial:

```text
NONE
OBLIGATORY
LEXICALIZED_ALTERNANT
```

## `NONE`

El Lexeme no selecciona un clítico pronominal como parte de su identidad.

Ejemplo:

```text
LAVAR
```

en:

```text
María lava el coche.
```

## `OBLIGATORY`

El Lexeme requiere el clítico concordante en su paradigma normal.

Ejemplos:

```text
ARREPENTIRSE
QUEJARSE
```

La forma canónica se representa con `-se`:

```text
arrepentirse
quejarse
```

## `LEXICALIZED_ALTERNANT`

Existe un Lexeme no pronominal relacionado, pero el uso pronominal tiene suficiente identidad lexical, semántica o construccional para ser tratado como unidad independiente.

Ejemplos candidatos:

```text
IR ↔ IRSE
DORMIR ↔ DORMIRSE
HACER ↔ HACERSE
```

Se relacionan mediante:

```text
PRONOMINAL_COUNTERPART_OF
```

La separación concreta de cada verbo se decidirá editorialmente con apoyo lexicográfico.

---

# 36C. Regla para crear un Lexeme pronominal separado

Se crea un Lexeme pronominal diferente cuando el clítico es **lexicalmente seleccionado** y se cumple al menos una condición relevante:

- el verbo es exclusivamente pronominal;
- el uso pronominal introduce un significado convencionalizado;
- modifica de manera estable el marco argumental;
- modifica restricciones de régimen;
- una fuente lexicográfica fiable lo trata como uso/entrada pronominal diferenciada;
- resulta pedagógicamente necesario enseñar la unidad con el pronombre.

Ejemplo:

```text
IR
```

y:

```text
IRSE
```

pueden ser Lexemes distintos.

Canonical forms:

```text
ir
irse
```

No modelaremos `IRSE` como:

```text
IR + Sense + arbitrary "se"
```

si la unidad pronominal ha sido declarada lexicalmente independiente.

---

# 36D. Reflexividad y reciprocidad productivas

No todo:

```text
VERB + reflexive clitic
```

crea un nuevo Lexeme.

Ejemplo:

```text
Ana se lava.
```

puede analizarse como:

```text
Lexeme = LAVAR

CliticFunction = REFLEXIVE

ConstructionOccurrence = REFLEXIVE
```

Por defecto no requiere:

```text
Lexeme = LAVARSE
```

si el significado es composicional:

```text
lavar a alguien
→ lavarse a sí mismo
```

Lo mismo aplica conceptualmente a usos recíprocos:

```text
Ana y Luis se miran.
```

```text
Lexeme = MIRAR
CliticFunction = RECIPROCAL
```

La política evita crear miles de Lexemes redundantes para operaciones sintácticas productivas.

---

# 36E. `CliticFunction`

Cada clítico relevante podrá recibir una clasificación contextual.

Taxonomía mínima:

```text
LEXICAL_PRONOMINAL
REFLEXIVE
RECIPROCAL
MIDDLE_ANTICAUSATIVE
PASSIVE_SE
IMPERSONAL_SE
INDIRECT_OBJECT_SE
OTHER
```

## `LEXICAL_PRONOMINAL`

El clítico forma parte de la realización de un Lexeme pronominal.

```text
me voy
→ Lexeme = IRSE
→ me = LEXICAL_PRONOMINAL
```

## `REFLEXIVE`

El clítico realiza una relación reflexiva composicional.

```text
me lavo
→ Lexeme = LAVAR
```

## `RECIPROCAL`

```text
se abrazaron
→ Lexeme = ABRAZAR
```

con lectura recíproca.

## `MIDDLE_ANTICAUSATIVE`

Ejemplo:

```text
La puerta se abrió.
```

Por defecto se analiza mediante:

```text
Lexeme = ABRIR
ConstructionOccurrence = MIDDLE_ANTICAUSATIVE
```

a menos que exista una decisión lexical específica.

## `PASSIVE_SE`

Ejemplo:

```text
Se venden libros.
```

`se` no forma parte de un Lexeme `VENDERSE` en este análisis.

## `IMPERSONAL_SE`

Ejemplo:

```text
Aquí se vive bien.
```

No crea el Lexeme `VIVIRSE`.

## `INDIRECT_OBJECT_SE`

Ejemplo:

```text
Se lo di.
```

Aquí `se` funciona como la forma usada ante otro pronombre átono en lugar de `le/les`; no es parte del Lexeme `DAR`.

---

# 36F. Paradigma pronominal

Un Lexeme pronominal no contiene literalmente el string fijo:

```text
se
```

en todas sus ocurrencias.

La forma canónica utiliza `-se` por convención:

```text
irse
```

pero las ocurrencias seleccionan el clítico que concuerda con persona y número:

```text
me voy
te vas
se va
nos vamos
os vais
se van
```

Por tanto:

```text
canonical "-se"
≠ fixed surface token "se"
```

La identidad es:

```text
IRSE
```

y el clítico superficial depende de la flexión.

---

# 36G. Proclisis y enclisis

El mismo Lexeme pronominal puede aparecer con el clítico antes o después del verbo.

Ejemplos:

```text
me voy
```

y:

```text
vete
```

Por tanto, la relación entre `LexicalOccurrence` y texto se expresa mediante `OccurrencePart`.

## `me voy`

```text
LexicalOccurrence = IRSE

Part:
"me"
role = CLITIC
CliticFunction = LEXICAL_PRONOMINAL

Part:
"voy"
role = HEAD
```

## `vete`

Aunque `vete` puede ser un único token ortográfico:

```text
LexicalOccurrence = IRSE

Part:
"ve"
role = HEAD

Part:
"te"
role = CLITIC
CliticFunction = LEXICAL_PRONOMINAL
```

Ambos parts pueden apuntar a rangos de caracteres diferentes dentro del mismo token gracias a `TextAnchor`.

---

# 36H. Multiword pronominal lexicalizado

Ejemplo:

```text
darse cuenta
```

Canonical Lexeme:

```text
DARSE_CUENTA
Pronominality = OBLIGATORY
lexical_type = MULTIWORD
```

Occurrence:

```text
Marta se dio finalmente cuenta.
```

Parts:

```text
"se"
→ CLITIC
→ CliticFunction = LEXICAL_PRONOMINAL

"dio"
→ HEAD

"cuenta"
→ FIXED
```

El adverbio:

```text
finalmente
```

no pertenece a la occurrence.

---

# 36I. Relación con morfología

En:

```text
se dio cuenta
```

la capa morfosintáctica todavía puede analizar:

```text
dio
→ lemma DAR
```

pero la capa léxica learner-facing selecciona:

```text
DARSE_CUENTA
```

No se genera automáticamente un encounter con `DAR`.

Esto conserva simultáneamente:

- análisis morfológico correcto;
- identidad léxica correcta;
- conteo pedagógico correcto.

---

# 36J. Decisión editorial en alternancias difíciles

Algunos verbos admiten forma pronominal y no pronominal con diferencias graduales:

```text
quedar / quedarse
dormir / dormirse
ir / irse
salir / salirse
morir / morirse
```

No se intentará resolver todos mediante una regla puramente automática.

El pipeline podrá proponer análisis, pero la identidad lexical se rige por:

```text
Pronominality
+
Sense
+
grammatical behavior
+
lexicographic evidence
+
editorial policy
```

Lo importante arquitectónicamente es que el modelo ya puede representar las dos opciones sin rediseño.

---

# 36K. Invariantes de pronominalidad

```text
canonical -se
≠ literal fixed "se" in every occurrence

lexical pronominal clitic
≠ reflexive clitic by default

reflexive use
≠ new Lexeme by default

reciprocal use
≠ new Lexeme by default

passive se
≠ pronominal Lexeme

impersonal se
≠ pronominal Lexeme

lexicalized pronominal alternant
→ may be separate Lexeme

pronominal Lexeme
→ realized through HEAD + CLITIC parts when applicable
```

---

# PARTE VI — STORY OCCURRENCES

# 37. StoryOccurrence

## 37.1 Definición

> **StoryOccurrence:** instancia concreta, contextualizada y pedagógicamente reconocida de una unidad lingüística dentro de una Story.

Ejemplo:

```text
María llevó las maletas al coche.
```

Puede producir conceptualmente:

```text
StoryOccurrence

surface = "llevó"
story = Story 17
sentence = Sentence 4

lexeme = LLEVAR
sense = TRANSPORTAR
```

---

# 38. Token vs StoryOccurrence

No son equivalentes.

Ejemplo:

```text
María se dio cuenta.
```

Tokens:

```text
María
se
dio
cuenta
.
```

StoryOccurrence posible:

```text
surface = "se dio cuenta"
lexeme = DARSE_CUENTA
```

Por tanto:

```text
Token
→ segmentación textual

StoryOccurrence
→ interpretación lingüística contextual
```

---

# 39. StoryOccurrence y Lexeme

Una ocurrencia revisada debería poder apuntar a un Lexeme.

Ejemplo:

```text
surface = comió
lexeme = COMER
```

El texto superficial debe conservarse aunque el Lexeme sea abstracto.

---

# 40. StoryOccurrence y Sense

Cuando sea posible:

```text
StoryOccurrence
   ↓
Lexeme
   ↓
Sense
```

Ejemplo 1:

```text
Me senté en el banco.
```

```text
lexeme = BANCO
sense = ASIENTO
```

Ejemplo 2:

```text
Fui al banco a sacar dinero.
```

```text
lexeme = BANCO
sense = INSTITUCION_FINANCIERA
```

---

# 41. Política de resolución de `Sense`

`Sense` no debe tratarse simplemente como un campo opcional sin semántica.

Esta versión introduce:

```text
SenseResolutionStatus

NOT_REQUIRED
UNRESOLVED
RESOLVED
```

## 41.1 `NOT_REQUIRED`

Se utiliza cuando, para el objetivo pedagógico actual, no existe una distinción semántica relevante que deba resolverse.

## 41.2 `UNRESOLVED`

Se utiliza cuando el Lexeme puede presentar ambigüedad o polisemia relevante, pero la occurrence todavía no ha sido asignada a un sentido concreto.

## 41.3 `RESOLVED`

La occurrence ha sido vinculada a un `Sense` suficientemente específico para recuperación pedagógica.

## 41.4 Regla de recuperación

> **Una occurrence `UNRESOLVED` nunca puede presentarse como ejemplo confirmado de “este mismo significado”.**

Ejemplo:

```text
Current:
banco
sense = FINANCIAL_INSTITUTION
status = RESOLVED
```

Puede recuperar como mismo sentido:

```text
Fui al banco a sacar dinero.
```

Pero:

```text
Nos sentamos en un banco.
```

debe aparecer como otro uso, no como ejemplo equivalente.

Una occurrence histórica:

```text
banco
status = UNRESOLVED
```

no debe mezclarse silenciosamente con ninguno de los sentidos.

## 41.5 Criterio de obligatoriedad

No se usará un umbral arbitrario por frecuencia.

La resolución será obligatoria cuando exista **riesgo de ambigüedad pedagógica**, por ejemplo:

- polisemia frecuente;
- homografía;
- sentidos curriculares distintos;
- traducciones inglesas incompatibles;
- construcciones que alteran significado;
- recuperación contextual dependiente del sentido.

Así preservamos velocidad editorial sin degradar silenciosamente la función pedagógica.

---

# 42. Estado del análisis

Cada ocurrencia podrá tener un estado equivalente a:

```text
AUTO
REVIEWED
CONFIRMED
AMBIGUOUS
```

y eventualmente:

```text
confidence
```

La semántica exacta se definirá posteriormente.

# 42A. Política de solapamiento entre anotaciones

Una misma región textual puede participar simultáneamente en distintas capas lingüísticas.

Ejemplo:

```text
Marta se dio cuenta.
```

Puede existir:

```text
MorphologicalAnalysis
dio → DAR
```

y simultáneamente:

```text
LexicalOccurrence
se dio cuenta → DARSE_CUENTA
```

Esto **no** implica que el estudiante haya encontrado pedagógicamente el Lexeme `DAR`.

## 42A.1 Regla

```text
Morphological annotations may overlap freely.

Construction annotations may overlap lexical annotations.

A component of a lexicalized multiword expression
does NOT automatically produce an independent
learner-facing LexicalOccurrence.
```

Por defecto:

```text
"se dio cuenta"
→ Learner LexicalOccurrence = DARSE_CUENTA
```

mientras:

```text
"dio"
→ MorphologicalAnalysis = DAR
```

pero no genera automáticamente:

```text
Learner LexicalOccurrence = DAR
```

## 42A.2 Excepciones

Un editor podrá autorizar explícitamente una occurrence independiente cuando exista una razón pedagógica real.

## 42A.3 Objetivo

Esta política evita:

- doble conteo de vocabulario;
- exposición falsa a componentes lexicalizados;
- inconsistencias entre corridas del NLP;
- resultados distintos entre editores;
- aprendizaje contaminado por componentes internos de expresiones fijas.

La política de solapamiento es **determinista y bloqueante para el diseño relacional**.

---

# PARTE VII — EL DICCIONARIO COMO PROYECCIÓN

# 43. No crear `DictionaryEntry` como centro conceptual

El estudiante percibirá un panel de diccionario.

Internamente, ese panel será una composición.

Ejemplo:

```text
Lexeme
+
LexemeForm
+
Sense
+
Translation
+
Definition
+
Examples
+
Morphology
+
CurricularMetadata
+
PreviousOccurrences
+
LearnerState
```

Por tanto:

```text
Dictionary UI ≠ one DictionaryEntry entity
```

---

# 44. Ventaja de este diseño

Nos permite:

- sustituir fuente de diccionario;
- combinar múltiples fuentes;
- corregir una traducción sin modificar el Lexeme;
- añadir ejemplos propios;
- almacenar sentidos propios;
- priorizar historias del estudiante;
- cambiar de proveedor en el futuro;
- mantener costo cero inicialmente;
- evitar vendor lock-in.

---

# 45. Example

## 45.1 Definición conceptual

Un `Example` representa un contexto lingüístico utilizado para mostrar uso.

Puede provenir de:

```text
STORY_CONTEXT
INTERNAL_EDITORIAL
EXTERNAL_CORPUS
```

---

# 46. Prioridad de ejemplos

Orden pedagógico propuesto:

```text
1. Contextos anteriores del propio estudiante
2. Historias propias de la plataforma
3. Ejemplos editoriales propios
4. Corpus externo abierto
```

No se mostrarán ejemplos externos únicamente porque existan.

Deben pasar filtros de:

- adecuación;
- nivel;
- claridad;
- longitud;
- contenido;
- sentido;
- licencia.

---

# 47. Provenance

Todo dato externo debe poder responder:

```text
¿de dónde vino?
```

Necesitamos conceptualmente:

```text
Source
```

y posiblemente:

```text
Attribution
```

Información potencial:

```text
source_name
source_type
source_url
license
version
imported_at
original_identifier
```

No se definen todavía columnas.

---

# 48. Datos editoriales propios y versionado

Un dato importado puede ser:

```text
imported
```

y luego:

```text
edited
```

El sistema debe preservar procedencia incluso después de la modificación.

Ejemplo conceptual:

```text
original_source = KAIKKI
editorial_revision = INTERNAL
```

## 48.1 Entidades conceptuales nuevas

Se incorporan:

```text
Source
SourceSnapshot
EditorialRevision
```

## 48.2 Principio de no destrucción

> **Nunca debemos destruir silenciosamente el dato original importado.**

Ejemplo:

```text
SourceSnapshot:
translation = "to carry"
source = Kaikki
```

Después, un editor puede añadir:

```text
EditorialRevision:
add_translation = "to take"
```

El sistema no debe reescribir retrospectivamente la fuente como si Kaikki hubiera proporcionado ambas traducciones.

## 48.3 Auditoría conceptual

Una revisión editorial deberá poder responder:

```text
what changed
previous value
new value
who changed it
when
why
source affected
```

La implementación concreta se decidirá en `data-model.md`.

## 48.4 Current projection

La interfaz podrá consumir una vista actual:

```text
CURRENT PROJECTION
```

derivada de:

```text
SourceSnapshot
+
EditorialRevision history
```

sin perder el historial.

---

# PARTE VIII — PEDAGOGICAL LAYER

# 49. CurricularAssertion y decisión curricular

Un Lexeme no posee ontológicamente un único nivel CEFR.

No modelaremos:

```text
lexeme.cefr = A1
```

como verdad universal.

En lugar de fusionar fuentes, cada fuente produce una afirmación independiente:

```text
Lexeme / Sense / Construction
          ↓
CurricularAssertion
          ↓
Framework / Level / Source
```

Ejemplo:

```text
Assertion #1
framework = PCIC
level = A1
source = PCIC

Assertion #2
framework = INTERNAL
level = A2
source = editorial curriculum
```

No existe contradicción técnica: existen dos afirmaciones distintas con procedencias distintas.

La plataforma podrá definir además:

```text
EffectiveCurricularDecision
```

para expresar la decisión pedagógica efectiva del curso.

Ejemplo:

```text
EffectiveCurricularDecision:
introduce_at = A2
```

Principio:

```text
source assertion ≠ internal curriculum decision
```

---

# 50. Ejemplo

```text
Lexeme:
COMER

CurricularAssertion:
framework = PCIC
level = A1
source = PCIC
```

Otro posible caso:

```text
Construction:
LLEVAR + DURATION + GERUND

CurricularAssertion:
framework = INTERNAL
level = B1
```

---

# 51. Razón

El nivel puede depender de:

- sentido;
- construcción;
- frecuencia;
- función comunicativa;
- fuente curricular;
- contexto;
- política pedagógica interna.

Por tanto:

```text
CEFR ≠ inherent immutable property of a Lexeme
```

---

# 52. PedagogicalRole

Una aparición dentro de una historia puede tener una intención pedagógica.

Ejemplos:

```text
TARGET
REVIEW
INCIDENTAL
SUPPORT
```

Story:

```text
Marta quiere comprar una bicicleta amarilla.
```

Podría contener:

```text
comprar     → TARGET
querer      → REVIEW
bicicleta   → TARGET
amarilla    → INCIDENTAL
```

---

# 53. Importancia y autoridad de `PedagogicalRole`

Permitirá distinguir entre:

```text
la palabra apareció
```

y:

```text
la palabra fue deliberadamente enseñada
```

Esta diferencia será esencial para:

- cobertura curricular;
- analítica;
- repetición;
- generación de próximas actividades;
- evaluación.

## 53.1 Fuente de autoridad

> **`PedagogicalRole` es una decisión editorial de la StoryOccurrence publicada.**

Una máquina podrá sugerir:

```text
suggested_role = REVIEW
```

pero la versión publicada debe contener una decisión editorial explícita cuando el rol afecte:

- cobertura;
- progreso;
- repetición;
- análisis de exposición;
- evaluación.

Por tanto:

```text
algorithmic suggestion ≠ published pedagogical intent
```

---

# PARTE IX — LEARNER LAYER

# 54. Principio

El conocimiento no pertenece al Lexeme.

Pertenece a la relación entre:

```text
Student
   ↓
Lexical Unit
```

---

# 55. LearnerEvent

## 55.1 Definición

> **LearnerEvent:** hecho histórico que registra una interacción lingüísticamente relevante de un estudiante.

Ejemplos potenciales:

```text
EXPOSURE
WORD_OPENED
STATE_DECLARED
TRANSLATION_REVEALED
EXERCISE_CORRECT
EXERCISE_INCORRECT
RECALL_SUCCESS
RECALL_FAILURE
PRODUCTION_SUCCESS
PRODUCTION_FAILURE
```

No todos son necesarios para el MVP.

---

# 56. Los eventos son históricos

Ejemplo:

```text
10:02
Student saw COMER

10:03
Student opened COMER

10:03
Student marked COMER = NEW

Day 4
Student encountered COMER again

Day 7
Student answered a recognition task correctly

Day 10
Student marked COMER = LEARNING
```

Los eventos no deben ser destruidos cuando cambia el estado actual.

---

# 57. Estado actual vs historial

Conceptualmente:

```text
EVENT LOG
   ↓
CURRENT STATE
```

Por tanto:

```text
LearnerEvent
```

y:

```text
UserLexemeState
```

son conceptos distintos.

## 57.1 Fuente histórica de verdad

> **`LearnerEvent` es la fuente histórica de verdad.**

`UserLexemeState` debe ser conceptualmente una proyección reconstruible.

```text
LearnerEvent
      ↓
rebuild
      ↓
UserLexemeState
```

Nunca:

```text
UserLexemeState
      ↓
invent historical events
```

## 57.2 Materialización futura

En producción podremos materializar `UserLexemeState` por rendimiento.

Eso será una optimización de persistencia, no un cambio de semántica.

## 57.3 Mastery

Si `mastery` se materializa, deberá conservar:

```text
mastery_score
mastery_model_version
calculated_at
```

para que cambios futuros en el algoritmo no vuelvan incomparables los valores antiguos.

---

# 58. UserLexemeState

## 58.1 Definición

> **UserLexemeState:** resumen actual de la relación entre un estudiante y un Lexeme.

Puede resumir posteriormente:

```text
declared_state
first_seen
last_seen
encounter_count
open_count
correct_count
incorrect_count
mastery_estimate
```

Todavía no se decide cuáles serán columnas persistidas y cuáles valores derivados.

---

# 59. Estados declarados

Los tres estados iniciales serán:

```text
NEW
LEARNING
KNOWN
```

Interpretación:

```text
NEW
→ no conozco esta unidad

LEARNING
→ la reconozco parcialmente, pero no la domino

KNOWN
→ considero que la comprendo y puedo utilizarla
```

---

# 60. Estado declarado ≠ dominio

Debe distinguirse:

```text
learner_declared_state
```

de:

```text
computed_mastery
```

Ejemplo:

```text
learner_declared_state = KNOWN
computed_mastery = 0.63
```

El primero es autoevaluación.

El segundo será una inferencia basada en evidencia.

---

# 61. Mastery

No se definirá todavía una fórmula.

Antes debemos definir tipos de evidencia.

Posibles dimensiones:

```text
EXPOSURE
RECOGNITION
RECALL
CONTEXT_COMPREHENSION
CONTROLLED_PRODUCTION
FREE_PRODUCTION
```

Una unidad puede ser reconocida pero no producible.

---

# 62. UserLexemeState vs UserSenseState

Problema:

```text
BANCO
```

El estudiante puede conocer:

```text
institución financiera
```

pero desconocer:

```text
asiento
```

Por tanto, el sistema debe poder evolucionar hacia:

```text
UserLexemeState
```

y:

```text
UserSenseState
```

aunque el MVP muestre inicialmente una interfaz simplificada.

---

# 63. Ejemplo

```text
Lexeme:
BANCO

Overall:
LEARNING

Sense:
FINANCIAL_INSTITUTION
KNOWN

Sense:
BENCH
NEW
```

Esto será importante especialmente en B1–C1.

# 63A. Privacidad y retención de `LearnerEvent`

`LearnerEvent` constituye un historial detallado del comportamiento de aprendizaje.

Por tanto, la arquitectura debe incorporar desde el dominio principios de:

```text
data minimization
retention
deletion
exportability
access control
```

Preguntas obligatorias antes de producción:

- ¿qué eventos realmente necesitamos?
- ¿cuánto tiempo conservar cada tipo de evento?
- ¿qué ocurre al eliminar una cuenta?
- ¿qué puede exportar el estudiante?
- ¿qué puede ver un profesor?
- ¿qué datos nunca deben registrarse?
- ¿qué tratamiento adicional corresponde si existen menores?
- ¿qué eventos pueden agregarse o anonimizarse?

Principio:

> **No registrar un evento simplemente porque técnicamente sea posible.**

El event log debe almacenar únicamente evidencia necesaria para funciones pedagógicas o de producto claramente definidas.

---

# PARTE X — RECUPERACIÓN CONTEXTUAL

# 64. Objetivo

Cuando el estudiante abre una unidad, el sistema debe poder recuperar:

- contexto actual;
- contextos anteriores;
- formas encontradas;
- sentidos encontrados;
- número de exposiciones;
- resultados relevantes;
- estado actual.

---

# 65. Ejemplo

El estudiante selecciona:

```text
llevó
```

Panel:

```text
llevar

to carry / take

EN ESTA HISTORIA

María llevó las maletas al coche.

YA LA HABÍAS VISTO

Story 3
Carlos lleva una mochila.

Story 8
Te llevo a casa.

Story 14
Llevamos dos años viviendo aquí.
```

Cada oración puede representar:

- misma forma;
- otra forma verbal;
- mismo sentido;
- otro sentido;
- una construcción diferente.

---

# 66. Recuperación por Sense

La recuperación debe respetar `SenseResolutionStatus`.

Orden propuesto:

```text
1. same Lexeme + same resolved Sense
2. same Lexeme + different resolved Sense
3. same Lexeme + unresolved Sense
```

Pero cada grupo debe presentarse explícitamente como categoría diferente.

Ejemplo:

```text
BANCO
```

Si el contexto actual significa:

```text
bench
```

deberíamos priorizar primero:

```text
Mismo significado
→ occurrences RESOLVED como BENCH
```

Después:

```text
Otros usos
→ occurrences RESOLVED como FINANCIAL_INSTITUTION
```

Y nunca presentar:

```text
UNRESOLVED
```

como evidencia confirmada del mismo significado.

---

# PARTE XI — FLUJO COMPLETO

# 67. Caso A: `comió`

Story:

```text
Ayer Marta comió arroz con su familia.
```

## Paso 1 — Surface text

```text
comió
```

## Paso 2 — Token

```text
Token:
text = "comió"
```

## Paso 3 — Morphosyntax

```text
lemma = comer
POS = VERB
VerbForm = FINITE
Mood = INDICATIVE
Person = 3
Number = SINGULAR

normalized_nlp_tense = PAST
spanish_verb_tense = PRETERITO_PERFECTO_SIMPLE
```

## Paso 4 — Lexeme

```text
COMER
```

## Paso 5 — Sense

```text
INGEST_FOOD
```

## Paso 6 — StoryOccurrence

```text
surface = comió
lexeme = COMER
sense = INGEST_FOOD
story = ...
sentence = ...
```

## Paso 7 — Dictionary projection

```text
comer

to eat

Ayer Marta comió arroz con su familia.
```

## Paso 8 — Previous contexts

```text
Story 2:
Comemos pizza.

Story 6:
Pedro quiere comer.
```

## Paso 9 — Student interaction

```text
LEARNING
```

## Paso 10 — LearnerEvent

```text
type = STATE_DECLARED
lexeme = COMER
sense = INGEST_FOOD
occurrence = ...
value = LEARNING
```

## Paso 11 — State

```text
UserLexemeState:
COMER → LEARNING
```

---

# 68. Caso B: pretérito imperfecto

Story:

```text
Cuando era pequeño, llevaba una mochila azul.
```

Occurrence:

```text
surface = llevaba
lexeme = LLEVAR
```

Morphology:

```text
Mood = INDICATIVE
Number = SINGULAR

spanish_verb_tense = PRETERITO_IMPERFECTO
```

La persona puede ser inferida por el contexto:

```text
yo llevaba
```

---

# 69. Caso C: perfecto compuesto

Story:

```text
Hoy Marta ha llevado los libros a clase.
```

Tokens:

```text
ha
llevado
```

Lexeme principal:

```text
LLEVAR
```

Verb phrase analysis:

```text
spanish_verb_tense = PRETERITO_PERFECTO_COMPUESTO
Mood = INDICATIVE
Person = 3
Number = SINGULAR
```

Esto demuestra que:

```text
verbal tense analysis
```

puede pertenecer a una construcción de varios tokens.

---

# 70. Caso D: polisemia

Story 1:

```text
Me senté en el banco.
```

```text
Lexeme = BANCO
Sense = BENCH
```

Story 2:

```text
Fui al banco a sacar dinero.
```

```text
Lexeme = BANCO
Sense = FINANCIAL_INSTITUTION
```

---

# 71. Caso E: homografía

```text
vino
```

Puede representar:

```text
Lexeme = VINO
POS = NOUN
Sense = WINE
```

o:

```text
surface = vino
Lexeme = VENIR
POS = VERB
spanish_verb_tense = PRETERITO_PERFECTO_SIMPLE
Person = 3
Number = SINGULAR
```

Esto demuestra:

```text
surface string ≠ Lexeme
```

---

# 72. Caso F: `como`

```text
Como arroz todos los días.
```

puede contener:

```text
Lexeme = COMER
POS = VERB
Person = 1
Number = SINGULAR
spanish_verb_tense = PRESENTE
```

Mientras:

```text
Es como su hermano.
```

contiene otro análisis.

Esto obliga a utilizar contexto.

---

# 73. Caso G: multiword expression

Story:

```text
Marta se dio cuenta del error.
```

Tokens:

```text
Marta
se
dio
cuenta
del
error
.
```

StoryOccurrence:

```text
surface = "se dio cuenta"
lexeme = DARSE_CUENTA
```

La forma verbal interna contiene además:

```text
dio
→ dar
→ pretérito perfecto simple
```

Pero la unidad léxica pedagógica principal puede ser:

```text
darse cuenta
```

---

# 74. Caso H: construcción productiva

Story:

```text
Llevo tres años estudiando español.
```

Podemos identificar simultáneamente:

```text
Lexeme:
LLEVAR
```

y:

```text
Construction:
LLEVAR + DURATION + GERUND
```

La construcción comunica duración iniciada en el pasado y continuada hasta el punto de referencia.

No debe confundirse con el sentido físico:

```text
llevar una mochila
```

# 74A. Caso I: discontinuidad y solapamiento

Story:

```text
Marta se dio finalmente cuenta del problema.
```

## Text layer

```text
Marta | se | dio | finalmente | cuenta | del | problema
```

## Morphosyntactic layer

```text
dio
→ lemma = dar
→ POS = VERB
→ Mood = INDICATIVE
→ spanish_verb_tense = PRETERITO_PERFECTO_SIMPLE
→ Person = 3
→ Number = SINGULAR
```

## Lexical layer

```text
LexicalOccurrence = DARSE_CUENTA
```

## Occurrence parts

```text
Part 1
text = "se"
role = CLITIC
CliticFunction = LEXICAL_PRONOMINAL

Part 2
text = "dio"
role = HEAD

Part 3
text = "cuenta"
role = FIXED
```

## Intervening material

```text
finalmente
```

no pertenece a la multiword lexical occurrence.

## Overlap rule

```text
dio → MorphologicalAnalysis(DAR)
```

pero no genera automáticamente:

```text
Learner LexicalOccurrence(DAR)
```

La unidad léxica pedagógica principal es:

```text
DARSE_CUENTA
```

Este caso es un test arquitectónico obligatorio para `data-model.md`.

---

# PARTE XII — CASOS LÍMITE OBLIGATORIOS

# 75. Test set conceptual

Antes de diseñar PostgreSQL, el modelo deberá poder explicar correctamente:

```text
comí
→ comer
→ pretérito perfecto simple

comía
→ comer
→ pretérito imperfecto

he comido
→ comer
→ pretérito perfecto compuesto

había comido
→ comer
→ pretérito pluscuamperfecto

casas
→ casa

me doy cuenta
→ darse cuenta

se dio cuenta
→ darse cuenta

banco
→ bench

banco
→ financial institution

como
→ comer

como
→ as / like

vino
→ venir

vino
→ wine

está
→ estar

ha comido
→ comer + compound tense analysis

Nueva York
→ proper noun multiword

Estados Unidos
→ proper noun multiword

sin embargo
→ discourse marker

tener que comer
→ grammatical construction + lexical unit

lleva estudiando
→ lexical unit + aspectual/temporal construction
```

---

# 76. Más casos que deberemos estudiar

```text
se
→ reflexive / passive / impersonal / lexical component

lo
→ pronoun / article-like nominalization contexts

que
→ relative / conjunction / other functions

haber
→ auxiliary / existential

ser
→ copular / passive auxiliary

estar
→ copular / progressive auxiliary contexts

por
para

ser
estar

saber
conocer

pedir
preguntar

quedar
quedarse

ir
irse
```

Estos pares y formas serán importantes en enseñanza de español.

---


# 76A. Caso J: homógrafos dentro del mismo POS

Ejemplo conceptual:

```text
cura
```

El sistema debe poder distinguir:

```text
Lexeme A
canonical_form = cura
POS = NOUN
inherent_gender = MASCULINE
Sense = sacerdote
```

de:

```text
Lexeme B
canonical_form = cura
POS = NOUN
inherent_gender = FEMININE
Sense = curación
```

Ambos pueden pertenecer al mismo:

```text
HomographGroup
```

sin compartir `UserLexemeState`.

---

# 76B. Caso K: pronominal lexicalizado vs reflexivo productivo

## Lexicalizado

```text
Me voy a casa.
```

```text
Lexeme = IRSE
Pronominality = LEXICALIZED_ALTERNANT

"me"  → CLITIC / LEXICAL_PRONOMINAL
"voy" → HEAD
```

## Reflexivo productivo

```text
Me lavo.
```

```text
Lexeme = LAVAR
Pronominality = NONE

"me"
→ CliticFunction = REFLEXIVE
→ belongs to REFLEXIVE ConstructionOccurrence
```

No se crea automáticamente:

```text
Lexeme = LAVARSE
```

---

# 76C. Caso L: enclisis dentro de un token

```text
Vete.
```

Supongamos un token ortográfico:

```text
vete
```

La lexical occurrence:

```text
IRSE
```

debe poder anclarse así:

```text
TextAnchor("ve")
→ role = HEAD

TextAnchor("te")
→ role = CLITIC
→ CliticFunction = LEXICAL_PRONOMINAL
```

Este caso prueba que `OccurrencePart` no puede depender únicamente de `token_id`.

---

# PARTE XIII — INVARIANTES

# 77. Invariantes lingüísticos

```text
Token ≠ Lexeme

Span ≠ Lexeme

Occurrence ≠ necessarily one contiguous Span

Occurrence = 1..N OccurrencePart

Form ≠ Lexeme

Lexeme ≠ Sense

Sense ≠ Translation

Occurrence ≠ Lexeme

Surface string ≠ lexical identity

POS is mandatory for Lexeme

POS change → different Lexeme by default

linguistic signature ≠ physical database identity

StudentState ≠ Lexeme

DeclaredKnowledge ≠ Mastery

CEFR ≠ inherent property of a Lexeme

Multiword expression ≠ sequence of unrelated tokens

Construction ≠ Lexeme

Morphological annotation may overlap lexical annotation

component morphology ≠ automatic learner-facing lexical occurrence

UNRESOLVED Sense ≠ confirmed same-sense example

Automatic NLP prediction ≠ editorial truth

Dictionary UI ≠ DictionaryEntry database entity

Normalized NLP tense ≠ complete Spanish pedagogical tense

OccurrencePart → TextAnchor, not token_id only

TextAnchor may address a subtoken character range

same canonical form + same POS ≠ guaranteed same Lexeme

HomographGroup ≠ learner knowledge unit

canonical -se ≠ fixed surface "se"

lexical pronominal ≠ reflexive by default

reflexive / reciprocal / passive-se / impersonal-se
≠ automatic pronominal Lexeme
```

# 78. Invariantes de tiempo verbal

```text
Tense=Past
≠
sufficient Spanish pedagogical description
```

El sistema debe poder diferenciar:

```text
PRETERITO_PERFECTO_SIMPLE
PRETERITO_IMPERFECTO
PRETERITO_PERFECTO_COMPUESTO
PRETERITO_PLUSCUAMPERFECTO
```

y progresivamente el resto del paradigma relevante.

---

# 79. Invariantes del estudiante

```text
one click ≠ mastery

one exposure ≠ learning

KNOWN declaration ≠ proven productive ability

Lexeme mastery ≠ all Sense mastery

exposure ≠ retrieval

recognition ≠ production
```

---

# PARTE XIV — ENTIDADES CONCEPTUALES ACTUALES

# 80. Text

```text
Story
StoryVersion
Sentence
SurfaceToken
Span
TextAnchor
```

---

# 81. Linguistic Analysis

```text
MorphologicalAnalysis
VerbPhraseAnalysis
NLPAnnotation
ConstructionAnalysis
CliticAnalysis
CliticFunction
```

---

# 82. Lexicon

```text
Lexeme
LexemeLifecycleStatus
HomographGroup
LexemeForm
Sense
Translation
Definition
Example
LexicalRelation
Pronominality

LexemeLineageEvent
SenseLineageEvent
LexiconRelease
```

---

# 83. Context

```text
StoryOccurrence
OccurrenceAnnotationRevision
```

---

# 84. Multiword / Construction / Annotation

```text
Multiword Lexeme
LexicalOccurrence
ConstructionOccurrence
OccurrencePart
Construction
GrammarPattern
```

`OccurrencePart` deja de ser una posibilidad vaga y pasa a ser una abstracción obligatoria del dominio para representar discontinuidad.

Algunos de los demás conceptos pueden terminar siendo abstracciones y no entidades persistidas independientes.

---

# 85. Pedagogy

```text
CurricularAssertion
EffectiveCurricularDecision
PedagogicalRole
CEFRMapping
```

---

# 86. Provenance / Editorial History

```text
Source
SourceSnapshot
Attribution
EditorialRevision
```

---

# 87. Learner

```text
LearnerEvent
LearnerEventAttribution
UserLexemeState
UserSenseState
```

---

# 88. Advertencia

Esta lista:

```text
NO ES una lista de tablas PostgreSQL.
```

Una entidad conceptual puede convertirse posteriormente en:

- tabla;
- relación;
- enum;
- JSONB;
- view;
- materialized view;
- valor calculado;
- objeto TypeScript;
- resultado temporal del pipeline.

---


# PARTE XIV-A — EVOLUCIÓN DE IDENTIDAD LÉXICA: SPLIT / MERGE

# 88A. Problema

Una identidad léxica puede estar equivocada o resultar demasiado gruesa después de que el sistema ya tenga datos.

Ejemplos:

```text
Caso 1
dos Lexemes importados resultan ser el mismo Lexeme
→ MERGE

Caso 2
un Lexeme originalmente único contiene en realidad dos homónimos
→ SPLIT

Caso 3
una política editorial cambia la granularidad del lexicón
→ MERGE o SPLIT controlado
```

Para entonces pueden existir:

```text
StoryOccurrence
LearnerEvent
UserLexemeState
UserSenseState
Examples
CurricularAssertion
Dictionary projections
```

Una operación destructiva como:

```text
UPDATE all old rows
DELETE old Lexeme
```

rompería:

- auditoría;
- provenance;
- reconstrucción histórica;
- explicabilidad;
- URLs antiguas;
- estados del estudiante;
- reproducibilidad de métricas.

Por tanto, `split/merge` se modelará como **evolución de identidad**, no como edición destructiva.

---

# 88B. Identidad publicada inmutable

> **Una vez que un `Lexeme` ha sido utilizado por contenido publicado o por un `LearnerEvent`, su `lexeme_id` nunca cambia de significado retroactivamente.**

Puede cambiar su estado de ciclo de vida, pero su identidad histórica permanece.

Estados conceptuales:

```text
PROVISIONAL
ACTIVE
SUPERSEDED
RETIRED
```

## `PROVISIONAL`

Identidad todavía no utilizada como referencia pedagógica estable.

Puede corregirse con mayor libertad durante importación o staging.

## `ACTIVE`

Identidad actualmente válida dentro de una `LexiconRelease`.

## `SUPERSEDED`

La identidad existió y conserva valor histórico, pero fue reemplazada por una operación de lineage.

No debe recibir nuevas occurrences learner-facing en contenido nuevo.

## `RETIRED`

Identidad retirada sin sucesor pedagógico activo.

Se conserva por razones históricas.

Invariante:

```text
published lexeme_id → never reused for a different identity
```

---

# 88C. `LexemeLineageEvent`

Se introduce:

```text
LexemeLineageEvent
```

Definición:

> **Evento editorial inmutable que declara una transformación de identidad entre uno o más Lexemes históricos y uno o más Lexemes sucesores.**

Tipos mínimos:

```text
SPLIT
MERGE
REPLACED_BY
RETIRE
```

Conceptualmente contiene:

```text
lineage_event_id
type
source_lexemes[]
target_lexemes[]
reason
editorial_revision
effective_release
created_at
```

No se definen todavía columnas SQL.

## Cardinalidades

### Split

```text
1 source
→ 2..N targets
```

### Merge

```text
2..N sources
→ 1 target
```

### Replace

```text
1 source
→ 1 target
```

### Retire

```text
1 source
→ 0 targets
```

---

# 88D. Grafo de lineage

Los eventos forman un grafo dirigido:

```text
historical identity
        ↓
successor identity
```

Ejemplo:

```text
L0
├──split→ L1
└──split→ L2

L1 + L3
   └──merge→ L4
```

## Invariantes

```text
lineage graph must be acyclic

a lineage edge never deletes its source

SUPERSEDED nodes remain queryable

an ACTIVE Lexeme may later become SUPERSEDED

lineage history is append-only
```

No se permite:

```text
A → B → A
```

porque impediría resolver una identidad activa de manera determinista.

---

# 88E. `LexiconRelease`

Se introduce:

```text
LexiconRelease
```

Definición:

> **Snapshot lógico de qué identidades, sentidos y asignaciones editoriales constituyen el lexicón activo para una versión publicada del sistema.**

Ejemplo:

```text
LexiconRelease 12
CURA = one Lexeme

LexiconRelease 13
CURA_SACERDOTE
CURA_CURACION
```

Esto permite responder dos preguntas diferentes:

```text
¿Cómo entendía el sistema esta palabra cuando ocurrió el evento?
```

y:

```text
¿Cómo debe interpretarse actualmente?
```

Una proyección de progreso deberá indicar contra qué `LexiconRelease` fue calculada.

---

# 88F. `StoryOccurrence` no se destruye

`StoryOccurrence` representa un encuentro concreto dentro de una versión del texto.

Su identidad debe mantenerse estable mientras ese texto no cambie.

No reemplazaremos:

```text
old StoryOccurrence
```

por otra simplemente porque cambió el análisis léxico.

En su lugar se introduce:

```text
OccurrenceAnnotationRevision
```

Definición:

> **Revisión versionada de la interpretación lingüística asignada a una occurrence estable.**

Puede registrar conceptualmente:

```text
occurrence
previous_lexeme
new_lexeme
previous_sense
new_sense
reason
lexicon_release
editorial_revision
```

Ejemplo:

Antes:

```text
Occurrence #845
surface = cura
lexeme = CURA
```

Después de un split:

```text
Occurrence #845
surface = cura

Annotation revision:
CURA
→ CURA_SACERDOTE
```

La occurrence no cambia.

Cambia su interpretación activa.

---

# 88G. `LearnerEvent` permanece inmutable

La política existente:

```text
LearnerEvent = historical source of truth
```

se extiende con una regla:

> **Un `LearnerEvent` nunca se reescribe para fingir que apuntó originalmente al Lexeme que hoy consideramos correcto.**

Debe conservar conceptualmente:

```text
recorded_lexeme_id
occurrence_id, when available
recorded_sense_id, when available
event_time
```

Ejemplo histórico:

```text
2026-03-10

LearnerEvent:
WORD_OPENED
recorded_lexeme = CURA
occurrence = #845
```

Meses después:

```text
CURA
→ split
→ CURA_SACERDOTE
→ CURA_CURACION
```

El evento histórico continúa diciendo:

```text
recorded_lexeme = CURA
```

porque eso fue lo que el sistema conocía en ese momento.

---

# 88H. `LearnerEventAttribution`

Para calcular el estado actual se introduce una proyección:

```text
LearnerEventAttribution
```

Definición:

> **Interpretación actual de a qué Lexeme activo contribuye un LearnerEvent histórico bajo una `LexiconRelease` determinada.**

Conceptualmente:

```text
learner_event
recorded_lexeme
effective_lexeme
attribution_status
lexicon_release
reason
```

Estados iniciales:

```text
EXACT
BY_OCCURRENCE
BY_SENSE
BY_EQUIVALENT_MERGE
AMBIGUOUS_LEGACY
UNATTRIBUTED
```

## `EXACT`

El Lexeme histórico continúa activo.

## `BY_OCCURRENCE`

La occurrence asociada fue reanotada y determina un sucesor concreto.

## `BY_SENSE`

Un Sense histórico puede vincularse de manera inequívoca con un sucesor.

## `BY_EQUIVALENT_MERGE`

El Lexeme histórico fue absorbido en un merge declarado semánticamente equivalente.

## `AMBIGUOUS_LEGACY`

Existe un split, pero la evidencia histórica no permite decidir qué hijo debe recibir el evento.

## `UNATTRIBUTED`

El evento no debe contribuir a ningún Lexeme activo.

---

# 88I. Regla fundamental del `split`

Supongamos:

```text
OLD_LEXEME
   ↓ split
NEW_A
NEW_B
```

La política es:

> **Un evento histórico puede contribuir como máximo a uno de los Lexemes hijos. Nunca se duplica automáticamente hacia todos.**

Esto evita:

```text
1 encounter antiguo
→ 2 encounters artificiales
```

y, peor:

```text
KNOWN antiguo
→ NEW_A = KNOWN
→ NEW_B = KNOWN
```

sin evidencia.

---

# 88J. Algoritmo conceptual de atribución después de un split

Orden:

```text
1. occurrence context
2. resolved Sense lineage
3. other deterministic editorial evidence
4. otherwise AMBIGUOUS_LEGACY
```

## Paso 1 — occurrence

Si el evento contiene:

```text
occurrence_id
```

y esa occurrence fue reanotada:

```text
OLD → NEW_A
```

entonces:

```text
LearnerEventAttribution
effective_lexeme = NEW_A
status = BY_OCCURRENCE
```

## Paso 2 — Sense

Si no hay occurrence, pero existe un Sense histórico inequívoco:

```text
OLD / Sense X
→ NEW_B / Sense Y
```

se puede atribuir a `NEW_B`.

## Paso 3 — evidencia editorial determinista

Solo se permite cuando existe una regla explícita y auditable.

No se utilizarán heurísticas silenciosas.

## Paso 4 — ambigüedad

Si no puede saberse:

```text
effective_lexeme = null
status = AMBIGUOUS_LEGACY
```

El evento permanece visible en historia, pero:

```text
does not count toward NEW_A mastery
does not count toward NEW_B mastery
```

hasta ser resuelto.

---

# 88K. Consecuencia para eventos de estado declarados

Caso:

```text
Student:
CURA = KNOWN
```

Luego:

```text
CURA
→ CURA_SACERDOTE
→ CURA_CURACION
```

Si el evento `STATE_DECLARED` estaba asociado a una occurrence:

```text
El cura habló con nosotros.
```

puede atribuirse:

```text
CURA_SACERDOTE = KNOWN evidence
```

No implica:

```text
CURA_CURACION = KNOWN
```

Si el estado fue declarado desde una lista abstracta sin contexto ni Sense:

```text
CURA = KNOWN
```

queda:

```text
AMBIGUOUS_LEGACY
```

y ninguno de los hijos hereda automáticamente `KNOWN`.

---

# 88L. Requisito fuerte para nuevos `LearnerEvent`

Para minimizar ambigüedad futura:

> **Todo evento léxico originado dentro de una Story debería conservar `occurrence_id`.**

Ejemplos:

```text
WORD_OPENED
STATE_DECLARED
TRANSLATION_REVEALED
```

si ocurrieron desde una Story.

Así, incluso después de un split, podremos reconstruir la intención utilizando el contexto original.

Los eventos creados fuera de una Story deberían preservar, cuando exista:

```text
sense_id
source_context
```

---

# 88M. Regla fundamental del `merge`

Supongamos:

```text
OLD_A
OLD_B
   ↓ merge
NEW_C
```

Los eventos históricos:

```text
event on OLD_A
event on OLD_B
```

no se copian.

Se mantienen intactos y una proyección puede atribuir ambos a:

```text
NEW_C
```

Cada evento sigue existiendo una sola vez.

Invariante:

```text
one LearnerEvent
→ at most one effective active Lexeme
```

---

# 88N. Dos tipos semánticos de merge

No todos los merges significan lo mismo.

Se introducen:

```text
EQUIVALENT_IDENTITY
COARSENING
```

## `EQUIVALENT_IDENTITY`

Dos identidades eran duplicados accidentales del mismo Lexeme.

Ejemplo:

```text
COMER_IMPORT_A
COMER_IMPORT_B
→ COMER
```

Aquí es seguro atribuir evidencia histórica de ambos a la nueva identidad.

```text
attribution = BY_EQUIVALENT_MERGE
```

## `COARSENING`

Dos identidades se combinan porque la política editorial adopta una granularidad más amplia.

Ejemplo conceptual:

```text
Lexeme A
Lexeme B
→ Lexeme C broader
```

Aquí las evidencias de encounter pueden agregarse, pero **los estados declarados no deben promoverse ciegamente**.

Por ejemplo:

```text
A = KNOWN
B = NEW
```

no permite decidir trivialmente:

```text
C = KNOWN
```

La proyección debe recomputar conocimiento desde la evidencia y puede dejar:

```text
declared_state = unset
```

hasta una nueva declaración contextual.

---

# 88O. `TransferPolicy`

Un lineage event puede declarar una política conceptual:

```text
CONTEXTUAL
FULL_EQUIVALENT
EVIDENCE_ONLY
NONE
```

## `CONTEXTUAL`

Normal para `SPLIT`.

Solo transfiere eventos que puedan atribuirse a un sucesor concreto.

## `FULL_EQUIVALENT`

Normal para merges de identidades duplicadas.

Permite atribuir todos los eventos relevantes al sucesor único.

## `EVIDENCE_ONLY`

Los encuentros y resultados pueden contribuir, pero un estado declarado histórico no se adopta automáticamente como estado actual.

Útil para merges de `COARSENING`.

## `NONE`

No transfiere progreso automáticamente.

Se usa cuando el cambio de identidad es demasiado profundo.

---

# 88P. Los agregados nunca son la unidad de migración

No se hará:

```text
OLD encounter_count = 12
→ copy 12 to NEW
```

ni:

```text
OLD mastery = 0.82
→ copy 0.82 to NEW
```

La operación correcta es:

```text
historical LearnerEvents
        ↓
current attribution
        ↓
projection algorithm
        ↓
new UserLexemeState
```

Por tanto:

```text
counters are disposable projections
mastery is a disposable/versioned projection
events are history
```

---

# 88Q. Versionado de proyecciones

Toda proyección derivada sensible a evolución lexical debería poder indicar:

```text
lexicon_release
projection_algorithm_version
calculated_at
event_cutoff
```

Ejemplo:

```text
UserLexemeState

lexeme = CURA_SACERDOTE
lexicon_release = 14
projection_algorithm_version = "2"
event_cutoff = ...
```

Esto permite:

- reconstruir;
- comparar;
- invalidar caches;
- migrar algoritmos;
- auditar cambios de progreso después de un split/merge.

---

# 88R. Split de Lexeme y Sense

Con frecuencia un split de Lexeme implica redistribuir sentidos.

No se moverá destructivamente un Sense histórico.

Se prepara el dominio para:

```text
SenseLineageEvent
```

o mecanismo equivalente.

Ejemplo:

```text
OLD_LEXEME
├── OLD_SENSE_A
└── OLD_SENSE_B

split →

NEW_LEXEME_A
└── NEW_SENSE_A

NEW_LEXEME_B
└── NEW_SENSE_B
```

Relaciones:

```text
OLD_SENSE_A → NEW_SENSE_A
OLD_SENSE_B → NEW_SENSE_B
```

Los Sense IDs históricos siguen siendo válidos para interpretar eventos pasados.

---

# 88S. URLs y referencias legacy

Un `lexeme_id` histórico puede aparecer en:

- bookmarks;
- logs;
- debugging;
- exports;
- URLs internas;
- analytics.

Por tanto, los IDs `SUPERSEDED` deben seguir resolviendo.

## Merge

Si:

```text
A + B → C
```

una ruta legacy puede resolver:

```text
A → C
B → C
```

mostrando si es necesario que la identidad fue reemplazada.

## Split

Si:

```text
A → B + C
```

no debe hacerse un redirect silencioso hacia uno de los hijos.

Debe resolverse a:

```text
Legacy Lexeme A
Superseded by:
- B
- C
```

porque elegir uno sin contexto destruiría información.

---

# 88T. Rollback y corrección de lineage

Los eventos de lineage son históricos.

No se eliminan para “deshacer” una decisión.

Si un split fue erróneo:

```text
A
→ B + C
```

podemos producir posteriormente:

```text
B + C
→ D
```

mediante un merge, o una operación editorial equivalente.

Así conservamos:

```text
qué creyó el sistema en cada release
```

No se reescribe el pasado.

---

# 88U. Workflow editorial de split/merge

Un cambio de identidad no debe publicarse con un simple botón destructivo.

Flujo recomendado:

```text
1. PROPOSE
2. IMPACT ANALYSIS
3. CREATE TARGET LEXEMES
4. DEFINE LINEAGE
5. REANNOTATE OCCURRENCES
6. REVIEW AMBIGUOUS OCCURRENCES
7. PREVIEW LEARNER IMPACT
8. VALIDATE INVARIANTS
9. PUBLISH NEW LEXICON RELEASE
10. REBUILD PROJECTIONS
11. INVALIDATE CACHES
12. AUDIT
```

## Impact analysis

Antes de publicar:

```text
number of StoryOccurrences affected
number of unresolved occurrences
number of LearnerEvents affected
number of AMBIGUOUS_LEGACY events expected
number of UserLexemeState projections affected
curricular mappings affected
examples affected
```

Un split con alto porcentaje de ambigüedad puede requerir revisión editorial adicional antes de publicación.

---

# 88V. Ejemplo canónico de split

Supongamos que inicialmente existe:

```text
Lexeme CURA
POS = NOUN
```

Historias:

```text
Occurrence #101
"El cura habló con la familia."
→ CURA

Occurrence #205
"La cura duró varias semanas."
→ CURA
```

Estudiante:

```text
Event #1
WORD_OPENED
occurrence = #101
recorded_lexeme = CURA

Event #2
STATE_DECLARED = LEARNING
occurrence = #101
recorded_lexeme = CURA

Event #3
WORD_OPENED
occurrence = #205
recorded_lexeme = CURA
```

Después:

```text
CURA
→ split
→ CURA_SACERDOTE
→ CURA_CURACION
```

Reanotación:

```text
#101 → CURA_SACERDOTE
#205 → CURA_CURACION
```

Atribución:

```text
Event #1
→ CURA_SACERDOTE
→ BY_OCCURRENCE

Event #2
→ CURA_SACERDOTE
→ BY_OCCURRENCE

Event #3
→ CURA_CURACION
→ BY_OCCURRENCE
```

Los eventos originales no cambian.

Las nuevas proyecciones sí.

---

# 88W. Ejemplo canónico de split ambiguo

Evento histórico:

```text
Event #90

STATE_DECLARED = KNOWN
recorded_lexeme = CURA
occurrence = null
sense = null
```

Después del split:

```text
CURA
→ CURA_SACERDOTE
→ CURA_CURACION
```

Resultado:

```text
Event #90

attribution_status = AMBIGUOUS_LEGACY
effective_lexeme = null
```

No hacemos:

```text
CURA_SACERDOTE = KNOWN
CURA_CURACION = KNOWN
```

El historial no se pierde, pero tampoco se inventa conocimiento.

---

# 88X. Ejemplo canónico de merge equivalente

Importación accidental:

```text
Lexeme COMER_A
Lexeme COMER_B
```

Se determina que son la misma identidad.

Creamos:

```text
Lexeme COMER_C
```

Lineage:

```text
COMER_A + COMER_B
→ COMER_C

merge_semantics = EQUIVALENT_IDENTITY
transfer_policy = FULL_EQUIVALENT
```

LearnerEvents de ambos Lexemes pueden atribuirse a:

```text
COMER_C
```

sin modificar los eventos históricos.

El `UserLexemeState` de `COMER_C` se recalcula desde el conjunto unido de eventos.

---

# 88Y. Ejemplo canónico de merge con granularidad diferente

Supongamos:

```text
Lexeme A
Lexeme B
```

se combinan por una nueva política editorial:

```text
A + B → C
```

pero A y B no eran meros duplicados.

Se utiliza:

```text
merge_semantics = COARSENING
transfer_policy = EVIDENCE_ONLY
```

Entonces:

```text
encounters
exercise results
context evidence
```

pueden contribuir a C.

Pero:

```text
A = KNOWN
```

no convierte automáticamente:

```text
C = KNOWN
```

La proyección puede requerir nueva evidencia o una nueva declaración.

---

# 88Z. Invariantes de split/merge

```text
published Lexeme identity is never reused

split/merge never deletes source Lexemes

split/merge creates new target Lexeme IDs

source Lexemes become SUPERSEDED

lineage graph is acyclic

StoryOccurrence identity survives lexical reannotation

Occurrence annotation history is preserved

LearnerEvent is never rewritten by lexical migration

one LearnerEvent contributes to at most one active Lexeme

split evidence is never copied to every child

ambiguous split evidence remains AMBIGUOUS_LEGACY

merge joins event attribution, not aggregate counters

mastery is recalculated, never copied

UserLexemeState is rebuildable

legacy Lexeme IDs remain resolvable

split legacy IDs do not silently redirect to one child

projection records LexiconRelease and algorithm version
```

---

# PARTE XV — PREGUNTAS ABIERTAS

# 89. Lexeme

Resuelto:

- `POS` es obligatorio;
- cambio de `POS` implica Lexeme diferente por defecto;
- same canonical form + same POS no garantiza identidad;
- se introduce `HomographGroup`;
- homonimia se representa mediante Lexemes separados;
- polisemia se representa preferentemente mediante `Sense`;
- la firma lingüística no será la primary key física;
- `Pronominality` forma parte de la identidad lexical cuando está lexicalizada.

Pendiente:

- política editorial exacta para casos fronterizos de homonimia/polisemia;
- palabras funcionales;
- regionalismos;
- variantes ortográficas;
- nombres propios;
- reglas editoriales de split/merge de casos fronterizos; la arquitectura histórica ya está resuelta.

---

# 90. LexemeForm

Pendiente:

- precomputar paradigma completo;
- almacenar únicamente formas encontradas;
- generar flexiones;
- irregularidades;
- tildes;
- variantes regionales.

---

# 91. Sense

Pendiente:

- granularidad;
- jerarquía;
- subsentidos;
- sentido pedagógico;
- merging de fuentes;
- revisión editorial;
- sense IDs estables.

---

# 92. Multiword / Occurrence Parts

Resuelto:

- una Occurrence puede tener `1..N OccurrencePart`;
- las parts pueden ser discontinuas;
- cada part referencia `TextAnchor`;
- `TextAnchor` puede seleccionar parte de un token ortográfico;
- roles lexicales: `HEAD`, `FIXED`, `CLITIC`;
- roles construccionales: `ANCHOR`, `SLOT`;
- material intermedio no se convierte en part;
- una MWE lexicalizada no obliga a crear learner occurrences para sus componentes;
- anotaciones morfológicas, léxicas y construccionales pueden solaparse por capa.

Pendiente:

- si necesitamos roles adicionales después de probar un corpus real;
- comportamiento exacto ante elisiones;
- variantes históricas o dialectales complejas.

---

# 92A. Verbos pronominales

Resuelto:

- no existe una clase separada `PronominalVerb`;
- `Pronominality` pertenece a `Lexeme`;
- valores iniciales: `NONE`, `OBLIGATORY`, `LEXICALIZED_ALTERNANT`;
- canonical form de Lexeme pronominal usa `-se`;
- el clítico superficial concuerda y no está fijado a la cadena `se`;
- `IR` e `IRSE` pueden ser Lexemes diferentes;
- reflexividad productiva no crea Lexeme pronominal por defecto;
- reciprocidad productiva no crea Lexeme pronominal por defecto;
- middle/anticausative, passive-se e impersonal-se pertenecen primariamente a Construction/CliticAnalysis;
- `CliticFunction` diferencia usos;
- proclisis y enclisis se representan con `TextAnchor + OccurrencePart`.

Pendiente:

- catálogo editorial inicial de verbos que serán `LEXICALIZED_ALTERNANT`;
- reglas automáticas de sugerencia NLP;
- política específica para alternancias graduales (`quedar(se)`, `morir(se)`, etc.).

---

# 93. Morphosyntax

Pendiente:

- formato interno;
- dependencia de UD;
- representación de tiempos compuestos;
- ambigüedad de persona;
- perífrasis verbales;
- voz;
- aspecto;
- modalidad;
- formas no personales;
- concordancia.

---

# 94. Learner Model

Resuelto:

- `LearnerEvent` es la fuente histórica de verdad;
- `UserLexemeState` es una proyección reconstruible;
- `mastery` debe estar versionado si se materializa;
- el event log debe obedecer minimización de datos.

Pendiente:

- qué eventos guardar;
- política exacta de inmutabilidad/corrección;
- materialización y reconstrucción;
- estado manual;
- mastery;
- sense mastery;
- olvido;
- repetición;
- exposición incidental;
- retención;
- borrado;
- exportación;
- permisos del profesor;
- tratamiento de menores.

---

# 95. Dictionary Data

Pendiente:

- Kaikki/Wiktextract;
- Tatoeba;
- otras fuentes abiertas;
- licencias;
- atribución;
- limpieza;
- traducciones;
- calidad;
- cobertura.

---

# PARTE XVI — FUENTES CONCEPTUALES

# 96. Real Academia Española / ASALE

La nomenclatura verbal española deberá seguir prioritariamente la terminología académica actual.

Referencias principales:

- RAE/ASALE — Nueva gramática: pretérito perfecto simple  
  https://www.rae.es/gram%C3%A1tica/sintaxis/el-pret%C3%A9rito-perfecto-simple-cant%C3%A9

- RAE/ASALE — Nueva gramática: pretérito imperfecto  
  https://www.rae.es/gram%C3%A1tica/sintaxis/el-pret%C3%A9rito-imperfecto-cantaba-i-informaci%C3%B3n-de%C3%ADctica-e-informaci%C3%B3n-aspectual

- RAE/ASALE — Nueva gramática: pretérito perfecto compuesto  
  https://www.rae.es/gram%C3%A1tica/sintaxis/el-pret%C3%A9rito-perfecto-compuesto-he-cantado-i-relevancia-actual-de-los-hechos-pret%C3%A9ritos

- RAE — Glosario de términos gramaticales  
  https://www.rae.es/gtg/

---

# 97. Universal Dependencies

Se utilizará como referencia de interoperabilidad morfosintáctica.

Referencia:

https://universaldependencies.org/u/overview/morphology.html

Especialmente útil para:

```text
lemma
POS
VerbForm
Mood
Person
Number
Gender
Tense
morphological features
```

Pero sus etiquetas no sustituyen la taxonomía pedagógica específica de los tiempos verbales españoles.

---

# 98. OntoLex-Lemon

Referencia conceptual para separar:

```text
Lexical Entry / Lexeme
Form
Sense
```

Referencia:

https://www.w3.org/2016/05/ontolex/

No implica que el proyecto utilizará RDF.

Se utiliza como modelo conceptual de referencia.

---

# 98A. RAE/ASALE — verbos pronominales y clíticos

Referencias conceptuales para esta revisión:

- DPD — pronombres personales átonos  
  https://www.rae.es/dpd/pronombres%20personales%20%C3%A1tonos

- DPD — `se`  
  https://www.rae.es/dpd/se

- Nueva gramática — verbos pronominales  
  https://www.rae.es/gram%C3%A1tica/sintaxis/las-construcciones-medias-i-los-verbos-pronominales

- DPD — `ir(se)`  
  https://www.rae.es/dpd/ir

Estas referencias sustentan, entre otros puntos:

- que los pronombres átonos pueden formar parte de verbos pronominales;
- que existen verbos exclusivamente pronominales y usos pronominales con matices propios;
- que los clíticos alternan entre proclisis y enclisis;
- que la forma canónica en `-se` no implica una realización superficial fija de `se`.

---

# 99. Plan Curricular del Instituto Cervantes

Referencia curricular principal para ELE:

https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/indice.htm

Será útil para:

- niveles;
- gramática;
- funciones;
- nociones;
- marcadores discursivos;
- componentes léxico-semánticos;
- progresión curricular.

---


# 99A. Referencias arquitectónicas para evolución histórica

La estrategia de esta sección es una decisión arquitectónica propia, pero se apoya en dos principios ampliamente utilizados:

## Event Sourcing

Martin Fowler describe Event Sourcing como un enfoque en el que el estado actual puede derivarse procesando el historial de eventos.

Referencia:

https://martinfowler.com/eaaDev/EventSourcing.html

Nuestro diseño no exige implementar toda la aplicación con Event Sourcing. El principio se aplica específicamente a:

```text
LearnerEvent
→ historial inmutable
→ proyecciones reconstruibles
```

## Datos temporales / históricos en PostgreSQL

La documentación moderna de PostgreSQL distingue entre historia del mundo modelado y la historia del estado reconocido por la base de datos mediante conceptos temporales.

Referencia:

https://www.postgresql.org/docs/current/ddl-temporal-tables.html

No se adopta todavía una implementación SQL temporal concreta. La referencia es pertinente para el futuro `data-model.md`, donde deberá decidirse cómo persistir:

```text
LexiconRelease
OccurrenceAnnotationRevision
EditorialRevision
LexemeLineageEvent
```

## OntoLex-Lemon

OntoLex mantiene separadas las identidades léxicas, sus formas y sentidos; esta separación facilita que nuestra evolución de identidad no se reduzca a modificar una cadena de texto.

Referencia:

https://www.w3.org/2016/05/ontolex/

---

# PARTE XVII — DECISIONES PROVISIONALES

# 100. Decisiones aceptadas en v0.1

## D-001

```text
Token ≠ Lexeme
```

## D-002

```text
Form ≠ Lexeme
```

## D-003

```text
Lexeme ≠ Sense
```

## D-004

```text
Sense ≠ Translation
```

## D-005

Una expresión multiword puede ser tratada como Lexeme cuando funciona como unidad léxica.

## D-006

Las construcciones productivas se separarán conceptualmente de los Lexemes.

## D-007

`StoryOccurrence` representa una interpretación contextual, no simplemente un token.

## D-008

`StoryOccurrence` podrá apuntar a un Sense, pero el Sense puede permanecer sin resolver inicialmente.

## D-009

El diccionario visible será una proyección compuesta, no una única entidad monolítica.

## D-010

Estado declarado y mastery serán conceptos separados.

## D-011

El sistema deberá poder evolucionar desde `UserLexemeState` hacia `UserSenseState`.

## D-012

Los datos externos deben preservar provenance.

## D-013

El NLP automático debe poder ser revisado.

## D-014

Los tiempos verbales españoles tendrán una representación pedagógica específica.

## D-015

`Tense=Past` podrá conservarse como rasgo NLP normalizado, pero no será suficiente para describir el tiempo verbal español.

## D-016

Una `Occurrence` estará formada conceptualmente por `1..N OccurrencePart` y podrá ser discontinua.

## D-017

`POS` es obligatorio en `Lexeme` y un cambio de POS implica un Lexeme distinto por defecto.

## D-018

La firma lingüística de un Lexeme no será su primary key física.

## D-019

Las anotaciones morfológicas, léxicas y construccionales pueden solaparse.

## D-020

Un componente de una expresión lexicalizada no genera automáticamente una `Learner LexicalOccurrence` independiente.

## D-021

Toda occurrence tendrá un estado de resolución semántica:

```text
NOT_REQUIRED
UNRESOLVED
RESOLVED
```

## D-022

Una occurrence `UNRESOLVED` nunca podrá presentarse como ejemplo confirmado del mismo sentido.

## D-023

Los datos importados deberán conservar un `SourceSnapshot` y toda modificación editorial relevante deberá ser auditable mediante `EditorialRevision` o mecanismo equivalente.

## D-024

`LearnerEvent` es la fuente histórica de verdad; los estados actuales son proyecciones reconstruibles.

## D-025

Las fuentes curriculares producirán `CurricularAssertion` independientes; la plataforma podrá mantener una `EffectiveCurricularDecision`.

## D-026

`PedagogicalRole` publicado es una decisión editorial; una inferencia automática solo puede ser una sugerencia.

## D-027

`LearnerEvent` estará sujeto a minimización, retención, borrado, exportación y control de acceso.


## D-028

`OccurrencePart` se ancla mediante `TextAnchor` basado en offsets de caracteres sobre una versión inmutable del texto.

## D-029

Un `TextAnchor` puede cubrir una parte de un token ortográfico.

## D-030

Los roles de una `LexicalOccurrence` son inicialmente:

```text
HEAD
FIXED
CLITIC
```

## D-031

Los roles de una `ConstructionOccurrence` son inicialmente:

```text
ANCHOR
SLOT
```

## D-032

`HomographGroup` agrupa Lexemes homógrafos para análisis, pero no constituye una unidad de aprendizaje ni comparte estado del estudiante.

## D-033

Misma forma canónica + mismo POS no garantiza mismo Lexeme.

## D-034

Por defecto:

```text
polysemy → Sense dentro del mismo Lexeme
homonymy → Lexemes separados
```

## D-035

`Pronominality` es una propiedad de identidad de `Lexeme` con valores iniciales:

```text
NONE
OBLIGATORY
LEXICALIZED_ALTERNANT
```

## D-036

Los Lexemes pronominales usan `-se` en su forma canónica, pero el clítico superficial se realiza según persona, número y colocación.

## D-037

Un uso reflexivo o recíproco productivo no crea un Lexeme pronominal separado por defecto.

## D-038

`PASSIVE_SE` e `IMPERSONAL_SE` no forman parte de la identidad de un Lexeme pronominal.

## D-039

Se adopta una taxonomía mínima de `CliticFunction`:

```text
LEXICAL_PRONOMINAL
REFLEXIVE
RECIPROCAL
MIDDLE_ANTICAUSATIVE
PASSIVE_SE
IMPERSONAL_SE
INDIRECT_OBJECT_SE
OTHER
```

## D-040

`IR` e `IRSE` pueden representarse como Lexemes separados relacionados mediante `PRONOMINAL_COUNTERPART_OF`.

## D-041

El caso `vete` es test arquitectónico obligatorio: debe permitir HEAD y CLITIC dentro del mismo token ortográfico.


## D-042

Un `lexeme_id` publicado es una identidad histórica inmutable y nunca será reutilizado para significar otra unidad.

## D-043

`split` y `merge` crean nuevos Lexemes y preservan los Lexemes fuente como `SUPERSEDED`.

## D-044

Se introduce `LexemeLineageEvent` con operaciones mínimas:

```text
SPLIT
MERGE
REPLACED_BY
RETIRE
```

## D-045

El grafo de lineage debe ser acíclico.

## D-046

Se introduce `LexiconRelease` para versionar la interpretación lexical activa.

## D-047

`StoryOccurrence` mantiene identidad estable durante una reanotación lexical; la asignación activa se versiona mediante `OccurrenceAnnotationRevision`.

## D-048

`LearnerEvent` nunca se reescribe debido a un split/merge.

## D-049

Se introduce `LearnerEventAttribution` como proyección entre un evento histórico y el Lexeme activo al que contribuye en una `LexiconRelease`.

## D-050

Después de un split, un `LearnerEvent` puede contribuir como máximo a uno de los Lexemes hijos.

## D-051

Si un evento histórico no puede atribuirse inequívocamente después de un split:

```text
attribution_status = AMBIGUOUS_LEGACY
effective_lexeme = null
```

y no contribuye al mastery de ningún hijo.

## D-052

Todo evento léxico originado en una Story debería conservar `occurrence_id`.

## D-053

Un merge distingue:

```text
EQUIVALENT_IDENTITY
COARSENING
```

## D-054

Se introducen políticas conceptuales de transferencia:

```text
CONTEXTUAL
FULL_EQUIVALENT
EVIDENCE_ONLY
NONE
```

## D-055

Contadores y mastery nunca se copian durante split/merge; se reconstruyen desde `LearnerEvent` + attribution.

## D-056

Toda proyección afectada por identidad lexical debe conservar:

```text
lexicon_release
projection_algorithm_version
calculated_at
event_cutoff
```

## D-057

Los IDs legacy permanecen resolubles.

En un merge pueden resolver al sucesor único; en un split no pueden redirigir silenciosamente a uno de varios hijos.

## D-058

Los errores de lineage se corrigen mediante nuevos eventos, no borrando lineage histórico.

## D-059

Un split/merge requiere impact analysis y publicación explícita de una nueva `LexiconRelease`.

---

# 101. Ejemplo canónico que acompañará todo el diseño

El siguiente caso será utilizado para comprobar futuras decisiones:

```text
Story:
Ayer Marta comió arroz con su familia.
```

Debe poder recorrer:

```text
Story
 ↓
Sentence
 ↓
Token "comió"
 ↓
MorphologicalAnalysis
   lemma = comer
   mood = indicative
   person = 3
   number = singular
   spanish_verb_tense = PRETERITO_PERFECTO_SIMPLE
 ↓
StoryOccurrence
 ↓
Lexeme COMER
 ↓
Sense INGEST_FOOD
 ↓
Translation "to eat"
 ↓
Example
 ↓
Student opens word
 ↓
LearnerEvent
 ↓
Student selects LEARNING
 ↓
UserLexemeState
 ↓
future retrieval
```

---

# 102. Casos canónicos adicionales

El modelo deberá sobrevivir además a:

```text
llevaba
→ PRETERITO_IMPERFECTO

ha llevado
→ PRETERITO_PERFECTO_COMPUESTO

banco
→ two senses

vino
→ noun vs verb

darse cuenta
→ multiword lexeme

llevar + gerundio
→ construction
```

Si una futura propuesta de base de datos no puede representar limpiamente estos casos, deberá rechazarse o revisarse.

---

# PARTE XVIII — SIGUIENTE FASE

# 103. Próximo documento

Después de revisar y aprobar esta especificación:

```text
docs/data-model.md
```

deberá convertir el dominio en un modelo relacional.

Orden:

```text
1. Revisar entidades
2. Revisar invariantes
3. Construir ERD conceptual
4. Determinar qué conceptos requieren tablas
5. Diseñar PostgreSQL
6. Definir constraints
7. Definir índices
8. Diseñar migraciones
9. Crear tipos TypeScript
10. Definir contratos
```

---

# 104. Preguntas que deben resolverse antes de PostgreSQL

Ya resueltas a nivel de dominio:

```text
✓ split/merge preserva IDs históricos mediante LexemeLineageEvent
✓ LearnerEvent nunca se reescribe
✓ StoryOccurrence se reanota mediante revisions
✓ split ambiguo no duplica progreso
✓ merge agrega eventos, no contadores
✓ LexiconRelease versiona la interpretación activa
✓ Occurrence puede ser discontinua mediante 1..N OccurrencePart
✓ OccurrencePart utiliza TextAnchor por offsets de caracteres
✓ un part puede seleccionar un fragmento dentro de un token
✓ roles lexicales HEAD / FIXED / CLITIC
✓ roles construccionales ANCHOR / SLOT
✓ POS es obligatorio en Lexeme
✓ cambio de POS implica Lexeme distinto por defecto
✓ same canonical form + same POS no garantiza identidad
✓ HomographGroup permite agrupar sin fusionar
✓ polisemia y homonimia tienen políticas diferentes
✓ Pronominality forma parte de Lexeme cuando es lexical
✓ verbos pronominales no dependen de la cadena fija "se"
✓ reflexividad/reciprocidad productivas no crean Lexeme por defecto
✓ passive-se / impersonal-se son construccionales
✓ las capas de anotación pueden solaparse
✓ componentes de MWE no generan automáticamente learner occurrences
✓ Sense tiene estado NOT_REQUIRED / UNRESOLVED / RESOLVED
✓ LearnerEvent es la fuente histórica de verdad
✓ se requiere historial editorial
✓ las fuentes curriculares no se fusionan silenciosamente
```

Pendientes especialmente:

1. ¿Qué campos concretos necesita `HomographGroup`?
2. ¿Necesitamos una entidad explícita para componentes canónicos de una MWE?
3. ¿Cómo representamos Sense y su jerarquía?
4. ¿Qué granularidad semántica utilizamos?
5. ¿Qué diferencias operativas habrá entre Lexeme y Construction?
6. ¿Qué información morfológica se persiste?
7. ¿Cómo modelamos tiempos verbales compuestos?
8. ¿Qué eventos del estudiante son obligatorios?
9. ¿Cómo se materializa/reconstruye `UserLexemeState`?
10. ¿Mastery se persiste o se calcula bajo demanda?
11. ¿UserSenseState entra desde MVP o posteriormente?
12. ¿Cómo implementamos `SourceSnapshot` y `EditorialRevision`?
13. ¿Cómo preservamos licencia y provenance?
14. ¿Cómo se define retención/borrado/exportación de `LearnerEvent`?
15. ¿Cómo validamos una Story antes de publicarla?
16. ¿Qué alternancias pronominales se incluyen inicialmente en el lexicón curado?
17. ¿Qué estrategia NLP utilizamos para distinguir `CliticFunction`?
18. ¿Cómo representamos el mapeo entre `SurfaceToken` y unidades sintácticas cuando una palabra ortográfica contiene varios componentes?
19. ¿Cómo versionamos offsets/anotaciones cuando una Story es editada?

---
# 105. Estado del Lexical Engine

```text
[✓] Propósito
[✓] Límites
[✓] Capas lingüísticas
[✓] StoryVersion concept
[✓] SurfaceToken
[✓] Span
[✓] TextAnchor
[✓] subtoken anchoring
[✓] OccurrencePart como abstracción obligatoria
[✓] Occurrences discontinuas
[✓] LexicalOccurrencePart roles: HEAD / FIXED / CLITIC
[✓] ConstructionOccurrencePart roles: ANCHOR / SLOT
[✓] Política de solapamientos
[✓] POS obligatorio en Lexeme
[✓] Identidad de Lexeme dentro del mismo POS
[✓] HomographGroup
[✓] política polisemia vs homonimia
[✓] Pronominality
[✓] formalización de verbos pronominales
[✓] CliticFunction
[✓] proclisis/enclisis compatible con el modelo
[✓] LexemeForm
[✓] Sense
[✓] SenseResolutionStatus
[✓] Translation
[✓] Definition
[✓] Multiword concept
[✓] Construction concept
[✓] StoryOccurrence
[✓] Dictionary as projection
[✓] Provenance concept
[✓] SourceSnapshot concept
[✓] EditorialRevision concept
[✓] CurricularAssertion concept
[✓] EffectiveCurricularDecision concept
[✓] PedagogicalRole authority
[✓] LearnerEvent as source of truth
[✓] UserLexemeState as rebuildable projection
[✓] UserSenseState concept
[✓] LearnerEvent privacy/retention questions
[✓] Spanish-specific verbal tense layer
[✓] canonical discontinuity test
[✓] canonical overlap test
[✓] canonical same-POS homograph test
[✓] canonical pronominal-vs-reflexive test
[✓] canonical enclitic subtoken test

[✓] Split/merge historical policy for Lexeme
[✓] LexemeLifecycleStatus
[✓] LexemeLineageEvent
[✓] LexiconRelease
[✓] OccurrenceAnnotationRevision
[✓] LearnerEventAttribution
[✓] ambiguous legacy attribution policy
[✓] merge semantics / transfer policy
[✓] legacy ID resolution
[ ] Final Sense granularity policy
[ ] Final construction representation
[ ] Final morphology persistence policy
[ ] Final learner event taxonomy
[ ] Mastery model
[ ] Retention/deletion policy
[ ] Story annotation validation contract
[ ] ERD
[ ] PostgreSQL schema
[ ] TypeScript types
[ ] NLP contracts
```

---

# 106. Principio final de esta fase

Antes de escribir SQL:

> **Debemos poder explicar lingüísticamente qué representa cada objeto sin mencionar tablas, columnas ni claves foráneas.**

Con la política de split/merge resuelta, ya no existe un bloqueo de identidad histórica para comenzar el ERD conceptual.

Solo cuando las preguntas restantes de persistencia estén delimitadas deberá traducirse el dominio a PostgreSQL y TypeScript.
