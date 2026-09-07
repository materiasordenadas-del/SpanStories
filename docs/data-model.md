# Data model — PostgreSQL persistence (engine phase 5)

Persists the domain contracts of phases 1-4 without letting the physical
schema become a second authority. See `docs/persistence.md` for the
database-access decision, the PGlite environment, and how to run it; this
document is the schema itself.

This schema is backend-neutral by construction: the DDL in `db/migrations/`
is plain PostgreSQL, run unmodified against either `@electric-sql/pglite` or
a real networked server via `PgServerDatabase` — see `docs/persistence.md`
§9 for the server-parity harness. Nothing below changed to make that true;
the schema was already backend-agnostic before that adapter existed.

---

## 1. Identity rule

```text
database identity  !=  published curriculum identity
```

Every published domain id (`LEX-A1-000001`, `A1-M01-I05-S1`, `SEQ-A1-000001`,
`story-*`, `storyver-*`, `levt-*`, ...) is a `TEXT PRIMARY KEY`, verbatim.
There is no `serial`/`bigserial`/`uuid` surrogate key anywhere in this
schema, and no table substitutes a row number for a published id in a public
contract. A repository (`features/persistence/repository/*.ts`) reads and
writes these exact strings; the branded TypeScript id types
(`features/*/domain/ids.ts`) are re-applied on the way back out via `asId`,
which re-validates the stored string still matches its kind's format.

## 2. `data JSONB` — what is promoted to a column, and why

Every table (except the pure join/link tables — `occurrence_parts`,
`story_target_bindings`, `learner_events`, `lexeme_lineage_events`, which
have no natural "everything else" bucket) carries a `data JSONB` column with
the full published/domain object. A column is promoted out of `data` and
given its own typed, indexed, constrained slot **only** when this migration
set needs it for a foreign key, a `CHECK`, a `UNIQUE` constraint, or a query
an index in `db/migrations/*.sql` actually serves. Nothing is promoted "for
completeness" — see section 41 of the governing plan: "No es obligatorio
duplicar sin razón todos los JSON generados si existe un diseño más limpio."

This means: reading a row back reconstructs the full domain object from
promoted columns *and* `data` together (see the `to*` mapper functions in
`features/persistence/repository/*.ts`), and `data` is never treated as an
opaque blob nothing else reads — it *is* the record, alongside the columns
that need to be queried, joined or constrained.

## 3. Migration order and why

```text
0001_lexical.sql       lexicon_releases, lexemes, lexeme_forms, senses,
                        mwu_units, grammar_units, source_assertions,
                        lexeme_lineage_events
0002_curriculum.sql    curriculum_releases, modules, islands,
                        story_blueprints, curriculum_targets, recycle_edges
0003_story_engine.sql  stories, story_versions, story_sentences,
                        text_anchors, story_occurrences, occurrence_parts,
                        occurrence_annotation_revisions,
                        story_target_bindings
0004_learner_progress.sql   learners, learner_events
```

`0001` runs before `0002` even though "curriculum" is phase 1 and "lexical"
is phase 2 in the engine roadmap: `curriculum_targets.lexeme_id`/`sense_id`
are foreign keys into `lexemes`/`senses`, so the referenced tables must exist
first. This mirrors section 41 of the governing plan, which itself groups
`Lexeme`/`LexemeForm`/`Sense`/`MwuUnit`/`GrammarUnit`/`SourceAssertion` under
"41.2 Lexical" — the schema follows that grouping, not the TypeScript
module that happens to define these types
(`features/curriculum/domain/model.ts`).

## 4. Constraints that protect structural invariants

| Invariant | Enforced by |
| --- | --- |
| A published id is unique | `PRIMARY KEY` on every id column |
| A target is introduced exactly once | `UNIQUE` on `curriculum_targets.target_id` |
| A story has one version per number | `UNIQUE (story_id, version_number)` on `story_versions` |
| An anchor is a non-empty, non-inverted interval | `CHECK (end_offset > start_offset AND start_offset >= 0)` on `text_anchors` |
| An occurrence's kind matches its identity fields | `CHECK` on `story_occurrences` (`LEXICAL` requires `lexeme_id`, `CONSTRUCTION` requires `construction_id`, never both) |
| A `FIRST_INTRO` binding always carries a salience, no other kind ever does | `CHECK ((binding_kind = 'FIRST_INTRO') = (salience IS NOT NULL))` on `story_target_bindings` |
| A `STATE_DECLARED` event always carries a declared state and a lexeme; an `OCCURRENCE_OPENED` one never carries a declared state | two `CHECK`s on `learner_events` |
| A published `StoryVersion`'s text/title never change once `PUBLISHED` | `BEFORE UPDATE` trigger `forbid_published_text_change` on `story_versions` |
| `learner_events` is append-only, at the database level as well as the application's | `BEFORE UPDATE`/`BEFORE DELETE` triggers `forbid_learner_event_mutation` |
| Lineage has no cycle | **not** a constraint — see §5 |

## 5. Why lineage acyclicity is not a `CHECK` constraint

A `CHECK` constraint evaluates one row against itself (or, with some
trickery, against a fixed query) — it cannot express "the source/target graph
formed by every row in this table has no cycle," because that property
depends on the whole table's content, not one row. Section 44 of the
governing plan anticipates exactly this and asks for
"repository/service transaction validation" instead:
`features/persistence/repository/lineage-repository.ts`'s
`insertLineageEvent` re-runs `features/lexical-engine`'s own
`validateLineage` — the identical function phase 2 uses — over every
existing lineage event plus the candidate, inside the same transaction as
the insert. A cycle fails validation before the `INSERT` ever runs;
`features/persistence/__tests__/lineage.test.ts` proves a direct two-node
cycle (`A -> B`, `B -> A`) is rejected and never reaches the table.

## 6. Known, deliberate gap: `SurfaceToken` has no table

`StorySentence.tokens` always reads back `[]`: no `surface_tokens` table
exists. Nothing published through phase 5 — no test, no fixture, no seed —
ever produces a non-empty token list (see
`docs/story-engine-implementation.md` §8's identical observation about the
TypeScript domain model). Adding a table for a shape nothing writes to it
would be schema speculation; a future phase that actually segments tokens
adds the table then, against a real write path.
