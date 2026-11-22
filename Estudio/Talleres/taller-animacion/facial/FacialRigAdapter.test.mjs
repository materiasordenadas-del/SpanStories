import test from 'node:test';
import assert from 'node:assert/strict';
import {facialPlayerForRig} from './FacialRigAdapter.mjs';

test('los dos lados de una boca compartida se combinan por máximo y no se anulan',()=>{
  const mesh={isMesh:true,name:'Mouth',morphTargetDictionary:{'Parpadeo.L':0,BocaSonrisa:1},morphTargetInfluences:[.2,.3]};
  const p=facialPlayerForRig({traverse:fn=>fn(mesh)});p.apply({mouthSmileLeft:.8,mouthSmileRight:0});assert.equal(mesh.morphTargetInfluences[1],.8);p.restore();assert.deepEqual(mesh.morphTargetInfluences,[.2,.3]);
});
test('el adaptador conserva comisuras independientes y declara los canales ausentes',()=>{
  const mesh={isMesh:true,name:'Mouth',morphTargetDictionary:{'Parpadeo.L':0,BocaSonrisa:1,'ComisuraArriba.L':2,'ComisuraArriba.R':3},morphTargetInfluences:[0,0,0,0]};
  const p=facialPlayerForRig({traverse:fn=>fn(mesh)});p.apply({mouthSmileLeft:.8,mouthSmileRight:.2});assert.deepEqual(mesh.morphTargetInfluences,[0,0,.8,.2]);assert(p.report.missing.includes('tongueOut'));assert(p.report.rig.includes('aproximada'));
});
