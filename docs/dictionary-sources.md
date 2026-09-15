# Dictionary source attribution

SpanStories dictionary enrichment is generated from open lexical datasets. The generated artifact preserves a `sources` array per Sense so provenance survives normalization.

## Kaikki.org / Wiktextract

Kaikki provides machine-readable postprocessed extracts of Wiktionary editions produced with Wiktextract.

SpanStories currently uses two views:

- Spanish entries extracted from **English Wiktionary**, for English glosses and bilingual examples: `https://kaikki.org/dictionary/Spanish/`
- Spanish entries extracted from **Spanish Wiktionary / Wikcionario**, for Spanish definitions, POS metadata and lexical relations: `https://kaikki.org/eswiktionary/Español/`

Wiktionary content is reusable under its applicable Creative Commons ShareAlike terms. Kaikki requests citation of Wiktextract when the extracted data is used in research. Generated records retain a stable page reference to the source entry.

Project references:

- Kaikki: `https://kaikki.org/`
- Wiktextract: `https://github.com/tatuylonen/wiktextract`
- English Wiktionary: `https://en.wiktionary.org/`
- Spanish Wiktionary: `https://es.wiktionary.org/`

When publishing or redistributing generated dictionary data, preserve attribution and comply with the applicable ShareAlike license requirements.

## doozan/spanish_data frequency data

Repository: `https://github.com/doozan/spanish_data`

The project's `frequency.csv` combines Spanish lemma frequency information and is documented by that project as CC-BY-SA 3.0 data derived from FrequencyWords. SpanStories uses it only to create an approximate learner-facing frequency band/rank; it does not use frequency as evidence that a Sense belongs to A1.

The source repository also contains Wiktionary/Tatoeba-derived data, but the current importer uses only `frequency.csv` from this project.

## SpanStories editorial layer

`features/dictionary/a1-editorial.ts` contains wording authored specifically for SpanStories. It overrides generated enrichment by `SenseId` without changing lexical identity or curricular status.

## Separation from curricular authority

No external dictionary source is allowed to:

- promote an A2-boundary Sense to A1;
- create a new Lexeme or Sense;
- merge published homographs;
- alter MWU identity policy;
- determine story allocation or mastery.

Those remain properties of the canonical SpanStories curriculum and lexical engine.
