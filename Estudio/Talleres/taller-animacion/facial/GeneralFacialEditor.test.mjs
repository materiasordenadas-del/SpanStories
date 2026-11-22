import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facialPlayerForRig} from './FacialRigAdapter.mjs';
import {validateProject} from './FacialCore.mjs';
function actor(name){const mesh={name,isMesh:true,morphTargetDictionary:{Happy:0},morphTargetInfluences:[.12]};return {mesh,traverse(fn){fn(mesh);}};}
test('a custom facial map works on unrelated character names and restores neutral',()=>{
  const a=actor('Actor A'),b=actor('Actor B');
  const first=facialPlayerForRig(a,{mouthSmileLeft:'Happy'}),second=facialPlayerForRig(b,{mouthSmileLeft:'Happy'});
  first.apply({mouthSmileLeft:.65});assert.equal(a.mesh.morphTargetInfluences[0],.65);assert.equal(b.mesh.morphTargetInfluences[0],.12);
  second.apply({mouthSmileLeft:.3});assert.equal(b.mesh.morphTargetInfluences[0],.3);first.restore();assert.equal(a.mesh.morphTargetInfluences[0],.12);
  assert.ok(first.report.missing.includes('jawOpen'));
});
test('manual retargeting survives project JSON and rejects unknown/overlapping channels',()=>{
  const project={schema:'spanstories.facial-project',version:1,presets:[],instances:[],favorites:[],rigMap:{mouthSmileLeft:'Happy'}};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).rigMap,project.rigMap);
  assert.throws(()=>validateProject({...project,rigMap:{unknown:'Happy'}}));
  assert.throws(()=>validateProject({...project,rigMap:{mouthSmileLeft:'Happy',mouthSmileRight:'happy'}}));
});
