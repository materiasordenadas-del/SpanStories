import type { StudentProgress } from "./progress-service";
import type { PracticeEvent, ProgressEvent } from "./progress-summary";
import type { TeacherTask } from "./types";

/** La finalización se deriva del progreso del estudiante; no hay una marca editable por él. */
export function isTaskCompleted(task: TeacherTask, progress: StudentProgress, events: readonly ProgressEvent[]): boolean {
  if (task.kind === "story") return progress.finishedStories.includes(task.content.storyKey);
  const afterStart = events.filter((event): event is PracticeEvent => event.kind === "practice" && (event.at === null || event.at >= task.startsAt.toDate()));
  if (task.kind === "flashcards") return afterStart.some((event) => event.mode === "tarjetas" && event.total >= task.content.minimumCards);
  return afterStart.some((event) => event.mode === "verbos" && event.source === task.content.source && event.total >= task.content.minimumQuestions);
}

export function taskContentLabel(task: TeacherTask, storyTitle?: (key: string) => string | undefined): string {
  if (task.kind === "story") return storyTitle?.(task.content.storyKey) ?? `Historia ${task.content.storyKey}`;
  if (task.kind === "flashcards") return `${task.content.minimumCards} tarjetas guardadas`;
  return `${task.content.minimumQuestions} preguntas · ${task.content.source === "todos" ? "verbos A1" : "verbos guardados"}`;
}

export function taskKindLabel(task: TeacherTask): string {
  return task.kind === "story" ? "Historia" : task.kind === "flashcards" ? "Tarjetas" : "Verbos";
}
