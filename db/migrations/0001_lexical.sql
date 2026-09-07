-- Lexical inventory (features/lexical-engine + the lexical objects
-- features/curriculum publishes: Lexeme, LexemeForm, Sense, MwuUnit,
-- GrammarUnit, SourceAssertion). Ordered first because curriculum_targets
-- (0002) and story_occurrences (0003) reference lexemes/senses/forms by
-- published id.
--
-- Every "published domain id" column (lexeme_id, sense_id, ...) is TEXT and
-- carries the exact published id (e.g. "LEX-A1-000001") as its PRIMARY KEY.
-- This is the database identity for these rows -- there is no separate
-- surrogate integer PK anywhere in this schema: see docs/data-model.md
-- SS4.1 for why a serial/UUID substitute is never used as a public identity.
--
-- `data JSONB` on every table carries every published field this schema does
-- not promote to its own column. Promoted columns are exactly the ones a
-- constraint, a foreign key or an index in this migration set needs; nothing
-- else is duplicated out of `data` by hand. See docs/data-model.md SS3.

CREATE TABLE lexicon_releases (
  release_id            TEXT PRIMARY KEY,
  curriculum_release_id TEXT NOT NULL,
  schema_version        TEXT NOT NULL,
  data                  JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lexemes (
  id       TEXT PRIMARY KEY,
  lemma    TEXT NOT NULL,
  type     TEXT NOT NULL,
  data     JSONB NOT NULL
);

CREATE TABLE lexeme_forms (
  id         TEXT PRIMARY KEY,
  lexeme_id  TEXT NOT NULL REFERENCES lexemes(id),
  surface    TEXT NOT NULL,
  data       JSONB NOT NULL
);
CREATE INDEX idx_lexeme_forms_lexeme ON lexeme_forms(lexeme_id);

CREATE TABLE senses (
  id       TEXT PRIMARY KEY,
  lexeme_id TEXT NOT NULL REFERENCES lexemes(id),
  status   TEXT NOT NULL,
  is_a1    BOOLEAN NOT NULL,
  data     JSONB NOT NULL
);
CREATE INDEX idx_senses_lexeme ON senses(lexeme_id);

-- Only 44/214 MWUs carry a lexeme id; the other 170 are published with none
-- (NO_LEXICAL_IDENTITY, see features/lexical-engine) -- lexeme_id is
-- nullable by design, never back-filled.
CREATE TABLE mwu_units (
  id        TEXT PRIMARY KEY,
  lexeme_id TEXT NULL REFERENCES lexemes(id),
  sense_id  TEXT NULL REFERENCES senses(id),
  data      JSONB NOT NULL
);
CREATE INDEX idx_mwu_units_lexeme ON mwu_units(lexeme_id) WHERE lexeme_id IS NOT NULL;

CREATE TABLE grammar_units (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE source_assertions (
  id        TEXT PRIMARY KEY,
  sense_id  TEXT NULL REFERENCES senses(id),
  lexeme_id TEXT NULL REFERENCES lexemes(id),
  data      JSONB NOT NULL
);
CREATE INDEX idx_source_assertions_sense ON source_assertions(sense_id) WHERE sense_id IS NOT NULL;

-- Lexeme lineage (SPLIT/MERGE/REPLACED_BY/RETIRE). Acyclicity and cardinality
-- are re-derived application-side (features/lexical-engine's own
-- validateLineage) inside the same transaction as any insert here -- see
-- docs/persistence.md SS"Lineage" and section 44 of the governing plan: a plain
-- FK/CHECK cannot express "the source/target graph has no cycle."
CREATE TABLE lexeme_lineage_events (
  id                TEXT PRIMARY KEY,
  kind              TEXT NOT NULL CHECK (kind IN ('SPLIT','MERGE','REPLACED_BY','RETIRE')),
  source_lexeme_ids TEXT[] NOT NULL,
  target_lexeme_ids TEXT[] NOT NULL,
  semantics         TEXT NOT NULL CHECK (semantics IN ('EQUIVALENT_IDENTITY','COARSENING')),
  transfer_policy   TEXT NOT NULL CHECK (transfer_policy IN ('FULL_EQUIVALENT','CONTEXTUAL','EVIDENCE_ONLY','NONE')),
  effective_release TEXT NOT NULL,
  reason            TEXT NOT NULL CHECK (btrim(reason) <> ''),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lineage_source ON lexeme_lineage_events USING GIN (source_lexeme_ids);
CREATE INDEX idx_lineage_target ON lexeme_lineage_events USING GIN (target_lexeme_ids);
