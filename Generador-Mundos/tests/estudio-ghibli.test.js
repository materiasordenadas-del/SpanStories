import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Pipeline,MODES} from '../src/estudio/render/pipeline.js';
import {ghibliUniforms,updateGhibliAmbient} from '../src/estudio/render/ghibli.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';
import {generateSchool,SCHOOL_DEFAULTS} from '../src/estudio/school/school.js';

test('Ghibli ambient updates never mutate the stored Trigun/Zelda colours or settings',()=>{
  const p=new Pipeline(null),camera=new THREE.PerspectiveCamera(),sun=new THREE.Vector3(0,1,0);
  // No texture loader/DOM needed to exercise the real uniform switching path.
  p.disposeGhibliClouds=()=>{};
  p.setAmbient('noche');p.updateUniforms(camera,sun);
  const before=Object.fromEntries(Object.entries(p.composite.uniforms).filter(([k,v])=>v.value?.isColor).map(([k,v])=>[k,v.value.getHex()]));
  const params={...p.params};
  p.params.mode=MODES.ghibli;p.updateUniforms(camera,sun);
  assert.equal(p.composite.uniforms.uGCenit.value.getHexString(),'1b304d');
  assert.equal(p.composite.uniforms.uGCieloLuz.value,.32);
  p.params.mode=MODES.zelda;p.updateUniforms(camera,sun);
  p.params.mode=MODES.spanstories;p.updateUniforms(camera,sun);
  for(const [k,hex]of Object.entries(before))if(!k.startsWith('uG'))assert.equal(p.composite.uniforms[k].value.getHex(),hex,k);
  assert.deepEqual(p.params,params);p.dispose();
});

test('Ghibli uses the source noon palette and survives the existing project round trip',()=>{
  const u=ghibliUniforms();updateGhibliAmbient(u,'mediodia');
  assert.equal(u.uGCenit.value.getHexString(),'83b9d5');
  assert.equal(u.uGSombra.value.getHexString(),'7c969b');
  const model=generateSchool('ghibli',{barrio:false});
  const state={model,mode:'school',place:{lat:40,lon:-4,size:200},seed:'ghibli',seeds:{alturas:'a',fachadas:'f',calle:'c',suelo:'s'},school:SCHOOL_DEFAULTS};
  const view={mode:'ghibli',ambient:'mediodia',position:[20,30,40],target:[0,0,0]};
  const reopened=decodeProject(encodeProject(state,{view}));
  assert.deepEqual(reopened.view,view);
  assert.deepEqual(reopened.model.buildings,JSON.parse(JSON.stringify(model.buildings)));
});
