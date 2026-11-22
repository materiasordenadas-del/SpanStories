import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioRehearsal } from '../demo.ts';
import { createStudioDirector, sampleSequence } from '../director.ts';
import { validateProject } from '../model.ts';
import { createStudioRepository } from '../repository.ts';

test('a learner can look and touch while all travel/branches remain authored', () => {
  const { source, project } = buildStudioRehearsal();
  assert.equal(project.navigation.travel, 'directed'); assert.equal(project.navigation.allowLook, true);
  assert.throws(() => validateProject({ ...project, navigation: { travel: 'free', allowLook: true } }, source));
  project.scenes[0].sequences[0].gate = { kind: 'choice', prompt: 'Elige un camino', options: [{ id: 'a', label: 'A', nextSequenceId: 'sequence-3' }, { id: 'b', label: 'B' }] };
  const director = createStudioDirector(project, source);
  director.play(); director.tick(3);
  assert.equal(director.respond({ kind: 'choice', value: 'invented' }).accepted, false);
  assert.equal(director.respond({ kind: 'choice', value: 'a' }).snapshot.index, 2);
  project.scenes[0].sequences[0].gate.options[0].nextSequenceId = 'not-authored';
  assert.throws(() => validateProject(project, source));
});

test('student questions wait indefinitely; pausing and replay preserve the gate', () => {
  const { source, project } = buildStudioRehearsal();
  const director = createStudioDirector(project, source);
  director.play(); assert.equal(director.tick(3).state, 'waiting');
  assert.equal(director.tick(86400).index, 0);
  assert.equal(director.respond({ kind: 'object', value: 'arbol' }).accepted, false);
  director.pause(); assert.equal(director.play().state, 'waiting');
  assert.equal(director.respond({ kind: 'continue' }).snapshot.index, 1);
  director.seek(3); director.play(); director.tick(3);
  assert.equal(director.respond({ kind: 'object', value: 'calle' }).accepted, false);
  assert.equal(director.respond({ kind: 'object', value: 'arbol' }).snapshot.index, 4);
  director.tick(3); assert.equal(director.respond({ kind: 'continue' }).snapshot.state, 'finished');
  const restarted=director.play();assert.equal(restarted.index, 0);assert.equal(restarted.state,'playing');
});

test('the caption remains readable after a short voice while longer scene actions finish',()=>{
  const {source,project}=buildStudioRehearsal();
  project.scenes[0].sequences[1].cues[0].duration=1;
  project.scenes[0].sequences[1].cues.push({id:'long-shot',kind:'camera',at:0,duration:5,shot:project.scenes[0].shot,label:'Plano largo'});
  const director=createStudioDirector(project,source);director.seek(1);director.play();const current=director.tick(3);
  assert.equal(current.state,'playing');assert.equal(current.stage.dialogue,null);
  assert.equal(current.stage.caption?.sentenceId,source.sentences[1].id);
  assert.equal(director.tick(2).stage.caption?.sentenceId,source.sentences[1].id);
});

test('seek/back reconstruct actor positions rather than accumulating movement', () => {
  const { source, project } = buildStudioRehearsal();
  project.scenes[0].actors.push({ id: 'samuel', characterId: 'samuel', name: 'Samuel', position: [0, 0, 0], rotation: 0, height: 1.72 });
  project.scenes[0].sequences[0].cues.push({ id: 'walk', kind: 'actor', actorId: 'samuel', action: 'walk', destination: [10, 0, 0], at: 0, duration: 2, expression: 'happy' });
  validateProject(project, source);
  assert.deepEqual(sampleSequence(project, 0, 1).actors[0].position, [5, 0, 0]);
  assert.deepEqual(sampleSequence(project, 1, 0).actors[0].position, [10, 0, 0]);
  assert.deepEqual(sampleSequence(project, 0, 1).actors[0].position, [5, 0, 0]);
  assert.equal(sampleSequence(project, 1, 0).performances[0].expression, 'happy');
});

test('a directed turn interpolates the shortest rotation and persists in the following moment',()=>{
  const {source,project}=buildStudioRehearsal();
  project.scenes[0].actors.push({id:'samuel',characterId:'samuel',name:'Samuel',position:[0,0,0],rotation:170*Math.PI/180,height:1.72});
  project.scenes[0].sequences[0].cues.push({id:'turn',kind:'actor',actorId:'samuel',action:'turn',rotation:-170*Math.PI/180,at:0,duration:2});
  validateProject(project,source);
  assert(Math.abs(sampleSequence(project,0,1).actors[0].rotation-Math.PI)<1e-10);
  assert(Math.abs(Math.sin(sampleSequence(project,1,0).actors[0].rotation)-Math.sin(-170*Math.PI/180))<1e-10);
});

test('canonical content and action references reject malformed imports', () => {
  const { source, project } = buildStudioRehearsal();
  assert.throws(() => validateProject({ ...project, storyVersionId: 'other' }, source));
  project.scenes[0].sequences[0].cues[0] = { id: 'dialogue', kind: 'dialogue', at: 0, duration: 2, sentenceId: 'not-in-story', speakerId: null };
  assert.throws(() => validateProject(project, source));
  project.scenes[0].sequences[0].cues[0] = { id: 'sound', kind: 'sound', at: 0, duration: 2, audioUrl: 'javascript:alert(1)', volume: 1, label: 'Unsafe' };
  assert.throws(() => validateProject(project, source));
});

test('atomic versioned drafts isolate owners, detect conflicts, and cannot publish a rehearsal', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const { source, project } = buildStudioRehearsal();
  const repo = createStudioRepository(storage, 'a', project.id), other = createStudioRepository(storage, 'b', project.id);
  const saved = repo.save(project, source); assert.equal(saved.revision, 1); assert.equal(other.load(source), null);
  assert.throws(() => repo.save(project, source), /otra pestaña/);
  assert.throws(() => repo.publish(saved, source, 'r1', new Date().toISOString()), /curricular/);
  const publishedSource = { ...source, status: 'PUBLISHED' as const, blueprintId: 'existing-blueprint' };
  const release = repo.publish(saved, publishedSource, 'r1', new Date().toISOString());
  saved.scenes[0].name = 'Edited'; repo.save(saved, source);
  assert.equal(repo.load(source)!.releases[0].project.scenes[0].name, release.project.scenes[0].name);
  assert.notEqual(repo.load(source)!.draft.scenes[0].name, release.project.scenes[0].name);
});

test('corrupt records and storage failures never silently overwrite existing content', () => {
  const { source, project } = buildStudioRehearsal(); let writes = 0;
  const repo = createStudioRepository({ getItem: () => '{broken', setItem: () => { writes++; } }, 'a', project.id);
  assert.throws(() => repo.save(project, source)); assert.equal(writes, 0);
  const full = createStudioRepository({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'a', project.id);
  assert.throws(() => full.save(project, source), /quota/); assert.equal(project.revision, 0);
});
