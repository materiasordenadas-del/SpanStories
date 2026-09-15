# A1 Dictionary

## Purpose

SpanStories keeps **curricular identity** and **learner-facing dictionary content** separate.

The curriculum and lexical engine remain the authority for:

- `LexemeId` and `SenseId`;
- lexical forms and homographs;
- A1 vs A2-boundary status;
- MWU identity policy;
- story allocations and recycling.

The dictionary adds learner-facing content only:

- English translation/gloss;
- learner-facing part-of-speech label;
- short Spanish explanation;
- examples and translations where the source publishes them;
- related words;
- approximate frequency band;
- source provenance.

The dictionary must never create a `Lexeme` or `Sense` from surface text.

## Canonical keys

The primary lookup key is `SenseId`, not spelling.

```text
StoryOccurrence
  -> SenseId
  -> A1 dictionary enrichment
  -> WordPanelViewModel
```

This means `soy`, `es`, `eres`, etc. can resolve through the same lexical identity instead of becoming unrelated dictionary cards.

A published MWU is addressed by `MwuUnitId`. This is necessary because the curriculum intentionally publishes 170 MWUs with `NO_LEXICAL_IDENTITY`; the dictionary must not invent Lexemes for them.

## A1 inventory invariants

For `A1-CURRICULUM-v1.51`:

- A1 Senses: **602**
- A2 boundary Senses excluded from the A1 dictionary: **6**
- Lexemes: **599**
- LexemeForms: **666**
- MWU units: **214**
- MWUs without lexical identity: **170**

`features/dictionary/registry.ts` reconstructs the addressable dictionary from the canonical curriculum at runtime and rejects unknown, duplicated, or non-A1 Sense enrichment.

## Data layers

```text
generated/curriculum/a1/*
        |
        v
features/dictionary/registry.ts
        ^
        |
generated/dictionary/a1/enrichments.json   external/open data
        ^
        |
features/dictionary/a1-editorial.ts         SpanStories overrides
```

Generated data is the baseline. Editorial content has final precedence so SpanStories can refine wording for a specific learner-facing experience without mutating curricular identity.

## External import

Run:

```bash
npm run dictionary:import:a1
```

The importer reads the canonical `senses.json` and `lexemes.json`, then resolves learner-facing data against open lexical sources. It does **not** resolve identity by comparing story surface strings.

Current source roles:

1. Kaikki / English Wiktionary Spanish entries: English glosses and bilingual usage examples.
2. Kaikki / Spanish Wiktionary (`Wikcionario`) entries: Spanish definitions, POS labels, and lexical relations.
3. `doozan/spanish_data/frequency.csv`: approximate frequency bands/ranks.

The imported result is written to:

- `generated/dictionary/a1/enrichments.json`
- `generated/dictionary/a1/manifest.json`
- `generated/dictionary/a1/audit.json`

The importer caches raw source responses under `.cache/dictionary/`; the cache is ignored by Git.

### Refresh

```bash
npm run dictionary:refresh:a1
```

This bypasses the local source cache.

### Check

```bash
npm run dictionary:check:a1
```

The check verifies that generated dictionary IDs map onto the canonical A1 Sense inventory and reports coverage. `--strict` additionally rejects missing core learner fields (`translation`, POS, short usage).

## Polysemy

External dictionary sense inventories are broader than the SpanStories curriculum. They are not allowed to redefine the curriculum.

The importer uses:

- published POS/category information when available;
- `lexemeKey` homograph annotations;
- published `senseKey` / `sourceAssertionScopeKey` hints for explicitly scoped curricular senses;
- source ordering only as a final fallback.

The audit records every Lexeme with multiple A1 Senses in `multiSenseReview`. Those mappings require review rather than silent surface-based merging.

## Story reader integration

`features/story-reader/word-panel.ts` resolves dictionary enrichment only after a `LexicalOccurrence` has resolved its canonical Sense.

Ownership remains split deliberately:

| Panel content | Authority |
| --- | --- |
| word surface | StoryOccurrence |
| lexical identity | Lexical Engine / Curriculum |
| A1 badge | Curriculum |
| translation / usage / examples | A1 Dictionary |
| current sentence | Story Engine |
| other occurrences in same story | Story Engine |
| save/practice state | Practice domain |
| browser pronunciation | Speech adapter |

A `SURFACE` token with no published lexical identity remains selectable, but it is not assigned a fabricated dictionary Sense.

## Source licensing

External content carries source provenance in every generated entry. See [`docs/dictionary-sources.md`](./dictionary-sources.md) before redistributing generated dictionary data.
