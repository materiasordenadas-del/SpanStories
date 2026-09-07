#!/usr/bin/env python3
"""
NLP analyzer bridge — Node <-> Python contract (`BRIDGE_CONTRACT_VERSION`
must match `../spacy/spacy-analyzer.ts`'s own constant; a mismatch is a hard
error, not a warning).

Reads one JSON object from stdin, writes exactly one JSON object to stdout,
and nothing else on stdout ever — every diagnostic goes to stderr, so a
caller reading stdout on exit code 0 can always `json.loads` it directly.

Input:
  {
    "contractVersion": "1.0.0",
    "modelName": "es_core_news_sm",
    "expectedSpacyVersion": "3.8.16" | null,
    "expectedModelVersion": "3.8.0" | null,
    "sentences": [{"sentenceIndex": 0, "text": "..."}, ...]
  }

`expectedSpacyVersion`/`expectedModelVersion` are the governed pin from
`../../domain/analyzer-config.ts` (Node is the single source of truth for
these two strings; this script never hardcodes its own copy). When either is
non-null and does not match what actually loaded, this script fails loudly
(`ANALYZER_VERSION_MISMATCH`) rather than silently analyzing under a
different spaCy/model version than the one this codebase was built and
tested against.

Output:
  {
    "contractVersion": "1.0.0",
    "analyzer": "spaCy",
    "analyzerVersion": "<spacy.__version__>",
    "modelName": "es_core_news_sm",
    "modelVersion": "<model package version>",
    "sentences": [
      {
        "sentenceIndex": 0,
        "text": "...",
        "tokens": [
          {"index": 0, "surface": "...", "start": 0, "end": 5,
           "lemma": "...", "pos": "...", "tag": "...",
           "morphology": "..." | null, "depRelation": "...", "headIndex": 0}
        ]
      }
    ]
  }

Offsets (`start`/`end`) are Unicode **code point** indices, half-open
`[start, end)` — Python's `str` is already code-point indexed (`tok.idx`,
`len(tok.text)`), so no conversion happens here. The Node side must resolve
these with `codePointLength`/`resolveAnchorText`
(`features/story-engine/domain/anchors.ts`), never raw `.slice()`/`.length`
(UTF-16 code units) — see `../../__tests__/offsets.test.ts`.

This script never touches PostgreSQL, never imports the curriculum registry,
and never writes anything but this one JSON object to stdout. It has no
authority: everything it proposes is only ever a candidate.
"""

import json
import sys

BRIDGE_CONTRACT_VERSION = "1.0.0"


def fail(message: str) -> "NoReturn":  # type: ignore[name-defined]
    print(message, file=sys.stderr, flush=True)
    sys.exit(1)


def main() -> None:
    # Force UTF-8 regardless of the host's console code page — Windows in
    # particular defaults stdio to a locale-specific codepage that mangles
    # "ñ", "á", "¿", "¡" and astral characters (emoji) otherwise.
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"ANALYZER_BRIDGE_FAILURE: invalid JSON on stdin: {exc}")
        return

    contract_version = payload.get("contractVersion")
    if contract_version != BRIDGE_CONTRACT_VERSION:
        fail(
            "ANALYZER_BRIDGE_FAILURE: contract version mismatch "
            f"(script={BRIDGE_CONTRACT_VERSION!r}, input={contract_version!r})"
        )
        return

    model_name = payload.get("modelName", "es_core_news_sm")
    expected_spacy_version = payload.get("expectedSpacyVersion")
    expected_model_version = payload.get("expectedModelVersion")
    sentences = payload.get("sentences", [])
    if not isinstance(sentences, list):
        fail("ANALYZER_BRIDGE_FAILURE: 'sentences' must be a list")
        return

    try:
        import spacy
    except ImportError as exc:
        fail(f"ANALYZER_BRIDGE_FAILURE: spaCy is not installed: {exc}")
        return

    if expected_spacy_version is not None and spacy.__version__ != expected_spacy_version:
        fail(
            "ANALYZER_VERSION_MISMATCH: spaCy "
            f"{spacy.__version__} is installed but {expected_spacy_version} is the governed version "
            "(features/nlp/domain/analyzer-config.ts) — install the pinned version rather than running "
            "under an unreviewed one"
        )
        return

    try:
        nlp = spacy.load(model_name)
    except OSError as exc:
        fail(f"ANALYZER_BRIDGE_FAILURE: could not load model {model_name!r}: {exc}")
        return

    model_version = nlp.meta.get("version", "unknown")

    if expected_model_version is not None and model_version != expected_model_version:
        fail(
            f"ANALYZER_VERSION_MISMATCH: model {model_name} version {model_version} is installed but "
            f"{expected_model_version} is the governed version (features/nlp/domain/analyzer-config.ts)"
        )
        return

    output_sentences = []
    for entry in sentences:
        sentence_index = entry["sentenceIndex"]
        text = entry["text"]
        doc = nlp(text)
        tokens = []
        for tok in doc:
            morph_str = str(tok.morph)
            tokens.append(
                {
                    "index": tok.i,
                    "surface": tok.text,
                    "start": tok.idx,
                    "end": tok.idx + len(tok.text),
                    "lemma": tok.lemma_,
                    "pos": tok.pos_,
                    "tag": tok.tag_,
                    "morphology": morph_str if morph_str else None,
                    "depRelation": tok.dep_,
                    "headIndex": tok.head.i,
                }
            )
        output_sentences.append({"sentenceIndex": sentence_index, "text": text, "tokens": tokens})

    result = {
        "contractVersion": BRIDGE_CONTRACT_VERSION,
        "analyzer": "spaCy",
        "analyzerVersion": spacy.__version__,
        "modelName": model_name,
        "modelVersion": model_version,
        "sentences": output_sentences,
    }
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
