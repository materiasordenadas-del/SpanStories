-- NLP Annotation Assistant (features/nlp, engine phase 6, Corrección B/C):
-- the single persisted authority over whether an AnnotationCandidate was
-- accepted/rejected (`features/nlp/domain/decision.ts`), and the editorial
-- workflow's explicit "current authoring version" per story
-- (`features/nlp/domain/current-version.ts`).
--
-- `candidate_id` is the primary key, not a separate surrogate id: a decision
-- is identified by the candidate it decides, and `PRIMARY KEY` is exactly the
-- exactly-once constraint Corrección B needs -- `INSERT ... ON CONFLICT
-- (candidate_id) DO NOTHING` (features/persistence/repository/
-- postgres-annotation-decision-repository.ts) is what makes two concurrent
-- accept() calls on the same candidate produce one row, not a race.

CREATE TABLE annotation_candidate_decisions (
  candidate_id           TEXT PRIMARY KEY,
  decision               TEXT NOT NULL CHECK (decision IN ('ACCEPTED','REJECTED')),
  decided_at             TIMESTAMPTZ NOT NULL,
  reason                 TEXT NOT NULL,
  editorial_reference    TEXT NULL,
  result_kind            TEXT NOT NULL CHECK (result_kind IN ('NEW_OCCURRENCE','REVISION','NONE')),
  resulting_occurrence_id TEXT NULL REFERENCES story_occurrences(id),
  resulting_revision_id  TEXT NULL REFERENCES occurrence_annotation_revisions(id),
  -- Materialization for a NEW_OCCURRENCE decision: enough to answer "what did
  -- accepting this candidate produce" on retry without re-deriving ids. Kept
  -- as JSON (anchor id list + optional target binding id) rather than a
  -- side table -- it is never queried by anything but candidate_id.
  materialization        JSONB NULL,
  CHECK (
    (decision = 'REJECTED' AND result_kind = 'NONE' AND resulting_occurrence_id IS NULL AND resulting_revision_id IS NULL AND materialization IS NULL) OR
    (decision = 'ACCEPTED' AND result_kind = 'NEW_OCCURRENCE' AND resulting_occurrence_id IS NOT NULL AND resulting_revision_id IS NULL AND materialization IS NOT NULL) OR
    (decision = 'ACCEPTED' AND result_kind = 'REVISION' AND resulting_revision_id IS NOT NULL AND resulting_occurrence_id IS NULL AND materialization IS NULL)
  )
);

-- Corrección C: the StoryVersion an editorial workflow currently authors
-- against for a given story. NLP acceptance reads this; only the editorial
-- workflow writes it (features/nlp/domain/current-version.ts). No row means
-- "nothing designated yet" -- acceptance fails closed, not open, in that case.
CREATE TABLE story_authoring_state (
  story_id                     TEXT PRIMARY KEY REFERENCES stories(id),
  current_editable_version_id TEXT NOT NULL REFERENCES story_versions(id)
);
