import type { LearnerDeclaredState } from "@/lib/lexical-prototype";

export const LEARNER_EVENT_STORAGE_KEY = "spanstories.learner-events.v1";
export const LEARNER_EVENT_SCHEMA_VERSION = 1 as const;
export const PROTOTYPE_LEXICON_RELEASE = "prototype-a1-r1";
export const PROJECTION_ALGORITHM_VERSION = "1";

export type LearnerEventType = "WORD_OPENED" | "STATE_DECLARED";

type LearnerEventBase = {
  id: string;
  type: LearnerEventType;
  occurredAt: string;
  storyId: string;
  occurrenceId: string;
  recordedLexemeId: string;
  recordedSenseId: string;
  lexiconRelease: string;
};

export type WordOpenedEvent = LearnerEventBase & {
  type: "WORD_OPENED";
};

export type StateDeclaredEvent = LearnerEventBase & {
  type: "STATE_DECLARED";
  value: LearnerDeclaredState;
};

export type LearnerEvent = WordOpenedEvent | StateDeclaredEvent;

export type LearnerEventLog = {
  schemaVersion: typeof LEARNER_EVENT_SCHEMA_VERSION;
  events: readonly LearnerEvent[];
};

export type LearnerLexemeStateProjection = {
  states: Readonly<Record<string, LearnerDeclaredState>>;
  lexiconRelease: string;
  projectionAlgorithmVersion: string;
  calculatedAt: string;
  eventCutoff: string | null;
};

export type StoryProgressProjection = {
  eventCount: number;
  wordOpenCount: number;
  encounteredLexemeCount: number;
  declaredLexemeCount: number;
  newCount: number;
  learningCount: number;
  knownCount: number;
};

const DECLARED_STATES: readonly LearnerDeclaredState[] = [
  "NEW",
  "LEARNING",
  "KNOWN",
];

function createEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeclaredState(value: unknown): value is LearnerDeclaredState {
  return DECLARED_STATES.includes(value as LearnerDeclaredState);
}

function hasValidBaseFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === "string" &&
    typeof value.occurredAt === "string" &&
    typeof value.storyId === "string" &&
    typeof value.occurrenceId === "string" &&
    typeof value.recordedLexemeId === "string" &&
    typeof value.recordedSenseId === "string" &&
    typeof value.lexiconRelease === "string"
  );
}

export function isLearnerEvent(value: unknown): value is LearnerEvent {
  if (!isRecord(value) || !hasValidBaseFields(value)) {
    return false;
  }

  if (value.type === "WORD_OPENED") {
    return true;
  }

  return value.type === "STATE_DECLARED" && isDeclaredState(value.value);
}

export function loadLearnerEvents(storage: Storage): LearnerEvent[] {
  try {
    const serialized = storage.getItem(LEARNER_EVENT_STORAGE_KEY);

    if (!serialized) {
      return [];
    }

    const parsed: unknown = JSON.parse(serialized);

    if (!isRecord(parsed) || parsed.schemaVersion !== LEARNER_EVENT_SCHEMA_VERSION) {
      return [];
    }

    if (!Array.isArray(parsed.events)) {
      return [];
    }

    return parsed.events.filter(isLearnerEvent);
  } catch {
    return [];
  }
}

export function saveLearnerEvents(
  storage: Storage,
  events: readonly LearnerEvent[],
): void {
  const payload: LearnerEventLog = {
    schemaVersion: LEARNER_EVENT_SCHEMA_VERSION,
    events,
  };

  storage.setItem(LEARNER_EVENT_STORAGE_KEY, JSON.stringify(payload));
}

type EventInput = {
  storyId: string;
  occurrenceId: string;
  recordedLexemeId: string;
  recordedSenseId: string;
};

function createBaseEvent(input: EventInput): Omit<LearnerEventBase, "type"> {
  return {
    id: createEventId(),
    occurredAt: new Date().toISOString(),
    storyId: input.storyId,
    occurrenceId: input.occurrenceId,
    recordedLexemeId: input.recordedLexemeId,
    recordedSenseId: input.recordedSenseId,
    lexiconRelease: PROTOTYPE_LEXICON_RELEASE,
  };
}

export function createWordOpenedEvent(input: EventInput): WordOpenedEvent {
  return {
    ...createBaseEvent(input),
    type: "WORD_OPENED",
  };
}

export function createStateDeclaredEvent(
  input: EventInput,
  value: LearnerDeclaredState,
): StateDeclaredEvent {
  return {
    ...createBaseEvent(input),
    type: "STATE_DECLARED",
    value,
  };
}

export function projectLearnerLexemeStates(
  events: readonly LearnerEvent[],
): LearnerLexemeStateProjection {
  const states: Record<string, LearnerDeclaredState> = {};

  for (const event of events) {
    if (event.type === "STATE_DECLARED") {
      states[event.recordedLexemeId] = event.value;
    }
  }

  return {
    states,
    lexiconRelease: PROTOTYPE_LEXICON_RELEASE,
    projectionAlgorithmVersion: PROJECTION_ALGORITHM_VERSION,
    calculatedAt: new Date().toISOString(),
    eventCutoff: events.at(-1)?.occurredAt ?? null,
  };
}

export function projectStoryProgress(
  events: readonly LearnerEvent[],
  storyId: string,
): StoryProgressProjection {
  const storyEvents = events.filter((event) => event.storyId === storyId);
  const openedLexemeIds = new Set<string>();
  const states: Record<string, LearnerDeclaredState> = {};
  let wordOpenCount = 0;

  for (const event of storyEvents) {
    if (event.type === "WORD_OPENED") {
      wordOpenCount += 1;
      openedLexemeIds.add(event.recordedLexemeId);
      continue;
    }

    states[event.recordedLexemeId] = event.value;
  }

  const currentStates = Object.values(states);

  return {
    eventCount: storyEvents.length,
    wordOpenCount,
    encounteredLexemeCount: openedLexemeIds.size,
    declaredLexemeCount: currentStates.length,
    newCount: currentStates.filter((state) => state === "NEW").length,
    learningCount: currentStates.filter((state) => state === "LEARNING").length,
    knownCount: currentStates.filter((state) => state === "KNOWN").length,
  };
}

export function getEventsForLexeme(
  events: readonly LearnerEvent[],
  lexemeId: string,
): LearnerEvent[] {
  return events.filter((event) => event.recordedLexemeId === lexemeId);
}
