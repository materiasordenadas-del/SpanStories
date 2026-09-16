import { test } from "node:test";
import assert from "node:assert/strict";
import { createKnowledgeEvent, migrateDeclaredState, type KnowledgeEvent } from "../domain/knowledge.ts";
import { projectKnowledge } from "../engine/knowledge-projection.ts";
import { DAY, REVIEW_POLICY_V1, scheduleReview } from "../engine/review-scheduler.ts";
import { InMemoryKnowledgeEventRepository, LocalKnowledgeEventRepository } from "../repository/knowledge-event-repository.ts";
import { importBrowserLegacyDeclarations } from "../engine/knowledge-legacy.ts";

const epoch = Date.parse("2026-01-01T00:00:00Z");
const iso = (days: number) => new Date(epoch + days * DAY).toISOString();
function event(day: number, patch: Partial<KnowledgeEvent> = {}): KnowledgeEvent {
  return createKnowledgeEvent({ eventId: String(day), learnerId: "ana", targetKey: "SENSE:a", kind: "PRACTICE", occurredAt: iso(day),
    storyVersionId: `story-${day}`, occurrenceId: `occ-${day}`, curriculumRelease: "1", lexiconRelease: "1",
    attemptId: String(day), practiceSessionId: String(day), evidence: "MEANING_RECALL", outcome: "correct", ...patch });
}
const project = (events: KnowledgeEvent[], productive = false) => projectKnowledge(events, "ana", "SENSE:a", productive, iso(100));
const stable = () => [event(0, { evidence: "RECOGNITION" }), event(1), event(4), event(30)];

test("lookup activates NEW; exposure/reveal never establish mastery", () => {
  assert.equal(project([event(0, { kind: "OCCURRENCE_OPENED" })]).computedState, "NEW");
  assert.equal(project([event(0, { kind: "OCCURRENCE_ENCOUNTERED" })]).computedState, "UNSEEN");
  assert.equal(project(Array.from({ length: 30 }, (_, i) => event(i, { kind: "MEANING_REVEALED" }))).computedState, "NEW");
});
test("recognition is evidence; seconds cannot become days of stability", () => {
  assert.equal(project([event(0, { evidence: "RECOGNITION" })]).computedState, "RECOGNIZED");
  assert.equal(project([event(0), event(0.0001), event(0.0002)]).computedState, "RECOGNIZED");
});
test("spacing and distinct successful contexts are required", () => {
  assert.equal(project(stable()).computedState, "KNOWN");
  assert.equal(project(stable().map(e => ({ ...e, storyVersionId: "same" }))).computedState, "RECOGNIZED");
  assert.equal(project(stable().map(e => ({ ...e, storyVersionId: "same" }))).contextDiversity, 1);
  assert.equal(project(stable().map(e => ({ ...e, evidence: "RECOGNITION" }))).computedState, "FAMILIAR");
});
test("productive targets need form recall; receptive targets do not", () => {
  assert.equal(project(stable(), true).computedState, "FAMILIAR");
  assert.equal(project(stable().map(e => ({ ...e, evidence: "FORM_RECALL" })), true).computedState, "KNOWN");
});
test("one lapse does not erase knowledge; repeated errors demote gradually", () => {
  const events = [...stable(), event(31, { outcome: "incorrect" })];
  assert.equal(project(events).computedState, "KNOWN");
  assert.equal(project(events).nextReviewAt, iso(32));
  assert.equal(project([...events, event(32, { outcome: "incorrect" })]).computedState, "LEARNED");
});
test("revealed, assisted, skipped, and duplicate attempts are not independent recall", () => {
  assert.equal(project([event(0, { kind: "MEANING_REVEALED" }), event(0.001)]).successfulRetrievalCount, 0);
  assert.equal(project([event(0, { assisted: true }), event(1, { outcome: "skipped" })]).successfulRetrievalCount, 0);
  assert.equal(project([event(0), event(1, { attemptId: "0" })]).successfulRetrievalCount, 1);
});
test("self reports and legacy migrations never fake computed evidence", () => {
  for (const legacy of ["NEW", "LEARNING", "KNOWN"] as const) {
    const p = project([event(0, { kind: "STATE_DECLARED", declaredState: migrateDeclaredState(legacy), source: "LEGACY_MIGRATION" })]);
    assert.equal(p.computedState, "NEW");
    assert.equal(p.successfulRetrievalCount, 0);
    assert.equal(p.declaredState, legacy === "LEARNING" ? "RECOGNIZED" : legacy);
  }
});
test("replay is deterministic, immutable, deduplicated and isolated by learner and sense", () => {
  const events = stable();
  assert.deepEqual(project(events), project([...events].reverse()));
  assert.deepEqual(project(events), project([...events, events[0]]));
  assert.throws(() => { (events[0] as { outcome: string }).outcome = "incorrect"; }, TypeError);
  assert.equal(project(events.map(e => ({ ...e, learnerId: "bob" }))).computedState, "UNSEEN");
  assert.equal(project(events.map(e => ({ ...e, targetKey: "SENSE:b" }))).computedState, "UNSEEN");
});
test("repositories rebuild the same projection and retain concurrent event writes", () => {
  const data = new Map<string, string>();
  const storage = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const a = new LocalKnowledgeEventRepository(storage), b = new LocalKnowledgeEventRepository(storage), memory = new InMemoryKnowledgeEventRepository();
  stable().forEach((e, i) => { (i % 2 ? a : b).append(e); memory.append(e); });
  assert.deepEqual(project([...a.listForLearner("ana")]), project([...memory.listForLearner("ana")]));
  assert.deepEqual(a.listForLearner("bob"), []);
  assert.throws(() => a.append({ ...stable()[0], kind: "SAVED" }), /Conflicting/);
});

test("browser legacy migration preserves dates and identity, never assigns anonymous data to an account", () => {
  const raw = { events: [{ id: "old1", type: "STATE_DECLARED", occurredAt: iso(0), recordedSenseId: "SENSE-A1-000001", recordedLexemeId: "LEX-A1-000001", value: "KNOWN" }] };
  assert.deepEqual(importBrowserLegacyDeclarations(raw, "user:ana"), []);
  const events = importBrowserLegacyDeclarations(raw, "guest");
  assert.equal(events[0].targetKey, "SENSE:SENSE-A1-000001");
  const p = projectKnowledge(events, "guest", events[0].targetKey, true, iso(1));
  assert.equal(p.computedState, "NEW");
  assert.equal(p.declaredState, "KNOWN");
  assert.equal(p.nextReviewAt, null);
});
test("skip never changes due date; assisted success cannot expand the interval", () => {
  const saved = event(0, { kind: "SAVED" });
  assert.equal(project([saved, event(10, { outcome: "skipped" })]).nextReviewAt, iso(1));
  assert.equal(project([saved, event(10, { assisted: true })]).nextReviewAt, iso(11));
  assert.equal(scheduleReview("NEW", null, [saved], { ...REVIEW_POLICY_V1, NEW: 2 }), iso(2));
});
test("a future event is not included in an earlier replay and timestamp offsets sort by instant", () => {
  const events = [event(0), event(1)];
  assert.equal(projectKnowledge(events, "ana", "SENSE:a", true, iso(0)).eventCutoff, "0");
  assert.deepEqual(project(events), project([{ ...events[0], occurredAt: "2025-12-31T20:00:00-04:00" }, events[1]]));
});
