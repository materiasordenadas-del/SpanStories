import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Pipeline,MODES} from '../src/estudio/render/pipeline.js';
import {dispatchUniforms,updateDispatchAmbient,DISPATCH_PALETTES} from '../src/estudio/render/dispatch.js';

test('Dispatch is mode 8 and has a palette for every ambient',()=>{
  assert.equal(MODES.dispatch,8);
  for(const id of ['manana','mediodia','tarde','nublado','noche'])assert.equal(DISPATCH_PALETTES[id].length,8,id);
  const u=dispatchUniforms();updateDispatchAmbient(u,'tarde');
  assert.equal(u.uDHorizonte.value.getHexString(),'ff9a5c');
});

test('Dispatch ambient updates never mutate the other styles colours or settings',()=>{
  const p=new Pipeline(null),camera=new THREE.PerspectiveCamera(),sun=new THREE.Vector3(0,1,0);
  p.disposeGhibliClouds=()=>{};
  p.setAmbient('tarde');p.updateUniforms(camera,sun);
  const before=Object.fromEntries(Object.entries(p.composite.uniforms).filter(([k,v])=>v.value?.isColor).map(([k,v])=>[k,v.value.getHex()]));
  const params={...p.params};
  p.params.mode=MODES.dispatch;p.updateUniforms(camera,sun);
  p.params.mode=MODES.spanstories;p.updateUniforms(camera,sun);
  for(const [k,hex]of Object.entries(before))assert.equal(p.composite.uniforms[k].value.getHex(),hex,k);
  assert.deepEqual(p.params,params);p.dispose();
});
