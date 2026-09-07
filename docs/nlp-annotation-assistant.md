# NLP / Annotation Assistant — implementation notes (engine phase 6)

A reviewable annotation-candidate pipeline built over phases 1-5. It analyzes
a `StoryVersion`'s sentences and proposes `AnnotationCandidate`s — never
truth, never published content.

```text
Curriculum release   A1-CURRICULUM-v1.51   (active baseline, unchanged)
Lexicon release       A1-LEXICON-v1.0      (active baseline, unchanged)
NLP / Annotation      phase 6, no release id of its own — it is code, not data
```

---

## 1. The one rule everything else follows

```text
StoryVersion
    -> NLP analysis
    -> AnnotationCandidate[]
    -> canonical registry validation
    -> editorial review / deterministic acceptance
    -> StoryOccurrence / OccurrenceAnnotationRevision
    -> Publication Validator
```

Never `NLP -> publicación directa`. Nothing in this feature calls
`saveNewVersion`, `markPublished` or `publishStoryVersion`; nothing mints a
`Lexeme`, `Sense` or `LexemeForm`; nothing edits `content/a1/vocabulary/*`.
**NLP proposes. Canonical engines validate. Editorial authority decides.**

---

## 2. Analyzer chosen: spaCy (`es_core_news_sm`)

No prior phase or architecture document fixed an NLP technology, so §24's
criteria (local, CPU, free, no paid API, no heavy transformer) governed the
choice.

```text
analyzer        spaCy
analyzerVersion 3.8.16   (pinned in features/nlp/adapters/spacy/requirements.txt)
model           es_core_news_sm
modelVersion    3.8.0
```

`es_core_news_sm` is a small (~13 MB), CPU-only, pipeline-based Spanish
model — no GPU, no transformer weights, no network call at analysis time
(only the one-time `pip`/`spacy download` install). It is not wired into the
domain: `../adapters/analyzer.ts`'s `NlpAnalyzer` interface is the only
thing `../engine/*` depends on, and `../adapters/fake/fake-analyzer.ts`
already proves a second, unrelated implementation satisfies it. Swapping
analyzers later — a different spaCy pipeline, a different library entirely —
requires a new file implementing `NlpAnalyzer`, not a redesign.

### 2.1 Installing it

```bash
python -m pip install -r features/nlp/adapters/spacy/requirements.txt
python -m spacy download es_core_news_sm
```

`features/nlp/adapters/spacy/spacy-analyzer.ts` spawns `python` by default
(override with the `SPANSTORIES_PYTHON` env var or the
`pythonExecutable` constructor option). **Not** `python3` by default: on
Windows, `python3` commonly resolves to a Microsoft Store stub that is a
*different* interpreter than whatever environment spaCy was actually
installed into — verified directly in this development environment, where
`python3 -c "import spacy"` fails with `ModuleNotFoundError` even though
`python -c "import spacy"` succeeds. Point `SPANSTORIES_PYTHON` at an
absolute interpreter path in any environment where the default guess is
wrong.

### 2.2 Running the tests

```bash
npm test                                            # everything, including NLP (fakes + the real adapter)
node --test features/nlp/__tests__/*.test.ts        # NLP suite only
```

`__tests__/spacy-integration.test.ts` and `__tests__/offsets.test.ts` spawn
the real Python subprocess — no `TEST_DATABASE_URL`-style opt-in flag exists
for these, because unlike a networked PostgreSQL server, a local Python
interpreter with spaCy installed is a reasonable thing to expect in a
dev/CI image once installed once (§2.1). If spaCy or the model cannot be
loaded, these two files fail loudly with `ANALYZER_BRIDGE_FAILURE` — that is
`BLOCKER_NLP_INTEGRATION_ENV`, not a skip and not a false pass. Every other
NLP test file uses `FakeAnalyzer` and needs no Python at all.

---

## 3. Node <-> Python contract

`features/nlp/adapters/spacy/analyzer.py`'s own header comment is the
versioned spec; `BRIDGE_CONTRACT_VERSION` (`"1.0.0"`) is asserted equal on
both sides — a mismatch is a hard `ANALYZER_BRIDGE_FAILURE`, not a silent
best-effort continuation.

```text
Node -> Python (stdin, one JSON object):
  { contractVersion, modelName, sentences: [{ sentenceIndex, text }] }

Python -> Node (stdout, one JSON object, nothing else ever written to stdout):
  { contractVersion, analyzer, analyzerVersion, modelName, modelVersion,
    sentences: [{ sentenceIndex, text,
                  tokens: [{ index, surface, start, end, lemma, pos, tag,
                             morphology, depRelation, headIndex }] }] }
```

Every diagnostic goes to stderr; a caller reading stdout on exit code 0 can
always `json.loads`/`JSON.parse` it directly. §44 process safety, all
satisfied by `spacy-analyzer.ts`: `child_process.spawn` with an argv array
(`shell: false`, the default) — no shell, no string concatenation, Story
text never becomes a command; a hard timeout (30s default) that kills the
subprocess and rejects; the exit code is checked, non-zero is
`ANALYZER_BRIDGE_FAILURE` with stderr attached; stdout is capped at 64 MB so
a runaway script cannot exhaust memory. Python never touches PostgreSQL and
never imports the curriculum registry — `analyzer.py` has no code path to
either.

### 3.1 Offsets: Unicode code points, not UTF-16 code units

`start`/`end` are **Unicode code point** offsets, half-open `[start, end)`,
into the exact sentence text — the identical contract
`features/story-engine/domain/anchors.ts` already documents for
`TextAnchor`. Python's `str` is already code-point indexed
(`len()`/`tok.idx`), so `analyzer.py` needs no conversion at all; the Node
side must resolve/compare these with `codePointLength`/`resolveAnchorText`
(`features/story-engine`), never raw `.slice()`/`.length` (UTF-16 code
units, which disagree with code points for any astral character — an emoji
outside the Basic Multilingual Plane).

`__tests__/offsets.test.ts` proves this end to end against the real
analyzer with one sentence covering ñ, á, ¿, ¡ and an astral emoji: every
token's `[start, end)` resolves to its own exact surface via
`resolveAnchorText`, and the emoji is confirmed to be exactly one code point
wide (`end - start === 1`) even though `"😀".length === 2` in JavaScript.

### 3.2 Tokenization is not lexical authority

An NLP token boundary is a segmentation proposal (§27), not a claim that
"1 token = 1 Lexeme." `../engine/construction-rules.ts`'s fused-clitic-split
rule (§3.3 below) explicitly proposes *sub*-token anchors — the Story Engine
decides how a proposal is actually materialised as `OccurrencePart`s, this
feature only ever proposes.

---

## 4. `AnnotationCandidate` — one reviewable shape

`features/nlp/domain/candidate.ts`. Fields, matching the brief's list
exactly:

```text
candidateId, storyVersionId, sentenceId, parts (anchors + role),
candidateType (LEXICAL | CONSTRUCTION),
proposedLexemeId?, proposedSenseId?, proposedFormId?,
proposedGrammarTargetId?, proposedMwuTargetId?,
lexicalResolution (full candidate set, LEXICAL only),
senseCandidates (ranked, never collapsed to one),
constructionId (CONSTRUCTION only),
confidence?, evidence, sourceAdapter, algorithmVersion, provenance,
status (CANDIDATE | REVIEW_REQUIRED | ACCEPTED | REJECTED),
curriculumReleaseId, lexiconReleaseId
```

A `CONSTRUCTION` candidate's `proposedLexemeId` is always `null` by
construction — the type carries the field (for a uniform shape across both
candidate types) but nothing ever writes to it on that branch, matching
"no crear Lexeme artificial para una construcción/MWU sin identidad."

`status` is never derived from `confidence` (§40: no publication threshold
exists anywhere in this feature). It starts `CANDIDATE` when a resolution
tier is unambiguous, `REVIEW_REQUIRED` when a lexical resolution is
ambiguous (>1 candidate) or a target/grammar id could not be resolved
(`UNRESOLVED_CANDIDATE`, §32/§35 — never an invented id). `ACCEPTED`/
`REJECTED` only ever happen via `../review/acceptance-service.ts`, never as
a side effect of generation.

### 4.1 Lexical resolution — never a final answer

`../engine/lexical-resolution.ts`'s `resolveLexicalCandidates`, priority
order (§28):

1. `PUBLISHED_FORM` — the token's exact surface matches one or more
   published `LexemeForm.surface`s.
2. `LEXEME_CANDIDATES` — no form match, but the analyzer's own lemma names a
   published `Lexeme.lemma` directly.
3. `CANONICAL_FORM_CANDIDATES` — the raw surface itself happens to equal a
   published citation form.
4. `UNRESOLVED`.

Every tier returns a **set**. `HG-A1-0001` ("alemán", real published
homograph — `LEX-A1-000029`/`LEX-A1-000030`) resolves at tier 1 with two
candidates every time; `resolveLexicalCandidates` never picks one, and
`../engine/candidate-builder.ts` only ever sets `proposedLexemeId` when a
tier resolves to exactly one candidate — otherwise it stays `null` and
`status` becomes `REVIEW_REQUIRED`. A `Sense` is never auto-assigned either,
even when a `Lexeme` publishes exactly one — `senseCandidatesFor` always
returns a ranked list, `proposedSenseId` starts `null` regardless.

### 4.2 Pronominality: observed, never classified

`../engine/construction-rules.ts`'s clitic-split table is triggered by
surface patterns (a governed, explicit table — §34), but nothing in this
feature ever reads or writes `LexicalIdentity.pronominality`. There is no
code path from an NLP observation to that field; `resolveLexicalCandidates`
and `AnnotationCandidate` carry no `pronominality` property at all.
`__tests__/lexical-resolution.test.ts` asserts this by comparing
`LexicalEngine.getIdentity` before and after candidate generation for a
`-se`-suffixed verb (`bañarse`) and finding it unchanged.

---

## 5. The three difficult constructions, as governed rules

`../engine/construction-rules.ts` — three small, named, inspectable tables,
never an opaque model inference (§34, §41 items 21-26):

| Case | Mechanism | Result |
| --- | --- | --- |
| `"vete"` | `FUSED_CLITIC_TABLE` — exact surface lookup (`"vete"` -> head `"ve"`, lemma `"ir"`, clitic `"te"`) | `LEXICAL` candidate, two sub-token parts: `HEAD` `[0,2)`, `CLITIC` `[2,4)` |
| `"Marta se dio finalmente cuenta del problema"` | `DISCONTINUOUS_MWU_TABLE` — clitic + verb head + fixed complement sharing one syntactic head, matched by surface/lemma/dependency relation, any order, any gap | `CLITIC`+`HEAD`+`FIXED` parts (a real gap on `"finalmente"`); `LEXICAL` if the MWU resolves with lexical identity, `CONSTRUCTION` (`ANCHOR`+`SLOT`×2) if it resolves without one, `UNRESOLVED_CANDIDATE` if the registry publishes neither |
| `"Lleva tres años estudiando español"` | `CONSTRUCTION_TABLE` — an anchor lemma (`"llevar"`) plus a duration noun-phrase dependent and a gerund dependent | `CONSTRUCTION` candidate: `ANCHOR` (`"Lleva"`), `SLOT(DURATION)` (`"tres años"`), `SLOT(GERUND_PREDICATE)` (`"estudiando"` alone) |

Every table is small on purpose: adding a case is adding a governed row, not
teaching a model. `__tests__/difficult-cases.test.ts` proves all three
against hand-specified token analyses matching spaCy's real output;
`__tests__/spacy-integration.test.ts` proves the middle one against the
*real* subprocess.

An MWU without lexical identity legitimately produces a `CONSTRUCTION`
candidate rather than a `LEXICAL` one — `createConstructionOccurrence`
requires an `ANCHOR` part and has no `CLITIC`/`FIXED` role, so the head verb
becomes the pattern's `ANCHOR` and the clitic/fixed pieces become labelled
`SLOT`s (`slotLabel: "CLITIC"` / `"FIXED"`). This is a deliberate mapping
decision, not a limitation: no `Lexeme` is available to satisfy
`LexicalOccurrence.lexemeId` (a required field), so `CONSTRUCTION` is the
only representation `features/story-engine`'s domain actually allows.

---

## 6. Acceptance — the only writing path

`../review/acceptance-service.ts`'s `acceptAnnotationCandidate`, per §36:

1. Refuses a candidate already `ACCEPTED`/`REJECTED` (`CANDIDATE_NOT_PENDING`).
2. **Staleness** (§37): the candidate's `curriculumReleaseId`/
   `lexiconReleaseId` must equal the *current* ones, and its
   `storyVersionId` must still resolve in the repository —
   `STALE_CANDIDATE` otherwise. A candidate is frozen the instant it is
   generated; it is never silently re-validated against whatever happens to
   be current later.
3. **Referential integrity**: every non-null `proposedLexemeId`/
   `proposedFormId`/`proposedSenseId`/`proposedMwuTargetId`/
   `proposedGrammarTargetId` must resolve in the *current* registry
   (`CANDIDATE_UNKNOWN_REFERENCE`), and a non-null `proposedSenseId` must
   belong to `proposedLexemeId` (`CANDIDATE_SENSE_LEXEME_MISMATCH`).
4. **Anchors**: every part's `[start, end)` is re-resolved against the
   *current* (immutable) sentence text — out of bounds is
   `CANDIDATE_ANCHOR_INVALID`; an internal overlap surfaces as the Story
   Engine's own `PART_OVERLAP` (construction is delegated to
   `createLexicalOccurrence`/`createConstructionOccurrence`, so this
   feature does not duplicate that check).
5. Builds the real `StoryOccurrence` (`LEXICAL` or `CONSTRUCTION`, matching
   `candidateType`) and its `TextAnchor`s via the Story Engine's own
   constructors — or, when `ctx.reannotatesOccurrenceId` names an existing
   occurrence, an `OccurrenceAnnotationRevision` via
   `reviseOccurrenceAnnotation`, which *is* persisted
   (`appendAnnotationRevision`).
6. Never touches `StoryVersion.text` — nothing here calls `saveNewVersion`
   with different text, ever.
7. **Never publishes.** No call to `saveNewVersion`, `markPublished` or
   `publishStoryVersion` exists in this file.

### 6.1 Why a brand-new occurrence is *returned*, not written

`StoryRepository` has no "append one occurrence to an already-saved
version" method — by design (`docs/story-engine-implementation.md`): a
`StoryVersion`'s content is only ever written whole, via `saveNewVersion`.
So accepting a candidate that proposes a *new* occurrence constructs the
real `StoryOccurrence`, its `TextAnchor`s, and (best-effort, see §6.2) a
`StoryTargetBinding`, and returns all three (`AcceptanceResult.kind ===
"NEW_OCCURRENCE"`) for whatever authoring workflow assembles the next
`saveNewVersion` call to include. Reannotating an *existing* occurrence, by
contrast, has a real, already-persisting mechanism
(`appendAnnotationRevision`) and this service uses it directly.

### 6.2 `StoryTargetBinding` is best-effort, not authoritative

When a candidate names a resolved MWU/grammar target, acceptance also
proposes a `FIRST_INTRO` `StoryTargetBinding`. It does not attempt to
determine whether the story being authored is actually that target's
scheduled first introduction versus a return — that cross-check already
exists, downstream, in `validateStoryPublication`
(`features/story-engine`), which every accepted occurrence still has to
pass before its `StoryVersion` can ever be published. Getting the binding
kind wrong here is caught later, by an unmodified validator; it is never a
reason to publish anyway (acceptance ≠ publication).

### 6.3 Rejection

`rejectAnnotationCandidate` is pure — it never touches the Story Engine.
Its result (`{ candidateId, reason, rejectedAt }`) is a record for whatever
system tracks candidate review history, not a call to any repository.

---

## 7. Stale-candidate and publication-safety proofs

`__tests__/publication-safety.test.ts` proves two different kinds of thing
never happen, one via *acceptance*, one via *publication*:

- **Acceptance-time refusals** (real, this feature's own code): an unknown
  `Lexeme`/`Sense` id, a `Sense` belonging to the wrong `Lexeme`, an anchor
  out of bounds, an internal overlap, a `storyVersionId` that no longer
  exists.
- **Publication-time refusals** (proving acceptance never bypasses the
  *existing*, unmodified validator): an A2-boundary sense
  (`SENSE-A1-000075`, real published id) accepted into an occurrence still
  fails `validateStoryPublication` with `A2_BOUNDARY_PUBLISHED_AS_A1`; a
  regional-receptive target (`SENSE-A1-000418`, real published id) bound
  with a `UNIVERSAL` productive claim still fails with
  `TARGET_BINDING_REGIONAL_PRODUCTIVE_OVERCLAIM`. Both use real curriculum
  data, not fixtures — this feature adds no publication exception for
  content it itself proposed.

---

## 8. What this feature is not

Never implemented, per §45/§21 of the governing brief: an LLM cloud API (no
OpenAI/Anthropic/any paid service), automatic Story generation, automatic
publishing, a mastery model, spaced repetition, a recommendation engine, a
new progress UI, auth, payments, a vector DB or semantic-search
infrastructure. `components/visual/baseline-v1/` was not touched.

`ANNOTATION_CANDIDATES` are not persisted as historical authority anywhere
in this phase — nothing here writes a `nlp_candidates` table or similar. If
a future phase decides to persist them, they must stay a strictly separate
collection from `StoryOccurrence`/`SourceAssertion`/`CurriculumTarget`: a
rejected candidate must never contaminate published domain data, and none
does today because none is ever written to it in the first place.

---

## 9. Known limitations

- **Small model, not perfect parses.** `es_core_news_sm` mis-tags some
  inputs (e.g. a sentence-initial imperative like `"Vete."` in isolation was
  observed tagging as `PROPN` rather than `VERB` during development) — this
  is exactly why the fused-clitic-split and MWU/construction rules key off
  **surface and lemma**, not off POS/dependency labels alone where those are
  the model's weaker signal, and why the difficult-case tests
  (`__tests__/difficult-cases.test.ts`) pin exact, hand-verified token
  analyses rather than trusting the model to reproduce them by chance on
  every run — `__tests__/spacy-integration.test.ts` is the one place the
  live model's actual output is asserted against.
- **Single-token content-word candidates are proposed for every sentence**
  (`../engine/candidate-builder.ts`'s pass 4) but this feature does not
  attempt full-sentence multi-word chunking beyond the three governed
  patterns in §5 — a real editorial pass over a real story will see far more
  candidates needing review than the curated test fixtures show, by design
  (nothing here silently drops an ambiguous token).
- **No candidate persistence** (§8) — a caller that wants a review queue
  across sessions needs to store `AnnotationCandidate[]` itself; this
  feature only generates and accepts/rejects them in-process.
- **`StoryTargetBinding` proposal is best-effort** (§6.2) — always
  `FIRST_INTRO`, never return-stage-aware.

---

## 10. Regression status (superseded by §11's numbers below)

```text
npm run curriculum:check   PASS  (all invariants, unchanged)
npm test                   PASS  363 passing, 1 skipped (364 total; the skip is deuda B's server-parity suite — TEST_DATABASE_URL unavailable, unrelated to phase 6)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 pre-existing warning
npm run build               PASS
```

`PHASE_6_NLP = PASS` — the real spaCy adapter was exercised, not only fakes;
see `__tests__/spacy-integration.test.ts` and `__tests__/offsets.test.ts`.

---

## 11. Addendum (Corrección post-Fase 6): acceptance hardening (B/C/D) and analyzer reproducibility (E)

§6 above described acceptance as refusing an already-`ACCEPTED`/`REJECTED`
candidate "per §36" and staleness as checking release ids plus
`storyVersionId` existence. Both turned out to be necessary but not
sufficient. This addendum closes three gaps found after phase 6 shipped and
fixes analyzer version drift, without starting a phase 7.

### 11.1 Corrección B — exactly-once acceptance

Nothing previously persisted whether a candidate had been decided:
`AnnotationCandidate.status` was the *caller's own* responsibility to track,
so calling `acceptAnnotationCandidate` twice on the same logical candidate
(the same object, or a fresh copy still reporting `status: "CANDIDATE"`) was
not just possible but, per §6's own item 1, explicitly "fine."

`../domain/decision-repository.ts`'s `AnnotationDecisionRepository` is now
the single persisted, append-only authority: `getByCandidateId` /
`recordAccepted` / `recordRejected`, keyed `UNIQUE(candidateId)`. A second
decision for a candidate — accept after accept, reject after accept, accept
after reject, or two decisions racing concurrently — always fails
`CANDIDATE_ALREADY_DECIDED`, enforced atomically:
`InMemoryAnnotationDecisionRepository` serializes with an in-process mutex
per `candidateId`; `PostgresAnnotationDecisionRepository`
(`features/persistence`) uses `INSERT ... ON CONFLICT (candidate_id) DO
NOTHING RETURNING *` — a real database-level guarantee, not a
check-then-write race.

For the `REVISION` path (reannotation), the decision and the
`OccurrenceAnnotationRevision` must land together: `../domain/
acceptance-unit-of-work.ts`'s `AnnotationAcceptanceUnitOfWork` commits both
inside one SQL transaction on a Postgres-backed wiring
(`PostgresAnnotationAcceptanceUnitOfWork`) — a crash mid-transaction leaves
nothing for a retry to find, so retrying the same `accept()` call is safe.
Without a unit of work supplied, `acceptAnnotationCandidate` records the
decision first and only then appends the revision — safe for
`InMemoryAnnotationDecisionRepository` (no foreign key to violate), but not
a supported combination with a Postgres-backed decision repository used
*without* its matching unit of work (the revision-id foreign key would
reject a decision row inserted before its revision exists — by design, a
loud failure rather than a silent ordering bug).

A `NEW_OCCURRENCE` acceptance's materialization (`occurrenceId`, every
`TextAnchor` id, the `StoryTargetBinding` id if any) is stored on the
decision itself, so a caller recovering from `CANDIDATE_ALREADY_DECIDED` can
retrieve exactly what the original acceptance produced instead of
regenerating a second set of ids.

Tests: `__tests__/acceptance-hardening.test.ts` (B1-B8, including a real
`Promise.all` concurrent double-accept and a concurrent double-reannotate),
`features/persistence/testing/database-contract-suite.ts`'s
`AnnotationDecisionRepository` contract (run against real PostgreSQL via
PGlite).

### 11.2 Corrección C — a `StoryVersion` existing is not the same as it being current

`StoryVersion`s are historical and immutable
(`docs/story-engine-implementation.md`): an old version goes on existing,
fully readable, forever after a newer one supersedes it as the one being
authored against. §6's original staleness check —
`storyRepository.getStoryVersion(candidate.storyVersionId) !== null` —
therefore proved nothing about whether that version was still the one an
editor was actually working on; a candidate generated against a superseded
draft could be accepted as if it were current.

`../domain/current-version.ts`'s `CurrentStoryVersionResolver` is a new,
explicit port: "which `StoryVersion` is the editorial workflow currently
authoring against, per story." It is never derived from "highest
`versionNumber`" or "most recently created" — guessing is exactly the bug
this fixes — and NLP only ever reads it; only the editorial workflow
(`InMemoryCurrentStoryVersionResolver.setCurrentEditableVersion` /
`PostgresCurrentStoryVersionResolver.setCurrentEditableVersion`, backed by
the new `story_authoring_state` table) writes it. No entry for a story means
"nothing designated yet," and `acceptAnnotationCandidate` fails closed
(`STALE_CANDIDATE`), not open.

A legitimate exception exists: correcting a historical version's annotation
without touching its text. This is never enabled implicitly — only via
`AcceptanceContext.historicalReannotationAuthorized: true` *and* a non-empty
`editorialReference`, both explicit per call.

Tests: `__tests__/acceptance-hardening.test.ts`'s "Corrección C" describe
block, including a version that still exists in the repository (never
deleted) but is provably no longer current.

### 11.3 Corrección D — reannotation respects `StoryOccurrence.kind`

`reviseOccurrenceAnnotation` takes a `LexicalOccurrence`, but the acceptance
service previously reached it via `existing as LexicalOccurrence` — a type
assertion that silently accepted a `CONSTRUCTION` occurrence too. Reannotation
now checks `existing.kind === "LEXICAL"` first and fails
`CANDIDATE_REANNOTATION_KIND_MISMATCH` (new `NlpErrorCode`) for anything
else, with TypeScript's own control-flow narrowing replacing the assertion —
no cast anywhere in this path. No new `Construction` revision model was
introduced; a `CONSTRUCTION` occurrence's reannotation stays out of this
feature's scope until an actual need for it exists.

Tests: `__tests__/acceptance-hardening.test.ts`'s "Corrección D" describe
block (D1-D3).

### 11.4 Corrección E — governed, reproducible spaCy/model version

§2 pinned `spacy==3.8.16` but never fixed `es_core_news_sm`'s own version as
a reproducible dependency — recording `modelVersion` in provenance after the
fact does not stop the runtime from silently analyzing under a different
model build. `../domain/analyzer-config.ts` is now the single governed
source (`EXPECTED_SPACY_VERSION = "3.8.16"`, `EXPECTED_MODEL_NAME =
"es_core_news_sm"`, `EXPECTED_MODEL_VERSION = "3.8.0"`) both sides of the
bridge check against — `../adapters/spacy/spacy-analyzer.ts` sends the
expected values to `analyzer.py` over the same stdin payload every other
input crosses, rather than Python keeping an independently drifting copy.
Both sides fail loudly (`ANALYZER_VERSION_MISMATCH`, new `NlpErrorCode`) on
a mismatch rather than running silently under an unreviewed configuration.
`computeAnalyzerFingerprint`/`analyzerFingerprintString` reduce a
candidate's existing `AnalyzerProvenance` fields plus the bridge contract
version and candidate-builder algorithm version to one comparable string —
no new field was added to the persisted candidate shape; the fingerprint is
a derived view.

`../adapters/spacy/requirements.txt` pins the model to the official
`explosion/spacy-models` GitHub Releases wheel (spaCy's own documented
reproducible-install mechanism), not `python -m spacy download` (which
floats to whatever the current release channel considers compatible).
`../adapters/spacy/verify-analyzer-env.py` is a standalone, side-effect-free
check script for CI/local verification. This environment's actual install —
spaCy 3.8.16, `es_core_news_sm` 3.8.0 — was verified to match the governed
pin exactly; no reinstall was needed.

Tests: `__tests__/analyzer-version.test.ts` (E1-E5, including simulated
mismatches that do not require a different real install), and
`__tests__/spacy-integration.test.ts`, which now asserts the real installed
environment's reported versions equal the governed constants exactly, not
merely that they are non-empty.

### 11.5 Regression status after Corrección A-E

```text
npm run curriculum:check   PASS  (all invariants, unchanged)
npm test                   PASS  393 passing, 1 skipped (394 total; the skip is the PostgreSQL server-parity suite — TEST_DATABASE_URL unavailable)
npm run typecheck          PASS
npm run lint               PASS  0 errors, 1 pre-existing warning (components/visual/baseline-v1, unrelated)
npm run build              PASS
```

`PHASE_6_NLP = PASS`. `CANDIDATE_EXACTLY_ONCE = PASS`.
`CONCURRENT_ACCEPTANCE_PROTECTION = PASS`. `CRASH_SAFE_REVISION_ACCEPTANCE =
PASS` (real, transactional, on the Postgres-backed unit of work — the
in-memory fallback is decision-first-safe but not transaction-atomic, since
nothing crashes mid-`Map`-write in-process). `STALE_STORY_VERSION_PROTECTION
= PASS`. `REANNOTATION_KIND_GUARD = PASS`. `SPACY_MODEL_REPRODUCIBILITY =
PASS`. `NLP_IS_AUTHORITY = NO`, `AUTO_PUBLISHING = NO` — unchanged; nothing
in this addendum touches §1's one rule.
