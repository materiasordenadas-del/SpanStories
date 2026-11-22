import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBarcelonaPilot} from '../fixtures/barcelona-piloto.ts';
import {createNarrativeSession} from '../engine/narrative-session.ts';
const integration=JSON.parse(readFileSync(new URL('../../../SpanStories-Ciudades/Mundo/Historias/integracion.json',import.meta.url),'utf8'));
test('secuencia lineal enlazada al Story Engine, opcional y sin historia curricular inventada',()=>{
  const fixture=buildBarcelonaPilot();assert.equal(fixture.story.storyBlueprintId,null);assert.equal(fixture.version.status,'DRAFT');
  const session=createNarrativeSession({...fixture,binding:integration.bindings[0]});
  assert.equal(session.current().scene.id,'arbol');
  assert.equal(session.next().scene.id,'casa');
  assert.equal(session.current().scene.id,'casa');
  for(let n=0;n<4;n++)session.next();
  assert.equal(session.current().finished,true);assert.equal(session.restart().scene.id,'arbol');
});
test('rechaza cámara inválida e historia/version incompatibles',()=>{
  const fixture=buildBarcelonaPilot(),binding=integration.bindings[0];
  assert.throws(()=>createNarrativeSession({...fixture,binding:{...binding,storyVersionId:'storyver-otra'}}));
  assert.throws(()=>createNarrativeSession({...fixture,binding:{...binding,scenes:[{...binding.scenes[0],camera:{position:[NaN,1,2],target:[0,0,0]}}]}}));
});
