import {test} from 'node:test';
import assert from 'node:assert/strict';
import {curveBounds,curveY} from './FacialCurveView.mjs';
test('subtle and constant facial curves remain visible with padding',()=>{
  for(const keys of [[[0,.1],[2,.15]],[[0,0],[2,0]],[[0,1],[2,1]]]){
    const bounds=curveBounds(keys);assert.ok(bounds.min<bounds.max);
    for(const [,value] of keys)assert.ok(curveY(value,bounds)>=8&&curveY(value,bounds)<=72);
  }
  assert.deepEqual(curveBounds([]),{min:0,max:1});
});
