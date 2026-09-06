/**
 * The canonical A1 source artefacts and the exact published columns this
 * importer reads.
 *
 * Every published column is accounted for: either the importer consumes it
 * (requiredColumns) or it is listed as knowingly unused. A column present in
 * a file but in neither list is treated as a schema change and fails the
 * import, because a new column can silently change what a row means.
 *
 * These lists were generated from the published headers, not transcribed.
 *
 * The sequencing artefacts are the `A1-CURRICULUM-v1.51` release candidate; the
 * inventory artefacts (normalization master, source assertions, coverage audit)
 * are unchanged and shared with the archived v1.44 release.
 */

import type { ReadCsvOptions } from "./csv.ts";

export type CanonicalSourceKey =
  | "normalizationMaster"
  | "sourceAssertions"
  | "sequencingArchitecture"
  | "sequencingAllocation"
  | "storyBlueprints"
  | "recyclingEdges"
  | "coverageAudit"
  | "sequencingAudit";

export type CanonicalSource = ReadCsvOptions & {
  readonly key: CanonicalSourceKey;
  /** Published basename. The importer never renames or rewrites sources. */
  readonly file: string;
  readonly purpose: string;
  /**
   * Column carrying the curriculum version the file declares about itself,
   * when it has one. Used to detect release/version drift.
   */
  readonly versionColumn: string | null;
  /** Version asserted by the published filename, for cross-checking. */
  readonly filenameVersion: string;
};

/** Directory holding the published A1 curriculum artefacts. */
export const CANONICAL_SOURCE_DIR = "content/a1/vocabulary";

export const NORMALIZATION_MASTER: CanonicalSource = {
  key: "normalizationMaster",
  file: "spanishstories_a1_ws_normalization_master_v1.37.csv",
  purpose: "Lexeme / LexemeForm / Sense / MWU identity registry.",
  versionColumn: "curriculum_version",
  filenameVersion: "1.37",
  requiredColumns: [
    "record_id",
    "item",
    "object_type",
    "curriculum_version",
    "phase14_row_type",
    "curriculum_layer",
    "curriculum_inclusion",
    "engine_pos",
    "lexical_category",
    "sense_key",
    "sense_curriculum_status",
    "source_assertion_policy",
    "regional_concept_anchor",
    "lexeme_id",
    "sense_id",
    "form_id",
    "form_origin",
    "form_surface",
    "form_features_final",
    "form_relation_type",
    "curricular_variant_status",
    "lexeme_key",
    "lexeme_type_final",
    "canonical_lemma_final",
    "lexeme_release",
    "sense_status_final",
    "sense_scope_final",
    "source_assertion_scope_key",
    "a2_boundary_scope_key",
    "mwu_object_class",
    "mwu_subtype",
    "mwu_frame_key",
    "mwu_identity_policy",
    "mwu_classification_confidence",
  ],
  knownUnusedColumns: [
    "measurement_source_id",
    "measurement_source_name",
    "source_version",
    "measurement_dimension",
    "measurement_status",
    "raw_occurrence_count",
    "rank_in_top50k",
    "top50k_match_status",
    "matching_method",
    "consulted_at",
    "normalization_candidate",
    "normalization_candidate_raw_occurrence_count",
    "normalization_candidate_rank_in_top50k",
    "normalization_review_reason",
    "scan_verified_through_rank",
    "normalized_frequency",
    "normalized_frequency_unit",
    "source_register",
    "source_year",
    "source_data_origin",
    "license",
    "commercial_use_status",
    "level_effect",
    "priority_effect_status",
    "source_url",
    "evidence_url",
    "notes",
    "phase14_id",
    "normalization_action",
    "canonical_form_target",
    "staging_identity_key",
    "lexeme_candidate_status",
    "variant_relation_type",
    "split_parent_surface",
    "review_gate",
    "lexical_verification_source",
    "phase14_notes",
    "phase14c_status",
    "functional_paradigm_id",
    "functional_paradigm_class",
    "paradigm_anchor",
    "paradigm_form_features",
    "function_word_engine_policy",
    "occurrence_role_policy",
    "independent_a1_assertion_status",
    "source_assertion_scope_type",
    "phase14c_evidence_basis",
    "phase14d_status",
    "lexeme_target_ids",
    "sense_target_ids",
    "identity_publication_policy",
    "lineage_status",
  ],
};

export const SOURCE_ASSERTIONS: CanonicalSource = {
  key: "sourceAssertions",
  file: "spanishstories_a1_ws_source_assertions_modes_v1.40.csv",
  purpose: "Published SourceAssertions and receptive/productive mode policy.",
  versionColumn: "curriculum_version",
  filenameVersion: "1.40",
  requiredColumns: [
    "source_assertion_id",
    "record_type",
    "target_type",
    "target_id",
    "target_item",
    "lexeme_id",
    "sense_id",
    "asserted_level",
    "asserted_curriculum_status",
    "evidence_role",
    "source_id_single",
    "source_url_single",
    "assertion_basis",
    "source_resolution",
    "source_level_relation",
    "source_precision",
    "scope_key",
    "a2_boundary_scope_key",
    "expected_receptive",
    "expected_productive",
    "formulaic_expectation",
    "mode_class",
    "mode_authority",
    "regional_scope",
    "curriculum_version",
    "final_publication_status",
  ],
  knownUnusedColumns: [
    "assertion_envelope_id",
    "source_record_id",
    "source_ids",
    "source_urls",
    "provenance_debt",
    "mode_rationale",
    "publication_status",
    "notes",
    "historical_phase",
    "historical_source_surface",
    "derived_from_lexeme_id",
    "derived_from_sense_id",
    "derived_from_anchor",
  ],
};

/**
 * v1.51 publishes eleven `ISLAND` rows and no `MODULE` row: the eight modules
 * are reconstructed by grouping islands on `module_id`. The module-level
 * columns below are therefore repeated on every island of a module, and the
 * importer requires them to agree rather than taking the first one it reads.
 */
export const SEQUENCING_ARCHITECTURE: CanonicalSource = {
  key: "sequencingArchitecture",
  file: "spanishstories_a1_ws_sequencing_architecture_v1.51.csv",
  purpose: "Module and island topology of the A1 sequence.",
  versionColumn: null,
  filenameVersion: "1.51",
  requiredColumns: [
    "record_type",
    "sequence_id",
    "module_id",
    "module_order",
    "module_name",
    "island_id",
    "island_order",
    "global_island_order",
    "island_name",
    "communicative_goal",
    "design_role",
    "story_count",
    "island_checkpoint_story_id",
    "module_checkpoint_story_id",
    "hard_prerequisite",
    "recycling_policy",
    "module_gate",
    "allocation_status",
  ],
  knownUnusedColumns: ["notes"],
};

export const SEQUENCING_ALLOCATION: CanonicalSource = {
  key: "sequencingAllocation",
  file: "spanishstories_a1_ws_sequencing_allocation_v1.51.csv",
  purpose: "First-introduction ledger: one row per scheduled curriculum target.",
  versionColumn: null,
  filenameVersion: "1.51",
  requiredColumns: [
    "allocation_id",
    "target_type",
    "target_id",
    "item",
    "lexeme_id",
    "sense_id",
    "object_class",
    "sense_status",
    "expected_receptive",
    "expected_productive",
    "formulaic_expectation",
    "grammar_pcic_section",
    "grammar_category",
    "grammar_kind",
    "module_id",
    "island_id",
    "story_id",
    "intro_salience",
    "allocation_authority",
    "allocation_basis",
    "allocation_reason",
    "source_assertion_ids",
    "regional_policy",
    "story_blueprint_status",
  ],
  knownUnusedColumns: [
    "source_record_id",
    "mwu_object_class",
    "mwu_subtype",
    "module_name",
    "island_name",
    "notes",
  ],
};

export const STORY_BLUEPRINTS: CanonicalSource = {
  key: "storyBlueprints",
  file: "spanishstories_a1_ws_story_blueprints_v1.51.csv",
  purpose: "Story blueprint ledger.",
  versionColumn: null,
  filenameVersion: "1.51",
  requiredColumns: [
    "story_id",
    "module_id",
    "island_id",
    "global_island_order",
    "story_order",
    "story_title",
    "story_role",
    "scenario_brief",
    "communicative_goal",
    "genre_focus",
    "planned_input_mode",
    "first_intro_target_count",
    "focus_first_intro_count",
    "supported_first_intro_count",
    "first_return_in_count",
    "second_return_in_count",
    "third_return_in_count",
    "regional_receptive_return_in_count",
    "new_target_policy",
    "task_demand",
    "known_token_coverage_policy",
    "mastery_policy",
    "status",
    "scheduled_relation_count",
    "focus_guardrail",
    "is_island_checkpoint",
    "is_module_checkpoint",
    "is_final_transfer_story",
    "authoring_policy",
    "dele_task_ids",
    "required_modalities",
    "revision_reason",
  ],
  knownUnusedColumns: ["module_name", "island_name", "notes"],
};

/**
 * v1.51 edges carry no `allocation_id`: they address the target directly and
 * name the story that introduced it, so the importer joins on the pair
 * (`target_id`, `introduction_story`) and checks it against the allocation.
 */
export const RECYCLING_EDGES: CanonicalSource = {
  key: "recyclingEdges",
  file: "spanishstories_a1_ws_recycling_edges_v1.51.csv",
  purpose: "Scheduled return graph over story blueprints.",
  versionColumn: null,
  filenameVersion: "1.51",
  requiredColumns: [
    "edge_id",
    "target_type",
    "target_id",
    "introduction_story",
    "return_stage",
    "return_story",
    "relation_scope",
    "evidence_demand",
    "expected_receptive",
    "expected_productive",
    "mastery_claim",
  ],
  knownUnusedColumns: ["notes"],
};

export const COVERAGE_AUDIT: CanonicalSource = {
  key: "coverageAudit",
  file: "spanishstories_a1_ws_coverage_final_v1.40.csv",
  purpose: "Cross-validator: inventory coverage ledger.",
  versionColumn: null,
  filenameVersion: "1.40",
  requiredColumns: [
    "audit_id",
    "record_type",
    "layer",
    "observed_count",
    "expected_count",
    "coverage_status",
    "severity",
    "blocking_for_phase16",
  ],
  knownUnusedColumns: [
    "workstream_id",
    "source_basis",
    "grading_model",
    "coverage_numerator",
    "coverage_denominator",
    "coverage_percent",
    "issue",
    "decision",
    "next_action",
    "evidence_basis",
    "notes",
  ],
};

export const SEQUENCING_AUDIT: CanonicalSource = {
  key: "sequencingAudit",
  file: "spanishstories_a1_ws_sequencing_final_audit_v1.51.csv",
  purpose: "Cross-validator: final sequencing audit controls and expected counts.",
  versionColumn: null,
  filenameVersion: "1.51",
  requiredColumns: [
    "audit_id",
    "record_type",
    "category",
    "control",
    "expected",
    "observed",
    "status",
    "blocking",
  ],
  knownUnusedColumns: [
    "evidence",
    "correction",
    "notes",
    "mapped_story_ids",
  ],
};

export const CANONICAL_SOURCES: readonly CanonicalSource[] = [
  NORMALIZATION_MASTER,
  SOURCE_ASSERTIONS,
  SEQUENCING_ARCHITECTURE,
  SEQUENCING_ALLOCATION,
  STORY_BLUEPRINTS,
  RECYCLING_EDGES,
  COVERAGE_AUDIT,
  SEQUENCING_AUDIT,
];

/**
 * Sequencing artefacts that belong to the active curriculum release.
 *
 * Used by the schema guard that enforces the release-neutral column contract:
 * a v1.51 sequencing file must not reintroduce a version-stamped column name.
 */
export const SEQUENCING_SOURCE_KEYS: readonly CanonicalSourceKey[] = [
  "sequencingArchitecture",
  "sequencingAllocation",
  "storyBlueprints",
  "recyclingEdges",
  "sequencingAudit",
];

/** Column names stamped with a curriculum version, e.g. `v1_44_story_count`. */
export const VERSION_STAMPED_COLUMN = /^v\d+_\d+_/;
