-- Story Engine (features/story-engine, engine phase 3): Story, StoryVersion,
-- StorySentence, TextAnchor, StoryOccurrence, OccurrencePart,
-- OccurrenceAnnotationRevision, StoryTargetBinding.
--
-- Every technical id here (story-*, storyver-*, anchor-*, occ-*, part-*,
-- rev-*, bind-*) keeps the exact prefix convention
-- features/story-engine/domain/ids.ts enforces in TypeScript -- the database
-- does not re-derive or reformat these ids.

CREATE TABLE stories (
  id                 TEXT PRIMARY KEY,
  -- Nullable: a technical fixture (features/story-engine/fixtures/) has no
  -- StoryBlueprint and can never be published -- see
  -- docs/story-engine-implementation.md SS2.2.
  story_blueprint_id TEXT NULL REFERENCES story_blueprints(id),
  status             TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A published StoryVersion's `text`/`title` never change once written --
-- there is no application code path that issues UPDATE ... SET text = ... on
-- a row here (see features/persistence/repository/postgres-story-repository.ts:
-- `saveNewVersion` INSERTs a new row; `markPublished` UPDATEs only status and
-- published_at). `immutable_after_publish` is enforced a second time at the
-- database level by the trigger below, so a bug in application code cannot
-- silently rewrite published narrative text.
CREATE TABLE story_versions (
  id             TEXT PRIMARY KEY,
  story_id       TEXT NOT NULL REFERENCES stories(id),
  version_number INT NOT NULL,
  title          TEXT NOT NULL,
  text           TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ NULL,
  UNIQUE (story_id, version_number)
);
CREATE INDEX idx_story_versions_story ON story_versions(story_id);

CREATE OR REPLACE FUNCTION forbid_published_text_change() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' AND (NEW.text IS DISTINCT FROM OLD.text OR NEW.title IS DISTINCT FROM OLD.title) THEN
    RAISE EXCEPTION 'STORY_VERSION_TEXT_IMMUTABLE: story_versions.% is PUBLISHED; publish a new version instead of editing this one', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_story_versions_immutable
  BEFORE UPDATE ON story_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_published_text_change();

CREATE TABLE story_sentences (
  id              TEXT PRIMARY KEY,
  story_version_id TEXT NOT NULL REFERENCES story_versions(id),
  "order"         INT NOT NULL,
  text            TEXT NOT NULL,
  UNIQUE (story_version_id, "order")
);
CREATE INDEX idx_story_sentences_version ON story_sentences(story_version_id);

-- Offsets are Unicode code points, half-open [start, end) -- see
-- features/story-engine/domain/anchors.ts. `end_offset > start_offset`
-- mirrors ANCHOR_EMPTY_OR_INVERTED; bounds-within-sentence-length is not a
-- column PostgreSQL can check without reading the sentence text, so it stays
-- an application-level check (features/story-engine's own
-- validateAnchorBounds / the publication validator), re-run here in
-- features/persistence's story repository before insert.
CREATE TABLE text_anchors (
  id               TEXT PRIMARY KEY,
  story_version_id TEXT NOT NULL REFERENCES story_versions(id),
  sentence_id      TEXT NOT NULL REFERENCES story_sentences(id),
  start_offset     INT NOT NULL,
  end_offset       INT NOT NULL,
  CHECK (end_offset > start_offset AND start_offset >= 0)
);
CREATE INDEX idx_text_anchors_sentence ON text_anchors(sentence_id);

CREATE TABLE story_occurrences (
  id                       TEXT PRIMARY KEY,
  story_version_id         TEXT NOT NULL REFERENCES story_versions(id),
  sentence_id              TEXT NOT NULL REFERENCES story_sentences(id),
  kind                     TEXT NOT NULL CHECK (kind IN ('LEXICAL','CONSTRUCTION')),
  surface                  TEXT NOT NULL,
  lexeme_id                TEXT NULL REFERENCES lexemes(id),
  sense_id                 TEXT NULL REFERENCES senses(id),
  lexeme_form_id           TEXT NULL REFERENCES lexeme_forms(id),
  sense_resolution_status  TEXT NULL CHECK (sense_resolution_status IN ('NOT_REQUIRED','UNRESOLVED','RESOLVED')),
  construction_id          TEXT NULL,
  CHECK (
    (kind = 'LEXICAL' AND lexeme_id IS NOT NULL AND construction_id IS NULL) OR
    (kind = 'CONSTRUCTION' AND construction_id IS NOT NULL AND lexeme_id IS NULL)
  )
);
CREATE INDEX idx_occurrences_version ON story_occurrences(story_version_id);
CREATE INDEX idx_occurrences_lexeme ON story_occurrences(lexeme_id) WHERE lexeme_id IS NOT NULL;
CREATE INDEX idx_occurrences_sense ON story_occurrences(sense_id) WHERE sense_id IS NOT NULL;

CREATE TABLE occurrence_parts (
  id            TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES story_occurrences(id),
  anchor_id     TEXT NOT NULL REFERENCES text_anchors(id),
  role          TEXT NOT NULL CHECK (role IN ('HEAD','FIXED','CLITIC','ANCHOR','SLOT')),
  "order"       INT NOT NULL,
  slot_label    TEXT NULL,
  UNIQUE (occurrence_id, "order")
);
CREATE INDEX idx_occurrence_parts_occurrence ON occurrence_parts(occurrence_id);

CREATE TABLE occurrence_annotation_revisions (
  id                    TEXT PRIMARY KEY,
  occurrence_id         TEXT NOT NULL REFERENCES story_occurrences(id),
  previous_lexeme_id    TEXT NULL REFERENCES lexemes(id),
  new_lexeme_id         TEXT NULL REFERENCES lexemes(id),
  previous_sense_id     TEXT NULL REFERENCES senses(id),
  new_sense_id          TEXT NULL REFERENCES senses(id),
  reason                TEXT NOT NULL,
  lexicon_release_id    TEXT NOT NULL,
  editorial_reference   TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_annotation_revisions_occurrence ON occurrence_annotation_revisions(occurrence_id);

CREATE TABLE story_target_bindings (
  id               TEXT PRIMARY KEY,
  story_id         TEXT NOT NULL REFERENCES stories(id),
  story_version_id TEXT NOT NULL REFERENCES story_versions(id),
  occurrence_id    TEXT NOT NULL REFERENCES story_occurrences(id),
  target_type      TEXT NOT NULL CHECK (target_type IN ('SENSE','MWU_SOURCE_UNIT','GRAMMAR_UNIT')),
  target_id        TEXT NOT NULL REFERENCES curriculum_targets(target_id),
  binding_kind     TEXT NOT NULL CHECK (binding_kind IN ('FIRST_INTRO','FIRST_RETURN','SECOND_RETURN','THIRD_RETURN')),
  salience         TEXT NULL CHECK (salience IN ('FOCUS','SUPPORTED')),
  productive_claim TEXT NOT NULL CHECK (productive_claim IN ('NONE','CONTEXTUAL','UNIVERSAL')),
  CHECK ((binding_kind = 'FIRST_INTRO') = (salience IS NOT NULL))
);
CREATE INDEX idx_target_bindings_version ON story_target_bindings(story_version_id);
CREATE INDEX idx_target_bindings_target ON story_target_bindings(target_id);
