# NLP / Annotation Assistant feature (engine phase 6)

Analyzes a `StoryVersion` and proposes reviewable `AnnotationCandidate`s.
See `docs/nlp-annotation-assistant.md` for the full design rationale
(analyzer choice, the Node<->Python contract, offset proof, acceptance
flow); this file is the short orientation.

## Public boundary

Import from [`index.ts`](./index.ts). The file layout below it (`domain/`,
`engine/`, `adapters/`, `review/`, `runtime/`) is not a contract.

## What phase 6 is

```text
StoryVersion + sentences
      |
      v
NlpAnalyzer  (SpaCyAnalyzer real adapter | FakeAnalyzer for tests)
      |
      v
NlpAnalysis  (raw tokens: surface, lemma, POS, morphology, dependency,
              code-point offsets — not yet a claim about any Lexeme)
      |
      v
buildAnnotationCandidates
  (lexical resolution against features/lexical-engine,
   governed construction-pattern tables, MWU/grammar target resolution
   against features/curriculum — never picks an ambiguous candidate)
      |
      v
AnnotationCandidate[]   (status: CANDIDATE | REVIEW_REQUIRED | ACCEPTED | REJECTED)
      |
      +--> acceptAnnotationCandidate  --> StoryOccurrence + TextAnchor[] (+ StoryTargetBinding)
      |                                   or OccurrenceAnnotationRevision (persisted)
      +--> rejectAnnotationCandidate  --> a record; never touches the Story Engine

Every accept/reject also records exactly one AnnotationCandidateDecision
(AnnotationDecisionRepository) — the single persisted authority over a
candidate's outcome, never the caller's own bookkeeping of `.status`.
```

- **`NLP != autoridad`.** Nothing here mints a `Lexeme`, `Sense` or
  `LexemeForm`, changes CEFR/MWU identity, infers pronominality, publishes a
  `StoryVersion`, or marks mastery. Every proposal passes through
  `acceptAnnotationCandidate` — an explicit, human/system decision — before
  it becomes anything the Story Engine recognises.
- **Offsets are Unicode code points**, exactly like
  `features/story-engine/domain/anchors.ts`'s `TextAnchor` contract — proven
  end to end against the real analyzer in `__tests__/offsets.test.ts`
  (ñ, á, ¿, ¡, an astral emoji).
- **Lexical resolution is always a candidate set**, never a picked answer —
  a real published homograph (`HG-A1-0001`, "alemán") resolves to two
  candidates every time.
- **Construction/MWU patterns are governed tables**
  (`engine/construction-rules.ts`), not opaque model inference — three
  named patterns cover the brief's three difficult Spanish cases (`"vete"`,
  `"se dio [finalmente] cuenta"`, `"Lleva tres años estudiando español"`).
- **`confidence` never decides `status`.** No auto-publication threshold
  exists anywhere in this feature.
- **Accept/reject is exactly-once.** `AnnotationDecisionRepository` enforces
  `UNIQUE(candidateId)` atomically — a second decision for the same
  candidate, sequential or concurrent, always fails
  `CANDIDATE_ALREADY_DECIDED`. See `docs/nlp-annotation-assistant.md` §11.1.
- **A `StoryVersion` existing does not make it current.** Acceptance checks
  `CurrentStoryVersionResolver`, an explicit editorial-workflow-owned
  authority — never "highest version number" guessed internally. §11.2.
- **Reannotation checks `StoryOccurrence.kind`** before treating an
  occurrence as `LexicalOccurrence` — no type assertion. §11.3.
- **The spaCy/model version is governed and checked on every real
  analysis** (`domain/analyzer-config.ts`), on both sides of the Node<->Python
  bridge. §11.4.

## What phase 6 does not do

An LLM cloud API, automatic Story generation or publication, a mastery
model, spaced repetition, a recommendation engine, a new progress UI, auth,
payments, a vector DB or semantic-search infrastructure. No file under
`components/visual/baseline-v1/` was touched.

## Tests

`__tests__/*.test.ts`, run via `npm test`. Most files use `FakeAnalyzer`
(deterministic, no subprocess) to exercise `engine/candidate-builder.ts`'s
own logic against hand-verified token analyses; `__tests__/offsets.test.ts`
and `__tests__/spacy-integration.test.ts` spawn the real
`SpaCyAnalyzer` subprocess — see `docs/nlp-annotation-assistant.md` §2.1 for
how to install spaCy/`es_core_news_sm` if those two fail with
`ANALYZER_BRIDGE_FAILURE`.
