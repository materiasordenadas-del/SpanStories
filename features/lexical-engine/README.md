# Lexical Engine feature

Dominio canónico de identidad léxica: `Lexeme`, `LexemeForm`, `Sense`, MWU,
homógrafos, pronominalidad, relaciones léxicas y lineage. No contiene estilos ni
composición visual.

## Frontera pública

```ts
import { loadLexicalEngine } from "@/features/lexical-engine";
```

`features/lexical-engine/index.ts` es el único contrato. La estructura de
archivos por debajo no lo es.

## Identidad de release

```text
Lexical interpretation release   A1-LEXICON-v1.0
Validated curriculum registry    A1-CURRICULUM-v1.51
```

Son espacios de identidad distintos. `LexiconRelease.curriculumReleaseId`
guarda el registry contra el que se validó esta construcción: es una
back-reference de auditoría, no una dependencia ni una fusión de identidades.

La reestructuración 103 → 32 movió esa back-reference de
`A1-CURRICULUM-v1.44` a `A1-CURRICULUM-v1.51` **sin** cambiar el
`LexiconRelease`: resecuenciar la narrativa no creó, fusionó, dividió ni
eliminó ninguna identidad léxica. Un `A1-LEXICON-v1.1` solo se emite cuando
cambia el inventario léxico o su interpretación.

## Qué hace y qué no

Consume el Curriculum Registry de la fase 1 y resuelve identidad léxica sobre
IDs publicados. No reimplementa el registry, no reconstruye IDs, no recalcula
nivel CEFR y no crea Lexemes.

No es todavía Story Engine, Learner Events, mastery, NLP, importación de
diccionario ni persistencia.

## Reglas que el tipo sistema hace cumplir

- Un ID desconocido es `NOT_FOUND`; una colección vacía es `FOUND` con `[]`;
  una MWU sin identidad léxica publicada es `NO_LEXICAL_IDENTITY`. Los tres son
  distintos y ninguno es `undefined`.
- La resolución pasa por IDs publicados, nunca por comparación de superficies.
- `HomographGroup` agrupa por forma canónica, no por forma + POS: A1 solo
  publica homógrafos cross-POS, y usar POS como discriminador impediría
  representar homógrafos same-POS el día que se publiquen.
- La pronominalidad no se infiere de una terminación `-se`. Todos los 599
  lexemas publicados son `UNSPECIFIED` con autoridad `NOT_CLASSIFIED`.
- Un `SPLIT` legacy nunca se resuelve a un hijo arbitrario.

Ver `docs/lexical-engine-implementation.md` para el detalle y la evidencia.
