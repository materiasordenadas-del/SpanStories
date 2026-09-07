/**
 * In-memory `AnnotationAcceptanceUnitOfWork` — there is no real transaction
 * to run here (an in-process `Map` write cannot partially commit), so this
 * simply performs the decision-first-then-revision ordering directly: the
 * decision repository's own exactly-once lock (`InMemoryAnnotationDecisionRepository`)
 * is the only exclusion needed in a single Node.js process. See
 * `../domain/acceptance-unit-of-work.ts`.
 */

import type { OccurrenceAnnotationRevision, StoryRepository } from "../../story-engine/index.ts";
import type { AnnotationAcceptanceUnitOfWork } from "../domain/acceptance-unit-of-work.ts";
import type { AnnotationDecisionRepository, RecordAcceptedInput } from "../domain/decision-repository.ts";
import type { AnnotationCandidateDecision } from "../domain/decision.ts";

export class InMemoryAnnotationAcceptanceUnitOfWork implements AnnotationAcceptanceUnitOfWork {
  private readonly storyRepository: StoryRepository;
  private readonly decisionRepository: AnnotationDecisionRepository;

  constructor(storyRepository: StoryRepository, decisionRepository: AnnotationDecisionRepository) {
    this.storyRepository = storyRepository;
    this.decisionRepository = decisionRepository;
  }

  async runRevisionAcceptance(
    revision: OccurrenceAnnotationRevision,
    decision: RecordAcceptedInput & { readonly resultKind: "REVISION" },
  ): Promise<AnnotationCandidateDecision> {
    const recorded = await this.decisionRepository.recordAccepted(decision);
    await this.storyRepository.appendAnnotationRevision(revision);
    return recorded;
  }
}
