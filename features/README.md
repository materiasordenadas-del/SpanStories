# Capa técnica / application features

Esta carpeta contiene lógica de aplicación y dominio. Es la autoridad de **comportamiento**, no de apariencia.

Áreas previstas:

- `curriculum/` — registry, módulos, islas, secuenciación y targets;
- `lexical-engine/` — Lexeme, Sense, Form, MWU, StoryOccurrence;
- `story-engine/` — stories, sentences, preprocessing y publicación;
- `learner-progress/` — eventos, estados y proyecciones de progreso.

## Regla de frontera

`features/` puede consumir componentes de `components/visual/` y proporcionarles props.

`components/visual/` no debe importar directamente `features/` ni conocer persistencia, IDs internos o reglas de negocio.

La integración de modelos técnicos con props visuales debe pasar, cuando sea necesario, por `lib/adapters/`.
