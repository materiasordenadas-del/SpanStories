# Architecture documents — canonical copies

These documents are the project's technical authority for the engine. **The
copies in this repository are canonical.**

They were previously kept only in a local folder outside the repository
(`D:\Español\Arquitectura\`). That made the repo unable to reconstruct its own
technical context and risked two diverging authorities. The versioned copies
here are now the reference; a local folder copy is a convenience mirror, not an
authority. Update these files, and treat any out-of-repo copy as stale unless it
was refreshed from here.

| Document | Canonical path | Scope |
| --- | --- | --- |
| Platform architecture v1.0 | `docs/architecture/plataforma-arquitectura-v1.0.md` | Whole-platform architecture: domain, layering, runtime rules |
| Engine implementation plan v1.0 | `docs/architecture/plan-implementacion-motor-v1.0.md` | Phases 1–6 of the canonical engine, per-phase gates |
| Engine phase 1 spec v1.0 | `docs/architecture/fases-motor/fase1-curriculum-importer-registry-v1.0.md` | Curriculum Importer + Registry |
| Engine phase 2 spec v1.0 | `docs/architecture/fases-motor/fase2-lexical-engine-v1.0.md` | Lexical Engine |
| Lexical Engine domain spec v0.4 | `docs/lexical-engine.md` | Conceptual domain model of lexical identity |

`docs/lexical-engine.md` sits at the repository root of `docs/` rather than
under `architecture/` because the document itself declares that path. Phase 2's
audit recorded its absence from the repo as an unresolved gap; this closes it.

## Related, and deliberately not duplicated

| Document | What it is |
| --- | --- |
| `docs/curriculum-import.md` | Phase 1 **implementation** notes — how the importer actually works, its invariants and findings |
| `docs/lexical-engine-implementation.md` | Phase 2 **implementation** notes and audit findings |
| `docs/story-engine-implementation.md` | Phase 3 **implementation** notes, design decisions and audit findings |
| `docs/learner-progress-implementation.md` | Phase 4 **implementation** notes, design decisions and audit findings |
| `docs/data-model.md` | Phase 5 schema reference |
| `docs/persistence.md` | Phase 5 **implementation** notes, DB-access decision and audit findings |
| `docs/curriculum/a1-restructure/` | The approved A–H curricular package for `A1-CURRICULUM-v1.51` |
| `HANDOFF_NEXT_PHASE.md` | Current phase status and the handoff to phase 6 |

The specification documents above state what must be built and why. The
implementation notes state what was built and what the data turned out to be.
Neither replaces the other, and neither is a copy of the other.

## Current state

All five documents were updated for the atomic phase 1 + phase 2 migration to
`A1-CURRICULUM-v1.51`:

```text
CurriculumRelease = A1-CURRICULUM-v1.51        BASELINE ACTIVO
Registry schema   = curriculum-registry/2.0.0
8 modules / 11 islands / 32 StoryBlueprints
985 first introductions = 448 FOCUS + 537 SUPPORTED
2867 recycle edges = 985 FIRST + 950 SECOND + 932 THIRD

LexiconRelease                     = A1-LEXICON-v1.0
LexiconRelease.curriculumReleaseId = A1-CURRICULUM-v1.51

Fase 1 = MIGRATED / PASS
Fase 2 = REVALIDATED / PASS
Fase 3 = STORY ENGINE / PASS
Fase 4 = LEARNER EVENT ENGINE / PASS
Fase 5 = POSTGRESQL (PGlite) / PASS
Fase 6 = READY — implementation NOT STARTED
```

Where these documents still mention `A1-CURRICULUM-v1.44`, 32 islands, 103
StoryBlueprints or 2955 recycle edges, the figures are labelled
`HISTORICAL BASELINE` / `SUPERSEDED` at the point of use. The v1.44 history is
kept deliberately — that release was audited and remains traceable, and its
sequencing sources are archived verbatim under
`content/a1/vocabulary/respaldo/a1-curriculum-v1.44/`.
