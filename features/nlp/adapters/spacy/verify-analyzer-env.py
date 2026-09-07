#!/usr/bin/env python3
"""
Corrección E §32 — reproducible install/verify for the NLP analyzer's Python
environment.

Usage:
    python -m pip install -r features/nlp/adapters/spacy/requirements.txt
    python features/nlp/adapters/spacy/verify-analyzer-env.py

Exits 0 only if the installed spaCy and `es_core_news_sm` versions exactly
match the governed pin declared in both `requirements.txt` (this directory)
and `../../domain/analyzer-config.ts` (the TypeScript side reads its own
copy of the same two strings — this script does not import TypeScript, so
the values are duplicated here deliberately; keep both files' comments
pointing at each other so a bump is never made in just one place).

Never installs or downloads anything itself — this is check-only, so it is
safe to run in CI or a fresh clone without side effects.
"""

import sys

EXPECTED_SPACY_VERSION = "3.8.16"
EXPECTED_MODEL_NAME = "es_core_news_sm"
EXPECTED_MODEL_VERSION = "3.8.0"


def main() -> int:
    try:
        import spacy
    except ImportError as exc:
        print(f"FAIL: spaCy is not installed ({exc}). Run: pip install -r requirements.txt", file=sys.stderr)
        return 1

    problems = []
    if spacy.__version__ != EXPECTED_SPACY_VERSION:
        problems.append(f"spaCy {spacy.__version__} installed, expected {EXPECTED_SPACY_VERSION}")

    try:
        nlp = spacy.load(EXPECTED_MODEL_NAME)
    except OSError as exc:
        print(f"FAIL: model {EXPECTED_MODEL_NAME!r} is not installed ({exc}). Run: pip install -r requirements.txt", file=sys.stderr)
        return 1

    model_version = nlp.meta.get("version", "unknown")
    if model_version != EXPECTED_MODEL_VERSION:
        problems.append(f"model {EXPECTED_MODEL_NAME} version {model_version} installed, expected {EXPECTED_MODEL_VERSION}")

    if problems:
        print("FAIL: ANALYZER_VERSION_MISMATCH", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    print(f"OK: spaCy {spacy.__version__}, {EXPECTED_MODEL_NAME} {model_version} — matches the governed pin")
    return 0


if __name__ == "__main__":
    sys.exit(main())
