import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStudioRehearsal} from '../demo.ts';
import {sampleSequence} from '../director.ts';
import {validateProject} from '../model.ts';
import {CAMERA_EASINGS,cameraEase} from '../motion-easing.ts';

test('camera easing preserves endpoints and stays monotone without overshoot',()=>{
  for(const kind of CAMERA_EASINGS){
    assert.equal(cameraEase(0,kind),0);assert.equal(cameraEase(1,kind),1);
    let last=0;for(let i=0;i<=100;i++){const value=cameraEase(i/100,kind);assert.ok(value>=last&&value<=1);last=value;}
  }
});
test('an authored eased shot survives serialization, seeking backwards and legacy projects',()=>{
  const {project,source}=buildStudioRehearsal();
  const scene=project.scenes[0],start=scene.shot.position[0];
  scene.sequences[0].cues.push({id:'eased-camera',kind:'camera',at:0,duration:4,label:'Plano suave',shot:{...scene.shot,position:[start+8,14,20],transition:4,easing:'easeIn'}});
  validateProject(project,source);
  assert.equal(sampleSequence(project,0,1).shot.position[0],start+.5);
  sampleSequence(project,0,3);
  const reopened=JSON.parse(JSON.stringify(project));validateProject(reopened,source);
  assert.deepEqual(sampleSequence(reopened,0,1),sampleSequence(project,0,1));
  const camera=scene.sequences[0].cues.at(-1)!;if(camera.kind!=='camera')throw Error('camera');
  delete camera.shot.easing;
  assert.equal(sampleSequence(project,0,1).shot.position[0],start+2);
  (camera.shot as {easing?:string}).easing='invalid';assert.throws(()=>validateProject(project,source));
});
