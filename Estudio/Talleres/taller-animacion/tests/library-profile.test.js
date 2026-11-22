import test from 'node:test';
import assert from 'node:assert/strict';
import { animationProfiles, matchesAnimationProfile, animationProfileLabel } from '../src/core/library-profile.js';

test('UAL usa el mismo clip en los filtros masculino y femenino', () => {
  for (const pack of ['UAL 1', 'UAL 2']) {
    const clip = { id: `${pack}:walk`, pack, gender: 'male', name: 'Walk' };
    const clips = [clip];
    assert.deepEqual(animationProfiles(clip), ['male', 'female']);
    assert.equal(clips.filter(c => matchesAnimationProfile(c, 'male'))[0], clip);
    assert.equal(clips.filter(c => matchesAnimationProfile(c, 'female'))[0], clip);
    assert.equal(matchesAnimationProfile(clip, 'unspecified'), false);
    assert.equal(animationProfileLabel(clip), 'Masculinas y femeninas');
    assert.equal(clips.length, 1);
  }
});

test('compartir UAL no reclasifica clips de otras bibliotecas', () => {
  assert.deepEqual(animationProfiles({ pack: 'Mixamo', name: 'Female Start Walking' }), ['female']);
  assert.deepEqual(animationProfiles({ pack: 'Humane', gender: 'male', name: 'Walk' }), ['male']);
  assert.deepEqual(animationProfiles({ pack: 'Free 100 Animations', name: 'Walk' }), ['unspecified']);
});
