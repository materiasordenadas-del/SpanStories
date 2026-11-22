import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedPracticeLabel} from '../engine/published-target-label.ts';
import type {PracticeTarget} from '../domain/target.ts';
const senses=[{id:'SENSE-A1-000095',lexemeId:'LEX-A1-000093',item:'calle'}];
test('una palabra guardada en el mundo tiene etiqueta publicada sin crear ocurrencia',()=>{
  const target={type:'SENSE',senseId:'SENSE-A1-000095',lexemeId:'LEX-A1-000093'} as PracticeTarget;
  assert.equal(publishedPracticeLabel(target,senses),'calle');
  assert.equal(publishedPracticeLabel({...target,lexemeId:'LEX-A1-999999'} as PracticeTarget,senses),null);
});
