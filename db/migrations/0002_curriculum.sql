-- Curriculum topology (features/curriculum): CurriculumRelease, Module,
-- Island, StoryBlueprint, CurriculumTarget, RecycleEdge.
--
-- References lexemes/senses from 0001 (a target may name either); this file
-- must run after 0001.

CREATE TABLE curriculum_releases (
  release_id     TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  data           JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modules (
  id                    TEXT PRIMARY KEY,
  curriculum_release_id TEXT NOT NULL REFERENCES curriculum_releases(release_id),
  "order"               INT NOT NULL,
  name                  TEXT NOT NULL,
  data                  JSONB NOT NULL,
  UNIQUE (curriculum_release_id, "order")
);

CREATE TABLE islands (
  id                    TEXT PRIMARY KEY,
  module_id             TEXT NOT NULL REFERENCES modules(id),
  curriculum_release_id TEXT NOT NULL REFERENCES curriculum_releases(release_id),
  global_island_order   INT NOT NULL,
  data                  JSONB NOT NULL,
  UNIQUE (curriculum_release_id, global_island_order)
);
CREATE INDEX idx_islands_module ON islands(module_id);

CREATE TABLE story_blueprints (
  id             TEXT PRIMARY KEY,
  module_id      TEXT NOT NULL REFERENCES modules(id),
  island_id      TEXT NOT NULL REFERENCES islands(id),
  sequence_index INT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('NARRATIVE','INTEGRATION','CAPSTONE')),
  data           JSONB NOT NULL,
  UNIQUE (module_id, sequence_index)
);
CREATE INDEX idx_story_blueprints_island ON story_blueprints(island_id);

-- One row per published first introduction. `target_id` is UNIQUE: a target
-- is introduced exactly once (docs/data-model.md SS"CurriculumTarget").
CREATE TABLE curriculum_targets (
  allocation_id               TEXT PRIMARY KEY,
  target_type                 TEXT NOT NULL CHECK (target_type IN ('SENSE','MWU_SOURCE_UNIT','GRAMMAR_UNIT')),
  target_id                   TEXT NOT NULL UNIQUE,
  lexeme_id                   TEXT NULL REFERENCES lexemes(id),
  sense_id                    TEXT NULL REFERENCES senses(id),
  intro_salience               TEXT NOT NULL CHECK (intro_salience IN ('FOCUS','SUPPORTED')),
  first_introduction_story_id TEXT NOT NULL REFERENCES story_blueprints(id),
  regional_policy              TEXT NULL,
  data                         JSONB NOT NULL
);
CREATE INDEX idx_targets_intro_story ON curriculum_targets(first_introduction_story_id);

CREATE TABLE recycle_edges (
  id                    TEXT PRIMARY KEY,
  target_type           TEXT NOT NULL CHECK (target_type IN ('SENSE','MWU_SOURCE_UNIT','GRAMMAR_UNIT')),
  target_id             TEXT NOT NULL REFERENCES curriculum_targets(target_id),
  introduction_story_id TEXT NOT NULL REFERENCES story_blueprints(id),
  return_stage          TEXT NOT NULL CHECK (return_stage IN ('FIRST_RETURN','SECOND_RETURN','THIRD_RETURN')),
  return_story_id       TEXT NOT NULL REFERENCES story_blueprints(id),
  data                  JSONB NOT NULL
);
CREATE INDEX idx_recycle_edges_target ON recycle_edges(target_id);
CREATE INDEX idx_recycle_edges_return_story ON recycle_edges(return_story_id);
