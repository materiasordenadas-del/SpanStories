# Story Engine feature (engine phase 3)

A versioned, publishable domain for narrative content and its lexical/
grammatical annotations. See `docs/story-engine-implementation.md` for the
full design rationale; this file is the short orientation.

## Public boundary

Import from [`index.ts`](./index.ts). The file layout below it (`domain/`,
`engine/`, `validation/`, `repository/`, `runtime/`, `fixtures/`) is not a
contract.

## What phase 3 is

```text
StoryBlueprint (curriculum)
      |  planning contract, referenced not reused as id
      v
Story -> StoryVersion (immutable once published) -> StorySentence[]
                                                        |
                                                    TextAnchor  [start, end)
                                                        |
                                              StoryOccurrence (LEXICAL | CONSTRUCTION)
                                                        |
                                                 OccurrencePart[] (HEAD/FIXED/CLITIC
                                                                    or ANCHOR/SLOT)
                                                        |
                                       OccurrenceAnnotationRevision (reannotation,
                                                     occurrence id stays stable)

Story --------------------------------------- StoryTargetBinding
                                       (FIRST_INTRO / FIRST_RETURN /
                                        SECOND_RETURN / THIRD_RETURN,
                                        cross-checked against curriculum)

StoryVersion + occurrences + bindings --> validateStoryPublication()
                                           (must be VALID before publish)
```

- `Story.storyBlueprintId` is nullable: a curricular Story always carries one,
  but a technical fixture (see `fixtures/la-compra-olvidada.ts`) does not, and
  the publication validator refuses to publish a Story with no blueprint
  (`STORY_HAS_NO_BLUEPRINT`) — a fixture can never be mistaken for one of the
  32 canonical stories.
- `TextAnchor` offsets are Unicode **code points**, half-open `[start, end)`.
  See `domain/anchors.ts`.
- An occurrence's `parts` may be discontinuous (a gap between two parts is
  allowed; an overlap is not) and may cover only part of one orthographic
  token (`"vete"` -> `"ve"` + `"te"`).
- Reannotating an occurrence never changes its id — it adds an
  `OccurrenceAnnotationRevision`. See `engine/annotation-revision.ts`.
- A published `StoryVersion`'s text never changes in place. New text is
  always a new version; `repository/story-repository.ts` has no
  "update version" method at all.

## What phase 3 does not do

NLP as authority, automatic Story generation, authoring the 32 canonical A1
stories, mastery/spaced repetition, PostgreSQL persistence, or any UI
redesign. See `docs/architecture/plan-implementacion-motor-v1.0.md` §5.

## Tests

`__tests__/*.test.ts`, run via `npm test`. Identity/publication tests assert
against the real committed `A1-CURRICULUM-v1.51` registry (same convention as
`features/curriculum` and `features/lexical-engine`); corruption/determinism
tests use the synthetic builders in `__tests__/fixtures.ts`.
