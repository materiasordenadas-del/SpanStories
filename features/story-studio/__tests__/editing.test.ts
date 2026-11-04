import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioRehearsal } from '../demo.ts';
import { validateProject, type StudioProject } from '../model.ts';
import {
  addScene, analyzeFlow, autoStageDialogue, chainCue, changeSceneZone, createSequence, deleteActor, deleteCue, deleteScene, deleteSequence,
  dialogueDuration, duplicateCue, duplicateSequence, guessSpeaker, incomingReferences, moveSequence, nextCueStart, placeDialogue, sentenceCoverage,
  setSceneEntries, snapCue, stageUnusedSentences, suggestSentence,
} from '../editing.ts';

function withActors() {
  const { source, project } = buildStudioRehearsal();
  const scene = project.scenes[0];
  scene.actors.push({ id: 'samuel', characterId: 'samuel', name: 'Samuel', position: [0, 0, 0], rotation: 0, height: 1.7 });
  scene.actors.push({ id: 'ana', characterId: 'samuel', name: 'Ana', position: [2, 0, 0], rotation: 0, height: 1.6 });
  return { source, project };
}
const seq = (p: StudioProject, i = 0) => p.scenes[0].sequences[i];

test('new cues start at the playhead or after whatever occupies the track', () => {
  const { project } = buildStudioRehearsal();
  const s = seq(project); // one dialogue 0–3 s
  assert.equal(nextCueStart(s, 'dialogue', 0), 3);
  assert.equal(nextCueStart(s, 'dialogue', 1.2), 3);
  assert.equal(nextCueStart(s, 'dialogue', 4), 4);
  assert.equal(nextCueStart(s, 'camera', 1.2), 1.2);
});

test('dialogue duration follows the text at a learner pace', () => {
  assert.equal(dialogueDuration('Hola.'), 1.5);
  assert.equal(dialogueDuration('Mira la calle y los árboles.'), 4);
  assert(dialogueDuration('palabra '.repeat(500)) <= 60);
});

test('magnetic snapping aligns cue edges', () => {
  const { project } = buildStudioRehearsal();
  const s = seq(project);
  s.cues.push({ id: 'cam', kind: 'camera', at: 3.08, duration: 2, shot: project.scenes[0].shot, label: 'Plano' });
  assert.deepEqual(snapCue(s, 'cam', 3.08, 2), { at: 3, duration: 2 });
  assert.deepEqual(snapCue(s, 'cam', 0.5, 2.45), { at: 0.5, duration: 2.5 });
  assert.deepEqual(snapCue(s, 'cam', 1.4, 1), { at: 1.4, duration: 1 });
});

test('cues can be deleted, duplicated and chained without touching the source project', () => {
  const { source, project } = buildStudioRehearsal();
  const id = seq(project).cues[0].id;
  const dup = duplicateCue(project, seq(project).id, id);
  validateProject(dup.project, source);
  assert.equal(seq(dup.project).cues.length, 2);
  assert.equal(seq(dup.project).cues.find(c => c.id === dup.id)!.at, 3);
  const chained = chainCue(dup.project, seq(project).id, dup.id, id);
  assert.equal(seq(chained).cues.find(c => c.id === dup.id)!.at, 3);
  const removed = deleteCue(dup.project, seq(project).id, id);
  assert.deepEqual(seq(removed).cues.map(c => c.id), [dup.id]);
  assert.equal(seq(project).cues.length, 1);
  assert.throws(() => deleteCue(project, seq(project).id, 'missing'));
});

test('deleting an actor cleans its cues, gazes and speaking lines', () => {
  const { source, project } = withActors();
  const s = seq(project);
  s.cues.push({ id: 'walk', kind: 'actor', at: 0, duration: 1, actorId: 'samuel', action: 'walk' });
  s.cues.push({ id: 'look', kind: 'actor', at: 0, duration: 1, actorId: 'ana', action: 'look', lookAt: 'samuel' });
  const d = s.cues[0]; if (d.kind === 'dialogue') d.speakerId = 'samuel';
  const next = deleteActor(project, project.scenes[0].id, 'samuel');
  validateProject(next, source);
  const cues = seq(next).cues;
  assert(!cues.some(c => c.id === 'walk'));
  const look = cues.find(c => c.id === 'look'); assert(look?.kind === 'actor' && look.lookAt === undefined);
  const line = cues[0]; assert(line.kind === 'dialogue' && line.speakerId === null);
});

test('moments: delete drops dangling paths, duplicate gets new identities, reorder works', () => {
  const { source, project } = buildStudioRehearsal();
  seq(project, 0).gate.nextSequenceId = 'sequence-3';
  assert.deepEqual(incomingReferences(project, ['sequence-3']).map(s => s.id), ['sequence-1']);
  const without = deleteSequence(project, 'sequence-3');
  validateProject(without, source);
  assert.equal(seq(without, 0).gate.nextSequenceId, undefined);
  const dup = duplicateSequence(project, 'sequence-2');
  validateProject(dup.project, source);
  assert.equal(seq(dup.project, 2).id, dup.id);
  assert.notEqual(seq(dup.project, 2).cues[0].id, seq(dup.project, 1).cues[0].id);
  const moved = moveSequence(project, 'sequence-5', 0);
  assert.equal(seq(moved, 0).id, 'sequence-5');
  const single = structuredClone(project); single.scenes[0].sequences.splice(1);
  assert.throws(() => deleteSequence(single, 'sequence-1'), /al menos un momento/);
});

test('scenes: empty or copied with remapped actors, internal paths and automatic acting', () => {
  const { source, project } = withActors();
  const line = seq(project).cues[0]; if (line.kind === 'dialogue') line.speakerId = 'samuel';
  const staged = autoStageDialogue(project, 'sequence-1', line.id).project;
  seq(staged, 0).gate.nextSequenceId = 'sequence-3';
  const empty = addScene(staged, staged.scenes[0].id, 'empty');
  validateProject(empty.project, source);
  assert.equal(empty.project.scenes[1].actors.length, 0);
  assert.equal(empty.project.scenes[1].zoneId, staged.scenes[0].zoneId);
  const copy = addScene(staged, staged.scenes[0].id, 'copy');
  validateProject(copy.project, source);
  const copied = copy.project.scenes[1];
  assert.notEqual(copied.actors[0].id, 'samuel');
  assert.equal(copied.sequences[0].gate.nextSequenceId, copied.sequences[2].id);
  const copiedLine = copied.sequences[0].cues.find(c => c.kind === 'dialogue')!;
  assert(copied.sequences[0].cues.some(c => c.id === `auto:${copiedLine.id}:talk`));
  const removed = deleteScene(copy.project, copied.id);
  validateProject(removed, source);
  assert.throws(() => deleteScene(project, project.scenes[0].id), /al menos una escena/);
});

test('flow analysis finds unreachable moments, dead loops, duplicated options and automatic loops', () => {
  const { project } = buildStudioRehearsal();
  assert.equal(analyzeFlow(project).size, 0);
  seq(project, 0).gate.nextSequenceId = 'sequence-3';
  assert.equal(analyzeFlow(project).get('sequence-2')?.[0].code, 'unreachable');
  const loop = buildStudioRehearsal().project;
  seq(loop, 2).gate.nextSequenceId = 'sequence-2';
  const issues = analyzeFlow(loop);
  assert.equal(issues.get('sequence-2')?.[0].code, 'trapped');
  assert.equal(issues.get('sequence-4')?.[0].code, 'unreachable');
  const auto = buildStudioRehearsal().project;
  seq(auto, 1).gate = { kind: 'auto', nextSequenceId: 'sequence-2' };
  assert(analyzeFlow(auto).get('sequence-2')?.some(i => i.code === 'auto-loop'));
  const choice = buildStudioRehearsal().project;
  seq(choice, 0).gate = { kind: 'choice', prompt: '¿?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  assert(analyzeFlow(choice).get('sequence-1')?.some(i => i.code === 'duplicate-options'));
});

test('script coverage, suggestions, speaker guessing and staging unused lines', () => {
  const { source, project } = withActors();
  const trimmed = structuredClone(project); trimmed.scenes[0].sequences.splice(2);
  const coverage = sentenceCoverage(trimmed, source);
  assert.equal(coverage.used, 2); assert.equal(coverage.unused, 3);
  assert.equal(suggestSentence(trimmed, source), source.sentences[2].id);
  const actors = project.scenes[0].actors;
  assert.equal(guessSpeaker('Ana: Hola.', actors, null), 'ana');
  assert.equal(guessSpeaker('Hola.', actors, 'samuel'), 'samuel');
  assert.equal(guessSpeaker('Hola.', actors, 'gone'), null);
  const staged = stageUnusedSentences(trimmed, source, trimmed.scenes[0].id, 'sequence-2', 'samuel');
  validateProject(staged.project, source);
  assert.equal(staged.created, 3);
  assert.equal(sentenceCoverage(staged.project, source).unused, 0);
  const placed = placeDialogue(trimmed, 'sequence-1', source.sentences[4].id, null, 0, source);
  const cue = seq(placed.project).cues.find(c => c.id === placed.id)!;
  assert.equal(cue.at, 3);
  assert.equal(sentenceCoverage(placed.project, source).repeated, 0);
});

test('automatic acting respects hand-made performances and is replaced, not duplicated', () => {
  const { source, project } = withActors();
  const line = seq(project).cues[0]; if (line.kind === 'dialogue') line.speakerId = 'samuel';
  const first = autoStageDialogue(project, 'sequence-1', line.id);
  validateProject(first.project, source);
  assert.equal(first.created, 2);
  const again = autoStageDialogue(first.project, 'sequence-1', line.id);
  assert.equal(seq(again.project).cues.length, 3);
  const manual = structuredClone(project);
  seq(manual).cues.push({ id: 'wave', kind: 'actor', at: 1, duration: 1, actorId: 'ana', action: 'wave' });
  const respectful = autoStageDialogue(manual, 'sequence-1', line.id);
  assert.deepEqual(respectful.skipped, ['Ana']);
  assert.equal(seq(deleteCue(first.project, 'sequence-1', line.id)).cues.length, 0);
});

test('changing zone or objects keeps object gates valid', () => {
  const { source, project } = buildStudioRehearsal();
  const zone = changeSceneZone(project, project.scenes[0].id, 'madrid-centro');
  validateProject(zone.project, source);
  assert.equal(zone.convertedGates, 1);
  assert.deepEqual(zone.project.scenes[0].entryIds, []);
  const entries = setSceneEntries(project, project.scenes[0].id, ['calle']);
  validateProject(entries, source);
  assert.equal(seq(entries, 3).gate.kind, 'continue');
  const created = createSequence(project, project.scenes[0].id, 'sequence-1');
  assert.equal(seq(created.project, 1).id, created.id);
});
