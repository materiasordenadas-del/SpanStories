import {test} from 'node:test';
import assert from 'node:assert/strict';
import {faceWeights,webcamPreset} from './FaceWebcamCore.mjs';
import {FacialPlayer} from './FacialCore.mjs';

test('MediaPipe keeps anatomical sides, ignores neutral and missing tongue; clamps invalid scores',()=>{
  const w=faceWeights([{categoryName:'eyeBlinkLeft',score:1},{categoryName:'eyeBlinkRight',score:.1},{categoryName:'_neutral',score:1},{categoryName:'jawOpen',score:NaN}]);
  assert.equal(w.eyeBlinkLeft,1);assert.equal(w.eyeBlinkRight,.2);assert.equal(w.tongueOut,0);assert.equal(w.jawOpen,0);assert.equal(w._neutral,undefined);
});
test('neutral calibration and smoothing preserve a full blink and clear lost tracking',()=>{
  assert.equal(faceWeights([{categoryName:'jawOpen',score:.2}],{jawOpen:.2}).jawOpen,0);
  assert.equal(faceWeights([{categoryName:'eyeBlinkLeft',score:1}],{eyeBlinkLeft:.2}).eyeBlinkLeft,1);
  assert.equal(faceWeights([{categoryName:'jawOpen',score:1}],{},{jawOpen:0},1,.5).jawOpen,.5);
  assert.equal(faceWeights([],{}, {jawOpen:1},1,0).jawOpen,0);
});
test('webcam overlay restores existing animation every frame and on stop',()=>{
  const mesh={isMesh:true,name:'face',morphTargetDictionary:{jawOpen:0},morphTargetInfluences:[.3]};
  const p=new FacialPlayer({traverse:fn=>fn(mesh)});p.apply(faceWeights([{categoryName:'jawOpen',score:.9}]));assert.equal(mesh.morphTargetInfluences[0],.9);
  p.restore();assert.equal(mesh.morphTargetInfluences[0],.3);
  mesh.morphTargetInfluences[0]=.6;p.apply({jawOpen:1});p.restore();assert.equal(mesh.morphTargetInfluences[0],.6);
});
test('recording produces a portable validated clip with relative timestamps',()=>{
  const p=webcamPreset([{time:2000,weights:{jawOpen:0}},{time:2040,weights:{jawOpen:.5}},{time:2100,weights:{jawOpen:1}}]);
  assert.equal(p.duration,.1);assert.deepEqual(p.channels.jawOpen,[[0,0],[.04,.5],[.1,1]]);assert.throws(()=>webcamPreset([]));
});
test('a half-scale webcam blink reaches full closure independently on either side',()=>{
  const categories=[{categoryName:'eyeBlinkRight',score:.52},{categoryName:'eyeBlinkLeft',score:0}];
  let w={eyeBlinkLeft:0,eyeBlinkRight:0};
  for(let i=0;i<5;i++)w=faceWeights(categories,{},w,0,.9);
  assert.ok(w.eyeBlinkRight>.999);assert.equal(w.eyeBlinkLeft,0);assert.equal(w.jawOpen,0);
  const calibrated=faceWeights([{categoryName:'eyeBlinkLeft',score:.3}],{},{},1,.4,{left:.27,right:.5});
  assert.equal(calibrated.eyeBlinkLeft,1);assert.equal(calibrated.eyeBlinkRight,0);
});
test('three webcam modes progressively amplify gestures and keep portable weights bounded',()=>{
  const input=[{categoryName:'mouthSmileLeft',score:.2},{categoryName:'browInnerUp',score:.2}];
  const values=['normal','exaggerated','veryExaggerated'].map(mode=>faceWeights(input,{},{},1,0,{},mode));
  assert.deepEqual(values.map(w=>w.mouthSmileLeft),[.2,.35000000000000003,.5]);
  assert.deepEqual(values.map(w=>w.browInnerUp),[.2,.35000000000000003,.5]);
  for(const mode of ['normal','exaggerated','veryExaggerated'])assert.equal(faceWeights([{categoryName:'jawOpen',score:1}],{},{},1.5,0,{},mode).jawOpen,1);
});
test('eye calibration affects only Normal; exaggerated modes ignore eye baselines and thresholds',()=>{
  const input=[{categoryName:'eyeBlinkRight',score:.2},{categoryName:'eyeLookUpLeft',score:.2}];
  const calibrated={eyeBlinkRight:.15,eyeLookUpLeft:.1},blink={left:.15,right:.15};
  assert.notEqual(faceWeights(input,calibrated,{},1,0,blink).eyeBlinkRight,faceWeights(input,{},{},1,0,{}).eyeBlinkRight);
  for(const mode of ['exaggerated','veryExaggerated']){
    assert.deepEqual(faceWeights(input,calibrated,{},1,0,blink,mode),faceWeights(input,{},{},1,0,{},mode));
  }
});
