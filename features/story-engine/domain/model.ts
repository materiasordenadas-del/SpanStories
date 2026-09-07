/**
 * Canonical Story Engine domain objects (engine phase 3).
 *
 * These are plain, immutable data shapes; assembly and validation live in
 * `../engine/*`. See `docs/story-engine-implementation.md` for the full
 * rationale behind each boundary decision noted inline below.
 */

import type { LexemeFormId, LexemeId, SenseId, StoryBlueprintId, TargetType } from "../../curriculum/index.ts";
import type { LexiconReleaseId } from "../../lexical-engine/index.ts";
import type {
  OccurrenceAnnotationRevisionId,
  OccurrencePartId,
  SentenceId,
  StoryId,
  StoryOccurrenceId,
  StoryTargetBindingId,
  StoryVersionId,
  SurfaceTokenId,
  TextAnchorId,
} from "./ids.ts";

// ------------------------------------------------------------------- Story

export const STORY_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

/**
 * A stable narrative identity.
 *
 * `storyBlueprintId` is nullable by design: a `Story` normally references a
 * curriculum `StoryBlueprint`, but a technical fixture (see
 * `features/story-engine/fixtures/`) demonstrates the engine without being
 * mapped onto one of the 32 published blueprints — inventing that mapping is
 * exactly what `docs/architecture/plan-implementacion-motor-v1.0.md` forbids.
 * `getPublishedVersion`/publication both require a non-null blueprint id: a
 * fixture can be constructed and read, but never published as curricular.
 */
export type Story = {
  readonly id: StoryId;
  readonly storyBlueprintId: StoryBlueprintId | null;
  readonly status: StoryStatus;
  readonly createdAt: string;
};

// -------------------------------------------------------------- StoryVersion

/**
 * An immutable snapshot of a Story's published content.
 *
 * `text` is the full narrative text, assembled once at creation time as the
 * ordered join of its sentences' exact text (see `assembleStoryVersion` in
 * `../engine/story-service.ts`) — it is never independently authored, so it
 * cannot silently diverge from the sentences anchors are resolved against.
 *
 * A published `StoryVersion` is never mutated: new text means a new version
 * (`versionNumber` increments), and every anchor into an older version stays
 * resolvable against that version's own sentences forever.
 */
export type StoryVersion = {
  readonly id: StoryVersionId;
  readonly storyId: StoryId;
  readonly versionNumber: number;
  readonly title: string;
  readonly text: string;
  readonly status: StoryStatus;
  readonly createdAt: string;
  readonly publishedAt: string | null;
};

// ---------------------------------------------------------------- Sentence

/**
 * `SurfaceToken` is a segmentation unit, not a lexical one.
 *
 * `SurfaceToken != Lexeme`: a token may carry no lexical identity at all
 * (punctuation, a fragment of a not-yet-annotated multiword unit), and an
 * occurrence is never required to line up with exactly one token — see
 * `OccurrencePart`, which anchors directly into sentence text instead.
 */
export type SurfaceToken = {
  readonly id: SurfaceTokenId;
  readonly sentenceId: SentenceId;
  readonly surface: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly order: number;
};

/**
 * Exact contextual text of one sentence of a `StoryVersion`.
 *
 * `text` is stored byte-for-byte as authored: it is never normalised for
 * storage, because every `TextAnchor` on this sentence resolves against these
 * exact code points.
 */
export type StorySentence = {
  readonly id: SentenceId;
  readonly storyVersionId: StoryVersionId;
  readonly order: number;
  readonly text: string;
  readonly tokens: readonly SurfaceToken[];
};

// --------------------------------------------------------------- TextAnchor

/**
 * A stable reference to a half-open code point interval `[start, end)` inside
 * one sentence of one immutable `StoryVersion`. See `./anchors.ts` for the
 * offset-unit contract and `resolveAnchorText`.
 *
 * An anchor may cover a whole token, several tokens, or part of one
 * orthographic token (`"vete"` → `"ve"` + `"te"`) — nothing here requires
 * alignment with `SurfaceToken` boundaries.
 */
export type TextAnchor = {
  readonly id: TextAnchorId;
  readonly storyVersionId: StoryVersionId;
  readonly sentenceId: SentenceId;
  readonly start: number;
  readonly end: number;
};

// ------------------------------------------------------------ OccurrencePart

/**
 * Role of a part inside a `LexicalOccurrence` (a real Lexeme/Sense instance).
 * `HEAD` is the inflected verb/word carrying the identity, `FIXED` is an
 * invariant piece of a multiword unit ("cuenta" in "darse cuenta"), `CLITIC`
 * is a pronominal clitic ("se", "te") that may sit apart from the head.
 */
export const LEXICAL_PART_ROLES = ["HEAD", "FIXED", "CLITIC"] as const;
export type LexicalPartRole = (typeof LEXICAL_PART_ROLES)[number];

/**
 * Role of a part inside a `ConstructionOccurrence` (a productive pattern, not
 * a single lexical identity). `ANCHOR` is the pattern's fixed pivot ("llevo"),
 * `SLOT` is a productive, labelled gap it fills ("tres años", "estudiando").
 */
export const CONSTRUCTION_PART_ROLES = ["ANCHOR", "SLOT"] as const;
export type ConstructionPartRole = (typeof CONSTRUCTION_PART_ROLES)[number];

export type OccurrencePartRole = LexicalPartRole | ConstructionPartRole;

/**
 * One surface fragment of an occurrence, anchored into the story text.
 *
 * `order` is the part's position among the *other parts of the same
 * occurrence*, surface-ascending; it is independent of contiguity — parts may
 * have a gap between them (`"se dio [finalmente] cuenta"`, where "finalmente"
 * belongs to no part), but must not overlap each other.
 *
 * `slotLabel` is only meaningful (and only allowed) on a `SLOT` part — e.g.
 * `"DURATION"`, `"GERUND_PREDICATE"` for `llevar + duración + gerundio`.
 */
export type OccurrencePart = {
  readonly id: OccurrencePartId;
  readonly occurrenceId: StoryOccurrenceId;
  readonly anchorId: TextAnchorId;
  readonly role: OccurrencePartRole;
  readonly order: number;
  readonly slotLabel: string | null;
};

// ----------------------------------------------------------- StoryOccurrence

/**
 * Whether an occurrence's sense has been pinned down.
 *
 * An `UNRESOLVED` occurrence may still be published (annotation is ongoing
 * editorial work), but must never be presented as a confirmed example of "this
 * exact meaning" — see `docs/lexical-engine.md` §41.
 */
export const SENSE_RESOLUTION_STATUSES = ["NOT_REQUIRED", "UNRESOLVED", "RESOLVED"] as const;
export type SenseResolutionStatus = (typeof SENSE_RESOLUTION_STATUSES)[number];

type BaseOccurrence = {
  readonly id: StoryOccurrenceId;
  readonly storyVersionId: StoryVersionId;
  readonly sentenceId: SentenceId;
  readonly surface: string;
  readonly parts: readonly OccurrencePart[];
};

/** A concrete, contextualised instance of a real Lexeme in a Story. */
export type LexicalOccurrence = BaseOccurrence & {
  readonly kind: "LEXICAL";
  readonly lexemeId: LexemeId;
  readonly senseId: SenseId | null;
  /** Nullable: the inventory may not publish a `LexemeForm` for this exact
   *  inflected surface. A missing form is never fabricated to fill this in —
   *  see `docs/architecture/plan-implementacion-motor-v1.0.md` §"Fase 3". */
  readonly lexemeFormId: LexemeFormId | null;
  readonly senseResolutionStatus: SenseResolutionStatus;
};

/**
 * A concrete instance of a productive grammatical construction — not tied to
 * one Lexeme's identity. `constructionId` is a technical, engine-local label
 * (e.g. `"LLEVAR_DURATION_GERUND"`), never a curriculum id: constructions are
 * not minted as Lexemes (`SurfaceToken != Lexeme`, and neither does a
 * construction).
 */
export type ConstructionOccurrence = BaseOccurrence & {
  readonly kind: "CONSTRUCTION";
  readonly constructionId: string;
};

export type StoryOccurrence = LexicalOccurrence | ConstructionOccurrence;

// ------------------------------------------- OccurrenceAnnotationRevision

/**
 * A change to *how* a stable occurrence is interpreted lexically.
 *
 * The occurrence's identity (its id) never changes when its annotation does:
 * reannotating is recorded as a new revision referencing the same
 * `occurrenceId`, never as deleting one occurrence and creating an unrelated
 * one — see `docs/architecture/plan-implementacion-motor-v1.0.md` §11.
 */
export type OccurrenceAnnotationRevision = {
  readonly id: OccurrenceAnnotationRevisionId;
  readonly occurrenceId: StoryOccurrenceId;
  readonly previousLexemeId: LexemeId | null;
  readonly newLexemeId: LexemeId | null;
  readonly previousSenseId: SenseId | null;
  readonly newSenseId: SenseId | null;
  readonly reason: string;
  readonly lexiconReleaseId: LexiconReleaseId;
  readonly editorialReference: string | null;
  readonly createdAt: string;
};

// ------------------------------------------------------- StoryTargetBinding

/**
 * Which curricular scheduling event a `StoryOccurrence` satisfies.
 * Mirrors `IntroSalience`/`ReturnStage` from `features/curriculum`, but is
 * its own closed vocabulary because a binding also needs the "this is a
 * first introduction" case those two enums don't jointly express.
 */
export const STORY_TARGET_BINDING_KINDS = [
  "FIRST_INTRO",
  "FIRST_RETURN",
  "SECOND_RETURN",
  "THIRD_RETURN",
] as const;
export type StoryTargetBindingKind = (typeof STORY_TARGET_BINDING_KINDS)[number];

/**
 * An editorial claim, made *by this Story*, about how demandingly an
 * occurrence exercises its target productively.
 *
 * This is deliberately separate from `CurriculumTarget.expectedProductive`
 * (curriculum's own, authoritative baseline expectation): a binding may never
 * *raise* that baseline past what curriculum allows. In particular a target
 * curriculum scoped as regional-receptive (`CurriculumTarget.regionalPolicy`
 * set) can never be claimed `"UNIVERSAL"` here — see
 * `docs/architecture/plan-implementacion-motor-v1.0.md` §13 "regional
 * receptive no adquiere demanda productiva universal", enforced in
 * `../validation/publication-validator.ts`.
 */
export const PRODUCTIVE_CLAIMS = ["NONE", "CONTEXTUAL", "UNIVERSAL"] as const;
export type ProductiveClaim = (typeof PRODUCTIVE_CLAIMS)[number];

/**
 * Connects a published Story to a curricular scheduling obligation.
 *
 * `salience` is only meaningful for `bindingKind === "FIRST_INTRO"` (mirrors
 * `CurriculumTarget.introSalience`, `"FOCUS" | "SUPPORTED"`) and must be
 * `null` for every return-stage binding: `SUPPORTED` is still a first
 * introduction, never a return, and a return has no salience of its own.
 */
export type StoryTargetBinding = {
  readonly id: StoryTargetBindingId;
  readonly storyId: StoryId;
  readonly storyVersionId: StoryVersionId;
  readonly occurrenceId: StoryOccurrenceId;
  readonly targetType: TargetType;
  readonly targetId: string;
  readonly bindingKind: StoryTargetBindingKind;
  readonly salience: "FOCUS" | "SUPPORTED" | null;
  readonly productiveClaim: ProductiveClaim;
};
