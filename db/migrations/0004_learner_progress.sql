-- Learner Event / Progress Engine (features/learner-progress, engine
-- phase 4): a minimal `learners` table for FK/integration-test purposes
-- (section 42 of the governing plan: no auth, learner_id stays opaque), and
-- the append-only LearnerEvent log.

CREATE TABLE learners (
  id TEXT PRIMARY KEY
);

CREATE TABLE learner_events (
  event_id               TEXT PRIMARY KEY,
  event_type             TEXT NOT NULL CHECK (event_type IN ('OCCURRENCE_OPENED','STATE_DECLARED')),
  occurred_at            TIMESTAMPTZ NOT NULL,
  learner_id             TEXT NOT NULL REFERENCES learners(id),
  story_id               TEXT NOT NULL REFERENCES stories(id),
  story_version_id       TEXT NOT NULL REFERENCES story_versions(id),
  occurrence_id          TEXT NULL REFERENCES story_occurrences(id),
  recorded_lexeme_id     TEXT NULL REFERENCES lexemes(id),
  recorded_sense_id      TEXT NULL REFERENCES senses(id),
  recorded_form_id       TEXT NULL REFERENCES lexeme_forms(id),
  curriculum_release_id  TEXT NOT NULL,
  lexicon_release_id     TEXT NOT NULL,
  declared_state         TEXT NULL CHECK (declared_state IN ('NEW','LEARNING','KNOWN')),
  CHECK ((event_type = 'STATE_DECLARED') = (declared_state IS NOT NULL)),
  CHECK (event_type <> 'STATE_DECLARED' OR recorded_lexeme_id IS NOT NULL)
);
CREATE INDEX idx_learner_events_learner_time ON learner_events(learner_id, occurred_at);
CREATE INDEX idx_learner_events_learner_lexeme ON learner_events(learner_id, recorded_lexeme_id) WHERE recorded_lexeme_id IS NOT NULL;
CREATE INDEX idx_learner_events_version ON learner_events(story_version_id);
CREATE INDEX idx_learner_events_occurrence ON learner_events(occurrence_id) WHERE occurrence_id IS NOT NULL;

-- Defense in depth: the application's LearnerEventRepository interface
-- exposes no update/delete method at all (see
-- features/learner-progress/repository/learner-event-repository.ts), but a
-- bug -- or a future contributor unfamiliar with that contract -- could
-- still issue a raw UPDATE/DELETE against this table directly. The
-- append-only guarantee is a domain contract (section 46 of the governing
-- plan says explicitly that stopping a DBA's manual SQL is not required),
-- but the ordinary application code path is additionally rejected by
-- PostgreSQL itself, not just by the TypeScript interface's shape.
CREATE OR REPLACE FUNCTION forbid_learner_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LEARNER_EVENT_APPEND_ONLY: % on learner_events is not permitted; the event log is append-only', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_learner_events_no_update
  BEFORE UPDATE ON learner_events
  FOR EACH ROW EXECUTE FUNCTION forbid_learner_event_mutation();

CREATE TRIGGER trg_learner_events_no_delete
  BEFORE DELETE ON learner_events
  FOR EACH ROW EXECUTE FUNCTION forbid_learner_event_mutation();
