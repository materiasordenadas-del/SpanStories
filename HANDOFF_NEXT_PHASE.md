# Handoff — phase 1 to phase 2 (Lexical Engine)

## 1. Phase 1 commit

Branch `prueba`. Commit SHA `cb63cb2bfe1c77535e505bd4ba8f8246a7113e19` (`cb63cb2`).

## 2. Entrypoints

```text
features/curriculum/index.ts                  public contract — import from here
features/curriculum/domain/                   ids, errors, model, release manifest
features/curriculum/import/                   csv, sources, fields, importer, validators, expectations
features/curriculum/registry/                 files, serialize, query
scripts/curriculum/import-a1.ts               CLI
features/curriculum/__tests__/                importer, query, corruption, determinism
docs/curriculum-import.md                     full documentation
```

## 3. Regenerate the registry

```bash
npm run curriculum:import        # writes generated/curriculum/a1/
npm run curriculum:check         # validate only
```

## 4. Tests

```bash
npm test          # 47 tests: node:test, no test dependency added
npm run typecheck
npm run lint
npm run build
```

## 5. Public contracts available to phase 2

- Types: `Lexeme`, `LexemeForm`, `Sense`, `MwuUnit`, `GrammarUnit`,
  `SourceAssertion`, `CurriculumModule`, `Island`, `StoryBlueprint`,
  `CurriculumTarget`, `RecycleEdge`, `CurriculumData`, `CurriculumRelease`.
- Branded ids + `ID_PATTERNS`, `matchesIdPattern`, `classifyTargetId`.
- `importCurriculum` / `importCurriculumOrThrow`, `computeContentHash`.
- `loadCurriculumRegistry`, `createRegistry`, `CurriculumRegistry`,
  `readRegistry` / `writeRegistry`.
- Query API: `getLexemeById`, `getFormById`, `getSenseById`, `getMwuUnitById`,
  `getGrammarUnitById`, `getLexemeOfSense`, `getLexemeOfForm`,
  `getFormsOfLexeme`, `getSensesOfLexeme`, `getSourceAssertionsForSense`,
  `getSourceAssertionsForTarget`, `getModulesInOrder`, `getIslandsInOrder`,
  `getIslandsOfModule`, `getStoriesInSequence`, `getStoriesOfIsland`,
  `getStoryBlueprintById`, `resolveTarget`, `getFirstIntroduction`,
  `getRecycleEdgesForTarget`, `getRecyclePath`, `getTargetsIntroducedIn`.
- Errors: `CurriculumImportError`, `CurriculumIssue`, `formatIssue`, and the
  eleven `CURRICULUM_*` codes.

## 6. Generated registry location

`generated/curriculum/a1/` — committed, ~5.2 MB, 12 JSON files with
`release.json` as manifest. Release `A1-CURRICULUM-v1.44`, schema
`curriculum-registry/1.0.0`.

## 7. Open contradictions

None blocking. Two superseded columns were identified and resolved from the
data (`v1_43_*` story columns; `v1_42_total_first_intro_objects` per
island/module) — full reasoning in `docs/curriculum-import.md`, "Findings in the
published data". Nothing was edited in the canonical CSVs.

## 8. Technical debt deliberately deferred

- The coverage ledger (`..._coverage_final_v1.40.csv`) is hashed and
  schema-checked but its non-numeric expectations (`"599 Lexemes"`,
  `"20/20 domains"`) are not parsed into count checks; the numeric sequencing
  audit covers 13 controls instead.
- Modules/islands keep a few descriptive planning fields as raw strings
  (`story_architecture`, `function_*` id lists) rather than parsed structures;
  nothing in phase 1 needed them typed.
- `readRegistry` verifies identity and counts, not every invariant, on load.
- No incremental/partial import: an import is always whole-release.
- The 170 MWU source units without lexeme identity stay unlinked by design.

## 9. Constraints phase 2 must respect

- **Do not regenerate ids.** `LEX-A1-*`, `FORM-A1-*`, `SENSE-A1-*`, `GRAM-A1-*`,
  `SA-A1-*`, MWU `NNBn-MWU-NNNN` are published and immutable. Never derive an id
  from a surface string.
- **Do not recompute CEFR level** from frequency, cognates or NLP. Level comes
  from SourceAssertions only.
- **Do not promote all MWUs to Lexemes.** Only 44 of 214 have lexeme identity;
  that is a curricular decision, not missing data.
- **Do not parse CSV at request time** or in React components. Consume the
  generated registry.
- Six A2 boundary senses exist in the registry and must stay out of A1
  scheduling. Sixteen regional receptive targets must never acquire universal
  productive demand.
- Recycle edges are scheduling requirements, never mastery assertions.
- Prototypes (`lib/curriculum.ts`, `lib/lexical-prototype.ts`,
  `lib/learner-event-prototype.ts`, `components/story-reader.tsx`) are untouched
  fixtures; phase 2 may replace `lib/lexical-prototype.ts` when the real engine
  lands, but phase 1 did not.
- If a source file changes, rerun `npm run curriculum:import`; `query.test.ts`
  fails when the committed registry drifts from the sources.

## 10. Push confirmation

Pushed to `origin/prueba`: `e3cdea8..cb63cb2`. Verified — local `HEAD` and
`origin/prueba` both at `cb63cb2bfe1c77535e505bd4ba8f8246a7113e19`. This handoff
note itself lands in the follow-up commit on the same branch.
